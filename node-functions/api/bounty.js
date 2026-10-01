// EdgeOne Pages 云函数 — 资料悬赏
// 路由: /api/bounty
// 同学提交想要的资料 → 管理员审核 → 通过后上墙滚动展示，支持点赞、完成标记
// 状态存 COS data/bounties.json
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';

const DATA_KEY = 'data/bounties.json';
const ADMIN_PW = '123456#';
const MAX_CONTENT = 200;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

function fresh() {
  return { requests: [] };
}

function genId() {
  return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 对外展示项（脱敏，不含 likedBy 列表）
function publicItem(r, fp) {
  const likedBy = r.likedBy || [];
  return {
    id: r.id,
    content: r.content,
    by: r.by || '匿名',
    course: r.course || '',
    completed: !!r.completed,
    likes: likedBy.length,
    liked: fp ? likedBy.includes(fp) : false,
    time: r.time,
  };
}

function approvedList(state, fp) {
  const list = (state.requests || []).filter((r) => r.status === 'approved');
  list.sort((a, b) => (b.likedBy || []).length - (a.likedBy || []).length || b.time - a.time);
  return list.map((r) => publicItem(r, fp));
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet({ request }) {
  const fp = new URL(request.url).searchParams.get('fp') || '';
  const state = (await readJson(DATA_KEY)) || fresh();
  return json({ items: approvedList(state, fp) });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  try {
    const body = await request.json();
    const action = body.action;

    // ── 公开接口 ──
    if (action === 'list') {
      const state = (await readJson(DATA_KEY)) || fresh();
      return json({ items: approvedList(state, body.fp || '') });
    }

    if (action === 'submit') {
      const content = String(body.content || '').trim();
      if (!content) return json({ error: '请输入想要的资料' }, 400);
      if (content.length > MAX_CONTENT) return json({ error: '内容过长（最多 ' + MAX_CONTENT + ' 字）' }, 400);
      const by = String(body.by || '').trim().slice(0, 30) || '匿名';
      const course = String(body.course || '').trim().slice(0, 30);
      for (let i = 0; i < 5; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || fresh();
        state.requests = state.requests || [];
        state.requests.push({ id: genId(), content, by, course, status: 'pending', completed: false, likedBy: [], time: Date.now() });
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true, message: '已提交，等待审核通过后上墙' });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'like') {
      const id = String(body.id || '');
      const fp = String(body.fp || '').trim();
      if (!id || !fp) return json({ error: '参数缺失' }, 400);
      for (let i = 0; i < 5; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || fresh();
        const r = (state.requests || []).find((x) => x.id === id);
        if (!r) return json({ error: '记录不存在' }, 404);
        r.likedBy = r.likedBy || [];
        const idx = r.likedBy.indexOf(fp);
        let liked;
        if (idx >= 0) { r.likedBy.splice(idx, 1); liked = false; }
        else { r.likedBy.push(fp); liked = true; }
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true, liked, likes: r.likedBy.length });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    // ── 后台接口（需密码） ──
    if (body.pw !== ADMIN_PW) return json({ error: '无权限' }, 403);

    if (action === 'adminList') {
      const state = (await readJson(DATA_KEY)) || fresh();
      const list = (state.requests || []).slice().sort((a, b) => b.time - a.time);
      return json({ items: list.map((r) => ({
        id: r.id, content: r.content, by: r.by || '匿名', course: r.course || '',
        status: r.status, completed: !!r.completed,
        likes: (r.likedBy || []).length, time: r.time,
      })) });
    }

    if (action === 'review') {
      const id = String(body.id || '');
      const status = body.status;
      if (!['approved', 'rejected', 'pending'].includes(status)) return json({ error: 'status 非法' }, 400);
      for (let i = 0; i < 5; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || fresh();
        const r = (state.requests || []).find((x) => x.id === id);
        if (!r) return json({ error: '记录不存在' }, 404);
        r.status = status;
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'setCompleted') {
      const id = String(body.id || '');
      for (let i = 0; i < 5; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || fresh();
        const r = (state.requests || []).find((x) => x.id === id);
        if (!r) return json({ error: '记录不存在' }, 404);
        r.completed = !!body.completed;
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true, completed: r.completed });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      for (let i = 0; i < 5; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || fresh();
        state.requests = (state.requests || []).filter((x) => x.id !== id);
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
