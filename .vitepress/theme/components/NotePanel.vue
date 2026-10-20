<script setup lang="ts">
// 课程笔记
// ------------------------------------------------------------------
// 方案 1.2「课程笔记」：资料是别人的，理解是自己的。
//
// 原设计是「资料预览页选中文字 → 存为摘录」。本站资料预览走 COS 域名 iframe，
// 跨域导致 window.getSelection() 拿不到预览区内的选区，所以这里降级为：
//   课程笔记编辑区 + 手动粘贴摘录 + 导出 Markdown + 一键转自测卡
// 页面上如实说明这一限制，不假装支持划词。
//
// SSR 安全：setup 顶层不碰 window / localStorage / fetch，全部放在 onMounted。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { KEYS, read, write, storageInfo, formatBytes, todayISO } from '../lib/storage'
import { trackFootprint } from '../lib/footprint'

interface NoteItem {
  id: string
  course: string
  code?: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
  tags?: string[]
  cards?: number
}

interface NoteStore {
  items: NoteItem[]
}

interface Course {
  code: string
  name: string
}

interface CardStore {
  custom: Array<Record<string, unknown>>
  states: Record<string, unknown>
}

const notes = ref<NoteItem[]>([])
const courses = ref<Course[]>([])
const coursesLoading = ref(true)
const coursesError = ref(false)

// 编辑态
const editing = ref(false) // false = 列表；true = 编辑器打开
const editingId = ref('') // '' 新建；否则为笔记 id
const draftCourse = ref<Course | null>(null)
const draftTitle = ref('')
const draftBody = ref('')
const dirty = ref(false)

// 课程选择器
const courseQuery = ref('')
const courseOpen = ref(false)
const pickerEl = ref<HTMLElement | null>(null)

// 列表态
const searchQuery = ref('')
const groupMode = ref<'time' | 'course'>('time')
const confirmId = ref('')

const toast = ref('')
let toastTimer = 0

const notesBytes = ref(0)

/* ───────────── 极简 Markdown 渲染（全部先转义，防 XSS） ───────────── */

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 行内元素：行内 `code`、**粗体**。传入原文，内部先整体转义 */
function renderInline(raw: string): string {
  const escaped = escapeHtml(raw)
  const codes: string[] = []
  // 先把行内代码抽出来，避免 **code** 之类的字符被后续规则误伤
  const withTokens = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })
  const withBold = withTokens.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  return withBold.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`)
}

/**
 * 块级渲染：`# ## ###` 标题、`- ` / `* ` 列表、空行分段、单行换行转 <br>、
 * ``` 代码块。所有用户输入都经 escapeHtml，输出只含白名单标签。
 */
function renderMarkdown(src: string): string {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let list: string[] = []
  let para: string[] = []
  let inCode = false
  let codeBuf: string[] = []

  const flushList = () => {
    if (!list.length) return
    out.push('<ul>' + list.map((li) => `<li>${renderInline(li)}</li>`).join('') + '</ul>')
    list = []
  }
  const flushPara = () => {
    if (!para.length) return
    out.push('<p>' + para.map((l) => renderInline(l)).join('<br>') + '</p>')
    para = []
  }
  const flushAll = () => {
    flushList()
    flushPara()
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
        codeBuf = []
        inCode = false
      } else {
        flushAll()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    const text = line.trim()
    if (!text) {
      flushAll()
      continue
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(text)
    if (h) {
      flushAll()
      const level = h[1].length
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`)
      continue
    }

    const li = /^[-*]\s+(.*)$/.exec(text)
    if (li) {
      flushPara()
      list.push(li[1])
      continue
    }

    flushList()
    para.push(text)
  }

  if (inCode && codeBuf.length) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }
  flushAll()
  return out.join('\n')
}

/* ───────────── 工具 ───────────── */

function wordCount(text: string): number {
  return (String(text || '').match(/\S/g) || []).length
}

function excerpt(text: string, max = 90): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

function fmtDate(ts: number, withTime = false): string {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (!withTime) return `${y}-${m}-${day}`
  return `${y}-${m}-${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function newId(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function safeName(s: string): string {
  return String(s || '未命名')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
    toastTimer = 0
  }, 2600)
}

function refreshBytes() {
  const hit = storageInfo().items.find((it) => it.key === KEYS.notes)
  notesBytes.value = hit ? hit.bytes : 0
}

function persist(items: NoteItem[]): boolean {
  const ok = write(KEYS.notes, { items })
  if (ok) {
    notes.value = items
    refreshBytes()
  }
  return ok
}

/* ───────────── 数据加载 ───────────── */

function loadNotes() {
  const store = read<NoteStore>(KEYS.notes, { items: [] })
  const items = Array.isArray(store?.items) ? store.items : []
  notes.value = items.filter((n) => n && n.id && typeof n.body === 'string')
  refreshBytes()
}

async function loadCourses() {
  try {
    const res = await fetch('/data/courses.json', { cache: 'force-cache' })
    if (!res.ok) throw new Error(String(res.status))
    const raw = (await res.json()) as unknown
    if (!Array.isArray(raw)) throw new Error('bad payload')
    const seen = new Set<string>()
    const list: Course[] = []
    for (const it of raw as Array<Record<string, unknown>>) {
      const code = String(it?.code ?? '').trim()
      const name = String(it?.name ?? '').trim()
      if (!name) continue
      const key = `${code}|${name}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ code, name })
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    courses.value = list
  } catch {
    coursesError.value = true
  } finally {
    coursesLoading.value = false
  }
}

/* ───────────── 课程选择 ───────────── */

const filteredCourses = computed(() => {
  const q = courseQuery.value.trim().toLowerCase()
  if (!q) return courses.value.slice(0, 40)
  return courses.value
    .filter((c) => c.name.toLowerCase().includes(q) || c.code.includes(q))
    .slice(0, 40)
})

function pickCourse(c: Course) {
  draftCourse.value = { code: c.code, name: c.name }
  courseQuery.value = ''
  courseOpen.value = false
  dirty.value = true
  if (!draftTitle.value.trim()) draftTitle.value = `${c.name} ${todayISO()}`
}

function pickCustomCourse() {
  const name = courseQuery.value.trim()
  if (!name) return
  draftCourse.value = { code: '', name }
  courseQuery.value = ''
  courseOpen.value = false
  dirty.value = true
  if (!draftTitle.value.trim()) draftTitle.value = `${name} ${todayISO()}`
}

function clearCourse() {
  draftCourse.value = null
  courseQuery.value = ''
  courseOpen.value = false
  dirty.value = true
}

function pickFirstCourse() {
  if (filteredCourses.value.length) pickCourse(filteredCourses.value[0])
  else pickCustomCourse()
}

function onDocPointerDown(e: MouseEvent) {
  if (!courseOpen.value) return
  const el = pickerEl.value
  if (el && e.target instanceof Node && !el.contains(e.target)) courseOpen.value = false
}

/* ───────────── 新建 / 编辑 ───────────── */

function resetDraft() {
  draftCourse.value = null
  draftTitle.value = ''
  draftBody.value = ''
  courseQuery.value = ''
  courseOpen.value = false
  dirty.value = false
}

function startNew() {
  if (dirty.value && !window.confirm('当前笔记还没保存，确定放弃吗？')) return
  editingId.value = ''
  resetDraft()
  editing.value = true
  confirmId.value = ''
  if (courses.value.length === 0 && !coursesLoading.value) courseOpen.value = true
  nextTick(() => {
    const el = document.getElementById('np-title')
    if (el) el.focus()
  })
}

function startEdit(n: NoteItem) {
  if (dirty.value && !window.confirm('当前笔记还没保存，确定放弃吗？')) return
  editingId.value = n.id
  draftCourse.value = n.course ? { code: n.code || '', name: n.course } : null
  draftTitle.value = n.title || ''
  draftBody.value = n.body || ''
  courseQuery.value = ''
  courseOpen.value = false
  dirty.value = false
  confirmId.value = ''
  editing.value = true
  nextTick(() => {
    const el = document.getElementById('np-body')
    if (el) el.focus()
  })
}

function closeEditor() {
  if (dirty.value && !window.confirm('内容还没保存，确定关闭吗？')) return
  editing.value = false
  editingId.value = ''
  resetDraft()
}

function saveNote() {
  // 用户只在课程框里打了字、没点下拉项时，也认这个课程名
  if (!draftCourse.value && courseQuery.value.trim()) pickCustomCourse()
  const body = draftBody.value.trim()
  if (!draftCourse.value) {
    showToast('先选一门课，笔记才好归档')
    return
  }
  if (!body) {
    showToast('正文还是空的，写一句也行')
    return
  }
  const title = draftTitle.value.trim() || `${draftCourse.value.name} ${todayISO()}`
  const now = Date.now()
  const cur = read<NoteStore>(KEYS.notes, { items: [] })
  const items = Array.isArray(cur?.items) ? [...cur.items] : [...notes.value]
  let saved: NoteItem | null = null

  if (editingId.value) {
    const idx = items.findIndex((n) => n.id === editingId.value)
    if (idx >= 0) {
      const prev = items[idx]
      saved = {
        ...prev,
        course: draftCourse.value.name,
        code: draftCourse.value.code || undefined,
        title,
        body,
        updatedAt: now,
      }
      items[idx] = saved
    }
  }
  if (!saved) {
    saved = {
      id: newId(),
      course: draftCourse.value.name,
      code: draftCourse.value.code || undefined,
      title,
      body,
      createdAt: now,
      updatedAt: now,
      cards: 0,
    }
    items.unshift(saved)
  }

  if (!persist(items)) {
    showToast('保存失败：本地存储被禁用或已满')
    return
  }

  trackFootprint({
    kind: 'note',
    course: saved.course,
    code: saved.code,
    ref: saved.title,
    n: wordCount(saved.body),
  })
  editing.value = false
  editingId.value = ''
  resetDraft()
  showToast('已保存')
}

/* ───────────── 列表 / 搜索 / 分组 ───────────── */

const sortedNotes = computed(() => [...notes.value].sort((a, b) => b.updatedAt - a.updatedAt))

const filteredNotes = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return sortedNotes.value
  return sortedNotes.value.filter((n) => {
    return (
      String(n.title).toLowerCase().includes(q) ||
      String(n.body).toLowerCase().includes(q) ||
      String(n.course).toLowerCase().includes(q) ||
      String(n.code || '').includes(q)
    )
  })
})

const groupedByCourse = computed(() => {
  const map = new Map<string, NoteItem[]>()
  for (const n of filteredNotes.value) {
    const key = n.course || '未归档'
    const arr = map.get(key)
    if (arr) arr.push(n)
    else map.set(key, [n])
  }
  return [...map.entries()]
    .map(([course, items]) => ({
      key: course,
      title: course,
      items,
      lastAt: items.reduce((m, n) => Math.max(m, n.updatedAt), 0),
    }))
    .sort((a, b) => b.lastAt - a.lastAt)
})

const viewGroups = computed(() => {
  if (groupMode.value === 'course') return groupedByCourse.value
  if (!filteredNotes.value.length) return []
  return [{ key: '_all', title: '', items: filteredNotes.value, lastAt: 0 }]
})

const courseCount = computed(() => new Set(notes.value.map((n) => n.course).filter(Boolean)).size)
const sizeText = computed(() => formatBytes(notesBytes.value))

const canSave = computed(() => !!draftCourse.value && draftBody.value.trim().length > 0)
const previewHtml = computed(() => renderMarkdown(draftBody.value))
const draftWords = computed(() => wordCount(draftBody.value))

/* ───────────── 删除 ───────────── */

function askDelete(n: NoteItem) {
  confirmId.value = confirmId.value === n.id ? '' : n.id
}

function doDelete(n: NoteItem) {
  const items = notes.value.filter((x) => x.id !== n.id)
  confirmId.value = ''
  if (!persist(items)) {
    showToast('删除失败：本地存储不可用')
    return
  }
  showToast('已删除')
}

/* ───────────── 导出 ───────────── */

function downloadText(filename: string, text: string) {
  if (typeof document === 'undefined') return
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function noteToMarkdown(n: NoteItem): string {
  const head = [
    `# ${n.title}`,
    '',
    `- 课程：${n.course}${n.code ? `（${n.code}）` : ''}`,
    `- 更新时间：${fmtDate(n.updatedAt, true)}`,
  ]
  if (n.tags && n.tags.length) head.push(`- 标签：${n.tags.join(' / ')}`)
  return [...head, '', '---', '', n.body || ''].join('\n')
}

function exportOne(n: NoteItem) {
  const filename = `${safeName(n.course)}-${safeName(n.title)}.md`
  downloadText(filename, noteToMarkdown(n) + '\n')
  showToast(`已导出 ${filename}`)
}

function exportAll() {
  if (!notes.value.length) return
  const groups = new Map<string, NoteItem[]>()
  const items = [...notes.value].sort((a, b) => {
    const c = String(a.course).localeCompare(String(b.course), 'zh-Hans-CN')
    return c !== 0 ? c : b.updatedAt - a.updatedAt
  })
  for (const n of items) {
    const key = n.course || '未归档'
    const arr = groups.get(key)
    if (arr) arr.push(n)
    else groups.set(key, [n])
  }
  const lines: string[] = []
  for (const [course, list] of groups) {
    lines.push(`# ${course}`, '')
    for (const n of list) {
      lines.push(`## ${n.title}`, '')
      lines.push(`> ${fmtDate(n.updatedAt, true)} · ${wordCount(n.body)} 字`, '')
      lines.push(n.body || '', '')
    }
  }
  const filename = `课程笔记-${todayISO()}.md`
  downloadText(filename, lines.join('\n').trimEnd() + '\n')
  showToast(`已导出 ${notes.value.length} 条笔记`)
}

/* ───────────── 转自测卡 ───────────── */

function makeCard(n: NoteItem) {
  // 读-改-写：kx_cards_v1 同时被自测卡组件使用，绝不能直接覆盖
  const cur = read<CardStore>(KEYS.cards, { custom: [], states: {} })
  const custom = Array.isArray(cur?.custom) ? cur.custom : []
  const states = cur && typeof cur.states === 'object' && cur.states ? cur.states : {}
  const cardId = `note_${n.id}`
  const card = {
    id: cardId,
    course: n.course,
    front: n.title,
    back: String(n.body || '').trim().slice(0, 200),
    tag: '我的笔记',
    createdAt: Date.now(),
    state: {},
  }
  const next: CardStore = {
    ...cur,
    custom: [card, ...custom.filter((c) => c && (c as Record<string, unknown>).id !== cardId)],
    states,
  }
  if (!write(KEYS.cards, next)) {
    showToast('转卡片失败：本地存储被禁用或已满')
    return
  }

  // 记录该笔记已转卡片数
  const items = notes.value.map((x) =>
    x.id === n.id ? { ...x, cards: (x.cards || 0) + 1, updatedAt: x.updatedAt } : x
  )
  persist(items)
  trackFootprint({ kind: 'card', course: n.course, code: n.code, ref: n.title, n: 1 })
  showToast('已转成一张自测卡，去「自测卡」里复习')
}

/* ───────────── textarea 里的 Tab ───────────── */

function onTab(e: KeyboardEvent) {
  const el = e.target as HTMLTextAreaElement | null
  if (!el) return
  e.preventDefault()
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? start
  const value = draftBody.value
  draftBody.value = value.slice(0, start) + '  ' + value.slice(end)
  dirty.value = true
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + 2
  })
}

/* ───────────── 生命周期 ───────────── */

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  loadNotes()
  loadCourses()
  document.addEventListener('mousedown', onDocPointerDown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointerDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (toastTimer) window.clearTimeout(toastTimer)
})
</script>

<template>
  <div class="note-panel">
    <div class="np-bar">
      <div class="np-stats">
        <span><b>{{ notes.length }}</b> 条笔记</span>
        <span class="np-sep">·</span>
        <span>覆盖 <b>{{ courseCount }}</b> 门课</span>
        <span class="np-sep">·</span>
        <span>占用 {{ sizeText }}</span>
      </div>
      <button v-if="!editing" class="np-btn np-btn-primary" @click="startNew">
        新建笔记
      </button>
    </div>

    <p class="np-notice">
      受浏览器跨域限制，资料预览区内的文字无法自动捕获；把要点粘到这里，效果一样。
    </p>

    <p v-if="toast" class="np-toast">{{ toast }}</p>

    <!-- 编辑区 -->
    <section v-if="editing" class="np-editor">
      <header class="np-editor-head">
        <span class="np-editor-mode">{{ editingId ? '编辑笔记' : '新建笔记' }}</span>
        <span v-if="dirty" class="np-dirty">未保存</span>
      </header>

      <div class="np-field">
        <label class="np-label" for="np-course">课程</label>
        <div ref="pickerEl" class="np-course">
          <template v-if="draftCourse">
            <span class="np-chip">
              {{ draftCourse.name }}
              <em v-if="draftCourse.code">{{ draftCourse.code }}</em>
            </span>
            <button class="np-link" type="button" @click="clearCourse">更换</button>
          </template>
          <template v-else>
            <input
              id="np-course"
              v-model="courseQuery"
              class="np-input"
              type="text"
              placeholder="输入课程名或课程代码筛选…"
              autocomplete="off"
              @focus="courseOpen = true"
              @keydown.enter.prevent="pickFirstCourse"
              @keydown.esc="courseOpen = false"
            />
            <ul v-if="courseOpen" class="np-course-list">
              <li v-for="c in filteredCourses" :key="`${c.code}|${c.name}`" @click="pickCourse(c)">
                <span class="np-c-name">{{ c.name }}</span>
                <span class="np-c-code">{{ c.code }}</span>
              </li>
              <li v-if="courseQuery.trim()" class="np-c-custom" @click="pickCustomCourse">
                使用「{{ courseQuery.trim() }}」作为课程名
              </li>
              <li v-if="coursesLoading" class="np-c-empty">课程列表加载中…</li>
              <li v-else-if="coursesError" class="np-c-empty">课程列表加载失败，可直接输入课程名</li>
              <li v-else-if="!filteredCourses.length" class="np-c-empty">没有匹配的课程</li>
            </ul>
          </template>
        </div>
      </div>

      <div class="np-field">
        <label class="np-label" for="np-title">标题</label>
        <input
          id="np-title"
          v-model="draftTitle"
          class="np-input"
          type="text"
          placeholder="例如：第三章 轴系零件 — 没听懂的那句话"
          @input="dirty = true"
        />
      </div>

      <div class="np-split">
        <div class="np-field np-field-grow">
          <label class="np-label" for="np-body">
            正文
            <span class="np-label-note">{{ draftWords }} 字 · 支持 # 标题、- 列表、**粗体**、`code`</span>
          </label>
          <textarea
            id="np-body"
            v-model="draftBody"
            class="np-textarea"
            rows="14"
            spellcheck="false"
            placeholder="把课上没听懂的那句话、自己的理解、要问老师的问题写在这里。&#10;&#10;## 疑问&#10;- 为什么阶梯轴的过渡圆角要取这么大？"
            @input="dirty = true"
            @keydown.tab.prevent="onTab"
          ></textarea>
        </div>

        <div class="np-field np-preview-wrap">
          <span class="np-label">预览</span>
          <div v-if="draftBody.trim()" class="np-preview" v-html="previewHtml"></div>
          <div v-else class="np-preview np-preview-empty">开始输入，这里会同步渲染。</div>
        </div>
      </div>

      <div class="np-actions">
        <button class="np-btn np-btn-primary" :disabled="!canSave" @click="saveNote">
          保存笔记
        </button>
        <button class="np-btn" @click="closeEditor">取消</button>
        <span class="np-tip">笔记只存在这台设备，不上传、不排名。</span>
      </div>
    </section>

    <!-- 列表区 -->
    <template v-else>
      <div class="np-toolbar">
        <input
          v-model="searchQuery"
          class="np-input np-search"
          type="search"
          placeholder="搜索标题 / 正文 / 课程…"
        />
        <div class="np-seg">
          <button :class="['np-seg-btn', { 'is-active': groupMode === 'time' }]" @click="groupMode = 'time'">
            按时间
          </button>
          <button :class="['np-seg-btn', { 'is-active': groupMode === 'course' }]" @click="groupMode = 'course'">
            按课程
          </button>
        </div>
        <button v-if="notes.length" class="np-link" @click="exportAll">导出全部 Markdown</button>
      </div>

      <div v-if="!notes.length" class="np-empty">
        <p class="np-empty-title">还没有笔记。</p>
        <p>选一门课，把课上没听懂的那句话记下来 —— 下次回来就知道该问什么了。</p>
        <button class="np-btn np-btn-primary" @click="startNew">写下第一条</button>
      </div>

      <div v-else-if="!filteredNotes.length" class="np-empty">
        <p>没有匹配「{{ searchQuery }}」的笔记。</p>
      </div>

      <template v-else>
        <section v-for="g in viewGroups" :key="g.key" class="np-group">
          <h3 v-if="groupMode === 'course'" class="np-group-title">
            {{ g.title }}
            <span class="np-group-count">{{ g.items.length }} 条</span>
          </h3>
          <ul class="np-list">
            <li v-for="n in g.items" :key="n.id" class="np-item">
              <div class="np-item-main">
                <h4 class="np-item-title">{{ n.title }}</h4>
                <p class="np-item-meta">
                  <span v-if="groupMode === 'time'">{{ n.course }}</span>
                  <span>{{ fmtDate(n.updatedAt) }}</span>
                  <span>{{ wordCount(n.body) }} 字</span>
                  <span v-if="n.cards">{{ n.cards }} 张卡片</span>
                </p>
                <p class="np-item-excerpt">{{ excerpt(n.body) }}</p>

                <div v-if="confirmId === n.id" class="np-confirm">
                  <span>删除后无法恢复，确定？</span>
                  <button class="np-btn np-btn-danger" @click="doDelete(n)">删除</button>
                  <button class="np-btn" @click="confirmId = ''">取消</button>
                </div>
              </div>
              <div v-if="confirmId !== n.id" class="np-item-actions">
                <button class="np-link" @click="startEdit(n)">编辑</button>
                <button class="np-link" @click="makeCard(n)">转自测卡</button>
                <button class="np-link" @click="exportOne(n)">导出 MD</button>
                <button class="np-link np-link-danger" @click="askDelete(n)">删除</button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.note-panel {
  background: var(--vp-c-bg-soft, #f7f5f0);
  border: 1px solid var(--line, #e8e4db);
  border-radius: 14px;
  padding: 20px;
  color: var(--text-body, #4a5568);
}

.np-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.np-stats {
  font-size: 0.84rem;
  color: var(--text-muted, #64748b);
}
.np-stats b {
  color: var(--brand, #0d5c5a);
  font-variant-numeric: tabular-nums;
}
.np-sep {
  margin: 0 6px;
  color: var(--line, #e8e4db);
}

.np-notice {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-left: 3px solid var(--brand-pale, #e8f4f0);
  background: var(--brand-pale, #e8f4f0);
  border-radius: 0 8px 8px 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted, #64748b);
}

.np-toast {
  margin: 12px 0 0;
  font-size: 0.82rem;
  color: var(--brand, #0d5c5a);
}

.np-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 999px;
  background: transparent;
  color: var(--text-heading, #0d1e2b);
  font-size: 0.82rem;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.np-btn:hover {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}
.np-btn-primary {
  background: var(--brand, #0d5c5a);
  border-color: var(--brand, #0d5c5a);
  color: var(--brand-pale, #e8f4f0);
}
.np-btn-primary:hover {
  background: var(--brand, #0d5c5a);
  color: var(--vp-c-bg-soft, #f7f5f0);
}
.np-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--brand, #0d5c5a);
  color: var(--brand-pale, #e8f4f0);
}
.np-btn-danger {
  border-color: var(--brand, #0d5c5a);
  color: var(--brand, #0d5c5a);
}

.np-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--brand, #0d5c5a);
  font-size: 0.8rem;
  cursor: pointer;
}
.np-link:hover {
  text-decoration: underline;
}
.np-link-danger {
  color: var(--text-muted, #64748b);
}

/* 编辑区 */
.np-editor {
  margin-top: 16px;
  border-top: 1px solid var(--line, #e8e4db);
  padding-top: 16px;
}
.np-editor-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.np-editor-mode {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-heading, #0d1e2b);
}
.np-dirty {
  font-size: 0.72rem;
  color: var(--brand, #0d5c5a);
  background: var(--brand-pale, #e8f4f0);
  border-radius: 999px;
  padding: 2px 8px;
}

.np-field {
  margin-bottom: 14px;
}
.np-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted, #64748b);
  margin-bottom: 6px;
}
.np-label-note {
  font-weight: 400;
  color: var(--text-muted, #64748b);
  opacity: 0.8;
}

.np-input,
.np-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 10px;
  background: var(--vp-c-bg-soft, #f7f5f0);
  color: var(--text-heading, #0d1e2b);
  font-size: 0.88rem;
  padding: 9px 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.np-input:focus,
.np-textarea:focus {
  border-color: var(--brand, #0d5c5a);
}
.np-textarea {
  min-height: 260px;
  resize: vertical;
  line-height: 1.7;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.84rem;
}

/* 课程选择 */
.np-course {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.np-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--brand-pale, #e8f4f0);
  color: var(--brand, #0d5c5a);
  font-size: 0.84rem;
}
.np-chip em {
  font-style: normal;
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
}
.np-course-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--vp-c-bg-soft, #f7f5f0);
  border: 1px solid var(--line, #e8e4db);
  border-radius: 10px;
}
.np-course-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.84rem;
  cursor: pointer;
}
.np-course-list li:hover {
  background: var(--brand-pale, #e8f4f0);
}
.np-c-name {
  color: var(--text-heading, #0d1e2b);
}
.np-c-code {
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
  font-variant-numeric: tabular-nums;
}
.np-c-custom {
  color: var(--brand, #0d5c5a);
  border-top: 1px dashed var(--line, #e8e4db);
}
.np-course-list .np-c-empty {
  color: var(--text-muted, #64748b);
  font-size: 0.78rem;
  cursor: default;
}
.np-course-list .np-c-empty:hover {
  background: transparent;
}

/* 编辑双栏 */
.np-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.np-field-grow {
  min-width: 0;
}
.np-preview-wrap {
  min-width: 0;
}
.np-preview {
  border: 1px solid var(--line, #e8e4db);
  border-left: 3px solid var(--brand-pale, #e8f4f0);
  border-radius: 10px;
  padding: 10px 14px;
  min-height: 260px;
  max-height: 420px;
  overflow-y: auto;
  font-size: 0.86rem;
  line-height: 1.75;
  color: var(--text-body, #4a5568);
  overflow-wrap: anywhere;
}
.np-preview-empty {
  color: var(--text-muted, #64748b);
  font-size: 0.8rem;
}
.np-preview :deep(h1),
.np-preview :deep(h2),
.np-preview :deep(h3) {
  color: var(--text-heading, #0d1e2b);
  line-height: 1.4;
  margin: 0.6em 0 0.4em;
}
.np-preview :deep(h1) {
  font-size: 1.2rem;
}
.np-preview :deep(h2) {
  font-size: 1.06rem;
}
.np-preview :deep(h3) {
  font-size: 0.96rem;
}
.np-preview :deep(p) {
  margin: 0.45em 0;
}
.np-preview :deep(ul) {
  margin: 0.4em 0;
  padding-left: 1.2em;
  list-style: disc;
}
.np-preview :deep(li) {
  margin: 0.25em 0;
}
.np-preview :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82em;
  background: var(--brand-pale, #e8f4f0);
  color: var(--brand, #0d5c5a);
  padding: 1px 5px;
  border-radius: 4px;
}
.np-preview :deep(pre) {
  background: var(--vp-c-bg-soft, #f7f5f0);
  border: 1px solid var(--line, #e8e4db);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
}
.np-preview :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--text-body, #4a5568);
}
.np-preview :deep(strong) {
  color: var(--text-heading, #0d1e2b);
}

.np-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.np-tip {
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
}

/* 工具条 */
.np-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line, #e8e4db);
}
.np-search {
  flex: 1 1 220px;
  min-width: 0;
}
.np-seg {
  display: inline-flex;
  border: 1px solid var(--line, #e8e4db);
  border-radius: 999px;
  overflow: hidden;
}
.np-seg-btn {
  border: none;
  background: transparent;
  padding: 6px 14px;
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  cursor: pointer;
}
.np-seg-btn.is-active {
  background: var(--brand, #0d5c5a);
  color: var(--brand-pale, #e8f4f0);
}

/* 列表 */
.np-empty {
  margin-top: 20px;
  padding: 28px 20px;
  border: 1px dashed var(--line, #e8e4db);
  border-radius: 12px;
  text-align: center;
  font-size: 0.86rem;
  line-height: 1.8;
  color: var(--text-muted, #64748b);
}
.np-empty p {
  margin: 0 0 8px;
}
.np-empty-title {
  color: var(--text-heading, #0d1e2b);
  font-weight: 600;
}
.np-empty .np-btn {
  margin-top: 8px;
}

.np-group {
  margin-top: 22px;
}
.np-group-title {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--brand, #0d5c5a);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line, #e8e4db);
  margin: 0 0 10px;
}
.np-group-count {
  margin-left: 8px;
  font-weight: 400;
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
}

.np-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.np-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line, #e8e4db);
}
.np-item:last-child {
  border-bottom: none;
}
.np-item-main {
  min-width: 0;
  flex: 1 1 auto;
}
.np-item-title {
  margin: 0 0 4px;
  font-size: 0.94rem;
  font-weight: 600;
  color: var(--text-heading, #0d1e2b);
  line-height: 1.5;
}
.np-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0 0 6px;
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
}
.np-item-meta span:first-child {
  color: var(--brand, #0d5c5a);
}
.np-item-excerpt {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--text-body, #4a5568);
  overflow-wrap: anywhere;
}
.np-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  flex: 0 0 auto;
  padding-top: 2px;
}
.np-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}

@media (max-width: 640px) {
  .note-panel {
    padding: 14px;
  }
  .np-split {
    grid-template-columns: 1fr;
  }
  .np-preview {
    min-height: 160px;
    max-height: 320px;
  }
  .np-item {
    flex-direction: column;
    gap: 8px;
  }
  .np-item-actions {
    gap: 14px;
  }
  .np-toolbar {
    gap: 8px;
  }
  .np-search {
    flex: 1 1 100%;
  }
  .np-notice {
    font-size: 0.75rem;
  }
}
</style>
