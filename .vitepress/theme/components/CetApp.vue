<script setup>
// 四六级模拟考试 · 考生端
// 三态：lobby(大厅) → running(考试/训练) → result(左右分屏复盘)
// 数据：题库/试卷 ← /api/cet（云端）；作答进度/成绩记录 → /api/user key=cet（云端私有）
// 断点续考：progress 每次作答变动 + 15s 心跳 + 页面卸载前 自动云端保存
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { userAuth, restoreUser } from '../userauth.js'
import AuthPanel from '../AuthPanel.vue'
import ArBtn from './ArBtn.vue'
import ArBadge from './ArBadge.vue'
import ArLoading from './ArLoading.vue'
import ArError from './ArError.vue'

const CET_API = '/api/cet'
const USER_API = '/api/user'

function token() {
  try { return localStorage.getItem('user_token_v1') || '' } catch (e) { return '' }
}
async function post(api, payload) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: token() }, payload)),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status)
  return d
}

const TYPE_LABEL = { listening: '听力', reading: '阅读', writing: '写作', translation: '翻译' }
const EXAM_LABEL = { cet4: '四级', cet6: '六级' }
const OBJ_TYPES = ['listening', 'reading'] // 客观自动判分；写作/翻译自评

// ── 全局状态 ──
const view = ref('lobby') // lobby | running | result
const loggedIn = computed(() => !!userAuth.user)
const loading = ref(true)
const loadError = ref('')
const bank = reactive({ config: { enabled: true, announce: '' }, questions: [], papers: [] })
const cloud = ref(null) // 个人云端数据 { progress, records }
const mode = ref('exam') // exam | training
const trainingType = ref('listening')
const trainingExam = ref('cet4')

// ── 载入 ──
async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    const [cet, ud] = await Promise.all([
      post(CET_API, { action: 'get' }),
      post(USER_API, { action: 'dataGet', key: 'cet' }).catch(() => null),
    ])
    bank.config = cet.config || { enabled: true }
    bank.questions = Array.isArray(cet.questions) ? cet.questions : []
    bank.papers = Array.isArray(cet.papers) ? cet.papers : []
    const v = ud && ud.value
    cloud.value = v && typeof v === 'object' ? v : { progress: {}, records: [] }
    if (!cloud.value.progress) cloud.value.progress = {}
    if (!Array.isArray(cloud.value.records)) cloud.value.records = []
  } catch (e) {
    loadError.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const onPapers = computed(() => bank.papers.filter((p) => p.status === 'on'))
const examPapers = computed(() => onPapers.value.filter((p) => p.kind !== 'training'))

function trainingQuestions(exam, type) {
  return bank.questions.filter((q) => q.exam === exam && q.type === type && q.status === 'on')
}

// ── 进度读写 ──
let saveTimer = null
let dirty = false
function markDirty() { dirty = true }
async function saveCloud() {
  if (!dirty || !cloud.value) return
  dirty = false
  try {
    await post(USER_API, { action: 'dataPut', key: 'cet', value: cloud.value })
  } catch (e) {
    dirty = true // 失败下次重试
  }
}
function scheduleSave() {
  markDirty()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCloud, 1500)
}
let heartbeat = null

// ── 考试运行态 ──
const run = reactive({
  paper: null, // { id,name,exam,kind,sections:[{type,name,durationSec,qids}],questionIds }
  questions: [], // 展开后的题目对象（按分区顺序）
  secIdx: 0,
  answers: {}, // qid -> value
  leftSec: 0, // 当前分区剩余秒
  startedAt: 0,
  submitting: false,
})

const curSec = computed(() => (run.paper && run.paper.sections[run.secIdx]) || null)
const curQs = computed(() => (curSec.value ? curSec.value.qids.map((id) => qMap.value[id]).filter(Boolean) : []))
const qMap = computed(() => {
  const m = {}
  for (const q of bank.questions) m[q.id] = q
  return m
})
const answeredCnt = computed(() => Object.values(run.answers).filter((v) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).length)

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function buildRun(paper) {
  run.paper = paper
  run.questions = paper.questionIds.map((id) => qMap.value[id]).filter(Boolean)
  run.secIdx = 0
  run.leftSec = (paper.sections[0] && paper.sections[0].durationSec) || 0
  run.startedAt = Date.now()
  run.submitting = false
}

function startPaper(p) {
  const prog = cloud.value.progress[p.id]
  if (prog && !prog.submitted) {
    // 断点续考
    run.paper = p
    run.questions = p.questionIds.map((id) => qMap.value[id]).filter(Boolean)
    run.answers = prog.answers || {}
    run.secIdx = Math.min(prog.secIdx || 0, p.sections.length - 1)
    run.leftSec = Math.max(1, Number(prog.leftSec) || p.sections[run.secIdx].durationSec || 1)
    run.startedAt = prog.startedAt || Date.now()
    run.submitting = false
  } else {
    run.answers = {}
    buildRun(p)
    cloud.value.progress[p.id] = snapshot()
    scheduleSave()
  }
  view.value = 'running'
  startHeartbeat()
}

function startTraining(exam, type) {
  const qs = trainingQuestions(exam, type)
  if (!qs.length) return
  const p = {
    id: 'train-' + exam + '-' + type + '-' + Date.now(),
    name: EXAM_LABEL[exam] + ' · ' + TYPE_LABEL[type] + '训练',
    exam, kind: 'training',
    sections: [{ type, name: TYPE_LABEL[type] + '训练', durationSec: 0, qids: qs.map((q) => q.id) }],
    questionIds: qs.map((q) => q.id),
  }
  run.answers = {}
  buildRun(p)
  cloud.value.progress[p.id] = snapshot()
  scheduleSave()
  view.value = 'running'
  startHeartbeat()
}

function snapshot() {
  return {
    answers: run.answers,
    secIdx: run.secIdx,
    leftSec: run.leftSec,
    startedAt: run.startedAt,
    submitted: false,
    updatedAt: Date.now(),
  }
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeat = setInterval(() => {
    if (run.paper && view.value === 'running') {
      if (run.leftSec > 0) run.leftSec--
      // 保存进度（含倒计时）
      if (run.paper.kind !== 'training') {
        cloud.value.progress[run.paper.id] = snapshot()
        scheduleSave()
        // 分区时间到
        if (run.leftSec <= 0) onSectionTimeout()
      }
    }
  }, 1000)
}
function stopHeartbeat() { if (heartbeat) { clearInterval(heartbeat); heartbeat = null } }

function onSectionTimeout() {
  const p = run.paper
  if (!p) return
  if (run.secIdx < p.sections.length - 1) {
    run.secIdx++
    run.leftSec = p.sections[run.secIdx].durationSec || 0
    cloud.value.progress[p.id] = snapshot()
    scheduleSave()
  } else {
    doSubmit(true) // 强制交卷
  }
}

function setAnswer(qid, val) {
  run.answers[qid] = val
  cloud.value.progress[run.paper.id] = snapshot()
  scheduleSave()
}

// ── 交卷 ──
function norm(v) {
  if (Array.isArray(v)) return v.slice().sort().join('|')
  return String(v == null ? '' : v).trim()
}
function isObjective(q) { return OBJ_TYPES.includes(q.type) }
function judge(q) {
  const mine = run.answers[q.id]
  if (mine === undefined || mine === '' || (Array.isArray(mine) && !mine.length)) return 'empty'
  return norm(mine) === norm(q.answer) ? 'right' : 'wrong'
}

const result = reactive({ paper: null, answers: {}, selfScores: {}, submittedAt: 0, forced: false })

function doSubmit(forced) {
  if (run.submitting || !run.paper) return
  run.submitting = true
  const p = run.paper
  // 自评分默认取 0，客观题自动算
  const selfScores = {}
  let auto = 0
  let total = 0
  for (const q of run.questions) {
    total += Number(q.score) || 0
    if (isObjective(q)) {
      if (judge(q) === 'right') {
        auto += Number(q.score) || 0
        selfScores[q.id] = Number(q.score) || 0
      } else selfScores[q.id] = 0
    } else {
      selfScores[q.id] = 0
    }
  }
  result.paper = p
  result.answers = JSON.parse(JSON.stringify(run.answers))
  result.selfScores = selfScores
  result.submittedAt = Date.now()
  result.forced = !!forced
  // 记录归集（防重：同一张卷同一 startedAt 只记一次）
  const rec = {
    paperId: p.id,
    paperName: p.name,
    exam: p.exam,
    kind: p.kind,
    autoScore: auto,
    total,
    startedAt: run.startedAt,
    submittedAt: result.submittedAt,
    forced: !!forced,
    answers: JSON.parse(JSON.stringify(run.answers)),
  }
  const exists = cloud.value.records.some((r) => r.paperId === rec.paperId && r.startedAt === rec.startedAt)
  if (!exists) {
    cloud.value.records.unshift(rec)
    if (cloud.value.records.length > 20) cloud.value.records.length = 20
  }
  delete cloud.value.progress[p.id]
  markDirty()
  saveCloud()
  stopHeartbeat()
  view.value = 'result'
  window.scrollTo(0, 0)
}

// 主观题自评后计入总分
const finalScore = computed(() => {
  let s = 0
  for (const q of run.questions.length && result.paper ? result.paper.questionIds.map((id) => qMap.value[id]).filter(Boolean) : []) {
    s += Number(result.selfScores[q.id]) || 0
  }
  return s
})
const resultQs = computed(() => (result.paper ? result.paper.questionIds.map((id) => qMap.value[id]).filter(Boolean) : []))

function backLobby() {
  result.paper = null
  view.value = 'lobby'
  loadAll()
}

// 异常退出恢复提示
function beforeUnload(e) {
  if (view.value === 'running' && run.paper && !run.submitting) {
    cloud.value && (cloud.value.progress[run.paper.id] = snapshot())
    saveCloud()
    e.preventDefault()
    e.returnValue = ''
  }
}

watch(loggedIn, (v) => { if (v) loadAll() })

onMounted(async () => {
  await restoreUser()
  if (loggedIn.value) await loadAll()
  else loading.value = false
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  stopHeartbeat()
  window.removeEventListener('beforeunload', beforeUnload)
  saveCloud()
})

const secName = (t) => TYPE_LABEL[t] || t

// 结果态判分（基于 result.answers）
const normAns = (v) => (Array.isArray(v) ? v.slice().sort().join('|') : String(v == null ? '' : v).trim())
function judgeWith(q) {
  const mine = result.answers[q.id]
  if (mine === undefined || mine === '' || (Array.isArray(mine) && !mine.length)) return 'empty'
  return normAns(mine) === normAns(q.answer) ? 'right' : 'wrong'
}
function showAnswer(v) {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.join('、')
  return String(v)
}
</script>

<template>
  <div class="cet">
    <!-- 未登录：引导登录 -->
    <div v-if="!loggedIn" class="cet-gate">
      <p class="cet-gate-t">四六级模拟考场的作答记录与断点续考都绑定你的账号，请先登录。</p>
      <AuthPanel @authed="loadAll" />
    </div>

    <ArLoading v-else-if="loading" text="正在加载考场数据…" />
    <ArError v-else-if="loadError" :title="'考场数据没能加载出来'" :desc="loadError">
      <template #retry><ArBtn variant="ghost" size="sm" @click="loadAll">重新加载</ArBtn></template>
    </ArError>

    <template v-else-if="view === 'lobby'">
      <div v-if="!bank.config.enabled" class="cet-off">
        <ArError title="模拟考暂未开放" desc="请关注站内通知，开放时间由管理员配置。" />
      </div>
      <template v-else>
        <p v-if="bank.config.announce" class="cet-announce">{{ bank.config.announce }}</p>

        <!-- 模式切换 -->
        <div class="cet-modes">
          <button class="cet-mode" :class="{ on: mode === 'exam' }" @click="mode = 'exam'">全程模拟考</button>
          <button class="cet-mode" :class="{ on: mode === 'training' }" @click="mode = 'training'">单项题型训练</button>
        </div>

        <!-- 模拟考：试卷列表 -->
        <section v-if="mode === 'exam'" class="cet-sec">
          <template v-if="examPapers.length">
            <div v-for="p in examPapers" :key="p.id" class="cet-paper">
              <div class="cet-paper-main">
                <b class="cet-paper-name">{{ p.name }}</b>
                <span class="cet-paper-meta">
                  {{ EXAM_LABEL[p.exam] }} · {{ p.sections.map((s) => secName(s.type)).join('→') }} ·
                  共 {{ p.questionIds.length }} 题 · {{ fmt(p.durationSec) }}
                </span>
              </div>
              <ArBtn
                v-if="cloud.progress[p.id] && !cloud.progress[p.id].submitted"
                variant="primary" size="sm"
                @click="startPaper(p)"
              >继续作答（剩 {{ fmt(cloud.progress[p.id].leftSec) }}）</ArBtn>
              <ArBtn v-else variant="primary" size="sm" @click="startPaper(p)">进入考试</ArBtn>
            </div>
          </template>
          <ArEmpty v-else icon="📝" title="还没有上架的模拟卷">
            工作人员在后台录入题目并组卷上架后，这里会出现试卷。
          </ArEmpty>
        </section>

        <!-- 训练：选考试+题型 -->
        <section v-else class="cet-sec">
          <div class="cet-train-opts">
            <label v-for="e in ['cet4', 'cet6']" :key="e" class="cet-radio">
              <input type="radio" name="cet-exam" :value="e" v-model="trainingExam" /> {{ EXAM_LABEL[e] }}
            </label>
            <span v-for="t in Object.keys(TYPE_LABEL)" :key="t" style="margin-left:10px">
              <ArBadge :tone="t === trainingType ? 'brand' : 'neutral'" style="cursor:pointer" @click="trainingType = t">
                {{ TYPE_LABEL[t] }}（{{ trainingQuestions(trainingExam, t).length }}）
              </ArBadge>
            </span>
          </div>
          <ArBtn
            variant="primary" size="md"
            :disabled="!trainingQuestions(trainingExam, trainingType).length"
            @click="startTraining(trainingExam, trainingType)"
          >开始{{ EXAM_LABEL[trainingExam] }}{{ TYPE_LABEL[trainingType] }}训练（不限时）</ArBtn>
        </section>

        <!-- 成绩记录 -->
        <section v-if="cloud.records.length" class="cet-sec">
          <h3 class="cet-h">历史成绩</h3>
          <div v-for="(r, i) in cloud.records" :key="i" class="cet-rec">
            <span class="cet-rec-name">{{ r.paperName }}</span>
            <span class="cet-rec-meta">{{ EXAM_LABEL[r.exam] }} · 客观题 {{ r.autoScore }} 分{{ r.forced ? ' · 到时强制交卷' : '' }}</span>
            <span class="cet-rec-time">{{ new Date(r.submittedAt).toLocaleString() }}</span>
          </div>
        </section>
      </template>
    </template>

    <!-- ══════ 考试页 ══════ -->
    <div v-else-if="view === 'running' && run.paper" class="cet-run">
      <header class="cet-run-head">
        <div class="cet-run-info">
          <b>{{ run.paper.name }}</b>
          <span class="cet-run-sec">{{ curSec ? curSec.name : '' }}</span>
        </div>
        <div class="cet-run-timer" :class="{ danger: run.leftSec <= 300 && run.paper.kind !== 'training' }">
          <template v-if="run.paper.kind !== 'training'">⏱ {{ fmt(run.leftSec) }}</template>
          <template v-else>不限时 · 已答 {{ answeredCnt }}/{{ run.questions.length }}</template>
        </div>
      </header>

      <!-- 分区进度条 -->
      <div class="cet-secbar">
        <button
          v-for="(s, i) in run.paper.sections" :key="i"
          class="cet-secbtn" :class="{ on: i === run.secIdx, done: i < run.secIdx }"
          :disabled="i > run.secIdx"
          @click="run.secIdx = i; run.leftSec = run.paper.sections[i].durationSec"
        >{{ secName(s.type) }}</button>
      </div>

      <!-- 当前分区题目 -->
      <div v-for="q in curQs" :key="q.id" class="cet-q">
        <p class="cet-q-stem">
          <ArBadge tone="info">{{ TYPE_LABEL[q.type] }}</ArBadge>
          <ArBadge tone="neutral">{{ q.score }} 分</ArBadge>
          {{ q.stem }}
        </p>
        <audio v-if="q.audio" class="cet-q-audio" controls :src="q.audio" preload="auto"></audio>
        <!-- 客观单选 -->
        <div v-if="q.type === 'listening' || q.type === 'reading'" class="cet-opts">
          <label v-for="(opt, oi) in q.options || []" :key="oi" class="cet-opt" :class="{ on: run.answers[q.id] === String.fromCharCode(65 + oi) }">
            <input
              type="radio" :name="'q-' + q.id"
              :checked="run.answers[q.id] === String.fromCharCode(65 + oi)"
              @change="setAnswer(q.id, String.fromCharCode(65 + oi))"
            />
            <span>{{ String.fromCharCode(65 + oi) }}. {{ opt }}</span>
          </label>
          <textarea
            v-if="!(q.options && q.options.length)" class="cet-subj"
            rows="4" placeholder="在此作答" :value="run.answers[q.id] || ''"
            @input="setAnswer(q.id, $event.target.value)"
          ></textarea>
        </div>
        <!-- 主观题 -->
        <textarea
          v-else class="cet-subj" rows="8"
          placeholder="在此作答（交卷后对照参考范文自评）"
          :value="run.answers[q.id] || ''"
          @input="setAnswer(q.id, $event.target.value)"
        ></textarea>
      </div>

      <footer class="cet-run-foot">
        <ArBtn
          v-if="run.secIdx < run.paper.sections.length - 1"
          variant="primary" size="md"
          @click="run.secIdx++; run.leftSec = run.paper.sections[run.secIdx].durationSec; cloud.progress[run.paper.id] = snapshot(); scheduleSave()"
        >下一部分 →</ArBtn>
        <ArBtn
          v-else variant="primary" size="md" :loading="run.submitting"
          @click="doSubmit(false)"
        >交卷 · 查看解析</ArBtn>
      </footer>
    </div>

    <!-- ══════ 结果分屏 ══════ -->
    <div v-else-if="view === 'result' && result.paper" class="cet-result">
      <header class="cet-res-head">
        <b>{{ result.paper.name }}</b>
        <span class="cet-res-score">总分 <em>{{ finalScore }}</em></span>
        <span v-if="result.forced" class="cet-res-forced">（时间到，已自动交卷）</span>
        <ArBtn variant="ghost" size="sm" @click="backLobby">返回大厅</ArBtn>
      </header>

      <div class="cet-split">
        <!-- 左：试卷与作答 -->
        <div class="cet-col cet-col-left">
          <h4 class="cet-col-t">我的答卷</h4>
          <div v-for="q in resultQs" :key="q.id" class="cet-q">
            <p class="cet-q-stem">
              <ArBadge tone="info">{{ TYPE_LABEL[q.type] }}</ArBadge>
              <ArBadge :tone="isObjective(q) ? (judgeWith(q) === 'right' ? 'success' : judgeWith(q) === 'wrong' ? 'danger' : 'neutral') : 'warning'">
                {{ isObjective(q) ? (judgeWith(q) === 'right' ? '答对 +' + q.score : judgeWith(q) === 'wrong' ? '答错' : '未作答') : '待自评' }}
              </ArBadge>
              {{ q.stem }}
            </p>
            <p class="cet-myans">我的答案：<b>{{ showAnswer(result.answers[q.id]) || '（未作答）' }}</b></p>
            <div v-if="!isObjective(q)" class="cet-selfscore">
              自评得分：
              <input type="number" min="0" :max="q.score" v-model.number="result.selfScores[q.id]" />
              / {{ q.score }} 分
            </div>
          </div>
        </div>
        <!-- 右：解析 -->
        <div class="cet-col cet-col-right">
          <h4 class="cet-col-t">解析与得分说明</h4>
          <div v-for="q in resultQs" :key="q.id" class="cet-q">
            <p class="cet-q-stem">
              <ArBadge tone="info">{{ TYPE_LABEL[q.type] }}</ArBadge>
              {{ q.stem.slice(0, 40) }}{{ q.stem.length > 40 ? '…' : '' }}
            </p>
            <p class="cet-ans">正确答案：<b>{{ showAnswer(q.answer) }}</b></p>
            <p class="cet-ana">{{ q.analysis || '（暂无解析）' }}</p>
            <p v-if="q.traps" class="cet-trap">⚠️ 易错点：{{ q.traps }}</p>
            <p class="cet-score-note">本题 {{ q.score }} 分 · 难度 {{ '★'.repeat(q.difficulty) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.cet { max-width: 1100px; margin: 0 auto; font-family: var(--font-body); }
.cet-gate { max-width: 560px; margin: 0 auto; }
.cet-gate-t { text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.cet-off { max-width: 480px; margin: 0 auto; }
.cet-announce {
  background: var(--brand-pale); color: var(--brand);
  border-radius: 8px; padding: 8px 14px; font-size: 0.82rem; margin: 0 0 14px;
}
.cet-modes { display: flex; gap: 8px; margin-bottom: 14px; }
.cet-mode {
  flex: 1; padding: 12px 0; border-radius: 10px; border: 1px solid var(--line);
  background: var(--bg-card); font-size: 0.95rem; font-weight: 500; cursor: pointer;
  color: var(--text-body); font-family: inherit;
}
.cet-mode.on { border-color: var(--brand); color: var(--brand); background: var(--brand-pale); }
.cet-sec { margin-bottom: 20px; }
.cet-paper {
  display: flex; align-items: center; gap: 12px; justify-content: space-between;
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 10px;
}
.cet-paper-main { display: flex; flex-direction: column; gap: 4px; }
.cet-paper-name { font-size: 0.95rem; color: var(--text-heading); }
.cet-paper-meta { font-size: 0.78rem; color: var(--text-muted); }
.cet-train-opts { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; font-size: 0.88rem; }
.cet-radio { display: inline-flex; align-items: center; gap: 4px; }
.cet-h { font-size: 0.95rem; color: var(--text-heading); margin: 0 0 8px; }
.cet-rec {
  display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
  padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--line);
  border-radius: 10px; margin-bottom: 8px; font-size: 0.82rem;
}
.cet-rec-name { font-weight: 500; color: var(--text-heading); }
.cet-rec-meta { color: var(--brand); }
.cet-rec-time { margin-left: auto; color: var(--text-muted); font-size: 0.74rem; }

/* 考试页 */
.cet-run-head {
  display: flex; justify-content: space-between; align-items: center;
  position: sticky; top: 56px; z-index: 20;
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 16px; margin-bottom: 12px;
}
.cet-run-info { display: flex; flex-direction: column; gap: 2px; }
.cet-run-info b { font-size: 0.92rem; color: var(--text-heading); }
.cet-run-sec { font-size: 0.76rem; color: var(--text-muted); }
.cet-run-timer { font-family: var(--font-display); font-size: 1.25rem; color: var(--brand); }
.cet-run-timer.danger { color: var(--color-danger); }
.cet-secbar { display: flex; gap: 8px; margin-bottom: 14px; }
.cet-secbtn {
  flex: 1; padding: 8px 0; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg-card); cursor: pointer; font-family: inherit; font-size: 0.82rem;
  color: var(--text-muted);
}
.cet-secbtn.done { border-color: var(--color-success); color: var(--color-success); }
.cet-secbtn.on { border-color: var(--brand); color: var(--brand); background: var(--brand-pale); font-weight: 500; }
.cet-q {
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px;
  padding: 16px; margin-bottom: 12px;
}
.cet-q-stem { margin: 0 0 10px; font-size: 0.92rem; line-height: 1.7; color: var(--text-heading); display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.cet-q-audio { width: 100%; margin-bottom: 10px; }
.cet-opts { display: flex; flex-direction: column; gap: 8px; }
.cet-opt {
  display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px;
  border: 1px solid var(--line); border-radius: 8px; cursor: pointer;
  font-size: 0.88rem; line-height: 1.6; color: var(--text-body);
}
.cet-opt.on { border-color: var(--brand); background: var(--brand-pale); color: var(--brand); }
.cet-subj {
  width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; font-family: inherit; font-size: 0.88rem; line-height: 1.7;
  background: var(--vp-c-bg); color: var(--text-heading); resize: vertical;
}
.cet-run-foot { display: flex; justify-content: flex-end; padding: 6px 0 20px; }

/* 结果分屏 */
.cet-res-head {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 18px; margin-bottom: 14px;
}
.cet-res-head b { font-size: 1rem; color: var(--text-heading); }
.cet-res-score { color: var(--text-muted); font-size: 0.88rem; }
.cet-res-score em { font-style: normal; font-size: 1.4rem; color: var(--brand); font-weight: 700; }
.cet-res-forced { color: var(--color-warning); font-size: 0.8rem; }
.cet-res-head .ar-btn { margin-left: auto; }
.cet-split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.cet-col-t { margin: 0 0 10px; font-size: 0.9rem; color: var(--text-heading); }
.cet-myans { font-size: 0.84rem; color: var(--text-body); margin: 0 0 6px; word-break: break-all; }
.cet-selfscore { font-size: 0.82rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.cet-selfscore input {
  width: 64px; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px;
  font-family: inherit; background: var(--vp-c-bg); color: var(--text-heading);
}
.cet-ans { font-size: 0.84rem; color: var(--color-success); margin: 0 0 6px; word-break: break-all; }
.cet-ana { font-size: 0.84rem; color: var(--text-body); line-height: 1.8; margin: 0 0 6px; white-space: pre-wrap; }
.cet-trap { font-size: 0.8rem; color: var(--color-warning); margin: 0 0 6px; }
.cet-score-note { font-size: 0.74rem; color: var(--text-muted); margin: 0; }

@media (max-width: 860px) {
  .cet-split { grid-template-columns: 1fr; }
}
.dark .cet-mode, .dark .cet-paper, .dark .cet-rec, .dark .cet-q,
.dark .cet-run-head, .dark .cet-secbtn, .dark .cet-res-head {
  background: #151b1a; border-color: #2c3331;
}
.dark .cet-subj { background: #0f1514; border-color: #2c3331; }
.dark .cet-opt { border-color: #2c3331; }
</style>
