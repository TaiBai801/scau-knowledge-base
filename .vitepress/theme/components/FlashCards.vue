<script setup>
// 概念卡 / 公式卡
// ------------------------------------------------------------------
// 方案 1.2「概念卡」+ 差异化设计「三态自测」：
// 翻卡后不是简单打勾，而是「秒答 / 犹豫 / 不会」三档，驱动间隔复习。
//
// 存储结构与笔记页共享（KEYS.cards）：
//   { custom: [{ id, course, front, back, tag, createdAt }],
//     states: { [cardId]: { level: 0|1|2, streak, lastAt, nextDueAt } } }
// 每次写入都是「读-改-写」，绝不整体覆盖，否则会把用户自建卡冲掉。
//
// SSR：setup 顶层不碰 window / localStorage / fetch，全部放到 onMounted，
// 服务端渲染输出骨架。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KEYS, read, write } from '../lib/storage'
import { trackFootprint } from '../lib/footprint'

const DAY = 86400000
// 秒答连对 1 次 → 2 天，2 次 → 4 天，之后 7 / 15 / 30
const GAPS = [1, 2, 4, 7, 15, 30]
const CUSTOM_COURSE = '我的笔记'
// 构建期种子：public/data/cards.json 还没同步时，退回仓库里的同一份数据
const CARD_SEEDS = import.meta.glob('../../../data/cards.json')

const loading = ref(true)
const loadError = ref('')
const courses = ref([]) // 远端卡片
const customCards = ref([]) // 用户自建卡
const states = ref({}) // cardId -> { level, streak, lastAt, nextDueAt }

const activeCourse = ref('')
const queue = ref([])
const idx = ref(0)
const flipped = ref(false)
const finished = ref(false)
const busy = ref(false)
const answered = ref(0)
const tally = ref({ sec: 0, hesitate: 0, miss: 0 })
const toast = ref('')

// ============ 数据整理 ============
const allCourses = computed(() => {
  const list = courses.value.slice()
  if (customCards.value.length) {
    list.push({ name: CUSTOM_COURSE, code: '', path: '', cards: customCards.value })
  }
  return list
})

const allCards = computed(() => allCourses.value.flatMap((c) => c.cards || []))
const activeCards = computed(() => {
  const c = allCourses.value.find((x) => x.name === activeCourse.value)
  return c ? c.cards || [] : []
})
const current = computed(() => queue.value[idx.value] || null)

function stateOf(id) {
  return states.value[id] || null
}
function isMastered(card) {
  const s = stateOf(card.id)
  return !!s && s.level === 2 && (s.streak || 0) >= 2
}
function isReviewed(card) {
  return !!stateOf(card.id)
}
function isDue(card) {
  const s = stateOf(card.id)
  return !s || !s.nextDueAt || s.nextDueAt <= Date.now()
}
function masteredCount(cards) {
  return cards.filter(isMastered).length
}
function cardGap(level, streak) {
  if (level === 0) return GAPS[0]
  if (level === 1) return GAPS[1]
  return GAPS[Math.min(streak, GAPS.length - 1)]
}

const stats = computed(() => {
  const total = allCards.value.length
  const reviewed = allCards.value.filter(isReviewed).length
  const mastered = allCards.value.filter(isMastered).length
  const due = allCards.value.filter(isDue).length
  return { total, reviewed, mastered, due }
})

const groups = computed(() =>
  allCourses.value
    .filter((c) => (c.cards || []).length)
    .map((c) => {
      const total = c.cards.length
      const mastered = masteredCount(c.cards)
      return {
        name: c.name,
        code: c.code || '',
        total,
        mastered,
        due: c.cards.filter(isDue).length,
        pct: total ? Math.round((mastered / total) * 100) : 0,
      }
    })
)

// ============ 加载 ============
function readStore() {
  const store = read(KEYS.cards, { custom: [], states: {} })
  if (!store || typeof store !== 'object') return { custom: [], states: {} }
  if (!Array.isArray(store.custom)) store.custom = []
  if (!store.states || typeof store.states !== 'object') store.states = {}
  return store
}

async function load() {
  const store = readStore()
  customCards.value = store.custom.slice()
  states.value = { ...store.states }
  try {
    const res = await fetch('/data/cards.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    courses.value = Array.isArray(data.courses) ? data.courses : []
  } catch (e) {
    // 兜底：public/data/cards.json 没同步时，退回构建期打进来的同一份种子数据
    const loader = CARD_SEEDS['../../../data/cards.json']
    if (loader) {
      try {
        const seed = await loader()
        const data = seed.default || seed
        courses.value = Array.isArray(data.courses) ? data.courses : []
      } catch (e2) {
        loadError.value = '卡片数据没能加载出来，可能是网络或文件缺失。'
      }
    } else {
      loadError.value = '卡片数据没能加载出来，可能是网络或文件缺失。'
    }
  } finally {
    loading.value = false
  }
}

// ============ 轮次 ============
function startRound(list) {
  queue.value = list
  idx.value = 0
  flipped.value = false
  finished.value = false
  answered.value = 0
  tally.value = { sec: 0, hesitate: 0, miss: 0 }
  toast.value = ''
}

function selectCourse(name) {
  activeCourse.value = name
  const due = activeCards.value.filter(isDue).sort((a, b) => {
    const sa = stateOf(a.id)
    const sb = stateOf(b.id)
    return (sa?.nextDueAt || 0) - (sb?.nextDueAt || 0)
  })
  startRound(due.slice())
}

function startDue() {
  selectCourse(activeCourse.value)
}

function randomFive() {
  const pool = activeCards.value.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = pool[i]
    pool[i] = pool[j]
    pool[j] = t
  }
  startRound(pool.slice(0, Math.min(5, pool.length)))
}

function backToCourses() {
  activeCourse.value = ''
  queue.value = []
  idx.value = 0
  flipped.value = false
  finished.value = false
}

function flip() {
  if (!current.value || finished.value || busy.value) return
  flipped.value = !flipped.value
}

function go(delta) {
  if (!queue.value.length) return
  const next = idx.value + delta
  if (next < 0 || next >= queue.value.length) return
  idx.value = next
  flipped.value = false
}

// ============ 三档自测 ============
function grade(level) {
  if (!current.value || !flipped.value || busy.value) return
  const card = current.value
  const gap = applyLevel(card.id, level)

  answered.value++
  if (level === 2) tally.value.sec++
  else if (level === 1) tally.value.hesitate++
  else tally.value.miss++
  toast.value = `下次复习：${gap} 天后`

  trackFootprint({
    kind: 'card',
    course: activeCourse.value,
    ref: card.id,
    n: 1,
  })

  busy.value = true
  window.setTimeout(() => {
    busy.value = false
    toast.value = ''
    if (idx.value + 1 < queue.value.length) {
      idx.value++
      flipped.value = false
    } else {
      finished.value = true
    }
  }, 520)
}

/** 写入一档结果，返回下次间隔天数；读-改-写，保留 custom */
function applyLevel(cardId, level) {
  const store = readStore()
  const prev = store.states[cardId] || { level: 0, streak: 0, lastAt: 0, nextDueAt: 0 }
  let streak = Number(prev.streak) || 0
  if (level === 2) streak = Math.min(streak + 1, GAPS.length)
  else streak = 0

  const gap = cardGap(level, streak)
  const now = Date.now()
  store.states[cardId] = {
    level,
    streak,
    lastAt: now,
    nextDueAt: now + gap * DAY,
  }
  const ok = write(KEYS.cards, store)
  if (ok) states.value = { ...store.states }
  return gap
}

// ============ 键盘 ============
function onKey(e) {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return
  if (!activeCourse.value || finished.value || !queue.value.length) return
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    flip()
    return
  }
  if (e.key === '1') {
    e.preventDefault()
    grade(2)
  } else if (e.key === '2') {
    e.preventDefault()
    grade(1)
  } else if (e.key === '3') {
    e.preventDefault()
    grade(0)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    go(1)
  }
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="fc">
    <!-- 总览 -->
    <div class="fc-stats">
      <div class="stat">
        <b>{{ stats.total }}</b>
        <span>张卡片</span>
      </div>
      <div class="stat">
        <b>{{ stats.reviewed }}</b>
        <span>已自测</span>
      </div>
      <div class="stat">
        <b>{{ stats.mastered }}</b>
        <span>已掌握</span>
      </div>
      <div class="stat accent">
        <b>{{ stats.due }}</b>
        <span>待复习</span>
      </div>
    </div>

    <!-- 加载 / 错误 -->
    <div v-if="loading" class="fc-panel skeleton">
      <div class="sk-line w40"></div>
      <div class="sk-line w70"></div>
      <div class="sk-line w55"></div>
    </div>

    <div v-else-if="loadError" class="fc-panel empty">
      <p>{{ loadError }}</p>
      <p class="muted">可以先到<a href="/notes">课程笔记</a>把重点做成卡片。</p>
    </div>

    <!-- 课程选择 -->
    <template v-else-if="!activeCourse">
      <div v-if="!groups.length" class="fc-panel empty">
        <p>还没有可复习的卡片。</p>
        <p class="muted">可以先到<a href="/notes">课程笔记</a>把重点转成自测卡。</p>
      </div>

      <div v-else class="fc-courses">
        <button
          v-for="g in groups"
          :key="g.name"
          type="button"
          class="course-card"
          @click="selectCourse(g.name)"
        >
          <div class="course-top">
            <span class="course-name">{{ g.name }}</span>
            <span class="course-code">{{ g.code || '自建卡' }}</span>
          </div>
          <div class="course-nums">
            <span><b>{{ g.total }}</b> 张</span>
            <span><b>{{ g.mastered }}</b> 已掌握</span>
            <span v-if="g.due" class="due-dot">{{ g.due }} 待复习</span>
          </div>
          <div class="bar"><i :style="{ width: g.pct + '%' }"></i></div>
        </button>
      </div>

      <div class="fc-panel tips">
        <p><b>怎么用：</b>先自己回忆，再翻面核对。翻面后按真实感受选一档——</p>
        <p class="muted">
          秒答 = 2 天后再见 · 犹豫 = 2 天后再确认 · 不会 = 明天重来。连续秒答会拉长到 4 / 7 / 15 / 30 天。
        </p>
        <p class="muted">快捷键：空格翻面，1 / 2 / 3 选档，← → 切换卡片。</p>
      </div>
    </template>

    <!-- 复习区 -->
    <template v-else>
      <div class="fc-bar">
        <button type="button" class="link-btn" @click="backToCourses">← 换一门</button>
        <span class="fc-coursename">{{ activeCourse }}</span>
        <span class="fc-progress">本轮 已答 {{ answered }} / 共 {{ queue.length }}</span>
      </div>

      <div v-if="queue.length" class="fc-tally">
        <span>秒答 <b>{{ tally.sec }}</b></span>
        <span>犹豫 <b>{{ tally.hesitate }}</b></span>
        <span>不会 <b>{{ tally.miss }}</b></span>
      </div>

      <!-- 本轮没有到期卡 -->
      <div v-if="!queue.length" class="fc-panel empty">
        <p>这门课的卡片都还在记忆保鲜期里，今天没有到期的。</p>
        <p class="muted">想加练一轮，可以随机抽 5 张。</p>
        <button type="button" class="btn primary" @click="randomFive">随机抽 5 张</button>
      </div>

      <!-- 本轮完成 -->
      <div v-else-if="finished" class="fc-panel done">
        <p class="done-title">这一轮过完了</p>
        <p class="muted">共 {{ answered }} 张：秒答 {{ tally.sec }} · 犹豫 {{ tally.hesitate }} · 不会 {{ tally.miss }}</p>
        <div class="done-actions">
          <button type="button" class="btn primary" @click="startDue">看看下一批</button>
          <button type="button" class="btn" @click="randomFive">随机抽 5 张</button>
          <button type="button" class="btn ghost" @click="backToCourses">返回课程</button>
        </div>
      </div>

      <!-- 卡片 -->
      <template v-else-if="current">
        <div class="card3d" @click="flip">
          <div class="card-inner" :class="{ flipped }">
            <div class="face front">
              <div class="face-head">
                <span class="tag">{{ current.tag || '概念' }}</span>
                <span class="state-chip" :class="{ ok: isMastered(current) }">
                  {{ isMastered(current) ? '已掌握' : isReviewed(current) ? '复习中' : '新卡' }}
                </span>
              </div>
              <p class="front-text">{{ current.front }}</p>
              <span class="hint">点击 / 空格 翻面</span>
            </div>
            <div class="face back">
              <div class="face-head">
                <span class="tag">{{ current.tag || '概念' }}</span>
                <span class="hint">再点一次翻回去</span>
              </div>
              <p class="back-text">{{ current.back }}</p>
            </div>
          </div>
        </div>

        <div class="grade-row" :class="{ show: flipped }">
          <button type="button" class="grade sec" :disabled="!flipped" @click.stop="grade(2)">
            <b>1</b> 秒答了
          </button>
          <button type="button" class="grade hesitate" :disabled="!flipped" @click.stop="grade(1)">
            <b>2</b> 犹豫了一下
          </button>
          <button type="button" class="grade miss" :disabled="!flipped" @click.stop="grade(0)">
            <b>3</b> 完全不会
          </button>
        </div>

        <div class="pager">
          <button type="button" class="link-btn" :disabled="idx === 0" @click="go(-1)">← 上一张</button>
          <span class="pager-idx">{{ idx + 1 }} / {{ queue.length }}</span>
          <button
            type="button"
            class="link-btn"
            :disabled="idx >= queue.length - 1"
            @click="go(1)"
          >
            下一张 →
          </button>
        </div>

        <transition name="fade">
          <div v-if="toast" class="toast">{{ toast }}</div>
        </transition>
      </template>
    </template>

    <!-- 掌握率 -->
    <div v-if="!loading && groups.length" class="fc-panel breakdown">
      <p class="panel-title">按课程的掌握率</p>
      <div v-for="g in groups" :key="'m-' + g.name" class="row">
        <span class="row-name">{{ g.name }}</span>
        <span class="row-bar"><i :style="{ width: g.pct + '%' }"></i></span>
        <span class="row-val">{{ g.mastered }}/{{ g.total }}</span>
      </div>
      <p class="muted small">「已掌握」= 最近连续两次秒答。</p>
    </div>
  </div>
</template>

<style scoped>
.fc {
  margin: 1.5rem 0 3rem;
}
.fc-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.stat {
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.stat b {
  display: block;
  font-size: 1.5rem;
  line-height: 1.1;
  color: var(--text-heading);
  font-variant-numeric: tabular-nums;
}
.stat span {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.stat.accent b {
  color: var(--brand);
}

.fc-panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  background: var(--vp-c-bg-soft);
  margin-bottom: 1.25rem;
}
.fc-panel p {
  margin: 0.3rem 0;
  color: var(--text-body);
  line-height: 1.7;
}
.panel-title {
  font-weight: 600;
  color: var(--text-heading) !important;
  margin-bottom: 0.75rem !important;
}

.fc-courses {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}
.course-card {
  text-align: left;
  cursor: pointer;
  padding: 1rem 1.05rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  transition: border-color 0.18s, transform 0.18s;
}
.course-card:hover {
  border-color: var(--brand);
  transform: translateY(-2px);
}
.course-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.course-name {
  font-weight: 600;
  color: var(--text-heading);
  font-size: 0.95rem;
}
.course-code {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.course-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0.6rem 0 0.7rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.course-nums b {
  color: var(--brand);
  font-size: 0.95rem;
}
.due-dot {
  color: var(--brand);
}
.bar {
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 999px;
  transition: width 0.3s;
}

.fc-bar {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 0.9rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.fc-coursename {
  font-weight: 600;
  color: var(--text-heading);
}
.fc-tally {
  display: flex;
  gap: 1rem;
  margin: -0.35rem 0 0.9rem;
  font-size: 0.76rem;
  color: var(--text-muted);
}
.fc-tally b {
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.fc-progress {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.card3d {
  perspective: 1400px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.card-inner {
  position: relative;
  min-height: 260px;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}
.card-inner.flipped {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 1.4rem 1.5rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: auto;
}
.face.front {
  border-top: 3px solid var(--brand);
}
.face.back {
  transform: rotateY(180deg);
  background: var(--brand-pale);
  border-color: var(--brand);
}
.face-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.tag {
  display: inline-block;
  font-size: 0.72rem;
  padding: 0.14rem 0.55rem;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-pale);
  border: 1px solid var(--line);
}
.face.back .tag {
  background: var(--vp-c-bg-soft);
}
.state-chip {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.state-chip.ok {
  color: var(--brand);
  font-weight: 600;
}
.front-text {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin: 1rem 0;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.6;
  color: var(--text-heading);
}
.back-text {
  flex: 1;
  display: flex;
  align-items: center;
  margin: 1rem 0 0.5rem;
  font-size: 1rem;
  line-height: 1.85;
  color: var(--text-heading);
  white-space: pre-line;
}
.hint {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-align: center;
}

.grade-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.7rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
.grade-row.show {
  opacity: 1;
  pointer-events: auto;
}
.grade {
  cursor: pointer;
  padding: 0.7rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--vp-c-bg-soft);
  color: var(--text-body);
  font-size: 0.86rem;
  transition: border-color 0.15s, background 0.15s;
}
.grade b {
  display: inline-block;
  margin-right: 0.3rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}
.grade:disabled {
  cursor: default;
}
.grade.sec:hover {
  border-color: var(--brand);
  background: var(--brand-pale);
}
.grade.hesitate:hover {
  border-color: #b08968;
}
.grade.miss:hover {
  border-color: #b5654a;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.pager-idx {
  font-variant-numeric: tabular-nums;
}

.link-btn {
  background: none;
  border: none;
  padding: 0.2rem 0.1rem;
  cursor: pointer;
  color: var(--brand);
  font-size: 0.82rem;
}
.link-btn:disabled {
  color: var(--text-muted);
  cursor: default;
  opacity: 0.5;
}

.btn {
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--vp-c-bg-soft);
  color: var(--text-body);
  font-size: 0.85rem;
}
.btn.primary {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.btn.ghost {
  background: transparent;
}
.done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.9rem;
}
.done-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-heading) !important;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 2.2rem;
  transform: translateX(-50%);
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.82rem;
  z-index: 30;
  box-shadow: 0 6px 20px rgba(13, 92, 90, 0.22);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.breakdown .row {
  display: grid;
  grid-template-columns: 9rem 1fr 3.5rem;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0;
  font-size: 0.82rem;
}
.row-name {
  color: var(--text-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}
.row-bar i {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 999px;
}
.row-val {
  text-align: right;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--text-muted) !important;
}
.small {
  font-size: 0.76rem;
  margin-top: 0.7rem !important;
}

.empty .btn {
  margin-top: 0.8rem;
}
.skeleton {
  border-style: dashed;
}
.sk-line {
  height: 12px;
  border-radius: 6px;
  background: var(--line);
  margin: 0.7rem 0;
  opacity: 0.6;
}
.w40 {
  width: 40%;
}
.w55 {
  width: 55%;
}
.w70 {
  width: 70%;
}

.fc a {
  color: var(--brand);
  text-decoration: underline;
}

@media (max-width: 640px) {
  .fc-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .fc-courses {
    grid-template-columns: 1fr;
  }
  .card-inner {
    min-height: 300px;
  }
  .face {
    padding: 1.1rem 1.05rem;
  }
  .front-text {
    font-size: 1.1rem;
  }
  .grade-row {
    grid-template-columns: 1fr;
  }
  .breakdown .row {
    grid-template-columns: 6.5rem 1fr 3rem;
  }
  .fc-bar {
    flex-wrap: wrap;
  }
  .fc-progress {
    margin-left: 0;
    width: 100%;
  }
}
</style>
