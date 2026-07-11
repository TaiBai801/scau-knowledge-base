<script setup>
const suggestions = [
  { text: '返回首页', link: '/' },
  { text: '浏览课程', link: '/majors/dianzikexue/' },
  { text: '共享课程', link: '/majors/shared/' },
  { text: '课程地图', link: '/map' },
]
</script>

<template>
  <div class="ardot-404-page">
    <div class="ardot-404-inner">
      <div class="ardot-404-code">404</div>
      <h1>页面走丢了</h1>
      <p>你访问的页面不存在或已被移除 — 也许可以从这里继续：</p>
      <div class="ardot-404-actions">
        <a v-for="s in suggestions" :key="s.link" :href="s.link" class="ardot-404-btn">{{ s.text }}</a>
      </div>
    </div>
  </div>
</template>
