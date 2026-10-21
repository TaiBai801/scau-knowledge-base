#!/usr/bin/env node
/**
 * 题库导入校验器
 * ------------------------------------------------------------------
 * 用途：内容线收到同学用 AI 生成的题库 JSON 后，先跑这个再导入后台。
 * 它按「题库生成提示词包 v1」的契约逐条检查，避免坏数据进库后判分错乱。
 *
 * 用法：
 *   node scripts/check-bank-import.mjs 题库-信号与系统.json
 *   node scripts/check-bank-import.mjs 题库-信号与系统.json --verbose
 *
 * 退出码：0 = 全部通过；1 = 有问题（明细见输出）
 */
import fs from 'node:fs'

const TYPES = ['single', 'multi', 'judge', 'blank', 'short', 'calc']
const DIFFS = [1, 2, 3]
const FIELDS = ['id', 'type', 'difficulty', 'knowledge', 'stem', 'answer', 'analysis']

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const verbose = args.includes('--verbose')

if (!file) {
  console.log('用法: node scripts/check-bank-import.mjs <题库json> [--verbose]')
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.log('✗ 文件不存在:', file)
  process.exit(1)
}

let raw
try {
  raw = fs.readFileSync(file, 'utf8')
} catch (e) {
  console.log('✗ 读文件失败:', e.message)
  process.exit(1)
}

// ── 检查 1：能否被 JSON.parse 解析 ──
let data
const trimmed = raw.trim()
try {
  data = JSON.parse(trimmed)
} catch (e) {
  console.log('✗ 检查1 未通过：JSON 无法解析')
  console.log('  原因:', e.message)
  const fence = trimmed.match(/```/)
  if (fence) console.log('  → 检测到 ``` 代码块标记，请只保留从 [ 到 ] 的数组部分')
  if (/[“”‘’]/.test(trimmed)) console.log('  → 检测到中文引号，JSON 结构只能用 ASCII 双引号')
  process.exit(1)
}

if (!Array.isArray(data)) {
  console.log('✗ 检查1 未通过：顶层必须是 JSON 数组（形如 [{...},{...}]）')
  console.log('  实际类型:', Array.isArray(data) ? 'array' : typeof data)
  process.exit(1)
}

const errs = []
const warns = []
const add = (i, msg) => errs.push({ i, msg })
const warn = (i, msg) => warns.push({ i, msg })

// id 重复时，报错要能区分是哪一条，否则两条同名题的问题会混在一起
const dupIds = new Set()
{
  const c = new Map()
  data.forEach((q) => {
    const id = q && q.id
    if (!id) return
    c.set(id, (c.get(id) || 0) + 1)
  })
  for (const [id, n] of c) if (n > 1) dupIds.add(id)
}
const tagOf = (q, i) => {
  const id = (q && q.id) || `#${i + 1}`
  return dupIds.has(id) ? `${id}(第${i + 1}题)` : id
}

// ── 检查 2：必填字段与枚举 ──
data.forEach((q, i) => {
  const tag = tagOf(q, i)
  if (!q || typeof q !== 'object') return add(tag, '不是对象')
  for (const f of FIELDS) {
    if (q[f] === undefined || q[f] === null || q[f] === '') add(tag, `缺字段 ${f}`)
  }
  if (q.type && !TYPES.includes(q.type)) add(tag, `type 非法: ${q.type}（只能是 ${TYPES.join('/')}）`)
  if (q.difficulty !== undefined && !DIFFS.includes(q.difficulty)) {
    add(tag, `difficulty 非法: ${q.difficulty}（只能是 1/2/3）`)
  }
  if (typeof q.knowledge === 'string' && /^(综合|考点|重要内容|其他|杂项)$/.test(q.knowledge.trim())) {
    warn(tag, `knowledge 过于笼统: "${q.knowledge}"`)
  }
})

// ── 检查 3：options 与 answer 契约 ──
data.forEach((q, i) => {
  if (!q || typeof q !== 'object') return
  const tag = tagOf(q, i)
  const t = q.type
  const opts = q.options

  if (t === 'single' || t === 'multi') {
    if (!Array.isArray(opts)) return add(tag, `${t} 题必须有 options 数组`)
    if (opts.length < 2) add(tag, `options 只有 ${opts.length} 条，至少 2 条`)
    if (opts.length > 4) warn(tag, `options 有 ${opts.length} 条，超过 4 条，前端只显示前 4 个`)
    const bad = opts.filter((o) => !/^[A-D]\.\s/.test(String(o)))
    if (bad.length) add(tag, `选项格式不对（必须以 "A. " 开头）: ${String(bad[0]).slice(0, 24)}…`)
    const nl = opts.filter((o) => String(o).includes('\n'))
    if (nl.length) add(tag, '选项内含换行，必须单行')

    const letters = opts.map((o) => String(o)[0]).join('')
    const ans = String(q.answer || '')
    if (t === 'single') {
      if (!/^[A-D]$/.test(ans)) add(tag, `single 的 answer 必须是单个字母 A-D，实际 "${ans}"`)
      else if (!letters.includes(ans)) add(tag, `answer "${ans}" 不在选项字母 ${letters} 中`)
    } else {
      if (!/^[A-D]{2,}$/.test(ans)) add(tag, `multi 的 answer 必须是升序字母串（如 "ABD"），实际 "${ans}"`)
      else {
        const sorted = ans.split('').sort().join('')
        if (sorted !== ans) add(tag, `multi 的 answer 未按字母升序: "${ans}" → 应为 "${sorted}"`)
        for (const ch of ans) if (!letters.includes(ch)) add(tag, `answer 含选项中没有的字母 "${ch}"`)
      }
    }
  }

  if (t === 'judge') {
    if (Array.isArray(opts) && opts.length) add(tag, 'judge 题不应有 options（前端固定渲染 正确/错误）')
    if (!['对', '错'].includes(String(q.answer))) {
      add(tag, `judge 的 answer 只能是 "对" 或 "错"，实际 "${q.answer}"`)
    }
  }

  if (t === 'blank' || t === 'calc' || t === 'short') {
    if (Array.isArray(opts) && opts.length) warn(tag, `${t} 题通常不需要 options`)
  }

  // 题干应可独立作答
  if (typeof q.stem === 'string' && /如图|上题|上述材料|该表|见下图/.test(q.stem)) {
    add(tag, '题干依赖上下文（出现"如图/上题/上述材料"），无法独立作答')
  }

  // 解析质量
  const an = String(q.analysis || '')
  if (an && an.length < 15) add(tag, `analysis 过短（${an.length} 字），至少写清为什么对`)
  if (/^(故选|答案为|选)\s*[A-D]?\s*。?$/.test(an.trim())) add(tag, 'analysis 只有结论没有推理')
})

// ── 检查 4：id 唯一且连续 ──
const ids = data.map((q) => (q && q.id) || '')
const seen = new Map()
ids.forEach((id, i) => {
  if (!id) return
  if (seen.has(id)) add(id, `id 重复（第 ${seen.get(id) + 1} 题与第 ${i + 1} 题）`)
  else seen.set(id, i)
})

// 同前缀的编号连续性
const groups = {}
ids.forEach((id) => {
  const m = String(id).match(/^(.+?)-(\d+)$/)
  if (!m) return
  ;(groups[m[1]] = groups[m[1]] || []).push(Number(m[2]))
})
for (const [prefix, nums] of Object.entries(groups)) {
  const sorted = [...nums].sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) gaps.push(`${sorted[i - 1]}→${sorted[i]}`)
  }
  if (gaps.length) warn(`${prefix}-*`, `编号不连续: ${gaps.join(', ')}`)
}

// ── 输出 ──
const total = data.length
const byType = {}
data.forEach((q) => {
  const t = (q && q.type) || 'unknown'
  byType[t] = (byType[t] || 0) + 1
})

console.log(`文件：${file}`)
console.log(`题量：${total} 题`)
console.log(`分布：${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log('')

if (verbose && total) {
  console.log('前 3 题预览：')
  data.slice(0, 3).forEach((q) => {
    console.log(`  ${q.id} [${q.type}/${q.difficulty}] ${String(q.stem).slice(0, 40)}…`)
  })
  console.log('')
}

if (warns.length) {
  console.log(`⚠ 提醒 ${warns.length} 条（不影响导入）`)
  warns.slice(0, verbose ? 999 : 8).forEach((w) => console.log(`  - ${w.i}: ${w.msg}`))
  if (!verbose && warns.length > 8) console.log(`  …还有 ${warns.length - 8} 条，加 --verbose 查看`)
  console.log('')
}

if (errs.length) {
  console.log(`✗ 发现 ${errs.length} 个必须修的问题（共 ${new Set(errs.map((e) => e.i)).size} 题受影响）`)
  errs.slice(0, verbose ? 999 : 20).forEach((e) => console.log(`  - ${e.i}: ${e.msg}`))
  if (!verbose && errs.length > 20) {
    console.log(`  …还有 ${errs.length - 20} 条，加 --verbose 查看`)
  }
  console.log('')
  console.log('结论：不可直接导入。把上面的问题清单发回给提交同学修正。')
  process.exit(1)
}

console.log('✅ 六项检查全部通过，可直接导入：')
console.log('   /admin/bank.html → 选对应课程 → 「📥 批量导入」→ 粘贴数组 → 选「追加到现有题库」')
process.exit(0)
