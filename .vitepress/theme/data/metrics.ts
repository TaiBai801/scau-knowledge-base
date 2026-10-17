// 构建期指标快照（由 scripts/site-metrics.mjs 生成，随构建发布）
// 只读：这里的数字来自仓库，构建时即已确定，运行时不刷新
import snapshot from '../../../data/site-metrics.json'

export interface CourseMetrics {
  planEntries: number
  planEntriesSource: string
  uniqueCodes: number
  names: number
  pages: number
  detailPages: number
  sharedPages: number
  clusters: number
}

export interface SiteMetricsShape {
  schemaVersion: number
  generatedAt: string
  contentHash: string
  warnings: string[]
  courses: CourseMetrics
  site: {
    majors: number
    grades: number
    semesterPages: number
    overviewPages: number
    stories: number
    changelogReleases: number
    gradesByMajor: Record<string, number[]>
  }
  content: {
    syllabus: { courses: number; units: number; points: number }
    bank: { courses: number; questions: number }
    materials: { courses: number; items: number }
    contributors: { count: number; contributions: number }
  }
  yearPlans: Array<{
    slug: string
    major: string
    year: number
    courseCount: number
    credits?: number | null
    hours?: number | null
    semesterCourseCounts?: number[]
  }>
  seed: {
    traffic: TrafficBlock
    students: { registered: number }
    checkins: CheckinBlock
    materials: { courses: number; items: number }
    bank: { courses: number; questions: number }
    contributors: { count: number; contributions: number }
  }
}

export interface TrafficPair {
  visits: number
  downloads: number
}
export interface TrafficBlock {
  today: TrafficPair
  week: TrafficPair
  month: TrafficPair
  total: TrafficPair
}
export interface CheckinBlock {
  participants: number
  days: number
  minutes: number
  last7: number
  today: number
}

export const SNAPSHOT = snapshot as unknown as SiteMetricsShape

/** 运行时可变指标：这些 key 由 /api/overview 刷新，构建期只提供兜底值 */
export const LIVE_PREFIXES = [
  'content.bank.',
  'content.materials.',
  'content.contributors.',
  'traffic.',
  'students.',
  'checkins.',
] as const

export function isLiveKey(key: string): boolean {
  return LIVE_PREFIXES.some((p) => key.startsWith(p))
}

/** 按点路径取值，取不到返回 null */
export function getByPath(obj: any, path: string): number | null {
  let cur = obj
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null
    cur = cur[seg]
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null
}

/** 从快照取静态指标（live key 也能取到构建期兜底值） */
export function getStatic(key: string): number | null {
  return getByPath(SNAPSHOT, key)
}

/** 数字格式化：plus → 346+；comma → 4,248 */
export function formatMetric(value: number, format?: string): string {
  if (format === 'plus') return `${value}+`
  if (format === 'comma') return value.toLocaleString('en-US')
  return String(value)
}
