<script setup>
import { computed, onMounted, ref } from 'vue'

// 「我的本学期」：培养方案给的是"应该上的课"，不是"你在上的课"。
// 提前选修、重修、免修都会让两者不一致，所以这里默认按培养方案预填，但允许学生自己勾。
// 只存浏览器本机（localStorage），不做学籍管理。
const INDEX_URL = '/data/semester-index.json'
const SUBMIT_URL = '/api/submissions'
const LS_KEY = 'my_term_v1'
const KINDS = ['课件', '习题', '真题', '笔记', '其他']

const loading = ref(true)
const failed = ref(false)
const index = ref(null)

// 学生选择
const major = ref('')
const enrollYear = ref(0)
const semester = ref(0)
const active = ref([]) // 在修课程名
const dirty = ref(false)

// 弹窗
const askOpen = ref(false)
const askForm = ref({ course: '', kind: '课件', note: '', contact: '' })
const askMsg = ref('')
const askErr = ref('')
const askSending = ref(false)

function fp() {
  let f = ''
  try {
    f = localStorage.getItem('kx_fp') || localStorage.getItem('bounty_fp') || ''
  } catch (e) {}
  if (!f) {
    f = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    try {
      localStorage.setItem('kx_fp', f)
    } catch (e) {}
  }
  return f
}

/* ── 当前学期推算 ──
   秋季：9 月 — 次年 1 月；8 月算"即将到来的秋季"
   春季：2 月 — 7 月
   1 月要按上一年算（2027-01 仍是 2026 秋的第 5 学期） */
function calcSemester(enroll) {
  const now = new Date()
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  let effYear
  let autumn
  if (m === 1) {
    effYear = y - 1
    autumn = true
  } else if (m >= 8) {
    effYear = y
    autumn = true
  } else {
    effYear = y
    autumn = false
  }
  const d = effYear - Number(enroll || 0)
  const sem = autumn ? d * 2 + 1 : d * 2
  return Math.min(8, Math.max(1, sem))
}

/* ── 从索引里整理出「专业 → 年级 → 学期 → 课程」── */
const tree = computed(() => {
  const out = {}
  const sems = (index.value && index.value.semesters) || {}
  Object.keys(sems).forEach((path) => {
    const e = sems[path]
    if (!e || !e.major || !e.year) return
    const M = (out[e.major] = out[e.major] || {})
    const Y = (M[e.year] = M[e.year] || {})
    Y[e.semester] = (e.courses || []).slice()
  })
  return out
})

const majors = computed(() => Object.keys(tree.value).sort((a, b) => a.localeCompare(b, 'zh')))
const years = computed(() => {
  const m = tree.value[major.value]
  return m ? Object.keys(m).map(Number).sort((a, b) => b - a) : []
})
const semestersAvail = computed(() => {
  const m = tree.value[major.value]
  const y = m && m[enrollYear.value]
  return y ? Object.keys(y).map(Number).sort((a, b) => a - b) : []
})

// 当前学期的培养方案课程
const planCourses = computed(() => {
  const m = tree.value[major.value]
  const y = m && m[enrollYear.value]
  return (y && y[semester.value]) || []
})

// 全专业（同年级）所有课程，按学期分组，用于"添加其他学期的课"
const otherGroups = computed(() => {
  const m = tree.value[major.value]
  const y = m && m[enrollYear.value]
  if (!y) return []
  const act = new Set(active.value)
  const groups = []
  Object.keys(y)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((sem) => {
      const list = (y[sem] || []).filter((c) => !act.has(c.name))
      if (list.length) groups.push({ sem, list })
    })
  return groups
})

const activeSet = computed(() => new Set(active.value))

// 当前清单：培养方案的课（含已取消的）+ 额外添加的课
const rows = computed(() => {
  const plan = planCourses.value
  const planNames = new Set(plan.map((c) => c.name))
  const extra = active.value
    .filter((n) => !planNames.has(n))
    .map((n) => findCourse(n))
    .filter(Boolean)
  const all = plan.concat(extra)
  return all
})

function findCourse(name) {
  const m = tree.value[major.value]
  const y = m && m[enrollYear.value]
  if (!y) return null
  for (const s of Object.keys(y)) {
    const hit = (y[s] || []).find((c) => c.name === name)
    if (hit) return hit
  }
  return null
}

const stats = computed(() => {
  const list = rows.value.filter((c) => activeSet.value.has(c.name))
  return {
    total: list.length,
    withMat: list.filter((c) => c.materials > 0).length,
    noMat: list.filter((c) => c.materials === 0).length,
  }
})

const configured = computed(() => !!major.value && !!enrollYear.value && !!semester.value)

/* ── 持久化 ── */
function save() {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        major: major.value,
        enrollYear: enrollYear.value,
        semester: semester.value,
        courses: active.value,
        updatedAt: Date.now(),
      })
    )
    dirty.value = false
  } catch (e) {}
}

function restore() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return false
    const d = JSON.parse(raw)
    if (!d || !d.major) return false
    major.value = d.major
    enrollYear.value = d.enrollYear
    semester.value = d.semester
    active.value = Array.isArray(d.courses) ? d.courses : []
    return true
  } catch (e) {
    return false
  }
}

/* ── 交互 ── */
function onMajorChange() {
  const ys = years.value
  if (!ys.length) return
  enrollYear.value = ys[0]
  onYearChange()
}

function onYearChange() {
  const sems = semestersAvail.value
  if (!sems.length) return
  semester.value = calcSemester(enrollYear.value)
  if (!sems.includes(semester.value)) semester.value = sems[0]
  fillFromPlan()
}

function fillFromPlan() {
  active.value = planCourses.value.map((c) => c.name)
  dirty.value = true
  save()
}

function toggle(course) {
  const name = course.name
  const i = active.value.indexOf(name)
  if (i >= 0) active.value.splice(i, 1)
  else active.value.push(name)
  dirty.value = true
  save()
}

function addCourse(name) {
  if (!active.value.includes(name)) active.value.push(name)
  dirty.value = true
  save()
}

function switchSemester(s) {
  semester.value = s
  fillFromPlan()
}

function reset() {
  if (!confirm('恢复成培养方案给这个学期安排的课程？你手动加/删的会丢失。')) return
  fillFromPlan()
}

/* ── 「缺什么」── */
function openAsk(course) {
  askForm.value = { course, kind: '课件', note: '', contact: '' }
  askMsg.value = ''
  askErr.value = ''
  askOpen.value = true
}

async function sendAsk() {
  askErr.value = ''
  askMsg.value = ''
  if (!askForm.value.note.trim()) {
    askErr.value = '请简单说明缺什么（一句话即可）'
    return
  }
  askSending.value = true
  try {
    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        fp: fp(),
        course: askForm.value.course,
        kind: askForm.value.kind,
        note: askForm.value.note.trim(),
        contact: askForm.value.contact.trim(),
      }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
    askMsg.value = d.message || '已提交给管理员'
    askForm.value.note = ''
    askForm.value.contact = ''
  } catch (e) {
    askErr.value = e.message || '提交失败'
  } finally {
    askSending.value = false
  }
}

/* ── 加载 ── */
onMounted(async () => {
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    index.value = await res.json()
    if (!restore()) {
      // 首次使用：默认选第一个专业，但等学生确认
      const ms = majors.value
      if (ms.length) major.value = ms[0]
      const ys = years.value
      if (ys.length) enrollYear.value = ys[0]
      const sems = semestersAvail.value
      if (sems.length) {
        semester.value = calcSemester(enrollYear.value)
        if (!sems.includes(semester.value)) semester.value = sems[0]
      }
      active.value = []
    }
  } catch (e) {
    failed.value = true
  } finally {
    loading.value = false
  }
})

function coursePath(code) {
  return code ? '/majors/shared/' + code : ''
}
</script>

<template>
  <div class="mt">
    <div v-if="loading" class="mt-state">正在读取课表…</div>
    <div v-else-if="failed" class="mt-state">
      课表数据没能加载出来，可能是网络或文件缺失。
    </div>

    <template v-else>
      <!-- 说明：措辞必须诚实，不能暗示系统知道你在上什么课 -->
      <section class="mt-intro">
        <p>
          培养方案规定的是「这个学期应该上哪些课」，但每个人不一定完全一样——
          <b>提前选修了后面的课、或者在重修，都会和培养方案不一致</b>。
        </p>
        <p>
          下面已经按培养方案帮你填好了，<b>对不上就自己改</b>；你的选择只保存在这台设备的浏览器里，不会上传。
        </p>
      </section>

      <!-- 选择专业与年级 -->
      <section class="mt-picker">
        <label>
          <span>专业</span>
          <select v-model="major" @change="onMajorChange">
            <option v-for="m in majors" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>
        <label>
          <span>入学年级</span>
          <select v-model.number="enrollYear" @change="onYearChange">
            <option v-for="y in years" :key="y" :value="y">{{ y }} 级</option>
          </select>
        </label>
        <div class="mt-sems">
          <button
            v-for="s in semestersAvail"
            :key="s"
            :class="['mt-sem', s === semester ? 'on' : '']"
            @click="switchSemester(s)"
          >
            第 {{ s }} 学期
          </button>
        </div>
      </section>

      <!-- 概览 -->
      <section v-if="configured" class="mt-summary">
        <div class="mt-stat"><b>{{ stats.total }}</b><span>你在修的课</span></div>
        <div class="mt-stat"><b>{{ stats.withMat }}</b><span>有资料</span></div>
        <div class="mt-stat mt-warn"><b>{{ stats.noMat }}</b><span>暂无资料</span></div>
        <button class="mt-reset" @click="reset">恢复培养方案默认</button>
      </section>

      <!-- 课程清单 -->
      <div v-if="!configured" class="mt-state">先选一下专业和入学年级。</div>
      <div v-else-if="!rows.length" class="mt-state">这个学期在培养方案里没有课程。</div>
      <div v-else class="mt-list">
        <div class="mt-head">
          <span class="c-chk"></span>
          <span class="c-name">课程</span>
          <span class="c-num">资料</span>
          <span class="c-num">题库</span>
          <span class="c-num">大纲</span>
          <span class="c-act"></span>
        </div>
        <div
          v-for="c in rows"
          :key="c.name"
          :class="['mt-row', activeSet.has(c.name) ? '' : 'off']"
        >
          <span class="c-chk">
            <input
              type="checkbox"
              :checked="activeSet.has(c.name)"
              :aria-label="'标记在修：' + c.name"
              @change="toggle(c)"
            />
          </span>
          <span class="c-name">
            <a v-if="coursePath(c.code)" :href="coursePath(c.code)">{{ c.name }}</a>
            <span v-else>{{ c.name }}</span>
            <em v-if="!planCourses.some((p) => p.name === c.name)" class="mt-tag">提前选修 / 重修</em>
          </span>
          <span class="c-num" :class="c.materials === 0 ? 'zero' : ''">{{ c.materials }}</span>
          <span class="c-num" :class="c.bank === 0 ? 'zero' : ''">{{ c.bank }}</span>
          <span class="c-num" :class="c.syllabus === 0 ? 'zero' : ''">{{ c.syllabus }}</span>
          <span class="c-act">
            <button class="mt-ask" @click="openAsk(c.name)">缺什么</button>
          </span>
        </div>
      </div>

      <!-- 添加其他学期的课 -->
      <section v-if="configured && otherGroups.length" class="mt-add">
        <details>
          <summary>＋ 添加其他学期的课（提前选修 / 重修）</summary>
          <div v-for="g in otherGroups" :key="g.sem" class="mt-add-group">
            <div class="mt-add-title">第 {{ g.sem }} 学期</div>
            <button v-for="c in g.list" :key="c.name" class="mt-add-btn" @click="addCourse(c.name)">
              {{ c.name }}
            </button>
          </div>
        </details>
      </section>

      <p class="mt-foot">
        想整体了解全院的资料缺口？看 <a href="/gap">资料缺口榜</a>；想贡献资料？看
        <a href="/contribute">贡献指南</a>。
      </p>
    </template>

    <!-- 提交弹窗 -->
    <div v-if="askOpen" class="mt-mask" @click.self="askOpen = false">
      <div class="mt-dialog">
        <h3>这门课缺什么？</h3>
        <p class="mt-dialog-sub">
          只提交线索，<b>不用上传文件</b>。管理员核实后会统一采补。
        </p>
        <label class="mt-field"><span>课程</span><input v-model="askForm.course" readonly /></label>
        <label class="mt-field">
          <span>缺哪一类</span>
          <select v-model="askForm.kind">
            <option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
        </label>
        <label class="mt-field">
          <span>具体说明</span>
          <textarea
            v-model="askForm.note"
            rows="4"
            maxlength="300"
            placeholder="例如：缺 2023 年期末真题；或「第七章课件没有」"
          ></textarea>
        </label>
        <label class="mt-field">
          <span>联系方式（可选）</span>
          <input v-model="askForm.contact" maxlength="60" placeholder="QQ / 邮箱" />
        </label>
        <p v-if="askErr" class="mt-err">{{ askErr }}</p>
        <p v-if="askMsg" class="mt-ok">{{ askMsg }}</p>
        <div class="mt-dialog-act">
          <button class="mt-btn" @click="askOpen = false">关闭</button>
          <button class="mt-btn pri" :disabled="askSending" @click="sendAsk">
            {{ askSending ? '提交中…' : '提交给管理员' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mt { max-width: 900px; margin: 0 auto; }
.mt-state { text-align: center; color: var(--text-muted); padding: 2.5rem 0; font-size: 0.9rem; }

.mt-intro { background: var(--brand-pale); border-radius: 10px; padding: 0.9rem 1.1rem; margin-bottom: 1.3rem; }
.mt-intro p { margin: 0 0 0.4rem; font-size: 0.82rem; line-height: 1.75; color: var(--text-body); }
.mt-intro p:last-child { margin-bottom: 0; }

.mt-picker { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; margin-bottom: 1.2rem; }
.mt-picker label { display: block; }
.mt-picker label > span { display: block; font-size: 0.74rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.mt-picker select {
  padding: 0.36rem 0.6rem; font-size: 0.84rem; border: 1px solid var(--line);
  border-radius: 6px; background: #fff; color: var(--text-body); font-family: inherit;
}
.mt-sems { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-left: auto; }
.mt-sem {
  border: 1px solid var(--line); background: #fff; color: var(--text-body);
  border-radius: 999px; padding: 0.22rem 0.65rem; font-size: 0.76rem; cursor: pointer;
}
.mt-sem.on { background: var(--brand); border-color: var(--brand); color: #fff; }

.mt-summary { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; flex-wrap: wrap; }
.mt-stat { background: #fff; border: 1px solid var(--line); border-radius: 9px; padding: 0.5rem 0.9rem; text-align: center; }
.mt-stat b { display: block; font-size: 1.15rem; color: var(--brand); font-variant-numeric: tabular-nums; }
.mt-stat span { font-size: 0.72rem; color: var(--text-muted); }
.mt-stat.mt-warn b { color: #B23B36; }
.mt-reset {
  margin-left: auto; border: 1px solid var(--line); background: #fff; color: var(--text-muted);
  border-radius: 6px; padding: 0.3rem 0.7rem; font-size: 0.76rem; cursor: pointer;
}
.mt-reset:hover { border-color: var(--brand); color: var(--brand); }

.mt-list { border: 1px solid var(--line); border-radius: 10px; background: #fff; overflow: hidden; }
.mt-head, .mt-row {
  display: grid; grid-template-columns: 2rem 1fr 3.2rem 3.2rem 3.2rem 5rem;
  align-items: center; gap: 0.3rem; padding: 0.42rem 0.7rem; font-size: 0.82rem;
}
.mt-head { font-size: 0.72rem; color: var(--text-muted); background: var(--bg-warm, #F7F5F0); border-bottom: 1px solid var(--line); }
.mt-row { border-bottom: 1px solid var(--line); }
.mt-row:last-child { border-bottom: none; }
.mt-row.off { opacity: 0.45; }
.mt-row.off .c-name { text-decoration: line-through; }
.c-chk { text-align: center; }
.c-name a { color: var(--brand); text-decoration: none; }
.c-name a:hover { text-decoration: underline; }
.c-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-body); }
.c-num.zero { color: #B23B36; }
.c-act { text-align: right; }
.mt-tag {
  font-style: normal; font-size: 0.68rem; color: #B45309; background: #FEF3E2;
  border-radius: 4px; padding: 0.05rem 0.35rem; margin-left: 0.35rem;
}
.mt-ask {
  border: 1px solid var(--brand); background: transparent; color: var(--brand);
  border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.7rem; cursor: pointer; white-space: nowrap;
}
.mt-ask:hover { background: var(--brand); color: #fff; }

.mt-add { margin-top: 1rem; }
.mt-add summary {
  cursor: pointer; font-size: 0.82rem; color: var(--brand); padding: 0.3rem 0;
  list-style: none;
}
.mt-add summary::-webkit-details-marker { display: none; }
.mt-add-group { margin-top: 0.7rem; }
.mt-add-title { font-size: 0.74rem; color: var(--text-muted); margin-bottom: 0.35rem; }
.mt-add-btn {
  border: 1px solid var(--line); background: #fff; color: var(--text-body);
  border-radius: 6px; padding: 0.18rem 0.5rem; font-size: 0.74rem; margin: 0 0.3rem 0.3rem 0;
  cursor: pointer; font-family: inherit;
}
.mt-add-btn:hover { border-color: var(--brand); color: var(--brand); }

.mt-foot { margin-top: 1.2rem; font-size: 0.78rem; color: var(--text-muted); }
.mt-foot a { color: var(--brand); }

.mt-mask {
  position: fixed; inset: 0; background: rgba(20, 30, 30, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 60;
}
.mt-dialog {
  background: #fff; border-radius: 12px; padding: 1.2rem 1.3rem; width: min(460px, 100%);
  max-height: 88vh; overflow-y: auto; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
}
.mt-dialog h3 { margin: 0 0 0.3rem; font-size: 1rem; font-weight: 600; color: var(--text-heading); }
.mt-dialog-sub { margin: 0 0 0.9rem; font-size: 0.76rem; color: var(--text-muted); line-height: 1.7; }
.mt-field { display: block; margin-bottom: 0.65rem; }
.mt-field > span { display: block; font-size: 0.74rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.mt-field input, .mt-field select, .mt-field textarea {
  width: 100%; box-sizing: border-box; padding: 0.38rem 0.55rem;
  border: 1px solid var(--line); border-radius: 6px; font-size: 0.82rem;
  font-family: inherit; color: var(--text-body); background: #fff;
}
.mt-field textarea { resize: vertical; line-height: 1.6; }
.mt-field input:focus, .mt-field select:focus, .mt-field textarea:focus { outline: none; border-color: var(--brand); }
.mt-err { color: #B23B36; font-size: 0.76rem; margin: 0.2rem 0 0.5rem; }
.mt-ok { color: #047857; font-size: 0.76rem; margin: 0.2rem 0 0.5rem; }
.mt-dialog-act { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
.mt-btn {
  border: 1px solid var(--line); background: #fff; color: var(--text-body);
  border-radius: 6px; padding: 0.35rem 0.9rem; font-size: 0.8rem; cursor: pointer; font-family: inherit;
}
.mt-btn.pri { background: var(--brand); border-color: var(--brand); color: #fff; }
.mt-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 640px) {
  .mt-head, .mt-row { grid-template-columns: 1.8rem 1fr 2.4rem 2.4rem 2.4rem 4.2rem; font-size: 0.78rem; }
  .mt-sems { margin-left: 0; width: 100%; }
}
</style>
