<script setup>
// 统一徽标基础件 —— 状态/标签的唯一入口（P1 组件层）
// tone 直接映射语义状态色令牌；不再手写「背景浅+文字深」的徽标样式
defineProps({
  tone: { type: String, default: 'neutral' },
  // brand | success | danger | warning | info | neutral
  pill: { type: Boolean, default: true },
})
</script>

<template>
  <span class="ar-badge" :class="[`ar-badge--${tone}`, { 'ar-badge--pill': pill }]">
    <slot />
  </span>
</template>

<style scoped>
.ar-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  font-size: 0.72rem;
  line-height: 1;
  font-family: var(--font-body);
  white-space: nowrap;
}
.ar-badge--pill { border-radius: 999px; }

.ar-badge--brand { background: var(--brand-pale); color: var(--brand); }
.ar-badge--success { background: var(--color-success-pale); color: var(--color-success); }
.ar-badge--danger { background: var(--color-danger-pale); color: var(--color-danger); }
.ar-badge--warning { background: var(--color-warning-pale); color: var(--color-warning); }
.ar-badge--info { background: var(--color-info-pale); color: var(--color-info); }
.ar-badge--neutral { background: #f1f5f9; color: var(--text-muted); }

.dark .ar-badge--brand { background: #12312e; color: #7fc9be; }
.dark .ar-badge--success { background: #0f2e22; color: #34d399; }
.dark .ar-badge--danger { background: #3b1515; color: #f87171; }
.dark .ar-badge--warning { background: #3a2a08; color: #fbbf24; }
.dark .ar-badge--info { background: #16233a; color: #7fa8e8; }
.dark .ar-badge--neutral { background: #1f2937; color: var(--text-muted); }
</style>
