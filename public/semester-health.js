// 学期课表视角 · 开学礼包
// 读 /data/semester-index.json（构建期由 scripts/gen-semester-index.mjs 产出），
// 在学期页上做两件事：
//   ① 给每张课程卡加「资料 / 题库 / 缺资料」徽标
//   ② 页首插入「本学期资料健康度 + 本周必看三件事」横幅
// 无依赖、无框架；任何异常都吞掉，绝不影响页面本身。
(function () {
  var INDEX_URL = '/data/semester-index.json';
  var STYLE_ID = 'sh-style';
  var missingCache = {};
  var pending = false;
  var observed = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 当前页面路径（去 .html / 尾斜杠），与索引里的 key 对齐
  function currentPath() {
    var p = location.pathname || '';
    try { p = decodeURI(p); } catch (e) {}
    p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    p = p.replace(/\/+$/, '');
    return p;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '.sh-banner{margin:0 0 24px;padding:18px 20px;border:1px solid #E6E2D8;border-radius:12px;background:#fff}' +
      '.sh-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
      '.sh-health-label{font-size:.85rem;color:#6B6857}' +
      '.sh-health-num{font-size:1.35rem;color:#0D5C5A;margin-left:4px}' +
      '.sh-health-num.is-low{color:#B23B36}' +
      '.sh-bar{margin:10px 0 14px;height:8px;border-radius:6px;background:#E8F4F0;overflow:hidden}' +
      '.sh-bar-fill{display:block;height:100%;width:0;border-radius:6px;background:#0D5C5A;transition:width .4s ease}' +
      '.sh-bar-fill.is-low{background:#B23B36}' +
      '.sh-stats{display:flex;gap:10px;flex-wrap:wrap}' +
      '.sh-stat{flex:1 1 0;min-width:96px;padding:8px 10px;border-radius:8px;background:#E8F4F0;text-align:center}' +
      '.sh-stat b{display:block;font-size:1rem;line-height:1.5;color:#0D5C5A}' +
      '.sh-stat span{font-size:.75rem;color:#5B7A72}' +
      '.sh-todo{margin-top:14px;padding-top:12px;border-top:1px dashed #E6E2D8}' +
      '.sh-todo-title{font-size:.85rem;font-weight:600;color:#0D5C5A;margin-bottom:6px}' +
      '.sh-todo-list{margin:0;padding-left:20px;font-size:.85rem;line-height:1.9;color:#4A4A44}' +
      '.sh-todo-list b{font-weight:600}' +
      '.sh-todo-list a{color:#0D5C5A;text-decoration:underline;text-underline-offset:2px}' +
      '.sh-badge{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:10px;' +
      'font-size:.72rem;line-height:1;white-space:nowrap;border:1px solid transparent}' +
      '.sh-ok{background:#E8F4F0;color:#0D5C5A;border-color:#0D5C5A33}' +
      '.sh-bank{background:#EEF2FA;color:#3A5A8C;border-color:#3A5A8C33}' +
      '.sh-miss{background:#FBEDEC;color:#B23B36;border-color:#B23B3633}' +
      '.dark .sh-banner{background:#151B1A;border-color:#2C3331}' +
      '.dark .sh-health-label{color:#9AA8A4}' +
      '.dark .sh-bar{background:#1F2A28}' +
      '.dark .sh-stat{background:#1F2A28}' +
      '.dark .sh-stat b{color:#7FC9BE}' +
      '.dark .sh-stat span{color:#8FA6A0}' +
      '.dark .sh-todo{border-top-color:#2C3331}' +
      '.dark .sh-todo-title,.dark .sh-todo-list a{color:#7FC9BE}' +
      '.dark .sh-todo-list{color:#C7D2CE}' +
      '@media (max-width:560px){.sh-stat{min-width:0;padding:6px 4px}}';
    document.head.appendChild(st);
  }

  function getIndex() {
    if (missingCache[INDEX_URL]) return missingCache[INDEX_URL];
    var p = fetch(INDEX_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () { return null; });
    missingCache[INDEX_URL] = p;
    return p;
  }

  function findContentInner() {
    return (
      document.querySelector('.ardot-page-content > .ardot-page-inner') ||
      document.querySelector('.ardot-page-content .ardot-page-inner')
    );
  }

  /* ── 徽标 ── */
  function decorateCards(inner, entry) {
    var byCode = {};
    for (var i = 0; i < entry.courses.length; i++) {
      var c = entry.courses[i];
      if (c && c.code && !byCode[c.code]) byCode[c.code] = c;
    }
    var cards = inner.querySelectorAll('.course-card');
    for (var j = 0; j < cards.length; j++) {
      var card = cards[j];
      if (card.getAttribute('data-sh')) continue;
      var codeEl = card.querySelector('.course-code');
      if (!codeEl) continue;
      var info = byCode[(codeEl.textContent || '').trim()];
      if (!info) continue; // 索引里没这张卡 → 跳过，不乱标
      var meta = card.querySelector('.course-meta');
      if (!meta) continue;

      var badges = [];
      var hasMat = info.materials > 0;
      var hasBank = info.bank > 0;
      if (hasMat) badges.push({ cls: 'sh-ok', text: '资料 ' + info.materials });
      if (hasBank) badges.push({ cls: 'sh-bank', text: '题库 ' + info.bank });
      if (!hasMat && !hasBank) badges.push({ cls: 'sh-miss', text: '缺资料' });

      for (var k = 0; k < badges.length; k++) {
        var sp = document.createElement('span');
        sp.className = 'sh-badge ' + badges[k].cls;
        sp.textContent = badges[k].text;
        meta.appendChild(sp);
      }
      card.setAttribute('data-sh', '1');
    }
  }

  /* ── 页首横幅 ── */
  function buildTodo(entry) {
    var gaps = [];
    for (var i = 0; i < entry.courses.length; i++) {
      var c = entry.courses[i];
      if (c.materials > 0 || c.bank > 0) continue;
      gaps.push(c.name);
    }
    gaps.sort(function (a, b) {
      try { return a.localeCompare(b, 'zh-Hans-CN'); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; }
    });

    var items = [];
    for (var g = 0; g < gaps.length && items.length < 3; g++) {
      items.push(
        '<li><b>' + esc(gaps[g]) + '</b> 还没有资料，<a href="/contribute">去补一份</a></li>'
      );
    }
    // 缺口不足 3 个 → 用通用动作补齐
    var fillers = [
      '去 <a href="/quiz">组题练习</a> 做一章题，边做边补漏',
      '<a href="/stories">看看学长怎么说</a> —— 先搞清楚这门课怎么考',
      '在 <a href="/plan">学习计划</a> 里给这学期排个节奏',
    ];
    for (var f = 0; items.length < 3 && f < fillers.length; f++) {
      items.push('<li>' + fillers[f] + '</li>');
    }
    if (!items.length) return '';
    return (
      '<div class="sh-todo"><div class="sh-todo-title">本周必看三件事</div>' +
      '<ol class="sh-todo-list">' + items.join('') + '</ol></div>'
    );
  }

  function buildBanner(entry) {
    var total = entry.total || 0;
    var health = typeof entry.health === 'number' ? entry.health : 0;
    var low = health < 40 ? ' is-low' : '';
    var pct = Math.max(0, Math.min(100, health));

    var box = document.createElement('div');
    box.className = 'sh-banner';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', '本学期资料健康度');
    box.innerHTML =
      '<div class="sh-top">' +
        '<span class="sh-health-label">本学期资料健康度' +
          '<strong class="sh-health-num' + low + '">' + pct + '%</strong></span>' +
      '</div>' +
      '<div class="sh-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" ' +
        'aria-valuenow="' + pct + '" aria-label="资料健康度">' +
        '<span class="sh-bar-fill' + low + '" style="width:' + pct + '%"></span></div>' +
      '<div class="sh-stats">' +
        '<div class="sh-stat"><b>' + entry.withMaterials + '/' + total + '</b><span>有资料</span></div>' +
        '<div class="sh-stat"><b>' + entry.withBank + '/' + total + '</b><span>有题库</span></div>' +
        '<div class="sh-stat"><b>' + entry.withSyllabus + '/' + total + '</b><span>有大纲</span></div>' +
      '</div>' +
      buildTodo(entry);
    return box;
  }

  function run() {
    if (pending) return;
    try {
      var p = currentPath();
      observed = p;
      if (!/\/semester\d+$/.test(p)) return; // 非学期页，静默退出
      var inner = findContentInner();
      if (!inner) return;
      if (inner.getAttribute('data-sh-page') === p) return; // 本页已处理过

      pending = true;
      getIndex()
        .then(function (data) {
          pending = false;
          if (!data || !data.semesters) return;
          if (currentPath() !== p) return; // 期间跳走了
          var entry = data.semesters[p];
          if (!entry || !entry.total) return;
          var host = findContentInner();
          if (!host || host.getAttribute('data-sh-page') === p) return;

          ensureStyle();
          decorateCards(host, entry);
          if (!host.querySelector('.sh-banner')) {
            var banner = buildBanner(entry);
            host.insertBefore(banner, host.firstChild);
          }
          host.setAttribute('data-sh-page', p);
        })
        .catch(function () { pending = false; });
    } catch (e) {
      pending = false;
    }
  }

  // SPA 路由切换后 DOM 会重建，用 MutationObserver 兜底重跑（有去重标记，不会死循环）
  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; run(); }, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  try {
    if (document.body) {
      new MutationObserver(function () {
        if (currentPath() !== observed) schedule();
      }).observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) {}
})();
