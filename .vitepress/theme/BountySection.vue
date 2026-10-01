<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const content = ref('')
const name = ref('')
const items = ref([])
const submitting = ref(false)
const pause = ref(false)

const wall = ref(null)
let timer = null

function fp() {
  let f = ''
  try { f = localStorage.getItem('bounty_fp') || '' } catch (e) {}
  if (!f) {
    f = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    try { localStorage.setItem('bounty_fp', f) } catch (e) {}
  }
  return f
}

async function load() {
  try {
    const r = await fetch('/api/bounty?fp=' + encodeURIComponent(fp()))
    const d = await r.json()
    if (d.items) items.value = d.items
  } catch (e) {}
}

async function submit() {
  if (!content.value.trim()) { alert('请先输入想要的资料'); return }
  submitting.value = true
  try {
    const r = await fetch('/api/bounty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', content: content.value, by: name.value })
    })
    const d = await r.json()
    if (d.error) { alert(d.message || d.error) }
    else { alert(d.message || '已提交，等待审核通过后上墙'); content.value = ''; name.value = '' }
  } catch (e) { alert('提交失败，请稍后重试') }
  submitting.value = false
}

async function like(item) {
  try {
    const r = await fetch('/api/bounty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'like', id: item.id, fp: fp() })
    })
    const d = await r.json()
    if (d.ok) { item.likes = d.likes; item.liked = d.liked }
  } catch (e) {}
}

function startScroll() {
  timer = setInterval(() => {
    const el = wall.value
    if (!el || pause.value) return
    if (el.scrollHeight <= el.clientHeight) return
    el.scrollTop += 1
    if (el.scrollTop >= el.scrollHeight - el.clientHeight) el.scrollTop = 0
  }, 50)
}

onMounted(() => {
  load()
  startScroll()
  // 每 20 秒静默刷新一次，同步新审核通过的悬赏
  setInterval(load, 20000)
})

onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="bounty">
    <div class="bounty-head">
      <h2 class="bounty-title">📮 资料悬赏</h2>
      <p class="bounty-desc">缺哪份资料？发出来大家一起找。管理员审核通过后上墙，觉得也想要就点个赞。</p>
    </div>

    <form class="bounty-form" @submit.prevent="submit">
      <input
        v-model="content"
        type="text"
        maxlength="200"
        placeholder="例如：想要《信号与系统》的期末复习资料"
        class="bounty-input"
      />
      <input
        v-model="name"
        type="text"
        maxlength="20"
        placeholder="昵称（可选）"
        class="bounty-name"
      />
      <button type="submit" class="bounty-btn" :disabled="submitting">
        {{ submitting ? '提交中…' : '发布悬赏' }}
      </button>
    </form>

    <div class="bounty-wall" ref="wall" @mouseenter="pause = true" @mouseleave="pause = false">
      <div class="bounty-item" v-for="r in items" :key="r.id">
        <div class="bi-top">
          <span class="bi-content">{{ r.content }}</span>
          <span class="bi-badge" :class="{ done: r.completed }">{{ r.completed ? '✅ 已完成' : '⏳ 待补充' }}</span>
        </div>
        <div class="bi-bottom">
          <span class="bi-by">{{ r.by }}</span>
          <button class="bi-like" :class="{ liked: r.liked }" @click="like(r)">
            👍 <span>{{ r.likes }}</span>
          </button>
        </div>
      </div>
      <div v-if="!items.length" class="bounty-empty">暂无悬赏，来做第一个许愿的人吧～</div>
    </div>
  </div>
</template>

<style scoped>
.bounty {
  max-width: 1152px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 1rem;
}
.bounty-head { text-align: center; margin-bottom: 1.4rem; }
.bounty-title { font-size: 1.4rem; font-weight: 700; color: #0D5C5A; }
.bounty-desc { font-size: 0.88rem; color: #94a3b8; margin-top: 0.4rem; }
.bounty-form {
  display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center;
  max-width: 720px; margin: 0 auto 1.4rem;
}
.bounty-input, .bounty-name {
  padding: 0.65rem 0.9rem; border: 1px solid #E8E4DB; border-radius: 10px;
  font-size: 0.9rem; background: #fff; color: #4A5568; outline: none;
}
.bounty-input { flex: 1 1 300px; min-width: 0; }
.bounty-name { flex: 0 0 130px; }
.bounty-input:focus, .bounty-name:focus { border-color: #0D5C5A; }
.bounty-btn {
  padding: 0.65rem 1.4rem; border: none; border-radius: 10px; font-size: 0.9rem;
  background: #0D5C5A; color: #fff; cursor: pointer; font-weight: 600; transition: opacity .15s;
}
.bounty-btn:hover { opacity: .9; }
.bounty-btn:disabled { opacity: .5; cursor: not-allowed; }
.bounty-wall {
  max-height: 320px; overflow-y: auto;
  border: 1px solid #E8E4DB; border-radius: 14px; background: #fff;
  padding: 0.4rem 0.6rem; scroll-behavior: smooth;
}
.bounty-item {
  padding: 0.7rem 0.8rem; border-bottom: 1px solid #f0ede6;
}
.bounty-item:last-child { border-bottom: none; }
.bi-top { display: flex; align-items: flex-start; gap: 0.6rem; }
.bi-content { flex: 1; min-width: 0; font-size: 0.92rem; color: #4A5568; word-break: break-word; }
.bi-badge {
  flex-shrink: 0; font-size: 0.72rem; padding: 0.12rem 0.5rem; border-radius: 999px;
  background: #fef3e2; color: #D97706; white-space: nowrap;
}
.bi-badge.done { background: #e6f7ef; color: #059669; }
.bi-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 0.35rem; }
.bi-by { font-size: 0.75rem; color: #94a3b8; }
.bi-like {
  display: inline-flex; align-items: center; gap: 0.25rem;
  border: 1px solid #E8E4DB; background: #fff; color: #64748b;
  font-size: 0.8rem; padding: 0.15rem 0.7rem; border-radius: 999px; cursor: pointer;
  transition: all .15s;
}
.bi-like:hover { border-color: #0D5C5A; color: #0D5C5A; }
.bi-like.liked { background: #e6f7ef; border-color: #0D5C5A; color: #0D5C5A; }
.bounty-empty { text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 2rem 0; }

@media (max-width: 640px) {
  .bounty-name { flex: 1 1 100%; }
  .bounty-input { flex: 1 1 100%; }
}
</style>
