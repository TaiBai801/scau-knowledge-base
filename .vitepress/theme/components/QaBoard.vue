<script setup>
// 答疑坊 · 学生端
// 流程：提问 → 工作人员审核公布 → 志愿者接单 → 线上答疑 → 提问者采纳 → 双方积分
import { computed, onMounted, reactive, ref } from 'vue'
import { userAuth, restoreUser } from '../userauth.js'
import AuthPanel from '../AuthPanel.vue'
import ArBtn from './ArBtn.vue'
import ArBadge from './ArBadge.vue'
import ArLoading from './ArLoading.vue'
import ArError from './ArError.vue'

const API = '/api/qa'
const loggedIn = computed(() => !!userAuth.user)
const STATUS = { pending: ['待审核', 'warning'], open: ['待接单', 'info'], claimed: ['答疑中', 'warning'], answered: ['待采纳', 'brand'], closed: ['已结束', 'success'], rejected: ['未通过', 'danger'] }

function token() { try { return localStorage.getItem('user_token_v1') || '' } catch (e) { return '' } }
async function post(p) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ token: token() }, p)) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}

const loading = ref(true)
const loadError = ref('')
const data = reactive({ open: [], inbox: [], mine: [], claims: [] })
const tab = ref('open')
const ask = reactive({ open: false, title: '', course: '', detail: '', err: '', submitting: false })
const answerBox = reactive({ open: false, q: null, text: '', err: '', submitting: false })
const msg = ref('')

async function load() {
  loading.value = true; loadError.value = ''
  try {
    const d = await post({ action: 'list' })
    data.open = d.open || []
    data.inbox = d.inbox || []
    data.mine = d.mine || []
    data.claims = d.claims || []
  } catch (e) { loadError.value = e.message || '加载失败' } finally { loading.value = false }
}

async function submitAsk() {
  ask.err = ''
  if (ask.title.trim().length < 4) { ask.err = '标题至少 4 个字'; return }
  if (ask.detail.trim().length < 10) { ask.err = '请把问题描述清楚（至少 10 字）'; return }
  ask.submitting = true
  try {
    await post({ action: 'submit', title: ask.title.trim(), course: ask.course.trim(), detail: ask.detail.trim() })
    ask.open = false; ask.title = ''; ask.course = ''; ask.detail = ''
    msg.value = '已提交，等待工作人员审核公布'
    await load()
  } catch (e) { ask.err = e.message } finally { ask.submitting = false }
}

async function claim(q) {
  try { await post({ action: 'claim', id: q.id }); msg.value = '接单成功，请尽快答疑'; await load() }
  catch (e) { msg.value = e.message }
}

function openAnswer(q) { answerBox.open = true; answerBox.q = q; answerBox.text = ''; answerBox.err = '' }
async function submitAnswer() {
  answerBox.err = ''
  if (answerBox.text.trim().length < 10) { answerBox.err = '答疑内容至少 10 字'; return }
  answerBox.submitting = true
  try {
    await post({ action: 'answer', id: answerBox.q.id, answer: answerBox.text.trim() })
    answerBox.open = false
    msg.value = '答疑已提交，等待提问者采纳'
    await load()
  } catch (e) { answerBox.err = e.message } finally { answerBox.submitting = false }
}

async function accept(q) {
  if (!confirm('确认采纳这条答疑？采纳后双方获得积分。')) return
  try {
    const d = await post({ action: 'accept', id: q.id })
    msg.value = '已采纳' + (d.askerAward && d.askerAward.ok ? '，你 +' + d.askerAward.points + ' 积分' : '')
    await load()
  } catch (e) { msg.value = e.message }
}

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '')
const myName = computed(() => (userAuth.user && userAuth.user.username) || '')
const list = computed(() => ({ open: data.open, inbox: data.inbox, mine: data.mine, claims: data.claims }[tab.value] || []))

onMounted(async () => { await restoreUser(); if (loggedIn.value) await load(); else loading.value = false })
</script>

<template>
  <div class="qa">
    <div v-if="!loggedIn" class="qa-gate">
      <p class="qa-gate-t">提问、接单与积分都绑定学生账号，请先登录。</p>
      <AuthPanel @authed="load" />
    </div>

    <ArLoading v-else-if="loading" text="正在加载答疑坊…" />
    <ArError v-else-if="loadError" title="答疑坊没能加载出来" :desc="loadError">
      <template #retry><ArBtn variant="ghost" size="sm" @click="load">重新加载</ArBtn></template>
    </ArError>

    <template v-else>
      <section class="qa-card">
        <div class="qa-head">
          <h2>答疑坊</h2>
          <ArBtn variant="primary" size="sm" @click="ask.open = !ask.open">{{ ask.open ? '收起' : '＋ 我要提问' }}</ArBtn>
        </div>
        <p class="qa-rule">提问经工作人员审核后公布；志愿者按自身情况接单答疑，提问者采纳后<b>双方均得积分（志愿者更多）</b>。</p>

        <div v-if="ask.open" class="qa-form">
          <label class="qa-f">问题标题（一句话说清）</label>
          <input v-model="ask.title" class="qa-input" maxlength="60" placeholder="如：信号与系统 拉普拉斯变换初值定理为什么不能直接用" />
          <label class="qa-f">所属课程（可选）</label>
          <input v-model="ask.course" class="qa-input" maxlength="40" placeholder="如：信号与系统" />
          <label class="qa-f">问题描述（题目原文、你已经想到哪一步、卡在哪里）</label>
          <textarea v-model="ask.detail" class="qa-input" rows="4" maxlength="1500"></textarea>
          <p v-if="ask.err" class="qa-err">{{ ask.err }}</p>
          <div class="qa-actions">
            <ArBtn variant="primary" size="md" :loading="ask.submitting" @click="submitAsk">提交审核</ArBtn>
          </div>
        </div>
      </section>

      <section class="qa-card">
        <div class="qa-tabs">
          <button v-for="t in [['open','待接单'],['inbox','进行中 / 已答'],['mine','我的提问'],['claims','我的接单']]" :key="t[0]"
                  class="qa-tab" :class="{ on: tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button>
        </div>
        <p v-if="msg" class="qa-msg">{{ msg }}</p>

        <div v-for="q in list" :key="q.id" class="qa-q">
          <div class="qa-q-head">
            <b>{{ q.title }}</b>
            <ArBadge :tone="STATUS[q.status] ? STATUS[q.status][1] : 'neutral'">{{ STATUS[q.status] ? STATUS[q.status][0] : q.status }}</ArBadge>
          </div>
          <p class="qa-q-meta">
            <span v-if="q.course">{{ q.course }} · </span>{{ fmt(q.createdAt) }}
            <span v-if="q.claimBy"> · 接单人 {{ q.claimBy }}</span>
          </p>
          <p v-if="q.answer" class="qa-q-answer">答疑：{{ q.answer }}</p>
          <div class="qa-q-actions">
            <ArBtn v-if="q.status === 'open' && q.userName !== myName" variant="primary" size="sm" @click="claim(q)">接单答疑</ArBtn>
            <ArBtn v-if="q.status === 'claimed' && q.claimBy === myName" variant="primary" size="sm" @click="openAnswer(q)">提交答疑</ArBtn>
            <ArBtn v-if="q.status === 'answered' && q.userName === myName" variant="primary" size="sm" @click="accept(q)">采纳这条答疑</ArBtn>
          </div>
        </div>
        <p v-if="!list.length" class="qa-muted">这里还没有内容。</p>
      </section>

      <p class="qa-foot">答疑记录会留痕统计；自习室志愿者值班为下一阶段计划。</p>

      <div v-if="answerBox.open" class="qa-modal" @click.self="answerBox.open = false">
        <div class="qa-modal-box">
          <h3>提交答疑</h3>
          <p class="qa-q-meta">{{ answerBox.q && answerBox.q.title }}</p>
          <textarea v-model="answerBox.text" class="qa-input" rows="6" maxlength="3000" placeholder="写清思路与关键步骤，能看懂比写得多更重要"></textarea>
          <p v-if="answerBox.err" class="qa-err">{{ answerBox.err }}</p>
          <div class="qa-actions">
            <ArBtn variant="ghost" size="md" @click="answerBox.open = false">取消</ArBtn>
            <ArBtn variant="primary" size="md" :loading="answerBox.submitting" @click="submitAnswer">提交</ArBtn>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.qa { max-width: 900px; margin: 0 auto; }
.qa-gate { max-width: 520px; margin: 0 auto; }
.qa-gate-t { text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.qa-card { background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.qa-head { display: flex; justify-content: space-between; align-items: center; }
.qa-head h2 { margin: 0; font-size: 0.98rem; color: var(--text-heading); font-family: var(--font-display); }
.qa-rule { font-size: 0.78rem; color: var(--text-muted); margin: 8px 0 0; line-height: 1.7; }
.qa-form { margin-top: 12px; border-top: 1px dashed var(--line); padding-top: 8px; }
.qa-f { display: block; font-size: 0.76rem; color: var(--text-body); margin: 10px 0 4px; }
.qa-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 0.84rem; background: var(--vp-c-bg); color: var(--text-heading); resize: vertical; }
.qa-err { color: var(--color-danger); font-size: 0.78rem; margin: 8px 0 0; }
.qa-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.qa-tabs { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.qa-tab { padding: 5px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg-card); font-size: 0.8rem; cursor: pointer; color: var(--text-muted); font-family: inherit; }
.qa-tab.on { border-color: var(--brand); color: var(--brand); background: var(--brand-pale); font-weight: 500; }
.qa-msg { font-size: 0.78rem; color: var(--brand); margin: 0 0 8px; }
.qa-q { border-bottom: 1px solid #f6f3ec; padding: 10px 0; }
.qa-q-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.qa-q-head b { font-size: 0.86rem; color: var(--text-heading); }
.qa-q-meta { font-size: 0.72rem; color: var(--text-muted); margin: 4px 0 0; }
.qa-q-answer { font-size: 0.8rem; color: var(--text-body); background: var(--brand-pale); border-radius: 8px; padding: 8px 10px; margin: 8px 0 0; line-height: 1.7; white-space: pre-wrap; }
.qa-q-actions { margin-top: 8px; display: flex; gap: 8px; }
.qa-muted { font-size: 0.8rem; color: var(--text-muted); margin: 8px 0 0; }
.qa-foot { text-align: center; font-size: 0.74rem; color: var(--text-muted); margin: 16px 0 0; }
.qa-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; }
.qa-modal-box { background: var(--bg-card); border-radius: 14px; padding: 20px 22px; width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto; }
.qa-modal-box h3 { margin: 0 0 6px; font-size: 0.95rem; color: var(--text-heading); }
.dark .qa-card, .dark .qa-modal-box { background: #151b1a; border-color: #2c3331; }
.dark .qa-input { background: #0f1514; border-color: #2c3331; }
.dark .qa-q-answer { background: #12312e; }
</style>
