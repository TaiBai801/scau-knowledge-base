<script setup>
// 考试倒计时 + 待办
// ------------------------------------------------------------------
// 方案 1.2 五：把「什么时候该复习」变成平台提示。
// 考试日期读的是学习计划的老键 study_plan_v1（无 kx_ 前缀），
// 待办存 KEYS.todo，最多 5 条 —— 列表长了就没人看了。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KEYS, read, write, todayISO } from '../lib/storage'
import { wrongStats } from '../lib/spaced'

const MAX_ITEMS = 5
const PLAN_KEY = 'study_plan_v1'

const ready = ref(false)
const examDate = ref('')
const planCourses = ref([])
const items = ref([])
const input = ref('')
const hint = ref('')
const todayMinutes = ref(0)
const dueCount = ref(0)

function save() {
  write(KEYS.todo, { items: items.value })
}

function refreshMetrics() {
  const raw = read(KEYS.focus, { units: [] })
  const units = raw && Array.isArray(raw.units) ? raw.units : []
  const t = todayISO()
  todayMinutes.value = units
    .filter((u) => u && u.date === t)
    .reduce((s, u) => s + (Number(u.minutes) || 0), 0)
  try {
    dueCount.value = wrongStats().due
  } catch {
    dueCount.value = 0
  }
}

function load() {
  const plan = read(PLAN_KEY, null)
  if (plan && typeof plan === 'object') {
    if (typeof plan.examDate === 'string') examDate.value = plan.examDate
    if (Array.isArray(plan.courses)) planCourses.value = plan.courses
  }

  const raw = read(KEYS.todo, { items: [] })
  const list = raw && Array.isArray(raw.items) ? raw.items : []
  items.value = list
    .filter((it) => it && typeof it.text === 'string' && it.text.trim())
    .slice(0, MAX_ITEMS)
    .map((it, i) => ({
      id: String(it.id || `t-${i}`),
      text: String(it.text).slice(0, 60),
      done: !!it.done,
      createdAt: Number(it.createdAt) || 0,
    }))

  refreshMetrics()
  ready.value = true
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('kx-focus-updated', refreshMetrics)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('kx-focus-updated', refreshMetrics)
})

function onVisibility() {
  if (typeof document !== 'undefined' && !document.hidden) refreshMetrics()
}

// ── 倒计时 ─────────────────────────────────────────────────
function parseDateParts(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function utcDay(y, m, d) {
  return Date.UTC(y, m - 1, d)
}

const daysLeft = computed(() => {
  const p = parseDateParts(examDate.value)
  if (!p) return null
  const now = new Date()
  const diff = utcDay(p.y, p.m, p.d) - utcDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return Math.round(diff / 86400000)
})

const countdown = computed(() => {
  const n = daysLeft.value
  if (n === null) return null
  if (n > 0) return { label: '距离考试还有', num: String(n), unit: '天' }
  if (n === 0) return { label: '考试日期', num: '就是今天', unit: '' }
  return { label: '考试已结束', num: String(Math.abs(n)), unit: '天前' }
})

const examPretty = computed(() => {
  const p = parseDateParts(examDate.value)
  if (!p) return ''
  const d = new Date(p.y, p.m - 1, p.d)
  const w = '日一二三四五六'[d.getDay()]
  return `${p.m} 月 ${p.d} 日 · 周${w}`
})

const examNote = computed(() => {
  const n = daysLeft.value
  if (n === null) return ''
  if (n < 0) return '这场考完了。把错题再过一遍，别让同样的坑留到下一门。'
  if (n === 0) return '就是今天。别再开新章节了，把错题和公式过一遍就够。'
  if (n <= 7) return '最后一周。优先级：到期错题 > 冲刺包 > 新内容。'
  if (n <= 30) return '还有时间，按计划推进就好，别把复习全堆到最后三天。'
  return '时间还早，先把每周的专注单元攒起来，比临时抱佛脚稳。'
})

// ── 待办 ───────────────────────────────────────────────────
const doneCount = computed(() => items.value.filter((it) => it.done).length)
const atLimit = computed(() => items.value.length >= MAX_ITEMS)

function addItem() {
  const text = input.value.trim()
  if (!text) return
  if (items.value.length >= MAX_ITEMS) {
    hint.value = '最多 5 条 —— 待办列表长了就没人看了'
    return
  }
  items.value.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text: text.slice(0, 60),
    done: false,
    createdAt: Date.now(),
  })
  input.value = ''
  hint.value = ''
  save()
}

function toggle(item) {
  item.done = !item.done
  save()
}

function removeItem(id) {
  items.value = items.value.filter((it) => it.id !== id)
  hint.value = ''
  save()
}
</script>

<template>
  <div class="td">
    <div class="td-grid">
      <section class="td-card td-exam">
        <div class="td-label">考试倒计时</div>

        <template v-if="countdown">
          <p class="td-count-label">{{ countdown.label }}</p>
          <div class="td-days">
            <span class="td-num">{{ countdown.num }}</span>
            <span v-if="countdown.unit" class="td-unit">{{ countdown.unit }}</span>
          </div>
          <p class="td-exam-date">
            {{ examPretty }}
            <span v-if="planCourses.length" class="td-course-count">
              · 计划里 {{ planCourses.length }} 门课
            </span>
          </p>
          <p class="td-exam-note">{{ examNote }}</p>
        </template>

        <p v-else-if="ready" class="td-exam-empty">
          还没设考试日期，去<a href="/plan">学习计划</a>设一个 —— 有了日期，复习才有节奏。
        </p>
        <p v-else class="td-exam-empty">正在读取学习计划…</p>
      </section>

      <section class="td-card td-todo">
        <div class="td-todo-head">
          <div class="td-label">今天要做的事</div>
          <span class="td-todo-count">
            {{ items.length }} / {{ MAX_ITEMS }}
            <template v-if="doneCount">· 已完成 {{ doneCount }}</template>
          </span>
        </div>

        <ul v-if="items.length" class="td-list">
          <li v-for="it in items" :key="it.id" class="td-item" :class="{ 'is-done': it.done }">
            <label class="td-check">
              <input type="checkbox" :checked="it.done" @change="toggle(it)" />
              <span class="td-text">{{ it.text }}</span>
            </label>
            <button type="button" class="td-del" aria-label="删除这条待办" @click="removeItem(it.id)">
              删除
            </button>
          </li>
        </ul>
        <p v-else class="td-empty">
          还没有待办。最多记 5 条，只写今天真会做的那种 —— 比如「过一遍第三章错题」。
        </p>

        <div class="td-add">
          <input
            v-model="input"
            class="td-input"
            type="text"
            maxlength="60"
            placeholder="加一条待办…"
            aria-label="新待办内容"
            @keyup.enter="addItem"
          />
          <button type="button" class="td-add-btn" @click="addItem">添加</button>
        </div>
        <p v-if="hint || atLimit" class="td-hint">
          {{ hint || '最多 5 条 —— 待办列表长了就没人看了' }}
        </p>
      </section>
    </div>

    <div class="td-metrics">
      <div class="td-metric">
        今日专注 <strong>{{ todayMinutes }}</strong> 分钟
        <a href="/focus">去计时 →</a>
      </div>
      <div class="td-metric">
        到期错题 <strong>{{ dueCount }}</strong> 道
        <a href="/wrong">去复习 →</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.td {
  font-family: var(--font-body, inherit);
}
.td-grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 14px;
}
.td-card {
  padding: 18px 20px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  background: var(--vp-c-bg-soft, #fff);
  box-sizing: border-box;
}
.td-exam {
  background: var(--brand-pale, #e8f4f0);
  border-color: var(--brand-pale, #e8f4f0);
}
.td-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-muted, #64748b);
}
.td-count-label {
  margin: 12px 0 0;
  font-size: 0.8rem;
  color: var(--text-body, #4a5568);
}
.td-days {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 2px 0 6px;
  color: var(--brand, #0d5c5a);
}
.td-num {
  font-family: var(--font-display, serif);
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.td-unit {
  font-size: 0.9rem;
  font-weight: 600;
}
.td-exam-date {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-body, #4a5568);
}
.td-course-count {
  color: var(--text-muted, #64748b);
}
.td-exam-note {
  margin: 10px 0 0;
  font-size: 0.78rem;
  line-height: 1.7;
  color: var(--text-body, #4a5568);
}
.td-exam-empty {
  margin: 12px 0 0;
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--text-body, #4a5568);
}
.td-exam-empty a {
  color: var(--brand, #0d5c5a);
  font-weight: 600;
  text-decoration: none;
}
.td-exam-empty a:hover {
  text-decoration: underline;
}

.td-todo-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.td-todo-count {
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
  font-variant-numeric: tabular-nums;
}
.td-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.td-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--line, #e8e4db);
}
.td-item:last-child {
  border-bottom: none;
}
.td-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
  cursor: pointer;
  font-size: 0.84rem;
  line-height: 1.55;
  color: var(--text-body, #4a5568);
}
.td-check input {
  margin: 3px 0 0;
  accent-color: var(--brand, #0d5c5a);
  flex: 0 0 auto;
}
.td-item.is-done .td-text {
  color: var(--text-muted, #64748b);
  text-decoration: line-through;
}
.td-del {
  flex: 0 0 auto;
  padding: 1px 4px;
  border: none;
  background: transparent;
  color: var(--text-muted, #64748b);
  font-size: 0.7rem;
  font-family: inherit;
  cursor: pointer;
}
.td-del:hover {
  color: var(--brand, #0d5c5a);
}
.td-empty {
  margin: 12px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--brand-pale, #e8f4f0);
  font-size: 0.78rem;
  line-height: 1.7;
  color: var(--text-body, #4a5568);
}
.td-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.td-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 8px;
  background: var(--vp-c-bg-soft, #fff);
  color: var(--text-body, #4a5568);
  font-size: 0.8rem;
  font-family: inherit;
  box-sizing: border-box;
}
.td-input:focus {
  outline: none;
  border-color: var(--brand, #0d5c5a);
}
.td-add-btn {
  flex: 0 0 auto;
  padding: 7px 14px;
  border: 1px solid var(--brand, #0d5c5a);
  border-radius: 8px;
  background: var(--brand, #0d5c5a);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.td-add-btn:hover {
  background: var(--brand-light, #148f8c);
  border-color: var(--brand-light, #148f8c);
}
.td-hint {
  margin: 8px 0 0;
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
}

.td-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px dashed var(--line, #e8e4db);
  border-radius: 12px;
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}
.td-metric strong {
  color: var(--text-heading, #0d1e2b);
  font-variant-numeric: tabular-nums;
}
.td-metric a {
  color: var(--brand, #0d5c5a);
  text-decoration: none;
}
.td-metric a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .td-grid {
    grid-template-columns: 1fr;
  }
  .td-card {
    padding: 16px;
  }
  .td-num {
    font-size: 2.1rem;
  }
}
</style>
