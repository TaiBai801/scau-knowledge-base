#!/usr/bin/env node
/**
 * 知识点索引生成器
 * ------------------------------------------------------------------
 * 方案 1.1「全站统一检索」的差异化设计要求：
 *   输入「傅里叶变换」自动联想「信号与系统」
 * VitePress 原生搜索只索引页面标题与正文，搜不到知识点。这里把
 * syllabus.json 的 4248 个知识点打平成「知识点 → 课程」索引，
 * 供 /search 页面做联想检索。
 *
 * 产物：public/data/kp-index.json（构建期生成，运行时零计算）
 *   { v, generatedAt, courses:[{name,code,path}], points:[[kp, courseIdx, unitTitle]] }
 *
 * 与 site-metrics.mjs 一样：禁止使用 import.meta.url（config 会被打包导致
 * 路径失真），统一用 process.cwd() 向上找根。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const OUT_REL = 'public/data/kp-index.json'

function findProjectRoot(start) {
  let dir = path.resolve(start || process.cwd())
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'majors'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(start || process.cwd())
}

function readJson(root, rel) {
  try {
    const abs = path.join(root, rel)
    if (!fs.existsSync(abs)) return null
    return JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}

// 扫 majors/ 建立 课程编号 → 页面路径（优先 shared，避免链到某个专业的重复页）
function buildCodePath(root) {
  const map = new Map()
  const majorsDir = path.join(root, 'majors')
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(abs)
      } else if (ent.isFile() && /^\d{10}\.md$/.test(ent.name)) {
        const code = ent.name.slice(0, 10)
        const rel = path.relative(root, abs).replace(/\\/g, '/')
        const urlPath = '/' + rel.replace(/\.md$/, '')
        const isShared = urlPath.startsWith('/majors/shared/')
        if (!map.has(code) || isShared) map.set(code, urlPath)
      }
    }
  }
  walk(majorsDir)
  return map
}

export function collectKpIndex(root) {
  const syllabus = readJson(root, 'data/syllabus.json') || readJson(root, 'public/data/syllabus.json')
  const coursesJson = readJson(root, 'public/data/courses.json')
  const codePath = buildCodePath(root)

  // 课程名 → 编号（courses.json 里有重名不同码，取第一个）
  const nameToCode = new Map()
  if (Array.isArray(coursesJson)) {
    for (const c of coursesJson) {
      if (c && c.name && c.code && !nameToCode.has(c.name)) nameToCode.set(c.name, String(c.code))
    }
  }

  const courses = []
  const courseIdx = new Map() // 课程名 → 索引
  const points = []

  const ensureCourse = (name) => {
    if (courseIdx.has(name)) return courseIdx.get(name)
    const code = nameToCode.get(name) || ''
    const idx = courses.length
    courses.push({
      name,
      code,
      path: code && codePath.has(code) ? codePath.get(code) : '',
    })
    courseIdx.set(name, idx)
    return idx
  }

  if (syllabus && typeof syllabus === 'object') {
    for (const [courseName, entry] of Object.entries(syllabus)) {
      const units = Array.isArray(entry?.units) ? entry.units : []
      if (!units.length) continue
      const ci = ensureCourse(courseName)
      for (const u of units) {
        const title = String(u?.title || '')
        const pts = Array.isArray(u?.points) ? u.points : []
        for (const p of pts) {
          const kp = String(p || '').trim()
          if (!kp) continue
          points.push([kp, ci, title])
        }
      }
    }
  }

  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    courses,
    points,
  }
}

function sha1(str) {
  return 'sha1:' + crypto.createHash('sha1').update(str).digest('hex')
}

export function writeKpIndex(data, root, force) {
  const target = path.join(root, OUT_REL)
  const payload = { v: data.v, courses: data.courses, points: data.points }
  const hash = sha1(JSON.stringify(payload))

  if (!force && fs.existsSync(target)) {
    try {
      const prev = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (prev.contentHash === hash) {
        const now = new Date()
        try {
          fs.utimesSync(target, now, now)
        } catch {}
        return { changed: false, hash }
      }
    } catch {
      /* 损坏则覆盖 */
    }
  }

  const out = { ...data, contentHash: hash }
  const json = JSON.stringify(out) + '\n'
  const tmp = target + '.tmp'
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, target)
  return { changed: true, hash }
}

export function ensureKpIndex(opts = {}) {
  const root = opts.root || findProjectRoot(process.cwd())
  const data = collectKpIndex(root)
  const { changed } = writeKpIndex(data, root, !!opts.force)
  return { root, data, changed }
}

const invokedDirectly = process.argv[1] && /gen-kp-index\.mjs$/.test(process.argv[1])
if (invokedDirectly) {
  try {
    const force = process.argv.includes('--force')
    const { data, changed } = ensureKpIndex({ force })
    console.log(
      `[kp-index] ${changed ? '已更新' : '无变更'} · 课程 ${data.courses.length} · 知识点 ${data.points.length}`
    )
  } catch (e) {
    console.error('[kp-index] 生成失败：' + (e && e.stack ? e.stack : e))
    process.exitCode = 1
  }
}
