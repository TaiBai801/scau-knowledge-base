<script setup>
// 更新日志 / 发展历程
// 数据源：data/changelog.json（随仓库版本化管理，构建期静态导入，无需运行时接口）
import { computed } from 'vue'
import changelog from '../../data/changelog.json'

const KIND_LABEL = { milestone: '里程碑', feature: '功能', fix: '修复' }

const releases = computed(() => {
  const list = Array.isArray(changelog?.releases) ? changelog.releases : []
  // 倒序：日期新的在前，同日按版本号降序
  return [...list].sort((a, b) => {
    if (a.date === b.date) return versionNum(b.version) - versionNum(a.version)
    return a.date < b.date ? 1 : -1
  })
})

const featureCount = computed(() =>
  releases.value.reduce(
    (s, r) => s + r.items.filter((i) => i.kind === 'feature').length,
    0
  )
)
const fixCount = computed(() =>
  releases.value.reduce(
    (s, r) => s + r.items.filter((i) => i.kind === 'fix').length,
    0
  )
)
const latest = computed(() => releases.value[0])
const firstDate = computed(() => {
  const r = releases.value[releases.value.length - 1]
  return r ? r.date : ''
})

function versionNum(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return 0
  return Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3])
}
function kindLabel(k) { return KIND_LABEL[k] || '功能' }
// 把 **强调** 拆成片段渲染，避免引入 v-html
function segs(text) {
  return String(text || '')
    .split('**')
    .map((t, i) => ({ t, strong: i % 2 === 1 }))
    .filter((s, i, arr) => s.t !== '' || (i > 0 && i < arr.length - 1))
}
</script>

<template>
  <div class="ardot-page-hero">
    <div class="ardot-page-inner">
      <span class="ardot-tag">更新日志</span>
      <h1>发展历程</h1>
      <p>从 0 到 1 的每一步都记在这里 — 功能变更、重要修复与里程碑事件，按版本号倒序排列</p>
    </div>
  </div>

  <div class="ardot-page-content">
    <div class="ardot-page-inner">
      <div class="ardot-contrib-stats">
        <div><div class="num">{{ releases.length }}</div><div class="label">版本迭代</div></div>
        <div><div class="num">{{ featureCount }}</div><div class="label">功能更新</div></div>
        <div><div class="num">{{ fixCount }}</div><div class="label">问题修复</div></div>
        <div><div class="num">{{ firstDate }}</div><div class="label">始于</div></div>
      </div>

      <div class="ardot-timeline">
        <section v-for="r in releases" :key="r.version" class="ardot-timeline-item">
          <div class="ardot-timeline-head">
            <span class="ardot-timeline-version">{{ r.version }}</span>
            <span class="ardot-timeline-date">{{ r.date }}</span>
            <span class="ardot-timeline-tag" :data-kind="r.kind || 'feature'">{{ kindLabel(r.kind) }}</span>
          </div>
          <div class="ardot-timeline-title">{{ r.title }}</div>
          <ul>
            <li v-for="(it, i) in r.items" :key="i" :data-kind="it.kind || 'feature'">
              <span v-for="(s, j) in segs(it.text)" :key="j"><strong v-if="s.strong">{{ s.t }}</strong><template v-else>{{ s.t }}</template></span>
            </li>
          </ul>
        </section>
      </div>

      <p class="ardot-changelog-foot">
        当前版本 <strong>{{ latest && latest.version }}</strong>，更新于 {{ latest && latest.date }}。
        想让下一个版本里有你的名字？看看<strong><a href="/contribute">贡献指南</a></strong>，或到<strong><a href="/contributors">贡献者墙</a></strong>看看已经并肩作战的人。
      </p>
    </div>
  </div>
</template>
