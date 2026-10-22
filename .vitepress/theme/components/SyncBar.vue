<script setup>
// 通用「同步到账号」工具条 —— 放在数据类页面上（专注 / 足迹 / 课表）
// 职责：未登录给引导，登录后给「上传 / 拉取」，显示云端时间戳与更新提示。
// 数据读写由宿主页面通过 getData / applyData 提供，本组件只管传输与状态。
import { computed, onMounted, ref } from 'vue'
import { userAuth, restoreUser } from '../userauth.js'
import ArBtn from './ArBtn.vue'

const props = defineProps({
  syncKey: { type: String, required: true }, // 云端 key，如 'focus' | 'footprint'
  title: { type: String, default: '本页数据' },
  getData: { type: Function, required: true }, // () => 要上传的本地数据（对象或数组）
  applyData: { type: Function, required: true }, // (cloudValue) => 合并/覆盖到本机
})
const emit = defineEmits(['applied'])

const API = '/api/user'
const user = computed(() => userAuth.user)
const syncing = ref(false)
const cloudFound = ref(false)
const cloudAt = ref(0)
const cloudNewer = ref(false)
const msg = ref('')
const msgKind = ref('') // 'ok' | 'err'

function token() {
  try {
    return localStorage.getItem('user_token_v1') || ''
  } catch (e) {
    return ''
  }
}

async function post(payload) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: token() }, payload)),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}

// 本地数据的新鲜度：没有内置时间戳，就用 localStorage 文件不可比——
// 这里取云端值里的最大 ts 作为参照即可，缺失时退化为「有就上/下」
function localNewest() {
  try {
    const v = props.getData()
    const arr = Array.isArray(v) ? v : (v && v.units) || (v && v.events) || []
    return arr.reduce((m, e) => Math.max(m, Number(e && e.ts) || 0), 0)
  } catch (e) {
    return 0
  }
}

async function check() {
  if (!user.value) return
  try {
    const d = await post({ action: 'dataGet', key: props.syncKey })
    cloudFound.value = !!d.found
    cloudAt.value = d.updatedAt || 0
    // 云端比本机新（云端里最新一条的 ts 大于本机最新）才提示
    const cArr = d.found && d.value ? (Array.isArray(d.value) ? d.value : d.value.units || []) : []
    const cloudNewest = cArr.reduce((m, e) => Math.max(m, Number(e && e.ts) || 0), 0)
    cloudNewer.value = !!d.found && cloudNewest > localNewest()
  } catch (e) {
    /* 静默，同步是可选项 */
  }
}

async function push() {
  if (!user.value) return
  syncing.value = true
  say('')
  try {
    const d = await post({ action: 'dataPut', key: props.syncKey, value: props.getData() })
    cloudFound.value = true
    cloudAt.value = d.updatedAt || Date.now()
    cloudNewer.value = false
    say('已上传到云端 ✓', 'ok')
  } catch (e) {
    say('上传失败：' + (e.message || '未知错误'), 'err')
  } finally {
    syncing.value = false
  }
}

async function pull() {
  if (!user.value) return
  syncing.value = true
  say('')
  try {
    const d = await post({ action: 'dataGet', key: props.syncKey })
    if (!d.found) {
      say('云端还没有这份数据，先用「上传到云端」', 'err')
      return
    }
    props.applyData(d.value)
    cloudAt.value = d.updatedAt || 0
    cloudNewer.value = false
    say('已从云端拉取并合并 ✓', 'ok')
    emit('applied')
  } catch (e) {
    say('拉取失败：' + (e.message || '未知错误'), 'err')
  } finally {
    syncing.value = false
  }
}

function say(text, kind) {
  msg.value = text
  msgKind.value = kind || ''
}

function fmtAt(ts) {
  if (!ts) return '从未'
  const d = new Date(ts)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

restoreUser()
onMounted(check)
</script>

<template>
  <div class="sync-bar">
    <div v-if="!user" class="sync-hint">
      <span class="sync-hint-text">
        <b>登录后同步到云端</b>
        <span>{{ title }}默认只保存在这台设备的浏览器里；登录后可一键同步到云端，换设备不丢。</span>
      </span>
      <a class="sync-go" href="/checkin">去注册 / 登录</a>
    </div>

    <div v-else class="sync-row">
      <span class="sync-user">
        👤 {{ user.displayName || user.username }} · 云端{{ title }}：{{ fmtAt(cloudAt) }}
        <em v-if="cloudNewer" class="sync-newer">云端有较新版本</em>
      </span>
      <span class="sync-btns">
        <ArBtn v-if="cloudFound" variant="ghost" size="sm" :disabled="syncing" @click="pull">
          拉取云端
        </ArBtn>
        <ArBtn variant="primary" size="sm" :loading="syncing" @click="push">
          {{ syncing ? '同步中…' : '上传到云端' }}
        </ArBtn>
      </span>
    </div>

    <p v-if="msg" :class="['sync-msg', msgKind]">{{ msg }}</p>
  </div>
</template>

<style scoped>
.sync-bar {
  background: var(--bg-card, #fff);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
}
.sync-hint { display: flex; align-items: center; gap: 0.7rem; }
.sync-hint-text { flex: 1; min-width: 0; }
.sync-hint-text b { display: block; font-size: 0.82rem; color: var(--text-heading); }
.sync-hint-text span { font-size: 0.74rem; color: var(--text-muted); line-height: 1.6; }
.sync-go {
  flex-shrink: 0; border: 1px solid var(--brand); background: var(--brand); color: #fff;
  border-radius: 7px; padding: 0.3rem 0.7rem; font-size: 0.78rem; text-decoration: none;
}
.sync-go:hover { opacity: 0.9; }
.sync-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-size: 0.78rem; color: var(--text-body); }
.sync-user { flex: 1; min-width: 0; }
.sync-newer {
  font-style: normal; font-size: 0.68rem; color: var(--color-warning); background: var(--color-warning-pale);
  border-radius: 4px; padding: 0.05rem 0.35rem; margin-left: 0.3rem;
}
.sync-btns { display: flex; gap: 0.35rem; }
.sync-msg { margin: 0.4rem 0 0; font-size: 0.72rem; }
.sync-msg.ok { color: #047857; }
.sync-msg.err { color: var(--color-danger); }
</style>
