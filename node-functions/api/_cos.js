// COS 辅助模块（不注册路由，供其他云函数 import）
import * as crypto from 'node:crypto';

const REGION = process.env.COS_REGION || 'ap-chengdu';
const BUCKET = process.env.COS_BUCKET || 'scau-files-1440179010';
export const HOST = `${BUCKET}.cos.${REGION}.myqcloud.com`;
const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;

function hmacSha1(key, msg) {
  return crypto.createHmac('sha1', key).update(msg).digest('hex');
}
function sha1Hex(msg) {
  return crypto.createHash('sha1').update(msg).digest('hex');
}

export function hasSecret() {
  return !!(SECRET_ID && SECRET_KEY);
}

export function cosAuth(method, key) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 1800}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `${method}\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  return `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

export async function readJson(key) {
  const res = await fetch(`https://${HOST}/${key}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return await res.json();
}

export async function writeJson(key, data) {
  const res = await fetch(`https://${HOST}/${key}`, {
    method: 'PUT',
    headers: {
      host: HOST,
      authorization: cosAuth('put', key),
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// 读取 JSON 并返回 ETag（用于乐观并发控制）
export async function readJsonWithEtag(key) {
  const res = await fetch(`https://${HOST}/${key}`, { cache: 'no-store' });
  if (!res.ok) return { data: null, etag: null };
  const data = await res.json();
  const etag = res.headers.get('etag') || res.headers.get('ETag') || null;
  return { data, etag };
}

// 带条件的写入：有 etag 用 If-Match（防止覆盖他人改动），无 etag 用 If-None-Match:*（仅首次创建）
export async function writeJsonIfMatch(key, data, etag) {
  const headers = {
    host: HOST,
    authorization: cosAuth('put', key),
    'content-type': 'application/json',
  };
  if (etag) headers['if-match'] = etag;
  else headers['if-none-match'] = '*';
  const res = await fetch(`https://${HOST}/${key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  return { ok: res.ok, status: res.status };
}
