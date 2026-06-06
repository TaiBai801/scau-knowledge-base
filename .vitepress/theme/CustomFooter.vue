<script setup>
// 机电学院知识库 — 页脚（对齐 Ardot 设计稿）
</script>

<template>
  <footer class="custom-footer">
    <div class="cf-main">
      <!-- 品牌区 -->
      <div class="cf-brand">
        <div class="cf-logo">
          <img src="/emblem.png" alt="四川农业大学机电学院" width="48" height="48" />
        </div>
        <div class="cf-site-name">机电学院知识库</div>
        <div class="cf-desc">四川农业大学机电学院课程资源共享平台<br/>电子科学 · 电气工程 · 农业机械化 · 农业工程<br/>四专业全覆盖，全院共建，人人共享。</div>
      </div>

      <!-- 快速链接 -->
      <div class="cf-col">
        <div class="cf-col-title">专业入口</div>
        <a href="/majors/dianzikexue/">电子科学与技术</a>
        <a href="/majors/dianqigongcheng/">电气工程及其自动化</a>
        <a href="/majors/nongyejixiehua/">农业机械化</a>
        <a href="/majors/nongyegongcheng/">农业工程</a>
      </div>

      <!-- 关于 -->
      <div class="cf-col">
        <div class="cf-col-title">快捷导航</div>
        <a href="/map">课程地图</a>
        <a href="/stories">学长说</a>
        <a href="/contribute">贡献指南</a>
        <a href="/about">关于本站</a>
        <a href="/admin/">管理后台</a>
      </div>
    </div>

    <!-- 版权栏 -->
    <div class="cf-bottom">
      <span>&copy; 2026 四川农业大学 · 机电学院知识库</span>
    </div>
  </footer>
</template>

<style scoped>
.custom-footer {
  width: 100%;
  background: #0D5C5A;
}
.cf-main {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  gap: 4rem;
  padding: 3rem 2rem;
  flex-wrap: wrap;
}
.cf-brand {
  flex: 1 1 260px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cf-logo img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}
.cf-site-name {
  font-family: 'Crimson Pro', serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: #FFFFFF;
}
.cf-desc {
  font-size: 0.85rem;
  line-height: 1.7;
  color: #B2D9D6;
  max-width: 280px;
}
.cf-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 100px;
}
.cf-col-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 0.25rem;
}
.cf-col a {
  color: #B2D9D6;
  text-decoration: none;
  font-size: 0.85rem;
  transition: color 0.15s;
}
.cf-col a:hover {
  color: #FFFFFF;
}
.cf-bottom {
  background: #094D4B;
  padding: 0.75rem 2rem;
  text-align: center;
  font-size: 0.8rem;
  color: #7FB8B5;
}

@media (max-width: 768px) {
  .cf-main {
    flex-direction: column;
    gap: 2rem;
  }
}
</style>
