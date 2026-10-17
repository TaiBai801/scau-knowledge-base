// EdgeOne Pages 云函数 — 站点统计（访问数 / 下载数 / 路径维度）
// 路由: /api/stats
import { readJsonSigned, readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { gmt8Date } from './_date.js';

const DATA_KEY = 'data/stats.json';
const DIM_MAX = 200;      // 单日 path 维度键上限
const KEEP_DAYS = 120;    // 维度数据保留天数
const RETRY = 4;          // 写冲突重试次数
const RATE_LIMIT = 120;   // 每 IP 每分钟最大埋点次数

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// 兼容 v1（只有 visits/downloads）与 v2 数据
function normalizeStats(raw) {
  const s = isObj(raw) ? raw : {};
  return {
    v: 2,
    visits: isObj(s.visits) ? s.visits : {},
    downloads: isObj(s.downloads) ? s.downloads : {},
    paths: isObj(s.paths) ? s.paths : {},
    downloadsByPath: isObj(s.downloadsByPath) ? s.downloadsByPath : {},
  };
}

function cleanPath(input) {
  const s = String(input || '').slice(0, 160);
  if (!s || s.charAt(0) !== '/') return '';
  if (s.indexOf('/admin') === 0) return '';
  try {
    decodeURIComponent(s);
  } catch (e) {
    return '';
  }
  return s;
}

// 清理过期的维度日期桶
function pruneStats(data) {
  const cutoff = gmt8Date(KEEP_DAYS);
  ['paths', 'downloadsByPath'].forEach(function (k) {
    const bucket = data[k];
    Object.keys(bucket).forEach(function (d) {
      if (d < cutoff) delete bucket[d];
    });
  });
}

function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    }, extraHeaders || {}),
  });
}

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

// ── 埋点写入（乐观并发 + 私有 ACL）──
async function trackOne(type, path) {
  const isDl = type === 'download';
  for (let i = 0; i < RETRY; i++) {
    const { data: raw, etag } = await readJsonWithEtagSigned(DATA_KEY);
    const data = normalizeStats(raw);
    const d = gmt8Date(0);

    if (isDl) data.downloads[d] = (data.downloads[d] || 0) + 1;
    else data.visits[d] = (data.visits[d] || 0) + 1;

    if (path) {
      const bucketKey = isDl ? 'downloadsByPath' : 'paths';
      const bucket = data[bucketKey];
      if (!isObj(bucket[d])) bucket[d] = {};
      const day = bucket[d];
      if (typeof day[path] === 'number') {
        day[path] += 1;
      } else if (Object.keys(day).length < DIM_MAX) {
        day[path] = 1;
      }
      // 维度已满：只计总数，不记路径
    }

    pruneStats(data);

    const r = await writeJsonIfMatch(DATA_KEY, data, etag, 'private');
    if (r.ok) return { ok: true };

    // 冲突：随机抖动后重读重试
    await new Promise(function (resolve) {
      setTimeout(resolve, 20 + Math.floor(Math.random() * 60));
    });
  }
  return { ok: true, dropped: true };
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'track') {
      if (isRateLimited(request)) return json({ error: '请求过于频繁' }, 429);
      const type = body.type === 'download' ? 'download' : 'visit';
      const path = cleanPath(body.path);
      const r = await trackOne(type, path);
      return json(r);
    }

    if (action === 'getStats') {
      const who = verifyToken(body.token);
      if (!who) return json({ error: '未登录或登录已过期' }, 401);
      await auditLog(who.username, who.role, action, '');
      const data = normalizeStats(await readJsonSigned(DATA_KEY));

      function sum(n) {
        let v = 0, d = 0;
        for (let i = 0; i < n; i++) {
          const k = gmt8Date(i);
          v += data.visits[k] || 0;
          d += data.downloads[k] || 0;
        }
        return { visits: v, downloads: d };
      }

      const detail = [];
      for (let i = 6; i >= 0; i--) {
        const k = gmt8Date(i);
        detail.push({ date: k, visits: data.visits[k] || 0, downloads: data.downloads[k] || 0 });
      }

      // 全历史求和
      const total = { visits: 0, downloads: 0 };
      Object.keys(data.visits).forEach(function (k) { total.visits += data.visits[k] || 0; });
      Object.keys(data.downloads).forEach(function (k) { total.downloads += data.downloads[k] || 0; });

      // 近 7 天路径聚合
      function aggregate(bucketKey) {
        const acc = {};
        for (let i = 0; i < 7; i++) {
          const day = data[bucketKey][gmt8Date(i)];
          if (!isObj(day)) continue;
          Object.keys(day).forEach(function (p) {
            acc[p] = (acc[p] || 0) + (day[p] || 0);
          });
        }
        return Object.keys(acc)
          .map(function (p) { return { path: p, n: acc[p] }; })
          .sort(function (a, b) { return b.n - a.n; });
      }

      const topPaths = aggregate('paths').slice(0, 20).map(function (x) {
        return { path: x.path, visits: x.n };
      });
      const downloadsTop = aggregate('downloadsByPath').slice(0, 10).map(function (x) {
        return { path: x.path, count: x.n };
      });

      return json({ day: sum(1), week: sum(7), month: sum(30), detail, total, topPaths, downloadsTop },
        200, { 'cache-control': 'no-store' });
    }

    if (action === 'sealAcl') {
      const who = verifyToken(body.token);
      if (!who) return json({ error: '未登录或登录已过期' }, 401);
      await auditLog(who.username, who.role, action, '');
      const { data, etag } = await readJsonWithEtagSigned(DATA_KEY);
      const r = await writeJsonIfMatch(DATA_KEY, data || normalizeStats(null), etag, 'private');
      return json({ ok: r.ok, status: r.status });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
