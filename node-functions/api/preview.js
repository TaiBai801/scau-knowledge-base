// EdgeOne Pages 云函数 — 文件预览代理
// 路由: /api/preview?key=<cos对象key>
// - PDF/图片：COS 原样返回并强制 Content-Disposition: inline
// - Office(doc/docx/ppt/pptx/xls/xlsx)：调腾讯云数据万象文档预览(ci-process=doc-preview)转 PDF
import { HOST, presignGetUrl, hasSecret } from './_cos.js';

const OFFICE = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];

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

  const ext = String(key.split('.').pop() || '').toLowerCase();
  const cosUrl = `https://${HOST}/` + encodeURI(key).replace(/%2F/g, '/');

  // ── Office 文件 → 数据万象文档预览转 PDF ──
  if (OFFICE.indexOf(ext) >= 0) {
    if (!hasSecret()) return new Response('CI 密钥未配置', { status: 500 });
    try {
      const ciUrl = presignGetUrl(key, { 'ci-process': 'doc-preview', 'dstType': 'pdf' });
      const ciRes = await fetch(ciUrl);
      if (!ciRes.ok) {
        const errText = await ciRes.text().catch(() => '');
        return new Response('CI preview failed (' + ciRes.status + '): ' + errText.slice(0, 400), { status: ciRes.status });
      }
      return new Response(ciRes.body, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(key.split('/').pop() || 'preview.pdf'),
          'cache-control': 'public, max-age=3600',
          'access-control-allow-origin': '*',
        },
      });
    } catch (e) {
      return new Response('preview error: ' + String((e && e.message) || e), { status: 500 });
    }
  }

  // ── PDF / 图片 → 原样返回（inline） ──
  try {
    const res = await fetch(cosUrl);
    if (!res.ok) return new Response('file not found', { status: res.status });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') || 'application/octet-stream',
        'content-disposition': 'inline; filename*=UTF-8\'\'' + encodeURIComponent(key.split('/').pop() || 'file'),
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    });
  } catch (e) {
    return new Response('preview error', { status: 500 });
  }
}
