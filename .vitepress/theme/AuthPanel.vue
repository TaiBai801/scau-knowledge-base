<script setup>
// 登录/注册/用户信息卡 — 独立组件，可嵌入任意页面（当前由 Checkin.vue 使用）
// 依赖：./userauth.js（状态管理）
// 事件：authed（登录/注册成功，参数 user）、logged-out（登出完成）
import { ref, computed } from 'vue'
import { userAuth, restoreUser, loginUser, registerUser, logoutUser } from './userauth.js'

const emit = defineEmits(['authed', 'logged-out'])

const mode = ref('login') // login | register
const username = ref('')
const password = ref('')
const password2 = ref('') // 注册模式：二次确认
const displayName = ref('')
const submitting = ref(false)
const formError = ref('')

const user = computed(() => userAuth.user)
const ready = computed(() => userAuth.ready)

// 两次输入是否一致（仅在注册模式且第二次输入过内容后才提示，避免一开始就报错）
const mismatch = computed(
  () => mode.value === 'register' && password2.value.length > 0 && password2.value !== password.value
)

// 静默恢复会话（若宿主页面未调过 restoreUser 也能自愈）
restoreUser()

async function submit() {
  if (submitting.value) return
  formError.value = ''
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) { formError.value = '请输入账号和密码'; return }
  if (mode.value === 'register') {
    if (p.length < 6) { formError.value = '密码至少 6 位'; return }
    if (password2.value !== p) { formError.value = '两次输入的密码不一致，请重新输入'; return }
  }
  submitting.value = true
  try {
    const user = mode.value === 'login'
      ? await loginUser(u, p)
      : await registerUser(u, p, displayName.value.trim())
    password.value = ''
    password2.value = ''
    emit('authed', user)
  } catch (e) {
    formError.value = e.message || '操作失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}

// 切换模式时清掉确认框与错误
function switchMode(m) {
  mode.value = m
  formError.value = ''
  password2.value = ''
}

function doLogout() {
  logoutUser()
  mode.value = 'login'
  formError.value = ''
  emit('logged-out')
}
</script>

<template>
  <div class="au-panel">
    <!-- 已登录：用户信息卡 -->
    <div v-if="user" class="au-user">
      <div class="au-avatar">{{ (user.displayName || user.username).slice(0, 1) }}</div>
      <div class="au-user-info">
        <div class="au-user-name">{{ user.displayName || user.username }}</div>
        <div class="au-user-sub">已登录 · 打卡数据将同步云端</div>
      </div>
      <button class="au-logout" @click="doLogout">退出登录</button>
    </div>

    <!-- 未登录：登录/注册表单 -->
    <div v-else class="au-form">
      <div class="au-tabs">
        <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
      </div>

      <div class="au-field">
        <input v-model.trim="username" type="text" :placeholder="mode === 'register' ? '用户名（2-16 位，可用中文）' : '用户名'" maxlength="16" @keyup.enter="submit">
      </div>
      <div v-if="mode === 'register'" class="au-field">
        <input v-model.trim="displayName" type="text" placeholder="昵称（选填，默认用用户名）" maxlength="24">
      </div>
      <div class="au-field">
        <input v-model="password" type="password" :placeholder="mode === 'register' ? '设置密码（至少 6 位）' : '密码'" maxlength="64" @keyup.enter="submit">
      </div>
      <div v-if="mode === 'register'" class="au-field">
        <input
          v-model="password2"
          type="password"
          placeholder="再输一遍密码"
          maxlength="64"
          :class="{ 'au-bad': mismatch }"
          @keyup.enter="submit"
        >
        <div v-if="mismatch" class="au-hint au-hint-bad">两次输入的密码不一致</div>
        <div v-else-if="password2.length > 0 && password2 === password" class="au-hint au-hint-ok">两次输入一致</div>
      </div>

      <div v-if="formError" class="au-error">{{ formError }}</div>

      <button class="au-submit" :disabled="submitting || !ready" @click="submit">
        {{ submitting ? '请稍候…' : (mode === 'login' ? '登录' : '注册并登录') }}
      </button>
      <div class="au-tip">密码经 scrypt 加盐哈希后存储，平台不保存明文。</div>
    </div>
  </div>
</template>

<style scoped>
.au-panel {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px 20px; box-shadow: var(--shadow-card);
}

/* 已登录 */
.au-user { display: flex; align-items: center; gap: 14px; }
.au-avatar {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
  background: var(--brand-pale); color: var(--brand);
  font-size: 1.1rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.au-user-info { flex: 1; min-width: 0; }
.au-user-name { font-size: 1rem; font-weight: 700; color: var(--text-heading); }
.au-user-sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
.au-logout {
  border: 1px solid var(--line); background: var(--bg-warm); color: var(--text-muted);
  border-radius: 8px; padding: 7px 14px; font-size: 0.83rem; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.au-logout:hover { border-color: #dc2626; color: #dc2626; }

/* 未登录表单 */
.au-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.au-tabs button {
  flex: 1; padding: 8px 0; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg-warm); color: var(--text-muted);
  font-size: 0.88rem; cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.au-tabs button.active {
  border-color: var(--brand); color: var(--brand); background: var(--brand-pale); font-weight: 600;
}
.au-field { margin-bottom: 10px; }
.au-field input {
  width: 100%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 0.92rem; font-family: inherit; background: var(--bg-warm); color: var(--text-heading);
  box-sizing: border-box;
}
.au-field input:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
.au-error {
  color: #dc2626; font-size: 0.83rem; margin-bottom: 10px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px;
}
/* 二次确认的即时反馈 */
.au-field input.au-bad { border-color: #dc2626; background: #fef2f2; }
.au-hint { font-size: 0.75rem; margin-top: 4px; }
.au-hint-bad { color: #dc2626; }
.au-hint-ok { color: #059669; }
.au-submit {
  width: 100%; background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 11px 0; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.au-submit:hover { background: var(--brand-light); }
.au-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.au-tip { font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 10px; }

@media (max-width: 600px) {
  .au-panel { padding: 14px 16px; }
}
</style>
