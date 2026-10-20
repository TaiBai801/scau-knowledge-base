// 错题本与复习队列
// ------------------------------------------------------------------
// 方案 1.1「错题本与复习队列」+ 差异化设计「遗忘曲线提醒」：
// 做错的题看完解析就过去了，不会再见第二次 → 按间隔自动提醒。
//
// 算法用简化 SM-2：答对一次把间隔推远，答错立即归零到 1 天。
//   rightStreak 0 → 1 天（刚错，明天再见）
//   1 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天（封顶）
// 不追求严格 SM-2 的难度系数，规则简单到用户能预期。
import { KEYS, read, write } from './storage'

export const INTERVALS = [1, 2, 4, 7, 15, 30]
const DAY = 86400000

export interface WrongEntry {
  qid: string
  course: string
  code?: string
  knowledge?: string
  wrongCount: number
  rightStreak: number
  firstAt: number
  lastAt: number
  nextDueAt: number
}

type WrongMap = Record<string, WrongEntry>

function key(qid: string) {
  return String(qid)
}

export function readWrongMap(): WrongMap {
  const m = read<WrongMap>(KEYS.wrong, {})
  if (!m || typeof m !== 'object') return {}
  return m
}

export function writeWrongMap(m: WrongMap): void {
  write(KEYS.wrong, m)
}

export function listWrong(): WrongEntry[] {
  return Object.values(readWrongMap()).sort((a, b) => a.nextDueAt - b.nextDueAt)
}

/** 记录一次作答；correct=true 推进间隔，false 归零 */
export function recordAnswer(input: {
  qid: string
  course: string
  code?: string
  knowledge?: string
  correct: boolean
}): WrongEntry | null {
  const { qid, course, correct } = input
  if (!qid) return null
  const m = readWrongMap()
  const k = key(qid)
  const now = Date.now()
  const prev = m[k]

  if (correct) {
    // 答对：如果压根不在错题本里，就不需要登记
    if (!prev) return null
    prev.rightStreak = (prev.rightStreak || 0) + 1
    const idx = Math.min(prev.rightStreak - 1, INTERVALS.length - 1)
    prev.lastAt = now
    prev.nextDueAt = now + INTERVALS[idx] * DAY
    m[k] = prev
    writeWrongMap(m)
    return prev
  }

  const entry: WrongEntry = prev || {
    qid: String(qid),
    course,
    code: input.code,
    knowledge: input.knowledge,
    wrongCount: 0,
    rightStreak: 0,
    firstAt: now,
    lastAt: now,
    nextDueAt: now,
  }
  entry.course = course || entry.course
  if (input.code) entry.code = input.code
  if (input.knowledge) entry.knowledge = input.knowledge
  entry.wrongCount = (entry.wrongCount || 0) + 1
  entry.rightStreak = 0
  entry.lastAt = now
  entry.nextDueAt = now + INTERVALS[0] * DAY
  m[k] = entry
  writeWrongMap(m)
  return entry
}

/** 到期（含已过期）的错题 */
export function dueEntries(now = Date.now(), list: WrongEntry[] = listWrong()): WrongEntry[] {
  return list.filter((e) => e.nextDueAt <= now)
}

/** 未来 7 天每天到期数量，用于复习日历 */
export function dueForecast(list: WrongEntry[] = listWrong(), days = 7): Array<{ date: string; count: number }> {
  const out: Array<{ date: string; count: number }> = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const dayStart = start.getTime() + i * DAY
    const dayEnd = dayStart + DAY
    const count = list.filter(
      (e) => e.nextDueAt >= dayStart && e.nextDueAt < dayEnd
    ).length
    const d = new Date(dayStart)
    out.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      count,
    })
  }
  return out
}

export function removeWrong(qid: string): void {
  const m = readWrongMap()
  delete m[key(qid)]
  writeWrongMap(m)
}

export function clearWrong(): void {
  writeWrongMap({})
}

/**
 * 迁移 Quiz.vue 遗留的 quiz_wrong（无前缀，结构是 {题目id: 错误次数}）
 * 只在第一次进入错题本时合并一次，不删除原键（避免影响组题页的"易错题优先"）。
 */
export function migrateLegacy(): number {
  if (typeof window === 'undefined') return 0
  let legacy: Record<string, number> = {}
  try {
    legacy = JSON.parse(window.localStorage.getItem('quiz_wrong') || '{}')
  } catch {
    return 0
  }
  const ids = Object.keys(legacy || {})
  if (!ids.length) return 0

  const m = readWrongMap()
  const now = Date.now()
  let added = 0
  for (const qid of ids) {
    if (m[qid]) continue
    const n = Number(legacy[qid]) || 1
    m[qid] = {
      qid,
      course: '', // 组卷历史里没有课程信息，进入错题本后再从题库反查
      wrongCount: n,
      rightStreak: 0,
      firstAt: now,
      lastAt: now,
      // 历史错题统一视为"今天到期"，让用户第一次进来就有一批可复习的
      nextDueAt: now,
    }
    added++
  }
  if (added) writeWrongMap(m)
  return added
}

export interface WrongStats {
  total: number
  due: number
  courses: number
  totalWrongs: number
  mastered: number
}

export function wrongStats(list: WrongEntry[] = listWrong(), now = Date.now()): WrongStats {
  const courses = new Set(list.map((e) => e.course).filter(Boolean))
  return {
    total: list.length,
    due: list.filter((e) => e.nextDueAt <= now).length,
    courses: courses.size,
    totalWrongs: list.reduce((s, e) => s + (e.wrongCount || 0), 0),
    // 连续答对 3 次以上视为已掌握
    mastered: list.filter((e) => (e.rightStreak || 0) >= 3).length,
  }
}
