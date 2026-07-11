<script setup>
const paths = [
  { name: '电子科学与技术', code: 'dianzikexue', color: '#2563eb' },
  { name: '电气工程及其自动化', code: 'dianqigongcheng', color: '#059669' },
  { name: '农业机械化及其自动化', code: 'nongyejixiehua', color: '#D97706' },
  { name: '农业工程', code: 'nongyegongcheng', color: '#dc2626' },
]

const semData = [
  { name: '大一上', count: 13, level: 1 },
  { name: '大一下', count: 9, level: 1 },
  { name: '大二上', count: 13, level: 2 },
  { name: '大二下', count: 15, level: 2 },
  { name: '大三上', count: 18, level: 3 },
  { name: '大三下', count: 19, level: 3 },
  { name: '大四上', count: 3, level: 4 },
  { name: '大四下', count: 3, level: 4 },
]
</script>

<template>
  <div class="ardot-page-hero">
    <div class="ardot-page-inner">
      <span class="ardot-tag">课程地图</span>
      <h1>四专业 · 八学期 · 全景穿透</h1>
      <p>网格化展示所有专业的课程结构 — 一图看懂大学四年</p>
    </div>
  </div>

  <div class="ardot-page-content">
    <div class="ardot-page-inner">
      <div class="ardot-map-grid">
        <div class="ardot-map-row" v-for="(p, i) in paths" :key="p.code" :style="{ borderLeftColor: p.color }">
          <div class="ardot-map-name">
            <div class="ardot-map-code" :style="{ background: p.color }">{{ i+1 }}</div>
            <div>
              <h3>{{ p.name }}</h3>
              <p>93 门课程 · 4 学年</p>
            </div>
          </div>
          <div class="ardot-map-sems">
            <a v-for="s in semData" :key="s.name" :href="'/majors/'+p.code+'/semester'+s.level+'-'+((semData.indexOf(s)%2)+1)" class="ardot-map-sem" :style="{ borderColor: p.color, color: p.color }">
              <div class="ardot-map-sem-name">{{ s.name }}</div>
              <div class="ardot-map-sem-count">{{ s.count }}门</div>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
