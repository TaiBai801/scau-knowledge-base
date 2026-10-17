// EdgeOne Pages 云函数 — 站点数据总览（聚合）
// 路由: POST /api/overview
//
// 接口契约：
//   POST { action: 'get', fresh?: boolean, token?: string }
//        → 200 {
//            ok, serverTime, cachedAt, ttl, partial, warnings,
//            sources: { materials, bank, contributors, users, checkins, traffic },
//            live: { materials, bank, contributors, students, checkins, traffic, topPaths }
//          }
//   说明：live 的结构必须与前端 useSiteMetrics.ts 的 LivePayload 完全一致（前端按段合并）
//
// 原则：
//   · 只输出聚合数字，绝不输出用户名 / 学号 / 昵称 / 文件名 / 题目内容
//   · 任一数据源失败只降级该段为 SEED，不让整体失败
//   · 60 秒模块级缓存（多实例各自持有，属最佳努力）；fresh=true 需管理员 token 才生效
import { readJson, readJsonSigned, hasSecret } from './_cos.js';
import { verifyToken } from './_auth.js';
import { gmt8Date, nowMs } from './_date.js';

const TTL = 60;                 // 秒
const TTL_MS = TTL * 1000;
const RATE_LIMIT = 60;          // 每 IP 每分钟请求数
const TOP_PATHS_MAX = 20;

// 兜底种子（与 public/data/site-metrics.json 的 seed 同源）
const SEED = {
  materials: { courses: 12, items: 59 },
  bank: { courses: 14, questions: 421 },
  contributors: { count: 6, contributions: 368 },
  students: { registered: 0 },
  checkins: { participants: 0, days: 0, minutes: 0, last7: 0, today: 0 },
  traffic: {
    today: { visits: 0, downloads: 0 },
    week: { visits: 0, downloads: 0 },
    month: { visits: 0, downloads: 0 },
    total: { visits: 0, downloads: 0 },
  },
};

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// ── 各数据源聚合 ────────────────────────────────────────────────

// materials.json: { 课程键: [ {name,url,ext,size,...} ] }
function buildMaterials(raw) {
  if (!isObj(raw)) return null;
  const keys = Object.keys(raw);
  let items = 0;
  keys.forEach(function (k) {
    const v = raw[k];
    if (Array.isArray(v)) items += v.length;
    else if (isObj(v) && Array.isArray(v.items)) items += v.items.length;
  });
  return { courses: keys.length, items: items };
}

// bank.json: { 课程键: { course, code, questions: [...] } }
// 兼容历史包裹形态 { version, courses: { 课程键: {...} } }
function buildBank(raw) {
  if (!isObj(raw)) return null;
  let base = raw;
  if (isObj(raw.courses) && !Array.isArray(raw.courses.questions)) base = raw.courses;
  const keys = Object.keys(base);
  let questions = 0;
  keys.forEach(function (k) {
    const v = base[k];
    if (isObj(v) && Array.isArray(v.questions)) questions += v.questions.length;
  });
  return { courses: keys.length, questions: questions };
}

// contributors.json: { version, updatedAt, contributors: [ { name, count, hidden, ... } ] }
// 只统计未被隐藏者的数量与贡献次数之和
function buildContributors(raw) {
  if (!isObj(raw) && !Array.isArray(raw)) return null;
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw.contributors) ? raw.contributors : null);
  if (!list) return null;
  let count = 0;
  let contributions = 0;
  list.forEach(function (c) {
    if (!isObj(c) || c.hidden) return;
    count += 1;
    contributions += num(c.count);
  });
  return { count: count, contributions: contributions };
}

// users.json: { users: { [username]: { username, displayName, salt, hash, createdAt, lastLoginAt } } }
// 只取账号总数，不触碰任何用户字段
function buildStudents(raw) {
  if (!isObj(raw)) return null;
  const users = isObj(raw.users) ? raw.users : {};
  return { registered: Object.keys(users).length };
}

// checkins.json: { records: { [username]: { days: { 'YYYY-MM-DD': { minutes, count, note, at } } } } }
function buildCheckins(raw) {
  if (!isObj(raw)) return null;
  const records = isObj(raw.records) ? raw.records : {};
  const cutoff = gmt8Date(6);   // 近 7 天（含今日）
  const today = gmt8Date(0);

  let participants = 0;
  let days = 0;
  let minutes = 0;
  let last7 = 0;
  let todayCount = 0;

  Object.keys(records).forEach(function (u) {
    const rec = records[u];
    const dayMap = isObj(rec) && isObj(rec.days) ? rec.days : {};
    const dates = Object.keys(dayMap);
    if (dates.length > 0) participants += 1;
    days += dates.length;
    dates.forEach(function (d) {
      minutes += num((dayMap[d] || {}).minutes);
      if (d >= cutoff && d <= today) last7 += 1;   // 排除未来日期脏数据
      if (d === today) todayCount += 1;
    });
  });

  return { participants: participants, days: days, minutes: minutes, last7: last7, today: todayCount };
}

// stats.json: { v, visits: {date:n}, downloads: {date:n}, paths: {date:{path:n}}, downloadsByPath: {...} }
// v1 无 paths/downloadsByPath，topPaths 退化为空数组
function buildTraffic(raw) {
  if (!isObj(raw)) return null;
  const visits = isObj(raw.visits) ? raw.visits : {};
  const downloads = isObj(raw.downloads) ? raw.downloads : {};
  const paths = isObj(raw.paths) ? raw.paths : {};

  function sum(days) {
    let v = 0;
    let d = 0;
    for (let i = 0; i < days; i++) {
      const k = gmt8Date(i);
      v += num(visits[k]);
      d += num(downloads[k]);
    }
    return { visits: v, downloads: d };
  }

  const total = { visits: 0, downloads: 0 };
  Object.keys(visits).forEach(function (k) { total.visits += num(visits[k]); });
  Object.keys(downloads).forEach(function (k) { total.downloads += num(downloads[k]); });

  // 近 7 天路径聚合
  const acc = {};
  for (let i = 0; i < 7; i++) {
    const day = paths[gmt8Date(i)];
    if (!isObj(day)) continue;
    Object.keys(day).forEach(function (p) {
      acc[p] = (acc[p] || 0) + num(day[p]);
    });
  }
  const topPaths = Object.keys(acc)
    .map(function (p) { return { path: p, visits: acc[p] }; })
    .sort(function (a, b) { return b.visits - a.visits; })
    .slice(0, TOP_PATHS_MAX);

  return {
    traffic: { today: sum(1), week: sum(7), month: sum(30), total: total },
    topPaths: topPaths,
  };
}

// ── 并行拉取 + 逐源降级 ─────────────────────────────────────────
async function buildPayload() {
  const jobs = [
    ['materials', function () { return readJson('data/materials.json').then(buildMaterials); }],
    ['bank', function () { return readJson('data/bank.json').then(buildBank); }],
    ['contributors', function () { return readJsonSigned('data/contributors.json').then(buildContributors); }],
    ['users', function () { return readJsonSigned('data/users.json').then(buildStudents); }],
    ['checkins', function () { return readJsonSigned('data/checkins.json').then(buildCheckins); }],
    ['traffic', function () { return readJsonSigned('data/stats.json').then(buildTraffic); }],
  ];

  const settled = await Promise.allSettled(jobs.map(function (j) { return j[1](); }));

  const live = {
    materials: clone(SEED.materials),
    bank: clone(SEED.bank),
    contributors: clone(SEED.contributors),
    students: clone(SEED.students),
    checkins: clone(SEED.checkins),
    traffic: clone(SEED.traffic),
    topPaths: [],
  };
  const sources = {
    materials: 'seed',
    bank: 'seed',
    contributors: 'seed',
    users: 'seed',
    checkins: 'seed',
    traffic: 'seed',
  };
  const warnings = [];

  settled.forEach(function (r, i) {
    const name = jobs[i][0];
    if (r.status !== 'fulfilled' || r.value == null) {
      warnings.push(name + ': COS 读取失败');
      return;
    }
    sources[name] = 'cos';
    if (name === 'users') live.students = r.value;
    else if (name === 'traffic') {
      live.traffic = r.value.traffic;
      live.topPaths = r.value.topPaths;
    } else live[name] = r.value;
  });

  // 结构兜底：即便聚合函数返回残缺对象也不让前端取到 undefined
  if (!isObj(live.materials)) live.materials = clone(SEED.materials);
  if (!isObj(live.bank)) live.bank = clone(SEED.bank);
  if (!isObj(live.contributors)) live.contributors = clone(SEED.contributors);
  if (!isObj(live.students)) live.students = clone(SEED.students);
  if (!isObj(live.checkins)) live.checkins = clone(SEED.checkins);
  if (!isObj(live.traffic)) live.traffic = clone(SEED.traffic);
  if (!Array.isArray(live.topPaths)) live.topPaths = [];

  return { live: live, sources: sources, warnings: warnings, partial: warnings.length > 0 };
}

// ── 模块级缓存（单实例内存）──
let cache = { at: 0, payload: null };

// ── 简单限流（单实例内存）──
const rateMap = new Map();

function isRateLimited(request) {
  const xff = (request && request.headers && request.headers.get('x-forwarded-for')) || '';
  const ip = String(xff).split(',')[0].trim() || 'unknown';
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now - rec.start >= 60000) {
    rec = { start: now, count: 0 };
    rateMap.set(ip, rec);
    if (rateMap.size > 2000) {
      rateMap.clear();
      rateMap.set(ip, rec);
    }
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    }, extraHeaders || {}),
  });
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);

  try {
    if (isRateLimited(request)) return json({ error: '请求过于频繁' }, 429);

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }
    if (!isObj(body)) body = {};

    const action = body.action || 'get';
    if (action !== 'get') return json({ error: 'unknown action: ' + action }, 400);

    // fresh 绕过缓存必须由管理员 token 背书，防止外部刷 COS 请求
    const who = body.token ? verifyToken(String(body.token)) : null;
    const wantFresh = body.fresh === true && !!who;

    const now = nowMs();
    const hit = !wantFresh && cache.payload != null && now - cache.at < TTL_MS;

    if (!hit) {
      const payload = await buildPayload();
      cache = { at: nowMs(), payload: payload };
    }

    const out = {
      ok: true,
      serverTime: nowMs(),
      cachedAt: cache.at,
      ttl: TTL,
      partial: cache.payload.partial,
      warnings: cache.payload.warnings,
      sources: cache.payload.sources,
      live: cache.payload.live,
    };

    return json(out, 200, {
      'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      'x-metrics-cache': hit ? 'hit' : 'miss',
    });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
