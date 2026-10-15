// 学生用户认证 — 状态管理（Vue 响应式单例，全局 import 即共享同一份状态）
// 依赖 /api/user 云函数；token 存 localStorage（user_token_v1），
// 用户快照存 localStorage（user_snapshot_v1，用于页面加载秒开，随后以服务端 verify 校正）。
//
// 用法：
//   import { userAuth, restoreUser, loginUser, registerUser, logoutUser } from './userauth.js'
//   onMounted(() => restoreUser())   // 每个用到登录态的页面在 mounted 里恢复一次即可（内部有 ready 幂等）
//
// ⚠️ SSR 安全：所有 localStorage / fetch 访问都在函数体内，模块顶层不碰浏览器 API（VitePress 构建期会执行本模块）。
import { reactive } from 'vue'

const TOKEN_KEY = 'user_token_v1'
const SNAP_KEY = 'user_snapshot_v1'

export const userAuth = reactive({
  user: null,      // { username, displayName, createdAt } | null
  ready: false,    // 服务端校验完成（或确认未登录）
  restoring: false,
})

function ls() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function getToken() {
  return (ls() && ls().getItem(TOKEN_KEY)) || ''
}

export function isLoggedIn() {
  return !!userAuth.user
}

// ── 底层请求 ──
async function apiUser(action, extra = {}) {
  const res = await fetch('/api/user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function saveSession(token, user) {
  if (ls()) {
    ls().setItem(TOKEN_KEY, token)
    ls().setItem(SNAP_KEY, JSON.stringify(user))
  }
  userAuth.user = user
  userAuth.ready = true
}

// ── 恢复会话（onMounted 调用；快照秒开 + 服务端 verify 确认，失败则清空）──
export async function restoreUser() {
  if (userAuth.restoring) return
  const store = ls()
  const token = store && store.getItem(TOKEN_KEY)
  const snap = store && store.getItem(SNAP_KEY)
  if (snap) {
    try { userAuth.user = JSON.parse(snap) } catch { /* 忽略坏快照 */ }
  }
  if (!token) {
    userAuth.user = null
    userAuth.ready = true
    return
  }
  userAuth.restoring = true
  try {
    const data = await apiUser('verify', { token })
    userAuth.user = data.user
    if (store) store.setItem(SNAP_KEY, JSON.stringify(data.user))
    userAuth.ready = true
  } catch {
    // token 失效：清空本地态
    userAuth.user = null
    if (store) {
      store.removeItem(TOKEN_KEY)
      store.removeItem(SNAP_KEY)
    }
    userAuth.ready = true
  } finally {
    userAuth.restoring = false
  }
}

// ── 注册 ──
export async function registerUser(username, password, displayName) {
  const data = await apiUser('register', { username, password, displayName })
  saveSession(data.token, data.user)
  return data.user
}

// ── 登录 ──
export async function loginUser(username, password) {
  const data = await apiUser('login', { username, password })
  saveSession(data.token, data.user)
  return data.user
}

// ── 登出（服务端无状态，清本地即完成）──
export function logoutUser() {
  const store = ls()
  if (store) {
    store.removeItem(TOKEN_KEY)
    store.removeItem(SNAP_KEY)
  }
  userAuth.user = null
}
