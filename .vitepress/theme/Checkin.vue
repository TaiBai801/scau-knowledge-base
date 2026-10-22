<script setup>
// 学习打卡 — 独立页面组件（/checkin），与现有页面零耦合
// 依赖：./userauth.js（登录态）、./leaderboard.js（排行榜上报契约）、./AuthPanel.vue（登录 UI）
//
// 访客模式边界（产品约定）：
//   未登录可查看本页全部内容，唯一差异是「无法记录与保存打卡数据」——
//   点击打卡时展示未登录提示条并引导注册/登录；不为访客在本地留任何打卡数据。
import { ref, computed, onMounted } from 'vue'
import { userAuth, restoreUser, getToken } from './userauth.js'
import { reportCheckin } from './leaderboard.js'
import AuthPanel from './AuthPanel.vue'
import ArBtn from './components/ArBtn.vue'
import ArPageHero from './components/ArPageHero.vue'

// ── 本地状态 ──
const days = ref({})        // { 'YYYY-MM-DD': { minutes, count, note } }
const stats = ref({ totalDays: 0, totalMinutes: 0, streak: 0, lastDate: '' })
const minutes = ref(30)     // 本次打卡时长
const note = ref('')
const submitting = ref(false)
const guestHint = ref(false)     // 访客点打卡后的引导提示条
const loadError = ref('')
const reportState = ref('')      // 排行榜上报状态：''|ok|fail
const justChecked = ref(false)   // 本次会话内打卡成功提示

const MIN_CHOICES = [15, 30, 45, 60, 90, 120]

// ── 工具 ──
function todayLocal(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftLocal(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const today = computed(() => todayLocal())
const loggedIn = computed(() => !!userAuth.user)
const todayRec = computed(() => days.value[today.value] || null)

// 近 35 天热力格（旧→新），按分钟强度分 4 档
const heatCells = computed(() => {
  const out = []
  for (let i = 34; i >= 0; i--) {
    const d = todayLocal(-i)
    const rec = days.value[d]
    out.push({ date: d, minutes: rec ? rec.minutes : 0, level: rec ? (rec.minutes >= 120 ? 3 : rec.minutes >= 60 ? 2 : 1) : 0 })
  }
  return out
})

// ── 数据加载（仅登录用户；访客不加载、不保存任何数据）──
async function loadMine() {
  if (!loggedIn.value) return
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list', token: getToken(), days: 90 }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `加载失败（${res.status}）`)
    days.value = data.days || {}
    stats.value = data.stats || stats.value
  } catch (e) {
    loadError.value = '打卡记录加载失败：' + e.message
  }
}

// ── 打卡 ──
async function doCheckin() {
  // 访客模式：不记录任何数据，仅提示引导
  if (!loggedIn.value) {
    guestHint.value = true
    return
  }
  if (submitting.value) return
  if (minutes.value <= 0 || minutes.value > 720) { loadError.value = '学习时长需在 1-720 分钟之间'; return }
  submitting.value = true
  loadError.value = ''
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'checkin', token: getToken(),
        date: today.value, minutes: minutes.value, note: note.value.trim(),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `打卡失败（${res.status}）`)

    // 更新本地视图
    days.value[today.value] = { minutes: data.day.minutes, count: data.day.count, note: note.value.trim() }
    stats.value = data.stats
    justChecked.value = true
    note.value = ''

    // 排行榜上报：打卡成功后 fire-and-forget 调用一次，失败静默重试 1 次（见 leaderboard.js 契约）
    reportState.value = ''
    reportCheckin({
      token: getToken(),
      date: today.value,
      minutes: data.day.minutes,
      streak: data.stats && data.stats.streak,
    }).then((r) => { reportState.value = r && r.ok ? 'ok' : 'fail' })
      .catch(() => { reportState.value = 'fail' })
  } catch (e) {
    loadError.value = e.message
  } finally {
    submitting.value = false
  }
}

// ── 登录态变化联动 ──
function onAuthed() {
  guestHint.value = false
  days.value = {}
  stats.value = { totalDays: 0, totalMinutes: 0, streak: 0, lastDate: '' }
  loadMine()
}
function onLoggedOut() {
  days.value = {}
  stats.value = { totalDays: 0, totalMinutes: 0, streak: 0, lastDate: '' }
  guestHint.value = false
  reportState.value = ''
  justChecked.value = false
}

onMounted(() => {
  restoreUser().then(() => { if (loggedIn.value) loadMine() })
})
</script>

<template>
  <div class="ci-wrap">
    <!-- Hero -->
    <ArPageHero center tag="积少成多" title="学习打卡" sub="每天记录学习时长，连续天数与累计统计云端同步；不登录也能浏览本页，登录后即可开始记录。" />

    <div class="ci-inner">
      <!-- 登录/用户卡（独立组件，登录后打卡数据自动绑定账号） -->
      <AuthPanel @authed="onAuthed" @logged-out="onLoggedOut" />

      <!-- 访客引导提示条 -->
      <div v-if="guestHint && !loggedIn" class="ci-guest-hint">
        <div class="ci-guest-text">
          👋 当前为访客模式：浏览、组题、计划等功能不受影响，但打卡数据需登录后才能记录保存。
          <strong>注册/登录后，打卡记录将绑定账号并同步到云端。</strong>
        </div>
        <div class="ci-guest-arrow">↑ 请在上方登录或注册（几秒完成）</div>
      </div>

      <!-- 打卡卡片 -->
      <div class="ci-card">
        <div class="ci-card-head">
          <h2 class="ci-card-title">今日打卡 · {{ today }}</h2>
          <span v-if="todayRec" class="ci-today-badge">
            今日已学 {{ todayRec.minutes }} 分钟<template v-if="todayRec.count > 1"> · {{ todayRec.count }} 次</template>
          </span>
        </div>

        <div class="ci-min-row">
          <button
            v-for="m in MIN_CHOICES" :key="m"
            class="ci-min-chip" :class="{ active: minutes === m }"
            @click="minutes = m"
          >{{ m }} 分钟</button>
        </div>
        <input v-model.number="minutes" type="number" min="1" max="720" class="ci-min-input" placeholder="或自定义分钟数（1-720）">

        <input v-model.trim="note" type="text" class="ci-note-input" maxlength="100" placeholder="备注（选填）：今天学了什么？如：电路分析·基尔霍夫定律">

        <div v-if="justChecked && loggedIn" class="ci-done-tip">
          ✅ 打卡成功！本次 {{ minutes }} 分钟已记录<template v-if="stats.streak > 1">，已连续 {{ stats.streak }} 天</template>。
          <template v-if="reportState === 'ok'">已同步上报排行榜（榜页建设中）。</template>
          <template v-else-if="reportState === 'fail'">排行榜上报暂未成功，不影响打卡记录。</template>
        </div>

        <div v-if="loadError" class="ci-err">{{ loadError }}</div>

        <ArBtn variant="primary" size="md" class="ci-btn" style="width:100%" :loading="submitting" :disabled="!userAuth.ready" @click="doCheckin">
          {{ loggedIn ? '✏️ 打卡' : '✏️ 打卡（需登录）' }}
        </ArBtn>
      </div>

      <!-- 统计区 -->
      <div class="ci-card">
        <h2 class="ci-card-title">我的统计</h2>
        <div class="ci-stats">
          <div class="ci-stat">
            <span class="ci-stat-num">{{ stats.streak }}</span>
            <span class="ci-stat-label">连续天数 🔥</span>
          </div>
          <div class="ci-stat">
            <span class="ci-stat-num">{{ stats.totalDays }}</span>
            <span class="ci-stat-label">累计打卡天数</span>
          </div>
          <div class="ci-stat">
            <span class="ci-stat-num">{{ Math.round(stats.totalMinutes / 60 * 10) / 10 }}</span>
            <span class="ci-stat-label">累计学时（小时）</span>
          </div>
        </div>
        <div v-if="!loggedIn" class="ci-stat-guest">登录后这里会显示你的连续打卡与累计统计。</div>

        <!-- 近 35 天热力图 -->
        <div class="ci-heat-head">
          <span>最近 35 天</span>
          <span class="ci-heat-legend">
            <i class="lv0"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i>
            <em>少 → 多</em>
          </span>
        </div>
        <div class="ci-heat">
          <div
            v-for="c in heatCells" :key="c.date"
            class="ci-cell" :class="'lv' + c.level"
            :title="c.date + (c.minutes ? ' · ' + c.minutes + ' 分钟' : ' · 未打卡')"
          ></div>
        </div>
      </div>

      <div class="ci-footer">
        打卡记录保存在云端并与账号绑定；排行榜页面建设中，数据已通过接口预留上报。
      </div>
    </div>
  </div>
</template>

<style scoped>
.ci-wrap { min-height: 60vh; }

.ci-inner { max-width: 760px; margin: -24px auto 48px; padding: 0 20px; display: flex; flex-direction: column; gap: 16px; }

/* 访客提示条 */
.ci-guest-hint {
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 18px;
  animation: ci-pop 0.25s ease;
}
.ci-guest-text { font-size: 0.88rem; color: #78350F; line-height: 1.7; }
.ci-guest-text strong { color: var(--color-warning); }
.ci-guest-arrow { font-size: 0.8rem; color: var(--color-warning); margin-top: 6px; }
@keyframes ci-pop { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }

.ci-card {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 16px;
  padding: 24px 28px; box-shadow: var(--shadow-card);
}
.ci-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.ci-card-title { font-family: var(--font-display); font-size: 1.2rem; color: var(--brand); margin: 0; }
.ci-today-badge {
  font-size: 0.8rem; color: var(--color-success); background: #ecfdf5; border: 1px solid #a7f3d0;
  border-radius: 12px; padding: 4px 12px;
}

.ci-min-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.ci-min-chip {
  padding: 8px 16px; border-radius: 16px; border: 1px solid var(--line);
  background: var(--bg-warm); color: var(--text-body); font-size: 0.87rem;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.ci-min-chip:hover { border-color: var(--brand); }
.ci-min-chip.active { border-color: var(--brand); background: var(--brand-pale); color: var(--brand); font-weight: 600; }

.ci-min-input, .ci-note-input {
  width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 0.92rem; font-family: inherit; background: var(--bg-warm); color: var(--text-heading);
  box-sizing: border-box; margin-bottom: 10px;
}
.ci-min-input:focus, .ci-note-input:focus { outline: 2px solid var(--brand); border-color: var(--brand); }

.ci-done-tip {
  font-size: 0.85rem; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0;
  border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; line-height: 1.7;
}
.ci-err {
  color: var(--color-danger); font-size: 0.85rem; background: var(--color-danger-pale); border: 1px solid #fecaca;
  border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;
}

/* 统计 */
.ci-stats { display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 14px; }
.ci-stat { display: flex; flex-direction: column; align-items: center; }
.ci-stat-num { font-family: var(--font-display); font-size: 1.9rem; font-weight: 700; color: var(--brand); }
.ci-stat-label { font-size: 0.8rem; color: var(--text-muted); }
.ci-stat-guest { font-size: 0.85rem; color: var(--text-muted); background: var(--bg-warm); border-radius: 8px; padding: 10px 14px; }

.ci-heat-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 0.85rem; color: var(--text-muted); margin: 18px 0 10px;
}
.ci-heat-legend { display: flex; align-items: center; gap: 4px; }
.ci-heat-legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.ci-heat-legend em { font-style: normal; font-size: 0.75rem; margin-left: 4px; }
.ci-heat { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.ci-cell { aspect-ratio: 1; border-radius: 4px; background: var(--bg-warm); border: 1px solid var(--line); }
.ci-cell.lv1 { background: #a7f3d0; border-color: #a7f3d0; }
.ci-cell.lv2 { background: #34d399; border-color: #34d399; }
.ci-cell.lv3 { background: var(--color-success); border-color: var(--color-success); }
.ci-heat-legend .lv0 { background: var(--bg-warm); border: 1px solid var(--line); }
.ci-heat-legend .lv1 { background: #a7f3d0; }
.ci-heat-legend .lv2 { background: #34d399; }
.ci-heat-legend .lv3 { background: var(--color-success); }

.ci-footer { font-size: 0.8rem; color: var(--text-muted); text-align: center; }

@media (max-width: 600px) {
  .ci-card { padding: 18px 16px; }
  .ci-stats { gap: 20px; justify-content: space-around; }
}
</style>
