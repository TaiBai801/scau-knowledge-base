<script setup>
// 统一卡片基础件（P1 组件层）
// 圆角/边框/阴影/内距统一，hoverable 提供悬浮抬升
defineProps({
  pad: { type: String, default: 'md' }, // sm | md | lg
  hoverable: Boolean,
})
</script>

<template>
  <div class="ar-card" :class="[`ar-card--${pad}`, { 'ar-card--hover': hoverable }]">
    <slot />
  </div>
</template>

<style scoped>
.ar-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--line);
  border-radius: var(--radius-card, 12px);
  box-shadow: var(--shadow-card);
  transition:
    box-shadow var(--transition-normal),
    transform var(--transition-normal);
}
.ar-card--sm { padding: 12px 14px; }
.ar-card--md { padding: 18px 20px; }
.ar-card--lg { padding: 24px 28px; }
.ar-card--hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-hero);
}

.dark .ar-card { background: #151b1a; border-color: #2c3331; }
</style>
