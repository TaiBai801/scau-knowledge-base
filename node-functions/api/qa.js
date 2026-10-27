// EdgeOne Pages 云函数 — 答疑坊（提问 → 审核公布 → 志愿者接单 → 答疑 → 采纳 → 双方积分）
// 路由: /api/qa
// 数据: COS data/qa.json { questions: [...], meta }
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { verifyUserToken } from './_userauth.js';
import { awardPoints } from './points.js';

const DATA_KEY = 'data/qa.json';

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

function seed() { return { questions: [], meta: { version: 1, updatedAt: Date.now() } }; }

async function loadState() {
  const d = await readJson(DATA_KEY);
  if (d && Array.isArray(d.questions)) return d;
  return seed();
}

async function mutate(fn) {
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readJsonWithEtag(DATA_KEY);
    const state = data && Array.isArray(data.questions) ? data : seed();
    const out = await fn(state);
    if (out && out.stop) return out.value;
    state.meta = { version: ((state.meta && state.meta.version) || 0) + 1, updatedAt: Date.now() };
    const r = await writeJsonIfMatch(DATA_KEY, state, etag);
    if (r.ok) return { ok: true };
    if (r.status !== 412) return { error: '写入失败 ' + r.status };
  }
  return { error: '写入冲突，请重试', conflict: true };
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
    await auditLog(who, staff ? staff.role : 0, 'qa:' + action, '');

    // 学生：公开列表 + 我的提问 + 我的接单
    if (action === 'list') {
      const state = await loadState();
      const pub = state.questions.filter((q) => ['open', 'claimed', 'answered'].includes(q.status));
      const mine = state.questions.filter((q) => q.user === who);
      const claims = state.questions.filter((q) => q.claimBy === who);
      const brief = (q) => ({
        id: q.id, title: q.title, course: q.course, status: q.status,
        claimBy: q.claimBy || '', answer: q.answer || '', userName: q.user,
        createdAt: q.createdAt, acceptedAt: q.acceptedAt || 0,
      });
      return json({
        open: pub.filter((q) => q.status === 'open').map(brief),
        inbox: pub.filter((q) => q.status !== 'open').slice(0, 30).map(brief),
        mine: mine.slice(0, 30).map(brief),
        claims: claims.slice(0, 30).map(brief),
      });
    }

    // 学生：提问
    if (action === 'submit') {
      if (!student) return json({ error: '请用学生账号提问' }, 403);
      const title = String(body.title || '').trim().slice(0, 60);
      const detail = String(body.detail || '').trim().slice(0, 1500);
      const course = String(body.course || '').trim().slice(0, 40);
      if (title.length < 4) return json({ error: '标题至少 4 个字' }, 400);
      if (detail.length < 10) return json({ error: '请把问题描述清楚（至少 10 字）' }, 400);
      const res = await mutate((state) => {
        const dup = state.questions.find((q) => q.user === who && q.title === title && Date.now() - q.createdAt < 86400000);
        if (dup) return { stop: true, value: { error: '一天内不要重复提交同一个问题' } };
        const pending = state.questions.filter((q) => q.user === who && q.status === 'pending').length;
        if (pending >= 3) return { stop: true, value: { error: '你有 3 个问题待审核，先等审核结果' } };
        state.questions.unshift({
          id: 'Q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          user: who, title, detail, course,
          status: 'pending', reason: '',
          claimBy: '', claimAt: 0, answer: '', answeredAt: 0, acceptedAt: 0,
          createdAt: Date.now(),
        });
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '提交失败' }, 400);
      return json({ ok: true });
    }

    // 学生：接单
    if (action === 'claim') {
      if (!student) return json({ error: '请用学生账号接单' }, 403);
      const id = String(body.id || '').trim();
      const res = await mutate((state) => {
        const q = state.questions.find((x) => x.id === id);
        if (!q) return { stop: true, value: { error: '问题不存在' } };
        if (q.status !== 'open') return { stop: true, value: { error: '该问题已被接单或已结束' } };
        if (q.user === who) return { stop: true, value: { error: '不能接自己的问题' } };
        q.status = 'claimed';
        q.claimBy = who;
        q.claimAt = Date.now();
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '接单失败' }, 400);
      return json({ ok: true });
    }

    // 学生：提交答疑
    if (action === 'answer') {
      if (!student) return json({ error: '请用学生账号答疑' }, 403);
      const id = String(body.id || '').trim();
      const answer = String(body.answer || '').trim().slice(0, 3000);
      if (answer.length < 10) return json({ error: '答疑内容至少 10 字' }, 400);
      const res = await mutate((state) => {
        const q = state.questions.find((x) => x.id === id);
        if (!q) return { stop: true, value: { error: '问题不存在' } };
        if (q.claimBy !== who) return { stop: true, value: { error: '只有接单人可以作答' } };
        if (q.status !== 'claimed') return { stop: true, value: { error: '当前状态不能作答' } };
        q.answer = answer;
        q.status = 'answered';
        q.answeredAt = Date.now();
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '提交失败' }, 400);
      return json({ ok: true });
    }

    // 学生：采纳（提问者）
    if (action === 'accept') {
      if (!student) return json({ error: '请用学生账号操作' }, 403);
      const id = String(body.id || '').trim();
      let q = null;
      const res = await mutate((state) => {
        const item = state.questions.find((x) => x.id === id);
        if (!item) return { stop: true, value: { error: '问题不存在' } };
        if (item.user !== who) return { stop: true, value: { error: '只有提问者可以采纳' } };
        if (item.status !== 'answered') return { stop: true, value: { error: '还没有待采纳的答疑' } };
        item.status = 'closed';
        item.acceptedAt = Date.now();
        q = item;
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '操作失败' }, 400);
      let a1 = null, a2 = null;
      try {
        a2 = await awardPoints(q.claimBy, 'qa_answer', q.id);
        a1 = await awardPoints(q.user, 'qa_accept', q.id);
      } catch (e) { /* 积分失败不阻断 */ }
      return json({ ok: true, volunteerAward: a2, askerAward: a1 });
    }

    // 工作人员
    if (!isStaff) return json({ error: '需要工作人员权限' }, 403);

    if (action === 'adminList') {
      const state = await loadState();
      const pending = state.questions.filter((q) => q.status === 'pending');
      const active = state.questions.filter((q) => ['open', 'claimed', 'answered'].includes(q.status));
      const closed = state.questions.filter((q) => ['closed', 'rejected'].includes(q.status)).slice(0, 40);
      return json({ pending, active, closed, counts: { pending: pending.length, active: active.length } });
    }

    if (action === 'detail') {
      const state = await loadState();
      const q = state.questions.find((x) => x.id === String(body.id || '').trim());
      return q ? json({ question: q }) : json({ error: '问题不存在' }, 404);
    }

    if (action === 'review') {
      const id = String(body.id || '').trim();
      const op = String(body.op || '').trim();
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!id || !['approve', 'reject'].includes(op)) return json({ error: '参数非法' }, 400);
      if (op === 'reject' && !reason) return json({ error: '驳回需填写原因' }, 400);
      const res = await mutate((state) => {
        const q = state.questions.find((x) => x.id === id);
        if (!q) return { stop: true, value: { error: '问题不存在' } };
        if (q.status !== 'pending') return { stop: true, value: { error: '该问题已处理' } };
        q.status = op === 'approve' ? 'open' : 'rejected';
        q.reason = reason;
        q.reviewedAt = Date.now();
        q.reviewedBy = who;
        return { stop: true, value: { ok: true } };
      });
      if (!res.ok) return json({ error: res.error || '处理失败' }, 400);
      await auditLog(who, staff.role, 'qa:review', id + ' ' + op);
      return json({ ok: true });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
