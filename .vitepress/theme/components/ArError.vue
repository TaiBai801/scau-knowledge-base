<script setup>
// 统一错误状态模板（P2 模板层）——标题 + 原因 + 重试操作
defineProps({
  title: { type: String, default: '没能加载出来' },
  desc: { type: String, default: '' },
})
</script>

<template>
  <div class="ar-error" role="alert">
    <div class="ar-error-icon" aria-hidden="true">⚠️</div>
    <p class="ar-error-title">{{ title }}</p>
    <p v-if="desc" class="ar-error-desc">{{ desc }}</p>
    <div class="ar-error-action">
      <slot name="retry" />
    </div>
  </div>
</template>

<style scoped>
.ar-error {
  text-align: center;
  padding: 2rem 1.2rem;
  background: var(--color-danger-pale, #fef2f2);
  border: 1px solid color-mix(in srgb, var(--color-danger, #dc2626) 30%, transparent);
  border-radius: var(--radius-card, 12px);
}
.ar-error-icon { font-size: 1.6rem; line-height: 1; }
.ar-error-title { margin: 0.5rem 0 0.25rem; font-size: 0.9rem; font-weight: 500; color: var(--color-danger, #dc2626); }
.ar-error-desc { margin: 0; font-size: 0.78rem; color: var(--text-body); line-height: 1.7; }
.ar-error-action { margin-top: 0.8rem; display: flex; justify-content: center; }

.dark .ar-error { background: #3b1515; border-color: #6b2222; }
.dark .ar-error-title { color: #f87171; }
.dark .ar-error-desc { color: #c7d2ce; }
</style>
