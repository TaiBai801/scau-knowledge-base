// EdgeOne Pages 云函数 — 学生用户账号（注册 / 登录 / 登出 / 校验）
// 路由: /api/user
// 账号存 COS data/users.json（与管理员 data/admins.json 完全分库）
// 密码：scrypt + 随机盐（复用 _auth.js）；会话：学生 realm HMAC token（见 _userauth.js）
//
// 接口契约：
//   POST { action: 'register', username, password, displayName? }
//        → 200 { ok, token, user:{ username, displayName, createdAt } }
//        → 400 { error } 参数不合法 / 409 { error } 用户名已存在 / 429 { error } 请求过于频繁
//   POST { action: 'login', username, password }
//        → 200 { ok, token, user:{ username, displayName, createdAt } }
//        → 401 { error: '账号或密码错误' }（不区分「用户不存在」与「密码错误」，防枚举）
//   POST { action: 'logout' }        → 200 { ok: true }（无状态 token，客户端清除本地令牌即完成登出）
//   POST { action: 'verify', token } → 200 { valid: true, username, displayName } / 401 { error }
import { readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { hashPassword, verifyPassword, signUserToken, verifyUserToken, rateLimit, json, parseBody } from './_userauth.js';
import { auditLog } from './_auth.js';

const USER_KEY = 'data/users.json';
const NAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,16}$/; // 2-16 位：中文/字母/数字/下划线/连字符

// 对外脱敏：绝不返回 salt/hash
function publicUser(u) {
  return { username: u.username, displayName: u.displayName || u.username, createdAt: u.createdAt };
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  const body = await parseBody(request);
  if (!body) return json({ error: '请求体不是合法 JSON' }, 400);

  // 客户端 IP（EdgeOne 代理链下取首段；取不到用固定串兜底）
  const ip = (request.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim();

  try {
    const action = body.action;

    // ── 注册 ──
    if (action === 'register') {
      if (!rateLimit('register:' + ip, 10, 60_000)) return json({ error: '注册请求过于频繁，请稍后再试' }, 429);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim() || username;
      if (!NAME_RE.test(username)) return json({ error: '用户名需 2-16 位，可用中文、字母、数字、下划线或连字符' }, 400);
      if (password.length < 6 || password.length > 64) return json({ error: '密码长度需 6-64 位' }, 400);
      if (displayName.length > 24) return json({ error: '昵称过长（≤24 字）' }, 400);

      const { data, etag } = await readJsonWithEtagSigned(USER_KEY);
      const state = data || { users: {} };
      if (!state.users) state.users = {};
      if (state.users[username]) return json({ error: '用户名已被注册' }, 409);

      const { salt, hash } = hashPassword(password);
      const now = Date.now();
      const u = { username, displayName, salt, hash, createdAt: now, lastLoginAt: now };
      state.users[username] = u;
      const r = await writeJsonIfMatch(USER_KEY, state, etag, 'private');
      if (!r.ok) {
        // 并发冲突：重读一次再试（仅重试 1 次）
        const { data: d2, etag: e2 } = await readJsonWithEtagSigned(USER_KEY);
        const s2 = d2 || { users: {} };
        if (s2.users[username]) return json({ error: '用户名已被注册' }, 409);
        s2.users[username] = u;
        const r2 = await writeJsonIfMatch(USER_KEY, s2, e2, 'private');
        if (!r2.ok) return json({ error: '写入冲突，请重试', status: r2.status }, 409);
      }
      await auditLog(username, 0, 'register', '学生账号注册');
      return json({ ok: true, token: signUserToken(username), user: publicUser(u) });
    }

    // ── 登录 ──
    if (action === 'login') {
      if (!rateLimit('login:' + ip, 10, 60_000)) return json({ error: '登录请求过于频繁，请稍后再试' }, 429);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return json({ error: '请输入账号和密码' }, 400);
      const data = await readJsonWithEtagSigned(USER_KEY);
      const u = (data.data || { users: {} }).users[username];
      if (!u || !verifyPassword(password, u.salt, u.hash)) {
        return json({ error: '账号或密码错误' }, 401);
      }
      // best-effort 更新最近登录时间（失败不影响登录）
      try {
        const state = data.data;
        state.users[username].lastLoginAt = Date.now();
        await writeJsonIfMatch(USER_KEY, state, data.etag, 'private');
      } catch (e) { /* 忽略 */ }
      await auditLog(username, 0, 'login', '学生登录');
      return json({ ok: true, token: signUserToken(username), user: publicUser(u) });
    }

    // ── 登出（无状态 token：客户端清除本地令牌即完成；保留 action 使契约完整）──
    if (action === 'logout') {
      return json({ ok: true });
    }

    // ── 校验 token（页面加载时恢复会话用）──
    if (action === 'verify') {
      const who = verifyUserToken(String(body.token || ''));
      if (!who) return json({ error: '未登录或登录已过期' }, 401);
      const data = await readJsonWithEtagSigned(USER_KEY);
      const u = (data.data || { users: {} }).users[who.username];
      if (!u) return json({ error: '账号不存在' }, 401); // 注册后又被清理的极端情况
      return json({ valid: true, user: publicUser(u) });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
