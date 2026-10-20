<script setup>
// 全站检索：按知识点反查课程
// 索引来自构建期生成的 /data/kp-index.json，题库来自 /data/bank.json
// 首屏不请求，用户首次输入时才加载，且整会话只加载一次
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'

const INDEX_URL = '/data/kp-index.json'
const BANK_URL = '/data/bank.json'

// 常见「只记得内容」的知识点，点一下直接检索
const HOT_TAGS = [
  '傅里叶变换',
  '基尔霍夫定律 KCL/KVL',
  '戴维南定理',
  '触发器',
  '卷积',
  '卡诺图',
  '拉普拉斯变换',
  'PID 控制',
]

const MAX_POINTS_PER_COURSE = 12

// ── 模块级缓存：同一会话内不重复请求 ──
let indexCache = null
let indexPromise = null
let bankCache = null
let bankPromise = null

const query = ref('')
const active = ref('')
const loading = ref(false)
const loadError = ref(false)
const index = shallowRef(null)
const bankTick = ref(0) // 题库到达后触发重新计算徽标与排序

let timer = null

const hasQuery = computed(() => query.value.trim().length > 0)

// ── 数据加载 ──
function fetchIndex() {
  if (indexCache) return Promise.resolve(indexCache)
  if (!indexPromise) {
    indexPromise = fetch(INDEX_URL)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then((data) => {
        indexCache = data
        return data
      })
      .catch((err) => {
        indexPromise = null // 允许重试
        throw err
      })
  }
  return indexPromise
}

function fetchBank() {
  if (bankCache) return Promise.resolve(bankCache)
  if (!bankPromise) {
    bankPromise = fetch(BANK_URL)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        bankCache = data || {}
        return bankCache
      })
      .catch(() => {
        bankCache = {}
        return bankCache
      })
  }
  return bankPromise
}

function ensureBank() {
  if (bankCache) {
    bankTick.value++
    return
  }
  fetchBank().then(() => {
    bankTick.value++
  })
}

async function ensureIndex() {
  if (indexCache) {
    index.value = indexCache
    ensureBank()
    return
  }
  loading.value = true
  loadError.value = false
  try {
    index.value = await fetchIndex()
    loading.value = false
    ensureBank()
  } catch (e) {
    loading.value = false
    loadError.value = true
  }
}

// ── 输入与防抖 ──
function runSearch(term) {
  active.value = (term === undefined ? query.value : term).trim()
  if (active.value) ensureIndex()
}

function onInput() {
  clearTimeout(timer)
  timer = setTimeout(runSearch, 200)
}

function onSubmit() {
  clearTimeout(timer)
  runSearch()
}

function clear() {
  clearTimeout(timer)
  query.value = ''
  active.value = ''
  loadError.value = false
}

function pickHot(tag) {
  query.value = tag
  onSubmit()
}

onBeforeUnmount(() => clearTimeout(timer))

// ── 匹配算法 ──
const SPLIT_RE = /[\s,，。、;；:：/|\\()（）【】\[\]<>《》"'“”‘’·\-_—]+/

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(q) {
  return normalize(q).split(SPLIT_RE).filter(Boolean)
}

// 逐字包含：关键词的字符按顺序出现在文本中（近似子序列）
function isSubsequence(needle, hay) {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++
  }
  return i === needle.length
}

// 144 完全等于 / 120 前缀 / 100 完全包含 / 70 分词全命中 / 40 分词逐字命中 / 25 整词逐字命中
function scorePoint(text, q, tokens) {
  const t = text.toLowerCase()
  if (t === q) return 144
  if (t.startsWith(q)) return 120
  if (t.includes(q)) return 100
  if (tokens.length > 1) {
    if (tokens.every((tk) => t.includes(tk))) return 70
    if (tokens.every((tk) => isSubsequence(tk, t))) return 40
    return 0
  }
  if (q.length >= 2 && isSubsequence(q, t)) return 25
  return 0
}

function matchCourseName(name, q, tokens) {
  const n = name.toLowerCase()
  if (n === q) return 130 // 课程名完全一致，最可信
  if (n.startsWith(q)) return 110
  if (n.includes(q)) return 90
  if (tokens.length > 1 && tokens.every((tk) => n.includes(tk))) return 70
  if (tokens.length > 1 && tokens.every((tk) => isSubsequence(tk, n))) return 40
  return 0
}

const bankCounts = computed(() => {
  void bankTick.value
  const map = new Map()
  if (!bankCache) return map
  for (const name of Object.keys(bankCache)) {
    const entry = bankCache[name]
    const n = entry && Array.isArray(entry.questions) ? entry.questions.length : 0
    if (n > 0) map.set(name, n)
  }
  return map
})

function makeGroup(course, ci, nameScore, knowledgeCount, bank) {
  const bankCount = bank.get(course.name) || 0
  return {
    key: 'c' + ci,
    name: course.name,
    path: course.path || '',
    code: course.code || '',
    nameHit: nameScore > 0,
    nameScore,
    hasBank: bankCount > 0,
    knowledgeCount,
    bank: bankCount,
    points: [],
    shown: [],
    matched: 0,
    best: 0,
    more: 0,
  }
}

const result = computed(() => {
  const q = normalize(active.value)
  const empty = { points: 0, courses: 0, groups: [], query: q }
  if (!q || !index.value) return empty

  const data = index.value
  const tokens = tokenize(q)
  const bank = bankCounts.value

  // 每门课的知识点总数（课程名命中但无知识点命中时用于提示）
  const knowledgeCount = new Array(data.courses.length).fill(0)
  for (const p of data.points) {
    if (Array.isArray(p) && knowledgeCount[p[1]] !== undefined) knowledgeCount[p[1]]++
  }

  const map = new Map()

  // 1) 课程名直接命中 —— 单独成组，整体置顶
  data.courses.forEach((c, i) => {
    const nameScore = matchCourseName(c.name, q, tokens)
    if (!nameScore) return
    map.set(i, makeGroup(c, i, nameScore, knowledgeCount[i], bank))
  })

  // 2) 知识点命中
  for (const p of data.points) {
    if (!Array.isArray(p) || !p[0]) continue
    const ci = p[1]
    const course = data.courses[ci]
    if (!course) continue
    const score = scorePoint(p[0], q, tokens)
    if (!score) continue
    let g = map.get(ci)
    if (!g) {
      g = makeGroup(course, ci, 0, knowledgeCount[ci], bank)
      map.set(ci, g)
    }
    g.points.push({ text: p[0], chapter: p[2] || '', score })
    g.matched++
    if (score > g.best) g.best = score
  }

  const groups = [...map.values()]
  for (const g of groups) {
    g.points.sort(
      (a, b) => b.score - a.score || a.text.length - b.text.length || a.text.localeCompare(b.text, 'zh')
    )
    g.shown = g.points.slice(0, MAX_POINTS_PER_COURSE)
    g.more = g.points.length - g.shown.length
  }

  // 课程名命中组置顶 → 课程名匹配度 → 最高分降序 → 有题库优先 → 最短命中词优先（更精准）
  groups.sort((a, b) => {
    if (a.nameHit !== b.nameHit) return a.nameHit ? -1 : 1
    if (b.nameScore !== a.nameScore) return b.nameScore - a.nameScore
    if (b.best !== a.best) return b.best - a.best
    if (a.hasBank !== b.hasBank) return a.hasBank ? -1 : 1
    const la = a.points.length ? a.points[0].text.length : 1e6
    const lb = b.points.length ? b.points[0].text.length : 1e6
    if (la !== lb) return la - lb
    if (a.nameHit && b.nameHit) return b.knowledgeCount - a.knowledgeCount
    return a.name.localeCompare(b.name, 'zh')
  })

  let points = 0
  for (const g of groups) points += g.matched
  return { points, courses: groups.length, groups, query: active.value }
})

// ── 关键词高亮（先转义再替换，避免 XSS） ──
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const marks = computed(() => {
  const q = normalize(active.value)
  if (!q) return []
  const list = [q, ...tokenize(q)].filter((t) => t.length >= 2)
  return [...new Set(list)].sort((a, b) => b.length - a.length).map((t) => escapeRegExp(escapeHtml(t)))
})

function highlight(text) {
  const safe = escapeHtml(text)
  if (!marks.value.length) return safe
  const re = new RegExp('(' + marks.value.join('|') + ')', 'gi')
  return safe.replace(re, '<mark class="kp-mark">$1</mark>')
}
</script>

<template>
  <div class="kp-search">
    <div class="kp-field">
      <svg class="kp-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8" />
        <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <input
        v-model="query"
        class="kp-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="不知道课名？输入你记得的知识点，比如：傅里叶变换"
        aria-label="按知识点搜索课程"
        @input="onInput"
        @keydown.enter.prevent="onSubmit"
        @keydown.esc="clear"
      />
      <button v-if="hasQuery" class="kp-clear" type="button" aria-label="清空搜索" @click="clear">✕</button>
    </div>

    <div v-if="!hasQuery" class="kp-hot">
      <span class="kp-hot-label">热门搜索</span>
      <button v-for="tag in HOT_TAGS" :key="tag" type="button" class="kp-hot-tag" @click="pickHot(tag)">
        {{ tag }}
      </button>
    </div>

    <p v-else-if="loading && !index" class="kp-status">正在加载知识点索引…</p>

    <div v-else-if="loadError && !index" class="kp-status kp-status-error">
      <p>知识点索引加载失败，暂时无法检索，请检查网络后重试。</p>
      <p class="kp-status-tip">也可以先去 <a href="/nav">全站导航</a> 按专业浏览全部页面。</p>
      <button type="button" class="kp-retry" @click="ensureIndex">重试</button>
    </div>

    <template v-else>
      <p v-if="result.courses > 0" class="kp-meta">
        <template v-if="result.points > 0">
          找到 <strong>{{ result.points }}</strong> 个相关知识点，涉及
          <strong>{{ result.courses }}</strong> 门课程
        </template>
        <template v-else>匹配到 <strong>{{ result.courses }}</strong> 门课程名</template>
      </p>

      <div v-if="result.courses === 0" class="kp-empty">
        <p class="kp-empty-title">没有找到「{{ active }}」相关的知识点</p>
        <p class="kp-empty-tip">
          换一个更短的词试试，比如只输「傅里叶」而不是「傅里叶变换的性质」。也可以去
          <a href="/nav">全站导航</a> 按专业浏览。
        </p>
      </div>

      <div v-else class="kp-groups">
        <section v-for="g in result.groups" :key="g.key" class="kp-group">
          <header class="kp-group-head">
            <a v-if="g.path" class="kp-course" :href="g.path">{{ g.name }}</a>
            <span v-else class="kp-course kp-course-plain">{{ g.name }}</span>
            <span v-if="g.bank" class="kp-badge kp-badge-bank">有题库（{{ g.bank }} 题）</span>
            <span v-if="g.path" class="kp-badge">有课程页</span>
            <span v-else class="kp-badge kp-badge-muted">暂无课程页</span>
            <span v-if="g.nameHit" class="kp-badge kp-badge-name">课程名命中</span>
          </header>

          <ul v-if="g.shown.length" class="kp-points">
            <li v-for="p in g.shown" :key="p.text" class="kp-point">
              <span class="kp-point-text" v-html="highlight(p.text)"></span>
              <span v-if="p.chapter" class="kp-chapter">{{ p.chapter }}</span>
            </li>
          </ul>

          <p v-if="g.nameHit && !g.matched" class="kp-namehit-tip">
            课程名直接命中 · 该课收录 {{ g.knowledgeCount }} 个知识点{{ g.path ? '，点课程名查看' : '' }}
          </p>

          <p v-if="g.more > 0" class="kp-more">
            该课还有 {{ g.more }} 个相关知识点未显示，换个更短的词可以看得更全
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kp-search {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.kp-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  transition: border-color 0.18s ease;
}

.kp-field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-pale);
}

.kp-icon {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--text-muted);
}

.kp-input {
  flex: 1;
  min-width: 0;
  padding: 14px 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-heading);
  font-family: inherit;
  font-size: 1rem;
}

.kp-input::placeholder {
  color: var(--text-muted);
}

.kp-clear {
  flex: none;
  padding: 4px 6px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
}

.kp-clear:hover {
  background: var(--brand-pale);
  color: var(--brand);
}

.kp-hot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.kp-hot-label {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.kp-hot-tag {
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--text-body);
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.kp-hot-tag:hover {
  border-color: var(--brand);
  background: var(--brand-pale);
  color: var(--brand);
}

.kp-status {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.7;
}

.kp-status-error {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  color: var(--text-body);
}

.kp-status-error p {
  margin: 0;
}

.kp-status-tip {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.kp-status-tip a {
  color: var(--brand);
}

.kp-retry {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid var(--brand);
  border-radius: 8px;
  background: transparent;
  color: var(--brand);
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.kp-retry:hover {
  background: var(--brand-pale);
}

.kp-meta {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.88rem;
}

.kp-meta strong {
  color: var(--brand);
  font-weight: 700;
}

.kp-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.kp-group {
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.kp-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.kp-course {
  color: var(--brand);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  text-decoration: none;
}

.kp-course:hover {
  text-decoration: underline;
}

.kp-course-plain {
  color: var(--text-heading);
}

.kp-badge {
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

.kp-badge-bank {
  border-color: transparent;
  background: var(--brand-pale);
  color: var(--brand);
}

.kp-badge-name {
  border-color: var(--brand);
  color: var(--brand);
}

.kp-badge-muted {
  color: var(--text-muted);
}

.kp-points {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.kp-point {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  color: var(--text-body);
  font-size: 0.92rem;
  line-height: 1.55;
}

.kp-point-text {
  color: var(--text-heading);
}

.kp-point-text :deep(.kp-mark) {
  padding: 0 2px;
  border-radius: 3px;
  background: var(--brand-pale);
  color: var(--brand);
}

.kp-chapter {
  color: var(--text-muted);
  font-size: 0.76rem;
}

.kp-namehit-tip,
.kp-more {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.6;
}

.kp-empty {
  padding: 22px;
  border: 1px dashed var(--line);
  border-radius: 12px;
}

.kp-empty-title {
  margin: 0 0 6px;
  color: var(--text-heading);
  font-size: 0.95rem;
  font-weight: 600;
}

.kp-empty-tip {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.7;
}

.kp-empty-tip a {
  color: var(--brand);
}

@media (max-width: 640px) {
  .kp-search {
    gap: 14px;
  }

  .kp-field {
    padding: 0 12px;
  }

  .kp-input {
    padding: 12px 0;
    font-size: 0.95rem;
  }

  .kp-hot-tag {
    padding: 4px 10px;
  }

  .kp-group {
    padding: 14px;
  }

  .kp-point {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
