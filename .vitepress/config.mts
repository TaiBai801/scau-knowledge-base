import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { metricsTokenPlugin } from './markdown/metrics-token.mjs'

// ────────────────────────────────────────────────────────────────
// 构建期指标快照
// 快照缺失、或源数据比快照新时，用子进程重跑生成器。
// 之所以用 execFileSync 而不是 import：config.mts 会被 Vite 打包成
// .vitepress/config.mts.timestamp-*.mjs，届时 import.meta.url 指向
// .vitepress/ 而非项目根，路径会失真。
// ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'site-metrics.json')
const WATCHED_SOURCES = [
  'data/curriculum.json',
  'data/bank.json',
  'data/syllabus.json',
  'data/course-index.json',
  'data/materials.json',
  'data/contributors.json',
  'data/changelog.json',
  'data/stories.json',
  'stories.md',
]

function loadMetrics(): any {
  let needRun = !fs.existsSync(SNAPSHOT_PATH)
  if (!needRun) {
    try {
      // 用快照文件的 mtime 判断新鲜度（生成器在「内容无变化」时会刷新 mtime
      // 但不改 generatedAt，因此既不会每次重跑，也不会产生无意义的 git diff）
      const generated = fs.statSync(SNAPSHOT_PATH).mtimeMs
      // 先校验快照可解析，损坏则重建
      JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
      needRun = WATCHED_SOURCES.some((rel) => {
        const p = path.join(ROOT, rel)
        return fs.existsSync(p) && fs.statSync(p).mtimeMs > generated
      })
    } catch {
      needRun = true
    }
  }
  if (needRun) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'site-metrics.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
      })
    } catch (e: any) {
      console.warn('[metrics] 快照生成失败，沿用已有快照：' + (e && e.message))
    }
  }
  // 知识点索引：缺失或比 syllabus 旧时重建（供 /search 联想检索）
  try {
    const kpPath = path.join(ROOT, 'public', 'data', 'kp-index.json')
    const sylPath = path.join(ROOT, 'data', 'syllabus.json')
    const kpStale =
      !fs.existsSync(kpPath) ||
      (fs.existsSync(sylPath) && fs.statSync(sylPath).mtimeMs > fs.statSync(kpPath).mtimeMs)
    if (kpStale) {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-kp-index.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
      })
    }
  } catch (e: any) {
    console.warn('[kp-index] 生成失败，/search 将退化为仅按课程名检索：' + (e && e.message))
  }
  // 学期资料健康度索引：缺失或源数据更新时重建（供 semester-health.js 使用）
  try {
    const semPath = path.join(ROOT, 'public', 'data', 'semester-index.json')
    const semStale =
      !fs.existsSync(semPath) ||
      ['data/materials.json', 'data/bank.json', 'data/syllabus.json'].some((rel) => {
        const p = path.join(ROOT, rel)
        return fs.existsSync(p) && fs.statSync(p).mtimeMs > fs.statSync(semPath).mtimeMs
      })
    if (semStale) {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-semester-index.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
      })
    }
  } catch (e: any) {
    console.warn('[semester-index] 生成失败，学期页将不显示资料健康度：' + (e && e.message))
  }
  // 缺口榜：依赖 semester-index，缺失或学期索引比它新时重建
  try {
    const gapPath = path.join(ROOT, 'public', 'data', 'gap-board.json')
    const semPath = path.join(ROOT, 'public', 'data', 'semester-index.json')
    const gapStale =
      !fs.existsSync(gapPath) ||
      (fs.existsSync(semPath) && fs.statSync(semPath).mtimeMs > fs.statSync(gapPath).mtimeMs)
    if (gapStale) {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-gap-board.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
      })
    }
  } catch (e: any) {
    console.warn('[gap-board] 生成失败，/gap 页将不可用：' + (e && e.message))
  }
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
  } catch {
    console.warn('[metrics] 读不到 data/site-metrics.json，数字回退为 0')
    return { courses: { planEntries: 0 }, site: {}, content: {}, seed: {} }
  }
}

const METRICS = loadMetrics()

function readSnapshot(key: string): number | null {
  let cur: any = METRICS
  for (const seg of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return null
    cur = cur[seg]
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null
}

// frontmatter 不经过 markdown 管道，令牌得在这里单独替换
const FM_TOKEN_RE = /\[\[m:([A-Za-z0-9_.]+)(?:\|([a-z]+))?\]\]/g
function fillTokensDeep(value: any): any {
  if (typeof value === 'string') {
    if (value.indexOf('[[m:') === -1) return value
    return value.replace(FM_TOKEN_RE, (raw, key, fmt) => {
      const v = readSnapshot(key)
      if (v == null) {
        console.warn(`[metrics] frontmatter 令牌 [[m:${key}]] 无法解析，已保留原样`)
        return raw
      }
      return fmt === 'plus' ? `${v}+` : fmt === 'comma' ? v.toLocaleString('en-US') : String(v)
    })
  }
  if (Array.isArray(value)) return value.map(fillTokensDeep)
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) value[k] = fillTokensDeep(value[k])
    return value
  }
  return value
}

export default defineConfig({
  lang: 'zh-CN',
  title: '机电专业知识库',
  description: `机电专业课程资源 · 五专业 ${METRICS.courses?.planEntries ?? 0}+ 门课程 · 培养方案 / 组题练习 / 学习打卡 · 开放共享`,
  head: [
    ['link', { rel: 'icon', href: '/emblem.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['meta', { name: 'theme-color', content: '#0D5C5A' }],
    ['meta', { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' }],
    ['meta', { 'http-equiv': 'Pragma', content: 'no-cache' }],
    ['meta', { 'http-equiv': 'Expires', content: '0' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '机电专业知识库' }],
    ['meta', { property: 'og:description', content: '机电专业课程资源 · 电子/电气/农机/农业工程/机器人工程五专业全覆盖 · 组题练习 · 学习打卡 · 开放共享' }],
    ['meta', { property: 'og:site_name', content: '机电专业知识库' }],
    ['script', { src: '/materials-loader.js', defer: '' }],
    ['script', { src: '/stats-loader.js', defer: '' }],
    ['script', { src: '/semester-health.js', defer: '' }],
    ['script', { src: '/footprint-tracker.js', defer: '' }],
  ],
  sitemap: { hostname: 'https://sicau-jdxy-resource.cn' },
  // 内部文档（含接口缺陷与清理清单、阶段方案），不发布为站点页面
  srcExclude: [
    'cloud-function/**',
    '**/node_modules/**',
    'REFACTOR_AUDIT.md',
    'NEXT_PHASE_PLAN.md',
  ],
  markdown: {
    config: (md) => {
      // 正文里的 [[m:key]] 在构建期替换为快照数字
      md.use(metricsTokenPlugin as any, readSnapshot)
    },
  },
  transformPageData(pageData) {
    // frontmatter 里的令牌（如首页 features 文案）
    if (pageData.frontmatter) fillTokensDeep(pageData.frontmatter)
  },
  themeConfig: {
    logo: '/emblem.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '课程', items: [
        { text: '电子科学与技术', link: '/majors/dianzikexue/' },
        { text: '电气工程及其自动化', link: '/majors/dianqigongcheng/' },
        { text: '农业机械化及其自动化', link: '/majors/nongyejixiehua/' },
        { text: '农业工程', link: '/majors/nongyegongcheng/' },
        { text: '机器人工程', link: '/majors/jiqirengongcheng/' },
        { text: '共享课程', link: '/majors/shared/' },
        { text: '课程地图', link: '/map' },
        { text: '转专业', link: '/transfer' },
      ]},
      { text: '学习', items: [
        { text: '全站检索', link: '/search' },
        { text: '组题练习', link: '/quiz' },
        { text: '考试冲刺', link: '/sprint' },
        { text: '概念卡', link: '/cards' },
        { text: '学习计划', link: '/plan' },
      ]},
      { text: '我的', items: [
        { text: '学习打卡', link: '/checkin' },
        { text: '学习足迹', link: '/footprint' },
        { text: '专注计时', link: '/focus' },
        { text: '学习周报', link: '/weekly' },
        { text: '课程笔记', link: '/notes' },
        { text: '错题本', link: '/wrong' },
      ]},
      { text: '社区', items: [
        { text: '「Ta说」', link: '/stories' },
        { text: '资料缺口榜', link: '/gap' },
        { text: '贡献者墙', link: '/contributors' },
        { text: '贡献指南', link: '/contribute' },
      ]},
      { text: '关于', items: [
        { text: '关于本站', link: '/about' },
        { text: '更新日志', link: '/changelog' },
        { text: '全导航', link: '/nav' },
      ]},
    ],
    sidebar: (()=>{let s=(items)=>[{text:'',items}];
    let major_years=(base,years)=>years.map(y=>({
      text:`${y} 级`,link:`${base}/${y}/`,
      collapsed:false,
      items:Array.from({length:8},(_,i)=>i+1).map(sem=>({text:`第${sem}学期`,link:`${base}/${y}/semester${sem}`}))
    }));
    return {
      '/majors/shared/': s([{text:'共享课程总览',link:'/majors/shared/'}]),
      '/majors/dianzikexue/': s([{text:'专业总览',link:'/majors/dianzikexue/'},...major_years('/majors/dianzikexue',[2024,2025,2026])]),
      '/majors/dianqigongcheng/': s([{text:'专业总览',link:'/majors/dianqigongcheng/'},...major_years('/majors/dianqigongcheng',[2024,2025,2026])]),
      '/majors/nongyejixiehua/': s([{text:'专业总览',link:'/majors/nongyejixiehua/'},...major_years('/majors/nongyejixiehua',[2024,2025])]),
      '/majors/nongyegongcheng/': s([{text:'专业总览',link:'/majors/nongyegongcheng/'},...major_years('/majors/nongyegongcheng',[2024,2025])]),
      '/majors/jiqirengongcheng/': s([{text:'专业总览',link:'/majors/jiqirengongcheng/'},...major_years('/majors/jiqirengongcheng',[2026])]),
    };})(),
    search:{provider:'local',options:{translations:{button:{buttonText:'搜索课程',buttonAriaLabel:'搜索课程'},modal:{displayDetails:'显示详情',noResultsText:'未找到',footer:{selectText:'选择',closeText:'关闭'},resetButtonTitle:'清除',backButtonTitle:'关闭'}}}},
    footer:{},
    docFooter:{prev:'上一页',next:'下一页'},outline:{label:'本页目录',level:[2,3]},lastUpdated:false,
  },
  ignoreDeadLinks:true,
})
