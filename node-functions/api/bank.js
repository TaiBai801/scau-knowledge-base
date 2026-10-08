// EdgeOne Pages 云函数 — 题库读写（组题功能）
// 路由: /api/bank
// 数据: COS data/bank.json（key = 归一化课程名）
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';

const DATA_KEY = 'data/bank.json';
const VALID_TYPES = ['single', 'multi', 'judge', 'blank', 'calc', 'short'];

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

export function onRequestOptions() {
  return json({ ok: true });
}

// 校验题目字段，返回错误信息或 null
function validateQuestion(q) {
  if (!q || typeof q !== 'object') return '题目数据非法';
  if (!q.id || !String(q.id).trim()) return '缺少题目 id';
  if (!VALID_TYPES.includes(q.type)) return '题型非法: ' + q.type;
  if (!q.stem || !String(q.stem).trim()) return '缺少题干';
  if (q.answer === undefined || q.answer === null || String(q.answer).trim() === '') return '缺少答案';
  const diff = Number(q.difficulty);
  if (![1, 2, 3].includes(diff)) return '难度必须是 1/2/3';
  return null;
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置，请在 EdgeOne 环境变量中设置 COS_SECRET_ID / COS_SECRET_KEY' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;

    // 读取某课程题库
    if (action === 'getBank') {
      const { courseKey } = body;
      if (!courseKey) return json({ error: '缺 courseKey' }, 400);
      const data = (await readJson(DATA_KEY)) || {};
      const entry = data[courseKey] || { course: courseKey, code: body.code || '', questions: [] };
      return json({ entry });
    }

    // 新增/更新单题（按 id 匹配）
    if (action === 'saveQuestion') {
      const { courseKey, code, question } = body;
      const err = validateQuestion(question);
      if (err) return json({ error: err }, 400);
      if (!courseKey) return json({ error: '缺 courseKey' }, 400);

      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const bank = data || {};
      let entry = bank[courseKey] || { course: courseKey, code: code || '', questions: [] };
      if (code) entry.code = code;
      const idx = entry.questions.findIndex(q => q.id === question.id);
      if (idx >= 0) entry.questions[idx] = question;
      else entry.questions.push(question);
      bank[courseKey] = entry;
      const r = await writeJsonIfMatch(DATA_KEY, bank, etag);
      if (!r.ok) return json({ error: '写入冲突(并发编辑)，请刷新后重试', conflict: true, status: r.status }, 409);
      return json({ ok: true });
    }

    // 删除单题
    if (action === 'deleteQuestion') {
      const { courseKey, id } = body;
      if (!courseKey || !id) return json({ error: '缺参数' }, 400);
      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const bank = data || {};
      const entry = bank[courseKey];
      if (entry) {
        entry.questions = (entry.questions || []).filter(q => q.id !== id);
        bank[courseKey] = entry;
      }
      const r = await writeJsonIfMatch(DATA_KEY, bank, etag);
      if (!r.ok) return json({ error: '写入冲突，请刷新后重试', conflict: true, status: r.status }, 409);
      return json({ ok: true });
    }

    // 批量导入（追加或覆盖）
    if (action === 'batchImport') {
      const { courseKey, code, questions, mode } = body;
      if (!courseKey || !Array.isArray(questions)) return json({ error: '缺参数' }, 400);
      for (const q of questions) {
        const err = validateQuestion(q);
        if (err) return json({ error: err + '（题目 id=' + (q && q.id) + '）' }, 400);
      }
      const { data, etag } = await readJsonWithEtag(DATA_KEY);
      const bank = data || {};
      let entry = bank[courseKey] || { course: courseKey, code: code || '', questions: [] };
      if (code) entry.code = code;
      entry.questions = mode === 'replace' ? questions.slice() : entry.questions.concat(questions);
      bank[courseKey] = entry;
      const r = await writeJsonIfMatch(DATA_KEY, bank, etag);
      if (!r.ok) return json({ error: '写入冲突，请刷新后重试', conflict: true, status: r.status }, 409);
      return json({ ok: true, count: questions.length });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
