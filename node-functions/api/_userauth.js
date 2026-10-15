// EdgeOne 云函数共享模块 — 学生用户鉴权（非路由，供 user.js / checkin.js / leaderboard.js import）
//
// 与管理员系统（_auth.js）的隔离策略（互不越权，零改动现有代码）：
//   管理员 token payload = { u, r, exp }（r 必须为真值数字）
//   学生   token payload = { realm: 'user', u, exp }（无 r 字段）
//   → 管理员 token 传入学生接口：verifyUserToken 要求 realm === 'user' → 拒收
//   → 学生 token 传入管理接口：_auth.verifyToken 要求 d.r 真值 → 判无效
//
// 密码哈希直接复用 _auth.js 的 scrypt 实现（同一项目同一套规范），本模块只补学生侧令牌与限流。
import * as crypto from 'node:crypto';
import { hashPassword, verifyPassword } from './_auth.js';

export { hashPassword, verifyPassword };

const SECRET = process.env.AUTH_SECRET || process.env.COS_SECRET_KEY || '';
const TOKEN_TTL = 30 * 24 * 3600; // 学生 token 有效期 30 天（管理端为 7 天，学生登录频率更低）

// ── 学生会话 token（无状态 HMAC，与管理端同密钥不同结构）──
export function signUserToken(username) {
  const payload = Buffer.from(JSON.stringify({
    realm: 'user',
    u: username,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

export function verifyUserToken(token) {
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
    if (!d || d.realm !== 'user' || !d.u || !d.exp) return null; // 必须是学生 realm
    if (d.exp < Math.floor(Date.now() / 1000)) return null;
    return { username: d.u };
  } catch (e) {
    return null;
  }
}

// ── 简易限流（per 云函数实例内存；EdgeOne 多实例下为软限制，仅挡最基本的暴力尝试）──
// rateLimit('login:1.2.3.4', 10, 60_000) → true=放行 false=超限
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, n: 0 };
    buckets.set(key, b);
  }
  b.n++;
  if (buckets.size > 5000) buckets.clear(); // 防 Map 无限膨胀
  return b.n <= limit;
}

// ── 通用响应（与项目各云函数同款 CORS 头）──
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

// ── 请求体解析（容错：非 JSON body 返回 null）──
export async function parseBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}
