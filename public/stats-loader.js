// 站点访问埋点：页面加载时记录一次访问（排除管理后台自身）
(function () {
  if (location.pathname.indexOf('/admin/') === 0) return;
  try {
    fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'track', type: 'visit' })
    });
  } catch (e) {}
})();
