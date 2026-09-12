// EdgeOne Pages 云函数 — 抽奖（云端共享奖池 + 记录）
// 路由: /api/lottery
// 状态存 COS data/lottery.json，全局唯一，所有设备共用
import { readJson, readJsonWithEtag, writeJson, writeJsonIfMatch, hasSecret } from './_cos.js';

const DATA_KEY = 'data/lottery.json';
const PRIZES = [
  { name: '一等奖 · 魔方', emoji: '🧊', total: 10 },
  { name: '二等奖 · 毛绒挂件', emoji: '🧸', total: 60 },
  { name: '三等奖 · 碱水面包挂件', emoji: '🥨', total: 100 },
  { name: '参与奖', emoji: '🎁', total: 0 },
];
const TOTAL = PRIZES.reduce((a, p) => a + p.total, 0);

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

function freshState() {
  return { remaining: PRIZES.map((p) => p.total), history: [], resetCount: 0, closed: false };
}

function summarize(state) {
  const left = state.remaining.reduce((a, b) => a + b, 0);
  return { remaining: state.remaining, history: state.history, left, drawn: TOTAL - left, total: TOTAL, closed: !!state.closed };
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet() {
  const state = (await readJson(DATA_KEY)) || freshState();
  return json(summarize(state));
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'getState') {
      const state = (await readJson(DATA_KEY)) || freshState();
      return json(summarize(state));
    }

    if (action === 'draw') {
      // 抽奖人标识（姓名/学号），前端必填，缺省为「匿名」
      const by = (body.name && String(body.name).trim()) || '匿名';
      // 乐观并发：读→抽→带 If-Match 写，冲突则重试，保证「抽一份少一份」精确
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || freshState();
        if (state.closed) return json({ error: 'closed', message: '抽奖已关闭' }, 403);
        const left = state.remaining.reduce((a, b) => a + b, 0);
        if (left <= 0) return json({ error: 'empty', message: '奖池已抽空' }, 409);

        // 从剩余奖池均匀随机抽一份
        let r = Math.floor(Math.random() * left);
        let idx = 0;
        for (let i = 0; i < state.remaining.length; i++) {
          if (r < state.remaining[i]) { idx = i; break; }
          r -= state.remaining[i];
        }
        state.remaining[idx]--;
        const prize = { name: PRIZES[idx].name, emoji: PRIZES[idx].emoji, tier: idx, time: Date.now(), by };
        state.history.unshift(prize);
        if (state.history.length > 2000) state.history = state.history.slice(0, 2000);

        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ prize, ...summarize(state) });
        // 412 冲突 → 重读重试
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'adjust') {
      // 后台调整某档奖品剩余数量（如把参与奖 800 调到 500）
      const tier = Number(body.tier);
      const count = Number(body.count);
      if (isNaN(tier) || tier < 0 || tier >= PRIZES.length || isNaN(count) || count < 0) {
        return json({ error: '参数非法' }, 400);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || freshState();
        state.remaining[tier] = count;
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true, ...summarize(state) });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'setClosed') {
      // 开关抽奖：closed=true 关闭，false 重新开启
      const closed = !!body.closed;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data || freshState();
        state.closed = closed;
        const wr = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (wr.ok) return json({ ok: true, ...summarize(state) });
      }
      return json({ error: 'conflict', message: '并发冲突，请重试' }, 409);
    }

    if (action === 'reset') {
      await writeJson(DATA_KEY, freshState());
      return json({ ok: true, ...summarize(freshState()) });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
