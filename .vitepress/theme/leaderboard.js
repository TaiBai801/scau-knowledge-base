// 排行榜上报 — 客户端契约模块
// 依赖 /api/leaderboard 云函数；服务端按 `username|date` 幂等去重（重复上报取较大分钟数，不累加）。
//
// ── 契约 ─────────────────────────────────────────────────────────────────
// reportCheckin({ token, date, minutes, streak? }) → Promise<ReportResult>
//   入参：
//     token   string  学生登录令牌（userauth.getToken() 获取；身份由服务端从 token 解出）
//     date    string  打卡日期 'YYYY-MM-DD'（客户端本地日期，与 /api/checkin 传入的一致）
//     minutes number  当日累计学习分钟数（取 /api/checkin 返回的 day.minutes）
//     streak  number? 可选，连续天数快照（取 /api/checkin 返回的 stats.streak）
//   返回（正常）：
//     { ok: true, accepted: true, open: false, rank: null, message: '…' }
//     · open=false 表示排行榜页面暂未开放；rank 预留为 null（榜页实装后返回名次）
//   返回（异常）：抛 Error（HTTP 非 200，message 为服务端 error 文案）
//
// ── 调用时机（务必遵守）───────────────────────────────────────────────────
//   1. 仅在 /api/checkin 打卡【成功返回后】调用一次；
//   2. fire-and-forget：不 await 阻塞打卡结果渲染，结果只用于展示上报状态小标；
//   3. 失败静默重试 1 次，再失败即放弃（不影响打卡本身，UI 降级为灰字提示）；
//   4. 服务端幂等，重试/重复调用无副作用。
// ──────────────────────────────────────────────────────────────────────────

const RETRY = 1 // 失败重试次数

export async function reportCheckin({ token, date, minutes, streak }) {
  if (!token) throw new Error('未登录，无法上报排行榜')

  const doFetch = () =>
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'report', token, date, minutes, streak }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `上报失败（${res.status}）`)
      return data // { ok, accepted, open, rank, message }
    })

  let lastErr = null
  for (let i = 0; i <= RETRY; i++) {
    try {
      return await doFetch()
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}
