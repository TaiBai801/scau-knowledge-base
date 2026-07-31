<script setup>
// 机电专业知识库 — 页脚（对齐 Ardot 设计稿）
</script>

<template>
  <footer class="custom-footer">
    <div class="cf-main">
      <!-- 品牌区 -->
      <div class="cf-brand">
        <div class="cf-logo">
          <img src="/emblem.png" alt="机电专业知识库" width="48" height="48" />
        </div>
        <div class="cf-site-name">机电专业知识库</div>
        <div class="cf-desc">机电专业课程资源<br/>电子科学 · 电气工程 · 农业机械化 · 农业工程 · 机器人工程<br/>五专业全覆盖，开放共享。</div>
      </div>

      <!-- 快速链接 -->
      <div class="cf-col">
        <div class="cf-col-title">专业入口</div>
        <a href="/majors/dianzikexue/">电子科学与技术</a>
        <a href="/majors/dianqigongcheng/">电气工程及其自动化</a>
        <a href="/majors/nongyejixiehua/">农业机械化</a>
        <a href="/majors/nongyegongcheng/">农业工程</a>
        <a href="/majors/jiqirengongcheng/">机器人工程</a>
      </div>

      <!-- 关于 -->
      <div class="cf-col">
        <div class="cf-col-title">快捷导航</div>
        <a href="/map">课程地图</a>
        <a href="/stories">「Ta说」</a>
        <a href="/contribute">贡献指南</a>
        <a href="/about">关于本站</a>
        <a href="/admin/index.html">管理后台</a>
      </div>
    </div>

    <!-- 备案栏 -->
    <div class="cf-bottom">
      <div class="cf-beian">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener" class="cf-beian-link">蜀ICP备2026039822号</a>
        <span class="cf-beian-divider">|</span>
        <a href="https://beian.mps.gov.cn/#/query/webSearch?code=51180202512088" target="_blank" rel="noreferrer" class="cf-beian-link cf-beian-gongan">
          <img src="/beian-gongan.png" alt="公安备案图标" class="cf-beian-icon" />
          川公网安备51180202512088号
        </a>
      </div>
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
.cf-beian {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cf-beian-link {
  color: #7FB8B5;
  text-decoration: none;
  transition: color 0.15s;
}
.cf-beian-link:hover {
  color: #FFFFFF;
}
.cf-beian-divider {
  color: #5C9E9B;
  font-size: 0.75rem;
}
.cf-beian-gongan {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cf-beian-icon {
  width: 18px;
  height: 20px;
  vertical-align: middle;
}

@media (max-width: 768px) {
  .cf-main {
    flex-direction: column;
    gap: 2rem;
  }
}
</style>
