<script setup>
const stories = [
  { author: '17级张学长', major: '电子科学与技术', course: '信号与系统', score: 92, quote: '这门课重在理解变换的物理意义，多画图多总结，做完近5年真题基本稳了。' },
  { author: '18级李学姐', major: '电气工程', course: '电路分析', score: 95, quote: '课上一定要跟紧，课后刷邱关源习题册。考试题型很固定，套路搞清楚就不难。' },
  { author: '19级王学长', major: '农业机械化', course: '机械原理', score: 88, quote: '机械原理大题多，关键是画机构简图。建议把每个机构的自由度分析都做一遍。' },
  { author: '20级陈学姐', major: '农业工程', course: 'MATLAB程序设计', score: 96, quote: '实验报告写清楚思路和结果，代码加上注释。期末就是几个综合实验的现场编程。' },
]
</script>

<template>
  <div class="ardot-stories-hero">
    <div class="ardot-stories-inner">
      <span class="ardot-tag">学长说</span>
      <h1>前辈经验·少走弯路</h1>
      <p>高分学长学姐的真实心得 — 比绩点更有参考价值</p>
    </div>
  </div>

  <div class="ardot-stories-list">
    <div class="ardot-stories-inner">
      <article v-for="s in stories" :key="s.author" class="ardot-story-card">
        <div class="ardot-story-header">
          <div class="ardot-story-avatar">{{ s.author.substr(0,1) }}</div>
          <div>
            <div class="ardot-story-author">{{ s.author }}</div>
            <div class="ardot-story-meta">{{ s.major }} · {{ s.course }}</div>
          </div>
          <div class="ardot-story-score">{{ s.score }}分</div>
        </div>
        <blockquote class="ardot-story-quote">"{{ s.quote }}"</blockquote>
      </article>

      <div class="ardot-stories-cta">
        <h3>分享你的学习经验</h3>
        <p>如果你是高分学长学姐，欢迎投稿 — 让你的经验帮助更多学弟学妹</p>
        <a href="/contribute" class="ardot-cta-btn">查看贡献指南 →</a>
      </div>
    </div>
  </div>
</template>
