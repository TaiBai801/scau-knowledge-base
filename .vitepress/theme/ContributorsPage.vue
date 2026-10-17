<script setup>
// 贡献者墙 — 数据由 /api/contributors 下发（管理后台可增删改/排序/隐藏）
// SSR 兜底：构建期直接读仓库里的 data/contributors.json 作为种子，
// 与云端数据同构（含 hidden 标记），首屏只渲染未下线的条目，避免闪卡。
import { ref, computed, onMounted } from 'vue'
import { getMetric } from './composables/useSiteMetrics'
import seedData from '../../data/contributors.json'

const TYPE_LABEL = {
  core: '核心建设',
  content: '内容贡献',
  review: '内容审校',
  design: '设计支持',
  other: '其他贡献',
}
// 课程数不再写死：取构建期快照的「培养方案课程条目数」（对外 346+ 口径）
const siteCourses = computed(() => getMetric('courses.planEntries'))

const seed = (seedData?.contributors || [])
  .filter((c) => c && !c.hidden)
  .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))

const contributors = ref(seed)

const totalContrib = computed(() =>
  contributors.value.reduce((s, c) => s + (Number(c.count) || 0), 0)
)

function initial(name) {
  return (name || '?').trim().slice(0, 1) || '?'
}
// 由姓名哈希生成稳定的头像底色（品牌色系邻近色，保持 Ardot 调性）
function hueOf(name) {
  let h = 0
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) % 360
  return h
}
function avatarStyle(c) {
  if (c.avatar) return {}
  const h = hueOf(c.name)
  return { background: `hsl(${h}, 32%, 92%)`, color: `hsl(${h}, 45%, 30%)` }
}
function typeLabel(t) { return TYPE_LABEL[t] || TYPE_LABEL.other }

onMounted(async () => {
  try {
    const r = await fetch('/api/contributors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && Array.isArray(d.contributors) && d.contributors.length) {
      contributors.value = d.contributors
    }
  } catch (e) { /* 网络失败时保留种子数据 */ }
})
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
        <div><div class="num">{{ totalContrib }}</div><div class="label">贡献内容</div></div>
        <div><div class="num">{{ siteCourses }}+</div><div class="label">覆盖课程</div></div>
      </div>

      <div class="ardot-contrib-grid">
        <article v-for="c in contributors" :key="c.id || c.name" class="ardot-contrib-card">
          <img v-if="c.avatar" class="ardot-contrib-avatar is-img" :src="c.avatar" :alt="c.name" loading="lazy">
          <div v-else class="ardot-contrib-avatar" :style="avatarStyle(c)">{{ initial(c.name) }}</div>
          <div class="ardot-contrib-name">{{ c.name }}</div>
          <span class="ardot-contrib-badge" :data-type="c.type || 'other'">{{ typeLabel(c.type) }}</span>
          <div v-if="c.role" class="ardot-contrib-role">{{ c.role }}</div>
          <div v-if="c.desc" class="ardot-contrib-desc">{{ c.desc }}</div>
          <div class="ardot-contrib-meta">
            <span class="ardot-contrib-count">{{ c.count }} 项贡献</span>
            <span v-if="c.joinedAt" class="ardot-contrib-join">{{ c.joinedAt }} 加入</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
