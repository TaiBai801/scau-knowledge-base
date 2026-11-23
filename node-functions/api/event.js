// EdgeOne Pages 云函数 — 四六级活动管理（线上进度 / 报名名单 / 赋分名单）
// 路由: /api/event
// 数据：
//   data/roster.json        报名名单 { importedAt, by, count, items: [{studentId, name}] }
//   data/cet-progress.json  线上完成记账（cet.js submit 写）{ students: { [studentId]: { submitted: { [paperId]: {...} } } } }
//   data/users.json         学生账号（含 studentId 字段 + studentIdIndex）
// 鉴权：管理员 token（_auth），role >= 1
//
// 接口：
//   POST { action: 'adminProgress' }                    → 所有已绑学号学生的线上完成套数
//   POST { action: 'importRoster', roster:[{studentId,name}] } → 导入报名名单（覆盖式）
//   POST { action: 'exportCredit' }                     → 赋分名单 = 名单 ∩ 完成≥2套
import { readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { validateStudentId } from './_userauth.js';

const ROSTER_KEY = 'data/roster.json';
const PROGRESS_KEY = 'data/cet-progress.json';
const USERS_KEY = 'data/users.json';
const MIN_SETS = 2; // 达标套数

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export function onRequestOptions() {
  return json({ ok: true });
}

function doneSetsOf(rec) {
  const sub = (rec && rec.submitted && typeof rec.submitted === 'object') ? rec.submitted : {};
  return Object.keys(sub).length;
}
function lastSubmitAt(rec) {
  const sub = (rec && rec.submitted && typeof rec.submitted === 'object') ? rec.submitted : {};
  const ts = Object.values(sub).map((s) => (s && s.submittedAt) || 0);
  return ts.length ? Math.max(...ts) : 0;
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置' }, 500);
  }
  try {
    const body = await request.json();
    const action = String(body.action || '');

    const who = verifyToken(body.token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    if (Number(who.role) < 1) return json({ error: '需要工作人员权限' }, 403);

    // ── 线上完成进度（所有已绑学号学生）──
    if (action === 'adminProgress') {
      const [uData, pData] = await Promise.all([
        readJsonWithEtagSigned(USERS_KEY),
        readJsonWithEtagSigned(PROGRESS_KEY),
      ]);
      const users = ((uData && uData.data) || {}).users || {};
      const students = ((pData && pData.data) || {}).students || {};

      const rows = [];
      for (const [username, u] of Object.entries(users)) {
        if (!u || !u.studentId) continue;
        const rec = students[u.studentId] || {};
        const done = doneSetsOf(rec);
        rows.push({
          studentId: u.studentId,
          username,
          realName: u.realName || '',
          doneSets: done,
          lastSubmitAt: lastSubmitAt(rec),
        });
      }
      rows.sort((a, b) => (b.doneSets - a.doneSets) || a.studentId.localeCompare(b.studentId));
      return json({
        ok: true,
        total: rows.length,
        done2: rows.filter((r) => r.doneSets >= MIN_SETS).length,
        rows,
      });
    }

    // ── 导入报名名单（覆盖式，含去重与逐条校验）──
    if (action === 'importRoster') {
      const items = Array.isArray(body.roster) ? body.roster : [];
      if (!items.length) return json({ error: '名单为空' }, 400);
      if (items.length > 2000) return json({ error: '单次最多 2000 条' }, 400);

      const seen = new Set();
      const clean = [];
      const errors = [];
      items.forEach((it, i) => {
        const studentId = String((it && it.studentId) || '').trim();
        const name = String((it && it.name) || '').trim().slice(0, 24);
        const err = validateStudentId(studentId);
        if (err) { errors.push('第 ' + (i + 1) + ' 条：' + err); return; }
        if (seen.has(studentId)) return;
        seen.add(studentId);
        clean.push({ studentId, name });
      });
      if (!clean.length) {
        return json({ error: '无有效条目' + (errors.length ? '（' + errors[0] + '）' : '') }, 400);
      }
      const { etag } = await readJsonWithEtagSigned(ROSTER_KEY);
      const state = { importedAt: Date.now(), by: who.username, count: clean.length, items: clean };
      const r = await writeJsonIfMatch(ROSTER_KEY, state, etag, 'private');
      if (!r.ok) return json({ error: '写入失败 ' + r.status }, 502);
      await auditLog(who.username, who.role, 'event:importRoster', clean.length + ' 条（跳过 ' + errors.length + ' 条）');
      return json({ ok: true, count: clean.length, skipped: errors.length, errors: errors.slice(0, 10) });
    }

    // ── 赋分名单 = 名单 ∩ 完成≥2套 ──
    if (action === 'exportCredit') {
      const [rData, pData] = await Promise.all([
        readJsonWithEtagSigned(ROSTER_KEY),
        readJsonWithEtagSigned(PROGRESS_KEY),
      ]);
      const items = ((rData && rData.data) || {}).items || [];
      const students = ((pData && pData.data) || {}).students || {};

      const rows = items.map((it) => {
        const done = doneSetsOf(students[it.studentId]);
        return { studentId: it.studentId, name: it.name || '', doneSets: done, qualified: done >= MIN_SETS };
      }).sort((a, b) => (Number(b.qualified) - Number(a.qualified)) || a.studentId.localeCompare(b.studentId));

      const qualified = rows.filter((r) => r.qualified);
      await auditLog(who.username, who.role, 'event:exportCredit', qualified.length + ' 人达标 / ' + rows.length + ' 人报名');
      return json({
        ok: true,
        total: rows.length,
        qualifiedCount: qualified.length,
        rows,
        qualified,
      });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
