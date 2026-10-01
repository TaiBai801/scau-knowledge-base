// 课程页动态内容加载器
// ②课程资料 ← data/materials.json（含在线预览）
// ③练习题 ④推荐资源 ⑤ta说 ← data/content.json
(function () {
  var BASE = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com';
  var MATERIALS_URL = BASE + '/data/materials.json';
  var CONTENT_URL = BASE + '/data/content.json';
  var cache = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function getJson(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (d) { cache[url] = d; return d; });
  }

  // 轻量 markdown 渲染（段落 / **加粗** / [链接] / - 列表）
  function inline(s) {
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  }
  function mdToHtml(md) {
    var text = esc(md).trim();
    if (!text) return '';
    var paras = text.split(/\n\s*\n/);
    return paras.map(function (p) {
      var lines = p.split('\n');
      var isList = lines.every(function (l) { return /^\s*[-*]\s+/.test(l) || l.trim() === ''; });
      if (isList) {
        var items = lines.filter(function (l) { return l.trim() !== ''; })
          .map(function (l) { return '<li>' + inline(l.replace(/^\s*[-*]\s+/, '')) + '</li>'; }).join('');
        return '<ul>' + items + '</ul>';
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }

  // ── 在线预览 ──
  var IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  var OFFICE = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'];

  // 返回 { type: 'iframe'|'image', url } 或 null（不支持预览）
  function previewInfo(m) {
    var ext = String(m.ext || '').toLowerCase();
    if (IMG.indexOf(ext) >= 0) return { type: 'image', url: m.url };
    // PDF：走 /api/preview 代理，强制 Content-Disposition: inline（COS 默认 attachment 会触发下载）
    if (ext === 'pdf') {
      var key = m.url.replace(BASE + '/', '');
      return { type: 'iframe', url: '/api/preview?key=' + encodeURIComponent(key) };
    }
    if (OFFICE.indexOf(ext) >= 0) {
      return { type: 'iframe', url: 'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(m.url) };
    }
    return null;
  }

  var modalReady = false;
  function ensureModal() {
    if (modalReady) return;
    modalReady = true;
    var style = document.createElement('style');
    style.textContent =
      '.pv-mask{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.68);display:flex;flex-direction:column}' +
      '.pv-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.65rem 1.2rem;background:#0D5C5A;color:#fff}' +
      '.pv-title{font-size:.92rem;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pv-actions{display:flex;align-items:center;gap:.7rem;flex-shrink:0}' +
      '.pv-btn{padding:.3rem .9rem;border-radius:6px;border:1px solid rgba(255,255,255,.45);color:#fff;background:transparent;font-size:.82rem;cursor:pointer;text-decoration:none;display:inline-block}' +
      '.pv-btn:hover{background:rgba(255,255,255,.15)}' +
      '.pv-close{background:#fff;color:#0D5C5A;border-color:#fff;font-weight:600}' +
      '.pv-close:hover{background:#e6f7ef}' +
      '.pv-body{flex:1;position:relative;background:#525659}' +
      '.pv-body iframe{position:absolute;inset:0;width:100%;height:100%;border:none;background:#fff}' +
      '.pv-body img{display:block;max-width:100%;margin:0 auto}' +
      '.pv-tip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:.9rem;text-align:center;padding:1rem}';
    document.head.appendChild(style);

    var mask = document.createElement('div');
    mask.className = 'pv-mask';
    mask.id = 'pv-mask';
    mask.style.display = 'none';
    mask.innerHTML =
      '<div class="pv-head">' +
        '<span class="pv-title" id="pv-title"></span>' +
        '<span class="pv-actions">' +
          '<a class="pv-btn" id="pv-open" target="_blank" rel="noopener">新窗口打开</a>' +
          '<button class="pv-btn pv-close" id="pv-close">✕ 关闭</button>' +
        '</span>' +
      '</div>' +
      '<div class="pv-body" id="pv-body"><div class="pv-tip">正在加载预览…</div></div>';
    document.body.appendChild(mask);

    document.getElementById('pv-close').addEventListener('click', closePreview);
    mask.addEventListener('click', function (e) { if (e.target === mask) closePreview(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePreview(); });
  }

  function openPreview(m) {
    var pv = previewInfo(m);
    if (!pv) return;
    ensureModal();
    var mask = document.getElementById('pv-mask');
    document.getElementById('pv-title').textContent = m.name;
    document.getElementById('pv-open').href = pv.url;
    var body = document.getElementById('pv-body');
    body.innerHTML = '<div class="pv-tip">正在加载预览…</div>';
    if (pv.type === 'image') {
      var img = new Image();
      img.onload = function () { body.innerHTML = ''; body.appendChild(img); };
      img.onerror = function () { body.innerHTML = '<div class="pv-tip">图片加载失败，请下载查看</div>'; };
      img.alt = m.name;
      img.src = pv.url;
    } else {
      body.innerHTML = '<iframe src="' + esc(pv.url) + '" title="' + esc(m.name) + '"></iframe>';
    }
    mask.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    var mask = document.getElementById('pv-mask');
    if (mask) {
      mask.style.display = 'none';
      document.getElementById('pv-body').innerHTML = '<div class="pv-tip">正在加载预览…</div>';
    }
    document.body.style.overflow = '';
  }

  function renderMaterials(el, code) {
    getJson(MATERIALS_URL).then(function (data) {
      var list = (data && data[code]) || [];
      if (!list.length) {
        el.innerHTML = '<blockquote><p>📂 资料建设中，欢迎<a href="/contribute">投稿</a>。</p></blockquote>';
        return;
      }
      var rows = list.map(function (m, i) {
        var pv = previewInfo(m);
        var pvLink = pv ? '<a href="javascript:;" class="pv-link" data-i="' + i + '">预览</a> · ' : '';
        return '<tr><td>' + esc(m.name) + '</td>' +
          '<td style="text-align:center">' + esc((m.ext || '').toUpperCase()) + '</td>' +
          '<td style="text-align:center">' + fmtSize(m.size) + '</td>' +
          '<td style="text-align:center;white-space:nowrap">' + pvLink + '<a href="' + esc(m.url) + '" class="dl-link">下载</a></td></tr>';
      }).join('');
      el.innerHTML = '<table><thead><tr><th>文件名</th><th>格式</th><th>大小</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
      // 预览
      el.querySelectorAll('.pv-link').forEach(function (a) {
        a.addEventListener('click', function () { openPreview(list[+a.dataset.i]); });
      });
      // 下载埋点
      el.querySelectorAll('.dl-link').forEach(function (a) {
        a.addEventListener('click', function () {
          try {
            fetch('/api/stats', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'track', type: 'download' })
            });
          } catch (e) {}
        });
      });
    }).catch(function () {
      el.innerHTML = '<blockquote><p>📂 资料加载失败，请稍后刷新重试。</p></blockquote>';
    });
  }

  var SECTION_FALLBACK = {
    exercises: '<blockquote><p>✏️ 整理中，欢迎<a href="/contribute">投稿</a>。</p></blockquote>',
    resources: '<blockquote><p>🚧 待老师推荐，<a href="/contribute">投稿入口</a>。</p></blockquote>',
    tasay: '<blockquote><p>💬 招募中！学过本课程且成绩不错的同学，欢迎<a href="/contribute">投稿</a>。</p></blockquote>'
  };

  function renderSection(el, code, field) {
    getJson(CONTENT_URL).then(function (data) {
      var entry = (data && data[code]) || {};
      var text = entry[field] || '';
      var html = mdToHtml(text);
      el.innerHTML = html || SECTION_FALLBACK[field];
    }).catch(function () {
      el.innerHTML = SECTION_FALLBACK[field];
    });
  }

  function scan() {
    var m = document.getElementById('course-materials');
    if (m && !m.dataset.rendered) { m.dataset.rendered = '1'; renderMaterials(m, m.dataset.key); }
    var e = document.getElementById('course-exercises');
    if (e && !e.dataset.rendered) { e.dataset.rendered = '1'; renderSection(e, e.dataset.key, 'exercises'); }
    var r = document.getElementById('course-resources');
    if (r && !r.dataset.rendered) { r.dataset.rendered = '1'; renderSection(r, r.dataset.key, 'resources'); }
    var t = document.getElementById('course-tasay');
    if (t && !t.dataset.rendered) { t.dataset.rendered = '1'; renderSection(t, t.dataset.key, 'tasay'); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
