// EdgeOne Pages 云函数 — 资料补充提交（学生 → 管理员）
// 路由: /api/submissions
//
// 设计原则（重要）：
//  **学生不直传文件、不直接入库。** 只提交「认领 + 说明 + 联系方式」，落到待办队列，
//  由管理员线下收文件、用 /admin/upload.html 正式上传。
//  这样任何内容在被人看过之前都不会出现在站点上，也不占用 COS 存储。
//  提交无需登录（匿名指纹 fp 去重与限流），因为强制注册会显著降低参与率。
//
// 状态机：pending(新提交) → accepted(已接单/已收到) → done(资料已入库) ；任一阶段可 rejected
// 数据：COS data/submissions.json（private ACL，只出聚合与本人记录）
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { gmt8Date } from './_date.js';

const DATA_KEY = 'data/submissions.json';

const MAX_COURSE = 40;
const MAX_NOTE = 300;
const MAX_CONTACT = 60;
const KINDS = ['课件', '习题', '真题', '笔记', '其他'];

// 防刷：同一台设备每天 3 条，全站每天 100 条
const PER_FP_PER_DAY = 3;
const PER_DAY_TOTAL = 100;

const STATUSES = ['pending', 'accepted', 'done', 'rejected'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

function fresh() {
  return { version: 1, items: [] };
}

function genId() {
  return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 本人可见项：不回传别人的联系方式，也不回传 fp
function mineItem(r) {
  return {
    id: r.id,
    course: r.course,
    courseCode: r.courseCode || '',
    kind: r.kind,
    note: r.note || '',
    status: r.status,
    reply: r.reply || '',
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt || 0,
    date: r.date,
  };
}

// 后台可见项：含联系方式，供管理员跟进
function adminItem(r) {
  return {
    id: r.id,
    course: r.course,
    courseCode: r.courseCode || '',
    kind: r.kind,
    note: r.note || '',
    contact: r.contact || '',
    status: r.status,
    reply: r.reply || '',
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt || 0,
    reviewer: r.reviewer || '',
    date: r.date,
  };
}

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) return json({ error: 'COS 密钥未配置' }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }
  const action = body.action;

  // ─────────── 公开：提交补充线索 ───────────
  if (action === 'submit') {
    const course = String(body.course || '').trim();
    const courseCode = String(body.courseCode || '').trim().slice(0, 20);
    const kind = String(body.kind || '').trim();
    const note = String(body.note || '').trim();
    const contact = String(body.contact || '').trim();
    const fp = String(body.fp || '').trim().slice(0, 40);

    if (!course) return json({ error: '请选择课程' }, 400);
    if (course.length > MAX_COURSE) return json({ error: '课程名过长' }, 400);
    if (!KINDS.includes(kind)) return json({ error: '资料类型不合法' }, 400);
    if (!note) return json({ error: '请简单说明要补什么' }, 400);
    if (note.length > MAX_NOTE) return json({ error: `说明过长（最多 ${MAX_NOTE} 字）` }, 400);
    if (contact.length > MAX_CONTACT) return json({ error: '联系方式过长' }, 400);
    if (!fp) return json({ error: '缺少设备标识' }, 400);

    const today = gmt8Date(0);

    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const state = data && Array.isArray(data.items) ? data : fresh();
      const items = state.items;

      const todayAll = items.filter((x) => x.date === today);
      if (todayAll.length >= PER_DAY_TOTAL) {
        return json({ error: '今天收到的提交已满，请明天再来' }, 429);
      }
      const mineToday = todayAll.filter((x) => x.fp === fp).length;
      if (mineToday >= PER_FP_PER_DAY) {
        return json({ error: `每台设备每天最多提交 ${PER_FP_PER_DAY} 条` }, 429);
      }
      // 同一个人对同一门课的重复认领：直接返回已存在，不重复入队
      const dup = items.find(
        (x) => x.fp === fp && x.course === course && (x.status === 'pending' || x.status === 'accepted')
      );
      if (dup) {
        return json({ ok: true, duplicate: true, id: dup.id, message: '你已经提交过这门课，管理员会跟进' });
      }

      const rec = {
        id: genId(),
        course,
        courseCode,
        kind,
        note,
        contact,
        fp,
        status: 'pending',
        reply: '',
        createdAt: Date.now(),
        reviewedAt: 0,
        reviewer: '',
        date: today,
      };
      items.push(rec);

      const wr = await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
      if (wr.ok) {
        return json({ ok: true, id: rec.id, message: '已提交给管理员，核实后会上架' });
      }
    }
    return json({ error: '并发冲突，请重试' }, 409);
  }

  // ─────────── 公开：我的提交 ───────────
  if (action === 'mine') {
    const fp = String(body.fp || '').trim().slice(0, 40);
    if (!fp) return json({ items: [] });
    const state = (await readJson(DATA_KEY)) || fresh();
    const items = (state.items || [])
      .filter((x) => x.fp === fp)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map(mineItem);
    return json({ items });
  }

  // ─────────── 公开：聚合统计（不暴露任何明细） ───────────
  if (action === 'stats') {
    const state = (await readJson(DATA_KEY)) || fresh();
    const items = state.items || [];
    const byStatus = { pending: 0, accepted: 0, done: 0, rejected: 0 };
    items.forEach((x) => {
      if (byStatus[x.status] !== undefined) byStatus[x.status]++;
    });
    return json({ total: items.length, byStatus });
  }

  // ─────────── 以下需管理员 ───────────
  const who = verifyToken(body.token);
  if (!who) return json({ error: '未登录或登录已过期' }, 401);

  if (action === 'list') {
    const state = (await readJson(DATA_KEY)) || fresh();
    const items = (state.items || [])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(adminItem);
    return json({ items });
  }

  if (action === 'review') {
    const id = String(body.id || '');
    const status = String(body.status || '');
    const reply = String(body.reply || '').trim().slice(0, 200);
    if (!id) return json({ error: '缺 id' }, 400);
    if (!STATUSES.includes(status)) return json({ error: 'status 非法' }, 400);
    if (status === 'rejected' && !reply) return json({ error: '驳回请填写理由' }, 400);

    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const state = data && Array.isArray(data.items) ? data : fresh();
      const rec = state.items.find((x) => x.id === id);
      if (!rec) return json({ error: '记录不存在' }, 404);
      rec.status = status;
      rec.reply = reply;
      rec.reviewedAt = Date.now();
      rec.reviewer = who.username;
      const wr = await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
      if (wr.ok) {
        await auditLog(who.username, who.role, 'submission:' + status, id + ' ' + rec.course);
        return json({ ok: true });
      }
    }
    return json({ error: '并发冲突，请重试' }, 409);
  }

  if (action === 'remove') {
    const id = String(body.id || '');
    if (!id) return json({ error: '缺 id' }, 400);
    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const state = data && Array.isArray(data.items) ? data : fresh();
      const before = state.items.length;
      state.items = state.items.filter((x) => x.id !== id);
      if (state.items.length === before) return json({ error: '记录不存在' }, 404);
      const wr = await writeJsonIfMatch(DATA_KEY, state, etag, 'private');
      if (wr.ok) {
        await auditLog(who.username, who.role, 'submission:remove', id);
        return json({ ok: true });
      }
    }
    return json({ error: '并发冲突，请重试' }, 409);
  }

  return json({ error: '未知 action' }, 400);
}
