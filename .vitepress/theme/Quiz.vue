<script setup>
import { ref, computed, onMounted } from 'vue'

// ============ 数据 ============
const bank = ref({})          // { 课程名: { course, code, questions:[] } }
const loading = ref(true)
const loadError = ref('')

// ============ 状态机：config → answering → result ============
const step = ref('config')

// 组题配置
const config = ref({
  course: 'C语言程序设计',
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

// ============ 派生数据 ============
const courses = computed(() => Object.keys(bank.value))
const currentCourse = computed(() => bank.value[config.value.course] || { questions: [] })
const questions = computed(() => currentCourse.value.questions || [])

const knowledgeList = computed(() => {
  const set = new Set(questions.value.map(q => q.knowledge))
  return ['all', ...set]
})

// 错题集（localStorage）：记录题目 id → 错题次数
function getWrongMap() {
  try { return JSON.parse(localStorage.getItem('quiz_wrong') || '{}') } catch { return {} }
}
function setWrongMap(map) {
  localStorage.setItem('quiz_wrong', JSON.stringify(map))
}

// 答题历史
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
    total++
  })

  score.value = right
  wrongIds.value = wrong.map(q => q.id)
  submitted.value = true
  step.value = 'result'
  setWrongMap(wrongMap)

  pushHistory({
    course: config.value.course,
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

// ============ 加载题库 ============
onMounted(async () => {
  try {
    const res = await fetch('/data/bank.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    bank.value = await res.json()
    const keys = Object.keys(bank.value)
    // 支持 URL 参数预选：/quiz?course=X&knowledge=Y（供学习计划"配套测试"深链）
    const params = new URLSearchParams(location.search)
    const c = params.get('course')
    const k = params.get('knowledge')
    if (c && keys.includes(c)) config.value.course = c
    else if (keys.length) config.value.course = keys[0]
    if (k && bank.value[config.value.course].questions.some(q => q.knowledge === k)) {
      config.value.knowledge = k
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
      <p class="quiz-hero-sub">从课程题库随机抽题组卷，客观题自动判分，主观题对答案自评，错题自动归集。</p>
    </div>

    <div class="quiz-inner">
      <!-- 加载中 -->
      <div v-if="loading" class="quiz-state">题库加载中…</div>
      <div v-else-if="loadError && !Object.keys(bank).length" class="quiz-state quiz-err">{{ loadError }}</div>

      <!-- 组题配置 -->
      <div v-else-if="step === 'config'" class="quiz-card">
        <h2 class="quiz-card-title">组一份试卷</h2>

        <div class="quiz-field">
          <label>课程</label>
          <select v-model="config.course">
            <option v-for="c in courses" :key="c" :value="c">{{ c }}</option>
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
          {{ knowledgeList.length - 1 }} 个知识点
        </div>

        <div v-if="loadError" class="quiz-inline-err">{{ loadError }}</div>

        <button class="quiz-btn" @click="buildPaper">开始组题 →</button>

        <button v-if="history.length" class="quiz-btn quiz-btn-ghost" @click="toggleHistory">
          {{ historyVisible ? '收起' : '查看' }}历史成绩（{{ history.length }}）
        </button>
        <div v-if="historyVisible" class="quiz-history">
          <div v-for="(h, i) in history" :key="i" class="quiz-history-item">
            <span>{{ h.course }}</span>
            <span class="quiz-history-rate" :class="{ bad: h.rate < 60, good: h.rate >= 80 }">{{ h.rate }}%</span>
            <span>{{ h.right }}/{{ h.total }}</span>
            <span class="quiz-history-time">{{ fmtTime(h.time) }}</span>
          </div>
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
          <button class="quiz-btn quiz-btn-ghost" :disabled="currentIdx === 0" @click="currentIdx--">← 上一题</button>
          <button v-if="currentIdx < paper.length - 1" class="quiz-btn" @click="currentIdx++">下一题 →</button>
          <button v-else class="quiz-btn quiz-btn-submit" @click="submit">交卷 · 判分</button>
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
  background: linear-gradient(135deg, #0D5C5A 0%, #148F8C 100%);
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
.quiz-err { color: #dc2626; }

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

.quiz-check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; color: var(--text-body); cursor: pointer; margin: 4px 0 16px; }
.quiz-check input { accent-color: var(--brand); width: 16px; height: 16px; }

.quiz-stats { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; }
.quiz-stats strong { color: var(--brand); }
.quiz-inline-err { color: #dc2626; font-size: 0.85rem; margin-bottom: 12px; }

.quiz-btn {
  display: inline-block; background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 11px 24px; font-size: 0.92rem; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.15s; margin-right: 10px;
}
.quiz-btn:hover { background: var(--brand-light); }
.quiz-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.quiz-btn-ghost { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
.quiz-btn-ghost:hover { background: var(--brand-pale); }
.quiz-btn-submit { background: #059669; }
.quiz-btn-submit:hover { background: #047857; }

.quiz-history { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
.quiz-history-item {
  display: flex; align-items: center; gap: 12px; padding: 8px 4px;
  font-size: 0.85rem; color: var(--text-body); border-bottom: 1px dashed var(--line);
}
.quiz-history-rate { font-weight: 700; }
.quiz-history-rate.good { color: #059669; }
.quiz-history-rate.bad { color: #dc2626; }
.quiz-history-time { margin-left: auto; color: var(--text-muted); font-size: 0.78rem; }

.quiz-progress-bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-bottom: 18px; }
.quiz-progress-fill { height: 100%; background: var(--brand); transition: width 0.3s; }
.quiz-question-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.quiz-q-no { font-weight: 700; color: var(--brand); }
.quiz-q-tag { background: var(--brand-pale); color: var(--brand); font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; }
.quiz-q-diff { color: var(--text-muted); font-size: 0.78rem; }
.quiz-q-knowledge { background: #fffbeb; color: #D97706; font-size: 0.75rem; padding: 2px 10px; border-radius: 12px; }

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
  border: 4px solid #D97706; color: #D97706;
}
.quiz-score-ring.good { border-color: #059669; color: #059669; }
.quiz-score-ring.bad { border-color: #dc2626; color: #dc2626; }
.quiz-score-num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
.quiz-score-total { font-size: 0.8rem; opacity: 0.7; }
.quiz-result-info h2 { font-family: var(--font-display); color: var(--brand); margin: 0 0 6px; }
.quiz-result-info p { color: var(--text-muted); margin: 0; }

.quiz-review-title { font-family: var(--font-display); color: var(--text-heading); margin: 8px 0 14px; }
.quiz-review-item { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.quiz-review-item.wrong { border-color: #fecaca; background: #fef2f2; }
.quiz-review-stem { display: flex; gap: 8px; font-size: 0.95rem; color: var(--text-heading); margin-bottom: 8px; line-height: 1.6; }
.quiz-review-mark { font-weight: 800; color: #059669; flex-shrink: 0; }
.quiz-review-item.wrong .quiz-review-mark { color: #dc2626; }
.quiz-review-answer { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--text-body); margin-bottom: 8px; }
.quiz-review-analysis { font-size: 0.85rem; color: var(--text-muted); background: var(--bg-warm); padding: 10px 12px; border-radius: 8px; line-height: 1.6; }
.quiz-result-actions { display: flex; gap: 10px; margin-top: 20px; }

@media (max-width: 600px) {
  .quiz-card { padding: 20px 16px; }
  .quiz-hero-title { font-size: 1.7rem; }
  .quiz-result-head { flex-direction: column; text-align: center; }
}
</style>
