// 课程页动态内容加载器
// ②课程资料 ← data/materials.json（含在线预览，支持同名/实验课等别名兜底）
// ③练习题 ④推荐资源 ⑤ta说 ← data/content.json
// 🔗相似课程索引 ← /data/course-index.json（静态课程簇索引）
(function () {
  var BASE = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com';
  var MATERIALS_URL = BASE + '/data/materials.json';
  var CONTENT_URL = BASE + '/data/content.json';
  var INDEX_URL = '/data/course-index.json';
  var cache = {};

  // 课程簇索引：{ byName: {课程名→canonical}, clusters: [{canonical, aliases:[{name,relation,path}], related:[{name,note,path}], lookupNames}] }
  function getIndex() {
    if (cache[INDEX_URL]) return Promise.resolve(cache[INDEX_URL]);
    return fetch(INDEX_URL, { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (d) { cache[INDEX_URL] = d; return d; })
      .catch(function () { cache[INDEX_URL] = null; return null; });
  }
  function findCluster(index, key) {
    if (!index || !index.byName) return null;
    var canon = index.byName[key];
    if (!canon) return null;
    var list = index.clusters || [];
    for (var i = 0; i < list.length; i++) if (list[i].canonical === canon) return list[i];
    return null;
  }

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
    // PDF 与 Office：都走 /api/preview 代理（PDF 强制 inline；Office 由数据万象转 PDF）
    if (ext === 'pdf' || OFFICE.indexOf(ext) >= 0) {
      var key = m.url.replace(BASE + '/', '');
      return { type: 'iframe', url: '/api/preview?key=' + encodeURIComponent(key) };
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
    Promise.all([getJson(MATERIALS_URL), getIndex()]).then(function (rs) {
      var data = rs[0] || {};
      var index = rs[1];
      var list = data[code] || [];
      var source = code;
      // 本课无资料 → 沿课程簇别名兜底（同名课/理论课配套等）
      if (!list.length && index) {
        var cluster = findCluster(index, code);
        var names = (cluster && cluster.lookupNames) || [];
        for (var i = 0; i < names.length; i++) {
          if (names[i] !== code && data[names[i]] && data[names[i]].length) {
            list = data[names[i]];
            source = names[i];
            break;
          }
        }
      }
      if (!list.length) {
        el.innerHTML = '<blockquote><p>📂 资料建设中，欢迎<a href="/contribute">投稿</a>。</p></blockquote>';
        return;
      }
      var note = '';
      if (source !== code) {
        note = '<div class="mat-alias-note">📎 本课暂无独立资料，已为你调出同类课程 <strong>《' + esc(source) + '》</strong> 的资料：</div>';
      }
      var rows = list.map(function (m, i) {
        var pv = previewInfo(m);
        var pvLink = pv ? '<a href="javascript:;" class="pv-link" data-i="' + i + '">预览</a> · ' : '';
        return '<tr><td>' + esc(m.name) + '</td>' +
          '<td style="text-align:center">' + esc((m.ext || '').toUpperCase()) + '</td>' +
          '<td style="text-align:center">' + fmtSize(m.size) + '</td>' +
          '<td style="text-align:center;white-space:nowrap">' + pvLink + '<a href="' + esc(m.url) + '" class="dl-link">下载</a></td></tr>';
      }).join('');
      el.innerHTML = note + '<table><thead><tr><th>文件名</th><th>格式</th><th>大小</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
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

  // ── 相似课程交叉索引（挂在课程资料区块之后） ──
  var RELATION_LABEL = { '主课': '理论课', '实验': '实验课', '实习': '教学实习', '实践': '综合实践', '课设': '课程设计', '系列': '系列课' };

  function ensureRelatedStyle() {
    if (document.getElementById('related-block-style')) return;
    var st = document.createElement('style');
    st.id = 'related-block-style';
    st.textContent =
      '.mat-alias-note{margin:0 0 10px;padding:8px 12px;background:#F0F7F5;border:1px solid #CBE3DD;border-radius:8px;font-size:.85rem;color:#3F6B62}' +
      '.course-related-block{margin:24px 0;padding:16px 18px;border:1px solid #E5E0D6;border-radius:12px;background:#FAF8F4}' +
      '.course-related-block h4{margin:0 0 10px;font-size:.95rem;color:#0D5C5A}' +
      '.course-related-chips{display:flex;flex-wrap:wrap;gap:8px}' +
      '.cr-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #0D5C5A33;border-radius:16px;' +
      'font-size:.85rem;color:#0D5C5A;text-decoration:none;background:#fff;transition:all .15s}' +
      '.cr-chip:hover{background:#0D5C5A;color:#fff;text-decoration:none}' +
      '.cr-chip .cr-rel{font-size:.72rem;opacity:.75}' +
      '.cr-note{font-size:.78rem;color:#8A8578;margin-left:2px}';
    document.head.appendChild(st);
  }

  function renderRelated(key) {
    getIndex().then(function (index) {
      if (!index) return;
      var cluster = findCluster(index, key);
      if (!cluster) return;
      var siblings = (cluster.aliases || []).filter(function (a) {
        return a.name !== key && a.path;
      });
      var related = (cluster.related || []).filter(function (r) { return r.path; });
      if (!siblings.length && !related.length) return;
      ensureRelatedStyle();

      var html = '<div class="course-related-block"><h4>🔗 同类课程索引</h4>';
      if (siblings.length) {
        html += '<div class="course-related-chips">';
        siblings.forEach(function (a) {
          var rel = RELATION_LABEL[a.relation] || a.relation || '';
          html += '<a class="cr-chip" href="' + esc(a.path) + '">' + esc(a.name) +
            (rel ? '<span class="cr-rel">' + esc(rel) + '</span>' : '') + '</a>';
        });
        html += '</div>';
      }
      if (related.length) {
        if (siblings.length) html += '<div style="height:10px"></div>';
        html += '<div class="course-related-chips">';
        related.forEach(function (r) {
          html += '<a class="cr-chip" href="' + esc(r.path) + '">' + esc(r.name) +
            (r.note ? '<span class="cr-rel">' + esc(r.note) + '</span>' : '') + '</a>';
        });
        html += '</div>';
      }
      html += '</div>';

      var anchor = document.getElementById('course-materials');
      if (anchor && anchor.parentNode) {
        var holder = document.createElement('div');
        holder.innerHTML = html;
        anchor.parentNode.insertBefore(holder.firstChild, anchor.nextSibling);
      }
    });
  }

  function scan() {
    var m = document.getElementById('course-materials');
    if (m && !m.dataset.rendered) { m.dataset.rendered = '1'; renderMaterials(m, m.dataset.key); renderRelated(m.dataset.key); }
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
