<script setup>
// 统一空状态模板（P2 模板层）——图标 + 标题 + 描述（默认插槽，可放链接）+ 操作区
defineProps({
  icon: { type: String, default: '📭' },
  title: { type: String, default: '这里还是空的' },
})
</script>

<template>
  <div class="ar-empty" role="status">
    <div class="ar-empty-icon" aria-hidden="true">{{ icon }}</div>
    <p class="ar-empty-title">{{ title }}</p>
    <div class="ar-empty-desc"><slot /></div>
    <div v-if="$slots.action" class="ar-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.ar-empty {
  text-align: center;
  padding: 2.2rem 1.2rem;
  background: var(--bg-card, #fff);
  border: 1px dashed var(--line);
  border-radius: var(--radius-card, 12px);
}
.ar-empty-icon { font-size: 1.8rem; line-height: 1; }
.ar-empty-title { margin: 0.6rem 0 0.3rem; font-size: 0.92rem; font-weight: 500; color: var(--text-heading); }
.ar-empty-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.8; }
.ar-empty-desc :deep(a) { color: var(--brand); }
.ar-empty-action { margin-top: 0.9rem; display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; }

.dark .ar-empty { background: #151b1a; border-color: #2c3331; }
.dark .ar-empty-title { color: #e6efec; }
.dark .ar-empty-desc { color: #8fa6a0; }
.dark .ar-empty-desc :deep(a) { color: #7fc9be; }
</style>
