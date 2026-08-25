// 课程页动态内容加载器
// ②课程资料 ← data/materials.json
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

  function renderMaterials(el, code) {
    getJson(MATERIALS_URL).then(function (data) {
      var list = (data && data[code]) || [];
      if (!list.length) {
        el.innerHTML = '<blockquote><p>📂 资料建设中，欢迎<a href="/contribute">投稿</a>。</p></blockquote>';
        return;
      }
      var rows = list.map(function (m) {
        return '<tr><td>' + esc(m.name) + '</td>' +
          '<td style="text-align:center">' + (m.ext || '').toUpperCase() + '</td>' +
          '<td style="text-align:center">' + fmtSize(m.size) + '</td>' +
          '<td style="text-align:center"><a href="' + esc(m.url) + '">下载</a></td></tr>';
      }).join('');
      el.innerHTML = '<table><thead><tr><th>文件名</th><th>格式</th><th>大小</th><th>下载</th></tr></thead><tbody>' + rows + '</tbody></table>';
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
    if (m && !m.dataset.rendered) { m.dataset.rendered = '1'; renderMaterials(m, m.dataset.code); }
    var e = document.getElementById('course-exercises');
    if (e && !e.dataset.rendered) { e.dataset.rendered = '1'; renderSection(e, e.dataset.code, 'exercises'); }
    var r = document.getElementById('course-resources');
    if (r && !r.dataset.rendered) { r.dataset.rendered = '1'; renderSection(r, r.dataset.code, 'resources'); }
    var t = document.getElementById('course-tasay');
    if (t && !t.dataset.rendered) { t.dataset.rendered = '1'; renderSection(t, t.dataset.code, 'tasay'); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
