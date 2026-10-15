// EdgeOne Pages 云函数 — 学习排行榜（上报 / 查询）
// 路由: /api/leaderboard
// ⚠️ 本函数仅实现「接口契约 + 占位逻辑」：接收并按 (username, date) 幂等保存上报数据，
//    排行榜页面与榜单聚合展示【暂不实现】，待后续迭代。数据存 COS data/leaderboard.json。
//
// ── 接口契约 ─────────────────────────────────────────────────────────────
// 上报（打卡成功后由前端 leaderboard.js 自动调用一次）：
//   POST { action: 'report', token, date: 'YYYY-MM-DD', minutes: number, streak?: number }
//        → 200 { ok: true, accepted: true, open: false, rank: null,
//               message: '排行榜暂未开放，本次打卡数据已接收保存' }
//        → 401 { error: '未登录或登录已过期' }（token 无效/过期）
//   入参说明：
//     token   学生登录令牌（/api/user 签发；身份从 token 解出，不信任 body 里的用户名）
//     date    打卡日期，客户端本地日期字符串
//     minutes 当日累计学习分钟数（与 /api/checkin 返回的 day.minutes 一致）
//     streak  可选，打卡返回的连续天数快照（仅存档，榜单以服务端数据为准）
//   幂等性：服务端按 `username|date` 去重——同 key 重复上报时取 minutes 较大值覆盖，
//           不累加；因此前端重试/重复调用均无副作用。
//   调用时机（前端约定）：/api/checkin 返回 ok 后 fire-and-forget 调用一次，
//           不阻塞打卡结果渲染；失败静默重试 1 次后放弃。
//
// 查询（预留，排行榜页面建设中）：
//   POST { action: 'query', token, scope?: 'week'|'total', limit?: number }
//        → 200 { ok: true, open: false, board: [], message: '排行榜页面建设中，敬请期待' }
// ──────────────────────────────────────────────────────────────────────────
import { readJsonWithEtagSigned, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyUserToken, rateLimit, json, parseBody } from './_userauth.js';

const DATA_KEY = 'data/leaderboard.json';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORTS = 2000; // 上报存档上限，超出按时间淘汰最旧

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  const body = await parseBody(request);
  if (!body) return json({ error: '请求体不是合法 JSON' }, 400);

  const ip = (request.headers.get('x-forwarded-for') || '0.0.0.0').split(',')[0].trim();

  try {
    const who = verifyUserToken(String(body.token || ''));
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    const username = who.username;
    const action = body.action;

    // ── 上报（占位实现：校验 + 幂等存档）──
    if (action === 'report') {
      if (!rateLimit('report:' + ip, 30, 60_000)) return json({ error: '上报过于频繁' }, 429);
      const date = String(body.date || '');
      const minutes = Math.round(Number(body.minutes) || 0);
      const streak = Math.max(0, Math.round(Number(body.streak) || 0));
      if (!DATE_RE.test(date)) return json({ error: '日期格式不正确' }, 400);
      if (minutes <= 0 || minutes > 720) return json({ error: '分钟数不合法' }, 400);

      const key = username + '|' + date;
      const { data, etag } = await readJsonWithEtagSigned(DATA_KEY);
      const state = data || { open: false, reports: {} };
      if (!state.reports) state.reports = {};
      const old = state.reports[key];
      state.reports[key] = {
        username,
        date,
        minutes: old ? Math.max(old.minutes || 0, minutes) : minutes, // 幂等：取较大值
        streak: old ? Math.max(old.streak || 0, streak) : streak,
        at: Date.now(),
      };
      // 容量淘汰：超上限删最旧
      const keys = Object.keys(state.reports);
      if (keys.length > MAX_REPORTS) {
        keys.sort((a, b) => state.reports[a].at - state.reports[b].at);
        for (let i = 0; i < keys.length - MAX_REPORTS; i++) delete state.reports[keys[i]];
      }
      const r = await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
      if (!r.ok) {
        // 并发冲突：重读重放一次（幂等设计下重放安全）
        const { data: d2, etag: e2 } = await readJsonWithEtagSigned(DATA_KEY);
        const s2 = d2 || { open: false, reports: {} };
        if (!s2.reports) s2.reports = {};
        const o2 = s2.reports[key];
        s2.reports[key] = {
          username, date,
          minutes: o2 ? Math.max(o2.minutes || 0, minutes) : minutes,
          streak: o2 ? Math.max(o2.streak || 0, streak) : streak,
          at: Date.now(),
        };
        const r2 = await writeJsonIfMatch(DATA_KEY, s2, e2, 'private');
        if (!r2.ok) return json({ error: '写入冲突，请重试', status: r2.status }, 409);
      }
      return json({ ok: true, accepted: true, open: false, rank: null, message: '排行榜暂未开放，本次打卡数据已接收保存' });
    }

    // ── 查询（预留：排行榜页面建设中，恒返回空榜与 open:false）──
    if (action === 'query') {
      return json({ ok: true, open: false, board: [], message: '排行榜页面建设中，敬请期待' });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
