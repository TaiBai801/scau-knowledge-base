<script setup>
// 行内指标：用于正文里会随后台变化而更新的数字（资料数、题库数等）
// 与 [[m:key]] 令牌的分工见 .vitepress/markdown/metrics-token.mjs
import { computed, onMounted } from 'vue'
import { useSiteMetrics } from '../composables/useSiteMetrics'

const props = defineProps({
  k: { type: String, required: true },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  format: { type: String, default: '' },
})

const { getMetricText } = useSiteMetrics()
const text = computed(() => props.prefix + getMetricText(props.k, props.format) + props.suffix)

onMounted(() => {
  // 与其他组件共享同一次请求（模块级单例 + TTL），这里只做触发
  useSiteMetrics().refresh()
})
</script>

<template>
  <span class="ardot-inline-metric">{{ text }}</span>
</template>

<style scoped>
.ardot-inline-metric {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-heading);
}
</style>
