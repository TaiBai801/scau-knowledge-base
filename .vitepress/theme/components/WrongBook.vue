<script setup>
// 错题本与复习队列
// ------------------------------------------------------------------
// 方案 1.1 第 7 项「错题本」+ 差异化设计「遗忘曲线提醒」：
// 做错的题看完解析就过去了，不会再见第二次 → 按间隔自动提醒。
//
// 错题数据全部交给 lib/spaced.ts 管理（kx_wrong_v2），这里只负责：
//   1) 用 bank.json 按 qid 回填题干/选项/答案/解析；
//   2) 把到期队列渲染成「自评式」复习卡；
//   3) 首次进入把组题页老键 quiz_wrong 迁移进来。
// 题库里查不到的题不崩，退化成占位文案，仍然可以移出。
import { ref, computed, onMounted } from 'vue'
import {
  listWrong,
  dueEntries,
  dueForecast,
  recordAnswer,
  removeWrong,
  clearWrong,
  migrateLegacy,
  wrongStats,
} from '../lib/spaced'
import { trackFootprint } from '../lib/footprint'
import ArBtn from './ArBtn.vue'

const DAY = 86400000
const TYPE_LABEL = {
  single: '单选题',
  multi: '多选题',
  judge: '判断题',
  blank: '填空题',
  short: '简答题',
  calc: '计算题',
}

const loading = ref(true)
const bankError = ref('')
const qIndex = ref({}) // qid -> { course, code, question }
const entries = ref([])
const queue = ref([])
const stats = ref({ total: 0, due: 0, courses: 0, totalWrongs: 0, mastered: 0 })
const forecast = ref([])
const revealed = ref({})
const migrated = ref(0)
const busy = ref('')
const removingId = ref('')
const confirmClear = ref(false)
const toast = ref('')
let toastTimer = 0

// ============ 题库回填 ============
async function loadBank() {
  try {
    const res = await fetch('/data/bank.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const bank = await res.json()
    const idx = {}
    for (const [name, pack] of Object.entries(bank || {})) {
      const course = (pack && pack.course) || name
      const code = (pack && pack.code) || ''
      const questions = (pack && pack.questions) || []
      for (const q of questions) {
        if (q && q.id) idx[q.id] = { course, code, question: q }
      }
    }
    qIndex.value = idx
  } catch (e) {
    bankError.value = '题库没加载出来，暂时只能看到错题记录，看不到题干和解析。'
  }
}

function meta(qid) {
  return qIndex.value[qid] || null
}
function questionOf(entry) {
  const m = meta(entry.qid)
  return m ? m.question : null
}
function courseOf(entry) {
  const m = meta(entry.qid)
  return (m && m.course) || entry.course || '未分类'
}
function stemOf(entry, limit) {
  const q = questionOf(entry)
  if (!q) return ''
  const s = String(q.stem || '')
  return limit && s.length > limit ? s.slice(0, limit) + '…' : s
}
function missingText(qid) {
  return bankError.value
    ? '题库未加载，暂时无法显示题干（编号 ' + qid + '）'
    : '题目已从题库移除（编号 ' + qid + '）'
}
function optionsOf(entry) {
  const q = questionOf(entry)
  return q && Array.isArray(q.options) ? q.options : []
}

// ============ 时间显示 ============
function dayDiff(ts) {
  const a = new Date(ts)
  a.setHours(0, 0, 0, 0)
  const b = new Date()
  b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / DAY)
}
function dueLabel(ts) {
  const d = dayDiff(ts)
  if (d < 0) return '已过期'
  if (d === 0) return '今天'
  if (d === 1) return '明天'
  if (d === 2) return '后天'
  return d + ' 天后'
}

// ============ 数据刷新 ============
function refresh() {
  entries.value = listWrong()
  stats.value = wrongStats(entries.value)
  forecast.value = dueForecast(entries.value)
  const byId = new Map(entries.value.map((e) => [e.qid, e]))
  // 队列顺序保持不变，但换成最新记录（错题次数、下次到期日等）
  queue.value = queue.value.map((e) => byId.get(e.qid)).filter(Boolean)
}

function flash(msg) {
  toast.value = msg
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2400)
}

// ============ 交互 ============
function reveal(entry) {
  revealed.value = { ...revealed.value, [entry.qid]: true }
}

function judge(entry, correct) {
  if (busy.value) return
  busy.value = entry.qid
  const m = meta(entry.qid)
  const res = recordAnswer({
    qid: entry.qid,
    course: (m && m.course) || entry.course || '未分类',
    code: (m && m.code) || entry.code,
    knowledge: (m && m.question && m.question.knowledge) || entry.knowledge,
    correct,
  })
  trackFootprint({
    kind: 'card',
    course: (m && m.course) || entry.course || '未分类',
    code: (m && m.code) || entry.code,
    ref: entry.qid,
    n: 1,
  })

  if (correct) {
    const days = res ? Math.max(1, Math.round((res.nextDueAt - Date.now()) / DAY)) : 0
    flash(days ? `记住了，下次复习：${days} 天后` : '记住了')
    queue.value = queue.value.filter((e) => e.qid !== entry.qid)
  } else {
    flash('没关系，明天再见一次')
    const i = queue.value.findIndex((e) => e.qid === entry.qid)
    if (i >= 0) {
      const one = queue.value.splice(i, 1)[0]
      queue.value.push(one)
    }
  }
  revealed.value = { ...revealed.value, [entry.qid]: false }
  refresh()
  // 短暂锁一下，避免连点把同一道题记两次
  window.setTimeout(() => {
    busy.value = ''
  }, 350)
}

function reviewNow(entry) {
  const i = queue.value.findIndex((e) => e.qid === entry.qid)
  if (i > 0) {
    queue.value.splice(i, 1)
    queue.value.unshift(entry)
  } else if (i < 0) {
    queue.value = [entry, ...queue.value]
  }
  revealed.value = { ...revealed.value, [entry.qid]: false }
  if (typeof document !== 'undefined') {
    const el = document.getElementById('wb-queue')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function drop(entry) {
  if (removingId.value !== entry.qid) {
    removingId.value = entry.qid
    return
  }
  removeWrong(entry.qid)
  removingId.value = ''
  queue.value = queue.value.filter((e) => e.qid !== entry.qid)
  refresh()
  flash('已移出错题本')
}

function dropAll() {
  if (!confirmClear.value) {
    confirmClear.value = true
    return
  }
  clearWrong()
  confirmClear.value = false
  queue.value = []
  revealed.value = {}
  refresh()
  flash('错题本已清空')
}

// ============ 派生 ============
const groups = computed(() => {
  const map = new Map()
  for (const e of entries.value) {
    const name = courseOf(e)
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(e)
  }
  return [...map.entries()]
    .map(([name, list]) => ({
      name,
      list: list.slice().sort((a, b) => a.nextDueAt - b.nextDueAt),
    }))
    .sort((a, b) => b.list.length - a.list.length)
})

const forecastMax = computed(() => Math.max(1, ...forecast.value.map((f) => f.count)))
function barHeight(count) {
  if (!count) return 4
  return 10 + Math.round((count / forecastMax.value) * 52)
}
const nextDueText = computed(() => {
  if (!entries.value.length) return ''
  const next = entries.value.reduce(
    (min, e) => (e.nextDueAt < min ? e.nextDueAt : min),
    entries.value[0].nextDueAt
  )
  return dueLabel(next)
})

onMounted(async () => {
  try {
    migrated.value = migrateLegacy()
  } catch (e) {
    migrated.value = 0
  }
  await loadBank()
  entries.value = listWrong()
  queue.value = dueEntries(Date.now(), entries.value).slice()
  refresh()
  loading.value = false
})
</script>

<template>
  <div class="wb">
    <!-- 顶部三张卡 -->
    <div class="wb-stats">
      <div class="stat accent">
        <b>{{ stats.due }}</b>
        <span>待复习</span>
      </div>
      <div class="stat">
        <b>{{ stats.total }}</b>
        <span>错题总数</span>
      </div>
      <div class="stat">
        <b>{{ stats.mastered }}</b>
        <span>已掌握</span>
      </div>
    </div>

    <div v-if="migrated" class="wb-note">
      已从组题页导入 {{ migrated }} 道历史错题，按遗忘曲线一起排队。
    </div>
    <div v-if="bankError" class="wb-note warn">{{ bankError }}</div>

    <div v-if="loading" class="wb-panel skeleton">
      <div class="sk-line w45"></div>
      <div class="sk-line w75"></div>
      <div class="sk-line w60"></div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!stats.total" class="wb-panel empty">
      <p class="empty-title">错题本还是空的</p>
      <p>
        去<a href="/quiz">组题练习</a>做一组题，做错的会自动出现在这里，并按遗忘曲线提醒你复习。
      </p>
      <p class="muted">
        间隔节奏：答对一次 2 天、两次 4 天，之后 7 / 15 / 30 天；再答错就回到明天。
      </p>
    </div>

    <template v-else>
      <!-- 今日复习队列 -->
      <section id="wb-queue" class="wb-section">
        <div class="sec-head">
          <h2>今日复习</h2>
          <span class="sec-meta">{{ queue.length }} 道在队列里</span>
        </div>

        <div v-if="!queue.length" class="wb-panel calm">
          <p>今天没有到期的错题，记忆正在保鲜期里。</p>
          <p class="muted">下一次到期：{{ nextDueText }}。也可以从下面的全部错题里挑一道立即复习。</p>
        </div>

        <div v-for="(item, i) in queue" :key="item.qid" class="qcard">
          <div class="qcard-head">
            <span class="qidx">{{ i + 1 }}</span>
            <span class="qcourse">{{ courseOf(item) }}</span>
            <span v-if="questionOf(item)" class="qtype">
              {{ TYPE_LABEL[questionOf(item).type] || '题目' }}
            </span>
            <span class="qwrong">错过 {{ item.wrongCount }} 次</span>
          </div>

          <template v-if="questionOf(item)">
            <p class="qstem">{{ questionOf(item).stem }}</p>
            <ul v-if="optionsOf(item).length" class="qoptions">
              <li v-for="(opt, oi) in optionsOf(item)" :key="oi">{{ opt }}</li>
            </ul>

            <ArBtn
              v-if="!revealed[item.qid]"
              variant="primary"
              size="sm"
              @click="reveal(item)"
            >
              显示答案
            </ArBtn>

            <div v-else class="qanswer">
              <p class="ans-line">
                <span class="ans-label">答案</span>
                <span class="ans-val">{{ questionOf(item).answer }}</span>
              </p>
              <p v-if="questionOf(item).analysis" class="ans-analysis">
                <span class="ans-label">解析</span>{{ questionOf(item).analysis }}
              </p>
              <p v-if="questionOf(item).knowledge" class="ans-kp">
                知识点：{{ questionOf(item).knowledge }}
              </p>
            </div>

            <div v-if="revealed[item.qid]" class="judge-row">
              <span class="judge-hint">刚才这道，你答得怎么样？</span>
              <ArBtn variant="success" size="sm"
                :disabled="busy === item.qid"
                @click="judge(item, true)"
              >
                我答对了
              </ArBtn>
              <ArBtn variant="danger" size="sm"
                :disabled="busy === item.qid"
                @click="judge(item, false)"
              >
                我又错了
              </ArBtn>
            </div>
          </template>

          <!-- 题库里已没有这道题 -->
          <template v-else>
            <p class="qstem missing">{{ missingText(item.qid) }}</p>
            <p class="muted small">错题记录还在，你可以直接标记掌握情况，或把它移出错题本。</p>
            <div class="judge-row">
              <ArBtn variant="success" size="sm"
                :disabled="busy === item.qid"
                @click="judge(item, true)"
              >
                我答对了
              </ArBtn>
              <ArBtn variant="danger" size="sm"
                :disabled="busy === item.qid"
                @click="judge(item, false)"
              >
                我又错了
              </ArBtn>
              <ArBtn variant="ghost" size="sm" @click="drop(item)">
                {{ removingId === item.qid ? '确认移出' : '移出错题本' }}
              </ArBtn>
            </div>
          </template>
        </div>
      </section>

      <!-- 未来 7 天预测 -->
      <section class="wb-section">
        <div class="sec-head">
          <h2>未来 7 天</h2>
          <span class="sec-meta">按到期日统计</span>
        </div>
        <div class="wb-panel forecast">
          <div v-for="f in forecast" :key="f.date" class="fcol">
            <span class="fcount">{{ f.count || '' }}</span>
            <i class="fbar" :style="{ height: barHeight(f.count) + 'px' }"></i>
            <span class="fdate">{{ f.date }}</span>
          </div>
        </div>
      </section>

      <!-- 全部错题 -->
      <section class="wb-section">
        <div class="sec-head">
          <h2>全部错题</h2>
          <span class="sec-meta">{{ stats.total }} 道 · {{ stats.courses }} 门课</span>
        </div>

        <div v-for="g in groups" :key="g.name" class="group">
          <p class="group-name">
            {{ g.name }}
            <a class="wb-go" :href="'/quiz?course=' + encodeURIComponent(g.name)">去组题这门课 →</a>
          </p>
          <div v-for="e in g.list" :key="e.qid" class="row">
            <div class="row-main">
              <p class="row-stem">
                {{ questionOf(e) ? stemOf(e, 40) : missingText(e.qid) }}
              </p>
              <p class="row-meta">
                错 {{ e.wrongCount }} 次 · 连对 {{ e.rightStreak }} 次 · 下次复习
                <b :class="{ today: dayDiff(e.nextDueAt) <= 0 }">{{ dueLabel(e.nextDueAt) }}</b>
              </p>
            </div>
            <div class="row-actions">
              <ArBtn variant="ghost" size="sm" @click="reviewNow(e)">立即复习</ArBtn>
              <ArBtn
                variant="ghost"
                size="sm"
                @click="drop(e)"
              >
                {{ removingId === e.qid ? '确认移出' : '移出' }}
              </ArBtn>
            </div>
          </div>
        </div>

        <div class="danger-zone">
          <ArBtn variant="danger" size="sm" @click="dropAll">
            {{ confirmClear ? '再点一次，确认清空全部错题' : '清空错题本' }}
          </ArBtn>
        </div>
      </section>
    </template>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.wb {
  margin: 1.5rem 0 3rem;
}

.wb-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}
.stat {
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
.stat b {
  display: block;
  font-size: 1.7rem;
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

.wb-note {
  border-left: 3px solid var(--brand);
  background: var(--brand-pale);
  color: var(--text-body);
  font-size: 0.82rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0 8px 8px 0;
  margin-bottom: 1rem;
}
.wb-note.warn {
  border-left-color: #b5654a;
}

.wb-section {
  margin: 1.75rem 0;
  scroll-margin-top: 80px;
}
.sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.sec-head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-heading);
  border: none;
  padding: 0;
}
.sec-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.wb-panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  background: var(--vp-c-bg-soft);
}
.wb-panel p {
  margin: 0.3rem 0;
  color: var(--text-body);
  line-height: 1.7;
}
.empty-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-heading) !important;
}
.wb a {
  color: var(--brand);
  text-decoration: underline;
}

/* 题目卡 */
.qcard {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  background: var(--vp-c-bg-soft);
  margin-bottom: 0.9rem;
}
.qcard-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.55rem;
  font-size: 0.74rem;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
}
.qidx {
  width: 1.4rem;
  height: 1.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand-pale);
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.qcourse {
  color: var(--text-heading);
  font-weight: 600;
}
.qtype {
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
}
.qwrong {
  margin-left: auto;
}
.qstem {
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--text-heading);
  margin: 0.35rem 0 0.7rem;
}
.qstem.missing {
  color: var(--text-muted);
}
.qoptions {
  margin: 0 0 0.85rem;
  padding-left: 1.1rem;
  color: var(--text-body);
  font-size: 0.88rem;
  line-height: 1.9;
}
.qoptions li {
  margin: 0;
}


.qanswer {
  border-top: 1px dashed var(--line);
  border-left: 3px solid var(--brand);
  background: var(--brand-pale);
  border-radius: 0 10px 10px 0;
  padding: 0.75rem 0.95rem;
  margin: 0.9rem 0 0;
}
.qanswer p {
  margin: 0.2rem 0;
  font-size: 0.86rem;
  line-height: 1.75;
  color: var(--text-body);
}
.ans-label {
  display: inline-block;
  margin-right: 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--brand);
}
.ans-val {
  font-weight: 700;
  color: var(--text-heading);
  white-space: pre-line;
}
.ans-analysis {
  white-space: pre-line;
}
.ans-kp {
  font-size: 0.78rem !important;
  color: var(--text-muted) !important;
}

.judge-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.9rem;
}
.judge-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* 预测柱 */
.forecast {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  align-items: end;
  padding: 1rem 1.1rem 0.85rem;
}
.fcol {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
}
.fcount {
  font-size: 0.72rem;
  color: var(--brand);
  font-weight: 600;
  min-height: 1em;
  font-variant-numeric: tabular-nums;
}
.fbar {
  display: block;
  width: 100%;
  max-width: 34px;
  border-radius: 4px 4px 0 0;
  background: var(--brand);
  opacity: 0.85;
  transition: height 0.3s;
}
.fdate {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 全部错题 */
.group {
  margin-bottom: 1.1rem;
}
.group-name {
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  color: var(--text-muted);
  margin: 0 0 0.4rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--line);
}
.wb-go {
  font-weight: 500;
  font-size: 0.72rem;
  color: var(--brand, #0d5c5a);
  text-decoration: none;
  border: 1px solid var(--brand, #0d5c5a);
  border-radius: 999px;
  padding: 0.08rem 0.5rem;
  white-space: nowrap;
}
.wb-go:hover {
  background: var(--brand, #0d5c5a);
  color: #fff;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px dashed var(--line);
}
.row:last-child {
  border-bottom: none;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-stem {
  margin: 0;
  font-size: 0.86rem;
  color: var(--text-heading);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.row-meta {
  margin: 0.2rem 0 0;
  font-size: 0.74rem;
  color: var(--text-muted);
}
.row-meta b {
  color: var(--text-body);
  font-weight: 600;
}
.row-meta b.today {
  color: var(--brand);
}
.row-actions {
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}
.danger-zone {
  margin-top: 1.2rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--line);
  text-align: right;
}

.muted {
  color: var(--text-muted) !important;
}
.small {
  font-size: 0.76rem !important;
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
.w45 {
  width: 45%;
}
.w60 {
  width: 60%;
}
.w75 {
  width: 75%;
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

@media (max-width: 640px) {
  .wb-stats {
    grid-template-columns: 1fr;
  }
  .stat {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.7rem 0.9rem;
  }
  .stat b {
    font-size: 1.35rem;
  }
  .row {
    flex-direction: column;
    gap: 0.35rem;
  }
  .row-actions {
    align-self: flex-end;
  }
  .forecast {
    gap: 0.3rem;
    padding: 0.9rem 0.6rem 0.7rem;
  }
  .qcard {
    padding: 0.95rem 1rem;
  }
  .judge-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
