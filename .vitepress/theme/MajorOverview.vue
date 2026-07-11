<script setup>
import { computed } from 'vue'

const props = defineProps({
  major: { type: String, required: true },
  majorPath: { type: String, required: true },
  totalCourses: { type: Number, default: 93 },
})

const semesters = computed(() => [
  { name: '大一上', count: 13, link: `${props.majorPath}/semester1-1`, color: '#2563eb', bg: '#eff6ff' },
  { name: '大一下', count: 9, link: `${props.majorPath}/semester1-2`, color: '#2563eb', bg: '#eff6ff' },
  { name: '大二上', count: 13, link: `${props.majorPath}/semester2-1`, color: '#059669', bg: '#f0fdf4' },
  { name: '大二下', count: 15, link: `${props.majorPath}/semester2-2`, color: '#059669', bg: '#f0fdf4' },
  { name: '大三上', count: 18, link: `${props.majorPath}/semester3-1`, color: '#D97706', bg: '#fffbeb' },
  { name: '大三下', count: 19, link: `${props.majorPath}/semester3-2`, color: '#D97706', bg: '#fffbeb' },
  { name: '大四上', count: 3, link: `${props.majorPath}/semester4-1`, color: '#dc2626', bg: '#fef2f2' },
  { name: '大四下', count: 3, link: `${props.majorPath}/semester4-2`, color: '#dc2626', bg: '#fef2f2' },
])
</script>

<template>
  <div class="ardot-major-hero">
    <div class="ardot-major-inner">
      <span class="ardot-tag">专业总览</span>
      <h1 class="ardot-major-title">{{ major }}</h1>
      <p class="ardot-major-sub">{{ totalCourses }} 门课程 · 大一到大四全覆盖 · 8 个学期贯通培养</p>
      <div class="ardot-major-stats">
        <div><div class="num">{{ totalCourses }}</div><div class="label">课程总数</div></div>
        <div><div class="num">4</div><div class="label">学年</div></div>
        <div><div class="num">8</div><div class="label">学期</div></div>
        <div><div class="num">12</div><div class="label">核心课程</div></div>
      </div>
    </div>
  </div>

  <div class="ardot-semester-section">
    <h2 class="ardot-section-title">📖 按学期浏览</h2>
    <p class="ardot-section-sub">从大一到大四，点击进入对应学期查看完整课程列表</p>
    <div class="ardot-semester-grid">
      <a v-for="s in semesters" :key="s.name" :href="s.link" class="ardot-semester-card">
        <div class="ardot-semester-name" :style="{ color: s.color, background: s.bg }">{{ s.name }}</div>
        <div class="ardot-semester-count">{{ s.count }} 门课</div>
        <div class="ardot-semester-arrow" :style="{ color: s.color }">→</div>
      </a>
    </div>
  </div>

  <div class="ardot-cta">
    <div class="ardot-cta-inner">
      <h3>查看本专业共享课程</h3>
      <p>跨专业公共课程在四专业之间复用 — 87 门课一次维护多处使用</p>
      <a href="/majors/shared/" class="ardot-cta-btn">浏览共享课程 →</a>
    </div>
  </div>
</template>
