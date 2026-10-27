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

// 生成 PUT 直传的签名 URL（后台图片上传用）
export function presignPutUrl(key, expires = 1800) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + expires}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `put\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  const auth = `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
  return `https://${HOST}/${encodeURI(key)}?${auth}`;
}

// 生成带查询参数的签名 GET URL（用于数据万象文档预览等 ci-process 操作）
export function presignGetUrl(key, params) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 1800}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);

  const sortedKeys = Object.keys(params).sort();
  // 签名里的 HttpParameters：参数名【小写】（COS 会把 URL 参数名转小写参与签名）
  const signQuery = sortedKeys.map((k) => `${k.toLowerCase()}=${encodeURIComponent(params[k])}`).join('&');
  // q-url-param-list：参数名小写、排序、分号连接
  const paramList = sortedKeys.map((k) => k.toLowerCase()).join(';');

  // 签名里 key 用【原始路径】（不做 URL 编码）
  const httpString = `get\n/${key}\n${signQuery}\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);

  const auth = `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=${paramList}&q-signature=${signature}`;

  // 请求 URL：key 做 URL 编码，参数名保持原大小写（如 dstType）
  const encodedKey = encodeURI(key);
  const reqQuery = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
  return `https://${HOST}/${encodedKey}?${reqQuery}&${auth}`;
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

// ── 签名读取（用于已设为私有读的敏感文件：admins.json / users.json / audit-log.json / checkins.json）──
// 说明：COS 私有对象要求请求带签名；而带签名访问「公开」对象同样被接受，故可安全统一使用。
function signedHeaders(method, key) {
  return { host: HOST, authorization: cosAuth(method, key) };
}

export async function readJsonSigned(key) {
  const res = await fetch(`https://${HOST}/${key}`, {
    cache: 'no-store',
    headers: signedHeaders('get', key),
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function readJsonWithEtagSigned(key) {
  const res = await fetch(`https://${HOST}/${key}`, {
    cache: 'no-store',
    headers: signedHeaders('get', key),
  });
  if (!res.ok) return { data: null, etag: null };
  const data = await res.json();
  const etag = res.headers.get('etag') || res.headers.get('ETag') || null;
  return { data, etag };
}

// 带条件的写入：有 etag 用 If-Match（防止覆盖他人改动），无 etag 用 If-None-Match:*（仅首次创建）
// acl: 可选，如 'private' —— 写入时同时设定对象 ACL（用于收紧敏感数据文件的公开读）
export async function writeJsonIfMatch(key, data, etag, acl) {
  const headers = {
    host: HOST,
    authorization: cosAuth('put', key),
    'content-type': 'application/json',
  };
  if (acl) headers['x-cos-acl'] = acl;
  if (etag) headers['if-match'] = etag;
  else headers['if-none-match'] = '*';
  const res = await fetch(`https://${HOST}/${key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  return { ok: res.ok, status: res.status };
}

// ── 列举对象（List Objects V1）──
// 说明：查询参数不参与签名（cosAuth 的 q-url-param-list 恒为空），
// COS 仍会接受 prefix/marker/max-keys，已在真实桶上验证。
// key 传 '' 时 httpString 为 `get\n/\n\nhost=HOST\n`，正是 List 的资源格式。
function xmlDecode(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseListXml(xml) {
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const nextM = xml.match(/<NextMarker>([\s\S]*?)<\/NextMarker>/i);
  const items = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const key = (block.match(/<Key>([\s\S]*?)<\/Key>/i) || [])[1];
    if (!key) continue;
    const size = (block.match(/<Size>([\s\S]*?)<\/Size>/i) || [])[1];
    const lm = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/i) || [])[1];
    items.push({
      key: xmlDecode(key),
      size: Number(size) || 0,
      lastModified: lm ? xmlDecode(lm) : '',
    });
  }
  return { truncated, nextMarker: nextM ? xmlDecode(nextM[1]) : '', items };
}

// 单页列举
export async function listObjects(prefix = 'files/', marker = '', maxKeys = 1000) {
  const qs = new URLSearchParams({ prefix, 'max-keys': String(maxKeys) });
  if (marker) qs.set('marker', marker);
  const res = await fetch(`https://${HOST}/?${qs.toString()}`, {
    headers: signedHeaders('get', ''),
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false, status: res.status, items: [], truncated: false, nextMarker: '' };
  const xml = await res.text();
  const parsed = parseListXml(xml);
  return { ok: true, status: res.status, ...parsed };
}

// 分页列举全部（safetyLimit 防止意外拉爆内存/超时）
export async function listAllObjects(prefix = 'files/', safetyLimit = 5000) {
  const all = [];
  let marker = '';
  let pages = 0;
  for (;;) {
    const r = await listObjects(prefix, marker);
    if (!r.ok) return { ok: false, status: r.status, items: all, pages };
    all.push(...r.items);
    pages++;
    if (!r.truncated || !r.nextMarker || all.length >= safetyLimit || pages > 20) break;
    marker = r.nextMarker;
  }
  return { ok: true, status: 200, items: all, pages };
}

// ── 删除对象（仅用于清理已下线功能的残留数据）──
export async function deleteObject(key) {
  const res = await fetch(`https://${HOST}/${key}`, {
    method: 'DELETE',
    headers: signedHeaders('delete', key),
  });
  return { ok: res.ok, status: res.status };
}
