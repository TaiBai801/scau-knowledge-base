// EdgeOne Pages 云函数 — 贡献者墙（列表公开 / 增删改排序隐藏需管理员）
// 路由: /api/contributors
// 数据存 COS data/contributors.json（私有读：本文件走签名通道读写）
// 自举：COS 上对象不存在时，首次访问自动用内置 SEED 创建，无需手工入库
//
// 接口契约：
//   POST { action: 'list' }
//        → 200 { contributors: [...] }   公开，按 weight 降序，过滤 hidden
//   以下 action 均需管理员 token（body.token，复用 _auth.js 校验，一/二级皆可）：
//   POST { action: 'listAll', token }        → 200 { contributors: [...] } 含 hidden
//   POST { action: 'add', token, item: { name, avatar?, role?, type, desc?, count?, weight?, joinedAt? } }
//        → 200 { ok, id }
//   POST { action: 'update', token, id, patch: { name?/avatar?/role?/type?/desc?/count?/weight?/joinedAt? } }
//        → 200 { ok }
//   POST { action: 'remove', token, id }     → 200 { ok }
//   POST { action: 'toggle', token, id }     → 200 { ok, hidden }   隐藏/上线切换
//   POST { action: 'sort', token, order: [id, ...] } → 200 { ok }  按顺序重排 weight
import { readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';

const DATA_KEY = 'data/contributors.json';
const TYPES = ['core', 'content', 'review', 'design', 'other'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 首次上线时的种子数据：COS 上还没有 data/contributors.json 时自动创建（与 data/contributors.json 同源）
const SEED = [
  { id: 'c1', name: '杨彬', avatar: '', role: '创始人 / 全栈开发', type: 'core', desc: '搭建全站架构与云函数体系，整理五专业培养方案与课程资料', count: 346, weight: 100, joinedAt: '2026-07-01', hidden: false },
  { id: 'c2', name: '17级张学长', avatar: '', role: '内容贡献', type: 'content', desc: '', count: 8, weight: 90, joinedAt: '', hidden: false },
  { id: 'c3', name: '18级李学姐', avatar: '', role: '内容贡献', type: 'content', desc: '', count: 5, weight: 80, joinedAt: '', hidden: false },
  { id: 'c4', name: '19级王学长', avatar: '', role: '内容贡献', type: 'content', desc: '', count: 4, weight: 70, joinedAt: '', hidden: false },
  { id: 'c5', name: '20级陈学姐', avatar: '', role: '内容贡献', type: 'content', desc: '', count: 3, weight: 60, joinedAt: '', hidden: false },
  { id: 'c6', name: '20级刘学长', avatar: '', role: '内容贡献', type: 'content', desc: '', count: 2, weight: 50, joinedAt: '', hidden: false },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

function sortByWeight(list) {
  return [...list].sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
}

// 读取状态；对象不存在时用内置种子首次创建（只发生一次，之后读取命中即不再写入）
async function ensureState() {
  let got = await readJsonWithEtagSigned(DATA_KEY);
  if (got.data && Array.isArray(got.data.contributors)) return got;
  const fresh = { version: 1, updatedAt: Date.now(), contributors: SEED.map((c) => ({ ...c })) };
  // If-None-Match:* —— 并发请求同时自举时只有一次能创建成功，其余自然失败后走重读
  await writeJsonIfMatch(DATA_KEY, fresh, null, 'private');
  got = await readJsonWithEtagSigned(DATA_KEY);
  if (got.data && Array.isArray(got.data.contributors)) return got;
  return { data: fresh, etag: null };
}

// 统一落盘：刷新更新时间 + 私有读 ACL + ETag 乐观锁
async function save(state, etag) {
  state.updatedAt = Date.now();
  return await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
}

// 校验/规整单条贡献者字段（partial 模式只校验出现的键）
function normalizeFields(src, partial) {
  const out = {};
  if (!partial || 'name' in src) {
    const name = String(src.name || '').trim();
    if (name.length < 1 || name.length > 20) return { error: '姓名需 1-20 字' };
    out.name = name;
  }
  if (!partial || 'avatar' in src) {
    const avatar = String(src.avatar || '').trim();
    if (avatar && !/^(https?:\/\/|\/)/.test(avatar)) return { error: '头像需为 http(s):// 或 / 开头的地址' };
    out.avatar = avatar.slice(0, 300);
  }
  if (!partial || 'role' in src) out.role = String(src.role || '').trim().slice(0, 30);
  if (!partial || 'type' in src) {
    const type = String(src.type || 'content');
    if (!TYPES.includes(type)) return { error: '贡献类型不合法' };
    out.type = type;
  }
  if (!partial || 'desc' in src) out.desc = String(src.desc || '').trim().slice(0, 120);
  if (!partial || 'count' in src) {
    const count = Math.round(Number(src.count) || 0);
    if (count < 0 || count > 100000) return { error: '贡献数需为 0-100000 的整数' };
    out.count = count;
  }
  if (!partial || 'weight' in src) {
    const weight = Math.round(Number(src.weight) || 0);
    if (weight < 0 || weight > 10000) return { error: '排序权重需为 0-10000 的整数' };
    out.weight = weight;
  }
  if (!partial || 'joinedAt' in src) {
    const joinedAt = String(src.joinedAt || '').trim();
    if (joinedAt && !DATE_RE.test(joinedAt)) return { error: '加入时间格式应为 YYYY-MM-DD' };
    out.joinedAt = joinedAt;
  }
  return { fields: out };
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  const action = body.action;

  // ── 公开列表 ──
  if (action === 'list') {
    try {
      const { data } = await ensureState();
      const all = (data && data.contributors) || [];
      return json({ contributors: sortByWeight(all.filter((c) => c && !c.hidden)) });
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  }

  // ── 管理动作：统一鉴权 ──
  try {
    const who = verifyToken(String(body.token || ''));
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    const admin = who.username;

    const { data, etag } = await ensureState();
    const state = data || { version: 1, updatedAt: 0, contributors: [] };
    if (!Array.isArray(state.contributors)) state.contributors = [];
    const list = state.contributors;
    const findIdx = (id) => list.findIndex((c) => c && c.id === id);

    if (action === 'listAll') {
      return json({ contributors: sortByWeight(list) });
    }

    if (action === 'add') {
      const chk = normalizeFields(body.item || {}, false);
      if (chk.error) return json({ error: chk.error }, 400);
      const item = {
        id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        hidden: false,
        ...chk.fields,
      };
      list.push(item);
      const r = await save(state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(admin, who.role, 'contribAdd', '新增贡献者 ' + item.name);
      return json({ ok: true, id: item.id });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      const i = findIdx(id);
      if (i < 0) return json({ error: '贡献者不存在' }, 404);
      const chk = normalizeFields(body.patch || {}, true);
      if (chk.error) return json({ error: chk.error }, 400);
      list[i] = { ...list[i], ...chk.fields };
      const r = await save(state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(admin, who.role, 'contribUpdate', '更新贡献者 ' + list[i].name);
      return json({ ok: true });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      const i = findIdx(id);
      if (i < 0) return json({ error: '贡献者不存在' }, 404);
      const name = list[i].name;
      list.splice(i, 1);
      const r = await save(state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(admin, who.role, 'contribRemove', '删除贡献者 ' + name);
      return json({ ok: true });
    }

    if (action === 'toggle') {
      const id = String(body.id || '');
      const i = findIdx(id);
      if (i < 0) return json({ error: '贡献者不存在' }, 404);
      list[i].hidden = !list[i].hidden;
      const r = await save(state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(admin, who.role, 'contribToggle', (list[i].hidden ? '下线 ' : '恢复 ') + list[i].name);
      return json({ ok: true, hidden: list[i].hidden });
    }

    if (action === 'sort') {
      const order = Array.isArray(body.order) ? body.order.map(String) : [];
      if (!order.length) return json({ error: '缺少顺序列表' }, 400);
      const byId = new Map(list.map((c) => [c.id, c]));
      const missing = order.filter((id) => !byId.has(id));
      if (missing.length) return json({ error: '包含未知 id' }, 400);
      const n = order.length;
      order.forEach((id, idx) => { byId.get(id).weight = (n - idx) * 10; });
      const r = await save(state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(admin, who.role, 'contribSort', '调整贡献者排序');
      return json({ ok: true });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
