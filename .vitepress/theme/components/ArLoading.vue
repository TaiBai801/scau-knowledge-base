<script setup>
// 统一加载状态模板（P2 模板层）
defineProps({
  text: { type: String, default: '加载中…' },
})
</script>

<template>
  <p class="ar-loading" role="status" aria-live="polite">
    <span class="ar-loading-spin" aria-hidden="true"></span>
    {{ text }}
  </p>
</template>

<style scoped>
.ar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2.2rem 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.ar-loading-spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--brand);
  border-top-color: transparent;
  animation: ar-loading-rot 0.7s linear infinite;
}
@keyframes ar-loading-rot { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ar-loading-spin { animation: none; } }
</style>
