<script setup>
// 考试周冲刺包（/sprint）
// ------------------------------------------------------------------
// 方案 1.1 + 1.5：「考前一晚需要这门课的全部内容，一次给全」。
// 差异化：智能冲刺序列 —— 先高频（weight 高）后低频、先易（durationMin 短）后难，
// 附「考前 3 天倒计时清单」，勾选进度存本机。
//
// SSR 安全：setup 顶层不 fetch、不读 localStorage；数据在 onMounted 里补。
import { ref, computed, onMounted } from 'vue'
import { KEYS, read, write, downloadJson, addDays, todayISO } from '../lib/storage'

const syllabus = ref(null) // { 课程名: { course, code, units: [...] } }
const loading = ref(true)
const loadError = ref('')
const keyword = ref('')
const selected = ref('')
const examDate = ref('')
const done = ref({})
const restoreHint = ref('')

const courseNames = computed(() => Object.keys(syllabus.value || {}))

const filtered = computed(() => {
  const names = courseNames.value
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return names
  return names.filter((n) => {
    const code = (syllabus.value[n] && syllabus.value[n].code) || ''
    return n.toLowerCase().indexOf(kw) >= 0 || code.indexOf(kw) >= 0
  })
})

const current = computed(() => (selected.value && syllabus.value ? syllabus.value[selected.value] : null))

const units = computed(() => (current.value && Array.isArray(current.value.units) ? current.value.units : []))

// 智能排序：权重降序 → 时长升序（同权重先啃短的，先易后难）
const sortedUnits = computed(() =>
  units.value
    .slice()
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || (a.durationMin || 0) - (b.durationMin || 0))
)

const totalMinutes = computed(() => sortedUnits.value.reduce((s, u) => s + (u.durationMin || 0), 0))

const doneCount = computed(() => sortedUnits.value.filter((u) => done.value[u.id]).length)
const progress = computed(() =>
  sortedUnits.value.length ? Math.round((doneCount.value / sortedUnits.value.length) * 100) : 0
)

const exam = computed(() => {
  const v = examDate.value
  if (!v) return null
  const p = v.split('-').map(Number)
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return null
  return new Date(p[0], p[1] - 1, p[2])
})

const daysLeft = computed(() => {
  if (!exam.value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((exam.value.getTime() - today.getTime()) / 86400000)
})

const expired = computed(() => daysLeft.value !== null && daysLeft.value < 0)

function md(ts) {
  const d = new Date(ts)
  return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// 倒计时清单：按 durationMin 累加把有序章节切成 n 组（默认 D-3 / D-2 / D-1）
const plan = computed(() => {
  const d = daysLeft.value
  if (d === null || d < 0) return []
  const list = sortedUnits.value
  if (!list.length) return []

  const n = d >= 3 ? 3 : Math.max(d, 1)
  const total = list.reduce((s, u) => s + (u.durationMin || 0), 0) || list.length
  const groups = []
  for (let i = 0; i < n; i++) {
    const offset = d === 0 ? 0 : n - i
    groups.push({
      offset,
      label: d === 0 ? '今天 · 考试日' : 'D-' + offset,
      dateText: md(addDays(exam.value, -offset)),
      units: [],
      minutes: 0,
    })
  }

  let gi = 0
  let acc = 0
  list.forEach((u, idx) => {
    groups[gi].units.push(u)
    acc += u.durationMin || 0
    const groupsLeft = n - gi - 1
    const itemsLeft = list.length - idx - 1
    // 切在「离目标时长最近」的位置：累加后再塞一章会比现在更偏就不切
    const target = (total * (gi + 1)) / n
    const nextMin = list[idx + 1] ? list[idx + 1].durationMin || 0 : 0
    const cutNow = Math.abs(acc - target) <= Math.abs(acc + nextMin - target)
    if (gi < n - 1 && (itemsLeft <= groupsLeft || cutNow)) gi++
  })
  groups.forEach((g) => {
    g.minutes = g.units.reduce((s, u) => s + (u.durationMin || 0), 0)
  })
  return groups
})

const unitGroup = computed(() => {
  const map = {}
  plan.value.forEach((g) => g.units.forEach((u) => (map[u.id] = g.label)))
  return map
})

function stars(w) {
  const n = Math.max(1, Math.min(3, Number(w) || 1))
  return '★'.repeat(n)
}

function pointsText(u) {
  const p = Array.isArray(u.points) ? u.points : []
  if (!p.length) return ''
  const head = p.slice(0, 4).join(' · ')
  return p.length > 4 ? head + ' 等 ' + p.length + ' 个' : head
}

function scopeText(u) {
  const s = Array.isArray(u.quizScope) ? u.quizScope : []
  return s.join('、')
}

function persist() {
  write(KEYS.sprint, { course: selected.value, examDate: examDate.value, done: done.value })
}

function toggle(id) {
  if (done.value[id]) delete done.value[id]
  else done.value[id] = true
  // 直接替换对象引用，确保模板与持久化都看到最新状态
  done.value = { ...done.value }
  persist()
}

function selectCourse(name) {
  if (name === selected.value) return
  selected.value = name
  // unit id 在各课之间会重复（u1/u2…），换课即重置勾选
  done.value = {}
  persist()
}

function materialHref() {
  const code = current.value && current.value.code
  return code ? '/majors/shared/' + code : ''
}

function exportPlan() {
  const payload = {
    exportedAt: new Date().toISOString(),
    course: selected.value,
    code: (current.value && current.value.code) || '',
    examDate: examDate.value || '',
    totalMinutes: totalMinutes.value,
    units: sortedUnits.value.map((u, i) => ({
      order: i + 1,
      day: unitGroup.value[u.id] || '',
      id: u.id,
      title: u.title,
      weight: u.weight,
      durationMin: u.durationMin,
      points: u.points || [],
      materials: u.materials || [],
      quizScope: u.quizScope || [],
      done: !!done.value[u.id],
    })),
  }
  downloadJson('knowbase-sprint-' + ((current.value && current.value.code) || selected.value) + '-' + todayISO() + '.json', payload)
}

onMounted(async () => {
  const saved = read(KEYS.sprint, null)
  if (saved && typeof saved === 'object') {
    if (saved.course) selected.value = saved.course
    if (saved.examDate) examDate.value = saved.examDate
    if (saved.done && typeof saved.done === 'object') done.value = saved.done
    if (saved.course) restoreHint.value = '已恢复上次的冲刺计划（含勾选进度）'
  }

  // 支持从课程页带参进入：/sprint?course=信号与系统
  try {
    const q = new URLSearchParams(window.location.search).get('course')
    if (q && q !== selected.value) {
      selected.value = q
      done.value = {}
    }
  } catch (e) {
    /* 参数解析失败不影响主流程 */
  }

  try {
    const res = await fetch('/data/syllabus.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    syllabus.value = data && typeof data === 'object' ? data : {}
  } catch (e) {
    loadError.value = '章节大纲加载失败：' + (e && e.message ? e.message : e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="sp">
    <!-- 选课 -->
    <section class="sp-card sp-picker">
      <div class="sp-card-head">
        <h2>选一门课</h2>
        <span class="sp-card-sub">
          <template v-if="loading">正在载入章节大纲…</template>
          <template v-else-if="courseNames.length">共 {{ courseNames.length }} 门有章节大纲</template>
          <template v-else>暂无可选课程</template>
        </span>
      </div>
      <input
        v-model="keyword"
        class="sp-input"
        type="search"
        placeholder="输入课程名或课程代码筛选，如「信号」「1211204000」"
        aria-label="筛选课程"
      />
      <div v-if="!loading" class="sp-chips">
        <button
          v-for="n in filtered"
          :key="n"
          type="button"
          class="sp-chip"
          :class="{ 'is-on': n === selected }"
          @click="selectCourse(n)"
        >
          {{ n }}
        </button>
        <p v-if="!filtered.length" class="sp-muted">没有匹配的课程，换个关键词试试。</p>
      </div>
      <p v-if="loadError" class="sp-error">{{ loadError }}</p>
      <p v-if="restoreHint" class="sp-muted">{{ restoreHint }}</p>
    </section>

    <!-- 选定课程 -->
    <section v-if="selected" class="sp-card">
      <div class="sp-card-head">
        <h2>{{ selected }}</h2>
        <span v-if="current && current.code" class="sp-card-sub">课程代码 {{ current.code }}</span>
      </div>

      <div class="sp-exam">
        <label class="sp-exam-label" for="sp-exam-date">考试日期</label>
        <input id="sp-exam-date" v-model="examDate" class="sp-input sp-input-date" type="date" @change="persist" />
        <span v-if="daysLeft !== null && !expired" class="sp-count">
          <template v-if="daysLeft === 0">就是今天</template>
          <template v-else>还有 {{ daysLeft }} 天</template>
        </span>
        <span v-else-if="expired" class="sp-count is-past">已考完，可当复习清单用</span>
        <span v-else class="sp-muted">填上日期，自动排出考前 3 天清单</span>
      </div>

      <div v-if="units.length" class="sp-progress">
        <div class="sp-progress-bar">
          <span class="sp-progress-fill" :style="{ width: progress + '%' }"></span>
        </div>
        <span class="sp-progress-text">已过 {{ doneCount }}/{{ sortedUnits.length }} 章 · {{ progress }}%</span>
      </div>

      <div class="sp-actions">
        <a v-if="materialHref()" class="sp-btn sp-btn-primary" :href="materialHref()">看这门课的资料</a>
        <a class="sp-btn sp-btn-ghost" href="/quiz">去做这门课的题</a>
        <button v-if="units.length" class="sp-btn sp-btn-ghost" type="button" @click="exportPlan">导出冲刺清单</button>
      </div>

      <p v-if="!units.length" class="sp-empty">
        这门课还没有章节大纲，可以先看<a :href="materialHref() || '/majors/shared/'">资料</a>。
      </p>
    </section>

    <p v-else-if="!loading" class="sp-muted sp-hint">
      选一门课后，这里会按「先高频后低频、先易后难」自动排出冲刺顺序。
    </p>

    <template v-if="selected && units.length">
      <!-- 冲刺序列 -->
      <section class="sp-card">
        <div class="sp-card-head">
          <h2>冲刺序列</h2>
          <span class="sp-card-sub">按权重降序 · 同权重先短后长 · 预计 {{ totalMinutes }} 分钟</span>
        </div>
        <ol class="sp-seq">
          <li v-for="(u, i) in sortedUnits" :key="u.id" class="sp-unit" :class="{ 'is-done': done[u.id] }">
            <label class="sp-unit-main">
              <input type="checkbox" class="sp-check" :checked="!!done[u.id]" @change="toggle(u.id)" />
              <span class="sp-order">{{ i + 1 }}</span>
              <span class="sp-unit-body">
                <span class="sp-unit-title">{{ u.title }}</span>
                <span class="sp-unit-meta">
                  <span class="sp-star">{{ stars(u.weight) }}</span>
                  <span>{{ u.durationMin }} 分钟</span>
                  <span v-if="unitGroup[u.id]" class="sp-tag">{{ unitGroup[u.id] }}</span>
                </span>
                <span v-if="pointsText(u)" class="sp-unit-points">{{ pointsText(u) }}</span>
                <span v-if="scopeText(u)" class="sp-unit-scope">组卷范围：{{ scopeText(u) }}</span>
              </span>
            </label>
          </li>
        </ol>
      </section>

      <!-- 考前倒计时清单 -->
      <section class="sp-card">
        <div class="sp-card-head">
          <h2>考前倒计时清单</h2>
          <span class="sp-card-sub">
            <template v-if="!examDate">填了考试日期才有倒计时</template>
            <template v-else-if="expired">已考完，可当复习清单用</template>
            <template v-else>{{ plan.length }} 天 · 按预计时长均分</template>
          </span>
        </div>

        <p v-if="expired" class="sp-note">这门课的考试日期已过去，下面的分组不再倒计时，整份序列可直接当复习清单用。</p>
        <p v-else-if="!examDate" class="sp-note">填上考试日期，章节会按预计时长自动切成 D-3 / D-2 / D-1 三段。</p>

        <div v-for="g in plan" :key="g.label" class="sp-day">
          <div class="sp-day-head">
            <b class="sp-day-label">{{ g.label }}</b>
            <span class="sp-day-meta">{{ g.dateText }} · {{ g.units.length }} 章 · {{ g.minutes }} 分钟</span>
          </div>
          <ul v-if="g.units.length" class="sp-day-list">
            <li v-for="u in g.units" :key="u.id" :class="{ 'is-done': done[u.id] }">
              <label class="sp-day-item">
                <input type="checkbox" class="sp-check" :checked="!!done[u.id]" @change="toggle(u.id)" />
                <span class="sp-day-title">{{ u.title }}</span>
                <span class="sp-day-time">{{ stars(u.weight) }} · {{ u.durationMin }}′</span>
              </label>
            </li>
          </ul>
          <p v-else class="sp-muted sp-day-empty">这一天留白：复盘错题、重做一次组卷。</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sp {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.sp-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px 24px 24px;
}
.sp-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.sp-card-head h2 {
  margin: 0;
  font-family: var(--font-display, serif);
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--text-heading);
  border: none;
  padding: 0;
}
.sp-card-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.sp-muted {
  font-size: 0.82rem;
  color: var(--text-muted);
}
.sp-error {
  margin: 12px 0 0;
  font-size: 0.82rem;
  color: var(--brand);
}
.sp-hint {
  margin: 0;
  padding: 18px 20px;
  border: 1px dashed var(--line);
  border-radius: 14px;
}

/* 输入与筛选 */
.sp-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  color: var(--text-body);
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
}
.sp-input:focus {
  border-color: var(--brand);
}
.sp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 232px;
  overflow-y: auto;
  margin-top: 14px;
  padding-right: 4px;
}
.sp-chip {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-body);
  border-radius: 20px;
  padding: 5px 13px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.sp-chip:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.sp-chip.is-on {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

/* 考试日期 */
.sp-exam {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--line);
}
.sp-exam-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-heading);
}
.sp-input-date {
  width: auto;
  min-width: 168px;
  padding: 7px 12px;
}
.sp-count {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--brand);
}
.sp-count.is-past {
  color: var(--text-muted);
}

/* 进度 */
.sp-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.sp-progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 6px;
  background: var(--brand-pale);
  overflow: hidden;
}
.sp-progress-fill {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 6px;
  transition: width 0.25s ease;
}
.sp-progress-text {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 出口按钮 */
.sp-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.sp-btn {
  display: inline-block;
  border-radius: 10px;
  padding: 9px 18px;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity 0.15s ease;
  font-family: inherit;
}
.sp-btn:hover {
  opacity: 0.86;
}
.sp-btn-primary {
  background: var(--brand);
  color: #fff;
}
.sp-btn-ghost {
  background: transparent;
  color: var(--text-body);
  border-color: var(--line);
}
.sp-empty {
  margin: 16px 0 0;
  font-size: 0.88rem;
  line-height: 1.8;
  color: var(--text-body);
}
.sp-empty a {
  color: var(--brand);
  font-weight: 600;
}

/* 冲刺序列 */
.sp-seq {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sp-unit {
  border-bottom: 1px dashed var(--line);
}
.sp-unit:last-child {
  border-bottom: none;
}
.sp-unit-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 0;
  cursor: pointer;
}
.sp-check {
  flex-shrink: 0;
  margin-top: 3px;
  width: 15px;
  height: 15px;
  accent-color: var(--brand);
  cursor: pointer;
}
.sp-order {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--brand-pale);
  color: var(--brand);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sp-unit-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-unit-title {
  font-size: 0.94rem;
  font-weight: 600;
  color: var(--text-heading);
  line-height: 1.5;
}
.sp-unit-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.sp-star {
  color: var(--brand);
  letter-spacing: 1px;
}
.sp-tag {
  padding: 0 7px;
  border-radius: 20px;
  background: var(--brand-pale);
  color: var(--brand);
  font-size: 0.72rem;
}
.sp-unit-points {
  font-size: 0.8rem;
  color: var(--text-body);
  line-height: 1.6;
}
.sp-unit-scope {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.sp-unit.is-done .sp-unit-title,
.sp-day-list li.is-done .sp-day-title {
  color: var(--text-muted);
  text-decoration: line-through;
}

/* 倒计时清单 */
.sp-note {
  margin: 0 0 14px;
  padding: 9px 13px;
  border-left: 3px solid var(--brand);
  background: var(--brand-pale);
  border-radius: 0 8px 8px 0;
  font-size: 0.84rem;
  line-height: 1.7;
  color: var(--text-heading);
}
.sp-day {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.sp-day:last-child {
  margin-bottom: 0;
}
.sp-day-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.sp-day-label {
  font-family: var(--font-display, serif);
  font-size: 0.98rem;
  color: var(--brand);
}
.sp-day-meta {
  font-size: 0.76rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.sp-day-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sp-day-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
}
.sp-day-title {
  flex: 1;
  min-width: 0;
  font-size: 0.86rem;
  color: var(--text-body);
  line-height: 1.5;
}
.sp-day-time {
  flex-shrink: 0;
  font-size: 0.76rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.sp-day-empty {
  margin: 0;
}

@media (max-width: 640px) {
  .sp-card {
    padding: 18px 16px 20px;
  }
  .sp-chips {
    max-height: 200px;
  }
  .sp-progress {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .sp-actions .sp-btn {
    flex: 1 1 auto;
    text-align: center;
  }
  .sp-unit-meta {
    gap: 8px;
  }
}
</style>
