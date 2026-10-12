// EdgeOne 云函数共享鉴权模块（非路由，供 auth.js 及其他云函数 import）
// 密码：scrypt + 随机盐哈希；会话：无状态 HMAC-SHA256 token；审计：追加写 COS 日志
import * as crypto from 'node:crypto';
import { readJsonWithEtag, writeJsonIfMatch } from './_cos.js';

const ADMIN_KEY = 'data/admins.json';
const LOG_KEY = 'data/audit-log.json';
const SECRET = process.env.AUTH_SECRET || process.env.COS_SECRET_KEY || '';
const TOKEN_TTL = 7 * 24 * 3600; // 7 天

// ── 密码哈希 ──
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(pw, salt, hash) {
  try {
    const h = crypto.scryptSync(String(pw), salt, 32);
    const b = Buffer.from(hash, 'hex');
    return h.length === b.length && crypto.timingSafeEqual(h, b);
  } catch (e) {
    return false;
  }
}

// ── 会话 token（无状态 HMAC）──
export function signToken(username, role) {
  const payload = Buffer.from(JSON.stringify({
    u: username,
    r: role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expect, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d || !d.u || !d.r || !d.exp) return null;
    if (d.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: d.u, role: d.r };
  } catch (e) {
    return null;
  }
}

// ── 审计日志（追加，失败不阻断主流程）──
export async function auditLog(username, role, action, detail) {
  try {
    const { data, etag } = await readJsonWithEtag(LOG_KEY);
    const state = data || { logs: [] };
    const logs = Array.isArray(state.logs) ? state.logs : [];
    logs.unshift({ time: Date.now(), username, role, action, detail: detail || '' });
    if (logs.length > 2000) logs.length = 2000;
    state.logs = logs;
    await writeJsonIfMatch(LOG_KEY, state, etag);
  } catch (e) {
    // 日志写入失败不影响业务操作
  }
}
