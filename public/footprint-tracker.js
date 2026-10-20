// 学习足迹埋点（纯本地，不上传）
// ---------------------------------------------------------------
// 只做两件事：
//   1. 进入课程详情页记一条 view（同一门课 5 分钟内去重）
//   2. 点击资料下载链接记一条 download
// 写入结构与 .vitepress/theme/lib/footprint.ts 的 FootprintEvent 完全一致：
//   { ts, date, kind, course, code, ref }
// 任何异常都必须吞掉，绝不能影响页面。
(function () {
  var KEY = 'kx_foot_v1'
  var MAX = 3000
  var DEDUPE_MS = 5 * 60 * 1000

  function todayISO() {
    var d = new Date()
    var m = d.getMonth() + 1
    var day = d.getDate()
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day)
  }

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY)
      if (!raw) return []
      var v = JSON.parse(raw)
      return Object.prototype.toString.call(v) === '[object Array]' ? v : []
    } catch (e) {
      return []
    }
  }

  function push(ev) {
    try {
      var list = readAll()
      list.push(ev)
      if (list.length > MAX) list = list.slice(list.length - MAX)
      localStorage.setItem(KEY, JSON.stringify(list))
    } catch (e) {}
  }

  // 从 /majors/<专业|shared>/<10位课程编号> 里取课程编号
  function parseCoursePath(pathname) {
    var m = String(pathname || '').match(/^\/majors\/([^/]+)\/(\d{10})\/?$/)
    if (!m) return null
    return { code: m[2], major: m[1] }
  }

  function courseName() {
    var el = document.querySelector('.course-title, .ardot-cd-title, h1')
    return el ? String(el.textContent || '').trim().slice(0, 60) : ''
  }

  function trackView() {
    var info = parseCoursePath(location.pathname)
    if (!info) return
    var list = readAll()
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].kind === 'view' && list[i].code === info.code) {
        if (Date.now() - list[i].ts < DEDUPE_MS) return
        break
      }
    }
    push({
      ts: Date.now(),
      date: todayISO(),
      kind: 'view',
      code: info.code,
      course: courseName(),
    })
  }

  function bindDownloads() {
    document.addEventListener(
      'click',
      function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a.dl-link') : null
        if (!a) return
        var info = parseCoursePath(location.pathname)
        push({
          ts: Date.now(),
          date: todayISO(),
          kind: 'download',
          code: info ? info.code : '',
          course: courseName(),
          ref: String(a.getAttribute('href') || '').slice(-80),
        })
      },
      true
    )
  }

  function run() {
    try {
      if (!window.localStorage) return
      trackView()
      bindDownloads()
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run)
  } else {
    run()
  }
})()
