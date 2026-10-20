// 学习足迹
// ------------------------------------------------------------------
// 方案 1.1「学习足迹」：看过什么、下过什么，换设备就归零 → 记录在本地。
// 差异化设计「学期学习地图」：期末生成一页"这学期我在平台上的轨迹"（时长、
// 课程数、做题量），可截图分享，不暴露分数。
//
// 只在用户自己的浏览器里记录，不上传、不排名。
import { KEYS, read, write, todayISO } from './storage'

export type FootprintKind = 'view' | 'download' | 'quiz' | 'focus' | 'note' | 'card'

export const KIND_LABEL: Record<FootprintKind, string> = {
  view: '浏览课程',
  download: '下载资料',
  quiz: '完成组卷',
  focus: '专注单元',
  note: '记了笔记',
  card: '自测卡片',
}

export interface FootprintEvent {
  ts: number
  date: string // 本地自然日 YYYY-MM-DD
  kind: FootprintKind
  course?: string
  code?: string
  ref?: string // 资料名 / 题号 / 章节
  n?: number // 数量语义：做题数、专注分钟
}

const MAX_EVENTS = 3000

export function readFootprint(): FootprintEvent[] {
  const list = read<FootprintEvent[]>(KEYS.foot, [])
  return Array.isArray(list) ? list : []
}

export function trackFootprint(e: Omit<FootprintEvent, 'ts' | 'date'>): void {
  try {
    const list = readFootprint()
    list.push({ ...e, ts: Date.now(), date: todayISO() })
    // 超出上限时丢最早的，避免 localStorage 无限膨胀
    const trimmed = list.length > MAX_EVENTS ? list.slice(list.length - MAX_EVENTS) : list
    write(KEYS.foot, trimmed)
  } catch {
    /* 埋点失败绝不能影响主流程 */
  }
}

/** 同一页面短时间重复进入只记一次（默认 5 分钟内去重） */
export function trackView(course: string, code?: string, dedupeMs = 5 * 60 * 1000): void {
  const list = readFootprint()
  const last = list.filter((e) => e.kind === 'view' && e.course === course).pop()
  if (last && Date.now() - last.ts < dedupeMs) return
  trackFootprint({ kind: 'view', course, code })
}

export interface FootprintSummary {
  total: number
  byKind: Record<FootprintKind, number>
  courses: number
  quizQuestions: number
  focusMinutes: number
  focusUnits: number
  days: number
  byDate: Record<string, number>
  courseList: Array<{ course: string; code?: string; count: number; lastAt: number }>
}

export function summarizeFootprint(
  events: FootprintEvent[] = readFootprint(),
  sinceTs = 0
): FootprintSummary {
  const byKind = { view: 0, download: 0, quiz: 0, focus: 0, note: 0, card: 0 } as Record<
    FootprintKind,
    number
  >
  const byDate: Record<string, number> = {}
  const courseMap = new Map<string, { course: string; code?: string; count: number; lastAt: number }>()
  let quizQuestions = 0
  let focusMinutes = 0
  let focusUnits = 0

  for (const e of events) {
    if (e.ts < sinceTs) continue
    if (byKind[e.kind] == null) continue
    byKind[e.kind] += 1
    byDate[e.date] = (byDate[e.date] || 0) + 1
    if (e.kind === 'quiz') quizQuestions += Number(e.n) || 0
    if (e.kind === 'focus') {
      focusUnits += 1
      focusMinutes += Number(e.n) || 0
    }
    if (e.course) {
      const cur = courseMap.get(e.course)
      if (cur) {
        cur.count += 1
        cur.lastAt = Math.max(cur.lastAt, e.ts)
      } else {
        courseMap.set(e.course, {
          course: e.course,
          code: e.code,
          count: 1,
          lastAt: e.ts,
        })
      }
    }
  }

  const courseList = [...courseMap.values()].sort((a, b) => b.lastAt - a.lastAt)
  return {
    total: Object.values(byKind).reduce((s, v) => s + v, 0),
    byKind,
    courses: courseMap.size,
    quizQuestions,
    focusMinutes,
    focusUnits,
    days: Object.keys(byDate).length,
    byDate,
    courseList,
  }
}

/** 学期起始时间：默认按 9 月 1 日算本学期（可被调用方覆盖） */
export function semesterStart(now = new Date()): number {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(y, 8, 1).getTime()
}
