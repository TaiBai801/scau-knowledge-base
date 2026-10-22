<script setup>
// 学习足迹（/footprint）
// ------------------------------------------------------------------
// 方案 1.1 + 1.5：「看过什么、下过什么，换设备就归零」→ 记录在本机，
// 期末生成一页「这学期我在平台上的轨迹」，可截图分享，不暴露分数。
//
// SSR 安全：setup 顶层只用空数组算一份空摘要，不读 localStorage、不碰 window；
// 真实数据一律在 onMounted 里读取。
import { ref, computed, onMounted } from 'vue'
import {
  buildExportBundle,
  downloadJson,
  storageInfo,
  formatBytes,
  clearAll,
  todayISO,
  write,
  KEYS,
} from '../lib/storage'
import { readFootprint, summarizeFootprint, semesterStart, KIND_LABEL } from '../lib/footprint'
import SyncBar from './SyncBar.vue'
import ArEmpty from './ArEmpty.vue'
import ArLoading from './ArLoading.vue'
import ArBtn from './ArBtn.vue'

const ready = ref(false)
const events = ref([])
// 空数组 + sinceTs=0：纯函数，服务端渲染不会触碰浏览器 API
const all = ref(summarizeFootprint([], 0))
const term = ref(summarizeFootprint([], 0))
const termStart = ref(0)
const info = ref({ keys: 0, bytes: 0, items: [] })
const notice = ref('')

const hasData = computed(() => all.value.total > 0)

const timeline = computed(() => events.value.slice(-30).reverse())

const termLabel = computed(() => {
  if (!termStart.value) return '本学期'
  return new Date(termStart.value).getFullYear() + ' 秋季学期'
})

const termStartText = computed(() => (termStart.value ? fmtDate(termStart.value) : '—'))

function fmtNum(n) {
  return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtDate(ts) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

function shortDate(ts) {
  const d = new Date(ts)
  return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function relTime(ts) {
  const diff = Date.now() - ts
  if (diff < 60e3) return '刚刚'
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前'
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前'
  if (diff < 7 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前'
  return shortDate(ts)
}

function kindLabel(k) {
  return KIND_LABEL[k] || k
}

function courseHref(e) {
  return e && e.code ? '/majors/shared/' + e.code : ''
}

function refresh() {
  const list = readFootprint()
  events.value = list
  all.value = summarizeFootprint(list, 0)
  termStart.value = semesterStart()
  term.value = summarizeFootprint(list, termStart.value)
  info.value = storageInfo()
}

// ── 云端同步：按 ts+kind 去重合并，避免换设备丢轨迹 ──
function getFootData() {
  return readFootprint()
}
function applyFootData(v) {
  try {
    const local = readFootprint()
    const cloud = Array.isArray(v) ? v : []
    const seen = new Set(
      local.map((e) => `${Number(e.ts) || 0}|${e.kind || ''}|${e.ref || ''}|${e.course || ''}`)
    )
    const merged = local.concat(
      cloud.filter(
        (e) =>
          e &&
          Number(e.ts) > 0 &&
          !seen.has(`${Number(e.ts) || 0}|${e.kind || ''}|${e.ref || ''}|${e.course || ''}`)
      )
    )
    merged.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
    write(KEYS.foot, merged.slice(-3000))
    refresh()
  } catch (e) {
    /* 合并失败也不影响本机数据 */
  }
}

onMounted(() => {
  refresh()
  ready.value = true
})

function onExport() {
  downloadJson('knowbase-my-data-' + todayISO() + '.json', buildExportBundle())
  notice.value = '已导出 JSON 文件，换设备时可在浏览器里留个备份。'
}

function onClear() {
  if (typeof window === 'undefined') return
  const ok = window.confirm('确定清空本机所有学习数据吗？此操作不可撤销，建议先导出备份。')
  if (!ok) return
  const n = clearAll()
  refresh()
  notice.value = '已清空 ' + n + ' 个本地键，足迹已归零。'
}
</script>

<template>
  <div class="fp">
    <ArLoading v-if="!ready" text="正在读取本机数据…" />

    <template v-else>
      <!-- 同步到账号：无论有没有本机记录都给，这样空状态也能从云端拉回 -->
      <section class="fp-sync">
        <SyncBar
          sync-key="footprint"
          title="学习足迹"
          :get-data="getFootData"
          :apply-data="applyFootData"
          @applied="refresh"
        />
      </section>

      <!-- 空状态：不摆空表格 -->
      <ArEmpty v-if="!hasData" icon="👣" title="还没有记录">
        <p>
          去<a href="/majors/dianzikexue/">浏览课程</a>、<a href="/quiz">做一组题</a>或<a
            href="/checkin"
            >打个卡</a
          >，这里就会长出你的学习轨迹。
        </p>
        <p class="fp-empty-note">所有记录只写进这台设备的浏览器，不上传、不排名、不涉及成绩。</p>
      </ArEmpty>

      <template v-else>
        <!-- 四张大数字卡 -->
        <section class="fp-stats">
          <div class="fp-stat">
            <div class="fp-stat-num">{{ fmtNum(all.total) }}</div>
            <div class="fp-stat-label">累计事件</div>
            <div class="fp-stat-note">浏览、下载、做题、专注都算</div>
          </div>
          <div class="fp-stat">
            <div class="fp-stat-num">{{ fmtNum(all.courses) }}</div>
            <div class="fp-stat-label">涉及课程</div>
            <div class="fp-stat-note">有记录去过的课</div>
          </div>
          <div class="fp-stat">
            <div class="fp-stat-num">{{ fmtNum(all.quizQuestions) }}</div>
            <div class="fp-stat-label">做题量</div>
            <div class="fp-stat-note">来自组卷练习</div>
          </div>
          <div class="fp-stat">
            <div class="fp-stat-num">{{ fmtNum(all.focusMinutes) }}</div>
            <div class="fp-stat-label">专注时长（分钟）</div>
            <div class="fp-stat-note">{{ fmtNum(all.focusUnits) }} 个专注单元</div>
          </div>
        </section>

        <!-- 本学期学习地图 -->
        <section class="fp-block">
          <div class="fp-block-head">
            <h2>本学期学习地图</h2>
            <span class="fp-block-sub">{{ termLabel }} · {{ termStartText }} 起</span>
          </div>

          <div class="fp-map">
            <p class="fp-map-sentence">
              这学期你在这台设备上留下了 <b>{{ fmtNum(term.days) }}</b> 天记录，走过
              <b>{{ fmtNum(term.courses) }}</b> 门课，做了 <b>{{ fmtNum(term.quizQuestions) }}</b> 道题，
              专注 <b>{{ fmtNum(term.focusMinutes) }}</b> 分钟。
            </p>

            <!-- 可截图分享的轨迹卡：纯 CSS，不含任何图片与分数 -->
            <div class="fp-share">
              <div class="fp-share-top">
                <span class="fp-share-tag">学期轨迹</span>
                <span class="fp-share-brand">机电专业知识库</span>
              </div>
              <h3 class="fp-share-title">{{ termLabel }} · 我的学习轨迹</h3>
              <div class="fp-share-grid">
                <div class="fp-share-cell">
                  <div class="fp-share-num">{{ fmtNum(term.days) }}</div>
                  <div class="fp-share-cap">天有记录</div>
                </div>
                <div class="fp-share-cell">
                  <div class="fp-share-num">{{ fmtNum(term.courses) }}</div>
                  <div class="fp-share-cap">门课程</div>
                </div>
                <div class="fp-share-cell">
                  <div class="fp-share-num">{{ fmtNum(term.quizQuestions) }}</div>
                  <div class="fp-share-cap">道题</div>
                </div>
                <div class="fp-share-cell">
                  <div class="fp-share-num">{{ fmtNum(term.focusMinutes) }}</div>
                  <div class="fp-share-cap">分钟专注</div>
                </div>
              </div>
              <p class="fp-share-foot">数据仅存于本机 · 不含分数与排名</p>
            </div>
            <p class="fp-share-hint">长按或截图保存这张卡，分享时不暴露任何成绩。</p>
          </div>
        </section>

        <!-- 课程轨迹列表 -->
        <section class="fp-block">
          <div class="fp-block-head">
            <h2>课程轨迹</h2>
            <span class="fp-block-sub">共 {{ fmtNum(all.courseList.length) }} 门 · 按最近访问排序</span>
          </div>
          <ul class="fp-courses">
            <li v-for="c in all.courseList" :key="c.course" class="fp-course">
              <a v-if="courseHref(c)" class="fp-course-name" :href="courseHref(c)">{{ c.course }}</a>
              <span v-else class="fp-course-name is-plain">{{ c.course }}</span>
              <span class="fp-course-meta">
                <span class="fp-course-count">{{ fmtNum(c.count) }} 次</span>
                <span class="fp-course-time">{{ relTime(c.lastAt) }}</span>
              </span>
            </li>
          </ul>
        </section>

        <!-- 最近 30 条时间线 -->
        <section class="fp-block">
          <div class="fp-block-head">
            <h2>最近 30 条记录</h2>
            <span class="fp-block-sub">新的在上</span>
          </div>
          <ol class="fp-timeline">
            <li v-for="(e, i) in timeline" :key="i" class="fp-event">
              <span class="fp-event-dot"></span>
              <div class="fp-event-body">
                <div class="fp-event-line">
                  <span class="fp-event-kind">{{ kindLabel(e.kind) }}</span>
                  <span v-if="e.course" class="fp-event-course">{{ e.course }}</span>
                  <span v-if="e.n" class="fp-event-n">+{{ fmtNum(e.n) }}</span>
                </div>
                <div class="fp-event-sub">
                  <span>{{ e.date }}</span>
                  <span v-if="e.ref"> · {{ e.ref }}</span>
                </div>
              </div>
            </li>
          </ol>
        </section>
      </template>

      <!-- 数据主权区：始终可见，空数据时也能导出/清空 -->
      <section class="fp-block fp-sovereign">
        <div class="fp-block-head">
          <h2>你的数据，你自己管</h2>
          <span class="fp-block-sub">本机 {{ info.keys }} 个键 · {{ formatBytes(info.bytes) }}</span>
        </div>
        <p class="fp-warn">
          这些数据只存在你这台设备的浏览器里，换设备或清缓存会丢失，建议定期导出。
        </p>
        <div class="fp-actions">
          <ArBtn variant="primary" size="sm" @click="onExport">导出我的数据</ArBtn>
          <ArBtn variant="danger" size="sm" @click="onClear">清空本机数据</ArBtn>
        </div>
        <p v-if="notice" class="fp-notice">{{ notice }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.fp-sync {
  margin-bottom: 18px;
}

.fp-empty-note {
  margin-top: 8px !important;
  font-size: 0.82rem;
  color: var(--text-muted) !important;
}

/* 大数字卡 */
.fp-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.fp-stat {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px 18px 16px;
}
.fp-stat-num {
  font-family: var(--font-display, serif);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.fp-stat-label {
  margin-top: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-heading);
}
.fp-stat-note {
  margin-top: 3px;
  font-size: 0.76rem;
  color: var(--text-muted);
}

/* 区块 */
.fp-block {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px 24px 24px;
}
.fp-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.fp-block-head h2 {
  margin: 0;
  font-family: var(--font-display, serif);
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--text-heading);
  border: none;
  padding: 0;
}
.fp-block-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* 学期地图 */
.fp-map-sentence {
  margin: 0 0 18px;
  font-size: 0.94rem;
  line-height: 1.9;
  color: var(--text-body);
}
.fp-map-sentence b {
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}
.fp-share {
  position: relative;
  border-radius: 16px;
  padding: 22px 24px 18px;
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%);
  color: #fff;
  overflow: hidden;
}
.fp-share::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -40px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.fp-share-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fp-share-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
}
.fp-share-brand {
  font-size: 0.76rem;
  opacity: 0.82;
}
.fp-share-title {
  margin: 14px 0 16px;
  font-family: var(--font-display, serif);
  font-size: 1.24rem;
  font-weight: 700;
  color: #fff;
}
.fp-share-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.fp-share-cell {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 12px 10px;
  text-align: center;
}
.fp-share-num {
  font-family: var(--font-display, serif);
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.fp-share-cap {
  margin-top: 3px;
  font-size: 0.72rem;
  opacity: 0.9;
}
.fp-share-foot {
  margin: 14px 0 0;
  font-size: 0.72rem;
  opacity: 0.78;
  letter-spacing: 0.02em;
}
.fp-share-hint {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* 课程轨迹 */
.fp-courses {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.fp-course {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px dashed var(--line);
}
.fp-course:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.fp-course-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-heading);
  text-decoration: none;
}
.fp-course-name:not(.is-plain) {
  color: var(--brand);
}
.fp-course-name:not(.is-plain):hover {
  border-bottom: 1px solid var(--brand-pale);
}
.fp-course-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.fp-course-count {
  padding: 1px 8px;
  border-radius: 20px;
  background: var(--brand-pale);
  color: var(--brand);
}

/* 时间线 */
.fp-timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
}
.fp-event {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 0 0 16px 0;
}
.fp-event:last-child {
  padding-bottom: 0;
}
.fp-event-dot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--brand);
}
.fp-event::before {
  content: '';
  position: absolute;
  left: 3.5px;
  top: 12px;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.fp-event:last-child::before {
  display: none;
}
.fp-event-body {
  min-width: 0;
}
.fp-event-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.9rem;
}
.fp-event-kind {
  font-weight: 600;
  color: var(--text-heading);
}
.fp-event-course {
  color: var(--brand);
  font-size: 0.84rem;
}
.fp-event-n {
  font-size: 0.76rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.fp-event-sub {
  margin-top: 2px;
  font-size: 0.76rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 数据主权 */
.fp-sovereign {
  border-color: var(--brand-pale);
}
.fp-warn {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-left: 3px solid var(--brand);
  background: var(--brand-pale);
  border-radius: 0 8px 8px 0;
  font-size: 0.86rem;
  line-height: 1.7;
  color: var(--text-heading);
}
.fp-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.fp-notice {
  margin: 12px 0 0;
  font-size: 0.8rem;
  color: var(--brand);
}

@media (max-width: 640px) {
  .fp-stats,
  .fp-share-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .fp-block {
    padding: 18px 16px 20px;
  }
  .fp-share {
    padding: 18px 16px 16px;
  }
  .fp-course {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}
</style>
