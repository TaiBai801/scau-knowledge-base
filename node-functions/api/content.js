// EdgeOne Pages 云函数 — 课程内容（③练习题 ④推荐资源 ⑤ta说）读写
// 路由: /api/content
import { readJson, writeJson, hasSecret } from './_cos.js';

const DATA_KEY = 'data/content.json';
const FIELDS = ['exercises', 'resources', 'tasay'];

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
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置，请在 EdgeOne 环境变量中设置 COS_SECRET_ID / COS_SECRET_KEY' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'getContent') {
      const data = (await readJson(DATA_KEY)) || {};
      const entry = data[body.courseCode] || {};
      const content = {};
      for (const f of FIELDS) content[f] = entry[f] || '';
      return json({ content });
    }

    if (action === 'saveContent') {
      const { courseCode, field, text } = body;
      if (!courseCode || !FIELDS.includes(field)) return json({ error: '缺参数或字段非法' }, 400);
      const data = (await readJson(DATA_KEY)) || {};
      if (!data[courseCode]) data[courseCode] = { exercises: '', resources: '', tasay: '' };
      data[courseCode][field] = text || '';
      const ok = await writeJson(DATA_KEY, data);
      return json({ ok });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
