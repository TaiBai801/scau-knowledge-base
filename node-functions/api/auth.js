// EdgeOne Pages 云函数 — 后台账号鉴权（登录/校验/管理员管理/审计日志）
// 路由: /api/auth
// 账号存 COS data/admins.json；日志存 data/audit-log.json
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { hashPassword, verifyPassword, signToken, verifyToken, auditLog } from './_auth.js';

const ADMIN_KEY = 'data/admins.json';
const LOG_KEY = 'data/audit-log.json';
const SEED_USER = 'admin202405801';
const SEED_PW = 'Cau202405801@';

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

    // ── 登录（无需 token）──
    if (action === 'login') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) return json({ error: '请输入账号和密码' }, 400);
      const data = (await readJson(ADMIN_KEY)) || { admins: [] };
      const adm = (data.admins || []).find((a) => a.username === username);
      if (!adm || !verifyPassword(password, adm.salt, adm.hash)) {
        return json({ error: '账号或密码错误' }, 401);
      }
      await auditLog(username, adm.role, 'login', '登录后台');
      return json({ ok: true, token: signToken(username, Number(adm.role)), role: Number(adm.role), username });
    }

    // ── 一次性种子（仅当 admins 为空）──
    if (action === 'seed') {
      const { data, etag } = await readJsonWithEtag(ADMIN_KEY);
      const state = data || { admins: [] };
      if (state.admins && state.admins.length > 0) {
        return json({ ok: false, message: '已存在管理员，跳过种子' });
      }
      const { salt, hash } = hashPassword(SEED_PW);
      state.admins = [{ username: SEED_USER, salt, hash, role: 2, createdBy: 'system', createdAt: Date.now() }];
      const r = await writeJsonIfMatch(ADMIN_KEY, state, etag);
      if (!r.ok) return json({ error: '种子写入失败', status: r.status }, 500);
      return json({ ok: true, username: SEED_USER });
    }

    // ── 以下均需 token ──
    const token = String(body.token || '');
    const who = verifyToken(token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);

    if (action === 'verify') {
      return json({ valid: true, role: who.role, username: who.username });
    }

    // ── 仅二级管理员（role 强制数字比较，杜绝字符串 "2" 误判）──
    if (Number(who.role) !== 2) return json({ error: '无权限（需二级管理员）' }, 403);

    if (action === 'listAdmins') {
      const data = (await readJson(ADMIN_KEY)) || { admins: [] };
      return json({
        admins: (data.admins || []).map((a) => ({
          username: a.username, role: a.role, createdBy: a.createdBy, createdAt: a.createdAt,
        })),
      });
    }

    if (action === 'addAdmin') {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const role = Number(body.role);
      if (!username || !password) return json({ error: '请填写账号和密码' }, 400);
      if (role !== 1) return json({ error: '仅能添加一级管理员' }, 400);
      if (username === who.username) return json({ error: '不能添加自己' }, 400);
      const { data, etag } = await readJsonWithEtag(ADMIN_KEY);
      const state = data || { admins: [] };
      if ((state.admins || []).some((a) => a.username === username)) return json({ error: '账号已存在' }, 409);
      const { salt, hash } = hashPassword(password);
      state.admins.push({ username, salt, hash, role: 1, createdBy: who.username, createdAt: Date.now() });
      const r = await writeJsonIfMatch(ADMIN_KEY, state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(who.username, who.role, 'addAdmin', '添加一级管理员 ' + username);
      return json({ ok: true });
    }

    if (action === 'removeAdmin') {
      const username = String(body.username || '').trim();
      if (!username) return json({ error: '缺少账号' }, 400);
      if (username === who.username) return json({ error: '不能删除自己' }, 400);
      const { data, etag } = await readJsonWithEtag(ADMIN_KEY);
      const state = data || { admins: [] };
      const target = (state.admins || []).find((a) => a.username === username);
      if (!target) return json({ error: '账号不存在' }, 404);
      if (Number(target.role) === 2) return json({ error: '不能删除二级管理员' }, 400);
      state.admins = (state.admins || []).filter((a) => a.username !== username);
      const r = await writeJsonIfMatch(ADMIN_KEY, state, etag);
      if (!r.ok) return json({ error: '写入冲突，请重试', status: r.status }, 409);
      await auditLog(who.username, who.role, 'removeAdmin', '删除一级管理员 ' + username);
      return json({ ok: true });
    }

    if (action === 'getLogs') {
      const data = (await readJson(LOG_KEY)) || { logs: [] };
      return json({ logs: (data.logs || []).slice(0, 500) });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
