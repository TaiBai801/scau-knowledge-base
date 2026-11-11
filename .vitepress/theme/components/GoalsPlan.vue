<script setup>
// 目标计划 —— 大目标分区 + 多层任务 + 每日排期 + 备注（数据绑定学生云端账户）
// 布局：左侧「大目标」栏（可拖宽）｜ 右侧三标签页（任务 / 每日 / 备注），底部可拖高度
// 存储：本机 kx_goals_v1 缓存 + /api/user dataPut/dataGet（key=goals）自动同步
import { ref, reactive, computed, onMounted } from 'vue'
import { userAuth, restoreUser, getToken } from '../userauth.js'
import { read, write } from '../lib/storage'
import AuthPanel from '../AuthPanel.vue'
import ArBtn from './ArBtn.vue'

const API = '/api/user'
const LS_DATA = 'kx_goals_v1'
const LS_LAYOUT = 'kx_goals_layout_v1'
const CLOUD_KEY = 'goals'

const loggedIn = computed(() => !!userAuth.user)
const loading = ref(true)
const goals = ref([])
const activeId = ref('')
const selDate = ref(todayISO())
const syncMsg = ref('')
const syncing = ref(false)
const tab = ref('tasks')      // tasks | daily | notes
const showMeta = ref(false)   // 目标设置折叠

// 旧版布局键是 {c1,c2,r1}，这里做一次兼容迁移，避免读到旧值后宽度变 NaN
const savedLay = read(LS_LAYOUT, {}) || {}
const lay = reactive({
  side: clamp(Number(savedLay.side) || 250, 190, 420),
  h: clamp(Number(savedLay.h) || 640, 430, 860),
})
const boardEl = ref(null)

// ── 工具 ──
function todayISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function uid() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function hhmm(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }

const activeGoal = computed(() => goals.value.find((g) => g.id === activeId.value) || null)

// ── 任务树（扁平 parentId，展示前 DFS 归一化）──
function normalizeTasks(list) {
  const children = {}
  list.forEach((t) => { const k = t.parentId || ''; (children[k] = children[k] || []).push(t) })
  const out = []
  const walk = (pid) => (children[pid] || []).forEach((t) => { out.push(t); walk(t.id) })
  walk('')
  return out
}
function depthOf(list, t) {
  let d = 0, p = t.parentId
  while (p) { const pt = list.find((x) => x.id === p); if (!pt) break; d++; p = pt.parentId }
  return d
}
function taskProgress(g, taskId) {
  let sum = 0, n = 0
  Object.values(g.daily || {}).forEach((arr) => (arr || []).forEach((a) => {
    if (a.taskId === taskId) { sum += Number(a.progress) || 0; n++ }
  }))
  return n ? Math.round(sum / n) : 0
}

// ── 大目标 ──
function addGoal() {
  const g = {
    id: uid(), title: '新目标', desc: '', targetDate: '', taskGoal: '', motto: '',
    mottos: { goals: '', tasks: '', daily: '', notes: '' },
    notes: '', tasks: [], daily: {}, createdAt: Date.now(), updatedAt: Date.now(),
  }
  goals.value.push(g)
  activeId.value = g.id
  showMeta.value = true
  persist()
}
function removeGoal(id) {
  if (!confirm('删除这个大目标及其全部任务与排期？')) return
  goals.value = goals.value.filter((g) => g.id !== id)
  if (activeId.value === id) activeId.value = (goals.value[0] || {}).id || ''
  persist()
}

// ── 任务 ──
function addTask(g, parentId) {
  if (!g) return
  g.tasks.push({ id: uid(), title: '新任务', parentId: parentId || null })
  g.tasks = normalizeTasks(g.tasks)
  persist()
}
function removeTask(g, id) {
  const doomed = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    g.tasks.forEach((t) => { if (t.parentId && doomed.has(t.parentId) && !doomed.has(t.id)) { doomed.add(t.id); grew = true } })
  }
  g.tasks = g.tasks.filter((t) => !doomed.has(t.id))
  Object.keys(g.daily || {}).forEach((d) => { g.daily[d] = (g.daily[d] || []).filter((a) => !doomed.has(a.taskId)) })
  persist()
}
function moveTask(g, id, dir) {
  const rows = g.tasks
  const t = rows.find((x) => x.id === id)
  if (!t) return
  const siblings = rows.filter((x) => (x.parentId || '') === (t.parentId || ''))
  const pos = siblings.findIndex((x) => x.id === id)
  const swapWith = siblings[pos + dir]
  if (!swapWith) return
  const ia = rows.indexOf(t), ib = rows.indexOf(swapWith)
  rows.splice(ia, 1); rows.splice(ib, 0, t)
  persist()
}
function indentTask(g, id) {
  const rows = g.tasks
  const i = rows.findIndex((t) => t.id === id)
  const t = rows[i]
  const prev = rows[i - 1]
  if (!prev || (prev.parentId || '') !== (t.parentId || '')) return
  t.parentId = prev.id
  g.tasks = normalizeTasks(rows)
  persist()
}
function outdentTask(g, id) {
  const rows = g.tasks
  const t = rows.find((x) => x.id === id)
  if (!t || !t.parentId) return
  const p = rows.find((x) => x.id === t.parentId)
  t.parentId = p ? p.parentId : null
  g.tasks = normalizeTasks(rows)
  persist()
}

// ── 每日安排 ──
function dayList(g) { return (g && g.daily && g.daily[selDate.value]) || [] }
function addAssign(g) {
  if (!g || !g.tasks.length) return
  const arr = (g.daily[selDate.value] = g.daily[selDate.value] || [])
  arr.push({ id: uid(), taskId: g.tasks[0].id, minutes: 60, progress: 0, note: '' })
  persist()
}
function removeAssign(g, aid) {
  if (!g) return
  g.daily[selDate.value] = (g.daily[selDate.value] || []).filter((a) => a.id !== aid)
  persist()
}
function weekDates() {
  const base = new Date(selDate.value + 'T00:00:00')
  const dow = (base.getDay() + 6) % 7
  const mon = new Date(base); mon.setDate(base.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  })
}
function dayMinutes(g, date) {
  return (((g && g.daily && g.daily[date]) || [])).reduce((s, a) => s + (Number(a.minutes) || 0), 0)
}
function shiftDay(n) {
  const d = new Date(selDate.value + 'T00:00:00')
  d.setDate(d.getDate() + n)
  selDate.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// ── 持久化 / 云同步 ──
let pushTimer = null
function persist() {
  const g = activeGoal.value
  if (g) g.updatedAt = Date.now()
  write(LS_DATA, { goals: goals.value, updatedAt: Date.now() })
  if (loggedIn.value) { clearTimeout(pushTimer); pushTimer = setTimeout(pushCloud, 1200) }
}
async function post(payload) {
  const res = await fetch(API, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: getToken() }, payload)),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}
async function pushCloud() {
  if (!loggedIn.value) return
  syncing.value = true
  try {
    await post({ action: 'dataPut', key: CLOUD_KEY, value: { goals: goals.value, updatedAt: Date.now() } })
    syncMsg.value = '已自动同步 ' + hhmm(Date.now())
  } catch (e) { syncMsg.value = '同步失败：' + e.message } finally { syncing.value = false }
}
async function loadCloud() {
  syncing.value = true
  try {
    const d = await post({ action: 'dataGet', key: CLOUD_KEY })
    const v = d.value
    if (v && Array.isArray(v.goals) && v.goals.length) {
      goals.value = v.goals
      goals.value.forEach((g) => { g.tasks = normalizeTasks(g.tasks || []); g.daily = g.daily || {} })
      activeId.value = goals.value[0].id
      syncMsg.value = '已从云端载入 ' + (v.updatedAt ? hhmm(v.updatedAt) : '')
    } else {
      goals.value = seed(); activeId.value = goals.value[0].id
      await pushCloud(); syncMsg.value = '已创建示例目标并同步'
    }
    write(LS_DATA, { goals: goals.value, updatedAt: Date.now() })
  } catch (e) {
    syncMsg.value = '云端读取失败：' + e.message
    if (!goals.value.length) { goals.value = seed(); activeId.value = goals.value[0].id }
  } finally { syncing.value = false }
}
function seed() {
  const m = uid(), e = uid(), p = uid()
  return [{
    id: uid(), title: '考研', desc: '写在说明里：目标院校、专业、近年分数线。', targetDate: '2027-12-25',
    taskGoal: '总分 380+ · 数学一 120+', motto: '日拱一卒，功不唐捐。',
    mottos: { goals: '一个阶段，主攻一个目标', tasks: '拆到不能再拆，才是任务', daily: '今天的一小步', notes: '写给未来的自己' },
    notes: '', createdAt: Date.now(), updatedAt: Date.now(),
    tasks: [
      { id: m, title: '数学一', parentId: null },
      { id: uid(), title: '高等数学', parentId: m },
      { id: uid(), title: '线性代数', parentId: m },
      { id: uid(), title: '概率论与数理统计', parentId: m },
      { id: e, title: '英语二', parentId: null },
      { id: p, title: '政治', parentId: null },
    ],
    daily: {},
  }]
}

// ── 拖拽调尺寸 ──
function saveLay() { write(LS_LAYOUT, { ...lay }) }
function startDrag(e, which) {
  e.preventDefault()
  const sx = e.clientX, sy = e.clientY
  const s0 = lay.side, h0 = lay.h
  const mv = (ev) => {
    if (which === 'side') lay.side = clamp(s0 + (ev.clientX - sx), 190, 420)
    if (which === 'h') lay.h = clamp(h0 + (ev.clientY - sy), 430, 860)
  }
  const up = () => {
    window.removeEventListener('mousemove', mv)
    window.removeEventListener('mouseup', up)
    saveLay()
  }
  window.addEventListener('mousemove', mv)
  window.addEventListener('mouseup', up)
}

const WD = ['一', '二', '三', '四', '五', '六', '日']
function wdOf(date) { return '周' + WD[(new Date(date + 'T00:00:00').getDay() + 6) % 7] }

const daySummary = computed(() => {
  const g = activeGoal.value
  if (!g) return { min: 0, avg: 0 }
  const arr = dayList(g)
  const min = arr.reduce((s, a) => s + (Number(a.minutes) || 0), 0)
  const avg = arr.length ? Math.round(arr.reduce((s, a) => s + (Number(a.progress) || 0), 0) / arr.length) : 0
  return { min, avg }
})
const taskCount = computed(() => (activeGoal.value ? activeGoal.value.tasks.length : 0))
const dayCount = computed(() => (activeGoal.value ? dayList(activeGoal.value).length : 0))

onMounted(async () => {
  await restoreUser()
  if (loggedIn.value) await loadCloud()
  else {
    const local = read(LS_DATA, null)
    if (local && Array.isArray(local.goals) && local.goals.length) {
      goals.value = local.goals
      activeId.value = goals.value[0].id
    }
  }
  loading.value = false
})
</script>

<template>
  <div v-if="!userAuth.ready" class="gp-loading">加载中…</div>
  <div v-else-if="!loggedIn" class="gp-gate">
    <p class="gp-gate-t">目标与排期都绑定你的学生云端账户，登录后可在任意设备继续。</p>
    <AuthPanel @authed="loadCloud" />
  </div>

  <div v-else class="gp">
    <div class="gp-syncbar">
      <span class="gp-sync-dot" :class="{ busy: syncing }"></span>
      <span class="gp-sync-text">{{ syncMsg || '改动会自动同步到云端账户' }}</span>
      <ArBtn variant="ghost" size="sm" @click="loadCloud">从云端恢复</ArBtn>
    </div>

    <div v-if="loading" class="gp-loading">载入中…</div>
    <div v-else class="gp-board" ref="boardEl" :style="{ height: lay.h + 'px' }">
      <!-- 左：大目标 -->
      <aside class="gp-side" :style="{ width: lay.side + 'px' }">
        <header class="gp-side-h">
          <span>大目标</span>
          <button class="gp-icon" @click="addGoal" title="新增大目标">＋</button>
        </header>
        <div class="gp-goals">
          <div v-for="g in goals" :key="g.id" class="gp-goal" :class="{ on: g.id === activeId }" @click="activeId = g.id; tab = 'tasks'">
            <div class="gp-goal-row">
              <b class="gp-goal-t">{{ g.title || '未命名' }}</b>
              <button class="gp-icon danger" @click.stop="removeGoal(g.id)" title="删除">✕</button>
            </div>
            <div class="gp-goal-sub">{{ g.targetDate || '未设目标日期' }}</div>
            <div v-if="g.motto" class="gp-goal-motto">{{ g.motto }}</div>
          </div>
          <p v-if="!goals.length" class="gp-empty" style="padding:6px">点右上角 ＋ 新建第一个大目标。</p>
        </div>
        <p class="gp-hint">{{ activeGoal?.mottos?.goals || '一个阶段，主攻一个目标' }}</p>
      </aside>

      <div class="gp-rz" @mousedown="startDrag($event, 'side')" title="拖拽调整宽度"></div>

      <!-- 右：工作区 -->
      <section class="gp-main">
        <p v-if="!activeGoal" class="gp-empty" style="padding:20px">先在左侧选择或新建一个大目标。</p>
        <template v-else>
          <header class="gp-tabs">
            <button :class="{ on: tab === 'tasks' }" @click="tab = 'tasks'">任务 <em>{{ taskCount }}</em></button>
            <button :class="{ on: tab === 'daily' }" @click="tab = 'daily'">每日安排 <em>{{ dayCount }}</em></button>
            <button :class="{ on: tab === 'notes' }" @click="tab = 'notes'">备注</button>
            <span class="gp-tabs-sp"></span>
            <button class="gp-tabs-meta" v-if="tab === 'tasks'" @click="showMeta = !showMeta">{{ showMeta ? '收起目标设置' : '目标设置' }}</button>
          </header>

          <!-- 任务 -->
          <div v-if="tab === 'tasks'" class="gp-pane">
            <div v-if="showMeta" class="gp-meta">
              <label class="gp-f"><span>目标说明</span><textarea v-model="activeGoal.desc" rows="2" placeholder="院校 / 分数线 / 为什么选它" @input="persist"></textarea></label>
              <div class="gp-f2">
                <label class="gp-f"><span>目标日期</span><input v-model="activeGoal.targetDate" type="date" @input="persist" /></label>
                <label class="gp-f"><span>任务目标</span><input v-model="activeGoal.taskGoal" placeholder="如：总分 380+ · 数学一 120+" @input="persist" /></label>
              </div>
              <label class="gp-f"><span>激励文案</span><input v-model="activeGoal.motto" placeholder="一句话给自己" @input="persist" /></label>
            </div>

            <div class="gp-tasks">
              <div v-for="t in activeGoal.tasks" :key="t.id" class="gp-task" :style="{ paddingLeft: 4 + depthOf(activeGoal.tasks, t) * 22 + 'px' }">
                <span class="gp-bar" :class="{ deep: depthOf(activeGoal.tasks, t) > 0 }"></span>
                <input v-model="t.title" class="gp-task-name" placeholder="任务名称" @input="persist" />
                <span class="gp-prog" :class="{ done: taskProgress(activeGoal, t.id) >= 100 }">{{ taskProgress(activeGoal, t.id) }}%</span>
                <span class="gp-ops">
                  <button @click="addTask(activeGoal, t.id)" title="添加子任务">＋子</button>
                  <button @click="moveTask(activeGoal, t.id, -1)" title="上移">↑</button>
                  <button @click="moveTask(activeGoal, t.id, 1)" title="下移">↓</button>
                  <button @click="indentTask(activeGoal, t.id)" title="降级为上一任务的子任务">缩进</button>
                  <button @click="outdentTask(activeGoal, t.id)" title="提升一层">提升</button>
                  <button class="danger" @click="removeTask(activeGoal, t.id)" title="删除（含子任务）">删除</button>
                </span>
              </div>
              <p v-if="!activeGoal.tasks.length" class="gp-empty" style="padding:10px 4px">还没有任务，先加一个一级任务，再往下拆。</p>
            </div>

            <div class="gp-pane-foot">
              <ArBtn variant="ghost" size="sm" @click="addTask(activeGoal, null)">＋ 添加一级任务</ArBtn>
              <span class="gp-hint">{{ activeGoal.mottos?.tasks || '拆到不能再拆，才是任务' }}</span>
            </div>
          </div>

          <!-- 每日 -->
          <div v-if="tab === 'daily'" class="gp-pane">
            <div class="gp-daybar">
              <div class="gp-daynav">
                <button class="gp-icon" @click="shiftDay(-1)" title="前一天">‹</button>
                <input type="date" v-model="selDate" class="gp-date" />
                <button class="gp-icon" @click="shiftDay(1)" title="后一天">›</button>
              </div>
              <div class="gp-sum">合计 <b>{{ daySummary.min }}</b> 分钟 · 平均进度 <b>{{ daySummary.avg }}%</b></div>
            </div>

            <div class="gp-week">
              <button v-for="d in weekDates()" :key="d" class="gp-wd" :class="{ on: d === selDate, today: d === todayISO() }" @click="selDate = d">
                <span class="gp-wd-d">{{ wdOf(d) }}</span>
                <span class="gp-wd-n">{{ d.slice(5) }}</span>
                <span class="gp-wd-m">{{ dayMinutes(activeGoal, d) ? dayMinutes(activeGoal, d) + ' 分' : '—' }}</span>
              </button>
            </div>

            <div class="gp-assigns">
              <div v-for="a in dayList(activeGoal)" :key="a.id" class="gp-assign">
                <div class="gp-assign-r1">
                  <select v-model="a.taskId" class="gp-task-sel" @change="persist">
                    <option v-for="t in activeGoal.tasks" :key="t.id" :value="t.id">{{ '　'.repeat(depthOf(activeGoal.tasks, t)) + (t.title || '未命名') }}</option>
                  </select>
                  <label class="gp-min">时长 <input v-model.number="a.minutes" type="number" min="0" max="720" @input="persist" /> 分</label>
                  <button class="gp-icon danger" @click="removeAssign(activeGoal, a.id)" title="删除这条安排">✕</button>
                </div>
                <div class="gp-assign-r2">
                  <input v-model.number="a.progress" type="range" min="0" max="100" step="5" class="gp-range" @input="persist" />
                  <span class="gp-pct">{{ a.progress }}%</span>
                  <input v-model="a.note" class="gp-note-in" placeholder="这条安排的备注（可选）" @input="persist" />
                </div>
              </div>
              <p v-if="!dayList(activeGoal).length" class="gp-empty" style="padding:10px 4px">这一天还没有安排。点下面按钮加一条。</p>
            </div>

            <div class="gp-pane-foot">
              <ArBtn variant="ghost" size="sm" :disabled="!activeGoal.tasks.length" @click="addAssign(activeGoal)">＋ 给这一天加任务</ArBtn>
              <span class="gp-hint">{{ activeGoal.mottos?.daily || '今天的一小步' }}</span>
            </div>
          </div>

          <!-- 备注 -->
          <div v-if="tab === 'notes'" class="gp-pane">
            <textarea v-model="activeGoal.notes" class="gp-notes-in" placeholder="阶段性复盘、资料清单、心情记录…… 自动保存" @input="persist"></textarea>
            <div class="gp-pane-foot">
              <span class="gp-hint">{{ activeGoal.mottos?.notes || '写给未来的自己' }}</span>
            </div>
          </div>
        </template>
      </section>
    </div>
    <div class="gp-hz" @mousedown="startDrag($event, 'h')" title="拖拽调整整板高度"><span></span></div>
  </div>
</template>

<style scoped>
.gp { display: flex; flex-direction: column; gap: 8px; }
.gp-loading, .gp-gate { padding: 30px 0; }
.gp-gate-t { color: var(--text-muted, #64748B); font-size: 0.92rem; margin-bottom: 12px; }
.gp-syncbar { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-muted, #64748B); }
.gp-sync-dot { width: 8px; height: 8px; border-radius: 50%; background: #7FC9BE; }
.gp-sync-dot.busy { background: #148F8C; animation: gp-pulse 1s infinite; }
@keyframes gp-pulse { 50% { opacity: 0.4 } }

.gp-board { display: flex; border: 1px solid var(--line, #E8E4DB); border-radius: 12px; background: #fff; overflow: hidden; min-height: 430px; }
.gp-side { display: flex; flex-direction: column; flex: none; background: #FCFBF8; min-width: 0; }
.gp-side-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line, #E8E4DB); font-weight: 600; color: var(--brand, #0D5C5A); font-size: 0.95rem; }
.gp-goals { flex: 1; overflow: auto; padding: 10px; }
.gp-goal { border: 1px solid var(--line, #E8E4DB); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; cursor: pointer; background: #fff; }
.gp-goal.on { border-color: var(--brand, #0D5C5A); background: var(--brand-pale, #E8F4F0); }
.gp-goal-row { display: flex; align-items: center; gap: 6px; }
.gp-goal-t { font-size: 0.95rem; flex: 1; overflow-wrap: anywhere; line-height: 1.5; }
.gp-goal-sub { font-size: 0.78rem; color: var(--text-muted, #64748B); margin-top: 4px; }
.gp-goal-motto { font-size: 0.78rem; color: var(--brand, #0D5C5A); margin-top: 6px; line-height: 1.5; }

.gp-icon { border: 1px solid var(--line, #E8E4DB); background: #fff; border-radius: 7px; min-width: 26px; height: 26px; padding: 0 8px; font-size: 0.8rem; cursor: pointer; color: var(--text-muted, #64748B); flex: none; }
.gp-icon:hover { border-color: var(--brand, #0D5C5A); color: var(--brand, #0D5C5A); }
.gp-icon.danger:hover { border-color: #c0392b; color: #c0392b; }

.gp-rz { flex: none; width: 6px; cursor: col-resize; background: var(--line, #E8E4DB); }
.gp-rz:hover { background: var(--brand, #0D5C5A); }
.gp-hz { height: 14px; cursor: row-resize; display: flex; align-items: center; justify-content: center; }
.gp-hz span { width: 54px; height: 4px; border-radius: 3px; background: var(--line, #E8E4DB); }
.gp-hz:hover span { background: var(--brand, #0D5C5A); }

.gp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gp-tabs { display: flex; align-items: center; gap: 6px; padding: 8px 12px 0; border-bottom: 1px solid var(--line, #E8E4DB); flex: none; }
.gp-tabs button { border: none; background: transparent; padding: 8px 12px; font-size: 0.9rem; color: var(--text-muted, #64748B); cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit; }
.gp-tabs button.on { color: var(--brand, #0D5C5A); font-weight: 700; border-bottom-color: var(--brand, #0D5C5A); }
.gp-tabs button em { font-style: normal; font-size: 0.74rem; color: #94a3b8; margin-left: 2px; }
.gp-tabs-sp { flex: 1; }
.gp-tabs-meta { font-size: 0.8rem !important; border: 1px solid var(--line, #E8E4DB) !important; border-radius: 999px; padding: 4px 12px !important; margin-bottom: 6px; }
.gp-tabs-meta:hover { border-color: var(--brand, #0D5C5A); color: var(--brand, #0D5C5A); }

.gp-pane { flex: 1; overflow: auto; display: flex; flex-direction: column; padding: 12px 14px 0; min-height: 0; }
.gp-meta { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px dashed var(--line, #E8E4DB); border-radius: 10px; margin-bottom: 12px; background: #FCFBF8; flex: none; }
.gp-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.8rem; color: var(--text-muted, #64748B); flex: 1; min-width: 0; }
.gp-f2 { display: flex; gap: 10px; flex-wrap: wrap; }
.gp-f input, .gp-f textarea { border: 1px solid var(--line, #E8E4DB); border-radius: 8px; padding: 7px 9px; font-size: 0.88rem; font-family: inherit; background: #fff; color: var(--text, #1F2A28); width: 100%; }
.gp-f input:focus, .gp-f textarea:focus { outline: 2px solid var(--brand, #0D5C5A); border-color: var(--brand, #0D5C5A); }

.gp-tasks { flex: 1; }
.gp-task { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-bottom: 1px solid #F4F1EA; }
.gp-bar { width: 2px; height: 18px; border-radius: 2px; background: #D9D3C6; flex: none; }
.gp-bar.deep { background: var(--brand-pale, #E8F4F0); }
.gp-task-name { flex: 1; min-width: 0; border: 1px solid transparent; border-radius: 7px; padding: 5px 8px; font-size: 0.9rem; background: transparent; font-family: inherit; color: var(--text, #1F2A28); }
.gp-task-name:hover { border-color: var(--line, #E8E4DB); background: #fff; }
.gp-task-name:focus { outline: none; border-color: var(--brand, #0D5C5A); background: #fff; }
.gp-prog { font-size: 0.78rem; color: var(--text-muted, #64748B); min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; flex: none; }
.gp-prog.done { color: var(--brand, #0D5C5A); font-weight: 700; }
.gp-ops { display: flex; gap: 4px; flex: none; }
.gp-ops button { border: 1px solid var(--line, #E8E4DB); background: #fff; border-radius: 6px; font-size: 0.74rem; padding: 3px 8px; cursor: pointer; color: var(--text-muted, #64748B); font-family: inherit; white-space: nowrap; }
.gp-ops button:hover { border-color: var(--brand, #0D5C5A); color: var(--brand, #0D5C5A); }
.gp-ops button.danger:hover { border-color: #c0392b; color: #c0392b; }

.gp-pane-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 0 12px; border-top: 1px dashed var(--line, #E8E4DB); flex: none; }
.gp-hint { font-size: 0.8rem; color: var(--text-muted, #64748B); margin: 0; }
.gp-side .gp-hint { padding: 10px 14px; border-top: 1px dashed var(--line, #E8E4DB); }
.gp-empty { font-size: 0.86rem; color: var(--text-muted, #64748B); }

.gp-daybar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; flex: none; }
.gp-daynav { display: flex; align-items: center; gap: 6px; }
.gp-date { border: 1px solid var(--line, #E8E4DB); border-radius: 8px; padding: 6px 8px; font-size: 0.86rem; font-family: inherit; }
.gp-sum { font-size: 0.84rem; color: var(--text-muted, #64748B); }
.gp-sum b { color: var(--brand, #0D5C5A); font-variant-numeric: tabular-nums; }

.gp-week { display: flex; gap: 6px; margin-bottom: 12px; flex: none; }
.gp-wd { flex: 1; min-width: 0; border: 1px solid var(--line, #E8E4DB); background: #fff; border-radius: 9px; padding: 7px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; font-family: inherit; }
.gp-wd:hover { border-color: var(--brand, #0D5C5A); }
.gp-wd.on { border-color: var(--brand, #0D5C5A); background: var(--brand-pale, #E8F4F0); }
.gp-wd.today .gp-wd-n { color: var(--brand, #0D5C5A); font-weight: 700; }
.gp-wd-d { font-size: 0.72rem; color: var(--text-muted, #64748B); }
.gp-wd-n { font-size: 0.85rem; color: var(--text, #1F2A28); }
.gp-wd-m { font-size: 0.72rem; color: var(--brand, #0D5C5A); font-variant-numeric: tabular-nums; }

.gp-assigns { flex: 1; }
.gp-assign { border: 1px solid var(--line, #E8E4DB); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px; }
.gp-assign-r1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gp-task-sel { flex: 1 1 200px; min-width: 160px; border: 1px solid var(--line, #E8E4DB); border-radius: 8px; padding: 6px 8px; font-size: 0.88rem; font-family: inherit; background: #fff; }
.gp-min { font-size: 0.8rem; color: var(--text-muted, #64748B); display: flex; align-items: center; gap: 5px; }
.gp-min input { width: 62px; border: 1px solid var(--line, #E8E4DB); border-radius: 7px; padding: 5px 7px; font-size: 0.85rem; font-family: inherit; }
.gp-assign-r2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gp-range { flex: 0 0 160px; accent-color: var(--brand, #0D5C5A); }
.gp-pct { font-size: 0.82rem; color: var(--brand, #0D5C5A); font-variant-numeric: tabular-nums; min-width: 38px; }
.gp-note-in { flex: 1 1 180px; min-width: 140px; border: 1px solid var(--line, #E8E4DB); border-radius: 8px; padding: 6px 9px; font-size: 0.85rem; font-family: inherit; background: #fff; }

.gp-notes-in { flex: 1; min-height: 240px; border: 1px solid var(--line, #E8E4DB); border-radius: 10px; padding: 12px 14px; font-size: 0.92rem; line-height: 1.8; font-family: inherit; resize: none; background: #fff; }
.gp-notes-in:focus { outline: 2px solid var(--brand, #0D5C5A); border-color: var(--brand, #0D5C5A); }

@media (max-width: 900px) {
  .gp-board { flex-direction: column; height: auto !important; }
  .gp-side { width: auto !important; max-height: 260px; border-bottom: 1px solid var(--line, #E8E4DB); }
  .gp-rz, .gp-hz { display: none; }
  .gp-ops button { padding: 3px 6px; }
  .gp-range { flex: 1 0 120px; }
}
</style>
