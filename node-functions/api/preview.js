// EdgeOne Pages 云函数 — 文件预览代理
// 路由: /api/preview?key=<cos对象key>
// 作用：COS 对 PDF 强制返回 Content-Disposition: attachment（下载），导致 iframe 无法内联预览。
//       本函数从 COS 拉取文件并强制返回 inline，让浏览器原生渲染（PDF）或走前端 iframe。
import { HOST } from './_cos.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const key = (url.searchParams.get('key') || '').trim();

  // 安全校验：只允许 files/ 或 data/ 下的对象，禁止路径穿越
  if (!key || !/^(files|data)\//.test(key) || key.includes('..')) {
    return new Response('bad key', { status: 400 });
  }

  // 透传 COS 的下载参数（如 response-content-disposition 等，供扩展）
  const cosUrl = `https://${HOST}/` + encodeURI(key).replace(/%2F/g, '/');

  try {
    const res = await fetch(cosUrl);
    if (!res.ok) return new Response('file not found', { status: res.status });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') || 'application/octet-stream',
        // 关键：强制 inline，覆盖 COS 的 attachment
        'content-disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(key.split('/').pop() || 'file'),
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e) {
    return new Response('preview error', { status: 500 });
  }
}
