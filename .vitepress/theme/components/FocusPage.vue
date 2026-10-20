<script setup>
// 专注页主体：内联番茄钟 + 今日/本周/累计 + 月度热力日历 + 最近记录
// 所有数据只来自本机 localStorage，不做排名、不上传。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { KEYS, read, todayISO } from '../lib/storage'
import { wrongStats } from '../lib/spaced'
import FocusTimer from './FocusTimer.vue'

const FOCUS_EVENT = 'kx-focus-updated'

const units = ref([])
const ready = ref(false)
const dueCount = ref(0)
const wrongTotal = ref(0)

function levelOf(minutes) {
  if (!minutes) return 0
  if (minutes < 25) return 1
  if (minutes < 60) return 2
  return 3
}

const MODE_LABEL = {
  pomodoro: '番茄',
  custom: '自定义',
  interrupt: '中断记入',
}

function load() {
  const raw = read(KEYS.focus, { units: [] })
  const list = raw && Array.isArray(raw.units) ? raw.units : []
  units.value = list
    .filter((u) => u && Number(u.minutes) > 0)
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
  ready.value = true
}

onMounted(() => {
  load()
  try {
    const s = wrongStats()
    dueCount.value = s.due
    wrongTotal.value = s.total
  } catch {
    dueCount.value = 0
    wrongTotal.value = 0
  }
  window.addEventListener(FOCUS_EVENT, load)
})

onBeforeUnmount(() => {
  window.removeEventListener(FOCUS_EVENT, load)
})

const todayMinutes = computed(() => {
  const t = todayISO()
  return units.value.filter((u) => u.date === t).reduce((s, u) => s + Number(u.minutes), 0)
})
const todayUnits = computed(() => {
  const t = todayISO()
  return units.value.filter((u) => u.date === t).length
})

const weekMinutes = computed(() => {
  const d = new Date()
  const dow = (d.getDay() + 6) % 7
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
  const from = todayISO(monday)
  return units.value.filter((u) => u.date >= from).reduce((s, u) => s + Number(u.minutes), 0)
})
const weekUnits = computed(() => {
  const d = new Date()
  const dow = (d.getDay() + 6) % 7
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
  const from = todayISO(monday)
  return units.value.filter((u) => u.date >= from).length
})

const totalMinutes = computed(() => units.value.reduce((s, u) => s + Number(u.minutes), 0))
const totalUnits = computed(() => units.value.length)

const monthTitle = computed(() => {
  const d = new Date()
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
})

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

// 月度热力：本月每天一格，按当日分钟数分 4 档
const monthCells = computed(() => {
  if (!ready.value) return []
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const first = new Date(y, m, 1)
  const days = new Date(y, m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // 周一为第一列
  const map = {}
  for (const u of units.value) {
    map[u.date] = (map[u.date] || 0) + Number(u.minutes)
  }
  const cells = []
  for (let i = 0; i < lead; i++) cells.push({ key: `blank-${i}`, blank: true })
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const minutes = map[iso] || 0
    cells.push({
      key: iso,
      blank: false,
      day: d,
      minutes,
      level: levelOf(minutes),
      label: `${m + 1} 月 ${d} 日 · ${minutes} 分钟`,
    })
  }
  return cells
})

const recent = computed(() =>
  units.value.slice(0, 20).map((u) => ({
    ts: u.ts,
    date: u.date,
    minutes: Number(u.minutes) || 0,
    mode: MODE_LABEL[u.mode] || '专注',
  }))
)

function fmtTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}
</script>

<template>
  <div class="fp">
    <section class="fp-timer">
      <FocusTimer variant="inline" />
    </section>

    <div class="fp-stats">
      <div class="fp-stat">
        <div class="fp-stat-num">{{ todayMinutes }}<span>分钟</span></div>
        <div class="fp-stat-label">今天 · {{ todayUnits }} 个专注单元</div>
      </div>
      <div class="fp-stat">
        <div class="fp-stat-num">{{ weekMinutes }}<span>分钟</span></div>
        <div class="fp-stat-label">本周 · {{ weekUnits }} 个专注单元</div>
      </div>
      <div class="fp-stat">
        <div class="fp-stat-num">{{ totalMinutes }}<span>分钟</span></div>
        <div class="fp-stat-label">累计 · {{ totalUnits }} 个专注单元</div>
      </div>
    </div>

    <section class="fp-card">
      <div class="fp-card-head">
        <h3>{{ monthTitle }} · 专注热力</h3>
        <span class="fp-note">仅你可见，不做排名</span>
      </div>
      <div class="fp-heat">
        <div class="fp-heat-weekdays">
          <span v-for="w in weekdayLabels" :key="w">{{ w }}</span>
        </div>
        <div class="fp-heat-grid">
          <template v-for="c in monthCells" :key="c.key">
            <span v-if="c.blank" class="fp-cell fp-cell--blank"></span>
            <span
              v-else
              class="fp-cell"
              :class="`fp-cell--l${c.level}`"
              :title="c.label"
              :aria-label="c.label"
            ></span>
          </template>
        </div>
        <div class="fp-legend">
          <span>少</span>
          <i class="fp-dot fp-dot--0"></i>
          <i class="fp-dot fp-dot--1"></i>
          <i class="fp-dot fp-dot--2"></i>
          <i class="fp-dot fp-dot--3"></i>
          <span>多</span>
          <span class="fp-legend-note">0 / 1–24 / 25–59 / 60+ 分钟</span>
        </div>
      </div>
    </section>

    <section class="fp-todo-now">
      <div class="fp-now-item">
        <span class="fp-now-num">{{ dueCount }}</span>
        <span class="fp-now-label">道错题今天到期</span>
        <a href="/wrong">去复习 →</a>
      </div>
      <div class="fp-now-item">
        <span class="fp-now-num">{{ wrongTotal }}</span>
        <span class="fp-now-label">道题在错题本里</span>
        <a href="/wrong">去错题本 →</a>
      </div>
      <div class="fp-now-item">
        <span class="fp-now-num">{{ todayUnits }}</span>
        <span class="fp-now-label">个专注单元已完成</span>
        <a href="/plan">看学习计划 →</a>
      </div>
      <div class="fp-now-item">
        <span class="fp-now-label fp-now-label--strong">今天打卡了吗</span>
        <span class="fp-now-label">登录后按天记一笔学习时长</span>
        <a href="/checkin">去打卡 →</a>
      </div>
    </section>

    <section class="fp-card">
      <div class="fp-card-head">
        <h3>最近 20 次专注</h3>
        <span v-if="recent.length" class="fp-note">共 {{ totalUnits }} 次记录</span>
      </div>

      <ul v-if="recent.length" class="fp-list">
        <li v-for="(r, i) in recent" :key="`${r.ts}-${i}`" class="fp-list-row">
          <span class="fp-list-time">{{ fmtTs(r.ts) }}</span>
          <span class="fp-list-mode">{{ r.mode }}</span>
          <span class="fp-list-min">{{ r.minutes }} 分钟</span>
        </li>
      </ul>

      <p v-else-if="ready" class="fp-empty">
        还没有专注记录。上面选 25 分钟，按下「开始」，先坐住一轮再说。
      </p>
      <p v-else class="fp-empty">正在读取本机记录…</p>
    </section>

    <p class="fp-disclaimer">
      所有专注记录只存在这台设备的浏览器里，换设备不会同步，也不会出现在任何排行榜上。
    </p>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--font-body, inherit);
}
.fp-timer {
  max-width: 520px;
}

.fp-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.fp-stat {
  padding: 16px 18px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 12px;
  background: var(--vp-c-bg-soft, #fff);
}
.fp-stat-num {
  font-family: var(--font-display, serif);
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--brand, #0d5c5a);
  font-variant-numeric: tabular-nums;
}
.fp-stat-num span {
  margin-left: 4px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted, #64748b);
}
.fp-stat-label {
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}

.fp-card {
  padding: 18px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  background: var(--vp-c-bg-soft, #fff);
}
.fp-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.fp-card-head h3 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-heading, #0d1e2b);
}
.fp-note {
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
}

.fp-heat-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-bottom: 6px;
}
.fp-heat-weekdays span {
  text-align: center;
  font-size: 0.68rem;
  color: var(--text-muted, #64748b);
}
.fp-heat-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.fp-cell {
  display: block;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  border: 1px solid var(--line, #e8e4db);
  background: var(--vp-c-bg-soft, #fff);
}
.fp-cell--blank {
  border-color: transparent;
  background: transparent;
}
.fp-cell--l0 {
  background: var(--vp-c-bg-soft, #fff);
}
.fp-cell--l1 {
  background: var(--brand-pale, #e8f4f0);
  border-color: var(--brand-pale, #e8f4f0);
}
.fp-cell--l2 {
  background: var(--brand-light, #148f8c);
  border-color: var(--brand-light, #148f8c);
  opacity: 0.55;
}
.fp-cell--l3 {
  background: var(--brand, #0d5c5a);
  border-color: var(--brand, #0d5c5a);
}

.fp-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 0.7rem;
  color: var(--text-muted, #64748b);
  flex-wrap: wrap;
}
.fp-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 3px;
  border: 1px solid var(--line, #e8e4db);
}
.fp-dot--0 {
  background: var(--vp-c-bg-soft, #fff);
}
.fp-dot--1 {
  background: var(--brand-pale, #e8f4f0);
  border-color: var(--brand-pale, #e8f4f0);
}
.fp-dot--2 {
  background: var(--brand-light, #148f8c);
  border-color: var(--brand-light, #148f8c);
  opacity: 0.55;
}
.fp-dot--3 {
  background: var(--brand, #0d5c5a);
  border-color: var(--brand, #0d5c5a);
}
.fp-legend-note {
  margin-left: auto;
}

.fp-todo-now {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.fp-now-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--line, #e8e4db);
  background: var(--brand-pale, #e8f4f0);
}
.fp-now-num {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--brand, #0d5c5a);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.fp-now-label {
  font-size: 0.78rem;
  color: var(--text-body, #4a5568);
}
.fp-now-label--strong {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-heading, #0d1e2b);
}
.fp-now-item a {
  margin-top: 4px;
  font-size: 0.74rem;
  color: var(--brand, #0d5c5a);
  text-decoration: none;
}
.fp-now-item a:hover {
  text-decoration: underline;
}

.fp-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fp-list-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px dashed var(--line, #e8e4db);
  font-size: 0.82rem;
}
.fp-list-row:last-child {
  border-bottom: none;
}
.fp-list-time {
  color: var(--text-body, #4a5568);
  font-variant-numeric: tabular-nums;
}
.fp-list-mode {
  padding: 1px 8px;
  border-radius: 99px;
  background: var(--brand-pale, #e8f4f0);
  color: var(--brand, #0d5c5a);
  font-size: 0.7rem;
}
.fp-list-min {
  color: var(--text-heading, #0d1e2b);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fp-empty {
  margin: 4px 0;
  padding: 18px;
  border-radius: 10px;
  background: var(--brand-pale, #e8f4f0);
  color: var(--text-body, #4a5568);
  font-size: 0.84rem;
  line-height: 1.7;
}
.fp-disclaimer {
  margin: 4px 0 0;
  font-size: 0.74rem;
  line-height: 1.6;
  color: var(--text-muted, #64748b);
}

@media (max-width: 640px) {
  .fp-stats,
  .fp-todo-now {
    grid-template-columns: 1fr;
  }
  .fp-stat-num {
    font-size: 1.45rem;
  }
  .fp-cell {
    border-radius: 5px;
  }
  .fp-heat-grid,
  .fp-heat-weekdays {
    gap: 4px;
  }
  .fp-legend-note {
    margin-left: 0;
    flex-basis: 100%;
  }
  .fp-list-row {
    grid-template-columns: 1fr auto;
  }
  .fp-list-mode {
    display: none;
  }
}
</style>
