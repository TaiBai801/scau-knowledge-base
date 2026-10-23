<script setup>
// 手机端底部导航栏（仅 ≤639px 显示，桌面/平板自动隐藏）
// 四个主入口：首页 / 课程 / 工具(全站导航) / 我的
// 激活态按当前页面 filePath 前缀匹配，随 VitePress 路由响应
import { computed } from 'vue'
import { useData } from 'vitepress'

const { page } = useData()

const TOOL_PAGES = [
  'nav.md', 'quiz.md', 'cards.md', 'plan.md', 'checkin.md', 'focus.md',
  'footprint.md', 'weekly.md', 'wrong.md', 'sprint.md', 'notes.md',
  'search.md', 'gap.md', 'stories.md',
]

const tabs = [
  { icon: '🏠', label: '首页', href: '/', match: (p) => p === 'index.md' || p === '' },
  { icon: '📚', label: '课程', href: '/majors/dianzikexue/', match: (p) => p.startsWith('majors/') || p === 'map.md' },
  { icon: '🧭', label: '工具', href: '/nav', match: (p) => TOOL_PAGES.includes(p) },
  { icon: '👤', label: '我的', href: '/my', match: (p) => p === 'my.md' },
]

const filePath = computed(() => (page.value && page.value.filePath) || '')
const active = computed(() => tabs.findIndex((t) => t.match(filePath.value)))
</script>

<template>
  <nav class="mtab" aria-label="底部主导航">
    <a
      v-for="(t, i) in tabs"
      :key="t.href"
      :href="t.href"
      class="mtab-item"
      :class="{ on: i === active }"
      :aria-current="i === active ? 'page' : undefined"
    >
      <span class="mtab-ic" aria-hidden="true">{{ t.icon }}</span>
      <span class="mtab-tx">{{ t.label }}</span>
    </a>
  </nav>
</template>

<style scoped>
.mtab {
  display: none;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: var(--bg-card, #fff);
  border-top: 1px solid var(--line);
  box-shadow: 0 -2px 12px rgba(13, 92, 90, 0.08);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
@media (max-width: 639px) {
  .mtab { display: flex; }
}
.mtab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 52px;
  padding: 6px 0 5px;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 0.66rem;
  font-family: var(--font-body);
  -webkit-tap-highlight-color: transparent;
}
.mtab-item:active { opacity: 0.7; }
.mtab-ic { font-size: 1.15rem; line-height: 1; }
.mtab-item.on { color: var(--brand); font-weight: 500; }

.dark .mtab { background: #151b1a; border-top-color: #2c3331; }
.dark .mtab-item { color: #8fa6a0; }
.dark .mtab-item.on { color: #7fc9be; }
</style>
