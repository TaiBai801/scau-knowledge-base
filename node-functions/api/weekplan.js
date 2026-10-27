// EdgeOne Pages 云函数 — 学习周计划（录入 → 审核 → 每日打卡 → 四周统计）
// 路由: /api/weekplan
// 数据: COS data/weekplan.json { plans: [...], meta }
// 读：学生 token 或工作人员 token；写：学生提交/打卡；工作人员审核
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { verifyUserToken } from './_userauth.js';
import { gmt8Date } from './_date.js';
import { awardPoints } from './points.js';

const DATA_KEY = 'data/weekplan.json';
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
export function onRequestOptions() { return json({ ok: true }); }

function seed() { return { plans: [], meta: { version: 1, updatedAt: Date.now() } }; }

async function loadState() {
  const d = await readJson(DATA_KEY);
  if (d && Array.isArray(d.plans)) return d;
  return seed();
}

async function mutate(fn) {
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readJsonWithEtag(DATA_KEY);
    const state = data && Array.isArray(data.plans) ? data : seed();
    const out = await fn(state);
    if (out && out.stop) {
      state.meta = { version: ((state.meta && state.meta.version) || 0) + 1, updatedAt: Date.now() };
      const r = await writeJsonIfMatch(DATA_KEY, state, etag);
      if (r.ok) return out.value;
      if (r.status !== 412) return { error: '写入失败 ' + r.status };
      continue;
    }
    state.meta = { version: ((state.meta && state.meta.version) || 0) + 1, updatedAt: Date.now() };
    const r = await writeJsonIfMatch(DATA_KEY, state, etag);
    if (r.ok) return { ok: true };
    if (r.status !== 412) return { error: '写入失败 ' + r.status };
  }
  return { error: '写入冲突，请重试', conflict: true };
}

// 判断日期是否落在计划周期内（周一为 weekStart，共 28 天）
function inWindow(weekStart, date) {
  const s = Date.parse(weekStart + 'T00:00:00+08:00');
  const d = Date.parse(date + 'T00:00:00+08:00');
  if (!s || !d) return false;
  return d >= s && d < s + 28 * 86400000;
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  try {
    const body = await request.json();
    const action = body.action;
    const staff = verifyToken(body.token);
    const student = staff ? null : verifyUserToken(String(body.token || ''));
    if (!staff && !student) return json({ error: '未登录或登录已过期' }, 401);
    const isStaff = staff && Number(staff.role) >= 1;
    const who = staff ? staff.username : student.username;
    await auditLog(who, staff ? staff.role : 0, 'weekplan:' + action, '');

    // 学生：我的计划
    if (action === 'get') {
      const state = await loadState();
      const mine = state.plans.filter((p) => p.user === who).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      const today = gmt8Date(0);
      const cur = mine.find((p) => p.status === 'approved' && inWindow(p.weekStart, today));
      return json({ plans: mine.slice(0, 12), today, current: cur || null, days: DAYS });
    }

    // 学生：提交周计划
    if (action === 'submit') {
      if (!student) return json({ error: '请用学生账号提交计划' }, 403);
      const weekStart = String(body.weekStart || '').trim();
      const goals = Array.isArray(body.goals) ? body.goals : [];
      const note = String(body.note || '').slice(0, 300);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: '周起始日期格式应为 YYYY-MM-DD（周一）' }, 400);
      const clean = goals.map((g) => ({
        day: Number(g && g.day) || 0,
        task: String((g && g.task) || '').trim().slice(0, 120),
        hours: Math.max(0, Math.min(16, Number((g && g.hours) || 0))),
      })).filter((g) => g.task);
      if (clean.length < 3) return json({ error: '至少填写 3 天的计划内容' }, 400);
      const res = await mutate((state) => {
        const dup = state.plans.find((p) => p.user === who && p.weekStart === weekStart);
        if (dup) return { stop: true, value: { error: '这一周已提交过计划，请等待审核或修改下一周' } };
        state.plans.unshift({
          id: 'WP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          user: who, weekStart, goals: clean, note,
          status: 'pending', reason: '',
          checkins: {},
          createdAt: Date.now(), reviewedAt: 0, reviewedBy: '',
        });
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '提交失败' }, res.conflict ? 409 : 400);
      return json({ ok: true });
    }

    // 学生：每日打卡
    if (action === 'checkin') {
      if (!student) return json({ error: '请用学生账号打卡' }, 403);
      const planId = String(body.planId || '').trim();
      const date = String(body.date || gmt8Date(0));
      const minutes = Math.max(0, Math.min(720, Math.round(Number(body.minutes) || 0)));
      const note = String(body.note || '').slice(0, 120);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: '日期格式不正确' }, 400);
      if (date > gmt8Date(0)) return json({ error: '不能打未来的卡' }, 400);
      let plan = null;
      const res = await mutate((state) => {
        const p = state.plans.find((x) => x.id === planId && x.user === who);
        if (!p) return { stop: true, value: { error: '计划不存在' } };
        if (p.status !== 'approved') return { stop: true, value: { error: '计划尚未通过审核' } };
        if (!inWindow(p.weekStart, date)) return { stop: true, value: { error: '该日期不在计划周期内（四周）' } };
        if (p.checkins[date]) return { stop: true, value: { error: '这一天已打卡' } };
        p.checkins[date] = { minutes, note, at: Date.now() };
        plan = p;
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '打卡失败' }, 400);
      let award = null;
      try { award = await awardPoints(who, 'plan_checkin', date); } catch (e) { /* 积分失败不阻断 */ }
      return json({ ok: true, total: Object.keys(plan.checkins).length, award });
    }

    // 以下为工作人员
    if (!isStaff) return json({ error: '需要工作人员权限' }, 403);

    if (action === 'adminList') {
      const state = await loadState();
      const plans = state.plans
        .slice()
        .sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || b.createdAt - a.createdAt)
        .slice(0, 200)
        .map((p) => Object.assign({}, p, { checkinCount: Object.keys(p.checkins || {}).length }));
      const pendingCount = state.plans.filter((p) => p.status === 'pending').length;
      return json({ plans, pendingCount, days: DAYS });
    }

    if (action === 'review') {
      const planId = String(body.planId || '').trim();
      const op = String(body.op || '').trim();
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!planId || !['approve', 'reject'].includes(op)) return json({ error: '参数非法' }, 400);
      if (op === 'reject' && !reason) return json({ error: '打回需填写原因' }, 400);
      let plan = null;
      const res = await mutate((state) => {
        const p = state.plans.find((x) => x.id === planId);
        if (!p) return { stop: true, value: { error: '计划不存在' } };
        if (p.status !== 'pending') return { stop: true, value: { error: '该计划已处理' } };
        p.status = op === 'approve' ? 'approved' : 'rejected';
        p.reason = reason;
        p.reviewedAt = Date.now();
        p.reviewedBy = who;
        plan = p;
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '处理失败' }, 400);
      if (op === 'approve') { try { await awardPoints(plan.user, 'plan_approved', plan.id); } catch (e) {} }
      await auditLog(who, staff.role, 'weekplan:review', planId + ' ' + op);
      return json({ ok: true });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
