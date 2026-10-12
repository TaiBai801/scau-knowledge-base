// 后台共享鉴权脚本：每个后台页顶部引入
// 无 token → 跳登录；异步 verify 失效 → 清会话跳登录；同步暴露 window.ADMIN = {token, role, username}
(function () {
  var token = sessionStorage.getItem('admin_token');
  var role = sessionStorage.getItem('admin_role');
  var username = sessionStorage.getItem('admin_username');
  if (!token) { location.replace('/admin/login.html'); return; }
  window.ADMIN = { token: token, role: Number(role) || 0, username: username || '' };
  window.logout = function () { sessionStorage.clear(); location.replace('/admin/login.html'); };

  // 异步校验，失效则跳登录（真正的权限由云函数端 token 校验兜底）
  try {
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token: token })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.valid) {
        sessionStorage.clear();
        location.replace('/admin/login.html');
      }
    }).catch(function () {});
  } catch (e) {}
})();
