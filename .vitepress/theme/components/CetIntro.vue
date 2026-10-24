<script setup>
// 四六级考场 · 说明区（静态内容，补齐页面信息密度）
const RULES = [
  {
    exam: '四级 CET-4',
    total: '125 分钟',
    rows: [
      ['写作', '30 分钟', '1 篇短文（120-180 词）'],
      ['听力', '25 分钟', '短篇新闻 / 长对话 / 听力篇章'],
      ['阅读', '40 分钟', '选词填空 / 段落匹配 / 仔细阅读'],
      ['翻译', '30 分钟', '汉译英段落（140-160 字）'],
    ],
  },
  {
    exam: '六级 CET-6',
    total: '130 分钟',
    rows: [
      ['写作', '30 分钟', '1 篇短文（150-200 词）'],
      ['听力', '30 分钟', '长对话 / 听力篇章 / 讲座讲话'],
      ['阅读', '40 分钟', '选词填空 / 段落匹配 / 仔细阅读'],
      ['翻译', '30 分钟', '汉译英段落（180-200 字）'],
    ],
  },
]

const TYPES = [
  { icon: '🎧', name: '听力', desc: '按真实语速练抓关键词与速记，材料附音频，交卷后可回看原文定位。' },
  { icon: '📖', name: '阅读', desc: '选词填空、段落匹配、仔细阅读分项练，重点是定位速度与同义替换识别。' },
  { icon: '✍️', name: '写作', desc: '限时成文后对照参考范文自评，看结构、连接词与句式是否达标。' },
  { icon: '🌐', name: '翻译', desc: '汉译英段落专项，对照参考译文标注文化负载词与长难句处理方式。' },
]

const STEPS = [
  { n: '1', t: '登录账号', d: '作答与进度都绑定账号，换设备登录即可继续。' },
  { n: '2', t: '选卷或选题型', d: '全程模拟考按真实顺序推进；单项训练不限时、随时交卷。' },
  { n: '3', t: '交卷看分屏', d: '左看自己的答卷与判分，右看解析、易错点与得分说明。' },
]
</script>

<template>
  <section class="ci">
    <h2 class="ci-h">走一遍完整流程</h2>
    <div class="ci-steps">
      <div v-for="s in STEPS" :key="s.n" class="ci-step">
        <span class="ci-step-n">{{ s.n }}</span>
        <div>
          <b>{{ s.t }}</b>
          <p>{{ s.d }}</p>
        </div>
      </div>
    </div>

    <h2 class="ci-h">真实考试节奏（全程模拟考按此执行）</h2>
    <div class="ci-rules">
      <div v-for="r in RULES" :key="r.exam" class="ci-rule">
        <div class="ci-rule-head">
          <b>{{ r.exam }}</b>
          <span>总时长 {{ r.total }}</span>
        </div>
        <table class="ci-table">
          <tbody>
            <tr v-for="row in r.rows" :key="row[0]">
              <td class="ci-td-k">{{ row[0] }}</td>
              <td class="ci-td-time">{{ row[1] }}</td>
              <td class="ci-td-desc">{{ row[2] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <h2 class="ci-h">四种题型分别练什么</h2>
    <div class="ci-types">
      <div v-for="t in TYPES" :key="t.name" class="ci-type">
        <span class="ci-type-ic" aria-hidden="true">{{ t.icon }}</span>
        <b>{{ t.name }}</b>
        <p>{{ t.desc }}</p>
      </div>
    </div>

    <ul class="ci-tips">
      <li>中途关页、断网、崩溃都不丢答案——重新打开可从「继续作答」接上。</li>
      <li>全程模拟考每个分区独立倒计时，时间到自动进入下一部分，最后自动交卷。</li>
      <li>写作、翻译为人工自评：对照参考范文给自己打分，分数会计入总分。</li>
    </ul>
  </section>
</template>

<style scoped>
.ci { margin-top: 40px; }
.ci-h {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--brand);
  margin: 28px 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.ci-h:first-child { margin-top: 0; }

.ci-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ci-step {
  display: flex; gap: 10px; align-items: flex-start;
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 12px; padding: 14px 16px;
}
.ci-step-n {
  flex: none; width: 24px; height: 24px; border-radius: 50%;
  background: var(--brand); color: #fff; font-size: 0.78rem;
  display: inline-flex; align-items: center; justify-content: center;
}
.ci-step b { font-size: 0.88rem; color: var(--text-heading); }
.ci-step p { margin: 4px 0 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.7; }

.ci-rules { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ci-rule {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 12px; padding: 16px 18px;
}
.ci-rule-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed var(--line);
}
.ci-rule-head b { font-size: 0.92rem; color: var(--text-heading); }
.ci-rule-head span { font-size: 0.76rem; color: var(--brand); }
.ci-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.ci-table tr { border-bottom: 1px solid #f4f1ea; }
.ci-table tr:last-child { border-bottom: none; }
.ci-table td { padding: 7px 0; vertical-align: top; }
.ci-td-k { width: 56px; color: var(--text-heading); font-weight: 500; }
.ci-td-time { width: 72px; color: var(--brand); }
.ci-td-desc { color: var(--text-muted); line-height: 1.6; }

.ci-types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.ci-type {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 12px; padding: 16px;
}
.ci-type-ic { font-size: 1.3rem; }
.ci-type b { display: block; margin: 6px 0 4px; font-size: 0.88rem; color: var(--text-heading); }
.ci-type p { margin: 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.7; }

.ci-tips {
  margin: 20px 0 0; padding: 14px 18px 14px 34px;
  background: var(--brand-pale); border-radius: 10px;
  font-size: 0.8rem; color: var(--brand); line-height: 1.9;
}

@media (max-width: 860px) {
  .ci-steps, .ci-rules { grid-template-columns: 1fr; }
  .ci-types { grid-template-columns: 1fr 1fr; }
}

.dark .ci-step, .dark .ci-rule, .dark .ci-type { background: #151b1a; border-color: #2c3331; }
.dark .ci-tips { background: #12312e; color: #7fc9be; }
</style>
