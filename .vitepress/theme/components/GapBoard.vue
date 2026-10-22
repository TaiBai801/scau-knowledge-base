<script setup>
import { computed, onMounted, ref } from 'vue'
import ArBtn from './ArBtn.vue'
import ArBadge from './ArBadge.vue'
import ArLoading from './ArLoading.vue'
import ArEmpty from './ArEmpty.vue'
import ArError from './ArError.vue'

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

async function loadBoard() {
  loading.value = true
  failed.value = false
  try {
    const res = await fetch(BOARD_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    board.value = await res.json()
  } catch (e) {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(loadBoard)

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

/* ───────────── 我来补：提交给管理员，不在前端上传文件 ───────────── */

const KINDS = ['课件', '习题', '真题', '笔记', '其他']
const STATUS_LABEL = { pending: '待处理', accepted: '管理员已接单', done: '已上架', rejected: '未采纳' }
const STATUS_TONE = { pending: 'warning', accepted: 'brand', done: 'success', rejected: 'danger' }

const formOpen = ref(false)
const form = ref({ course: '', courseCode: '', kind: '课件', note: '', contact: '' })
const submitting = ref(false)
const formMsg = ref('')
const formErr = ref('')
const myItems = ref([])

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

function openForm(it) {
  form.value = {
    course: it ? it.name : '',
    courseCode: it ? it.code || '' : '',
    kind: '课件',
    note: '',
    contact: '',
  }
  formMsg.value = ''
  formErr.value = ''
  formOpen.value = true
}

async function loadMine() {
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'mine', fp: fp() }),
    })
    const d = await res.json()
    if (d && Array.isArray(d.items)) myItems.value = d.items
  } catch (e) {}
}

async function submitForm() {
  formErr.value = ''
  formMsg.value = ''
  if (!form.value.course.trim()) {
    formErr.value = '请填写课程名'
    return
  }
  if (!form.value.note.trim()) {
    formErr.value = '请简单说明要补什么'
    return
  }
  submitting.value = true
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        fp: fp(),
        course: form.value.course.trim(),
        courseCode: form.value.courseCode,
        kind: form.value.kind,
        note: form.value.note.trim(),
        contact: form.value.contact.trim(),
      }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
    formMsg.value = d.message || '已提交'
    form.value.note = ''
    form.value.contact = ''
    await loadMine()
  } catch (e) {
    formErr.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

onMounted(loadMine)
</script>

<template>
  <div class="gb">
    <ArLoading v-if="loading" text="正在读取缺口数据…" />
    <ArError v-else-if="failed" title="榜单没能加载出来" desc="可能是网络抖动，或榜单数据文件缺失。可以先去贡献一篇资料，稍后再回来看。">
      <template #retry>
        <ArBtn variant="ghost" size="sm" @click="loadBoard">重新加载</ArBtn>
      </template>
    </ArError>

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
      <ArEmpty v-if="!items.length" icon="🎉" title="这个筛选条件下没有缺口">
        换个筛选看看，或者点上方「我要补一门课」主动报一个。
      </ArEmpty>
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
              <th class="c-act">补料</th>
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
              <td class="c-act"><ArBtn variant="ghost" size="sm" @click="openForm(it)">我来补</ArBtn></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 我来补：提交线索给管理员 -->
      <section class="gb-submit">
        <div class="gb-submit-main">
          <h2 class="gb-submit-t">我能补一门</h2>
          <p class="gb-submit-p">
            把线索交给管理员：哪门课、缺什么、你能提供什么。管理员核实后统一上架。
            <strong>你自己不用传文件</strong>，页面上也不会出现任何未经审核的内容。
          </p>
        </div>
        <ArBtn variant="primary" size="md" @click="openForm(null)">我要补一门课</ArBtn>
      </section>

      <div v-if="myItems.length" class="gb-mine">
        <h3 class="gb-mine-t">我的提交</h3>
        <ul class="gb-mine-list">
          <li v-for="x in myItems" :key="x.id" class="gb-mine-item">
            <span class="gb-mine-course">{{ x.course }}</span>
            <span class="gb-mine-kind">{{ x.kind }}</span>
            <ArBadge :tone="STATUS_TONE[x.status] || 'neutral'">{{ STATUS_LABEL[x.status] || x.status }}</ArBadge>
            <span v-if="x.reply" class="gb-mine-reply">管理员：{{ x.reply }}</span>
          </li>
        </ul>
      </div>

      <p class="gb-foot">
        想系统了解贡献流程？<a href="/contribute">看看贡献指南</a>。
      </p>
    </template>

    <!-- 提交弹窗 -->
    <div v-if="formOpen" class="gb-modal" @click.self="formOpen = false">
      <div class="gb-dialog">
        <h3 class="gb-dialog-t">提交补料线索</h3>
        <p class="gb-dialog-hint">
          只提交线索，<strong>不上传文件</strong>。管理员核实后统一上架；如果不方便留联系方式，也可以只留说明。
        </p>

        <label class="gb-field">
          <span>课程</span>
          <input v-model="form.course" type="text" maxlength="40" placeholder="例如：概率论与数理统计B" />
        </label>

        <label class="gb-field">
          <span>能补什么</span>
          <select v-model="form.kind">
            <option v-for="k in KINDS" :key="k" :value="k">{{ k }}</option>
          </select>
        </label>

        <label class="gb-field">
          <span>说明</span>
          <textarea
            v-model="form.note"
            rows="4"
            maxlength="300"
            placeholder="例如：有 2023 年期末真题和答案解析，可提供 PDF；或：知道资料在班级群里，可以帮忙找"
          ></textarea>
        </label>

        <label class="gb-field">
          <span>联系方式（可选）</span>
          <input v-model="form.contact" type="text" maxlength="60" placeholder="QQ / 邮箱，便于管理员找你取文件" />
        </label>

        <p v-if="formErr" class="gb-err">{{ formErr }}</p>
        <p v-if="formMsg" class="gb-ok">{{ formMsg }}</p>

        <div class="gb-dialog-act">
          <ArBtn variant="ghost" size="sm" @click="formOpen = false">关闭</ArBtn>
          <ArBtn variant="primary" size="sm" :loading="submitting" @click="submitForm">
            提交给管理员
          </ArBtn>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gb { max-width: 1100px; margin: 0 auto; }

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
.gb-stat.gb-warn b { color: var(--color-danger); }

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
.gb-zero { color: var(--color-danger); }
.gb-score { font-weight: 600; color: var(--text-heading); }

.gb-foot { margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted); }
.gb-foot a { color: var(--brand); }

/* ── 我来补 ── */
.c-act { width: 5.2rem; text-align: center; }

.gb-submit {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  background: var(--brand-pale); border-radius: 10px; padding: 0.9rem 1.1rem; margin-top: 1.4rem;
}
.gb-submit-t { font-size: 0.92rem; font-weight: 600; color: var(--text-heading); margin: 0 0 0.25rem; }
.gb-submit-p { font-size: 0.78rem; color: var(--text-body); margin: 0; line-height: 1.7; }

.gb-mine { margin-top: 1rem; }
.gb-mine-t { font-size: 0.84rem; font-weight: 600; color: var(--text-heading); margin: 0 0 0.4rem; }
.gb-mine-list { list-style: none; margin: 0; padding: 0; }
.gb-mine-item {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  padding: 0.38rem 0; border-bottom: 1px dashed var(--line); font-size: 0.78rem;
}
.gb-mine-course { color: var(--text-body); font-weight: 500; }
.gb-mine-kind { color: var(--text-muted); font-size: 0.72rem; }
.gb-mine-reply { color: var(--text-muted); font-size: 0.72rem; }

/* ── 弹窗 ── */
.gb-modal {
  position: fixed; inset: 0; background: rgba(20, 30, 30, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 60;
}
.gb-dialog {
  background: #fff; border-radius: 12px; padding: 1.2rem 1.3rem;
  width: min(520px, 100%); max-height: 88vh; overflow-y: auto;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}
.gb-dialog-t { font-size: 1rem; font-weight: 600; color: var(--text-heading); margin: 0 0 0.35rem; }
.gb-dialog-hint { font-size: 0.76rem; color: var(--text-muted); margin: 0 0 0.9rem; line-height: 1.7; }
.gb-field { display: block; margin-bottom: 0.7rem; }
.gb-field span { display: block; font-size: 0.76rem; color: var(--text-muted); margin-bottom: 0.25rem; }
.gb-field input, .gb-field select, .gb-field textarea {
  width: 100%; box-sizing: border-box; padding: 0.4rem 0.55rem;
  border: 1px solid var(--line); border-radius: 6px; font-size: 0.82rem;
  font-family: inherit; color: var(--text-body); background: #fff;
}
.gb-field textarea { resize: vertical; line-height: 1.6; }
.gb-field input:focus, .gb-field select:focus, .gb-field textarea:focus {
  outline: none; border-color: var(--brand);
}
.gb-err { color: var(--color-danger); font-size: 0.78rem; margin: 0.2rem 0 0.6rem; }
.gb-ok { color: #047857; font-size: 0.78rem; margin: 0.2rem 0 0.6rem; }
.gb-dialog-act { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }

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
