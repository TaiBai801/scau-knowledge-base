// EdgeOne Pages 云函数 — 学习打卡（记录 / 列表 / 统计）
// 路由: /api/checkin
// 记录存 COS data/checkins.json，与账号（username）绑定
//
// 接口契约（所有 action 均需学生 token）：
//   POST { action: 'checkin', token, date: 'YYYY-MM-DD', minutes: number, note? }
//        → 200 { ok, day: { date, minutes, count }, stats: { totalDays, totalMinutes, streak, lastDate } }
//        · date 取客户端本地日期（学生分布在国内，统一东八区；格式校验 + 禁止未来日期）
//        · 同一天重复打卡 = 分钟数累加、次数+1、备注取最新（不产生新的天数记录）
//        · streak 由服务端从已打卡日期集合计算（连续自然日），客户端不传
//   POST { action: 'list', token, days?: number }
//        → 200 { days: { 'YYYY-MM-DD': { minutes, count, note } }, stats }  默认返回最近 90 天
//   POST { action: 'stats', token }
//        → 200 { stats: { totalDays, totalMinutes, streak, lastDate } }
//   POST { action: 'deleteDay', token, date } → 200 { ok, stats }（误打卡修正，当天整条删除）
import { readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { awardPoints } from './points.js';
import { verifyUserToken, json, parseBody } from './_userauth.js';

const DATA_KEY = 'data/checkins.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 日期工具（全部基于本地时区字符串比较，不做 Date 反序列化，避免时区漂移）
function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 从已打卡日期集合计算连续天数（以 anchor 日为起点向前数）
function calcStreak(days, anchor) {
  if (!days[anchor]) return 0;
  let n = 0;
  let cur = anchor;
  while (days[cur]) {
    n++;
    cur = shiftDate(cur, -1);
  }
  return n;
}

function calcStats(rec) {
  const days = rec.days || {};
  const totalDays = Object.keys(days).length;
  const totalMinutes = Object.values(days).reduce((s, d) => s + (Number(d.minutes) || 0), 0);
  const lastDate = Object.keys(days).sort().pop() || '';
  const streak = lastDate ? calcStreak(days, lastDate) : 0;
  return { totalDays, totalMinutes, streak, lastDate };
}

// 带重试的写回（409 乐观并发冲突时重读重算，最多 retries 次）
async function saveWithRetry(mutate, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const { data, etag } = await readJsonWithEtagSigned(DATA_KEY);
    const state = data || { records: {} };
    if (!state.records) state.records = {};
    const stop = mutate(state); // mutate 返回 truthy 表示业务校验失败，直接终止
    if (stop) return stop;
    const r = await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
    if (r.ok) return null;
  }
  return json({ error: '写入冲突，请重试' }, 409);
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  const body = await parseBody(request);
  if (!body) return json({ error: '请求体不是合法 JSON' }, 400);

  try {
    const who = verifyUserToken(String(body.token || ''));
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    const username = who.username;
    const action = body.action;

    // ── 打卡 ──
    if (action === 'checkin') {
      const date = String(body.date || '');
      let minutes = Math.round(Number(body.minutes) || 0);
      const note = String(body.note || '').slice(0, 100);
      if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);
      if (date > todayStr(1)) return json({ error: '不能对未来日期打卡' }, 400); // 容忍 1 天时区差
      if (minutes <= 0) return json({ error: '学习时长需大于 0 分钟' }, 400);
      if (minutes > 720) minutes = 720; // 单日上限 12 小时，防刷

      let result = null;
      const err = await saveWithRetry((state) => {
        const rec = state.records[username] || (state.records[username] = { days: {} });
        if (!rec.days) rec.days = {};
        const day = rec.days[date] || (rec.days[date] = { minutes: 0, count: 0, note: '' });
        day.minutes = (Number(day.minutes) || 0) + minutes;
        day.count = (Number(day.count) || 0) + 1;
        day.note = note || day.note;
        day.at = Date.now();
        result = { date, minutes: day.minutes, count: day.count };
        return null;
      });
      if (err) return err;

      const { data } = await readJsonWithEtagSigned(DATA_KEY);
      const stats = calcStats((data || { records: {} }).records[username] || {});

      // 积分奖励：打卡按日去重；连续 7/30 天里程碑各计一次（失败不影响打卡结果）
      let award = null;
      try {
        const r1 = await awardPoints(username, 'checkin_daily', date);
        award = r1;
        const streak = Number(stats && stats.streak) || 0;
        if (streak >= 7) await awardPoints(username, 'streak_7', date);
        if (streak >= 30) await awardPoints(username, 'streak_30', date);
      } catch (e) { /* 积分故障不阻断打卡 */ }

      return json({ ok: true, day: result, stats, award });
    }

    // ── 记录列表 ──
    if (action === 'list') {
      const range = Math.min(Math.max(Number(body.days) || 90, 1), 366);
      const { data } = await readJsonWithEtagSigned(DATA_KEY);
      const rec = (data || { records: {} }).records[username] || { days: {} };
      const cutoff = todayStr(-range + 1);
      const days = {};
      Object.keys(rec.days || {})
        .filter((d) => d >= cutoff)
        .forEach((d) => { days[d] = rec.days[d]; });
      return json({ days, stats: calcStats(rec) });
    }

    // ── 统计 ──
    if (action === 'stats') {
      const { data } = await readJsonWithEtagSigned(DATA_KEY);
      const rec = (data || { records: {} }).records[username] || { days: {} };
      return json({ stats: calcStats(rec) });
    }

    // ── 删除某天记录（误打卡修正）──
    if (action === 'deleteDay') {
      const date = String(body.date || '');
      if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);
      let notFound = null;
      const err = await saveWithRetry((state) => {
        const rec = state.records[username];
        if (!rec || !rec.days || !rec.days[date]) {
          notFound = json({ error: '该日无打卡记录' }, 404);
          return notFound;
        }
        delete rec.days[date];
        return null;
      });
      if (err) return err;
      const { data } = await readJsonWithEtagSigned(DATA_KEY);
      const stats = calcStats((data || { records: {} }).records[username] || {});
      return json({ ok: true, stats });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
