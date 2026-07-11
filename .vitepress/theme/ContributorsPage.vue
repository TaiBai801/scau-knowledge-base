<script setup>
const contributors = [
  { name: '杨彬', role: '创始人 / 全栈开发', count: 346, avatar: '杨' },
  { name: '17级张学长', role: '内容贡献', count: 8, avatar: '张' },
  { name: '18级李学姐', role: '内容贡献', count: 5, avatar: '李' },
  { name: '19级王学长', role: '内容贡献', count: 4, avatar: '王' },
  { name: '20级陈学姐', role: '内容贡献', count: 3, avatar: '陈' },
  { name: '20级刘学长', role: '内容贡献', count: 2, avatar: '刘' },
]
</script>

<template>
  <div class="ardot-page-hero">
    <div class="ardot-page-inner">
      <span class="ardot-tag">贡献者墙</span>
      <h1>感谢所有共建者</h1>
      <p>每一份贡献都让知识库更完整 — 共建者们的名字在这里被铭记</p>
    </div>
  </div>

  <div class="ardot-page-content">
    <div class="ardot-page-inner">
      <div class="ardot-contrib-stats">
        <div><div class="num">{{ contributors.length }}</div><div class="label">贡献者</div></div>
        <div><div class="num">368</div><div class="label">贡献内容</div></div>
        <div><div class="num">346</div><div class="label">覆盖课程</div></div>
      </div>

      <div class="ardot-contrib-grid">
        <article v-for="c in contributors" :key="c.name" class="ardot-contrib-card">
          <div class="ardot-contrib-avatar">{{ c.avatar }}</div>
          <div class="ardot-contrib-name">{{ c.name }}</div>
          <div class="ardot-contrib-role">{{ c.role }}</div>
          <div class="ardot-contrib-count">{{ c.count }} 项贡献</div>
        </article>
      </div>
    </div>
  </div>
</template>
