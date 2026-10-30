<script setup>
import { trackFootprint } from '../lib/footprint'
// 学习周计划 · 学生端
// 流程：录入一周计划 → 学风建设部审核 → 通过后每日打卡（四周）→ 积分/二课分
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vitepress'
import { userAuth, restoreUser } from '../userauth.js'
import AuthPanel from '../AuthPanel.vue'
import ArBtn from './ArBtn.vue'
import ArBadge from './ArBadge.vue'
import ArLoading from './ArLoading.vue'
import ArError from './ArError.vue'

const API = '/api/weekplan'
const route = useRoute()
const loggedIn = computed(() => !!userAuth.user)
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const STATUS = { pending: ['待审核', 'warning'], approved: ['已通过', 'success'], rejected: ['已打回', 'danger'] }

function token() { try { return localStorage.getItem('user_token_v1') || '' } catch (e) { return '' } }
async function post(p) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ token: token() }, p)) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}

const loading = ref(true)
const loadError = ref('')
const plans = ref([])
const current = ref(null)
const today = ref('')

// 本周一（东八区近似：本地日期即可）
function mondayOf(d) {
  const x = new Date(d || Date.now())
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return x.toISOString().slice(0, 10)
}

const form = reactive({ weekStart: mondayOf(), goals: DAYS.map((_, i) => ({ day: i, task: '', hours: 0 })), note: '', err: '', submitting: false })
const showForm = ref(false)
const detailId = ref('')

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const d = await post({ action: 'get' })
    plans.value = d.plans || []
    current.value = d.current
    today.value = d.today
  } catch (e) { loadError.value = e.message || '加载失败' } finally { loading.value = false }
}

async function submit() {
  form.err = ''
  const filled = form.goals.filter((g) => g.task.trim())
  if (filled.length < 3) { form.err = '至少填写 3 天的计划内容'; return }
  form.submitting = true
  try {
    await post({ action: 'submit', weekStart: form.weekStart, goals: filled, note: form.note.trim() })
    showForm.value = false
    form.goals = DAYS.map((_, i) => ({ day: i, task: '', hours: 0 }))
    form.note = ''
    await load()
  } catch (e) { form.err = e.message } finally { form.submitting = false }
}

function autoGen() {
  form.err = ''
  let sel = null
  try { sel = JSON.parse(localStorage.getItem('my_term_v1') || 'null') } catch (e) { sel = null }
  const list = sel && Array.isArray(sel.courses) ? sel.courses.filter(Boolean) : []
  if (!list.length) { form.err = '先在「我的本学期」选好本学期课程，再回来一键生成'; return }
  form.goals = DAYS.map((_, i) => ({ day: i, task: '', hours: 0 }))
  ;[0, 1, 2, 3, 4].forEach((d, i) => {
    form.goals[d] = { day: d, task: list[i % list.length] + ' 复习', hours: 2 }
  })
  form.weekStart = mondayOf()
}

const checkinBusy = ref(false)
const checkinMsg = ref('')
async function doCheckin(p) {
  checkinBusy.value = true; checkinMsg.value = ''
  try {
    const d = await post({ action: 'checkin', planId: p.id, date: today.value, minutes: 0 })
    checkinMsg.value = '打卡成功' + (d.award && d.award.ok ? '，+' + d.award.points + ' 积分' : '')
    trackFootprint({ kind: 'checkin', ref: '周计划打卡' })
    await load()
  } catch (e) { checkinMsg.value = e.message } finally { checkinBusy.value = false }
}

function checked(p, date) { return !!(p.checkins && p.checkins[date]) }
function weekDates(start) {
  const out = []
  const s = new Date(start + 'T00:00:00')
  for (let i = 0; i < 28; i++) { const d = new Date(s); d.setDate(s.getDate() + i); out.push(d.toISOString().slice(0, 10)) }
  return out
}
const fmt = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '')

function prefillFromQuery() {
  const c = String((route.query && route.query.course) || '').trim()
  if (!c) return
  form.weekStart = mondayOf()
  form.goals = DAYS.map((_, i) => ({ day: i, task: '', hours: 0 }))
  ;[0, 1, 2, 3, 4].forEach((d) => { form.goals[d] = { day: d, task: c + ' 复习', hours: 2 } })
  showForm.value = true
}

onMounted(async () => {
  await restoreUser()
  if (loggedIn.value) await load()
  else loading.value = false
  prefillFromQuery()
})
</script>

<template>
  <div class="wp">
    <div v-if="!loggedIn" class="wp-gate">
      <p class="wp-gate-t">学习周计划与打卡记录绑定学生账号，请先登录。</p>
      <AuthPanel @authed="load" />
    </div>

    <ArLoading v-else-if="loading" text="正在加载计划…" />
    <ArError v-else-if="loadError" title="计划没能加载出来" :desc="loadError">
      <template #retry><ArBtn variant="ghost" size="sm" @click="load">重新加载</ArBtn></template>
    </ArError>

    <template v-else>
      <!-- 当前计划 -->
      <section class="wp-card">
        <div class="wp-card-head">
          <h2>本周计划</h2>
          <ArBtn v-if="!showForm" variant="primary" size="sm" @click="showForm = true">＋ 录入下周计划</ArBtn>
        </div>
        <template v-if="current">
          <div class="wp-cur">
            <div>
              <b>{{ current.weekStart }} 起 · 四周</b>
              <span class="wp-muted">{{ current.goals.length }} 天有计划 · 已打卡 {{ Object.keys(current.checkins || {}).length }} 天</span>
            </div>
            <ArBadge tone="success">已通过</ArBadge>
          </div>
          <div class="wp-today">
            <span v-if="checked(current, today)" class="wp-ok">今天（{{ today }}）已打卡</span>
            <ArBtn v-else variant="primary" size="md" :loading="checkinBusy" @click="doCheckin(current)">今日打卡</ArBtn>
            <span v-if="checkinMsg" class="wp-msg">{{ checkinMsg }}</span>
          </div>
          <div class="wp-week">
            <div v-for="(g, i) in current.goals" :key="i" class="wp-day">
              <span class="wp-day-name">{{ DAYS[g.day] }}</span>
              <span class="wp-day-task">{{ g.task }}</span>
              <span v-if="g.hours" class="wp-day-h">{{ g.hours }}h</span>
            </div>
          </div>
        </template>
        <p v-else class="wp-muted">当前没有进行中的计划。录入一份本周计划并提交审核，通过后即可每日打卡。</p>
      </section>

      <!-- 录入表单 -->
      <section v-if="showForm" class="wp-card">
        <h2>录入周计划</h2>
        <div style="margin:0 0 4px"><ArBtn variant="ghost" size="sm" @click="autoGen">⚡ 从我的本学期自动生成</ArBtn><span class="wp-muted" style="margin-left:8px">按周一到周五轮流排课，每天 2 小时，可再手动改</span></div>
        <label class="wp-f">周起始日期（周一）</label>
        <input v-model="form.weekStart" type="date" class="wp-input" />
        <label class="wp-f">每天打算做什么（至少 3 天，写具体：科目 + 任务 + 时长）</label>
        <div v-for="(g, i) in form.goals" :key="i" class="wp-row">
          <span class="wp-day-name">{{ DAYS[i] }}</span>
          <input v-model="g.task" class="wp-input" maxlength="120" :placeholder="DAYS[i] + ' 的任务，如：高数 第 3 章 习题 1-20 题'" />
          <input v-model.number="g.hours" type="number" min="0" max="16" step="0.5" class="wp-h" placeholder="小时" />
        </div>
        <label class="wp-f">备注（可选）</label>
        <input v-model="form.note" class="wp-input" maxlength="300" placeholder="如考试周调整、课程冲突说明" />
        <p v-if="form.err" class="wp-err">{{ form.err }}</p>
        <div class="wp-actions">
          <ArBtn variant="ghost" size="md" @click="showForm = false">取消</ArBtn>
          <ArBtn variant="primary" size="md" :loading="form.submitting" @click="submit">提交审核</ArBtn>
        </div>
      </section>

      <!-- 我的计划 -->
      <section class="wp-card">
        <h2>我的计划</h2>
        <div v-for="p in plans" :key="p.id" class="wp-plan">
          <div class="wp-plan-main">
            <b>{{ p.weekStart }} 起</b>
            <span class="wp-muted">提交 {{ fmt(p.createdAt) }} · 打卡 {{ Object.keys(p.checkins || {}).length }} 天</span>
            <span v-if="p.status === 'rejected' && p.reason" class="wp-reason">打回原因：{{ p.reason }}</span>
          </div>
          <ArBadge :tone="STATUS[p.status][1]">{{ STATUS[p.status][0] }}</ArBadge>
          <button class="wp-link" @click="detailId = detailId === p.id ? '' : p.id">{{ detailId === p.id ? '收起' : '展开' }}</button>
        </div>
        <p v-if="!plans.length" class="wp-muted">还没有提交过计划。</p>

        <template v-for="p in plans" :key="'d' + p.id">
          <div v-if="detailId === p.id" class="wp-detail">
            <div v-for="(g, i) in p.goals" :key="i" class="wp-day">
              <span class="wp-day-name">{{ DAYS[g.day] }}</span>
              <span class="wp-day-task">{{ g.task }}</span>
              <span v-if="g.hours" class="wp-day-h">{{ g.hours }}h</span>
            </div>
            <div class="wp-grid28">
              <span v-for="d in weekDates(p.weekStart)" :key="d" class="wp-cell" :class="{ on: checked(p, d) }" :title="d">{{ d.slice(5) }}</span>
            </div>
          </div>
        </template>
      </section>

      <p class="wp-foot">计划由学风建设部审核（质量与数量），通过后每日打卡、连续四周；完成情况计入二课赋分与网站积分。<br/>想自己细致排期（多课混排、按考试日期倒推）？<a href="/plan" style="color:var(--brand)">用学习计划（手动）</a></p>
    </template>
  </div>
</template>

<style scoped>
.wp { max-width: 900px; margin: 0 auto; }
.wp-gate { max-width: 520px; margin: 0 auto; }
.wp-gate-t { text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.wp-card { background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.wp-card h2 { margin: 0 0 12px; font-size: 0.98rem; color: var(--text-heading); font-family: var(--font-display); }
.wp-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.wp-card-head h2 { margin: 0; }
.wp-cur { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.wp-cur b { font-size: 0.9rem; color: var(--text-heading); }
.wp-muted { font-size: 0.78rem; color: var(--text-muted); }
.wp-today { display: flex; align-items: center; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
.wp-ok { color: var(--color-success); font-size: 0.84rem; }
.wp-msg { font-size: 0.78rem; color: var(--brand); }
.wp-week { border-top: 1px dashed var(--line); padding-top: 10px; }
.wp-day { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; font-size: 0.82rem; border-bottom: 1px solid #f6f3ec; }
.wp-day-name { flex: none; width: 42px; color: var(--brand); font-weight: 500; }
.wp-day-task { flex: 1; color: var(--text-body); }
.wp-day-h { color: var(--text-muted); font-size: 0.74rem; }
.wp-f { display: block; font-size: 0.76rem; color: var(--text-body); margin: 10px 0 4px; }
.wp-input { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 0.84rem; background: var(--vp-c-bg); color: var(--text-heading); }
.wp-row { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.wp-h { width: 76px; padding: 7px 8px; border: 1px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 0.8rem; background: var(--vp-c-bg); color: var(--text-heading); }
.wp-err { color: var(--color-danger); font-size: 0.78rem; margin: 8px 0 0; }
.wp-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
.wp-plan { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f6f3ec; flex-wrap: wrap; }
.wp-plan-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.wp-plan-main b { font-size: 0.85rem; color: var(--text-heading); }
.wp-reason { font-size: 0.74rem; color: var(--color-danger); }
.wp-link { background: none; border: none; color: var(--brand); font-size: 0.78rem; cursor: pointer; text-decoration: underline; padding: 0; }
.wp-detail { background: var(--brand-pale); border-radius: 10px; padding: 12px; margin: 8px 0; }
.wp-grid28 { display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px; margin-top: 10px; }
.wp-cell { font-size: 0.6rem; text-align: center; padding: 3px 0; border-radius: 4px; background: #fff; color: var(--text-muted); border: 1px solid var(--line); }
.wp-cell.on { background: var(--brand); color: #fff; border-color: var(--brand); }
.wp-foot { text-align: center; font-size: 0.74rem; color: var(--text-muted); margin: 16px 0 0; }
@media (max-width: 640px) { .wp-grid28 { grid-template-columns: repeat(7, 1fr); } }
.dark .wp-card { background: #151b1a; border-color: #2c3331; }
.dark .wp-input, .dark .wp-h { background: #0f1514; border-color: #2c3331; }
.dark .wp-detail { background: #12312e; }
</style>
