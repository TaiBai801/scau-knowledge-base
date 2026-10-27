<script setup>
// 积分商城 · 学生端
// 数据：/api/points（服务端记账，前端只读）；兑换填姓名+学号，幂等 requestId
import { computed, onMounted, reactive, ref } from 'vue'
import { userAuth, restoreUser } from '../userauth.js'
import AuthPanel from '../AuthPanel.vue'
import ArBtn from './ArBtn.vue'
import ArBadge from './ArBadge.vue'
import ArLoading from './ArLoading.vue'
import ArError from './ArError.vue'
import ArEmpty from './ArEmpty.vue'

const API = '/api/points'
const loggedIn = computed(() => !!userAuth.user)

function token() {
  try { return localStorage.getItem('user_token_v1') || '' } catch (e) { return '' }
}
async function post(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: token() }, payload)),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}

const loading = ref(true)
const loadError = ref('')
const data = reactive({ balance: 0, rules: {}, prizes: [], ledger: [], orders: [] })
const showLedger = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const d = await post({ action: 'get' })
    data.balance = d.balance || 0
    data.rules = d.rules || {}
    data.prizes = d.prizes || []
    data.ledger = d.ledger || []
    data.orders = d.orders || []
  } catch (e) {
    loadError.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const ruleList = computed(() => Object.keys(data.rules).map((k) => Object.assign({ key: k }, data.rules[k])))
const doneOrders = computed(() => data.orders.filter((o) => o.status !== 'rejected').length)

// ── 兑换 ──
const modal = reactive({ open: false, prize: null, name: '', studentId: '', contact: '', note: '', err: '', submitting: false })

function alreadyGot(prize) {
  if (!prize.limitPerUser) return false
  const cnt = data.orders.filter((o) => o.prizeId === prize.id && o.status !== 'rejected').length
  return cnt >= prize.limitPerUser
}
function canRedeem(prize) {
  return prize.stock > 0 && data.balance >= prize.points && !alreadyGot(prize)
}
function openRedeem(prize) {
  modal.open = true
  modal.prize = prize
  modal.name = ''
  modal.studentId = (userAuth.user && userAuth.user.username) || ''
  modal.contact = ''
  modal.note = ''
  modal.err = ''
}
function closeRedeem() { modal.open = false }

function uuid() {
  try { return crypto.randomUUID() } catch (e) { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }
}

async function submitRedeem() {
  modal.err = ''
  if (modal.name.trim().length < 2) { modal.err = '请填写真实姓名（2 字以上）'; return }
  if (!/^\d{8,12}$/.test(modal.studentId.trim())) { modal.err = '学号需为 8-12 位数字'; return }
  modal.submitting = true
  try {
    const d = await post({
      action: 'redeem',
      prizeId: modal.prize.id,
      name: modal.name.trim(),
      studentId: modal.studentId.trim(),
      contact: modal.contact.trim(),
      note: modal.note.trim(),
      requestId: uuid(),
    })
    data.balance = d.balance
    modal.open = false
    await load()
  } catch (e) {
    modal.err = e.message || '兑换失败'
  } finally {
    modal.submitting = false
  }
}

const STATUS = { pending: ['待发放', 'warning'], done: ['已发放', 'success'], rejected: ['已驳回', 'danger'] }

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '')
const reasonText = (k) => {
  const r = data.rules[k]
  if (r) return r.label
  if (k.startsWith('redeem:')) return '兑换 ' + k.slice(7)
  if (k.startsWith('redeem_rejected:')) return '兑换驳回退回 ' + k.slice(16)
  if (k.startsWith('manual:')) return '人工调整：' + k.slice(7)
  return k
}

onMounted(async () => {
  await restoreUser()
  if (loggedIn.value) await load()
  else loading.value = false
})
</script>

<template>
  <div class="pt">
    <div v-if="!loggedIn" class="pt-gate">
      <p class="pt-gate-t">积分与兑换记录都绑定你的学生账号，请先登录。</p>
      <AuthPanel @authed="load" />
    </div>

    <ArLoading v-else-if="loading" text="正在读取积分…" />
    <ArError v-else-if="loadError" title="积分数据没能加载出来" :desc="loadError">
      <template #retry><ArBtn variant="ghost" size="sm" @click="load">重新加载</ArBtn></template>
    </ArError>

    <template v-else>
      <!-- 我的积分 -->
      <section class="pt-card pt-mine">
        <div class="pt-mine-main">
          <div class="pt-balance">
            <em>{{ data.balance }}</em><span>分</span>
          </div>
          <div class="pt-mine-meta">
            <p>已兑换 {{ doneOrders }} 件 · 共 {{ data.ledger.length }} 条积分记录</p>
            <button class="pt-link" @click="showLedger = !showLedger">
              {{ showLedger ? '收起积分明细' : '查看积分明细' }}
            </button>
          </div>
        </div>
        <div v-if="showLedger" class="pt-ledger">
          <div v-for="l in data.ledger" :key="l.id" class="pt-ledger-row">
            <span class="pt-ledger-why">{{ reasonText(l.reason) }}</span>
            <span class="pt-ledger-at">{{ fmtTime(l.at) }}</span>
            <span class="pt-ledger-delta" :class="{ minus: l.delta < 0 }">{{ l.delta > 0 ? '+' + l.delta : l.delta }}</span>
          </div>
          <p v-if="!data.ledger.length" class="pt-muted">还没有积分记录，去打卡或做题就能拿到第一笔。</p>
        </div>
      </section>

      <!-- 获取规则 -->
      <section class="pt-card">
        <h2 class="pt-h">怎么赚积分</h2>
        <div class="pt-rules">
          <div v-for="r in ruleList" :key="r.key" class="pt-rule">
            <span class="pt-rule-name">{{ r.label }}</span>
            <span class="pt-rule-pts">+{{ r.points }}</span>
            <span class="pt-rule-cap">{{ r.dailyCap > 0 ? '每日 ' + r.dailyCap + ' 次' : '不限次' }}</span>
          </div>
          <p v-if="!ruleList.length" class="pt-muted">积分规则尚未配置。</p>
        </div>
        <p class="pt-note">规则由工作人员在后台配置，调整只影响之后的行为，不回溯历史。</p>
      </section>

      <!-- 奖品一览 -->
      <section class="pt-card">
        <h2 class="pt-h">奖品一览</h2>
        <div v-if="data.prizes.length" class="pt-grid">
          <article v-for="p in data.prizes" :key="p.id" class="pt-prize">
            <div class="pt-prize-img">
              <img v-if="p.image" :src="p.image" :alt="p.name" loading="lazy" />
              <span v-else class="pt-prize-ph">🎁</span>
            </div>
            <div class="pt-prize-body">
              <b class="pt-prize-name">{{ p.name }}</b>
              <p v-if="p.desc" class="pt-prize-desc">{{ p.desc }}</p>
              <div class="pt-prize-meta">
                <span class="pt-prize-pts">{{ p.points }} 分</span>
                <span class="pt-prize-stock">{{ p.stock > 0 ? '库存 ' + p.stock : '已兑完' }}</span>
              </div>
              <ArBtn
                v-if="canRedeem(p)"
                variant="primary" size="sm" style="width:100%"
                @click="openRedeem(p)"
              >立即兑换</ArBtn>
              <ArBtn v-else variant="ghost" size="sm" style="width:100%" disabled>
                {{ p.stock <= 0 ? '已兑完' : alreadyGot(p) ? '已兑换' : '还差 ' + (p.points - data.balance) + ' 分' }}
              </ArBtn>
              <p v-if="p.limitPerUser" class="pt-prize-limit">每人限 {{ p.limitPerUser }} 件</p>
            </div>
          </article>
        </div>
        <ArEmpty v-else icon="🎁" title="奖品还在路上">
          工作人员正在挑选文创奖品，上架后会出现在这里。
        </ArEmpty>
      </section>

      <!-- 我的兑换 -->
      <section class="pt-card">
        <h2 class="pt-h">我的兑换</h2>
        <div v-for="o in data.orders" :key="o.id" class="pt-order">
          <div class="pt-order-main">
            <b>{{ o.prizeName }}</b>
            <span class="pt-order-meta">{{ o.points }} 分 · {{ fmtTime(o.createdAt) }}</span>
            <span v-if="o.status === 'rejected' && o.rejectReason" class="pt-order-reason">驳回原因：{{ o.rejectReason }}</span>
          </div>
          <ArBadge :tone="STATUS[o.status] ? STATUS[o.status][1] : 'neutral'">
            {{ STATUS[o.status] ? STATUS[o.status][0] : o.status }}
          </ArBadge>
        </div>
        <p v-if="!data.orders.length" class="pt-muted">还没有兑换记录。</p>
      </section>

      <p class="pt-foot">奖品为学院文创，领取时请填写真实姓名与学号，工作人员核对后线下发放。</p>
    </template>

    <!-- 兑换弹窗 -->
    <div v-if="modal.open" class="pt-modal" @click.self="closeRedeem">
      <div class="pt-modal-box">
        <h3>兑换「{{ modal.prize && modal.prize.name }}」</h3>
        <p class="pt-modal-sub">消耗 <b>{{ modal.prize && modal.prize.points }}</b> 分 · 兑换后积分不退，若被驳回会自动退回</p>
        <label class="pt-f">姓名 <span>*</span></label>
        <input v-model="modal.name" class="pt-input" maxlength="20" placeholder="真实姓名，便于线下核对" />
        <label class="pt-f">学号 <span>*</span></label>
        <input v-model="modal.studentId" class="pt-input" maxlength="12" placeholder="8-12 位数字" />
        <label class="pt-f">联系方式（选填）</label>
        <input v-model="modal.contact" class="pt-input" maxlength="60" placeholder="手机号 / QQ，便于通知领取" />
        <label class="pt-f">备注（选填）</label>
        <input v-model="modal.note" class="pt-input" maxlength="120" placeholder="如尺码、颜色偏好" />
        <p v-if="modal.err" class="pt-err">{{ modal.err }}</p>
        <div class="pt-modal-actions">
          <ArBtn variant="ghost" size="md" @click="closeRedeem">取消</ArBtn>
          <ArBtn variant="primary" size="md" :loading="modal.submitting" @click="submitRedeem">确认兑换</ArBtn>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pt { max-width: 1000px; margin: 0 auto; }
.pt-gate { max-width: 520px; margin: 0 auto; }
.pt-gate-t { text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.pt-card {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 12px; padding: 18px 20px; margin-bottom: 14px;
}
.pt-h { margin: 0 0 12px; font-size: 0.98rem; color: var(--text-heading); font-family: var(--font-display); }
.pt-mine-main { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.pt-balance { display: flex; align-items: baseline; gap: 4px; }
.pt-balance em { font-style: normal; font-size: 2.6rem; font-weight: 700; color: var(--brand); line-height: 1; }
.pt-balance span { font-size: 0.85rem; color: var(--text-muted); }
.pt-mine-meta p { margin: 0 0 4px; font-size: 0.8rem; color: var(--text-muted); }
.pt-link { background: none; border: none; padding: 0; color: var(--brand); font-size: 0.8rem; cursor: pointer; text-decoration: underline; }
.pt-ledger { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 10px; }
.pt-ledger-row { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; font-size: 0.8rem; border-bottom: 1px solid #f6f3ec; }
.pt-ledger-why { flex: 1; color: var(--text-body); }
.pt-ledger-at { color: var(--text-muted); font-size: 0.72rem; }
.pt-ledger-delta { color: var(--color-success); font-weight: 600; min-width: 44px; text-align: right; }
.pt-ledger-delta.minus { color: var(--color-danger); }
.pt-rules { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.pt-rule {
  display: flex; align-items: baseline; gap: 8px;
  background: var(--brand-pale); border-radius: 8px; padding: 8px 10px;
}
.pt-rule-name { flex: 1; font-size: 0.8rem; color: var(--text-heading); }
.pt-rule-pts { color: var(--brand); font-weight: 600; font-size: 0.85rem; }
.pt-rule-cap { font-size: 0.7rem; color: var(--text-muted); }
.pt-note { margin: 10px 0 0; font-size: 0.72rem; color: var(--text-muted); }
.pt-muted { font-size: 0.8rem; color: var(--text-muted); margin: 0; }

.pt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.pt-prize { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
.pt-prize-img { aspect-ratio: 4 / 3; background: var(--brand-pale); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pt-prize-img img { width: 100%; height: 100%; object-fit: cover; }
.pt-prize-ph { font-size: 2rem; opacity: 0.6; }
.pt-prize-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.pt-prize-name { font-size: 0.86rem; color: var(--text-heading); }
.pt-prize-desc { margin: 0; font-size: 0.74rem; color: var(--text-muted); line-height: 1.6; }
.pt-prize-meta { display: flex; justify-content: space-between; align-items: baseline; margin-top: auto; }
.pt-prize-pts { color: var(--brand); font-weight: 700; font-size: 0.95rem; }
.pt-prize-stock { font-size: 0.7rem; color: var(--text-muted); }
.pt-prize-limit { margin: 0; font-size: 0.68rem; color: var(--text-muted); text-align: center; }

.pt-order { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f6f3ec; }
.pt-order:last-child { border-bottom: none; }
.pt-order-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pt-order-main b { font-size: 0.84rem; color: var(--text-heading); }
.pt-order-meta { font-size: 0.72rem; color: var(--text-muted); }
.pt-order-reason { font-size: 0.72rem; color: var(--color-danger); }
.pt-foot { text-align: center; font-size: 0.74rem; color: var(--text-muted); margin: 18px 0 0; }

.pt-modal { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; }
.pt-modal-box { background: var(--bg-card); border-radius: 14px; padding: 22px 24px; width: 100%; max-width: 420px; max-height: 86vh; overflow-y: auto; }
.pt-modal-box h3 { margin: 0 0 6px; font-size: 1rem; color: var(--text-heading); }
.pt-modal-sub { margin: 0 0 14px; font-size: 0.76rem; color: var(--text-muted); }
.pt-f { display: block; font-size: 0.76rem; color: var(--text-body); margin: 10px 0 4px; }
.pt-f span { color: var(--color-danger); }
.pt-input {
  width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--line);
  border-radius: 8px; font-family: inherit; font-size: 0.84rem; background: var(--vp-c-bg); color: var(--text-heading);
}
.pt-input:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.pt-err { margin: 10px 0 0; font-size: 0.76rem; color: var(--color-danger); }
.pt-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }

@media (max-width: 640px) {
  .pt-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .pt-balance em { font-size: 2.1rem; }
}
.dark .pt-card, .dark .pt-prize, .dark .pt-modal-box { background: #151b1a; border-color: #2c3331; }
.dark .pt-rule { background: #12312e; }
.dark .pt-ledger-row, .dark .pt-order { border-color: #222927; }
</style>
