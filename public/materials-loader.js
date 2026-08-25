// 课程资料动态加载器
// 从 COS 拉取 data/materials.json，按课程码渲染「②课程资料」下载列表
(function () {
  var MATERIALS_URL = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com/data/materials.json';
  var cache = null;

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

  function getData() {
    if (cache) return Promise.resolve(cache);
    return fetch(MATERIALS_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      cache = data;
      return data;
    });
  }

  function render(el, code) {
    getData().then(function (data) {
      var list = (data && data[code]) || [];
      if (!list.length) {
        el.innerHTML = '<blockquote><p>📂 资料建设中，欢迎<a href="/contribute">投稿</a>。</p></blockquote>';
        return;
      }
      var rows = list.map(function (m) {
        var ext = (m.ext || '').toUpperCase();
        return '<tr>' +
          '<td>' + esc(m.name) + '</td>' +
          '<td style="text-align:center">' + ext + '</td>' +
          '<td style="text-align:center">' + fmtSize(m.size) + '</td>' +
          '<td style="text-align:center"><a href="' + esc(m.url) + '">下载</a></td>' +
          '</tr>';
      }).join('');
      el.innerHTML =
        '<table><thead><tr><th>文件名</th><th>格式</th><th>大小</th><th>下载</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>';
    }).catch(function () {
      el.innerHTML = '<blockquote><p>📂 资料加载失败，请稍后刷新重试。</p></blockquote>';
    });
  }

  function scan() {
    var el = document.getElementById('course-materials');
    if (el && !el.dataset.rendered) {
      el.dataset.rendered = '1';
      render(el, el.dataset.code);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  // 处理 VitePress 客户端导航（切换课程页时重新渲染）
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
