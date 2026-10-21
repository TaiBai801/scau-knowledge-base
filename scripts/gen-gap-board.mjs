#!/usr/bin/env node
/**
 * 缺口榜生成器
 * ------------------------------------------------------------------
 * 把「哪门课还没资料」从散落在 88 个学期页里的徽标，变成一张可排序、口径公开的榜单。
 * 产出 public/data/gap-board.json，供 /gap 页（GapBoard.vue）渲染，也是活动二
 * 「缺课悬赏」的榜单来源。
 *
 * 需求强度口径（对外必须公开，页面会照抄 formula.expression）：
 *   score = 2 × 开课专业数 + 2 × 是否必修 + 0.3 × 学分 + 3 × 缺口系数
 *   缺口系数：无资料且无题库 = 1.0 ；仅无资料 = 0.6 ；其它 = 0
 *
 * ⚠️ 站内没有「选课人数」数据，所以这是**代理口径**，不是真实选课热度。
 *    不要把它叫「热门度」，也不要在 UI 上暗示它代表选课人数。
 *    悬赏点赞本可作为真实需求信号，但样本极少（近乎 0），故权重取 0 并在此说明。
 *
 * 设计要点（与 gen-semester-index.mjs 保持一致）：
 *  1. 只用 Node 内置模块，零第三方依赖。
 *  2. 禁用 import.meta.url —— config.mts 会被 Vite 打包，统一用 process.cwd() 找根。
 *  3. 内容未变则不重写，只刷 mtime，避免无意义 diff。
 *  4. 数据源缺失时降级并写 warning，绝不抛错中断构建。
 *
 * 用法：
 *   node scripts/gen-gap-board.mjs            # 生成（内容未变则跳过写入）
 *   node scripts/gen-gap-board.mjs --force    # 强制写入
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT_REL = 'public/data/gap-board.json'
const SRC_SEMESTER = 'public/data/semester-index.json'
const SRC_CURRICULUM = 'data/curriculum.json'

export function findProjectRoot(start) {
  let dir = path.resolve(start || process.cwd())
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'majors'))
    ) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(start || process.cwd())
}

function readJson(root, rel) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/* ─────────────────────── 口径常量（页面会公开） ─────────────────────── */

const FORMULA = {
  expression: 'score = 2×开课专业数 + 2×是否必修 + 0.3×学分 + 3×缺口系数',
  gapFactor: {
    '无资料且无题库': 1.0,
    '仅无资料': 0.6,
    '有资料': 0,
  },
  notes: [
    '站内没有选课人数数据，本榜单用「开课专业数 + 是否必修 + 学分」作为需求强度的代理口径，不代表真实选课人数。',
    '悬赏点赞本可作为真实需求信号，但当前样本极少，权重取 0，暂不计入。',
    '数据来源：data/curriculum.json（专业/学分/必修）、public/data/semester-index.json（资料/题库/大纲覆盖）。',
  ],
}

/* ─────────────────────────── 主流程 ─────────────────────────── */

export function collectGapBoard(root) {
  const sem = readJson(root, SRC_SEMESTER)
  const cur = readJson(root, SRC_CURRICULUM)
  const warnings = []

  if (!sem || !sem.semesters) {
    warnings.push('semester-index.json 缺失或结构异常，无法计算缺口')
    return { items: [], totals: null, warnings }
  }
  if (!cur) warnings.push('curriculum.json 缺失，学分与必修标记将为空')

  // 课程名 → 覆盖与开课专业
  const map = new Map()
  for (const page of Object.values(sem.semesters)) {
    const major = page.major || ''
    for (const c of page.courses || []) {
      const name = String(c.name || '').trim()
      if (!name) continue
      let e = map.get(name)
      if (!e) {
        e = {
          name,
          materials: 0,
          bank: 0,
          syllabus: 0,
          majors: new Set(),
          semesters: 0,
          codes: new Set(),
        }
        map.set(name, e)
      }
      // 同名课在不同学期/专业下取最大值（同一门课不应重复计数）
      e.materials = Math.max(e.materials, Number(c.materials) || 0)
      e.bank = Math.max(e.bank, Number(c.bank) || 0)
      e.syllabus = Math.max(e.syllabus, Number(c.syllabus) || 0)
      if (major) e.majors.add(major)
      e.semesters++
      if (c.code) e.codes.add(String(c.code))
    }
  }

  // 培养方案：学分与必修标记（按课程名匹配，取最大分值）
  const curMap = new Map()
  if (cur && Array.isArray(cur.entries)) {
    for (const en of cur.entries) {
      const name = String(en.name || '').trim()
      if (!name) continue
      const prev = curMap.get(name) || { credits: 0, required: false, categories: new Set() }
      prev.credits = Math.max(prev.credits, Number(en.credits) || 0)
      if (en.category === '必修') prev.required = true
      if (en.category) prev.categories.add(en.category)
      curMap.set(name, prev)
    }
  }

  const items = []
  for (const e of map.values()) {
    const cm = curMap.get(e.name) || { credits: 0, required: false, categories: new Set() }
    const majorCount = e.majors.size
    const gapFactor =
      e.materials === 0 && e.bank === 0 ? 1.0 : e.materials === 0 ? 0.6 : 0

    const score =
      2 * majorCount + 2 * (cm.required ? 1 : 0) + 0.3 * cm.credits + 3 * gapFactor

    items.push({
      name: e.name,
      code: [...e.codes][0] || '',
      majors: majorCount,
      majorNames: [...e.majors],
      required: cm.required,
      credits: cm.credits,
      materials: e.materials,
      bank: e.bank,
      syllabus: e.syllabus,
      gapFactor,
      score: Math.round(score * 10) / 10,
      inCurriculum: curMap.has(e.name),
    })
  }

  items.sort(
    (a, b) =>
      b.score - a.score ||
      b.majors - a.majors ||
      a.name.localeCompare(b.name, 'zh')
  )
  items.forEach((it, i) => {
    it.rank = i + 1
  })

  const total = items.length
  const noMaterial = items.filter((i) => i.materials === 0).length
  const noMaterialNoBank = items.filter((i) => i.materials === 0 && i.bank === 0).length
  const noSyllabus = items.filter((i) => i.syllabus === 0).length
  const covered = items.filter((i) => i.materials > 0).length

  // 按专业统计缺口
  const byMajor = {}
  for (const it of items) {
    for (const m of it.majorNames) {
      if (!byMajor[m]) byMajor[m] = { total: 0, withMaterials: 0, noMaterial: 0 }
      byMajor[m].total++
      if (it.materials > 0) byMajor[m].withMaterials++
      else byMajor[m].noMaterial++
    }
  }

  return {
    items,
    totals: {
      courses: total,
      withMaterials: covered,
      noMaterial,
      noMaterialNoBank,
      noSyllabus,
      coverageRate: total ? Math.round((covered / total) * 1000) / 10 : 0,
      byMajor,
    },
    warnings,
  }
}

export function writeGapBoard({ root, force = false, quiet = false } = {}) {
  const base = root || findProjectRoot(process.cwd())
  const { items, totals, warnings } = collectGapBoard(base)

  const body = {
    v: 1,
    formula: FORMULA,
    totals,
    items,
  }

  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify(body))
    .digest('hex')
    .slice(0, 16)

  const outPath = path.join(base, OUT_REL)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  let prev = null
  if (fs.existsSync(outPath)) {
    try {
      prev = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    } catch {
      prev = null
    }
  }

  if (!force && prev && prev.contentHash === hash) {
    const now = new Date()
    try {
      fs.utimesSync(outPath, now, now)
    } catch {}
    if (!quiet) {
      console.log(
        `[gap-board] 无变更 · ${totals ? totals.courses : 0} 门课 · 零资料 ${totals ? totals.noMaterial : 0}`
      )
    }
    warnings.forEach((w) => console.warn('[gap-board] ' + w))
    return { changed: false, hash }
  }

  const out = { ...body, generatedAt: new Date().toISOString(), contentHash: hash }
  const tmp = outPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, outPath)

  if (!quiet) {
    console.log(
      `[gap-board] 已更新 · ${totals.courses} 门课 · 有资料 ${totals.withMaterials} · 零资料 ${totals.noMaterial} · 零资料零题库 ${totals.noMaterialNoBank} · 覆盖率 ${totals.coverageRate}%`
    )
  }
  warnings.forEach((w) => console.warn('[gap-board] ' + w))
  return { changed: true, hash }
}

if (process.argv[1] && /gen-gap-board\.mjs$/.test(process.argv[1])) {
  const force = process.argv.includes('--force')
  writeGapBoard({ force })
}
