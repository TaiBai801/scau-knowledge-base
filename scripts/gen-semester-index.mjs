#!/usr/bin/env node
/**
 * 学期课表索引生成器
 * ------------------------------------------------------------------
 * 扫描 majors/<专业>/<年份>/semesterN.md，把每学期的课程卡片与三个数据源
 * （资料 / 题库 / 大纲）对齐，算出「资料健康度」，产出
 * public/data/semester-index.json 供客户端 semester-health.js 装饰学期页。
 *
 * 设计要点：
 *  1. 只用 Node 内置模块，零第三方依赖。
 *  2. 禁止使用 import.meta.url —— .vitepress/config.mts 会被 Vite 打包，
 *     届时 import.meta.url 指向 .vitepress/ 而非项目根。统一用
 *     process.cwd() 向上找同时含 package.json 与 majors/ 的目录。
 *  3. 内容未变则不重写文件，只刷新 mtime（git 只比内容不比 mtime），
 *     避免每次构建都产生无意义 diff。
 *  4. 数据源缺失时降级为「0 覆盖」并写 warning，绝不抛错中断构建。
 *
 * 用法：
 *   node scripts/gen-semester-index.mjs            # 生成（内容未变则跳过写入）
 *   node scripts/gen-semester-index.mjs --force    # 强制写入
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT_REL = 'public/data/semester-index.json'

/* ─────────────────────────── 基础工具 ─────────────────────────── */

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

function readJsonSafe(root, rel, warnings) {
  const abs = path.join(root, rel)
  try {
    if (!fs.existsSync(abs)) {
      warnings.push(`缺少数据源 ${rel}`)
      return null
    }
    return JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch (e) {
    warnings.push(`解析失败 ${rel}: ${e.message}`)
    return null
  }
}

function sha1(str) {
  return 'sha1:' + crypto.createHash('sha1').update(str).digest('hex')
}

/* ──────────────────────── 课程名归一化 ──────────────────────── */
/*
 * 实测存在的对不齐情况（左：学期页 / 右：数据源）：
 *   大学物理B        → materials「大学物理B」、syllabus「大学物理」
 *   大学英语AI       → materials「大学英语AI」、syllabus「大学英语A」
 *   高等数学AI       → materials「高等数学AI」
 *   高等数学AⅠ       → page 名带罗马数字，syllabus「高等数学A」
 *   大学体育Ⅰ        → syllabus「大学体育」
 *   形势与政策Ⅳ      → syllabus「形势与政策」
 *   大学生心理健康与职业发展Ⅰ（国防安全卫生） → syllabus「大学生心理健康与职业发展」
 *   电力系统自动化（MOOC）  → syllabus「电力系统自动化」
 *   电子专业综合实践II      → syllabus「电子专业综合实践」
 *   机械设计基础B / 材料力学B / 概率论与数理统计B 等分级字母
 *
 * 策略：先精确名匹配，再归一化名匹配。归一化只做「去掉分级/学期后缀」这类
 * 安全裁剪，不动词根，保证不会把「大学物理实验」误并到「大学物理」。
 */

const RE_ROMAN_CJK = /[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+$/
const RE_ROMAN_LATIN = /(?:VIII|VII|III|IV|VI|IX|II|I|V|X)$/
const RE_GRADE_LETTER = /[ABCD]$/

export function normalizeCourseName(raw) {
  if (!raw) return ''
  let s = String(raw)
  // 1. 去全角/半角括号内容（「（农工）」「（MOOC）」「（毕业设计）」「(军事技能)」）
  s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  // 2. 去所有空白（含全角空格）
  s = s.replace(/[\s\u3000]+/g, '')
  // 3. 「AI」结尾是「A 级/I 学期」的合写，先还原成 A
  s = s.replace(/AI$/, 'A')
  // 4. 反复剥掉末尾的分级标记：罗马数字 → 拉丁罗马数字 → 字母等级
  for (let i = 0; i < 3; i++) {
    const before = s
    s = s.replace(RE_ROMAN_CJK, '')
    if (s === before) s = s.replace(RE_ROMAN_LATIN, '')
    if (s === before) s = s.replace(RE_GRADE_LETTER, '')
    if (s === before) break
  }
  return s
}

// 把 { 课程名: 计数 } 编成「精确 + 归一」双查表
function buildLookup(counts, label, warnings) {
  const exact = new Map()
  const norm = new Map()
  for (const [name, n] of counts) {
    exact.set(name, n)
    const key = normalizeCourseName(name)
    if (!key) continue
    if (norm.has(key) && norm.get(key) !== n) {
      // 归一后撞名：保留先出现的，别把两个不同课程的资料算混
      warnings.push(`${label} 归一化撞名「${key}」，已忽略后出现的条目`)
      continue
    }
    if (!norm.has(key)) norm.set(key, n)
  }
  return { exact, norm }
}

function pick(lookup, name) {
  if (!name) return 0
  if (lookup.exact.has(name)) return lookup.exact.get(name)
  const key = normalizeCourseName(name)
  if (key && lookup.norm.has(key)) return lookup.norm.get(key)
  return 0
}

/* ─────────────────────────── 扫描 ─────────────────────────── */

const SLUG_NAMES = {
  dianzikexue: '电子科学与技术',
  dianqigongcheng: '电气工程及其自动化',
  nongyejixiehua: '农业机械化及其自动化',
  nongyegongcheng: '农业工程',
  jiqirengongcheng: '机器人工程',
}

// 卡片起始标签里 href 与 class 的先后顺序不固定，只按 class 认卡片
const RE_CARD = /<a\b[^>]*class="course-card"[^>]*>([\s\S]*?)<\/a>/g
const RE_CODE = /class="course-code"[^>]*>([^<]*)</
const RE_TITLE = /class="course-title"[^>]*>([^<]*)</

function parseSemesterPage(abs, relParts, warnings) {
  const md = fs.readFileSync(abs, 'utf8')
  const courses = []
  RE_CARD.lastIndex = 0
  let m
  while ((m = RE_CARD.exec(md))) {
    const block = m[1]
    const codeM = block.match(RE_CODE)
    const titleM = block.match(RE_TITLE)
    if (!codeM || !titleM) continue
    courses.push({
      code: codeM[1].trim(),
      name: titleM[1].trim(),
    })
  }
  if (!courses.length) warnings.push(`未解析到课程卡片：${relParts.join('/')}`)

  // 专业中文名优先取 frontmatter title（形如「电子科学与技术 2024级 第1学期」）
  let major = SLUG_NAMES[relParts[0]] || relParts[0]
  const fm = md.match(/^title:\s*(.+)$/m)
  if (fm) {
    const cleaned = fm[1].trim().replace(/[\s·]*\d{4}\s*级\s*第\s*\d+\s*学期\s*$/, '').trim()
    if (cleaned) major = cleaned
  }
  return { courses, major }
}

export function collectSemesterIndex(root) {
  const warnings = []
  const majorsDir = path.join(root, 'majors')

  /* ① 数据源：课程名 → 数量 */
  const materialMap = new Map()
  const materialsRaw = readJsonSafe(root, 'data/materials.json', warnings)
  if (materialsRaw && typeof materialsRaw === 'object') {
    for (const [name, list] of Object.entries(materialsRaw)) {
      materialMap.set(name, Array.isArray(list) ? list.length : 0)
    }
  }

  const bankMap = new Map()
  const bankRaw =
    readJsonSafe(root, 'public/data/bank.json', warnings) ||
    readJsonSafe(root, 'data/bank.json', warnings)
  if (bankRaw && typeof bankRaw === 'object') {
    for (const [name, entry] of Object.entries(bankRaw)) {
      bankMap.set(name, Array.isArray(entry?.questions) ? entry.questions.length : 0)
    }
  }

  const syllabusMap = new Map()
  const syllabusRaw =
    readJsonSafe(root, 'public/data/syllabus.json', warnings) ||
    readJsonSafe(root, 'data/syllabus.json', warnings)
  if (syllabusRaw && typeof syllabusRaw === 'object') {
    for (const [name, entry] of Object.entries(syllabusRaw)) {
      syllabusMap.set(name, Array.isArray(entry?.units) ? entry.units.length : 0)
    }
  }

  const lookups = {
    materials: buildLookup(materialMap, 'materials', warnings),
    bank: buildLookup(bankMap, 'bank', warnings),
    syllabus: buildLookup(syllabusMap, 'syllabus', warnings),
  }

  /* ② 扫描学期页 */
  const semesters = {}
  const allNames = new Set()
  const allCodes = new Set()
  const covered = { materials: new Set(), bank: new Set(), syllabus: new Set() }
  let cards = 0

  const years = fs.existsSync(majorsDir)
    ? fs.readdirSync(majorsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
    : []

  for (const slugEnt of years.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const slug = slugEnt.name
    if (slug === 'shared') continue
    const slugDir = path.join(majorsDir, slug)
    for (const yearEnt of fs.readdirSync(slugDir, { withFileTypes: true })) {
      if (!yearEnt.isDirectory() || !/^\d{4}$/.test(yearEnt.name)) continue
      const year = Number(yearEnt.name)
      const yearDir = path.join(slugDir, yearEnt.name)
      for (const fileEnt of fs.readdirSync(yearDir, { withFileTypes: true })) {
        if (!fileEnt.isFile()) continue
        const fm = fileEnt.name.match(/^semester(\d+)\.md$/)
        if (!fm) continue
        const semester = Number(fm[1])
        const abs = path.join(yearDir, fileEnt.name)
        const { courses, major } = parseSemesterPage(abs, [slug, yearEnt.name], warnings)

        const list = []
        let withMaterials = 0
        let withBank = 0
        let withSyllabus = 0
        let materialItems = 0

        for (const c of courses) {
          const mats = pick(lookups.materials, c.name)
          const bank = pick(lookups.bank, c.name)
          const syl = pick(lookups.syllabus, c.name)
          if (mats > 0) {
            withMaterials++
            materialItems += mats
            covered.materials.add(c.name)
          }
          if (bank > 0) {
            withBank++
            covered.bank.add(c.name)
          }
          if (syl > 0) {
            withSyllabus++
            covered.syllabus.add(c.name)
          }
          allNames.add(c.name)
          allCodes.add(c.code)
          list.push({ code: c.code, name: c.name, materials: mats, bank, syllabus: syl })
        }

        const total = list.length
        cards += total
        const ratio = total ? withMaterials / total : 0
        const ratioB = total ? withBank / total : 0
        const ratioS = total ? withSyllabus / total : 0
        const health = total ? Math.round((ratio * 0.5 + ratioB * 0.3 + ratioS * 0.2) * 100) : 0

        const urlPath = `/majors/${slug}/${yearEnt.name}/semester${semester}`
        semesters[urlPath] = {
          major,
          year,
          semester,
          total,
          withMaterials,
          withBank,
          withSyllabus,
          materialItems,
          health,
          courses: list,
        }
      }
    }
  }

  // 按 key 排序，保证 hash 稳定（fs 目录顺序不保证跨平台一致）
  const sortedSemesters = {}
  for (const key of Object.keys(semesters).sort()) sortedSemesters[key] = semesters[key]

  return {
    v: 1,
    totals: {
      semesters: Object.keys(sortedSemesters).length,
      courses: allNames.size,
      cards,
      uniqueCodes: allCodes.size,
      coverage: {
        withMaterials: covered.materials.size,
        withBank: covered.bank.size,
        withSyllabus: covered.syllabus.size,
      },
    },
    semesters: sortedSemesters,
    warnings,
  }
}

/* ─────────────────────────── 落盘 ─────────────────────────── */

export function writeSemesterIndex(data, root, force) {
  const body = { v: data.v, totals: data.totals, semesters: data.semesters }
  const hash = sha1(JSON.stringify(body))
  const target = path.join(root, OUT_REL)

  if (!force && fs.existsSync(target)) {
    try {
      const prev = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (prev.contentHash === hash) {
        // 内容没变：保留旧 generatedAt，只刷新 mtime（git 不跟踪 mtime）
        const now = new Date()
        try { fs.utimesSync(target, now, now) } catch {}
        return { changed: false, hash }
      }
    } catch {
      /* 旧文件损坏则覆盖 */
    }
  }

  const out = { ...body, generatedAt: new Date().toISOString(), contentHash: hash }
  const json = JSON.stringify(out, null, 2) + '\n'
  const tmp = target + '.tmp'
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, target) // 原子替换，避免构建中途留下半截 JSON
  return { changed: true, hash }
}

/* ─────────────────────────── 对外入口 ─────────────────────────── */

export function ensureSemesterIndex(opts = {}) {
  const root = opts.root || findProjectRoot(process.cwd())
  const data = collectSemesterIndex(root)
  const { changed } = writeSemesterIndex(data, root, !!opts.force)
  return { root, data, changed }
}

const invokedDirectly =
  process.argv[1] && /gen-semester-index\.mjs$/.test(process.argv[1])

if (invokedDirectly) {
  try {
    const force = process.argv.includes('--force')
    const { data, changed } = ensureSemesterIndex({ force })
    const t = data.totals
    console.log(
      `[semester-index] ${changed ? '已更新' : '无变更'} · ${t.semesters} 学期 · ${t.courses} 课程 · ${t.cards} 卡片`
    )
    console.log(
      `[semester-index] 覆盖（唯一课程名）· 有资料 ${t.coverage.withMaterials} · 有题库 ${t.coverage.withBank} · 有大纲 ${t.coverage.withSyllabus}`
    )
    if (data.warnings.length) {
      for (const w of data.warnings.slice(0, 10)) console.warn('[semester-index] warn: ' + w)
      if (data.warnings.length > 10) {
        console.warn(`[semester-index] warn: 另有 ${data.warnings.length - 10} 条省略`)
      }
    }
  } catch (e) {
    console.error('[semester-index] 生成失败：' + (e && e.stack ? e.stack : e))
    process.exitCode = 1
  }
}
