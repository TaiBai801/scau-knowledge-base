// 学期课表视角 · 开学礼包
// 读 /data/semester-index.json（构建期由 scripts/gen-semester-index.mjs 产出），
// 在学期页上做三件事：
//   ① 给每张课程卡加「资料 / 题库 / 缺资料」徽标
//   ② 页首插入「培养方案第N学期 资料健康度 + 本周必看三件事」横幅
//   ③ 每张卡加「缺什么」按钮 → 提交线索给管理员（复用 /api/submissions）
// 无依赖、无框架；任何异常都吞掉，绝不影响页面本身。
(function () {
  var INDEX_URL = '/data/semester-index.json';
  var SUBMIT_URL = '/api/submissions';
  var STYLE_ID = 'sh-style';
  var missingCache = {};
  var pending = false;
  var observed = '';

  // 与 /api/submissions 的 KINDS 白名单保持一致，顺序也照它
  var KINDS = ['课件', '习题', '真题', '笔记', '其他'];

  // 匿名设备指纹：与缺口榜页共用 kx_fp，避免同一台设备出现两个身份
  function fp() {
    var f = '';
    try {
      f = localStorage.getItem('kx_fp') || localStorage.getItem('bounty_fp') || '';
    } catch (e) {}
    if (!f) {
      f = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try {
        localStorage.setItem('kx_fp', f);
      } catch (e) {}
    }
    return f;
  }

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
      '.sh-hint{margin-top:10px;font-size:.76rem;color:#6B6857;line-height:1.7}' +
      '.sh-hint a{color:#0D5C5A;text-decoration:underline;text-underline-offset:2px}' +
      '.dark .sh-hint{color:#9AA8A4}' +
      '.dark .sh-hint a{color:#7FC9BE}' +
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
      '@media (max-width:560px){.sh-stat{min-width:0;padding:6px 4px}}' +
      /* ── 「缺什么」按钮 ── */
      '.sh-ask{display:inline-flex;align-items:center;height:20px;padding:0 8px;margin-left:2px;' +
      'border:1px solid #0D5C5A;border-radius:10px;background:transparent;color:#0D5C5A;' +
      'font-size:.72rem;line-height:1;cursor:pointer;font-family:inherit;transition:all .15s}' +
      '.sh-ask:hover{background:#0D5C5A;color:#fff}' +
      '.sh-ask:focus-visible{outline:2px solid #0D5C5A;outline-offset:2px}' +
      '.dark .sh-ask{border-color:#7FC9BE;color:#7FC9BE}' +
      '.dark .sh-ask:hover{background:#7FC9BE;color:#151B1A}' +
      /* ── 提交弹窗 ── */
      '.sh-mask{position:fixed;inset:0;background:rgba(20,30,30,.45);display:flex;' +
      'align-items:center;justify-content:center;padding:16px;z-index:9999}' +
      '.sh-dialog{background:#fff;border-radius:12px;padding:20px 22px;width:min(460px,100%);' +
      'max-height:88vh;overflow-y:auto;box-shadow:0 18px 48px rgba(0,0,0,.2);' +
      'font-size:.86rem;color:#4A4A44;text-align:left}' +
      '.sh-dialog h3{margin:0 0 4px;font-size:1rem;font-weight:600;color:#0D5C5A}' +
      '.sh-dialog .sh-sub{margin:0 0 14px;font-size:.76rem;color:#6B6857;line-height:1.7}' +
      '.sh-field{display:block;margin-bottom:10px}' +
      '.sh-field>span{display:block;font-size:.76rem;color:#6B6857;margin-bottom:4px}' +
      '.sh-field input,.sh-field select,.sh-field textarea{width:100%;box-sizing:border-box;' +
      'padding:7px 9px;border:1px solid #E6E2D8;border-radius:7px;font-size:.84rem;' +
      'font-family:inherit;background:#fff;color:#4A4A44}' +
      '.sh-field textarea{resize:vertical;line-height:1.6}' +
      '.sh-field input:focus,.sh-field select:focus,.sh-field textarea:focus{' +
      'outline:none;border-color:#0D5C5A}' +
      '.sh-msg{font-size:.78rem;margin:8px 0 0;line-height:1.6}' +
      '.sh-msg.err{color:#B23B36}' +
      '.sh-msg.ok{color:#0D5C5A}' +
      '.sh-act{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}' +
      '.sh-btn{border:1px solid #E6E2D8;background:#fff;color:#4A4A44;border-radius:7px;' +
      'padding:6px 14px;font-size:.82rem;cursor:pointer;font-family:inherit}' +
      '.sh-btn.pri{background:#0D5C5A;border-color:#0D5C5A;color:#fff}' +
      '.sh-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.dark .sh-dialog{background:#151B1A;color:#C7D2CE}' +
      '.dark .sh-dialog h3{color:#7FC9BE}' +
      '.dark .sh-dialog .sh-sub{color:#9AA8A4}' +
      '.dark .sh-field>span{color:#9AA8A4}' +
      '.dark .sh-field input,.dark .sh-field select,.dark .sh-field textarea{' +
      'background:#1F2A28;border-color:#2C3331;color:#C7D2CE}' +
      '.dark .sh-btn{background:#1F2A28;border-color:#2C3331;color:#C7D2CE}' +
      '.dark .sh-btn.pri{background:#0D5C5A;border-color:#0D5C5A;color:#fff}';
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

  /* ── 「缺什么」提交弹窗 ── */
  var modal = null;

  function buildModal() {
    if (modal) return modal;
    var mask = document.createElement('div');
    mask.className = 'sh-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', '提交资料缺口');

    var opts = '';
    for (var i = 0; i < KINDS.length; i++) {
      opts += '<option value="' + KINDS[i] + '">' + KINDS[i] + '</option>';
    }

    mask.innerHTML =
      '<div class="sh-dialog">' +
        '<h3>这门课缺什么？</h3>' +
        '<p class="sh-sub">只提交线索，<b>不用上传文件</b>。管理员核实后会统一采补。' +
          '页面不会立刻变化，但你的反馈会进缺口清单。</p>' +
        '<label class="sh-field"><span>课程</span>' +
          '<input type="text" class="sh-course" readonly /></label>' +
        '<label class="sh-field"><span>缺哪一类</span>' +
          '<select class="sh-kind">' + opts + '</select></label>' +
        '<label class="sh-field"><span>具体说明</span>' +
          '<textarea class="sh-note" rows="4" maxlength="300" ' +
          'placeholder="例如：缺 2023 年期末真题；或「第七章的课件讲义没有」"></textarea></label>' +
        '<label class="sh-field"><span>联系方式（可选）</span>' +
          '<input type="text" class="sh-contact" maxlength="60" ' +
          'placeholder="QQ / 邮箱，便于管理员找你核实" /></label>' +
        '<p class="sh-msg" role="status"></p>' +
        '<div class="sh-act">' +
          '<button type="button" class="sh-btn sh-cancel">关闭</button>' +
          '<button type="button" class="sh-btn pri sh-send">提交给管理员</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(mask);
    modal = mask;

    mask.querySelector('.sh-cancel').addEventListener('click', closeModal);
    mask.addEventListener('click', function (e) {
      if (e.target === mask) closeModal();
    });
    mask.querySelector('.sh-send').addEventListener('click', sendAsk);

    return modal;
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    modal.removeAttribute('data-open');
  }

  function msg(text, kind) {
    if (!modal) return;
    var el = modal.querySelector('.sh-msg');
    el.textContent = text || '';
    el.className = 'sh-msg' + (kind ? ' ' + kind : '');
  }

  function openAsk(courseName) {
    try {
      ensureStyle();
      var m = buildModal();
      m.style.display = 'flex';
      m.querySelector('.sh-course').value = courseName || '';
      m.querySelector('.sh-note').value = '';
      m.querySelector('.sh-contact').value = '';
      m.querySelector('.sh-kind').value = '课件';
      m.querySelector('.sh-send').disabled = false;
      msg('');
      var note = m.querySelector('.sh-note');
      if (note) setTimeout(function () { try { note.focus(); } catch (e) {} }, 30);
      m.setAttribute('data-open', '1');
    } catch (e) {}
  }

  function sendAsk() {
    if (!modal) return;
    var course = (modal.querySelector('.sh-course').value || '').trim();
    var kind = modal.querySelector('.sh-kind').value;
    var note = (modal.querySelector('.sh-note').value || '').trim();
    var contact = (modal.querySelector('.sh-contact').value || '').trim();
    var btn = modal.querySelector('.sh-send');

    if (!course) return msg('缺少课程名', 'err');
    if (!note) return msg('请简单说明缺什么（一句话即可）', 'err');

    btn.disabled = true;
    msg('提交中…', '');

    fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        fp: fp(),
        course: course,
        kind: kind,
        note: note,
        contact: contact,
      }),
    })
      .then(function (res) {
        return res.json().then(function (d) {
          if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
          return d;
        });
      })
      .then(function (d) {
        msg(d.message || '已提交给管理员，核实后会上架', 'ok');
        modal.querySelector('.sh-note').value = '';
        modal.querySelector('.sh-contact').value = '';
        btn.disabled = false;
      })
      .catch(function (e) {
        msg(e.message || '提交失败，请稍后重试', 'err');
        btn.disabled = false;
      });
  }

  // Esc 关闭
  try {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.getAttribute('data-open') === '1') {
        closeModal();
        modal.removeAttribute('data-open');
      }
    });
  } catch (e) {}

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

      // 「缺什么」按钮：带上课程名，点了就能提交线索
      var ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'sh-ask';
      ask.textContent = '缺什么';
      ask.setAttribute('aria-label', '反馈《' + info.name + '》缺什么资料');
      ask.addEventListener(
        'click',
        (function (name) {
          return function (e) {
            e.preventDefault();
            e.stopPropagation();
            openAsk(name);
          };
        })(info.name)
      );
      meta.appendChild(ask);

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
    // 明确这是「培养方案视角」的第 N 学期，避免与学生真实的选课情况混淆
    var termLabel =
      typeof entry.semester === 'number' ? '培养方案 · 第 ' + entry.semester + ' 学期' : '培养方案';

    var box = document.createElement('div');
    box.className = 'sh-banner';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', termLabel + ' 资料健康度');
    box.innerHTML =
      '<div class="sh-top">' +
        '<span class="sh-health-label">' + termLabel + ' 资料健康度' +
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
      '<div class="sh-hint">这里有可能是培养方案安排的课，不一定是你在上的课。' +
        '提前选修或重修的同学，可以到 <a href="/my">我的本学期</a> 自己勾一份清单。</div>' +
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
