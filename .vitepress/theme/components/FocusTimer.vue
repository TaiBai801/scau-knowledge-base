<script setup>
// 番茄钟 —— 25 分钟一个「专注单元」
// ------------------------------------------------------------------
// 方案 1.2 一 + 1.5：只存本地、不做排名；可累加、可中断、不清零。
// 两种形态：variant="floating" 右下角悬浮球；variant="inline" 页面内联卡片。
//
// SSR：setup 顶层不碰 window / localStorage / AudioContext，
// 全部初始化放在 onMounted，服务端只渲染静态骨架。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KEYS, read, write, remove, todayISO } from '../lib/storage'
import { trackFootprint } from '../lib/footprint'

const props = defineProps({
  // floating：悬浮球；inline：页面内联卡片
  variant: { type: String, default: 'floating' },
})

const MAX_RECORDS = 2000
const SESSION_KEY = 'kx_focus_session_v1'
// 同页可能同时存在悬浮球和专注页的内联卡片：记一笔后互相通知刷新
const FOCUS_EVENT = 'kx-focus-updated'
const PRESETS = [15, 25, 45]
const NOISE_OPTIONS = [
  { value: 'off', label: '🔇 关闭' },
  { value: 'rain', label: '🌧️ 雨声' },
  { value: 'fire', label: '🔥 篝火' },
  { value: 'white', label: '📻 白噪音' },
  { value: 'brown', label: '〰️ 棕噪音' },
]

// 状态机：idle → running → paused → done（paused 可回到 running，done 可回 idle）
const state = ref('idle')
const plannedMin = ref(25)
const remainingMs = ref(25 * 60 * 1000)
const accumulatedMs = ref(0) // 本轮已累计的专注毫秒（暂停不清零）
const open = ref(false)
const notice = ref('')
const breakHint = ref(false)
const totalMinutes = ref(0)
const totalUnits = ref(0)
const customMin = ref(30)
const customError = ref('')

const noise = ref('off') // off | white | brown | rain | fire
const volume = ref(40)

let ticker = null
let runStartAt = 0 // 本次「继续」的时刻
let sessionStartAt = 0 // 本轮第一次开始
let audioCtx = null
let noiseSrc = null
let noiseSrc2 = null // 篝火需要两个声源：低频火苗隆隆声 + 高频爆裂声
let filter1 = null
let filter2 = null
let gainNode = null

const running = computed(() => state.value === 'running')
const paused = computed(() => state.value === 'paused')
const done = computed(() => state.value === 'done')
const idle = computed(() => state.value === 'idle')

const display = computed(() => fmt(remainingMs.value))

const progress = computed(() => {
  const total = plannedMin.value * 60 * 1000
  if (!total) return 0
  return Math.min(100, Math.max(0, ((total - remainingMs.value) / total) * 100))
})

const primaryLabel = computed(() => {
  if (running.value) return '专注中'
  if (paused.value) return '继续'
  if (done.value) return '再来一轮'
  return '开始'
})

const statusText = computed(() => {
  if (running.value) return `专注中 · 还剩 ${display.value}`
  if (paused.value) return '已暂停 —— 进度留着，不会清零'
  if (done.value) return '本轮完成'
  return `准备开始 ${plannedMin.value} 分钟`
})

// ── 时间工具 ───────────────────────────────────────────────
function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function elapsedNow() {
  return accumulatedMs.value + (running.value ? Date.now() - runStartAt : 0)
}

function remainingNow() {
  return Math.max(0, plannedMin.value * 60 * 1000 - elapsedNow())
}

// 用时间戳差值算剩余，不累加 tick —— 切后台 / 息屏回来仍然准
function tick() {
  remainingMs.value = remainingNow()
  if (running.value && remainingMs.value <= 0) complete()
}

function ensureTicker() {
  clearTicker()
  ticker = window.setInterval(tick, 1000)
}

function clearTicker() {
  if (ticker) {
    window.clearInterval(ticker)
    ticker = null
  }
}

// ── 记录 ───────────────────────────────────────────────────
function readUnits() {
  const raw = read(KEYS.focus, { units: [] })
  const list = raw && Array.isArray(raw.units) ? raw.units : []
  return list.filter((u) => u && Number.isFinite(Number(u.minutes)) && Number(u.minutes) > 0)
}

function loadTotals() {
  const list = readUnits()
  totalUnits.value = list.length
  totalMinutes.value = list.reduce((s, u) => s + (Number(u.minutes) || 0), 0)
}

function record(minutes, mode) {
  const list = readUnits()
  list.push({ ts: Date.now(), date: todayISO(), minutes, mode })
  const trimmed = list.length > MAX_RECORDS ? list.slice(list.length - MAX_RECORDS) : list
  write(KEYS.focus, { units: trimmed })
  totalUnits.value = trimmed.length
  totalMinutes.value = trimmed.reduce((s, u) => s + (Number(u.minutes) || 0), 0)
  try {
    trackFootprint({ kind: 'focus', n: minutes })
  } catch {
    /* 埋点失败不影响计时 */
  }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(FOCUS_EVENT))
    } catch {
      /* noop */
    }
  }
}

// ── 会话持久化：关页 / 刷新后还能接上 ──────────────────────
function persistSession() {
  if (idle.value || done.value) return
  write(SESSION_KEY, {
    startAt: sessionStartAt || Date.now(),
    plannedMin: plannedMin.value,
    accumulatedMs: elapsedNow(),
    state: state.value,
    savedAt: Date.now(),
  })
}

function clearSession() {
  remove(SESSION_KEY)
}

function restoreSession() {
  const s = read(SESSION_KEY, null)
  if (!s || !Number(s.plannedMin)) return
  // 超过 12 小时的会话视为过期，避免第二天打开还弹「已恢复」
  if (Date.now() - (Number(s.savedAt) || 0) > 12 * 60 * 60 * 1000) {
    clearSession()
    return
  }
  const mins = Math.min(180, Math.max(1, Math.round(Number(s.plannedMin))))
  plannedMin.value = mins
  sessionStartAt = Number(s.startAt) || Date.now()
  let elapsed = Number(s.accumulatedMs) || 0
  // 上次是运行中被强退：把离开后的时间也算进去（最多算到本轮结束）
  if (s.state === 'running') elapsed += Math.max(0, Date.now() - (Number(s.savedAt) || Date.now()))
  accumulatedMs.value = Math.min(elapsed, mins * 60 * 1000)
  remainingMs.value = Math.max(0, mins * 60 * 1000 - accumulatedMs.value)
  state.value = 'paused'
  notice.value = '检测到上次未结束的专注，已恢复。'
}

// ── 控制 ───────────────────────────────────────────────────
function start() {
  if (running.value) return
  notice.value = ''
  breakHint.value = false
  if (idle.value || done.value) {
    accumulatedMs.value = 0
    sessionStartAt = Date.now()
    remainingMs.value = plannedMin.value * 60 * 1000
  }
  runStartAt = Date.now()
  state.value = 'running'
  persistSession()
  ensureTicker()
  tick()
  if (noise.value !== 'off') startNoise()
}

function pause() {
  if (!running.value) return
  accumulatedMs.value = elapsedNow()
  state.value = 'paused'
  remainingMs.value = remainingNow()
  clearTicker()
  stopNoise()
  persistSession()
}

function resetTimer(keepNotice = false) {
  clearTicker()
  state.value = 'idle'
  accumulatedMs.value = 0
  remainingMs.value = plannedMin.value * 60 * 1000
  breakHint.value = false
  customError.value = ''
  clearSession()
  if (!keepNotice) notice.value = ''
}

// 自然走完：整轮计入，提示休息
function complete() {
  clearTicker()
  stopNoise()
  clearSession()
  const minutes = plannedMin.value
  record(minutes, minutes === 25 ? 'pomodoro' : 'custom')
  accumulatedMs.value = minutes * 60 * 1000
  remainingMs.value = 0
  state.value = 'done'
  breakHint.value = minutes >= 25
  notice.value = `完成一轮，记入 ${minutes} 分钟，累计 ${totalMinutes.value} 分钟。`
}

// 手动结束：按实际专注分钟数记一条，中断不清零
function finish() {
  if (idle.value || done.value) return
  const elapsed = elapsedNow()
  const natural = elapsed >= plannedMin.value * 60 * 1000 - 800
  const minutes = natural ? plannedMin.value : Math.floor(elapsed / 60000)
  clearTicker()
  stopNoise()
  clearSession()

  if (minutes >= 1) {
    record(minutes, natural ? (minutes === 25 ? 'pomodoro' : 'custom') : 'interrupt')
    notice.value = `本次记入 ${minutes} 分钟，累计 ${totalMinutes.value} 分钟。`
  } else {
    notice.value = '不足 1 分钟，本次不计入 —— 已累计的记录不会被清零。'
  }

  if (natural) {
    accumulatedMs.value = plannedMin.value * 60 * 1000
    remainingMs.value = 0
    state.value = 'done'
    breakHint.value = minutes >= 25
  } else {
    resetTimer(true)
  }
}

function onPrimary() {
  if (running.value) return
  if (done.value) {
    resetTimer()
    start()
    return
  }
  start()
}

function setPreset(mins) {
  if (running.value || paused.value) return
  plannedMin.value = mins
  remainingMs.value = mins * 60 * 1000
  state.value = 'idle'
  accumulatedMs.value = 0
  notice.value = ''
  breakHint.value = false
}

function applyCustom() {
  if (running.value || paused.value) return
  const n = Number(customMin.value)
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1 || n > 120) {
    customError.value = '请输入 1–120 之间的整数分钟'
    return
  }
  customError.value = ''
  setPreset(n)
}

// ── 白噪音：Web Audio API 现场生成，不下载音频文件 ────────
function ensureAudio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) {
    try {
      audioCtx = new AC()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function stopNoise() {
  ;[noiseSrc, noiseSrc2].forEach(function (s) {
    if (s) {
      try {
        s.stop()
        s.disconnect()
      } catch {
        /* noop */
      }
    }
  })
  noiseSrc = null
  noiseSrc2 = null
  ;[filter1, filter2].forEach(function (f) {
    if (f) {
      try {
        f.disconnect()
      } catch {
        /* noop */
      }
    }
  })
  filter1 = null
  filter2 = null
  if (gainNode) {
    try {
      gainNode.disconnect()
    } catch {
      /* noop */
    }
    gainNode = null
  }
}

// 各音色的基础响度（× 音量滑块），手调到听感接近
function baseLevel(type) {
  return { white: 0.25, brown: 0.3, rain: 0.42, fire: 0.38 }[type] || 0.3
}

function makeBuffer(ctx, len, fill) {
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
  fill(buffer.getChannelData(0))
  return buffer
}

// 循环接缝保护：瞬态只落在中间区域，两端留边距
function safeZone(ctx, len) {
  const edge = Math.floor(ctx.sampleRate * 0.09)
  return [edge, len - edge]
}

function startNoise() {
  if (noise.value === 'off') return
  const ctx = ensureAudio()
  if (!ctx) return
  stopNoise()

  const len = Math.floor(ctx.sampleRate * 2)
  const type = noise.value
  gainNode = ctx.createGain()
  gainNode.gain.value = (volume.value / 100) * baseLevel(type)
  gainNode.connect(ctx.destination)

  if (type === 'white' || type === 'brown') {
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    if (type === 'brown') {
      // 棕噪音：白噪音做一阶积分，低频更重、听感更闷
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = buffer
    noiseSrc.loop = true
    noiseSrc.connect(gainNode)
    noiseSrc.start()
    return
  }

  if (type === 'rain') {
    // 雨声 = 连绵的宽带噪声底（高通+低通收掉隆隆声与刺耳段）+ 随机雨滴瞬态。
    // 雨滴只落在循环安全区内，接缝处不会出现被切断的滴答声。
    noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = makeBuffer(ctx, len, function (data) {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      const [from, to] = safeZone(ctx, len)
      const drops = Math.floor((len / ctx.sampleRate) * 46)
      for (let d = 0; d < drops; d++) {
        const at = from + Math.floor(Math.random() * (to - from))
        const amp = 0.2 + Math.random() * 0.8
        const decay = 40 + Math.floor(Math.random() * 110)
        for (let j = 0; j < decay && at + j < to; j++) {
          data[at + j] += (Math.random() * 2 - 1) * amp * Math.pow(1 - j / decay, 2)
        }
      }
    })
    noiseSrc.loop = true
    filter1 = ctx.createBiquadFilter()
    filter1.type = 'highpass'
    filter1.frequency.value = 340
    filter2 = ctx.createBiquadFilter()
    filter2.type = 'lowpass'
    filter2.frequency.value = 5200
    noiseSrc.connect(filter1)
    filter1.connect(filter2)
    filter2.connect(gainNode)
    noiseSrc.start()
    return
  }

  if (type === 'fire') {
    // 篝火 = 低频火苗隆隆声（棕噪 + 低通）+ 高频噼啪爆裂声（稀疏尖峰簇）。
    // 两个声源分开建链，爆裂声不会被低通滤掉。
    const [from, to] = safeZone(ctx, len)

    noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = makeBuffer(ctx, len, function (data) {
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
    })
    noiseSrc.loop = true
    filter1 = ctx.createBiquadFilter()
    filter1.type = 'lowpass'
    filter1.frequency.value = 320
    noiseSrc.connect(filter1)
    filter1.connect(gainNode)
    noiseSrc.start()

    noiseSrc2 = ctx.createBufferSource()
    noiseSrc2.buffer = makeBuffer(ctx, len, function (data) {
      const bursts = Math.floor((len / ctx.sampleRate) * 13)
      for (let b = 0; b < bursts; b++) {
        const at = from + Math.floor(Math.random() * (to - from))
        const amp = 0.3 + Math.random() * 0.7
        const decay = 60 + Math.floor(Math.random() * 220)
        for (let j = 0; j < decay && at + j < to; j++) {
          data[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (decay / 3))
        }
      }
    })
    noiseSrc2.loop = true
    filter2 = ctx.createBiquadFilter()
    filter2.type = 'highpass'
    filter2.frequency.value = 1500
    noiseSrc2.connect(filter2)
    filter2.connect(gainNode)
    noiseSrc2.start()
  }
}

function setNoise(value) {
  noise.value = value
  if (value === 'off') {
    stopNoise()
    return
  }
  // AudioContext 必须在用户点击后再创建；这里正是点击回调
  startNoise()
}

function applyVolume(e) {
  const v = Number(e && e.target ? e.target.value : volume.value)
  if (gainNode) gainNode.gain.value = (Math.max(0, Math.min(100, v)) / 100) * baseLevel(noise.value)
}

// ── 页面可见性：回来重新校准，离开时停掉声音 ──────────────
function onVisibility() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    stopNoise()
    return
  }
  tick()
  if (running.value && noise.value !== 'off') startNoise()
}

onMounted(() => {
  loadTotals()
  restoreSession()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener(FOCUS_EVENT, loadTotals)
})

onBeforeUnmount(() => {
  // 页面内跳转也把当前进度落盘，回来能接上
  if (running.value || paused.value) persistSession()
  clearTicker()
  stopNoise()
  if (audioCtx) {
    try {
      audioCtx.close()
    } catch {
      /* noop */
    }
    audioCtx = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener(FOCUS_EVENT, loadTotals)
  }
})
</script>

<template>
  <div :class="['ft', variant === 'floating' ? 'ft--floating' : 'ft--inline']">
    <!-- 悬浮形态：收起时是一颗球 -->
    <button
      v-if="variant === 'floating' && !open"
      type="button"
      class="ft-ball"
      :class="{ 'is-running': running, 'is-paused': paused }"
      aria-label="打开番茄钟"
      @click="open = true"
    >
      <span class="ft-ball-time">{{ display }}</span>
      <span class="ft-ball-label">{{ running ? '专注中' : paused ? '已暂停' : '番茄钟' }}</span>
    </button>

    <div v-if="variant === 'inline' || open" class="ft-card">
      <div class="ft-head">
        <div class="ft-head-text">
          <strong>专注计时</strong>
          <span class="ft-sub">只记给你自己看</span>
        </div>
        <button
          v-if="variant === 'floating'"
          type="button"
          class="ft-close"
          aria-label="收起番茄钟"
          @click="open = false"
        >
          收起
        </button>
      </div>

      <div class="ft-time">{{ display }}</div>
      <div class="ft-bar"><span :style="{ width: progress + '%' }"></span></div>
      <p class="ft-status">{{ statusText }}</p>

      <div class="ft-presets">
        <button
          v-for="m in PRESETS"
          :key="m"
          type="button"
          class="ft-chip"
          :class="{ on: plannedMin === m }"
          :disabled="running || paused"
          :aria-pressed="plannedMin === m"
          @click="setPreset(m)"
        >
          {{ m }} 分钟
        </button>
      </div>

      <div class="ft-custom">
        <input
          v-model.number="customMin"
          class="ft-input"
          type="number"
          min="1"
          max="120"
          step="1"
          :disabled="running || paused"
          aria-label="自定义专注分钟数"
        />
        <button type="button" class="ft-chip" :disabled="running || paused" @click="applyCustom">
          自定义
        </button>
      </div>
      <p v-if="customError" class="ft-err">{{ customError }}</p>

      <div class="ft-actions">
        <button
          type="button"
          class="ft-btn ft-btn--primary"
          :disabled="running"
          @click="onPrimary"
        >
          {{ primaryLabel }}
        </button>
        <button v-if="running" type="button" class="ft-btn" @click="pause">暂停</button>
        <button v-if="!idle" type="button" class="ft-btn ft-btn--ghost" @click="finish">
          结束本轮
        </button>
      </div>

      <div class="ft-noise">
        <span class="ft-label">白噪音</span>
        <div class="ft-noise-btns">
          <button
            v-for="opt in NOISE_OPTIONS"
            :key="opt.value"
            type="button"
            class="ft-chip ft-chip--sm"
            :class="{ on: noise === opt.value }"
            :aria-pressed="noise === opt.value"
            @click="setNoise(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <input
          v-model.number="volume"
          class="ft-vol"
          type="range"
          min="0"
          max="100"
          step="5"
          :disabled="noise === 'off'"
          aria-label="白噪音音量"
          @input="applyVolume"
        />
      </div>

      <p v-if="notice" class="ft-notice">{{ notice }}</p>
      <p v-if="breakHint" class="ft-break">
        完成一轮，起来走 5 分钟吧 —— 只是提醒，不强制。
      </p>

      <p class="ft-foot">
        累计 {{ totalMinutes }} 分钟 · {{ totalUnits }} 个专注单元 · 仅存本机，不上传
      </p>
    </div>
  </div>
</template>

<style scoped>
.ft {
  font-family: var(--font-body, inherit);
}
.ft--floating {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 60;
}

/* 悬浮球 */
.ft-ball {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand, #0d5c5a), var(--brand-light));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(13, 92, 90, 0.28);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}
.ft-ball:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(13, 92, 90, 0.34);
}
.ft-ball.is-running {
  animation: ft-breathe 2.4s ease-in-out infinite;
}
.ft-ball-time {
  font-size: 0.98rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.ft-ball-label {
  margin-top: 2px;
  font-size: 0.58rem;
  opacity: 0.85;
}
@keyframes ft-breathe {
  0%,
  100% {
    box-shadow: 0 8px 22px rgba(13, 92, 90, 0.28);
  }
  50% {
    box-shadow: 0 8px 30px rgba(13, 92, 90, 0.5);
  }
}

/* 面板 / 内联卡片 */
.ft-card {
  background: var(--vp-c-bg-soft, #fff);
  border: 1px solid var(--line, #e8e4db);
  border-radius: 16px;
  padding: 18px;
  box-sizing: border-box;
}
.ft--floating .ft-card {
  width: 312px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  box-shadow: 0 18px 44px rgba(13, 30, 43, 0.18);
}
.ft-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.ft-head-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.ft-head strong {
  font-size: 0.95rem;
  color: var(--text-heading, #0d1e2b);
}
.ft-sub {
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
}
.ft-close {
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: var(--text-muted, #64748b);
  font-size: 0.72rem;
  cursor: pointer;
}
.ft-close:hover {
  color: var(--brand, #0d5c5a);
}

.ft-time {
  margin: 10px 0 8px;
  font-size: 2.9rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--brand, #0d5c5a);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-display, serif);
}
.ft--floating .ft-time {
  font-size: 2.4rem;
}
.ft-bar {
  height: 6px;
  border-radius: 99px;
  background: var(--brand-pale, #e8f4f0);
  overflow: hidden;
}
.ft-bar > span {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--brand, #0d5c5a);
  transition: width 0.5s linear;
}
.ft-status {
  margin: 8px 0 12px;
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}

.ft-presets,
.ft-custom,
.ft-noise-btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.ft-chip {
  padding: 5px 10px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 99px;
  background: transparent;
  color: var(--text-body, #4a5568);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.ft-chip:hover:not(:disabled) {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}
.ft-chip.on {
  border-color: var(--brand, #0d5c5a);
  background: var(--brand-pale, #e8f4f0);
  color: var(--brand, #0d5c5a);
  font-weight: 600;
}
.ft-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ft-chip--sm {
  padding: 4px 9px;
  font-size: 0.73rem;
}

.ft-custom {
  margin-top: 8px;
}
.ft-input {
  width: 68px;
  padding: 5px 8px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 8px;
  background: var(--vp-c-bg-soft, #fff);
  color: var(--text-body, #4a5568);
  font-size: 0.78rem;
  font-family: inherit;
  box-sizing: border-box;
}
.ft-input:disabled {
  opacity: 0.5;
}
.ft-err {
  margin: 6px 0 0;
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
}

.ft-actions {
  display: flex;
  gap: 8px;
  margin: 14px 0 12px;
  flex-wrap: wrap;
}
.ft-btn {
  flex: 1 1 auto;
  min-width: 84px;
  padding: 9px 14px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 10px;
  background: transparent;
  color: var(--text-body, #4a5568);
  font-size: 0.84rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.ft-btn:hover:not(:disabled) {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}
.ft-btn--primary {
  border-color: var(--brand, #0d5c5a);
  background: var(--brand, #0d5c5a);
  color: #fff;
}
.ft-btn--primary:hover:not(:disabled) {
  background: var(--brand-light, #148f8c);
  border-color: var(--brand-light, #148f8c);
  color: #fff;
}
.ft-btn--primary:disabled {
  opacity: 0.7;
  cursor: default;
}
.ft-btn--ghost {
  flex: 0 0 auto;
  color: var(--text-muted, #64748b);
}

.ft-noise {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 10px;
  align-items: center;
  padding-top: 10px;
  border-top: 1px dashed var(--line, #e8e4db);
}
.ft-label {
  font-size: 0.73rem;
  color: var(--text-muted, #64748b);
}
.ft-noise-btns {
  grid-column: 2;
}
.ft-vol {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: var(--brand, #0d5c5a);
  margin: 2px 0 0;
}

.ft-notice {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--brand-pale, #e8f4f0);
  color: var(--text-body, #4a5568);
  font-size: 0.76rem;
  line-height: 1.55;
}
.ft-break {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--text-muted, #64748b);
}
.ft-foot {
  margin: 12px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--line, #e8e4db);
  font-size: 0.7rem;
  color: var(--text-muted, #64748b);
}

@media (max-width: 640px) {
  .ft--floating {
    right: 12px;
    bottom: 14px;
  }
  .ft-ball {
    width: 62px;
    height: 62px;
  }
  .ft--floating .ft-card {
    width: calc(100vw - 24px);
  }
  .ft--inline .ft-card {
    padding: 14px;
  }
  .ft-time,
  .ft--floating .ft-time {
    font-size: 2.1rem;
  }
}
</style>
