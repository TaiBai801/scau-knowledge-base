// 本地存储统一封装
// ------------------------------------------------------------------
// 方案 1.3 的四条原则之一「可退出」：所有个人数据一键导出 JSON。
// 为此所有键统一加 kx_ 前缀，导出时按前缀打包，不与第三方键混在一起。
//
// SSR 安全：所有读写都先判断 typeof window，服务端渲染期间返回默认值，
// 否则 VitePress 构建会直接抛 ReferenceError。

export const PREFIX = 'kx_'

export const KEYS = {
  focus: 'kx_focus_v1', // 专注单元
  foot: 'kx_foot_v1', // 学习足迹
  todo: 'kx_todo_v1', // 待办
  notes: 'kx_notes_v1', // 课程笔记
  cards: 'kx_cards_v1', // 概念卡三态
  wrong: 'kx_wrong_v2', // 错题本（含复习计划）
  sprint: 'kx_sprint_v1', // 冲刺包勾选状态
} as const

function hasWindow(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function read<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function write<T>(key: string, value: T): boolean {
  if (!hasWindow()) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // 配额满或被禁用：静默失败，不打断用户操作
    return false
  }
}

export function remove(key: string): void {
  if (!hasWindow()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** 收集所有 kx_ 前缀的键值，用于导出 */
export function readAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!hasWindow()) return out
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k || k.indexOf(PREFIX) !== 0) continue
      try {
        out[k] = JSON.parse(window.localStorage.getItem(k) || 'null')
      } catch {
        out[k] = window.localStorage.getItem(k)
      }
    }
  } catch {
    /* noop */
  }
  return out
}

export interface ExportBundle {
  exportedAt: string
  app: string
  schemaVersion: number
  data: Record<string, unknown>
}

export function buildExportBundle(): ExportBundle {
  return {
    exportedAt: new Date().toISOString(),
    app: '机电专业知识库',
    schemaVersion: 1,
    data: readAll(),
  }
}

/** 触发浏览器下载一份 JSON */
export function downloadJson(filename: string, payload: unknown): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface StorageInfo {
  keys: number
  bytes: number
  items: Array<{ key: string; bytes: number }>
}

export function storageInfo(): StorageInfo {
  if (!hasWindow()) return { keys: 0, bytes: 0, items: [] }
  const items: Array<{ key: string; bytes: number }> = []
  let bytes = 0
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k || k.indexOf(PREFIX) !== 0) continue
      const v = window.localStorage.getItem(k) || ''
      const b = (k.length + v.length) * 2 // UTF-16 近似
      bytes += b
      items.push({ key: k, bytes: b })
    }
  } catch {
    /* noop */
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { keys: items.length, bytes, items }
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

/** 清空所有 kx_ 前缀数据（危险操作，调用方需二次确认） */
export function clearAll(): number {
  if (!hasWindow()) return 0
  const keys: string[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.indexOf(PREFIX) === 0) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* noop */
  }
  return keys.length
}

/** 日期工具：本地时区的 YYYY-MM-DD（与打卡/周报的"自然日"口径一致） */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + n)
  return x
}

/** 本周一 00:00（自然周，周一为起点） */
export function startOfWeek(d: Date = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 周一=0
  x.setDate(x.getDate() - dow)
  return x
}
