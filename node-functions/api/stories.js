// EdgeOne Pages 云函数 — 学长分享（ta说卡片）读写
// 路由: /api/stories
// 数据: data/stories.json（COS 单一数据源；仓库 data/stories.json 仅为首次种子）
import { readJson, writeJson, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';

const DATA_KEY = 'data/stories.json';

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

function validStories(d) {
  return d && Array.isArray(d.stories) && Array.isArray(d.questions);
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置，请在 EdgeOne 环境变量中设置 COS_SECRET_ID / COS_SECRET_KEY' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;
    // 读取不需要登录（前台课程页也拉这份数据的种子副本）
    if (action === 'getStories') {
      const data = (await readJson(DATA_KEY)) || null;
      return json({ data });
    }
    const who = verifyToken(body.token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    await auditLog(who.username, who.role, action, '');

    if (action === 'saveStories') {
      const nd = body.data;
      if (!validStories(nd)) return json({ error: '数据结构非法（缺 stories/questions 数组）' }, 400);
      nd.updatedAt = new Date().toISOString().slice(0, 10);
      const ok = await writeJson(DATA_KEY, nd);
      return json({ ok, count: nd.stories.length });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
