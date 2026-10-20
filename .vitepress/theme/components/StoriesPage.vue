<script setup>
// 「Ta说」— 四问模板
// 数据源：data/stories.json，构建期静态导入（无运行时请求），随仓库版本化管理。
// 四问固定为：先抓什么 / 用什么资料 / 坑在哪 / 一句话。
// 部分学长只回答了其中几问，空字符串一律不渲染，避免"暂无"占位符堆砌。
import { ref, computed } from 'vue'
import seed from '../../../data/stories.json'

const questions = Array.isArray(seed?.questions) ? seed.questions : []
const stories = (Array.isArray(seed?.stories) ? seed.stories : []).filter((s) => s && s.id)

const courseFilter = ref('all')
const gradeFilter = ref('all')

function uniq(list) {
  const out = []
  for (const v of list) {
    const t = String(v || '').trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

const courses = computed(() => uniq(stories.map((s) => s.course)))
const grades = computed(() => uniq(stories.map((s) => s.grade)))

const filtered = computed(() =>
  stories.filter(
    (s) =>
      (courseFilter.value === 'all' || s.course === courseFilter.value) &&
      (gradeFilter.value === 'all' || s.grade === gradeFilter.value)
  )
)

const stats = computed(() => ({
  people: stories.length,
  courses: courses.value.length,
  questions: questions.length,
}))

// 每张卡预先把「有答案的问题」挑出来，模板里不再重复计算
const cards = computed(() =>
  filtered.value.map((s) => {
    const a = s.a || {}
    return {
      ...s,
      items: questions
        .map((q) => ({ ...q, text: String(a[q.id] ?? '').trim() }))
        .filter((q) => q.text !== ''),
    }
  })
)

function displayName(s) {
  return s.anonymous ? '匿名同学' : String(s.author || '').trim() || '匿名同学'
}
function initial(s) {
  return displayName(s).slice(0, 1) || '?'
}
// 稳定的头像底色：按姓名（匿名时按 id，避免同色一片且不泄露姓名）哈希取色
function hueOf(key) {
  let h = 0
  for (const ch of String(key || '')) h = (h * 31 + ch.codePointAt(0)) % 360
  return h
}
function avatarStyle(s) {
  const h = hueOf(s.anonymous ? s.id : s.author || s.id)
  return { background: `hsl(${h}, 32%, 92%)`, color: `hsl(${h}, 45%, 30%)` }
}
function scoreOf(s) {
  const n = Number(s.score)
  return Number.isFinite(n) && n > 0 ? n : null
}
// code 为空表示站内没有对应课程页（如「电路原理」站内名为「电路分析」），不生成链接
function courseLink(s) {
  const code = String(s.code || '').trim()
  return code ? `/majors/shared/${code}` : ''
}
</script>

<template>
  <div class="st-wrap">
    <div class="st-stats">
      <div class="st-stat">
        <span class="n">{{ stats.people }}</span>
        <span class="l">位学长学姐</span>
      </div>
      <div class="st-stat">
        <span class="n">{{ stats.courses }}</span>
        <span class="l">门课程</span>
      </div>
      <div class="st-stat">
        <span class="n">{{ stats.questions }}</span>
        <span class="l">个问题</span>
      </div>
    </div>

    <div class="st-filters">
      <div class="st-row" role="group" aria-label="按课程筛选">
        <span class="st-key">课程</span>
        <button
          class="st-chip"
          :class="{ 'is-on': courseFilter === 'all' }"
          :aria-pressed="courseFilter === 'all'"
          @click="courseFilter = 'all'"
        >
          全部
        </button>
        <button
          v-for="c in courses"
          :key="c"
          class="st-chip"
          :class="{ 'is-on': courseFilter === c }"
          :aria-pressed="courseFilter === c"
          @click="courseFilter = c"
        >
          {{ c }}
        </button>
      </div>
      <div class="st-row" role="group" aria-label="按年级筛选">
        <span class="st-key">年级</span>
        <button
          class="st-chip"
          :class="{ 'is-on': gradeFilter === 'all' }"
          :aria-pressed="gradeFilter === 'all'"
          @click="gradeFilter = 'all'"
        >
          全部
        </button>
        <button
          v-for="g in grades"
          :key="g"
          class="st-chip"
          :class="{ 'is-on': gradeFilter === g }"
          :aria-pressed="gradeFilter === g"
          @click="gradeFilter = g"
        >
          {{ g }}
        </button>
      </div>
    </div>

    <p class="st-count">共 {{ stats.people }} 条 · 当前 {{ filtered.length }} 条</p>

    <div v-if="cards.length" class="st-grid">
      <article v-for="s in cards" :key="s.id" class="st-card">
        <header class="st-head">
          <div class="st-avatar" :style="avatarStyle(s)">{{ initial(s) }}</div>
          <div class="st-who">
            <div class="st-name">{{ displayName(s) }}</div>
            <div class="st-tags">
              <span v-if="s.grade" class="st-tag">{{ s.grade }}</span>
              <span v-if="s.major" class="st-tag">{{ s.major }}</span>
            </div>
          </div>
          <div v-if="scoreOf(s)" class="st-score">
            <span class="v">{{ scoreOf(s) }}</span>
            <span class="u">分</span>
          </div>
        </header>

        <div class="st-course">
          <span class="st-course-kicker">这门课</span>
          <a v-if="courseLink(s)" class="st-course-name is-link" :href="courseLink(s)">{{ s.course }}</a>
          <span v-else class="st-course-name">{{ s.course }}</span>
        </div>

        <div class="st-answers">
          <div v-for="q in s.items" :key="q.id" class="st-qa">
            <div class="st-q">
              <span class="st-q-icon" aria-hidden="true">{{ q.icon }}</span>
              <span class="st-q-label">{{ q.label }}</span>
            </div>
            <p class="st-a">{{ q.text }}</p>
          </div>
          <p v-if="!s.items.length" class="st-skip">这位学长暂时只留下了打分。</p>
        </div>
      </article>
    </div>

    <p v-else class="st-empty">
      这个筛选下还没有经验分享。换个条件试试，或者去<a href="/contribute">贡献指南</a>留下你的。
    </p>
  </div>
</template>

<style scoped>
.st-wrap {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 顶部统计 ── */
.st-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 36px;
  padding: 4px 0 8px;
}
.st-stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.st-stat .n {
  font-family: var(--font-display, Georgia, serif);
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
  color: var(--brand);
}
.st-stat .l {
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* ── 筛选 ── */
.st-filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.st-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.st-key {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin-right: 2px;
}
.st-chip {
  appearance: none;
  font-family: inherit;
  font-size: 0.82rem;
  line-height: 1;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--brand-pale);
  color: var(--brand);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.st-chip:hover {
  border-color: var(--brand);
}
.st-chip.is-on {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.st-chip:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.st-count {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* ── 卡片网格 ── */
.st-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 18px;
  align-items: start;
}
.st-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 22px 22px 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-card, #fff);
}

/* 头部：头像 + 同路人标签 + 成绩 */
.st-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.st-avatar {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-weight: 700;
  background: var(--brand-pale);
  color: var(--brand);
}
.st-who {
  flex: 1;
  min-width: 0;
}
.st-name {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--text-heading);
  margin-bottom: 6px;
}
.st-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.st-tag {
  font-size: 0.72rem;
  line-height: 1.6;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--line);
  color: var(--text-body);
}
.st-score {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--brand-pale);
  color: var(--brand);
}
.st-score .v {
  font-family: var(--font-display, Georgia, serif);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
}
.st-score .u {
  font-size: 0.7rem;
  opacity: 0.8;
}

/* 课程名 */
.st-course {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.st-course-kicker {
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.st-course-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-heading);
  text-decoration: none;
}
.st-course-name.is-link {
  color: var(--brand);
  border-bottom: 1px solid transparent;
}
.st-course-name.is-link:hover {
  border-bottom-color: var(--brand);
}

/* 四问正文 */
.st-answers {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.st-qa {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.st-q {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.st-q-icon {
  font-size: 0.85rem;
  line-height: 1;
}
.st-a {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.75;
  color: var(--text-body);
}
.st-skip {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* 空结果 */
.st-empty {
  margin: 0;
  padding: 44px 20px;
  text-align: center;
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--text-body);
  border: 1px dashed var(--line);
  border-radius: 14px;
}
.st-empty a {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid currentColor;
}

@media (max-width: 640px) {
  .st-stats {
    gap: 20px;
  }
  .st-stat .n {
    font-size: 1.4rem;
  }
  .st-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .st-card {
    padding: 18px 16px 16px;
  }
}
</style>
