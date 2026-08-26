// EdgeOne Pages 云函数 — 资料上传后端
// 路由: /api/upload
// 环境变量: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION

import * as crypto from 'node:crypto';

const REGION = process.env.COS_REGION || 'ap-chengdu';
const BUCKET = process.env.COS_BUCKET || 'scau-files-1440179010';
const HOST = `${BUCKET}.cos.${REGION}.myqcloud.com`;
const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;
const DATA_KEY = 'data/materials.json';

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

function hmacSha1(key, msg) {
  return crypto.createHmac('sha1', key).update(msg).digest('hex');
}

function sha1Hex(msg) {
  return crypto.createHash('sha1').update(msg).digest('hex');
}

function cosAuth(method, key) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 1800}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `${method}\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  return `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

function presignUrl(key, expires = 1800) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + expires}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `put\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  const params = [
    'q-sign-algorithm=sha1',
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  return { uploadUrl: `https://${HOST}/${key}?${params}`, key };
}

async function readMaterials() {
  const res = await fetch(`https://${HOST}/${DATA_KEY}`, { cache: 'no-store' });
  if (!res.ok) return {};
  return await res.json();
}

async function writeMaterials(data) {
  const res = await fetch(`https://${HOST}/${DATA_KEY}`, {
    method: 'PUT',
    headers: {
      host: HOST,
      authorization: cosAuth('put', DATA_KEY),
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!SECRET_ID || !SECRET_KEY) {
    return json({ error: 'COS 密钥未配置，请在 EdgeOne 环境变量中设置 COS_SECRET_ID / COS_SECRET_KEY' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'presign') {
      const ext = String(body.filename || '').split('.').pop().toLowerCase();
      const code = String(body.courseCode || 'misc').replace(/[^0-9]/g, '');
      const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'bin';
      const key = `files/${code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const { uploadUrl } = presignUrl(key);
      return json({ uploadUrl, key });
    }

    if (action === 'save') {
      const { courseKey, name, key, ext, size, replaceUrl } = body;
      if (!courseKey || !name || !key) return json({ error: '缺参数' }, 400);
      const data = await readMaterials();
      let list = data[courseKey] || [];
      if (replaceUrl) {
        list = list.filter((m) => m.url !== replaceUrl);
      }
      list.push({ name, url: `https://${HOST}/${key}`, ext: ext || '', size: size || null });
      data[courseKey] = list;
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    if (action === 'remove') {
      const { courseKey, url } = body;
      const data = await readMaterials();
      const list = (data[courseKey] || []).filter((m) => m.url !== url);
      if (list.length) data[courseKey] = list;
      else delete data[courseKey];
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    if (action === 'rename') {
      const { courseKey, url, newName } = body;
      const data = await readMaterials();
      const list = (data[courseKey] || []).map((m) => (m.url === url ? { ...m, name: newName } : m));
      data[courseKey] = list;
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
