<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  major: { type: String, required: true },
  majorPath: { type: String, required: true },
  semester: { type: String, required: true },
  semesterShort: { type: String, required: true },
})

const search = ref('')
const filterType = ref('all')

const courses = [
  { name: 'C语言程序设计', credits: 2.5, type: 'bixiu', href: '/majors/shared/courses/c' },
  { name: 'C语言程序设计实验', credits: 1.0, type: 'bixiu', href: '/majors/shared/courses/c-lab' },
  { name: '高等数学A I', credits: 5.0, type: 'bixiu', href: '/majors/shared/courses/math-a1' },
  { name: '大学英语A I', credits: 4.0, type: 'bixiu', href: '/majors/shared/courses/english-a1' },
  { name: '思想道德与法治', credits: 2.5, type: 'bixiu', href: '/majors/shared/courses/思想道德与法治' },
  { name: '中国近现代史纲要', credits: 2.5, type: 'bixiu', href: '/majors/shared/courses/中国近现代史纲要' },
  { name: '大学生心理健康与职业发展I', credits: 1.0, type: 'bixiu', href: '/majors/shared/courses/大学生心理健康与职业发展i' },
  { name: '大学体育I', credits: 1.0, type: 'bixiu', href: '/majors/shared/courses/大学体育i' },
  { name: '形势与政策I', credits: 0.5, type: 'bixiu', href: '/majors/shared/courses/形势与政策i' },
  { name: '军事理论', credits: 2.0, type: 'bixiu', href: '/majors/shared/courses/军事理论' },
  { name: '国家安全教育', credits: 1.0, type: 'bixiu', href: '/majors/shared/courses/国家安全教育' },
  { name: '军训', credits: 2.0, type: 'shijian', href: '/majors/shared/courses/军训' },
  { name: '专业概论与新生研讨', credits: 1.0, type: 'bixiu', href: '/majors/shared/courses/专业概论与新生研讨' },
]

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase()
  return courses.filter(c => {
    const matchType = filterType.value === 'all' || c.type === filterType.value
    const matchKw = !kw || c.name.toLowerCase().includes(kw)
    return matchType && matchKw
  })
})

const totalCredits = computed(() => {
  return courses.reduce((sum, c) => sum + c.credits, 0).toFixed(1)
})
</script>

<template>
  <div class="ardot-semester-hero">
    <div class="ardot-semester-inner">
      <a :href="majorPath" class="ardot-back">← 返回专业总览</a>
      <h1 class="ardot-semester-title">{{ major }} · {{ semester }}</h1>
      <p class="ardot-semester-sub">{{ courses.length }} 门课程 · 共 {{ totalCredits }} 学分</p>
    </div>
  </div>

  <div class="ardot-course-list-section">
    <div class="ardot-course-list-inner">
      <div class="ardot-course-toolbar">
        <input v-model="search" type="text" placeholder="搜索课程..." class="ardot-course-search" />
        <div class="ardot-course-filters">
          <button :class="{ active: filterType==='all' }" @click="filterType='all'">全部</button>
          <button :class="{ active: filterType==='bixiu' }" @click="filterType='bixiu'">必修</button>
          <button :class="{ active: filterType==='shijian' }" @click="filterType='shijian'">实践</button>
        </div>
      </div>

      <div class="ardot-course-table" v-if="filtered.length">
        <div class="ardot-course-head">
          <span>#</span><span>课程名称</span><span>学分</span><span>性质</span><span></span>
        </div>
        <a v-for="(c, i) in filtered" :key="c.name" :href="c.href" class="ardot-course-row">
          <span class="num">{{ i+1 }}</span>
          <span class="name">{{ c.name }}</span>
          <span class="credits">{{ c.credits }}</span>
          <span class="type">
            <span v-if="c.type==='bixiu'" class="ardot-badge ardot-badge-bixiu">必修</span>
            <span v-else class="ardot-badge ardot-badge-shijian">实践</span>
          </span>
          <span class="arrow">→</span>
        </a>
      </div>
      <div v-else class="ardot-empty">没有匹配的课程</div>
    </div>
  </div>
</template>
