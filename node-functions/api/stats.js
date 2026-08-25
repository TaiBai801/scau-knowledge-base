// EdgeOne Pages 云函数 — 站点统计（访问数 / 下载数）
// 路由: /api/stats
import { readJson, writeJson, hasSecret } from './_cos.js';

const DATA_KEY = 'data/stats.json';

function gmt8Date(offsetDays) {
  const t = Date.now() + 8 * 3600 * 1000 - (offsetDays || 0) * 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

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

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'track') {
      const type = body.type === 'download' ? 'downloads' : 'visits';
      const data = (await readJson(DATA_KEY)) || { visits: {}, downloads: {} };
      if (!data[type]) data[type] = {};
      const d = gmt8Date(0);
      data[type][d] = (data[type][d] || 0) + 1;
      await writeJson(DATA_KEY, data);
      return json({ ok: true });
    }

    if (action === 'getStats') {
      const data = (await readJson(DATA_KEY)) || { visits: {}, downloads: {} };
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
      return json({ day: sum(1), week: sum(7), month: sum(30), detail });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
