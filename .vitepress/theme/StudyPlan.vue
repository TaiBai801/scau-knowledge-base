<script setup>
import { ref, computed, onMounted } from 'vue'

// ============ 数据 ============
const syllabus = ref({})   // { 课程名: { course, code, units:[] } }
const materials = ref({})  // { 课程名: [{name,url,ext}] }
const loading = ref(true)
const loadError = ref('')

// ============ 配置 ============
const config = ref({
  courses: ['C语言程序设计'],   // 多选
  startDate: todayISO(),
  endDate: addDaysISO(14),
  dailyMinutes: 60,
  examDate: '',               // 选填：考试/截止日期
})

const courseSearch = ref('')

// ============ 计划状态 ============
const plan = ref(null)      // { courses, examDate, days:[{dateISO, tasks:[{course, unitTitle, minutes, unitId}], done}], totalMinutes }
const overflowNote = ref('')
const viewMode = ref('daily')   // daily | weekly

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
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d) { return `${d.getMonth() + 1}月${d.getDate()}日` }
function weekday(d) { return '日一二三四五六'[d.getDay()] }
function weekStart(d) {  // 周一为一周起点
  const w = new Date(d)
  const diff = (w.getDay() + 6) % 7
  w.setDate(w.getDate() - diff)
  return w
}

// ============ 课程选择 ============
const courses = computed(() => Object.keys(syllabus.value))
const filteredCourses = computed(() => {
  const kw = courseSearch.value.trim().toLowerCase()
  const list = kw
    ? courses.value.filter(c => c.toLowerCase().includes(kw))
    : courses.value.slice()
  return list.slice(0, 60)   // 防止一次渲染过多
})
function unitCount(name) {
  return ((syllabus.value[name] || {}).units || []).length
}
function removeCourse(name) {
  const i = config.value.courses.indexOf(name)
  if (i >= 0) config.value.courses.splice(i, 1)
}

// ============ 生成算法（多课程轮转混排） ============
function generate() {
  const picked = config.value.courses.filter(n => syllabus.value[n])
  const skipped = config.value.courses.filter(n => !syllabus.value[n])
  if (!picked.length) { loadError.value = '请至少选择一门有学习单元的课程。'; return }

  const start = parseISO(config.value.startDate)
  const end = parseISO(config.value.endDate)
  if (end < start) { loadError.value = '结束日期不能早于开始日期'; return }
  const dayCount = Math.round((end - start) / 86400000) + 1

  // 多课程单元轮转队列：A1,B1,C1,A2,B2,C2,…（课程内保持章节顺序）
  const iters = picked.map(name => ({ course: name, units: syllabus.value[name].units, i: 0 }))
  const queue = []
  let progressed = true
  while (progressed) {
    progressed = false
    for (const it of iters) {
      if (it.i < it.units.length) {
        queue.push({ course: it.course, unit: it.units[it.i] })
        it.i++
        progressed = true
      }
    }
  }
  if (!queue.length) { loadError.value = '所选课程暂无学习单元数据'; return }

  const totalNeed = queue.reduce((s, t) => s + t.unit.durationMin, 0)
  const totalAvail = dayCount * config.value.dailyMinutes

  // 时间不够：按比例压缩每个单元时长，并提示
  let scale = 1
  overflowNote.value = ''
  if (totalNeed > totalAvail) {
    scale = totalAvail / totalNeed
    overflowNote.value = `总需求 ${totalNeed} 分钟 > 可用 ${totalAvail} 分钟，已按 ${(scale * 100).toFixed(0)}% 压缩各单元时长。建议延长日期范围或增加每日时长。`
  }
  if (skipped.length) {
    overflowNote.value += (overflowNote.value ? ' ' : '') + `已跳过暂无章节数据的课程：${skipped.join('、')}。`
  }

  // 考试倒计时提示
  if (config.value.examDate) {
    const exam = parseISO(config.value.examDate)
    if (exam < start) {
      overflowNote.value += ' ⚠️ 考试日期早于开始日期，请检查。'
    } else if (exam <= end) {
      const examDay = Math.round((exam - start) / 86400000) + 1
      overflowNote.value += ` 📌 考试落在第 ${examDay} 天，其后安排可作考后巩固。`
    }
  }

  // 顺序切"天"：跨课程的单元轮着来，当天额度用完进入下一天
  const days = []
  let qIdx = 0
  let remain = Math.round(queue[0].unit.durationMin * scale)
  for (let d = 0; d < dayCount && qIdx < queue.length; d++) {
    let cap = config.value.dailyMinutes
    const tasks = []
    while (cap > 0 && qIdx < queue.length) {
      const take = Math.min(cap, remain)
      tasks.push({
        course: queue[qIdx].course,
        unitId: queue[qIdx].unit.id,
        title: queue[qIdx].unit.title,
        points: queue[qIdx].unit.points,
        materials: queue[qIdx].unit.materials,
        quizScope: queue[qIdx].unit.quizScope,
        minutes: take,
        unitTotal: queue[qIdx].unit.durationMin,
      })
      cap -= take
      remain -= take
      if (remain <= 0) {
        qIdx++
        if (qIdx < queue.length) remain = Math.round(queue[qIdx].unit.durationMin * scale)
      }
    }
    const date = new Date(start)
    date.setDate(start.getDate() + d)
    days.push({ dateISO: isoOf(date), date, tasks, done: false })
  }

  plan.value = { courses: picked.slice(), examDate: config.value.examDate, days, createdAt: Date.now() }
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
    // v2：courses 数组；v1 旧格式：course 单值
    if (p.courses && p.courses.length) config.value.courses = p.courses.slice()
    else if (p.course) config.value.courses = [p.course]
    if (p.examDate) config.value.examDate = p.examDate
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
const multiCourse = computed(() => plan.value && plan.value.courses && plan.value.courses.length > 1)

// 考试倒计时（整体）
const examCountdown = computed(() => {
  if (!plan.value || !plan.value.examDate) return null
  const exam = parseISO(plan.value.examDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((exam - today) / 86400000)
  if (diff < 0) return { label: '考试已过', days: diff, past: true }
  if (diff === 0) return { label: '就是今天！', days: 0, past: false }
  return { label: `${diff} 天`, days: diff, past: false }
})

// 每日倒计时标注
function examTag(d) {
  if (!plan.value || !plan.value.examDate) return ''
  const diff = Math.round((parseISO(plan.value.examDate) - d.date) / 86400000)
  if (diff > 0) return `距考试 ${diff} 天`
  if (diff === 0) return '📚 考试日'
  return ''
}

// ============ 按周视图 ============
const weeks = computed(() => {
  if (!plan.value) return []
  const out = []
  let cur = null
  plan.value.days.forEach(d => {
    const ws = isoOf(weekStart(d.date))
    if (!cur || cur.startISO !== ws) {
      cur = { startISO: ws, days: [], totalMin: 0, doneCount: 0 }
      out.push(cur)
    }
    cur.days.push(d)
    cur.totalMin += d.tasks.reduce((s, t) => s + t.minutes, 0)
    if (d.done) cur.doneCount++
  })
  out.forEach(w => {
    w.range = out.length > 1 ? `${fmtDate(w.days[0].date)}–${fmtDate(w.days[w.days.length - 1].date)}` : fmtDate(w.days[0].date)
  })
  return out
})

const displayList = computed(() => {
  if (!plan.value) return []
  if (viewMode.value === 'daily') {
    return plan.value.days.map((d, i) => ({ type: 'day', day: d, dayIdx: i }))
  }
  const out = []
  weeks.value.forEach((w, wi) => {
    out.push({ type: 'week', week: w, index: wi + 1 })
    w.days.forEach(d => out.push({ type: 'day', day: d, dayIdx: plan.value.days.indexOf(d) }))
  })
  return out
})

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
    materials.value = m
    const keys = Object.keys(s)
    if (keys.length) {
      // 支持 URL 参数预选：/plan?course=X（供组题页"生成学习计划"深链）
      const params = new URLSearchParams(location.search)
      const c = params.get('course')
      if (c && keys.includes(c)) config.value.courses = [c]
      else if (!keys.includes(config.value.courses[0])) config.value.courses = [keys[0]]
    }
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
      <p class="plan-hero-sub">多门课程混排轮转，给定时间范围自动按章节权重排期——每天学什么、用什么资料、配什么测试、距考试还剩几天，一目了然。</p>
    </div>

    <div class="plan-inner">
      <div v-if="loading" class="plan-state">数据加载中…</div>
      <div v-else-if="loadError && !plan" class="plan-state plan-err">{{ loadError }}</div>

      <template v-else>
        <!-- 配置 -->
        <div class="plan-card plan-no-print">
          <h2 class="plan-card-title">{{ plan ? '重新生成计划' : '制定一份学习计划' }}</h2>

          <div class="plan-field">
            <label>课程（可多选，混排复习）</label>
            <input v-model.trim="courseSearch" type="text" class="plan-search" placeholder="搜索课程名…">
            <div class="plan-course-list">
              <label v-for="c in filteredCourses" :key="c" class="plan-course-item">
                <input type="checkbox" :value="c" v-model="config.courses">
                <span class="plan-course-name">{{ c }}</span>
                <em class="plan-course-units">{{ unitCount(c) }} 章</em>
              </label>
              <div v-if="!filteredCourses.length" class="plan-course-empty">没有匹配的课程</div>
            </div>
            <div v-if="config.courses.length" class="plan-course-chips">
              已选：
              <span v-for="c in config.courses" :key="c" class="plan-chip" @click="removeCourse(c)">{{ c }} ✕</span>
            </div>
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
          <div class="plan-field-row">
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
            <div class="plan-field">
              <label>考试/截止日期（选填）</label>
              <input type="date" v-model="config.examDate">
            </div>
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
              <span class="plan-summary-num">{{ plan.courses.length }}</span>
              <span class="plan-summary-label">门课程</span>
            </div>
            <div class="plan-summary-item">
              <span class="plan-summary-num">{{ totalHours }}</span>
              <span class="plan-summary-label">总学时(h)</span>
            </div>
            <div class="plan-summary-item">
              <span class="plan-summary-num">{{ doneCount }}/{{ plan.days.length }}</span>
              <span class="plan-summary-label">已完成</span>
            </div>
            <div v-if="examCountdown" class="plan-summary-item">
              <span class="plan-summary-num plan-exam-num" :class="{ past: examCountdown.past }">{{ examCountdown.days }}</span>
              <span class="plan-summary-label">天距考试</span>
            </div>
            <div class="plan-summary-actions plan-no-print">
              <button class="plan-btn plan-btn-ghost" @click="printPlan">🖨 打印/导出 PDF</button>
            </div>
          </div>

          <div class="plan-progress-bar plan-no-print">
            <div class="plan-progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>

          <div v-if="overflowNote" class="plan-note plan-no-print">⚠️ {{ overflowNote }}</div>

          <!-- 视图切换 -->
          <div class="plan-view-toggle plan-no-print">
            <button :class="{ active: viewMode === 'daily' }" @click="viewMode = 'daily'">按日</button>
            <button :class="{ active: viewMode === 'weekly' }" @click="viewMode = 'weekly'">按周</button>
          </div>

          <template v-for="(item, idx) in displayList" :key="idx">
            <!-- 周标题（按周视图） -->
            <div v-if="item.type === 'week'" class="plan-week-head">
              <span class="plan-week-title">第 {{ item.index }} 周 · {{ item.week.range }}</span>
              <span class="plan-week-meta">{{ item.week.totalMin }} 分钟 · {{ item.week.doneCount }}/{{ item.week.days.length }} 天完成</span>
            </div>

            <!-- 天卡片 -->
            <div v-else class="plan-day" :class="{ done: item.day.done }">
              <label class="plan-day-check plan-no-print">
                <input type="checkbox" :checked="item.day.done" @change="toggleDay(item.dayIdx)">
                <span>{{ item.day.done ? '已完成' : '标记完成' }}</span>
              </label>
              <div class="plan-day-head">
                <span class="plan-day-date">第 {{ item.dayIdx + 1 }} 天 · {{ fmtDate(item.day.date) }}（周{{ weekday(item.day.date) }}）</span>
                <span v-if="examTag(item.day)" class="plan-day-exam" :class="{ today: examTag(item.day) === '📚 考试日' }">{{ examTag(item.day) }}</span>
              </div>
              <div v-for="(t, j) in item.day.tasks" :key="j" class="plan-task">
                <div class="plan-task-title">
                  📖 {{ t.title }}
                  <span v-if="multiCourse" class="plan-task-course">{{ t.course }}</span>
                  <span class="plan-task-min">{{ t.minutes }} 分钟<template v-if="t.minutes < t.unitTotal">（该单元共 {{ t.unitTotal }} 分钟，跨天完成）</template></span>
                </div>
                <div class="plan-task-points" v-if="t.points && t.points.length">要点：{{ t.points.join(' · ') }}</div>
                <div class="plan-task-links">
                  <template v-for="mName in (t.materials || [])" :key="mName">
                    <a
                      v-if="materialLink(t.course, mName)"
                      :href="materialLink(t.course, mName).url" target="_blank" rel="noopener"
                    >📎 {{ mName }}</a>
                  </template>
                  <a
                    v-if="t.quizScope && t.quizScope.length"
                    :href="`/quiz?course=${encodeURIComponent(t.course)}&knowledge=${encodeURIComponent(t.quizScope[0])}`"
                    class="plan-task-quiz"
                  >✏️ 配套测试：{{ t.quizScope.join('、') }}</a>
                </div>
              </div>
            </div>
          </template>

          <div class="plan-footer">计划保存在本机浏览器（localStorage），勾选进度自动记录。</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.plan-wrap { min-height: 60vh; }
.plan-hero {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%);
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
.plan-err { color: var(--color-danger); }

.plan-card {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 16px;
  padding: 28px; box-shadow: var(--shadow-card); margin-bottom: 20px;
}
.plan-card-title { font-family: var(--font-display); font-size: 1.3rem; color: var(--brand); margin: 0 0 20px; }

.plan-field { margin-bottom: 16px; }
.plan-field label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
.plan-field select, .plan-field input, .plan-search {
  width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 0.92rem; font-family: inherit; background: var(--bg-warm); color: var(--text-heading); box-sizing: border-box;
}
.plan-field select:focus, .plan-field input:focus, .plan-search:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.plan-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 600px) { .plan-field-row { grid-template-columns: 1fr; gap: 0; } }

/* 课程选择器 */
.plan-search { margin-bottom: 10px; }
.plan-course-list {
  max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-warm); padding: 6px;
}
.plan-course-item {
  display: flex; align-items: center; gap: 10px; padding: 7px 10px;
  border-radius: 6px; cursor: pointer; font-size: 0.9rem; color: var(--text-body);
}
.plan-course-item:hover { background: var(--brand-pale); }
.plan-course-item input { accent-color: var(--brand); width: 15px; height: 15px; flex-shrink: 0; }
.plan-course-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-course-units { font-style: normal; font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0; }
.plan-course-empty { padding: 16px; text-align: center; font-size: 0.85rem; color: var(--text-muted); }
.plan-course-chips { margin-top: 10px; font-size: 0.83rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.plan-chip {
  display: inline-block; background: var(--brand-pale); color: var(--brand);
  border: 1px solid var(--brand); border-radius: 14px; padding: 3px 12px;
  font-size: 0.8rem; cursor: pointer; transition: all 0.15s;
}
.plan-chip:hover { background: #fee2e2; border-color: var(--color-danger); color: var(--color-danger); }

.plan-btn {
  display: inline-block; background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 11px 24px; font-size: 0.92rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.plan-btn:hover { background: var(--brand-light); }
.plan-btn-ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
.plan-btn-ghost:hover { background: var(--brand-pale); }
.plan-discard-link { margin-left: 14px; font-size: 0.85rem; color: var(--color-danger); cursor: pointer; text-decoration: underline; }

.plan-summary { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; margin-bottom: 16px; }
.plan-summary-item { display: flex; flex-direction: column; align-items: center; }
.plan-summary-num { font-family: var(--font-display); font-size: 1.7rem; font-weight: 700; color: var(--brand); }
.plan-summary-num.plan-exam-num { color: var(--color-warning); }
.plan-summary-num.plan-exam-num.past { color: var(--text-muted); }
.plan-summary-label { font-size: 0.78rem; color: var(--text-muted); }
.plan-summary-actions { margin-left: auto; }

.plan-progress-bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
.plan-progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand), var(--brand-light)); transition: width 0.3s; }

.plan-note { font-size: 0.85rem; color: var(--color-warning); background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; line-height: 1.7; }

/* 视图切换 */
.plan-view-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
.plan-view-toggle button {
  padding: 6px 18px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg-warm);
  color: var(--text-muted); font-size: 0.83rem; cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.plan-view-toggle button.active { border-color: var(--brand); color: var(--brand); background: var(--brand-pale); font-weight: 600; }

/* 周标题 */
.plan-week-head {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  margin: 20px 0 10px; padding: 10px 14px;
  background: var(--brand-pale); border-radius: 10px; break-inside: avoid;
}
.plan-week-title { font-weight: 700; color: var(--brand); font-size: 0.92rem; }
.plan-week-meta { font-size: 0.78rem; color: var(--text-muted); }

.plan-day { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; transition: all 0.2s; }
.plan-day.done { background: var(--brand-pale); border-color: var(--brand); opacity: 0.85; }
.plan-day-check { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text-muted); cursor: pointer; margin-bottom: 8px; }
.plan-day-check input { accent-color: var(--brand); width: 15px; height: 15px; }
.plan-day-head { margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.plan-day-date { font-weight: 700; color: var(--brand); font-size: 0.95rem; }
.plan-day-exam {
  font-size: 0.75rem; color: var(--color-warning); background: #fffbeb;
  border: 1px solid #fde68a; border-radius: 12px; padding: 2px 10px;
}
.plan-day-exam.today { color: var(--color-danger); background: var(--color-danger-pale); border-color: #fecaca; font-weight: 700; }

.plan-task { padding: 10px 0; border-top: 1px dashed var(--line); }
.plan-task:first-of-type { border-top: none; padding-top: 0; }
.plan-task-title { font-size: 0.95rem; color: var(--text-heading); font-weight: 600; margin-bottom: 4px; }
.plan-task-min { font-weight: 400; font-size: 0.8rem; color: var(--text-muted); margin-left: 8px; }
.plan-task-course {
  font-weight: 500; font-size: 0.75rem; color: #2563EB; background: #eff6ff;
  border-radius: 10px; padding: 2px 10px; margin-right: 6px; vertical-align: 1px;
}
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
    border-bottom: 2px solid var(--brand); border-radius: 0;
  }
  .plan-hero-title, .plan-hero-sub { color: #000 !important; }
  .plan-hero-tag { display: none; }
  .plan-inner { margin: 0 auto; max-width: 100%; padding: 0; }
  .plan-card { box-shadow: none; border: none; padding: 0; }
  .plan-day { break-inside: avoid; }
  .plan-day.done { background: #f0f0f0 !important; }
  .plan-week-head { break-inside: avoid; }
}

@media (max-width: 600px) {
  .plan-card { padding: 20px 16px; }
  .plan-hero-title { font-size: 1.7rem; }
  .plan-summary { gap: 16px; }
  .plan-summary-actions { margin-left: 0; width: 100%; }
}
</style>
