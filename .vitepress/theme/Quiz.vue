<script setup>
import { ref, computed, onMounted } from 'vue'
import { trackFootprint } from './lib/footprint'
import { recordAnswer } from './lib/spaced'
import ArBtn from './components/ArBtn.vue'

// ============ 数据 ============
const bank = ref({})          // { 课程名: { course, code, questions:[] } }
const syllabus = ref({})      // { 课程名: { course, code, units:[] } }
const courseIndex = ref(null) // { clusters:[{canonical,aliases,related,...}], byName:{} }
const loading = ref(true)
const loadError = ref('')

// ============ 状态机：config → answering → result ============
const step = ref('config')

// 组题配置
const config = ref({
  course: 'C语言程序设计',
  unit: 'all',         // all | 单元 id（按章节组题）
  count: 10,
  difficulty: 'all',   // all | 1 | 2 | 3
  knowledge: 'all',    // all | 知识点
  weakFirst: false,    // 错题/薄弱知识点优先
})

// 试卷与作答
const paper = ref([])
const answers = ref([])     // [{ value, selfRight }]
const currentIdx = ref(0)
const submitted = ref(false)
const score = ref(0)
const wrongIds = ref([])

// ============ 常量 ============
const TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题', short: '简答题', calc: '程序阅读' }
const DIFF_LABEL = { 1: '简单', 2: '中等', 3: '困难' }
const RELATION_LABEL = { '实验': '实验课', '实习': '教学实习', '实践': '综合实践', '课设': '课程设计', '系列': '系列课' }

// ============ 派生数据 ============
// 课程列表：优先用课程簇索引（含全部课程），失败退回题库键
const courses = computed(() => {
  if (courseIndex.value && courseIndex.value.clusters) {
    const names = courseIndex.value.clusters.map(c => c.canonical)
    const inBank = n => (bank.value[n] || {}).questions
    return names.slice().sort((a, b) => {
      const ba = inBank(a) ? 0 : 1, bb = inBank(b) ? 0 : 1
      if (ba !== bb) return ba - bb
      return a.localeCompare(b, 'zh')
    })
  }
  return Object.keys(bank.value)
})

const currentCourse = computed(() => bank.value[config.value.course] || { questions: [] })
const questions = computed(() => currentCourse.value.questions || [])

// 当前课程的学习单元（章节）
const unitMap = computed(() => (syllabus.value[config.value.course] || {}).units || [])

// 每个章节可组的题目数（题库 knowledge ∈ 单元 quizScope）
const unitOptions = computed(() => unitMap.value.map(u => {
  const scope = u.quizScope || []
  return {
    id: u.id,
    title: u.title,
    count: questions.value.filter(q => scope.includes(q.knowledge)).length,
  }
}))

function unitLabel(id) {
  if (id === 'all') return '全部章节'
  const u = unitMap.value.find(x => x.id === id)
  return u ? u.title : ''
}
function unitOfKnowledge(k) {
  return unitMap.value.find(u => (u.quizScope || []).includes(k))
}

// 知识点范围：选了章节则收窄到该章节
const knowledgeList = computed(() => {
  if (config.value.unit !== 'all') {
    const u = unitMap.value.find(x => x.id === config.value.unit)
    if (u && u.quizScope && u.quizScope.length) return ['all', ...u.quizScope]
  }
  return ['all', ...new Set(questions.value.map(q => q.knowledge))]
})

// 课程簇提示：本课名下挂着哪些同类课（实验/实践/实习/系列）
const clusterHint = computed(() => {
  const idx = courseIndex.value
  if (!idx || !idx.byName) return []
  const canonical = idx.byName[config.value.course]
  if (!canonical) return []
  const c = (idx.clusters || []).find(x => x.canonical === canonical)
  if (!c) return []
  return (c.aliases || [])
    .filter(a => a.relation && a.relation !== '主课' && a.name !== canonical)
    .map(a => ({ name: a.name, label: RELATION_LABEL[a.relation] || a.relation }))
})

// 同类课程中已有题库的（无题库课程引导跳转）
const relatedBankCourses = computed(() => {
  const idx = courseIndex.value
  if (!idx || !idx.byName) return []
  const canonical = idx.byName[config.value.course]
  if (!canonical) return []
  const c = (idx.clusters || []).find(x => x.canonical === canonical)
  if (!c) return []
  const names = new Set()
  ;(c.related || []).forEach(r => names.add(r.name))
  ;(c.aliases || []).forEach(a => { if (a.name !== canonical) names.add(a.name) })
  return [...names].filter(n => (bank.value[n] || {}).questions && n !== config.value.course)
})

function switchCourse(name) {
  config.value.course = name
  onCourseChange()
}

// ============ 知识点掌握度（localStorage quiz_kstats_v1） ============
const KSTATS_KEY = 'quiz_kstats_v1'
function getKStats() {
  try { return JSON.parse(localStorage.getItem(KSTATS_KEY) || '{}') } catch { return {} }
}
function saveKStats(map) {
  try { localStorage.setItem(KSTATS_KEY, JSON.stringify(map)) } catch {}
}
const kstatsTick = ref(0)   // 手动触发掌握度面板刷新

// 当前课程各知识点的掌握度（做过的），薄弱在前
const masteryList = computed(() => {
  kstatsTick.value  // 依赖刷新
  const map = getKStats()
  const rows = []
  questions.value.forEach(q => {
    const s = map[q.knowledge]
    if (s && (s.r + s.w) > 0) rows.push({ knowledge: q.knowledge, r: s.r, w: s.w, rate: Math.round(s.r / (s.r + s.w) * 100) })
  })
  const seen = new Set()
  return rows
    .filter(x => { if (seen.has(x.knowledge)) return false; seen.add(x.knowledge); return true })
    .sort((a, b) => a.rate - b.rate || (b.r + b.w) - (a.r + a.w))
    .slice(0, 8)
})
function clearCourseStats() {
  const map = getKStats()
  questions.value.forEach(q => { delete map[q.knowledge] })
  saveKStats(map)
  kstatsTick.value++
}

// ============ 错题集（localStorage）：记录题目 id → 错题次数 ============
function getWrongMap() {
  try { return JSON.parse(localStorage.getItem('quiz_wrong') || '{}') } catch { return {} }
}
function setWrongMap(map) {
  localStorage.setItem('quiz_wrong', JSON.stringify(map))
}

// ============ 答题历史 ============
function getHistory() {
  try { return JSON.parse(localStorage.getItem('quiz_history') || '[]') } catch { return [] }
}
function pushHistory(item) {
  const h = getHistory()
  h.unshift(item)
  localStorage.setItem('quiz_history', JSON.stringify(h.slice(0, 20)))
}

// ============ 组题引擎（Fisher-Yates 洗牌 + 约束过滤） ============
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildPaper() {
  let pool = questions.value.slice()

  // 难度过滤
  if (config.value.difficulty !== 'all') {
    pool = pool.filter(q => q.difficulty === Number(config.value.difficulty))
  }
  // 章节过滤（按 quizScope 归属）
  if (config.value.unit !== 'all') {
    const u = unitMap.value.find(x => x.id === config.value.unit)
    const scope = (u && u.quizScope) || []
    pool = pool.filter(q => scope.includes(q.knowledge))
  }
  // 知识点过滤
  if (config.value.knowledge !== 'all') {
    pool = pool.filter(q => q.knowledge === config.value.knowledge)
  }

  // 错题优先：把做错的题排前面
  if (config.value.weakFirst) {
    const wrong = getWrongMap()
    pool = pool.sort((a, b) => (wrong[b.id] || 0) - (wrong[a.id] || 0))
  } else {
    pool = shuffle(pool)
  }

  const n = Math.min(config.value.count, pool.length)
  if (n === 0) { loadError.value = '当前筛选条件下没有可用题目，请放宽条件。'; return false }

  paper.value = pool.slice(0, n)
  answers.value = paper.value.map(q => ({ value: q.type === 'multi' ? [] : '', selfRight: null }))
  currentIdx.value = 0
  submitted.value = false
  score.value = 0
  wrongIds.value = []
  loadError.value = ''
  step.value = 'answering'
  return true
}

// ============ 作答交互 ============
function selectOption(opt) {
  const q = paper.value[currentIdx.value]
  const ans = answers.value[currentIdx.value]
  if (q.type === 'multi') {
    const arr = ans.value
    const i = arr.indexOf(opt)
    if (i >= 0) arr.splice(i, 1); else arr.push(opt)
  } else {
    ans.value = opt
  }
}

function normText(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase().replace(/[，。；：、]/g, '')
}

function isObjective(q) {
  return ['single', 'multi', 'judge', 'blank', 'calc'].includes(q.type)
}

// 判一道客观题
function judgeOne(q, ans) {
  if (q.type === 'single' || q.type === 'judge') {
    return ans.value === q.answer
  }
  if (q.type === 'multi') {
    const mine = (ans.value || []).slice().sort().join('')
    const std = String(q.answer).split('').sort().join('')
    return mine === std
  }
  // blank / calc：文本归一化比对
  return normText(ans.value) === normText(q.answer)
}

function submit() {
  let total = 0
  let right = 0
  const wrongMap = getWrongMap()
  const kstats = getKStats()
  const wrong = []

  paper.value.forEach((q, i) => {
    const ans = answers.value[i]
    let ok
    if (q.type === 'short') {
      ok = ans.selfRight === true   // 主观题靠自评
    } else {
      ok = judgeOne(q, ans)
    }
    if (ok) { right++ } else {
      wrong.push(q)
      wrongMap[q.id] = (wrongMap[q.id] || 0) + 1
    }
    // 同步进错题本（kx_wrong_v2）：答错按遗忘曲线排期，答对推进已有错题的间隔
    try {
      recordAnswer({
        qid: q.id,
        course: config.value.course,
        knowledge: q.knowledge,
        correct: !!ok,
      })
    } catch (e) { /* 错题本写入失败不影响交卷 */ }
    // 知识点掌握度统计
    const ks = kstats[q.knowledge] || { r: 0, w: 0 }
    if (ok) ks.r++; else ks.w++
    kstats[q.knowledge] = ks
    total++
  })

  score.value = right
  wrongIds.value = wrong.map(q => q.id)
  submitted.value = true
  step.value = 'result'
  setWrongMap(wrongMap)
  saveKStats(kstats)
  kstatsTick.value++

  // 记一条学习足迹（做题数），供周报与足迹页汇总
  try {
    trackFootprint({ kind: 'quiz', course: config.value.course, n: total })
  } catch (e) { /* 埋点失败不影响交卷 */ }

  pushHistory({
    course: config.value.course,
    unit: unitLabel(config.value.unit),
    time: Date.now(),
    total,
    right,
    rate: total ? Math.round(right / total * 100) : 0,
  })
}

function reset() {
  step.value = 'config'
  submitted.value = false
}

// ============ 配置联动 ============
function onCourseChange() {
  config.value.unit = 'all'
  config.value.knowledge = 'all'
  loadError.value = ''
}
function onUnitChange() {
  config.value.knowledge = 'all'
}

// ============ 加载题库 ============
onMounted(async () => {
  try {
    const [b, s, i] = await Promise.all([
      fetch('/data/bank.json', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() }),
      fetch('/data/syllabus.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      fetch('/data/course-index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ])
    bank.value = b
    syllabus.value = s
    courseIndex.value = i

    const keys = Object.keys(bank.value)
    const courseNames = courses.value
    // 支持 URL 参数预选：/quiz?course=X&knowledge=Y&unit=Z（供学习计划"配套测试"深链）
    const params = new URLSearchParams(location.search)
    const c = params.get('course')
    const k = params.get('knowledge')
    const u = params.get('unit')
    if (c && courseNames.includes(c)) config.value.course = c
    else if (keys.length && !courseNames.includes(config.value.course)) config.value.course = keys[0]
    // 知识点参数：定位所属章节
    if (k && keys.includes(config.value.course)) {
      const qs = bank.value[config.value.course].questions || []
      if (qs.some(q => q.knowledge === k)) {
        const unit = unitOfKnowledge(k)
        if (unit) config.value.unit = unit.id
        config.value.knowledge = k
      }
    } else if (u) {
      const units = (syllabus.value[config.value.course] || {}).units || []
      if (units.some(x => x.id === u)) config.value.unit = u
    }
  } catch (e) {
    loadError.value = '题库加载失败：' + e.message
  } finally {
    loading.value = false
  }
})

const history = computed(() => getHistory())
const historyVisible = ref(false)
function toggleHistory() { historyVisible.value = !historyVisible.value }
function fmtTime(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const progress = computed(() => answers.value.filter(a => {
  if (Array.isArray(a.value)) return a.value.length > 0
  return String(a.value || '').trim() !== ''
}).length)
</script>

<template>
  <div class="quiz-wrap">
    <!-- Hero -->
    <div class="quiz-hero">
      <span class="quiz-hero-tag">随学随测</span>
      <h1 class="quiz-hero-title">组题练习</h1>
      <p class="quiz-hero-sub">按课程章节随机抽题组卷，客观题自动判分，主观题对答案自评，错题与薄弱知识点自动归集。</p>
    </div>

    <div class="quiz-inner">
      <!-- 加载中 -->
      <div v-if="loading" class="quiz-state">题库加载中…</div>
      <div v-else-if="loadError && !Object.keys(bank).length" class="quiz-state quiz-err">{{ loadError }}</div>

      <!-- 组题配置 -->
      <div v-else-if="step === 'config' && questions.length" class="quiz-card">
        <h2 class="quiz-card-title">组一份试卷</h2>

        <div class="quiz-field">
          <label>课程</label>
          <select v-model="config.course" @change="onCourseChange">
            <option v-for="c in courses" :key="c" :value="c">{{ c }}</option>
          </select>
          <div v-if="clusterHint.length" class="quiz-cluster-hint">
            📎 本课与 {{ clusterHint.map(h => h.name + '（' + h.label + '）').join('、') }} 同属一组，资料互通
          </div>
        </div>

        <div v-if="unitOptions.length" class="quiz-field">
          <label>章节范围</label>
          <select v-model="config.unit" @change="onUnitChange">
            <option value="all">全部章节</option>
            <option v-for="u in unitOptions" :key="u.id" :value="u.id">{{ u.title }}（{{ u.count }} 题）</option>
          </select>
        </div>

        <div class="quiz-field-row">
          <div class="quiz-field">
            <label>题目数量</label>
            <select v-model.number="config.count">
              <option :value="5">5 题</option>
              <option :value="10">10 题</option>
              <option :value="15">15 题</option>
              <option :value="20">20 题</option>
            </select>
          </div>
          <div class="quiz-field">
            <label>难度</label>
            <select v-model="config.difficulty">
              <option value="all">全部难度</option>
              <option value="1">简单</option>
              <option value="2">中等</option>
              <option value="3">困难</option>
            </select>
          </div>
        </div>

        <div class="quiz-field">
          <label>知识点范围</label>
          <select v-model="config.knowledge">
            <option v-for="k in knowledgeList" :key="k" :value="k">{{ k === 'all' ? '全部知识点' : k }}</option>
          </select>
        </div>

        <label class="quiz-check">
          <input type="checkbox" v-model="config.weakFirst">
          <span>优先出易错题（基于历史错题集）</span>
        </label>

        <div class="quiz-stats">
          当前课程题库共 <strong>{{ questions.length }}</strong> 题 ·
          {{ knowledgeList.length - 1 }} 个知识点 ·
          {{ unitOptions.length }} 个章节
        </div>

        <!-- 知识点掌握度 -->
        <div v-if="masteryList.length" class="quiz-mastery">
          <div class="quiz-mastery-head">
            <span>📊 薄弱知识点（正确率升序）</span>
            <span class="quiz-mastery-clear" @click="clearCourseStats">清除本课统计</span>
          </div>
          <div v-for="m in masteryList" :key="m.knowledge" class="quiz-mastery-row">
            <span class="quiz-mastery-name" :title="m.knowledge">{{ m.knowledge }}</span>
            <div class="quiz-mastery-bar">
              <div class="quiz-mastery-fill" :class="{ bad: m.rate < 60, mid: m.rate >= 60 && m.rate < 80 }" :style="{ width: m.rate + '%' }"></div>
            </div>
            <span class="quiz-mastery-rate" :class="{ bad: m.rate < 60, good: m.rate >= 80 }">{{ m.rate }}%</span>
            <span class="quiz-mastery-count">{{ m.r }}对/{{ m.w }}错</span>
          </div>
        </div>

        <div v-if="loadError" class="quiz-inline-err">{{ loadError }}</div>

        <ArBtn variant="primary" size="md" @click="buildPaper">开始组题 →</ArBtn>

        <ArBtn v-if="history.length" variant="ghost" size="md" @click="toggleHistory">
          {{ historyVisible ? '收起' : '查看' }}历史成绩（{{ history.length }}）
        </ArBtn>
        <div v-if="historyVisible" class="quiz-history">
          <div v-for="(h, i) in history" :key="i" class="quiz-history-item">
            <span>{{ h.course }}<template v-if="h.unit && h.unit !== '全部章节'"> · {{ h.unit }}</template></span>
            <span class="quiz-history-rate" :class="{ bad: h.rate < 60, good: h.rate >= 80 }">{{ h.rate }}%</span>
            <span>{{ h.right }}/{{ h.total }}</span>
            <span class="quiz-history-time">{{ fmtTime(h.time) }}</span>
          </div>
        </div>
      </div>

      <!-- 无题库课程：展示章节大纲 + 引导 -->
      <div v-else-if="step === 'config'" class="quiz-card">
        <h2 class="quiz-card-title">{{ config.course }}</h2>
        <blockquote class="quiz-empty-note">
          ✏️ 本课程题库建设中——先看章节大纲心里有数，也可以去学习计划里按章节排期复习。
        </blockquote>

        <div v-if="unitMap.length" class="quiz-chapters">
          <div v-for="(u, i) in unitMap" :key="u.id" class="quiz-chapter">
            <div class="quiz-chapter-head">
              <span class="quiz-chapter-no">{{ i + 1 }}</span>
              <span class="quiz-chapter-title">{{ u.title }}</span>
              <span class="quiz-chapter-meta">★{{ u.weight }} · {{ u.durationMin }} 分钟</span>
            </div>
            <div v-if="u.points && u.points.length" class="quiz-chapter-points">{{ u.points.join(' · ') }}</div>
          </div>
        </div>

        <div class="quiz-empty-actions">
          <a class="quiz-btn" :href="`/plan?course=${encodeURIComponent(config.course)}`">📖 去生成学习计划</a>
          <a class="quiz-btn quiz-btn-ghost" href="/contribute">✍️ 投稿题目</a>
        </div>

        <div v-if="relatedBankCourses.length" class="quiz-related">
          <div class="quiz-related-title">🔗 同类课程中已有题库：</div>
          <button v-for="r in relatedBankCourses" :key="r" class="quiz-related-chip" @click="switchCourse(r)">{{ r }} →</button>
        </div>
      </div>

      <!-- 答题中 -->
      <div v-else-if="step === 'answering'" class="quiz-card">
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" :style="{ width: (progress / paper.length * 100) + '%' }"></div>
        </div>
        <div class="quiz-question-head">
          <span class="quiz-q-no">第 {{ currentIdx + 1 }} / {{ paper.length }} 题</span>
          <span class="quiz-q-tag">{{ TYPE_LABEL[paper[currentIdx].type] }}</span>
          <span class="quiz-q-diff">难度 {{ DIFF_LABEL[paper[currentIdx].difficulty] }}</span>
          <span class="quiz-q-knowledge">{{ paper[currentIdx].knowledge }}</span>
          <span v-if="unitOfKnowledge(paper[currentIdx].knowledge)" class="quiz-q-unit">{{ unitOfKnowledge(paper[currentIdx].knowledge).title }}</span>
        </div>

        <div class="quiz-stem">{{ paper[currentIdx].stem }}</div>

        <!-- 单选 / 判断 -->
        <div v-if="paper[currentIdx].type === 'single'" class="quiz-options">
          <button
            v-for="opt in paper[currentIdx].options"
            :key="opt"
            class="quiz-opt"
            :class="{ active: answers[currentIdx].value === opt[0] }"
            @click="selectOption(opt[0])"
          >{{ opt }}</button>
        </div>

        <div v-else-if="paper[currentIdx].type === 'judge'" class="quiz-options quiz-options-row">
          <button class="quiz-opt" :class="{ active: answers[currentIdx].value === '对' }" @click="selectOption('对')">✓ 正确</button>
          <button class="quiz-opt" :class="{ active: answers[currentIdx].value === '错' }" @click="selectOption('错')">✗ 错误</button>
        </div>

        <div v-else-if="paper[currentIdx].type === 'multi'" class="quiz-options">
          <button
            v-for="opt in (paper[currentIdx].options || [])"
            :key="opt"
            class="quiz-opt"
            :class="{ active: (answers[currentIdx].value || []).includes(opt[0]) }"
            @click="selectOption(opt[0])"
          >{{ opt }}</button>
        </div>

        <!-- 填空 / 计算 / 简答 -->
        <div v-else-if="['blank', 'calc'].includes(paper[currentIdx].type)" class="quiz-input">
          <input v-model="answers[currentIdx].value" type="text" placeholder="输入你的答案" @keyup.enter="currentIdx < paper.length - 1 ? currentIdx++ : submit()">
        </div>

        <div v-else-if="paper[currentIdx].type === 'short'" class="quiz-input">
          <textarea v-model="answers[currentIdx].value" rows="4" placeholder="写下你的答案，提交后对照参考答案自评"></textarea>
        </div>

        <div class="quiz-nav">
          <ArBtn variant="ghost" size="md" :disabled="currentIdx === 0" @click="currentIdx--">← 上一题</ArBtn>
          <ArBtn v-if="currentIdx < paper.length - 1" variant="primary" size="md" @click="currentIdx++">下一题 →</ArBtn>
          <ArBtn v-else variant="primary" size="md" @click="submit">交卷 · 判分</ArBtn>
        </div>
      </div>

      <!-- 结果 -->
      <div v-else class="quiz-card">
        <div class="quiz-result-head">
          <div class="quiz-score-ring" :class="{ bad: score / paper.length < 0.6, good: score / paper.length >= 0.8 }">
            <span class="quiz-score-num">{{ score }}</span>
            <span class="quiz-score-total">/ {{ paper.length }}</span>
          </div>
          <div class="quiz-result-info">
            <h2>测验完成</h2>
            <p>正确率 {{ Math.round(score / paper.length * 100) }}% ·
              {{ score === paper.length ? '全对，太强了！' : score / paper.length >= 0.8 ? '掌握得不错' : score / paper.length >= 0.6 ? '再接再厉' : '建议复习相关知识点' }}</p>
            <p v-if="masteryList.length && masteryList[0].rate < 60" class="quiz-result-weak">
              ⚠️ 薄弱点：{{ masteryList.slice(0, 3).map(m => m.knowledge).join('、') }}——建议用「章节范围」针对性再练
            </p>
          </div>
        </div>

        <div class="quiz-review">
          <h3 class="quiz-review-title">题目回顾</h3>
          <div v-for="(q, i) in paper" :key="q.id" class="quiz-review-item" :class="{ wrong: wrongIds.includes(q.id) }">
            <div class="quiz-review-stem">
              <span class="quiz-review-mark">{{ wrongIds.includes(q.id) ? '✗' : '✓' }}</span>
              <span>{{ i + 1 }}. {{ q.stem }}</span>
            </div>
            <div class="quiz-review-answer">
              <span>你的答案：<strong>{{ q.type === 'multi' ? (answers[i].value || []).join('、') || '未作答' : (answers[i].value || '未作答') }}</strong></span>
              <span>参考答案：<strong>{{ q.answer }}</strong></span>
            </div>
            <div class="quiz-review-analysis">解析：{{ q.analysis }}</div>
          </div>
        </div>

        <div class="quiz-result-actions">
          <button class="quiz-btn" @click="buildPaper">再组一份</button>
          <button class="quiz-btn quiz-btn-ghost" @click="reset">返回设置</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-wrap { min-height: 60vh; }
.quiz-hero {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%);
  color: #fff; text-align: center; padding: 48px 24px 56px;
}
.quiz-hero-tag {
  display: inline-block; background: rgba(255,255,255,0.15); padding: 4px 12px;
  border-radius: 20px; font-size: 0.8rem; margin-bottom: 12px; backdrop-filter: blur(8px);
}
.quiz-hero-title { font-family: var(--font-display); font-size: 2.2rem; margin: 0 0 10px; color: #fff !important; }
.quiz-hero-sub { font-size: 0.95rem; opacity: 0.92; margin: 0; line-height: 1.7; color: #fff !important; }
.quiz-inner { max-width: 760px; margin: -24px auto 48px; padding: 0 20px; }
.quiz-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
.quiz-err { color: var(--color-danger); }

.quiz-card {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 16px;
  padding: 28px; box-shadow: var(--shadow-card);
}
.quiz-card-title { font-family: var(--font-display); font-size: 1.3rem; color: var(--brand); margin: 0 0 20px; }

.quiz-field { margin-bottom: 16px; }
.quiz-field label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 500; }
.quiz-field select, .quiz-field input, .quiz-input input, .quiz-input textarea {
  width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 0.92rem; font-family: inherit; background: var(--bg-warm); color: var(--text-heading);
  box-sizing: border-box;
}
.quiz-field select:focus, .quiz-field input:focus, .quiz-input input:focus, .quiz-input textarea:focus {
  outline: 2px solid var(--brand); border-color: var(--brand);
}
.quiz-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 600px) { .quiz-field-row { grid-template-columns: 1fr; gap: 0; } }

/* 课程簇提示 */
.quiz-cluster-hint {
  margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);
  background: var(--brand-pale); border: 1px dashed var(--brand);
  border-radius: 8px; padding: 8px 12px; line-height: 1.6;
}

.quiz-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: var(--text-body); cursor: pointer; margin: 4px 0 16px; }
.quiz-check input { accent-color: var(--brand); width: 16px; height: 16px; }

.quiz-stats { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; }
.quiz-stats strong { color: var(--brand); }
.quiz-inline-err { color: var(--color-danger); font-size: 0.85rem; margin-bottom: 12px; }

/* 知识点掌握度 */
.quiz-mastery {
  border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px;
  margin-bottom: 16px; background: var(--bg-warm);
}
.quiz-mastery-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.85rem; font-weight: 600; color: var(--text-heading); margin-bottom: 10px;
}
.quiz-mastery-clear { font-size: 0.75rem; font-weight: 400; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
.quiz-mastery-clear:hover { color: var(--color-danger); }
.quiz-mastery-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
.quiz-mastery-name {
  flex: 0 0 38%; font-size: 0.8rem; color: var(--text-body);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.quiz-mastery-bar { flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.quiz-mastery-fill { height: 100%; background: var(--color-success); border-radius: 4px; transition: width 0.3s; }
.quiz-mastery-fill.mid { background: var(--color-warning); }
.quiz-mastery-fill.bad { background: var(--color-danger); }
.quiz-mastery-rate { flex: 0 0 44px; text-align: right; font-size: 0.8rem; font-weight: 700; color: var(--color-success); }
.quiz-mastery-rate.bad { color: var(--color-danger); }
.quiz-mastery-rate.good { color: var(--color-success); }
.quiz-mastery-rate.mid { color: var(--color-warning); }
.quiz-mastery-count { flex: 0 0 62px; text-align: right; font-size: 0.72rem; color: var(--text-muted); }

.quiz-btn {
  display: inline-block; background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 11px 24px; font-size: 0.92rem; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.15s; margin-right: 10px; text-decoration: none;
}
.quiz-btn:hover { background: var(--brand-light); color: #fff; }
.quiz-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.quiz-btn-ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
.quiz-btn-ghost:hover { background: var(--brand-pale); color: var(--brand); }

.quiz-history { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
.quiz-history-item {
  display: flex; align-items: center; gap: 12px; padding: 8px 4px;
  font-size: 0.85rem; color: var(--text-body); border-bottom: 1px dashed var(--line);
}
.quiz-history-rate { font-weight: 700; }
.quiz-history-rate.good { color: var(--color-success); }
.quiz-history-rate.bad { color: var(--color-danger); }
.quiz-history-time { margin-left: auto; color: var(--text-muted); font-size: 0.78rem; }

/* 无题库课程：章节大纲 */
.quiz-empty-note {
  font-size: 0.9rem; color: var(--text-body); background: var(--bg-warm);
  border-left: 3px solid var(--brand); border-radius: 0 8px 8px 0;
  padding: 10px 14px; margin: 0 0 18px; line-height: 1.7;
}
.quiz-chapters { margin-bottom: 20px; }
.quiz-chapter { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.quiz-chapter-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.quiz-chapter-no {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
  background: var(--brand-pale); color: var(--brand); font-size: 0.78rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.quiz-chapter-title { font-size: 0.92rem; font-weight: 600; color: var(--text-heading); }
.quiz-chapter-meta { margin-left: auto; font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
.quiz-chapter-points { font-size: 0.8rem; color: var(--text-body); margin-top: 6px; line-height: 1.6; }
.quiz-empty-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.quiz-related { margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 14px; }
.quiz-related-title { font-size: 0.83rem; color: var(--text-muted); margin-bottom: 10px; }
.quiz-related-chip {
  display: inline-block; margin: 0 8px 8px 0; padding: 6px 14px; border-radius: 16px;
  border: 1px solid var(--brand); color: var(--brand); background: transparent;
  font-size: 0.82rem; cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.quiz-related-chip:hover { background: var(--brand-pale); }

.quiz-progress-bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-bottom: 18px; }
.quiz-progress-fill { height: 100%; background: var(--brand); transition: width 0.3s; }
.quiz-question-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.quiz-q-no { font-weight: 700; color: var(--brand); }
.quiz-q-tag { background: var(--brand-pale); color: var(--brand); font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; }
.quiz-q-diff { color: var(--text-muted); font-size: 0.78rem; }
.quiz-q-knowledge { background: #fffbeb; color: var(--color-warning); font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; }
.quiz-q-unit { background: #eff6ff; color: #2563EB; font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; }

.quiz-stem { font-size: 1.05rem; color: var(--text-heading); line-height: 1.7; margin-bottom: 20px; }
.quiz-options { display: flex; flex-direction: column; gap: 10px; }
.quiz-options-row { flex-direction: row; }
.quiz-opt {
  text-align: left; background: var(--bg-warm); border: 1.5px solid var(--line); border-radius: 10px;
  padding: 12px 16px; font-size: 0.95rem; color: var(--text-body); cursor: pointer; font-family: inherit;
  transition: all 0.15s; line-height: 1.5;
}
.quiz-options-row .quiz-opt { text-align: center; flex: 1; }
.quiz-opt:hover { border-color: var(--brand); }
.quiz-opt.active { border-color: var(--brand); background: var(--brand-pale); color: var(--brand); font-weight: 600; }
.quiz-input { margin-bottom: 20px; }

.quiz-nav { display: flex; justify-content: space-between; margin-top: 24px; gap: 10px; }

.quiz-result-head { display: flex; align-items: center; gap: 24px; margin-bottom: 24px; }
.quiz-score-ring {
  width: 90px; height: 90px; border-radius: 50%; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 4px solid var(--color-warning); color: var(--color-warning);
}
.quiz-score-ring.good { border-color: var(--color-success); color: var(--color-success); }
.quiz-score-ring.bad { border-color: var(--color-danger); color: var(--color-danger); }
.quiz-score-num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
.quiz-score-total { font-size: 0.8rem; opacity: 0.7; }
.quiz-result-info h2 { font-family: var(--font-display); color: var(--brand); margin: 0 0 6px; }
.quiz-result-info p { color: var(--text-muted); margin: 0; }
.quiz-result-weak { margin-top: 6px; font-size: 0.83rem; color: var(--color-warning); }

.quiz-review-title { font-family: var(--font-display); color: var(--text-heading); margin: 8px 0 14px; }
.quiz-review-item { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.quiz-review-item.wrong { border-color: #fecaca; background: var(--color-danger-pale); }
.quiz-review-stem { display: flex; gap: 8px; font-size: 0.95rem; color: var(--text-heading); margin-bottom: 8px; line-height: 1.6; }
.quiz-review-mark { font-weight: 800; color: var(--color-success); flex-shrink: 0; }
.quiz-review-item.wrong .quiz-review-mark { color: var(--color-danger); }
.quiz-review-answer { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-body); margin-bottom: 8px; }
.quiz-review-analysis { font-size: 0.85rem; color: var(--text-muted); background: var(--bg-warm); padding: 10px 12px; border-radius: 8px; line-height: 1.6; }
.quiz-result-actions { display: flex; gap: 10px; margin-top: 20px; }

@media (max-width: 600px) {
  .quiz-card { padding: 20px 16px; }
  .quiz-hero-title { font-size: 1.7rem; }
  .quiz-result-head { flex-direction: column; text-align: center; }
  .quiz-mastery-name { flex: 0 0 45%; }
}
</style>
