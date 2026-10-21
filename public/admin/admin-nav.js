// 后台共享导航：分组下拉 + 当前页高亮 + 统一退出
// 用法：各后台页在 auth-check.js 之后引入本脚本即可，无需手写导航。
// 本脚本会：清掉 header 里旧的平铺链接（保留 <h1> 与 .who/#who），
// 注入分组导航；当前页加高亮；右侧放「回站点 / 退出」。
(function () {
  var NAV = [
    { group: '内容', items: [
      { t: '课程管理', h: '/admin/index.html' },
      { t: '资料上传', h: '/admin/upload.html' },
      { t: '题库录入', h: '/admin/bank.html' },
      { t: '内容编辑', h: '/admin/content.html' },
    ]},
    { group: '审核', items: [
      { t: '补料审核', h: '/admin/submissions.html' },
      { t: '悬赏审核', h: '/admin/bounty.html' },
      { t: '贡献者管理', h: '/admin/contributors.html' },
    ]},
    { group: '数据', items: [
      { t: '数据统计', h: '/admin/stats.html' },
      { t: '存量盘活', h: '/admin/materials-scan.html' },
    ]},
    { group: '系统', items: [
      { t: '管理员管理', h: '/admin/admins.html' },
      { t: '任务分配表', h: '/课程任务分配表.xlsx', ext: true },
    ]},
  ];

  var STYLE_ID = 'anav-style';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      /* 顶栏容器 */
      '.anav{display:flex;align-items:center;gap:2px;margin-left:auto;flex-wrap:wrap}' +
      '.anav-grp{position:relative}' +
      '.anav-btn{display:inline-flex;align-items:center;gap:4px;border:none;background:transparent;' +
      'color:#b2d9d6;font-size:.86rem;padding:6px 10px;border-radius:7px;cursor:pointer;' +
      'font-family:inherit;white-space:nowrap}' +
      '.anav-btn:hover,.anav-grp.open .anav-btn{background:rgba(255,255,255,.12);color:#fff}' +
      /* 当前页：即使收在组里，组按钮也高亮 */
      '.anav-grp.has-active>.anav-btn{color:#fff;font-weight:600;background:rgba(255,255,255,.16);' +
      'box-shadow:inset 0 -2px 0 #ffd97a}' +
      /* 下拉面板 */
      '.anav-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:9.5em;background:#fff;' +
      'border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:6px;display:none;z-index:60}' +
      '.anav-grp.open .anav-menu{display:block}' +
      '.anav-menu a,.anav-menu span{display:block;padding:7px 12px;border-radius:7px;' +
      'color:#3E4A47;font-size:.86rem;text-decoration:none;white-space:nowrap}' +
      '.anav-menu a:hover{background:#E8F4F0;color:#0D5C5A}' +
      '.anav-menu a.active{background:#E8F4F0;color:#0D5C5A;font-weight:600}' +
      '.anav-menu a.active::after{content:"当前";float:right;font-size:.68rem;color:#0D5C5A;' +
      'background:#D2ECE7;border-radius:9px;padding:1px 7px;font-weight:400}' +
      '.anav-menu .anav-ext{color:#8A8577}' +
      /* 平铺项（回站点 / 退出） */
      '.anav-link{color:#b2d9d6;font-size:.86rem;text-decoration:none;padding:6px 10px;' +
      'border-radius:7px;white-space:nowrap}' +
      '.anav-link:hover{background:rgba(255,255,255,.12);color:#fff}' +
      '.anav-sep{width:1px;height:16px;background:rgba(255,255,255,.25);margin:0 4px}' +
      /* 窄屏：组平铺可换行，面板改全宽 */
      '@media (max-width:760px){.anav{width:100%;margin-left:0}' +
      '.anav-menu{left:0;right:auto}}';
    document.head.appendChild(st);
  }

  function cleanHeader(header) {
    // 旧导航是 header 的直接子 <a>（含 #adminsLink），连同旧 span（.who 除外）一并清掉；
    // <h1> 保留。logout 由 auth-check.js 提供（window.logout）。
    Array.prototype.slice.call(header.children).forEach(function (el) {
      if (el.tagName === 'H1') return;
      if (el.classList && el.classList.contains('who')) return;
      if (el.id === 'who') return;
      if (el.tagName === 'A' || el.tagName === 'SPAN') header.removeChild(el);
    });
  }

  function build() {
    var header = document.querySelector('header');
    if (!header) return; // 登录页等无顶栏的页面
    if (header.querySelector('.anav')) return; // 已注入

    ensureStyle();
    cleanHeader(header);

    var here = location.pathname.replace(/\/index\.html$/, '/index.html');
    var nav = document.createElement('nav');
    nav.className = 'anav';

    var html = '';
    NAV.forEach(function (g) {
      var hasActive = g.items.some(function (it) { return it.h === here; });
      html += '<div class="anav-grp' + (hasActive ? ' has-active' : '') + '" data-grp>' +
        '<button type="button" class="anav-btn">' + esc(g.group) +
        (hasActive ? ' <i class="anav-dot"></i>' : '') + ' ▾</button>' +
        '<div class="anav-menu">';
      g.items.forEach(function (it) {
        var cls = it.h === here ? 'active' : '';
        if (it.ext) cls += ' anav-ext';
        html += '<a href="' + it.h + '"' + (it.ext ? ' target="_blank" rel="noopener"' : '') +
          ' class="' + cls.trim() + '">' + esc(it.t) + '</a>';
      });
      html += '</div></div>';
    });
    html += '<span class="anav-sep"></span>' +
      '<a class="anav-link" href="/">← 回站点</a>' +
      '<a class="anav-link" href="javascript:;" onclick="logout()">退出</a>';
    nav.innerHTML = html;
    header.appendChild(nav);

    // 组开合：点击切换、点别处收起、Esc 收起
    nav.querySelectorAll('[data-grp]').forEach(function (grp) {
      grp.querySelector('.anav-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        var open = grp.classList.contains('open');
        nav.querySelectorAll('[data-grp]').forEach(function (g2) { g2.classList.remove('open'); });
        if (!open) grp.classList.add('open');
      });
    });
    document.addEventListener('click', function () {
      nav.querySelectorAll('[data-grp]').forEach(function (g) { g.classList.remove('open'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') nav.querySelectorAll('[data-grp]').forEach(function (g) { g.classList.remove('open'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
