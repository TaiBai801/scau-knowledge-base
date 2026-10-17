// 站点指标取值层
// ------------------------------------------------------------------
// L1 快照（打包进 bundle）—— SSR 直出，零网络，永远可用
// L2 /api/overview        —— 只补 live 指标，失败静默回退 L1
//
// 关键约束：setup 阶段绝不发请求、不读 window/localStorage，
// 否则 SSR 与客户端首帧不一致会导致 hydration 数字跳变。
import { ref, readonly } from 'vue'
import { SNAPSHOT, isLiveKey, getByPath, formatMetric } from '../data/metrics'

export interface LivePayload {
  materials: { courses: number; items: number }
  bank: { courses: number; questions: number }
  contributors: { count: number; contributions: number }
  students: { registered: number }
  checkins: { participants: number; days: number; minutes: number; last7: number; today: number }
  traffic: {
    today: { visits: number; downloads: number }
    week: { visits: number; downloads: number }
    month: { visits: number; downloads: number }
    total: { visits: number; downloads: number }
  }
  topPaths?: Array<{ path: string; visits: number }>
}

export type MetricStatus = 'seed' | 'loading' | 'live' | 'error'

// 全局一键开关：出问题时改成 false 即可整体回退到纯快照
export const LIVE_ENABLED = true

const TTL_MS = 60_000
const TIMEOUT_MS = 5_000

// 首屏值 = 快照里的 seed，SSR 与客户端完全一致，不会 tick 到 0 再跳
const seedPayload: LivePayload = {
  materials: SNAPSHOT.seed.materials,
  bank: SNAPSHOT.seed.bank,
  contributors: SNAPSHOT.seed.contributors,
  students: SNAPSHOT.seed.students,
  checkins: SNAPSHOT.seed.checkins,
  traffic: SNAPSHOT.seed.traffic,
}

// 模块级单例：多个组件共享同一次请求
const live = ref<LivePayload>(seedPayload)
const status = ref<MetricStatus>('seed')
const updatedAt = ref('')
const warnings = ref<string[]>([])

let inflight: Promise<void> | null = null
let lastAt = 0
let failCount = 0

/**
 * 取值：live key 先从云端结果取，取不到落回快照。
 * 在 template/computed 里调用可自动追踪响应式。
 */
export function getMetric(key: string): number {
  if (isLiveKey(key)) {
    // content.bank.questions → bank.questions；traffic.* / students.* / checkins.* 原样
    const sub = key.startsWith('content.') ? key.slice('content.'.length) : key
    const v = getByPath(live.value, sub)
    if (v != null) return v
  }
  const s = getByPath(SNAPSHOT, key)
  return s == null ? 0 : s
}

/** 取格式化后的字符串，如 'plus' → "346+" */
export function getMetricText(key: string, format?: string): string {
  return formatMetric(getMetric(key), format)
}

/** 某个指标当前是否已经用上云端实时值 */
export function isLive(key: string): boolean {
  return status.value === 'live' && isLiveKey(key)
}

export async function refresh(force = false): Promise<void> {
  if (typeof window === 'undefined') return // SSR 短路
  if (!LIVE_ENABLED) return
  if (!force) {
    if (Date.now() - lastAt < TTL_MS) return
    // 连续失败 3 次后停止自动重试，只允许手动 force
    if (failCount >= 3) return
  }
  if (inflight) return inflight

  status.value = 'loading'
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null

  inflight = fetch('/api/overview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'get', fresh: !!force }),
    signal: controller ? controller.signal : undefined,
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((d) => {
      if (d && d.live) {
        // 逐段合并：接口缺哪段就保留 seed 的那段
        live.value = { ...seedPayload, ...d.live }
        updatedAt.value = d.serverTime ? new Date(d.serverTime).toISOString() : ''
        warnings.value = Array.isArray(d.warnings) ? d.warnings : []
        status.value = 'live'
        failCount = 0
      } else {
        status.value = 'error'
        failCount++
      }
    })
    .catch(() => {
      // 网络失败 / 超时：保留上一份值，不弹错、不抛错
      status.value = status.value === 'live' ? 'live' : 'error'
      failCount++
    })
    .finally(() => {
      if (timer) clearTimeout(timer)
      inflight = null
      lastAt = Date.now()
    })

  return inflight
}

export function useSiteMetrics() {
  return {
    live: readonly(live),
    status: readonly(status),
    updatedAt: readonly(updatedAt),
    warnings: readonly(warnings),
    getMetric,
    getMetricText,
    isLive,
    refresh,
    generatedAt: SNAPSHOT.generatedAt,
    snapshot: SNAPSHOT,
  }
}
