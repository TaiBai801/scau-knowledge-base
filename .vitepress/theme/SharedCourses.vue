<script setup>
import { ref, computed } from 'vue'

const search = ref('')
const filter = ref('all')

const courses = [
  { name: '人工智能原理及应用', href: '/majors/shared/courses/ai-app', type: 'fangxiang' },
  { name: '人工智能', href: '/majors/shared/courses/ai-intro', type: 'bixiu' },
  { name: '模拟电子技术', href: '/majors/shared/courses/analog', type: 'bixiu' },
  { name: '模拟电子技术实验', href: '/majors/shared/courses/analog-lab', type: 'bixiu' },
  { name: 'C语言程序设计', href: '/majors/shared/courses/c', type: 'bixiu' },
  { name: 'C语言程序设计实验', href: '/majors/shared/courses/c-lab', type: 'bixiu' },
  { name: '机械工程三维建模与仿真', href: '/majors/shared/courses/cad3d', type: 'fangxiang' },
  { name: 'CAD计算机辅助设计实验', href: '/majors/shared/courses/cad计算机辅助设计实验', type: 'bixiu' },
  { name: '控制工程基础', href: '/majors/shared/courses/ceng', type: 'bixiu' },
  { name: '电路分析', href: '/majors/shared/courses/circuit', type: 'bixiu' },
  { name: '电路分析实验', href: '/majors/shared/courses/circuit-lab', type: 'bixiu' },
  { name: '复变函数与积分变换', href: '/majors/shared/courses/complex', type: 'bixiu' },
  { name: '自动控制原理', href: '/majors/shared/courses/control', type: 'bixiu' },
  { name: '自动控制原理实验', href: '/majors/shared/courses/control-lab', type: 'bixiu' },
  { name: '数字电子技术', href: '/majors/shared/courses/digital', type: 'bixiu' },
  { name: '数字电子技术实验', href: '/majors/shared/courses/digital-lab', type: 'bixiu' },
  { name: '电气控制技术', href: '/majors/shared/courses/ec', type: 'bixiu' },
  { name: '电气控制技术实验', href: '/majors/shared/courses/ec-lab', type: 'bixiu' },
  { name: '电子电路设计与仿真', href: '/majors/shared/courses/ecds', type: 'bixiu' },
  { name: '电子电路设计与仿真实验', href: '/majors/shared/courses/ecds-lab', type: 'bixiu' },
  { name: '嵌入式系统开发与应用', href: '/majors/shared/courses/embed', type: 'fangxiang' },
  { name: '嵌入式系统开发与应用实验', href: '/majors/shared/courses/embed-lab', type: 'fangxiang' },
  { name: '大学英语A I', href: '/majors/shared/courses/english-a1', type: 'bixiu' },
  { name: '大学英语A II', href: '/majors/shared/courses/english-a2', type: 'bixiu' },
  { name: '线性代数', href: '/majors/shared/courses/linalg', type: 'bixiu' },
  { name: '高等数学A I', href: '/majors/shared/courses/math-a1', type: 'bixiu' },
  { name: '高等数学A II', href: '/majors/shared/courses/math-a2', type: 'bixiu' },
  { name: 'MATLAB程序设计', href: '/majors/shared/courses/matlab', type: 'fangxiang' },
  { name: 'MATLAB程序设计实验', href: '/majors/shared/courses/matlab-lab', type: 'fangxiang' },
  { name: '单片机原理与应用', href: '/majors/shared/courses/mcu', type: 'bixiu' },
  { name: '单片机原理与应用实验', href: '/majors/shared/courses/mcu-lab', type: 'bixiu' },
  { name: '机械制造基础', href: '/majors/shared/courses/mfg', type: 'bixiu' },
  { name: '机械制造工艺学', href: '/majors/shared/courses/mfgp', type: 'bixiu' },
  { name: '电机学', href: '/majors/shared/courses/motor', type: 'bixiu' },
  { name: '电机学实验', href: '/majors/shared/courses/motor-lab', type: 'bixiu' },
  { name: '电力电子技术', href: '/majors/shared/courses/pe', type: 'bixiu' },
  { name: '电力电子技术实验', href: '/majors/shared/courses/pe-lab', type: 'bixiu' },
  { name: '大学物理B', href: '/majors/shared/courses/physics-b', type: 'bixiu' },
  { name: '大学物理实验B', href: '/majors/shared/courses/physics-b-lab', type: 'bixiu' },
  { name: '概率论与数理统计B', href: '/majors/shared/courses/prob', type: 'bixiu' },
  { name: 'Python语言及应用', href: '/majors/shared/courses/python语言及应用', type: 'fangxiang' },
  { name: 'Python语言及应用实验', href: '/majors/shared/courses/python语言及应用实验', type: 'fangxiang' },
  { name: '传感器技术', href: '/majors/shared/courses/sensor', type: 'bixiu' },
  { name: '传感器技术实验', href: '/majors/shared/courses/sensor-lab', type: 'bixiu' },
  { name: '信号与系统', href: '/majors/shared/courses/signal', type: 'bixiu' },
  { name: '信号与系统实验', href: '/majors/shared/courses/signal-lab', type: 'bixiu' },
  { name: '汽车拖拉机学', href: '/majors/shared/courses/tractor', type: 'bixiu' },
  { name: '专业概论与新生研讨', href: '/majors/shared/courses/专业概论与新生研讨', type: 'bixiu' },
  { name: '专业概论与新生研讨（农机）', href: '/majors/shared/courses/专业概论与新生研讨-农机-', type: 'bixiu' },
  { name: '中国近现代史纲要', href: '/majors/shared/courses/中国近现代史纲要', type: 'bixiu' },
  { name: '习近平新时代中国特色社会主义思想概论', href: '/majors/shared/courses/习近平新时代中国特色社会主义思想概论', type: 'bixiu' },
  { name: '军事理论', href: '/majors/shared/courses/军事理论', type: 'bixiu' },
  { name: '军训', href: '/majors/shared/courses/军训', type: 'shijian' },
  { name: '军训(军事技能)', href: '/majors/shared/courses/军训-军事技能-', type: 'shijian' },
  { name: '农业机械设计与计算', href: '/majors/shared/courses/农业机械设计与计算', type: 'fangxiang' },
  { name: '创新创业实践', href: '/majors/shared/courses/创新创业实践', type: 'shijian' },
  { name: '劳动教育', href: '/majors/shared/courses/劳动教育', type: 'bixiu' },
  { name: '单片机原理与应用综合实践', href: '/majors/shared/courses/单片机原理与应用综合实践', type: 'shijian' },
  { name: '国家安全教育', href: '/majors/shared/courses/国家安全教育', type: 'bixiu' },
  { name: '大学体育I', href: '/majors/shared/courses/大学体育i', type: 'bixiu' },
  { name: '大学体育II', href: '/majors/shared/courses/大学体育ii', type: 'bixiu' },
  { name: '大学体育III', href: '/majors/shared/courses/大学体育iii', type: 'bixiu' },
  { name: '大学生劳动教育（实践I）', href: '/majors/shared/courses/大学生劳动教育-实践i-', type: 'shijian' },
  { name: '大学生劳动教育（实践II）', href: '/majors/shared/courses/大学生劳动教育-实践ii-', type: 'shijian' },
  { name: '大学生心理健康与职业发展I', href: '/majors/shared/courses/大学生心理健康与职业发展i', type: 'bixiu' },
  { name: '大学生心理健康与职业发展II', href: '/majors/shared/courses/大学生心理健康与职业发展ii', type: 'bixiu' },
  { name: '大学生心理健康与职业发展III', href: '/majors/shared/courses/大学生心理健康与职业发展iii', type: 'bixiu' },
  { name: '大学生心理健康与职业发展IV', href: '/majors/shared/courses/大学生心理健康与职业发展iv', type: 'bixiu' },
  { name: '形势与政策I', href: '/majors/shared/courses/形势与政策i', type: 'bixiu' },
  { name: '形势与政策II', href: '/majors/shared/courses/形势与政策ii', type: 'bixiu' },
  { name: '形势与政策III', href: '/majors/shared/courses/形势与政策iii', type: 'bixiu' },
  { name: '形势与政策IV', href: '/majors/shared/courses/形势与政策iv', type: 'bixiu' },
  { name: '形势与政策V', href: '/majors/shared/courses/形势与政策v', type: 'bixiu' },
  { name: '形势与政策VI', href: '/majors/shared/courses/形势与政策vi', type: 'bixiu' },
  { name: '形势与政策VII', href: '/majors/shared/courses/形势与政策vii', type: 'bixiu' },
  { name: '思想道德与法治', href: '/majors/shared/courses/思想道德与法治', type: 'bixiu' },
  { name: '思政课社会实践', href: '/majors/shared/courses/思政课社会实践', type: 'shijian' },
  { name: '机械制造基础教学实习', href: '/majors/shared/courses/机械制造基础教学实习', type: 'shijian' },
  { name: '机械制造工艺学教学实习', href: '/majors/shared/courses/机械制造工艺学教学实习', type: 'shijian' },
  { name: '毕业实习', href: '/majors/shared/courses/毕业实习', type: 'shijian' },
  { name: '毕业论文（毕业设计）', href: '/majors/shared/courses/毕业论文-毕业设计-', type: 'shijian' },
  { name: '毛泽东思想和中国特色社会主义理论体系概论', href: '/majors/shared/courses/毛泽东思想和中国特色社会主义理论体系概论', type: 'bixiu' },
  { name: '汽车与拖拉机学教学实习', href: '/majors/shared/courses/汽车与拖拉机学教学实习', type: 'shijian' },
  { name: '自动控制原理综合实践', href: '/majors/shared/courses/自动控制原理综合实践', type: 'shijian' },
  { name: '试验设计与统计分析（研）', href: '/majors/shared/courses/试验设计与统计分析-研-', type: 'bixiu' },
  { name: '马克思主义基本原理概论', href: '/majors/shared/courses/马克思主义基本原理概论', type: 'bixiu' },
]

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase()
  return courses.filter(c => {
    const matchType = filter.value === 'all' || c.type === filter.value
    const matchKw = !kw || c.name.toLowerCase().includes(kw)
    return matchType && matchKw
  })
})

const filters = [
  { key: 'all', label: '全部' },
  { key: 'bixiu', label: '必修' },
  { key: 'fangxiang', label: '专业方向' },
  { key: 'shijian', label: '实践' },
]
</script>

<template>
  <div class="shared-hero">
    <div class="shared-hero-inner">
      <span class="shared-hero-tag">📚 跨专业公共课程</span>
      <h1 class="shared-hero-title">共享课程总览</h1>
      <p class="shared-hero-sub">四专业共 87 门课程 — 一次维护、多处复用，课程资料、经验、评价全院共享</p>

      <div class="shared-search">
        <img src="/icons/search-ardot.svg" alt="" class="shared-search-icon" />
        <input v-model="search" type="text" placeholder="搜索课程名、编号或任课老师..." />
      </div>

      <div class="shared-stats">
        <div class="shared-stat"><div class="num">87</div><div class="label">共享课程</div></div>
        <div class="shared-stat"><div class="num">4</div><div class="label">覆盖专业</div></div>
        <div class="shared-stat"><div class="num">35</div><div class="label">4专业共有</div></div>
        <div class="shared-stat"><div class="num">∞</div><div class="label">资料共建</div></div>
      </div>
    </div>
  </div>

  <div class="shared-featured">
    <div class="shared-featured-inner">
      <h2 class="shared-section-title">课程分类</h2>
      <div class="shared-categories">
        <a href="#c-xuanke" class="shared-category">
          <img src="/icons/featured-1.svg" alt="" />
          <div class="shared-cat-title">通识必修</div>
          <div class="shared-cat-count">思政 · 数学 · 英语 · 体育</div>
        </a>
        <a href="#c-zhuanye" class="shared-category">
          <img src="/icons/featured-2.svg" alt="" />
          <div class="shared-cat-title">专业基础</div>
          <div class="shared-cat-count">电路 · 数电 · 模电 · 单片机</div>
        </a>
        <a href="#c-shijian" class="shared-category">
          <img src="/icons/featured-3.svg" alt="" />
          <div class="shared-cat-title">实践教学</div>
          <div class="shared-cat-count">实验 · 实习 · 课程设计</div>
        </a>
        <a href="#c-biye" class="shared-category">
          <img src="/icons/featured-4.svg" alt="" />
          <div class="shared-cat-title">毕业环节</div>
          <div class="shared-cat-count">毕业设计 · 毕业实习</div>
        </a>
      </div>
    </div>
  </div>

  <div class="shared-list">
    <div class="shared-list-inner">
      <div class="shared-list-header">
        <h2 class="shared-section-title">全部课程</h2>
        <div class="shared-filter">
          <button
            v-for="f in filters"
            :key="f.key"
            class="shared-filter-btn"
            :class="{ active: filter === f.key }"
            @click="filter = f.key"
          >{{ f.label }}</button>
        </div>
      </div>

      <div class="shared-grid" v-if="filtered.length">
        <a v-for="c in filtered" :key="c.href" :href="c.href">{{ c.name }}</a>
      </div>

      <div class="shared-empty" v-else>
        <div class="shared-empty-icon">🔍</div>
        <p>没有匹配的课程，换个关键词试试？</p>
      </div>
    </div>
  </div>

  <div class="shared-upload-cta">
    <div class="shared-upload-inner">
      <div class="shared-upload-icon">📤</div>
      <h3>上传你的课程资料</h3>
      <p>考试真题、复习笔记、学习经验… 让你的资料帮助更多学弟学妹</p>
      <a href="/contribute" class="shared-upload-btn">查看贡献指南 →</a>
    </div>
  </div>
</template>
