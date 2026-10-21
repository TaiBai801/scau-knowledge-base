<script setup>
// 学习周报 —— 每周一自动汇总上周？
// 不是。这里没有定时任务、没有后台：每次打开就按本机数据重算「最近一个完整自然周」，
// 结果和周一自动生成的一模一样，但不需要服务器，也不会因为你没打开就丢数据。
//
// 只和自己比：所有卡片都带上周对照，没有任何他人排名。
import { ref, computed, onMounted } from 'vue'
import { KEYS, read, startOfWeek, addDays } from '../lib/storage'
import { readFootprint, summarizeFootprint } from '../lib/footprint'
import { listWrong } from '../lib/spaced'

const MIN_OFFSET = 1 // 1 = 最近一个完整自然周
const MAX_OFFSET = 8

const offset = ref(MIN_OFFSET)
const ready = ref(false)
const report = ref(null)

function isoWeek(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNum = (date.getDay() + 6) % 7 // 周一 = 0
  date.setDate(date.getDate() - dayNum + 3) // 本周四
  const firstThursday = new Date(date.getFullYear(), 0, 4)
  const fDayNum = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - fDayNum + 3)
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000))
}

function md(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function cnDate(d) {
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 统计 [start, end) 区间；全部来自本地，缺数据就返回 0 */
function rangeStats(start, end) {
  const startTs = start.getTime()
  const endTs = end.getTime()

  const focusRaw = read(KEYS.focus, { units: [] })
  const units = (focusRaw && Array.isArray(focusRaw.units) ? focusRaw.units : []).filter((u) => {
    const ts = Number(u && u.ts)
    return ts >= startTs && ts < endTs
  })
  const focusMinutes = units.reduce((s, u) => s + (Number(u.minutes) || 0), 0)

  const events = readFootprint().filter((e) => Number(e.ts) >= startTs && Number(e.ts) < endTs)
  const sum = summarizeFootprint(events)

  // 组卷历史只保留最近 20 次，作为足迹缺失时的兜底
  const hist = read('quiz_history', [])
  let quizHist = 0
  if (Array.isArray(hist)) {
    for (const h of hist) {
      const ts = Number(h && (h.at != null ? h.at : h.time))
      if (ts >= startTs && ts < endTs) quizHist += Number(h.total) || 0
    }
  }

  const wrongs = listWrong()
  const newWrong = wrongs.filter(
    (w) => Number(w.firstAt) >= startTs && Number(w.firstAt) < endTs
  ).length

  return {
    focusMinutes,
    focusUnits: units.length,
    courses: sum.courses,
    quizQuestions: sum.quizQuestions > 0 ? sum.quizQuestions : quizHist,
    newWrong,
    activeDays: sum.days,
  }
}

function buildSummary(cur, prev) {
  const parts = []

  if (cur.focusMinutes > 0) {
    if (prev.focusMinutes > 0) {
      const diff = cur.focusMinutes - prev.focusMinutes
      parts.push(
        diff === 0
          ? `本周专注 ${cur.focusMinutes} 分钟，和上周持平`
          : `本周专注 ${cur.focusMinutes} 分钟，比上周${diff > 0 ? '多' : '少'}了 ${Math.abs(diff)} 分钟`
      )
    } else {
      parts.push(`本周专注 ${cur.focusMinutes} 分钟，上周还没有记录`)
    }
  } else if (prev.focusMinutes > 0) {
    parts.push(`本周没开计时器，上周是 ${prev.focusMinutes} 分钟`)
  }

  if (cur.quizQuestions > 0) {
    parts.push(`做了 ${cur.quizQuestions} 道题`)
  } else if (prev.quizQuestions > 0) {
    parts.push('这周一道题也没做')
  }

  if (cur.courses > 0) {
    const diff = cur.courses - prev.courses
    if (prev.courses > 0 && diff !== 0) {
      parts.push(`翻了 ${cur.courses} 门课，比上周${diff > 0 ? '多' : '少'} ${Math.abs(diff)} 门`)
    } else if (prev.courses > 0) {
      parts.push(`翻了 ${cur.courses} 门课，和上周一样`)
    } else {
      parts.push(`翻了 ${cur.courses} 门课`)
    }
  }

  if (cur.newWrong > 0) {
    parts.push(`新增 ${cur.newWrong} 道错题，记得去清一遍`)
  } else if (prev.newWrong > 0) {
    parts.push('这周没再添新错题')
  }

  if (!parts.length) return ''
  return parts.join('；') + '。'
}

function build(off) {
  const monday = addDays(startOfWeek(new Date()), -7 * off)
  const end = addDays(monday, 7)
  const prevMonday = addDays(monday, -7)
  const cur = rangeStats(monday, end)
  const prev = rangeStats(prevMonday, monday)
  const hasAny =
    cur.focusMinutes + cur.courses + cur.quizQuestions + cur.newWrong > 0 ||
    cur.focusUnits > 0

  report.value = {
    offset: off,
    monday,
    sunday: addDays(monday, 6),
    weekNo: isoWeek(monday),
    year: monday.getFullYear(),
    cur,
    prev,
    hasAny,
    summary: hasAny ? buildSummary(cur, prev) : '',
  }
  ready.value = true
}

function load() {
  build(offset.value)
}

onMounted(load)

function goEarlier() {
  if (offset.value >= MAX_OFFSET) return
  offset.value += 1
  load()
}

function goLater() {
  if (offset.value <= MIN_OFFSET) return
  offset.value -= 1
  load()
}

const cards = computed(() => {
  if (!report.value) return []
  const { cur, prev } = report.value
  return [
    { key: 'focus', label: '专注时长', unit: '分钟', cur: cur.focusMinutes, prev: prev.focusMinutes, better: 'up' },
    { key: 'courses', label: '访问课程', unit: '门', cur: cur.courses, prev: prev.courses, better: 'up' },
    { key: 'quiz', label: '做题数', unit: '道', cur: cur.quizQuestions, prev: prev.quizQuestions, better: 'up' },
    { key: 'wrong', label: '新增错题', unit: '道', cur: cur.newWrong, prev: prev.newWrong, better: 'down' },
  ]
})

function deltaOf(card) {
  return card.cur - card.prev
}

// 上升用品牌色，下降用灰色 —— 不做红绿灯式的好坏判断
function deltaClass(card) {
  const d = deltaOf(card)
  if (d === 0) return 'is-flat'
  const good = card.better === 'up' ? d > 0 : d < 0
  return good ? 'is-up' : 'is-down'
}

function deltaText(card) {
  const d = deltaOf(card)
  if (d === 0) return '持平'
  return `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}`
}

function barWidth(card, side) {
  const max = Math.max(card.cur, card.prev, 1)
  const v = side === 'cur' ? card.cur : card.prev
  return `${Math.round((v / max) * 100)}%`
}

const weekTitle = computed(() => {
  if (!report.value) return ''
  const r = report.value
  return `${r.year} 年第 ${r.weekNo} 周（${md(r.monday)} – ${md(r.sunday)}）`
})

const rangeText = computed(() => {
  if (!report.value) return ''
  const r = report.value
  return `${cnDate(r.monday)} – ${cnDate(r.sunday)}`
})

const emptyText = computed(() => {
  if (!report.value) return ''
  const p = report.value.prev
  const prevAny = p.focusMinutes + p.courses + p.quizQuestions > 0
  if (prevAny) return '这一周没有留下记录，上周还有点动静 —— 下周接上就行。'
  return report.value.offset === MIN_OFFSET
    ? '上周还没有记录。等这一周过完再来看看。'
    : '这一周没有留下记录。'
})
</script>

<template>
  <div class="wr">
    <div class="wr-nav">
      <button type="button" class="wr-arrow" :disabled="offset >= MAX_OFFSET" @click="goEarlier">
        ← 更早一周
      </button>
      <span class="wr-nav-hint">
        {{ offset === MIN_OFFSET ? '最近一个完整自然周' : `往前第 ${offset} 周` }}
      </span>
      <button type="button" class="wr-arrow" :disabled="offset <= MIN_OFFSET" @click="goLater">
        更近一周 →
      </button>
    </div>

    <div v-if="ready && report" class="wr-head">
      <h2>{{ weekTitle }}</h2>
      <p>
        统计区间 {{ rangeText }} · 全部在本机计算
        <span v-if="offset === MIN_OFFSET" class="wr-badge">最近一周</span>
      </p>
    </div>
    <div v-else class="wr-head">
      <h2>正在汇总本机数据…</h2>
      <p>周报只在你的浏览器里算，不上传任何记录。</p>
    </div>

    <template v-if="ready && report">
      <div v-if="report.hasAny" class="wr-cards">
        <div v-for="card in cards" :key="card.key" class="wr-card">
          <div class="wr-card-label">{{ card.label }}</div>
          <div class="wr-card-value">
            {{ card.cur }}<span class="wr-unit">{{ card.unit }}</span>
          </div>
          <div class="wr-card-compare">
            <span class="wr-prev">上周 {{ card.prev }}</span>
            <span class="wr-delta" :class="deltaClass(card)">{{ deltaText(card) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="wr-empty">
        <p>{{ emptyText }}</p>
        <p class="wr-empty-sub">
          打开<a href="/focus">专注计时</a>或<a href="/quiz">组题练习</a>，下一周就有东西可看了。
        </p>
      </div>

      <section v-if="report.hasAny" class="wr-bars">
        <div class="wr-section-head">
          <h3>本周 vs 上周</h3>
          <span class="wr-note">只和上周的自己比</span>
        </div>
        <div v-for="card in cards" :key="card.key" class="wr-bar-row">
          <div class="wr-bar-name">
            {{ card.label }}
            <span class="wr-bar-nums">{{ card.cur }} / {{ card.prev }} {{ card.unit }}</span>
          </div>
          <div class="wr-bar-lines">
            <div class="wr-bar-line">
              <span class="wr-bar-tag">本周</span>
              <div class="wr-bar-track">
                <i class="wr-bar-fill wr-bar-fill--cur" :style="{ width: barWidth(card, 'cur') }"></i>
              </div>
            </div>
            <div class="wr-bar-line">
              <span class="wr-bar-tag is-prev">上周</span>
              <div class="wr-bar-track">
                <i class="wr-bar-fill wr-bar-fill--prev" :style="{ width: barWidth(card, 'prev') }"></i>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="report.hasAny" class="wr-summary">
        <div class="wr-section-head">
          <h3>一句话小结</h3>
        </div>
        <p>{{ report.summary }}</p>
      </section>

      <section v-if="report.hasAny" class="wr-links">
        <div class="wr-section-head">
          <h3>接下来做什么</h3>
        </div>
        <div class="wr-link-row">
          <a class="wr-link" href="/focus">🍅 再来一个专注单元</a>
          <a class="wr-link" href="/footprint">👣 看这学期的轨迹</a>
          <a class="wr-link" href="/wrong">🔁 复习错题本</a>
          <a class="wr-link" href="/quiz">📝 做一组题</a>
          <a class="wr-link" href="/my">📚 对照我的本学期</a>
        </div>
      </section>

      <p class="wr-foot">
        周报不是定时任务：每次打开按本机数据重算，覆盖最近 {{ MAX_OFFSET }} 个完整周。
        记录只在这台设备上，换设备不会同步；没有任何他人排名。
      </p>
    </template>
  </div>
</template>

<style scoped>
.wr {
  font-family: var(--font-body, inherit);
}

.wr-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
.wr-arrow {
  padding: 6px 12px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 99px;
  background: var(--vp-c-bg-soft, #fff);
  color: var(--text-body, #4a5568);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.wr-arrow:hover:not(:disabled) {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}
.wr-arrow:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.wr-nav-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
}

.wr-head {
  margin-bottom: 16px;
}
.wr-head h2 {
  margin: 0;
  font-family: var(--font-display, serif);
  font-size: 1.35rem;
  color: var(--text-heading, #0d1e2b);
  border: none;
  padding: 0;
}
.wr-head p {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}
.wr-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 99px;
  background: var(--brand-pale, #e8f4f0);
  color: var(--brand, #0d5c5a);
  font-size: 0.68rem;
}

.wr-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.wr-card {
  padding: 15px 16px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 12px;
  background: var(--vp-c-bg-soft, #fff);
}
.wr-card-label {
  font-size: 0.76rem;
  color: var(--text-muted, #64748b);
}
.wr-card-value {
  margin-top: 4px;
  font-family: var(--font-display, serif);
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-heading, #0d1e2b);
  font-variant-numeric: tabular-nums;
}
.wr-unit {
  margin-left: 3px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-muted, #64748b);
}
.wr-card-compare {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.72rem;
}
.wr-prev {
  color: var(--text-muted, #64748b);
}
.wr-delta {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.wr-delta.is-up {
  color: var(--brand, #0d5c5a);
}
.wr-delta.is-down {
  color: var(--text-muted, #64748b);
}
.wr-delta.is-flat {
  color: var(--text-muted, #64748b);
  font-weight: 500;
}

.wr-bars,
.wr-summary {
  padding: 18px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  background: var(--vp-c-bg-soft, #fff);
}

.wr-links {
  padding: 18px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  background: var(--vp-c-bg-soft, #fff);
  margin-top: 16px;
}
.wr-link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.wr-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--line, #e8e4db);
  background: var(--vp-c-bg, #fff);
  color: var(--text-body, #4a5568);
  font-size: 0.82rem;
  text-decoration: none;
  transition: all 0.15s;
}
.wr-link:hover {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}

.wr-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.wr-section-head h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text-heading, #0d1e2b);
}
.wr-note {
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
}

.wr-bar-row {
  display: grid;
  grid-template-columns: 128px 1fr;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
}
.wr-bar-name {
  font-size: 0.8rem;
  color: var(--text-body, #4a5568);
}
.wr-bar-nums {
  display: block;
  margin-top: 2px;
  font-size: 0.7rem;
  color: var(--text-muted, #64748b);
  font-variant-numeric: tabular-nums;
}
.wr-bar-lines {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.wr-bar-line {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 8px;
  align-items: center;
}
.wr-bar-tag {
  font-size: 0.68rem;
  color: var(--brand, #0d5c5a);
}
.wr-bar-tag.is-prev {
  color: var(--text-muted, #64748b);
}
.wr-bar-track {
  height: 10px;
  border-radius: 99px;
  background: var(--brand-pale, #e8f4f0);
  overflow: hidden;
}
.wr-bar-fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}
.wr-bar-fill--cur {
  background: var(--brand, #0d5c5a);
}
.wr-bar-fill--prev {
  background: var(--brand-light, #148f8c);
  opacity: 0.4;
}

.wr-summary p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.85;
  color: var(--text-body, #4a5568);
}

.wr-empty {
  padding: 26px 22px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  background: var(--brand-pale, #e8f4f0);
  margin-bottom: 16px;
}
.wr-empty p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-heading, #0d1e2b);
}
.wr-empty-sub {
  margin-top: 8px !important;
  font-size: 0.78rem !important;
  color: var(--text-muted, #64748b) !important;
}
.wr-empty-sub a {
  color: var(--brand, #0d5c5a);
  text-decoration: none;
}
.wr-empty-sub a:hover {
  text-decoration: underline;
}

.wr-foot {
  margin: 4px 0 0;
  font-size: 0.72rem;
  line-height: 1.7;
  color: var(--text-muted, #64748b);
}

@media (max-width: 640px) {
  .wr-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .wr-card-value {
    font-size: 1.45rem;
  }
  .wr-bar-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .wr-nav-hint {
    display: none;
  }
}
</style>
