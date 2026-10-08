<script setup>
import { ref, computed, onMounted } from 'vue'

// ============ 数据 ============
const syllabus = ref({})   // { 课程名: { course, code, units:[] } }
const materials = ref({})  // { 课程名: [{name,url,ext}] }
const loading = ref(true)
const loadError = ref('')

// ============ 配置 ============
const config = ref({
  course: 'C语言程序设计',
  startDate: todayISO(),
  endDate: addDaysISO(14),
  dailyMinutes: 60,
})

// ============ 计划状态 ============
const plan = ref(null)      // { course, days:[{dateISO, tasks:[{unitTitle, minutes, unitId}], done}], totalMinutes }
const overflowNote = ref('')

const STORAGE_KEY = 'study_plan_v1'

// ============ 工具 ============
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysISO(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseISO(s) {
  const [y, m, dd] = s.split('-').map(Number)
  return new Date(y, m - 1, dd)
}
function fmtDate(d) { return `${d.getMonth() + 1}月${d.getDate()}日` }
function weekday(d) { return '日一二三四五六'[d.getDay()] }

// ============ 生成算法 ============
function generate() {
  const entry = syllabus.value[config.value.course]
  if (!entry || !entry.units || !entry.units.length) { loadError.value = '该课程暂无学习单元数据'; return }
  const units = entry.units

  const start = parseISO(config.value.startDate)
  const end = parseISO(config.value.endDate)
  if (end < start) { loadError.value = '结束日期不能早于开始日期'; return }
  const dayCount = Math.round((end - start) / 86400000) + 1

  const totalNeed = units.reduce((s, u) => s + u.durationMin, 0)
  const totalAvail = dayCount * config.value.dailyMinutes

  // 时间不够：按比例压缩每个单元时长，并提示
  let scale = 1
  overflowNote.value = ''
  if (totalNeed > totalAvail) {
    scale = totalAvail / totalNeed
    overflowNote.value = `总需求 ${totalNeed} 分钟 > 可用 ${totalAvail} 分钟，已按 ${(scale * 100).toFixed(0)}% 压缩各单元时长。建议延长日期范围或增加每日时长。`
  }

  // 按单元权重顺序，切成"天"
  const days = []
  let unitIdx = 0
  let remain = Math.round(units[0].durationMin * scale)
  for (let d = 0; d < dayCount && unitIdx < units.length; d++) {
    let cap = config.value.dailyMinutes
    const tasks = []
    while (cap > 0 && unitIdx < units.length) {
      const take = Math.min(cap, remain)
      tasks.push({
        unitId: units[unitIdx].id,
        title: units[unitIdx].title,
        points: units[unitIdx].points,
        materials: units[unitIdx].materials,
        quizScope: units[unitIdx].quizScope,
        minutes: take,
        unitTotal: units[unitIdx].durationMin,
      })
      cap -= take
      remain -= take
      if (remain <= 0) {
        unitIdx++
        if (unitIdx < units.length) remain = Math.round(units[unitIdx].durationMin * scale)
      }
    }
    const date = new Date(start)
    date.setDate(start.getDate() + d)
    days.push({ dateISO: date.toISOString().slice(0, 10), date, tasks, done: false })
  }

  plan.value = { course: config.value.course, days, createdAt: Date.now() }
  save()
  loadError.value = ''
}

// ============ 持久化 ============
function save() {
  if (!plan.value) return
  const p = JSON.parse(JSON.stringify(plan.value))
  p.days.forEach(d => { delete d.date })   // Date 对象不可序列化
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const p = JSON.parse(raw)
    if (!p || !p.days) return false
    p.days.forEach(d => { d.date = parseISO(d.dateISO) })
    plan.value = p
    config.value.course = p.course
    return true
  } catch { return false }
}
function toggleDay(i) {
  plan.value.days[i].done = !plan.value.days[i].done
  save()
}
function discard() {
  localStorage.removeItem(STORAGE_KEY)
  plan.value = null
  overflowNote.value = ''
}

// ============ 派生 ============
const doneCount = computed(() => plan.value ? plan.value.days.filter(d => d.done).length : 0)
const progressPct = computed(() => plan.value && plan.value.days.length ? Math.round(doneCount.value / plan.value.days.length * 100) : 0)
const totalHours = computed(() => plan.value ? Math.round(plan.value.days.length * config.value.dailyMinutes / 60 * 10) / 10 : 0)

const courses = computed(() => Object.keys(syllabus.value))

function materialLink(course, name) {
  const list = materials.value[course] || []
  return list.find(m => m.name === name)
}

function printPlan() { window.print() }

// ============ 加载 ============
onMounted(async () => {
  try {
    const [s, m] = await Promise.all([
      fetch('/data/syllabus.json', { cache: 'no-store' }).then(r => r.json()),
      fetch('/data/materials.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
    ])
    syllabus.value = s
    // materials.json 的 key 是原始课程名，与 syllabus 一致
    materials.value = m
    const keys = Object.keys(s)
    if (keys.length && !keys.includes(config.value.course)) config.value.course = keys[0]
    restore()   // 有历史计划则恢复
  } catch (e) {
    loadError.value = '数据加载失败：' + e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="plan-wrap">
    <div class="plan-hero plan-no-print">
      <span class="plan-hero-tag">按部就班</span>
      <h1 class="plan-hero-title">学习计划书</h1>
      <p class="plan-hero-sub">给定时间范围，按课程学习单元的权重自动排期——每天学什么、用什么资料、配什么测试，一目了然。</p>
    </div>

    <div class="plan-inner">
      <div v-if="loading" class="plan-state">数据加载中…</div>
      <div v-else-if="loadError && !plan" class="plan-state plan-err">{{ loadError }}</div>

      <template v-else>
        <!-- 配置 -->
        <div class="plan-card plan-no-print">
          <h2 class="plan-card-title">{{ plan ? '重新生成计划' : '制定一份学习计划' }}</h2>
          <div class="plan-field">
            <label>课程</label>
            <select v-model="config.course">
              <option v-for="c in courses" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="plan-field-row">
            <div class="plan-field">
              <label>开始日期</label>
              <input type="date" v-model="config.startDate">
            </div>
            <div class="plan-field">
              <label>结束日期</label>
              <input type="date" v-model="config.endDate">
            </div>
          </div>
          <div class="plan-field">
            <label>每天可用学习时长</label>
            <select v-model.number="config.dailyMinutes">
              <option :value="30">30 分钟</option>
              <option :value="60">1 小时</option>
              <option :value="90">1.5 小时</option>
              <option :value="120">2 小时</option>
              <option :value="180">3 小时</option>
            </select>
          </div>
          <button class="plan-btn" @click="generate">{{ plan ? '重新生成' : '生成计划 →' }}</button>
          <span v-if="plan" class="plan-discard-link" @click="discard">丢弃当前计划</span>
        </div>

        <!-- 计划展示 -->
        <div v-if="plan" class="plan-card">
          <div class="plan-summary">
            <div class="plan-summary-item">
              <span class="plan-summary-num">{{ plan.days.length }}</span>
              <span class="plan-summary-label">天计划</span>
            </div>
            <div class="plan-summary-item">
              <span class="plan-summary-num">{{ totalHours }}</span>
              <span class="plan-summary-label">总学时(h)</span>
            </div>
            <div class="plan-summary-item">
              <span class="plan-summary-num">{{ doneCount }}/{{ plan.days.length }}</span>
              <span class="plan-summary-label">已完成</span>
            </div>
            <div class="plan-summary-actions plan-no-print">
              <button class="plan-btn plan-btn-ghost" @click="printPlan">🖨 打印/导出 PDF</button>
            </div>
          </div>

          <div class="plan-progress-bar plan-no-print">
            <div class="plan-progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>

          <div v-if="overflowNote" class="plan-note plan-no-print">⚠️ {{ overflowNote }}</div>

          <div
            v-for="(day, i) in plan.days" :key="day.dateISO"
            class="plan-day" :class="{ done: day.done }"
          >
            <label class="plan-day-check plan-no-print">
              <input type="checkbox" :checked="day.done" @change="toggleDay(i)">
              <span>{{ day.done ? '已完成' : '标记完成' }}</span>
            </label>
            <div class="plan-day-head">
              <span class="plan-day-date">第 {{ i + 1 }} 天 · {{ fmtDate(day.date) }}（周{{ weekday(day.date) }}）</span>
            </div>
            <div v-for="(t, j) in day.tasks" :key="j" class="plan-task">
              <div class="plan-task-title">
                📖 {{ t.title }}
                <span class="plan-task-min">{{ t.minutes }} 分钟<template v-if="t.minutes < t.unitTotal">（该单元共 {{ t.unitTotal }} 分钟，跨天完成）</template></span>
              </div>
              <div class="plan-task-points" v-if="t.points && t.points.length">要点：{{ t.points.join(' · ') }}</div>
              <div class="plan-task-links">
                <template v-for="mName in (t.materials || [])" :key="mName">
                  <a
                    v-if="materialLink(plan.course, mName)"
                    :href="materialLink(plan.course, mName).url" target="_blank" rel="noopener"
                  >📎 {{ mName }}</a>
                </template>
                <a
                  v-if="t.quizScope && t.quizScope.length"
                  :href="`/quiz?course=${encodeURIComponent(plan.course)}&knowledge=${encodeURIComponent(t.quizScope[0])}`"
                  class="plan-task-quiz"
                >✏️ 配套测试：{{ t.quizScope.join('、') }}</a>
              </div>
            </div>
          </div>

          <div class="plan-footer">计划保存在本机浏览器（localStorage），勾选进度自动记录。</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.plan-wrap { min-height: 60vh; }
.plan-hero {
  background: linear-gradient(135deg, #0D5C5A 0%, #148F8C 100%);
  color: #fff; text-align: center; padding: 48px 24px 56px;
}
.plan-hero-tag {
  display: inline-block; background: rgba(255,255,255,0.15); padding: 4px 12px;
  border-radius: 20px; font-size: 0.8rem; margin-bottom: 12px; backdrop-filter: blur(8px);
}
.plan-hero-title { font-family: var(--font-display); font-size: 2.2rem; margin: 0 0 10px; color: #fff !important; }
.plan-hero-sub { font-size: 0.95rem; opacity: 0.92; margin: 0; line-height: 1.7; color: #fff !important; }
.plan-inner { max-width: 760px; margin: -24px auto 48px; padding: 0 20px; }
.plan-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.plan-err { color: #dc2626; }

.plan-card {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 16px;
  padding: 28px; box-shadow: var(--shadow-card); margin-bottom: 20px;
}
.plan-card-title { font-family: var(--font-display); font-size: 1.3rem; color: var(--brand); margin: 0 0 20px; }

.plan-field { margin-bottom: 16px; }
.plan-field label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
.plan-field select, .plan-field input {
  width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 0.92rem; font-family: inherit; background: var(--bg-warm); color: var(--text-heading); box-sizing: border-box;
}
.plan-field select:focus, .plan-field input:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.plan-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 600px) { .plan-field-row { grid-template-columns: 1fr; gap: 0; } }

.plan-btn {
  display: inline-block; background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 11px 24px; font-size: 0.92rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.plan-btn:hover { background: var(--brand-light); }
.plan-btn-ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
.plan-btn-ghost:hover { background: var(--brand-pale); }
.plan-discard-link { margin-left: 14px; font-size: 0.85rem; color: #dc2626; cursor: pointer; text-decoration: underline; }

.plan-summary { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; margin-bottom: 16px; }
.plan-summary-item { display: flex; flex-direction: column; align-items: center; }
.plan-summary-num { font-family: var(--font-display); font-size: 1.7rem; font-weight: 700; color: var(--brand); }
.plan-summary-label { font-size: 0.78rem; color: var(--text-muted); }
.plan-summary-actions { margin-left: auto; }

.plan-progress-bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
.plan-progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand-light)); transition: width 0.3s; }

.plan-note { font-size: 0.85rem; color: #B45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }

.plan-day { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; transition: all 0.2s; }
.plan-day.done { background: var(--brand-pale); border-color: var(--brand); opacity: 0.85; }
.plan-day-check { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted); cursor: pointer; margin-bottom: 8px; }
.plan-day-check input { accent-color: var(--brand); width: 15px; height: 15px; }
.plan-day-head { margin-bottom: 10px; }
.plan-day-date { font-weight: 700; color: var(--brand); font-size: 0.95rem; }

.plan-task { padding: 10px 0; border-top: 1px dashed var(--line); }
.plan-task:first-of-type { border-top: none; padding-top: 0; }
.plan-task-title { font-size: 0.95rem; color: var(--text-heading); font-weight: 600; margin-bottom: 4px; }
.plan-task-min { font-weight: 400; font-size: 0.8rem; color: var(--text-muted); margin-left: 8px; }
.plan-task-points { font-size: 0.83rem; color: var(--text-body); margin-bottom: 6px; }
.plan-task-links { display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.83rem; }
.plan-task-links a { color: var(--brand); text-decoration: none; }
.plan-task-links a:hover { text-decoration: underline; }
.plan-task-quiz { font-weight: 600; }

.plan-footer { font-size: 0.8rem; color: var(--text-muted); margin-top: 16px; text-align: center; }

/* 打印：只输出计划内容 */
@media print {
  .plan-no-print, .VPNav, .VPSidebar, .custom-footer, .back-to-top { display: none !important; }
  .plan-wrap { background: #fff; }
  .plan-hero {
    background: #fff !important; color: #000 !important; padding: 0 0 16px !important;
    border-bottom: 2px solid #0D5C5A; border-radius: 0;
  }
  .plan-hero-title, .plan-hero-sub { color: #000 !important; }
  .plan-hero-tag { display: none; }
  .plan-inner { margin: 0 auto; max-width: 100%; padding: 0; }
  .plan-card { box-shadow: none; border: none; padding: 0; }
  .plan-day { break-inside: avoid; }
  .plan-day.done { background: #f0f0f0 !important; }
}

@media (max-width: 600px) {
  .plan-card { padding: 20px 16px; }
  .plan-hero-title { font-size: 1.7rem; }
  .plan-summary { gap: 16px; }
  .plan-summary-actions { margin-left: 0; width: 100%; }
}
</style>
