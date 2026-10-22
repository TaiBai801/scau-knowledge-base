<script setup>
// 统一按钮基础件 —— 全站按钮的唯一入口（P1 组件层）
// 变体、尺寸、交互状态（hover/focus/active/disabled/loading）只在这里定义，
// 业务组件不再手写按钮样式。颜色一律走令牌，深色模式自动跟随。
defineOptions({ inheritAttrs: false })

const props = defineProps({
  variant: { type: String, default: 'primary' },
  // primary | ghost | danger | success | warning | neutral
  size: { type: String, default: 'md' }, // sm | md
  disabled: Boolean,
  loading: Boolean,
  type: { type: String, default: 'button' },
})
const emit = defineEmits(['click'])

function onClick(e) {
  if (props.disabled || props.loading) return
  emit('click', e)
}
</script>

<template>
  <button
    :type="type"
    class="ar-btn"
    :class="[`ar-btn--${variant}`, `ar-btn--${size}`, { 'is-loading': loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    v-bind="$attrs"
    @click="onClick"
  >
    <span v-if="loading" class="ar-btn__spin" aria-hidden="true"></span>
    <span class="ar-btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.ar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    transform 0.05s ease;
}
.ar-btn--md { height: 34px; padding: 0 16px; font-size: var(--text-sm, 0.85rem); }
.ar-btn--sm { height: 26px; padding: 0 10px; font-size: 0.76rem; border-radius: 7px; }

.ar-btn--primary { background: var(--brand); color: #fff; }
.ar-btn--primary:hover:not(:disabled) { background: var(--brand-light); }

.ar-btn--ghost { background: transparent; border-color: var(--line); color: var(--text-body); }
.ar-btn--ghost:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }

.ar-btn--danger { background: var(--color-danger); color: #fff; }
.ar-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-danger) 85%, #000);
}

.ar-btn--success { background: var(--color-success); color: #fff; }
.ar-btn--success:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-success) 85%, #000);
}

.ar-btn--warning { background: var(--color-warning); color: #fff; }
.ar-btn--warning:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-warning) 85%, #000);
}

.ar-btn--neutral { background: var(--vp-c-bg-soft); border-color: var(--line); color: var(--text-body); }
.ar-btn--neutral:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }

.ar-btn:active:not(:disabled) { transform: translateY(1px); }
.ar-btn:focus-visible { outline: 2px solid var(--brand-light); outline-offset: 2px; }
.ar-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ar-btn__spin {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: ar-rot 0.7s linear infinite;
}
@keyframes ar-rot { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ar-btn__spin { animation: none; } }

/* 深色模式 */
.dark .ar-btn--ghost { color: #c7d2ce; }
.dark .ar-btn--ghost:hover:not(:disabled) { border-color: var(--brand-light); color: var(--brand-light); }
.dark .ar-btn--neutral { background: #1f2a28; border-color: #2c3331; color: #c7d2ce; }
</style>
