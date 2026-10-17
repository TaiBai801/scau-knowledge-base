<script setup>
// 首页 hero 统计卡 —— 数字全部来自构建期快照，SSR 直出，禁用 JS 也正确
import { computed, onMounted } from 'vue'
import { useSiteMetrics } from '../composables/useSiteMetrics'

const { getMetricText, refresh } = useSiteMetrics()

const cards = computed(() => [
  { num: getMetricText('courses.planEntries', 'plus'), label: '收录课程' },
  { num: getMetricText('site.majors'), label: '覆盖专业' },
  { num: getMetricText('site.stories'), label: '学长分享' },
  { num: '∞', label: '开放共享' },
])

onMounted(() => refresh())
</script>

<template>
  <div class="hero-stats">
    <div v-for="c in cards" :key="c.label" class="hero-stat">
      <div class="stat-num">{{ c.num }}</div>
      <div class="stat-label">{{ c.label }}</div>
    </div>
  </div>
</template>
