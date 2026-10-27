// EdgeOne Pages 云函数 — 积分奖励系统（积分 / 奖品 / 兑换 / 规则）
// 路由: /api/points
// 数据: COS data/points.json
// 权限：学生 token（_userauth）可查看自己与兑换；工作人员 token（_auth, role>=1）可管理
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret, HOST, presignPutUrl } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { verifyUserToken } from './_userauth.js';
import { gmt8Date } from './_date.js';

const DATA_KEY = 'data/points.json';
const LEDGER_MAX = 3000;
const KEY_MAX = 3000;

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

// 默认积分规则（后台可改）
export const DEFAULT_RULES = {
  checkin_daily: { label: '每日学习打卡', points: 2, dailyCap: 1, enabled: true },
  material_approved: { label: '资料被审核通过', points: 20, dailyCap: 5, enabled: true },
  bounty_fulfilled: { label: '悬赏被采纳', points: 30, dailyCap: 0, enabled: true },
  quiz_session: { label: '完成一组练习', points: 3, dailyCap: 5, enabled: true },
  mock_exam_done: { label: '完成一次模考', points: 10, dailyCap: 1, enabled: true },
  note_created: { label: '新建课程笔记', points: 2, dailyCap: 3, enabled: true },
  first_contribution: { label: '首次贡献（一次性）', points: 50, dailyCap: 1, enabled: true },
  streak_7: { label: '连续打卡 7 天', points: 5, dailyCap: 1, enabled: true },
  streak_30: { label: '连续打卡 30 天', points: 20, dailyCap: 1, enabled: true },
  plan_approved: { label: '周学习计划审核通过', points: 10, dailyCap: 1, enabled: true },
  plan_checkin: { label: '周计划每日打卡', points: 2, dailyCap: 1, enabled: true },
  qa_answer: { label: '答疑坊完成答疑', points: 15, dailyCap: 3, enabled: true },
  qa_accept: { label: '答疑被采纳', points: 3, dailyCap: 2, enabled: true },
};

function seed() {
  return {
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    prizes: [],
    balances: {},
    ledger: [],
    orders: [],
    awardedKeys: [],
    meta: { version: 1, updatedAt: Date.now() },
  };
}

async function loadState() {
  const data = await readJson(DATA_KEY);
  if (data && typeof data === 'object' && data.rules) {
    for (const k of Object.keys(DEFAULT_RULES)) {
      if (!data.rules[k]) data.rules[k] = JSON.parse(JSON.stringify(DEFAULT_RULES[k]));
    }
    if (!Array.isArray(data.prizes)) data.prizes = [];
    if (!data.balances) data.balances = {};
    if (!Array.isArray(data.ledger)) data.ledger = [];
    if (!Array.isArray(data.orders)) data.orders = [];
    if (!Array.isArray(data.awardedKeys)) data.awardedKeys = [];
    return data;
  }
  return seed();
}

// 统一写：读 → 改 → 条件写，412 重试。fn 可返回 { stop: true, value } 提前结束（仍会写库）。
async function mutate(fn) {
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readJsonWithEtag(DATA_KEY);
    const state = data && data.rules ? data : seed();
    for (const k of Object.keys(DEFAULT_RULES)) {
      if (!state.rules[k]) state.rules[k] = JSON.parse(JSON.stringify(DEFAULT_RULES[k]));
    }
    if (!Array.isArray(state.ledger)) state.ledger = [];
    if (!Array.isArray(state.orders)) state.orders = [];
    if (!Array.isArray(state.awardedKeys)) state.awardedKeys = [];
    if (!state.balances) state.balances = {};
    if (!Array.isArray(state.prizes)) state.prizes = [];
    const out = await fn(state);
    state.meta = { version: (state.meta && state.meta.version ? state.meta.version : 0) + 1, updatedAt: Date.now() };
    if (state.ledger.length > LEDGER_MAX) state.ledger.length = LEDGER_MAX;
    if (state.awardedKeys.length > KEY_MAX) state.awardedKeys.length = KEY_MAX;
    const r = await writeJsonIfMatch(DATA_KEY, state, etag);
    if (r.ok) {
      if (out && out.stop) return out.value;
      return { ok: true, state };
    }
    if (r.status !== 412) return { error: '写入失败 ' + r.status };
  }
  return { error: '写入冲突（并发操作），请重试', conflict: true };
}

function balanceOf(state, user) {
  const b = state.balances[user];
  return b && Number(b.points) ? Number(b.points) : 0;
}

function addLedger(state, user, delta, reason, ref, by) {
  const cur = balanceOf(state, user);
  const next = cur + Number(delta);
  state.balances[user] = { points: next, updatedAt: Date.now() };
  state.ledger.unshift({
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    user, delta: Number(delta), reason, ref: ref || '', at: Date.now(), by: by || 'system',
  });
  return next;
}

// 供其他业务函数调用的加分入口（服务端内部调用）
export async function awardPoints(user, ruleKey, ref) {
  if (!user || !ruleKey) return { ok: false, reason: '参数缺失' };
  const today = gmt8Date(0);
  const awardKey = ruleKey + ':' + user + ':' + (ref || today);
  const res = await mutate((state) => {
    const rule = state.rules[ruleKey];
    if (!rule || !rule.enabled) return { stop: true, value: { ok: false, reason: '规则未启用' } };
    if (state.awardedKeys.includes(awardKey)) return { stop: true, value: { ok: false, reason: '已发放过' } };
    const cap = Number(rule.dailyCap) || 0;
    if (cap > 0) {
      const prefix = ruleKey + ':' + user + ':';
      const cnt = state.awardedKeys.filter((k) => k.startsWith(prefix) && k.endsWith(today)).length;
      if (cnt >= cap) return { stop: true, value: { ok: false, reason: '已达每日上限' } };
    }
    const delta = Number(rule.points) || 0;
    if (delta <= 0) return { stop: true, value: { ok: false, reason: '规则分值无效' } };
    state.awardedKeys.unshift(awardKey);
    const next = addLedger(state, user, delta, ruleKey, ref || '', 'system');
    return { stop: true, value: { ok: true, points: delta, balance: next } };
  });
  return res && res.ok ? res : { ok: false, reason: (res && res.error) || '写入失败' };
}

function publicRules(rules) {
  const out = {};
  for (const k of Object.keys(rules || {})) {
    const r = rules[k];
    if (r && r.enabled) out[k] = { label: r.label, points: r.points, dailyCap: r.dailyCap };
  }
  return out;
}

function cleanPrize(p) {
  return {
    id: String(p.id || '').trim(),
    name: String(p.name || '').trim().slice(0, 40),
    desc: String(p.desc || '').slice(0, 300),
    points: Math.max(1, Math.min(1000000, Number(p.points) || 0)),
    stock: Math.max(0, Math.min(100000, Math.floor(Number(p.stock) || 0))),
    image: String(p.image || '').slice(0, 500),
    status: p.status === 'off' ? 'off' : 'on',
    limitPerUser: Math.max(0, Math.min(99, Math.floor(Number(p.limitPerUser) || 0))),
    sort: Number(p.sort) || 0,
    updatedAt: Date.now(),
  };
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
    await auditLog(who, staff ? staff.role : 0, 'points:' + action, '');

    if (action === 'get') {
      const state = await loadState();
      const me = who;
      return json({
        balance: balanceOf(state, me),
        rules: publicRules(state.rules),
        prizes: state.prizes.filter((p) => p.status === 'on').sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.points - b.points),
        ledger: state.ledger.filter((l) => l.user === me).slice(0, 20),
        orders: state.orders.filter((o) => o.user === me).slice(0, 20),
      });
    }

    if (action === 'redeem') {
      if (!student) return json({ error: '请使用学生账号登录后兑换' }, 403);
      const prizeId = String(body.prizeId || '').trim();
      const name = String(body.name || '').trim();
      const studentId = String(body.studentId || '').trim();
      const contact = String(body.contact || '').trim().slice(0, 60);
      const note = String(body.note || '').trim().slice(0, 120);
      const requestId = String(body.requestId || '').trim().slice(0, 64);
      if (!prizeId) return json({ error: '缺 prizeId' }, 400);
      if (name.length < 2 || name.length > 20) return json({ error: '姓名需 2-20 字' }, 400);
      if (!/^\d{8,12}$/.test(studentId)) return json({ error: '学号格式不正确（8-12 位数字）' }, 400);
      if (!requestId) return json({ error: '缺 requestId' }, 400);

      const res = await mutate((state) => {
        const dup = state.orders.find((o) => o.requestId === requestId);
        if (dup) return { stop: true, value: { ok: true, order: dup, balance: balanceOf(state, who), duplicated: true } };
        const prize = state.prizes.find((p) => p.id === prizeId && p.status === 'on');
        if (!prize) return { stop: true, value: { error: '奖品不存在或已下架' } };
        if (Number(prize.stock) <= 0) return { stop: true, value: { error: '这件奖品已兑完' } };
        if (Number(prize.limitPerUser) > 0) {
          const cnt = state.orders.filter((o) => o.user === who && o.prizeId === prizeId && o.status !== 'rejected').length;
          if (cnt >= Number(prize.limitPerUser)) return { stop: true, value: { error: '你已达到该奖品的兑换上限' } };
        }
        const bal = balanceOf(state, who);
        const cost = Number(prize.points) || 0;
        if (bal < cost) return { stop: true, value: { error: '积分不足，还差 ' + (cost - bal) + ' 分' } };

        prize.stock = Number(prize.stock) - 1;
        prize.updatedAt = Date.now();
        const next = addLedger(state, who, -cost, 'redeem:' + prize.name, prizeId, who);
        const order = {
          id: 'O' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          user: who, prizeId: prize.id, prizeName: prize.name, points: cost,
          name, studentId, contact, note,
          status: 'pending', requestId,
          createdAt: Date.now(), handledAt: 0, handledBy: '', rejectReason: '',
        };
        state.orders.unshift(order);
        return { stop: true, value: { ok: true, order, balance: next } };
      });
      if (res && res.error) return json({ error: res.error }, res.conflict ? 409 : 400);
      const out = res || {};
      if (!out.ok) return json({ error: out.error || '兑换失败，请重试' }, 400);
      return json({ ok: true, order: out.order, balance: out.balance, duplicated: !!out.duplicated });
    }

    if (!isStaff) return json({ error: '需要工作人员权限' }, 403);

    if (action === 'adminGet') {
      const state = await loadState();
      return json({
        prizes: state.prizes.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
        orders: state.orders.slice(0, 300),
        rules: state.rules,
        stats: {
          users: Object.keys(state.balances).length,
          ordersPending: state.orders.filter((o) => o.status === 'pending').length,
          ordersDone: state.orders.filter((o) => o.status === 'done').length,
          ledgerTotal: state.ledger.length,
        },
      });
    }

    if (action === 'savePrize') {
      const p = cleanPrize(body.prize || {});
      if (!p.id) return json({ error: '缺奖品 id' }, 400);
      if (!p.name) return json({ error: '缺奖品名称' }, 400);
      if (!(p.points > 0)) return json({ error: '积分价格必须大于 0' }, 400);
      const res = await mutate((state) => {
        const idx = state.prizes.findIndex((x) => x.id === p.id);
        if (idx >= 0) state.prizes[idx] = Object.assign({}, state.prizes[idx], p);
        else state.prizes.push(p);
        return { stop: true, value: { ok: true } };
      });
      if (!res || !res.ok) return json({ error: (res && res.error) || '保存失败' }, 500);
      return json({ ok: true, prize: p });
    }

    if (action === 'deletePrize') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: '缺 id' }, 400);
      const res = await mutate((state) => {
        state.prizes = state.prizes.filter((p) => p.id !== id);
        return { stop: true, value: { ok: true } };
      });
      if (!res || !res.ok) return json({ error: (res && res.error) || '删除失败' }, 500);
      return json({ ok: true });
    }

    if (action === 'handleOrder') {
      const orderId = String(body.orderId || '').trim();
      const op = String(body.op || '').trim();
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!orderId || !['done', 'reject'].includes(op)) return json({ error: '参数非法' }, 400);
      if (op === 'reject' && !reason) return json({ error: '驳回需填写原因' }, 400);
      const res = await mutate((state) => {
        const o = state.orders.find((x) => x.id === orderId);
        if (!o) return { stop: true, value: { error: '订单不存在' } };
        if (o.status !== 'pending') return { stop: true, value: { error: '该订单已处理' } };
        if (op === 'done') {
          o.status = 'done';
        } else {
          o.status = 'rejected';
          o.rejectReason = reason;
          addLedger(state, o.user, Number(o.points) || 0, 'redeem_rejected:' + o.prizeName, o.prizeId, who);
          const p = state.prizes.find((x) => x.id === o.prizeId);
          if (p) {
            p.stock = Number(p.stock) + 1;
            p.updatedAt = Date.now();
          }
        }
        o.handledAt = Date.now();
        o.handledBy = who;
        return { stop: true, value: { ok: true, order: o } };
      });
      if (!res || !res.ok) return json({ error: (res && res.error) || '处理失败' }, 400);
      await auditLog(who, staff.role, 'points:handleOrder', orderId + ' ' + op + (reason ? ' ' + reason : ''));
      return json({ ok: true, order: res.order });
    }

    if (action === 'saveRules') {
      const rules = body.rules;
      if (!rules || typeof rules !== 'object') return json({ error: '规则非法' }, 400);
      const res = await mutate((state) => {
        for (const k of Object.keys(rules)) {
          if (!DEFAULT_RULES[k]) continue;
          const r = rules[k] || {};
          state.rules[k] = {
            label: String(r.label || DEFAULT_RULES[k].label).slice(0, 30),
            points: Math.max(0, Math.min(10000, Number(r.points) || 0)),
            dailyCap: Math.max(0, Math.min(100, Math.floor(Number(r.dailyCap) || 0))),
            enabled: r.enabled !== false,
          };
        }
        return { stop: true, value: { ok: true } };
      });
      if (!res || !res.ok) return json({ error: (res && res.error) || '保存失败' }, 500);
      await auditLog(who, staff.role, 'points:saveRules', JSON.stringify(rules).slice(0, 300));
      return json({ ok: true });
    }

    if (action === 'adjust') {
      const user = String(body.user || '').trim();
      const delta = Math.trunc(Number(body.delta));
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!user) return json({ error: '缺用户名' }, 400);
      if (!delta || Math.abs(delta) > 10000) return json({ error: '分值需为 -10000~10000 的非零整数' }, 400);
      if (!reason) return json({ error: '必须填写调整原因' }, 400);
      const res = await mutate((state) => {
        const next = addLedger(state, user, delta, 'manual:' + reason, '', who);
        if (next < 0) return { stop: true, value: { error: '调整后余额不能为负' } };
        return { stop: true, value: { ok: true, balance: next } };
      });
      if (!res || !res.ok) return json({ error: (res && res.error) || '调整失败' }, 400);
      await auditLog(who, staff.role, 'points:adjust', user + ' ' + delta + ' ' + reason);
      return json({ ok: true, balance: res.balance });
    }

    if (action === 'ledger') {
      const state = await loadState();
      const user = String(body.user || '').trim();
      const list = (user ? state.ledger.filter((l) => l.user === user) : state.ledger).slice(0, 200);
      return json({ ledger: list });
    }

    if (action === 'presignImage') {
      const ext = String(body.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const key = 'files/prizes/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      return json({ uploadUrl: presignPutUrl(key), imageUrl: 'https://' + HOST + '/' + key });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
