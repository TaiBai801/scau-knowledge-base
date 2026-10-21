<script setup>
import { computed, onMounted, ref } from 'vue'

// 缺口榜：读取构建期生成的 /data/gap-board.json
// 口径由生成器写入文件（formula 字段），页面照抄，保证「数字可解释」。
const BOARD_URL = '/data/gap-board.json'

const loading = ref(true)
const failed = ref(false)
const board = ref(null)
const filter = ref('all')
const keyword = ref('')

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'noMaterial', label: '零资料' },
  { id: 'noBank', label: '缺题库' },
  { id: 'noSyllabus', label: '缺大纲' },
  { id: 'required', label: '仅必修' },
]

onMounted(async () => {
  try {
    const res = await fetch(BOARD_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    board.value = await res.json()
  } catch (e) {
    failed.value = true
  } finally {
    loading.value = false
  }
})

const totals = computed(() => board.value?.totals || null)
const formula = computed(() => board.value?.formula || null)
const allItems = computed(() => board.value?.items || [])

const items = computed(() => {
  let list = allItems.value
  if (filter.value === 'noMaterial') list = list.filter((i) => i.materials === 0)
  else if (filter.value === 'noBank') list = list.filter((i) => i.bank === 0)
  else if (filter.value === 'noSyllabus') list = list.filter((i) => i.syllabus === 0)
  else if (filter.value === 'required') list = list.filter((i) => i.required)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (i) =>
        i.name.toLowerCase().includes(kw) ||
        (i.majorNames || []).some((m) => m.toLowerCase().includes(kw))
    )
  }
  return list
})

const majorRows = computed(() => {
  const m = totals.value?.byMajor || {}
  return Object.keys(m)
    .map((k) => ({ name: k, ...m[k], rate: m[k].total ? Math.round((m[k].withMaterials / m[k].total) * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate)
})

const countOf = (id) => {
  const list = allItems.value
  if (id === 'noMaterial') return list.filter((i) => i.materials === 0).length
  if (id === 'noBank') return list.filter((i) => i.bank === 0).length
  if (id === 'noSyllabus') return list.filter((i) => i.syllabus === 0).length
  if (id === 'required') return list.filter((i) => i.required).length
  return list.length
}

function coursePath(code) {
  return code ? '/majors/shared/' + code : ''
}
</script>

<template>
  <div class="gb">
    <div v-if="loading" class="gb-state">正在读取缺口数据…</div>
    <div v-else-if="failed" class="gb-state">
      榜单数据没能加载出来，可能是网络或文件缺失。<a href="/contribute">先去贡献一篇资料</a>
    </div>

    <template v-else>
      <!-- 口径说明：必须显眼，数字才有可信度 -->
      <section v-if="formula" class="gb-formula">
        <h2 class="gb-formula-t">这张榜是怎么排的</h2>
        <code class="gb-expr">{{ formula.expression }}</code>
        <div class="gb-factors">
          <span class="gb-f">缺口系数：</span>
          <span v-for="(v, k) in formula.gapFactor" :key="k" class="gb-chip">{{ k }} = {{ v }}</span>
        </div>
        <ul class="gb-notes">
          <li v-for="(n, i) in formula.notes" :key="i">{{ n }}</li>
        </ul>
      </section>

      <!-- 总览 -->
      <section v-if="totals" class="gb-overview">
        <div class="gb-stat">
          <b>{{ totals.courses }}</b><span>门课程（去重课名）</span>
        </div>
        <div class="gb-stat">
          <b>{{ totals.withMaterials }}</b><span>有资料</span>
        </div>
        <div class="gb-stat gb-warn">
          <b>{{ totals.noMaterial }}</b><span>零资料</span>
        </div>
        <div class="gb-stat gb-warn">
          <b>{{ totals.noMaterialNoBank }}</b><span>零资料且无题库</span>
        </div>
        <div class="gb-stat">
          <b>{{ totals.coverageRate }}%</b><span>资料覆盖率</span>
        </div>
      </section>

      <!-- 按专业 -->
      <section v-if="majorRows.length" class="gb-majors">
        <h2 class="gb-h2">各专业覆盖情况</h2>
        <div class="gb-major-list">
          <div v-for="m in majorRows" :key="m.name" class="gb-major">
            <div class="gb-major-top">
              <span class="gb-major-name">{{ m.name }}</span>
              <span class="gb-major-num">{{ m.withMaterials }}/{{ m.total }} · {{ m.rate }}%</span>
            </div>
            <div class="gb-bar"><i :style="{ width: Math.max(m.rate, 1) + '%' }"></i></div>
          </div>
        </div>
      </section>

      <!-- 筛选 -->
      <section class="gb-tools">
        <div class="gb-filters">
          <button
            v-for="f in FILTERS"
            :key="f.id"
            :class="['gb-tab', filter === f.id ? 'on' : '']"
            @click="filter = f.id"
          >
            {{ f.label }}<em>{{ countOf(f.id) }}</em>
          </button>
        </div>
        <input v-model="keyword" class="gb-search" type="search" placeholder="搜课程名或专业名" />
      </section>

      <p class="gb-count">共 {{ items.length }} 门 · 按需求强度从高到低</p>

      <!-- 榜单 -->
      <div v-if="!items.length" class="gb-state">这个筛选条件下没有课程。</div>
      <div v-else class="gb-table-wrap">
        <table class="gb-table">
          <thead>
            <tr>
              <th class="c-rank">#</th>
              <th>课程</th>
              <th class="c-num">专业</th>
              <th class="c-num">学分</th>
              <th class="c-tag">必修</th>
              <th class="c-num">资料</th>
              <th class="c-num">题库</th>
              <th class="c-num">需求分</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in items" :key="it.name">
              <td class="c-rank">{{ it.rank }}</td>
              <td>
                <a v-if="coursePath(it.code)" :href="coursePath(it.code)" class="gb-name">{{ it.name }}</a>
                <span v-else class="gb-name">{{ it.name }}</span>
                <span v-if="!it.inCurriculum" class="gb-sub">培养方案表内无此课</span>
              </td>
              <td class="c-num">{{ it.majors }}</td>
              <td class="c-num">{{ it.credits || '—' }}</td>
              <td class="c-tag"><span v-if="it.required" class="gb-req">必修</span></td>
              <td class="c-num" :class="it.materials === 0 ? 'gb-zero' : ''">{{ it.materials }}</td>
              <td class="c-num" :class="it.bank === 0 ? 'gb-zero' : ''">{{ it.bank }}</td>
              <td class="c-num gb-score">{{ it.score }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="gb-foot">
        想补哪门课？<a href="/contribute">看看贡献指南</a>，或者直接在对应课程页上传资料。
      </p>
    </template>
  </div>
</template>

<style scoped>
.gb { max-width: 1100px; margin: 0 auto; }
.gb-state { text-align: center; color: var(--text-muted); padding: 2.5rem 0; font-size: 0.9rem; }

.gb-formula {
  background: var(--brand-pale);
  border-radius: 10px;
  padding: 1rem 1.2rem;
  margin-bottom: 1.6rem;
}
.gb-formula-t { font-size: 0.92rem; font-weight: 600; color: var(--text-heading); margin: 0 0 0.6rem; }
.gb-expr {
  display: block;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  color: var(--brand);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  overflow-x: auto;
}
.gb-factors { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.6rem; font-size: 0.78rem; color: var(--text-body); }
.gb-f { color: var(--text-muted); }
.gb-chip { background: #fff; border: 1px solid var(--line); border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.74rem; }
.gb-notes { margin: 0.6rem 0 0; padding-left: 1.1rem; font-size: 0.76rem; color: var(--text-muted); line-height: 1.75; }

.gb-overview { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.7rem; margin-bottom: 1.6rem; }
.gb-stat { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 0.8rem 0.6rem; text-align: center; }
.gb-stat b { display: block; font-size: 1.35rem; color: var(--brand); font-variant-numeric: tabular-nums; }
.gb-stat span { font-size: 0.72rem; color: var(--text-muted); }
.gb-stat.gb-warn b { color: #B23B36; }

.gb-majors { margin-bottom: 1.6rem; }
.gb-h2 { font-size: 0.92rem; font-weight: 600; color: var(--text-heading); margin: 0 0 0.7rem; }
.gb-major-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.6rem; }
.gb-major { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 0.55rem 0.7rem; }
.gb-major-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.35rem; }
.gb-major-name { font-size: 0.8rem; color: var(--text-body); }
.gb-major-num { font-size: 0.72rem; color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.gb-bar { height: 5px; background: var(--line); border-radius: 999px; overflow: hidden; }
.gb-bar i { display: block; height: 100%; background: var(--brand); border-radius: 999px; }

.gb-tools { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: center; justify-content: space-between; margin-bottom: 0.7rem; }
.gb-filters { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.gb-tab {
  border: 1px solid var(--line); background: #fff; color: var(--text-body);
  border-radius: 999px; padding: 0.28rem 0.7rem; font-size: 0.78rem; cursor: pointer;
  transition: all 0.15s;
}
.gb-tab em { font-style: normal; color: var(--text-muted); margin-left: 0.3rem; font-size: 0.72rem; }
.gb-tab:hover { border-color: var(--brand); }
.gb-tab.on { background: var(--brand); border-color: var(--brand); color: #fff; }
.gb-tab.on em { color: rgba(255, 255, 255, 0.75); }
.gb-search {
  flex: 1 1 200px; max-width: 280px; padding: 0.32rem 0.6rem; font-size: 0.8rem;
  border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--text-body);
}
.gb-search:focus { outline: none; border-color: var(--brand); }

.gb-count { font-size: 0.76rem; color: var(--text-muted); margin: 0 0 0.5rem; }

.gb-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.gb-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.gb-table th, .gb-table td { padding: 0.45rem 0.55rem; text-align: left; border-bottom: 1px solid var(--line); }
.gb-table th { font-weight: 500; font-size: 0.74rem; color: var(--text-muted); background: var(--bg-warm, #F7F5F0); white-space: nowrap; }
.gb-table tr:last-child td { border-bottom: none; }
.gb-table tbody tr:hover { background: var(--brand-pale); }
.c-rank { width: 3rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.c-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.c-tag { width: 4rem; }
.gb-name { color: var(--text-body); text-decoration: none; }
a.gb-name { color: var(--brand); }
a.gb-name:hover { text-decoration: underline; }
.gb-sub { display: block; font-size: 0.7rem; color: var(--text-muted); }
.gb-req { font-size: 0.7rem; background: var(--brand-pale); color: var(--brand); border-radius: 4px; padding: 0.05rem 0.35rem; }
.gb-zero { color: #B23B36; }
.gb-score { font-weight: 600; color: var(--text-heading); }

.gb-foot { margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted); }
.gb-foot a { color: var(--brand); }

@media (max-width: 860px) {
  .gb-overview { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .gb-tools { flex-direction: column; align-items: stretch; }
  .gb-search { max-width: none; }
  .gb-table { font-size: 0.78rem; }
  .gb-table th, .gb-table td { padding: 0.4rem 0.35rem; }
  .c-tag { width: 3rem; }
}
</style>
