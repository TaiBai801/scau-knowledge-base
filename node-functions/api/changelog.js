// EdgeOne Pages 云函数 — 更新日志读写
// 路由: /api/changelog
// 数据: data/changelog.json（COS 单一数据源；仓库 data/changelog.json 仅为种子/统计快照）
import { readJson, writeJson, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';

const DATA_KEY = 'data/changelog.json';
const KINDS = ['milestone', 'feature', 'fix', 'improve'];

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

function validChangelog(d) {
  return (
    d &&
    Array.isArray(d.releases) &&
    d.releases.every(
      (r) =>
        r &&
        typeof r.version === 'string' &&
        typeof r.date === 'string' &&
        typeof r.title === 'string' &&
        Array.isArray(r.items) &&
        r.items.every((i) => KINDS.includes(i.kind) && typeof i.text === 'string')
    )
  );
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
    if (action === 'getChangelog') {
      const data = (await readJson(DATA_KEY)) || null;
      return json({ data });
    }
    const who = verifyToken(body.token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    await auditLog(who.username, who.role, action, '');

    if (action === 'saveChangelog') {
      const nd = body.data;
      if (!validChangelog(nd)) return json({ error: '数据结构非法（版本/日期/标题/条目 kind 不合法）' }, 400);
      nd.updatedAt = new Date().toISOString().slice(0, 10);
      const ok = await writeJson(DATA_KEY, nd);
      return json({ ok, count: nd.releases.length });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
