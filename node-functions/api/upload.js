// EdgeOne Pages 云函数 — 资料上传后端
// 路由: /api/upload
// 环境变量: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION

import * as crypto from 'node:crypto';
import { verifyToken, auditLog } from './_auth.js';
import { listAllObjects, deleteObject, readJsonWithEtagSigned, writeJsonIfMatch } from './_cos.js';

const REGION = process.env.COS_REGION || 'ap-chengdu';
const BUCKET = process.env.COS_BUCKET || 'scau-files-1440179010';
const HOST = `${BUCKET}.cos.${REGION}.myqcloud.com`;
const SECRET_ID = process.env.COS_SECRET_ID;
const SECRET_KEY = process.env.COS_SECRET_KEY;
const DATA_KEY = 'data/materials.json';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

function hmacSha1(key, msg) {
  return crypto.createHmac('sha1', key).update(msg).digest('hex');
}

function sha1Hex(msg) {
  return crypto.createHash('sha1').update(msg).digest('hex');
}

function cosAuth(method, key) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 1800}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `${method}\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  return `q-sign-algorithm=sha1&q-ak=${SECRET_ID}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}

function presignUrl(key, expires = 1800) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + expires}`;
  const signKey = hmacSha1(SECRET_KEY, keyTime);
  const httpString = `put\n/${key}\n\nhost=${HOST}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  const params = [
    'q-sign-algorithm=sha1',
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  return { uploadUrl: `https://${HOST}/${key}?${params}`, key };
}

async function readMaterials() {
  const res = await fetch(`https://${HOST}/${DATA_KEY}`, { cache: 'no-store' });
  if (!res.ok) return {};
  return await res.json();
}

async function writeMaterials(data) {
  const res = await fetch(`https://${HOST}/${DATA_KEY}`, {
    method: 'PUT',
    headers: {
      host: HOST,
      authorization: cosAuth('put', DATA_KEY),
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!SECRET_ID || !SECRET_KEY) {
    return json({ error: 'COS 密钥未配置，请在 EdgeOne 环境变量中设置 COS_SECRET_ID / COS_SECRET_KEY' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;
  const who = verifyToken(body.token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    await auditLog(who.username, who.role, action, '');

    // ────────── 存量盘活：扫描 COS 已有文件 ──────────
    // 只列举不写入。按「学期/课程」或「课程编号」目录分组，供后台人工确认后入库。
    if (action === 'scan') {
      const r = await listAllObjects('files/');
      if (!r.ok) return json({ error: '列举 COS 失败 status=' + r.status }, 502);

      const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', '7z']);
      const docs = [];
      let fragments = 0;
      for (const it of r.items) {
        const ext = String(it.key).split('.').pop().toLowerCase();
        if (!DOC_EXT.has(ext)) { fragments++; continue; }
        docs.push(it);
      }

      const groups = new Map();
      for (const d of docs) {
        const parts = d.key.split('/'); // ['files', 学期?, 课程?, 子目录?, 文件名]
        // 只有 ≥4 段时第 3 段才是目录；3 段说明是 files/<课程编号>/<文件名>
        const dir = parts.length >= 4 ? parts[1] + '/' + parts[2] : parts[1] || '';
        if (!groups.has(dir)) groups.set(dir, []);
        groups.get(dir).push({
          key: d.key,
          size: d.size,
          lastModified: d.lastModified,
          fileName: parts[parts.length - 1],
        });
      }

      return json({
        ok: true,
        scanned: r.items.length,
        pages: r.pages,
        docs: docs.length,
        fragments,
        groups: [...groups.entries()]
          .map(([dir, files]) => ({ dir, files }))
          .sort((a, b) => b.files.length - a.files.length),
      });
    }

    // ────────── 存量盘活：批量入库 ──────────
    // ⚠️ 必须一次读一次写 + ETag，否则 100+ 条会互相覆盖。
    // ⚠️ 不设 private ACL —— 前端 materials-loader.js 是匿名 GET，设私有会直接坏掉。
    if (action === 'bulkSave') {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return json({ error: '缺 items' }, 400);
      if (items.length > 500) return json({ error: '单次最多 500 条' }, 400);

      const norm = [];
      for (const it of items) {
        const courseKey = String(it.courseKey || '').trim();
        const key = String(it.key || '').trim();
        if (!courseKey || !key || !key.startsWith('files/')) continue;
        norm.push({
          courseKey,
          name: String(it.name || key.split('/').pop() || '').slice(0, 120),
          url: `https://${HOST}/${key}`,
          ext: (String(key).split('.').pop() || '').toLowerCase(),
          size: Number(it.size) || null,
        });
      }
      if (!norm.length) return json({ error: '没有合法条目' }, 400);

      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, etag } = await readJsonWithEtagSigned(DATA_KEY);
        const state = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const seen = new Set();
        for (const list of Object.values(state)) {
          if (Array.isArray(list)) list.forEach((m) => m && m.url && seen.add(m.url));
        }

        let added = 0;
        let skipped = 0;
        for (const n of norm) {
          if (seen.has(n.url)) { skipped++; continue; }
          if (!Array.isArray(state[n.courseKey])) state[n.courseKey] = [];
          state[n.courseKey].push({ name: n.name, url: n.url, ext: n.ext, size: n.size });
          seen.add(n.url);
          added++;
        }
        if (!added) return json({ ok: true, added: 0, skipped, warning: '全部条目已存在' });

        const w = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (w.ok) {
          await auditLog(who.username, who.role, 'bulkSave', `${added} 条 / ${new Set(norm.map((n) => n.courseKey)).size} 门课`);
          return json({ ok: true, added, skipped });
        }
      }
      return json({ error: '写入冲突，请重试', added: 0, skipped: 0 }, 409);
    }

    // ────────── 清理已下线功能的残留对象（白名单，防误删）──────────
    if (action === 'purge') {
      const PURGE_ALLOW = ['data/lottery.json'];
      const key = String(body.key || '');
      if (!PURGE_ALLOW.includes(key)) return json({ error: '该对象不在可清理白名单内' }, 400);
      const r = await deleteObject(key);
      await auditLog(who.username, who.role, 'purge', key + ' status=' + r.status);
      return json({ ok: r.ok, status: r.status, key });
    }

    if (action === 'presign') {
      const ext = String(body.filename || '').split('.').pop().toLowerCase();
      const code = String(body.courseCode || 'misc').replace(/[^0-9]/g, '');
      const safeExt = ext.replace(/[^a-z0-9]/g, '') || 'bin';
      const key = `files/${code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const { uploadUrl } = presignUrl(key);
      return json({ uploadUrl, key });
    }

    if (action === 'save') {
      const { courseKey, name, key, ext, size, replaceUrl } = body;
      if (!courseKey || !name || !key) return json({ error: '缺参数' }, 400);
      const data = await readMaterials();
      let list = data[courseKey] || [];
      if (replaceUrl) {
        list = list.filter((m) => m.url !== replaceUrl);
      }
      list.push({ name, url: `https://${HOST}/${key}`, ext: ext || '', size: size || null });
      data[courseKey] = list;
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    if (action === 'remove') {
      const { courseKey, url } = body;
      const data = await readMaterials();
      const list = (data[courseKey] || []).filter((m) => m.url !== url);
      if (list.length) data[courseKey] = list;
      else delete data[courseKey];
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    if (action === 'rename') {
      const { courseKey, url, newName } = body;
      const data = await readMaterials();
      const list = (data[courseKey] || []).map((m) => (m.url === url ? { ...m, name: newName } : m));
      data[courseKey] = list;
      const ok = await writeMaterials(data);
      return json({ ok });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
