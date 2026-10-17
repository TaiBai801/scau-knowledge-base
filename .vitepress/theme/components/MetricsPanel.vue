<script setup>
// 「关于本站」规模面板
// 静态指标走快照（构建期即准），live 指标在挂载后由 /api/overview 补齐
import { computed, onMounted } from 'vue'
import { useSiteMetrics } from '../composables/useSiteMetrics'

const props = defineProps({
  // compact: 只显示核心 6 项
  compact: { type: Boolean, default: false },
})

const { getMetricText, refresh, status, generatedAt } = useSiteMetrics()

const allItems = computed(() => [
  { num: getMetricText('courses.planEntries', 'plus'), label: '收录课程', note: '四专业培养方案' },
  { num: getMetricText('site.majors'), label: '覆盖专业', note: '含机器人工程' },
  { num: getMetricText('site.semesterPages'), label: '学期页面', note: '十一届培养方案' },
  { num: getMetricText('courses.sharedPages'), label: '共享课程', note: '跨专业复用' },
  { num: getMetricText('content.syllabus.points', 'comma'), label: '知识点', note: '来自章节大纲' },
  { num: getMetricText('content.bank.questions'), label: '题库题目', note: '可在线作答', live: true },
  { num: getMetricText('content.materials.items'), label: '资料条目', note: '可在线预览', live: true },
  { num: getMetricText('content.contributors.contributions'), label: '贡献次数', note: '来自共建者', live: true },
])

const items = computed(() => (props.compact ? allItems.value.slice(0, 6) : allItems.value))

onMounted(() => refresh())
</script>

<template>
  <div class="ardot-metrics-panel">
    <div v-for="it in items" :key="it.label" class="ardot-metric-item">
      <div class="ardot-metric-num">{{ it.num }}</div>
      <div class="ardot-metric-label">{{ it.label }}</div>
      <div class="ardot-metric-note">{{ it.note }}</div>
    </div>
    <p class="ardot-metrics-foot">
      数据生成于 {{ (generatedAt || '').slice(0, 10) }}
      <span v-if="status === 'live'">· 部分指标已同步后台实时数据</span>
    </p>
  </div>
</template>

<style scoped>
.ardot-metrics-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
  margin: 20px 0;
}
.ardot-metric-item {
  background: var(--vp-c-bg-soft, #fff);
  border: 1px solid var(--line, #e6e2d8);
  border-radius: 12px;
  padding: 16px 18px;
}
.ardot-metric-num {
  font-family: var(--font-display, serif);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--brand, #0d5c5a);
  font-variant-numeric: tabular-nums;
}
.ardot-metric-label {
  margin-top: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-heading, #1a1a1a);
}
.ardot-metric-note {
  margin-top: 2px;
  font-size: 0.76rem;
  color: var(--text-muted, #777);
}
.ardot-metrics-foot {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--text-muted, #777);
}
@media (max-width: 640px) {
  .ardot-metrics-panel {
    grid-template-columns: repeat(2, 1fr);
  }
  .ardot-metric-num {
    font-size: 1.35rem;
  }
}
</style>
