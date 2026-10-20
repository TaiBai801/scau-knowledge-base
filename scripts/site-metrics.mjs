#!/usr/bin/env node
/**
 * 构建期指标快照生成器
 * ------------------------------------------------------------------
 * 把「随 git 变」的指标算准，产出 data/site-metrics.json（并同步一份到
 * public/data/site-metrics.json 供后台读取）。
 *
 * 设计要点：
 *  1. 只用 Node 内置模块，零第三方依赖。
 *  2. 禁止使用 import.meta.url —— .vitepress/config.mts 会被 Vite 打包成
 *     .vitepress/config.mts.timestamp-*.mjs，届时 import.meta.url 指向
 *     .vitepress/ 而不是项目根。统一用 process.cwd() 向上找根。
 *  3. 内容未变则不重写文件，保证 generatedAt 的语义是「内容变更时间」，
 *     避免每次构建都产生无意义 git diff。
 *  4. 读不到 data/curriculum.json 时降级到 uniqueCodes 并写 warning，
 *     绝不回退成写死的 346。
 *
 * 用法：
 *   node scripts/site-metrics.mjs            # 生成（内容未变则跳过写入）
 *   node scripts/site-metrics.mjs --force    # 强制写入
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const SNAPSHOT_REL = 'data/site-metrics.json'
const PUBLIC_SNAPSHOT_REL = 'public/data/site-metrics.json'
// 需要从 data/ 同步到 public/data/ 的运行时数据副本
// materials.json：StudyPlan 走 /data/materials.json 读它（此前漏同步导致恒 404）
// dir-map.json：后台「存量盘活」页读它做「目录 → 课程」预填
const SYNC_FILES = [
  'bank.json',
  'syllabus.json',
  'course-index.json',
  'cards.json',
  'materials.json',
  'dir-map.json',
]

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
  // 兜底：仍然返回起始目录，让上层用 warning 暴露问题
  return path.resolve(start || process.cwd())
}

function readJsonSafe(root, rel, warnings) {
  const abs = path.join(root, rel)
  try {
    if (!fs.existsSync(abs)) {
      warnings.push(`缺少文件 ${rel}`)
      return null
    }
    return JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch (e) {
    warnings.push(`解析失败 ${rel}: ${e.message}`)
    return null
  }
}

function readTextSafe(root, rel, warnings) {
  const abs = path.join(root, rel)
  try {
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
  } catch (e) {
    warnings.push(`读取失败 ${rel}: ${e.message}`)
    return ''
  }
}

// 递归列出目录下所有 .md 的绝对路径
function walkMarkdown(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walkMarkdown(abs, out)
    else if (ent.isFile() && ent.name.endsWith('.md')) out.push(abs)
  }
  return out
}

const isCoursePage = (n) => /^\d{10}\.md$/.test(n)
const isSemesterPage = (n) => /^semester\d+\.md$/.test(n)
const isIndexPage = (n) => n === 'index.md'

function sha1(str) {
  return 'sha1:' + crypto.createHash('sha1').update(str).digest('hex')
}

/* ─────────────────────────── 指标采集 ─────────────────────────── */

export function collectMetrics(root) {
  const warnings = []

  /* ① 课程页面：majors/ 下按文件名分类 */
  const majorsDir = path.join(root, 'majors')
  const allMd = walkMarkdown(majorsDir, [])

  let detailPages = 0
  let semesterPages = 0
  let overviewPages = 0
  let sharedPages = 0
  const codeSet = new Set()
  const gradesByMajor = {}
  const majorSlugs = []

  for (const abs of allMd) {
    const name = path.basename(abs)
    const rel = path.relative(majorsDir, abs).split(path.sep)
    const slug = rel[0]

    if (slug === 'shared') {
      if (!isIndexPage(name)) sharedPages++
      continue
    }

    if (isCoursePage(name)) {
      detailPages++
      codeSet.add(name.slice(0, 10))
    } else if (isSemesterPage(name)) {
      semesterPages++
    } else if (isIndexPage(name)) {
      overviewPages++
    }

    // 年级目录：majors/<slug>/<4位年份>/
    if (rel.length >= 3 && /^\d{4}$/.test(rel[1])) {
      if (!gradesByMajor[slug]) gradesByMajor[slug] = new Set()
      gradesByMajor[slug].add(Number(rel[1]))
    }
  }

  for (const [slug, set] of Object.entries(gradesByMajor)) {
    gradesByMajor[slug] = [...set].sort()
    majorSlugs.push(slug)
  }
  majorSlugs.sort()

  const majors = majorSlugs.length
  const grades = Object.values(gradesByMajor).reduce((s, v) => s + v.length, 0)

  /* ② 课程名称种数 / 唯一课程：以 courses.json 为权威 */
  const coursesJson = readJsonSafe(root, 'public/data/courses.json', warnings)
  const courseRecords = Array.isArray(coursesJson) ? coursesJson : []
  const uniqueCodes = courseRecords.length || codeSet.size
  const names = new Set(courseRecords.map((c) => c && c.name).filter(Boolean)).size

  /* ③ 课程簇 */
  const courseIndex = readJsonSafe(root, 'data/course-index.json', warnings)
  const clusters = Array.isArray(courseIndex?.clusters) ? courseIndex.clusters.length : 0

  /* ④ 培养方案条目数（346 的真实来源） */
  const curriculum = readJsonSafe(root, 'data/curriculum.json', warnings)
  const curriculumEntries = Array.isArray(curriculum?.entries) ? curriculum.entries : []
  let planEntries = curriculumEntries.length
  let planEntriesSource = 'data/curriculum.json'
  if (!planEntries) {
    planEntries = uniqueCodes
    planEntriesSource = 'public/data/courses.json（curriculum.json 缺失，已降级）'
    warnings.push(
      'data/curriculum.json 缺失或为空，planEntries 已降级为唯一课程数 ' +
        uniqueCodes +
        '；对外「346+」口径不可用，请先运行 scripts/import-curriculum.py'
    )
  }

  /* ⑤ 学长说：优先读结构化 data/stories.json（四问模板），
        缺失时退回数 stories.md 里的 class="ta-card"（兼容旧结构） */
  const storiesJson = readJsonSafe(root, 'data/stories.json', warnings)
  let stories = 0
  if (Array.isArray(storiesJson?.stories)) {
    stories = storiesJson.stories.length
  } else {
    const storiesMd = readTextSafe(root, 'stories.md', warnings)
    stories = (storiesMd.match(/class="ta-card"/g) || []).length
  }

  /* ⑥ 更新日志版本数 */
  const changelog = readJsonSafe(root, 'data/changelog.json', warnings)
  const changelogReleases = Array.isArray(changelog?.releases) ? changelog.releases.length : 0

  /* ⑦ 大纲：章节 / 知识点 */
  const syllabus = readJsonSafe(root, 'data/syllabus.json', warnings)
  let syllabusCourses = 0
  let syllabusUnits = 0
  let syllabusPoints = 0
  if (syllabus && typeof syllabus === 'object') {
    syllabusCourses = Object.keys(syllabus).length
    for (const entry of Object.values(syllabus)) {
      const units = Array.isArray(entry?.units) ? entry.units : []
      syllabusUnits += units.length
      for (const u of units) {
        syllabusPoints += Array.isArray(u?.points) ? u.points.length : 0
      }
    }
  }

  /* ⑧ 题库 / 资料 / 贡献者（仓库副本，作为 live 指标的首次兜底） */
  const bank = readJsonSafe(root, 'data/bank.json', warnings) ||
    readJsonSafe(root, 'public/data/bank.json', warnings)
  let bankCourses = 0
  let bankQuestions = 0
  if (bank && typeof bank === 'object') {
    bankCourses = Object.keys(bank).length
    for (const entry of Object.values(bank)) {
      bankQuestions += Array.isArray(entry?.questions) ? entry.questions.length : 0
    }
  }

  const materials = readJsonSafe(root, 'data/materials.json', warnings)
  let materialCourses = 0
  let materialItems = 0
  if (materials && typeof materials === 'object') {
    materialCourses = Object.keys(materials).length
    for (const list of Object.values(materials)) {
      materialItems += Array.isArray(list) ? list.length : 0
    }
  }

  const contributorsJson = readJsonSafe(root, 'data/contributors.json', warnings)
  const contributorList = Array.isArray(contributorsJson?.contributors)
    ? contributorsJson.contributors
    : []
  const visibleContributors = contributorList.filter((c) => c && !c.hidden)
  const contributorCount = visibleContributors.length
  const contributions = visibleContributors.reduce(
    (s, c) => s + (Number(c.count) || 0),
    0
  )

  /* ⑨ 年级培养方案明细（供 Phase 3 的年级表使用） */
  const yearPlans = Array.isArray(curriculum?.yearPlans) ? curriculum.yearPlans : []

  return {
    schemaVersion: 1,
    courses: {
      planEntries,
      planEntriesSource,
      uniqueCodes,
      names,
      pages: detailPages + sharedPages,
      detailPages,
      sharedPages,
      clusters,
    },
    site: {
      majors,
      grades,
      semesterPages,
      overviewPages,
      stories,
      changelogReleases,
      gradesByMajor,
    },
    content: {
      syllabus: { courses: syllabusCourses, units: syllabusUnits, points: syllabusPoints },
      bank: { courses: bankCourses, questions: bankQuestions },
      materials: { courses: materialCourses, items: materialItems },
      contributors: { count: contributorCount, contributions },
    },
    yearPlans,
    warnings,
    // 首次上线时的 live 指标兜底值：接口不可用时页面显示这些，不会闪 0
    seed: {
      traffic: {
        today: { visits: 0, downloads: 0 },
        week: { visits: 0, downloads: 0 },
        month: { visits: 0, downloads: 0 },
        total: { visits: 0, downloads: 0 },
      },
      students: { registered: 0 },
      checkins: { participants: 0, days: 0, minutes: 0, last7: 0, today: 0 },
      materials: { courses: materialCourses, items: materialItems },
      bank: { courses: bankCourses, questions: bankQuestions },
      contributors: { count: contributorCount, contributions },
    },
  }
}

/* ─────────────────────────── 落盘 ─────────────────────────── */

// 内容未变则跳过写入；返回是否真的写了
export function writeMetrics(snapshot, root, force) {
  const payload = { ...snapshot, generatedAt: undefined, contentHash: undefined }
  const hash = sha1(JSON.stringify(payload))

  const target = path.join(root, SNAPSHOT_REL)
  if (!force && fs.existsSync(target)) {
    try {
      const prev = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (prev.contentHash === hash) {
        // 内容没变：保留旧的 generatedAt（避免无意义 git diff），
        // 但把文件 mtime 刷新到当前时间，让「源文件是否更新」的判断生效，
        // 否则每次构建都会重跑一次生成器。git 只比对内容，不跟踪 mtime。
        const now = new Date()
        try { fs.utimesSync(target, now, now) } catch {}
        syncPublicCopy(prev, root)
        return { changed: false, hash }
      }
    } catch {
      /* 旧文件损坏则覆盖 */
    }
  }

  const out = { ...snapshot, generatedAt: new Date().toISOString(), contentHash: hash }
  const json = JSON.stringify(out, null, 2) + '\n'

  // 原子里写：先写临时文件再 rename，避免构建中途留下半截 JSON
  const tmp = target + '.tmp'
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, target)

  syncPublicCopy(out, root)
  return { changed: true, hash }
}

function syncPublicCopy(snapshot, root) {
  const pub = path.join(root, PUBLIC_SNAPSHOT_REL)
  const json = JSON.stringify(snapshot, null, 2) + '\n'
  try {
    fs.mkdirSync(path.dirname(pub), { recursive: true })
    if (fs.existsSync(pub) && fs.readFileSync(pub, 'utf8') === json) return
    fs.writeFileSync(pub, json, 'utf8')
  } catch (e) {
    console.warn('[metrics] 写入 public 副本失败：' + e.message)
  }
}

// 把 data/ 下的运行时数据同步一份到 public/data/（站点直接可读）
function syncDataToPublic(root, warnings) {
  for (const name of SYNC_FILES) {
    const src = path.join(root, 'data', name)
    const dst = path.join(root, 'public', 'data', name)
    try {
      if (!fs.existsSync(src)) continue
      const a = fs.readFileSync(src)
      if (fs.existsSync(dst) && Buffer.compare(a, fs.readFileSync(dst)) === 0) continue
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.writeFileSync(dst, a)
    } catch (e) {
      warnings.push(`同步 public/data/${name} 失败: ${e.message}`)
    }
  }
}

/* ─────────────────────────── 对外入口 ─────────────────────────── */

export function ensureSiteMetrics(opts = {}) {
  const root = opts.root || findProjectRoot(process.cwd())
  const snapshot = collectMetrics(root)
  const { changed } = writeMetrics(snapshot, root, !!opts.force)
  syncDataToPublic(root, snapshot.warnings)
  return { root, snapshot, changed }
}

// CLI 入口（被 config.mts 用 execFileSync 调用，或 npm run build 串行调用）
const invokedDirectly =
  process.argv[1] && /site-metrics\.mjs$/.test(process.argv[1])

if (invokedDirectly) {
  try {
    const force = process.argv.includes('--force')
    const { root, snapshot, changed } = ensureSiteMetrics({ force })
    const c = snapshot.courses
    const s = snapshot.site
    console.log(
      `[metrics] ${changed ? '已更新' : '无变更'} · ${path.relative(process.cwd(), root) || '.'} · ` +
        `planEntries=${c.planEntries} uniqueCodes=${c.uniqueCodes} pages=${c.pages} ` +
        `majors=${s.majors} semesters=${s.semesterPages} stories=${s.stories}`
    )
    if (snapshot.warnings.length) {
      for (const w of snapshot.warnings) console.warn('[metrics] warn: ' + w)
    }
  } catch (e) {
    console.error('[metrics] 生成失败：' + (e && e.stack ? e.stack : e))
    process.exitCode = 1
  }
}
