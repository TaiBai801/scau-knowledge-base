// EdgeOne Pages 云函数 — 四六级模拟考试：题库 / 试卷 / 配置 读写
// 路由: /api/cet
// 数据: COS data/cet.json  { config, questions[], papers[] }
// 读：学生 token（_userauth）或工作人员 token（_auth）均可
// 写：仅工作人员（_auth token 且 role >= 1）
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';
import { verifyUserToken } from './_userauth.js';

const DATA_KEY = 'data/cet.json';
const EXAMS = ['cet4', 'cet6'];
const Q_TYPES = ['listening', 'reading', 'writing', 'translation'];
const Q_STATUS = ['on', 'off'];

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

// 空数据自举：COS 无 cet.json 时给合法骨架
function seed() {
  return {
    config: { enabled: true, announce: '' },
    questions: [],
    papers: [],
  };
}

function validateQuestion(q) {
  if (!q || typeof q !== 'object') return '题目数据非法';
  if (!q.id || !String(q.id).trim()) return '缺少题目 id';
  if (!EXAMS.includes(q.exam)) return '所属考试非法: ' + q.exam;
  if (!Q_TYPES.includes(q.type)) return '题型非法: ' + q.type;
  if (!q.stem || !String(q.stem).trim()) return '缺少题干';
  if (q.answer === undefined || q.answer === null || String(q.answer).trim() === '') return '缺少正确答案';
  const diff = Number(q.difficulty);
  if (![1, 2, 3].includes(diff)) return '难度必须是 1/2/3';
  const score = Number(q.score);
  if (!(score > 0) || score > 100) return '分值必须是 0-100 之间的正数';
  if (q.options !== undefined && !Array.isArray(q.options)) return '选项必须是数组';
  if (q.status !== undefined && !Q_STATUS.includes(q.status)) return '状态必须是 on/off';
  return null;
}

function validatePaper(p, questions) {
  if (!p || typeof p !== 'object') return '试卷数据非法';
  if (!p.id || !String(p.id).trim()) return '缺少试卷 id';
  if (!EXAMS.includes(p.exam)) return '所属考试非法: ' + p.exam;
  if (!p.name || !String(p.name).trim()) return '缺少试卷名称';
  if (!Array.isArray(p.sections) || !p.sections.length) return '至少一个分区';
  if (!Array.isArray(p.questionIds)) return '题目列表非法';
  const ids = new Set((questions || []).map((q) => q.id));
  for (const qid of p.questionIds) if (!ids.has(qid)) return '试卷引用了不存在的题目: ' + qid;
  let total = 0;
  const seen = new Set();
  for (const s of p.sections) {
    if (!Q_TYPES.includes(s.type)) return '分区题型非法: ' + s.type;
    if (!Array.isArray(s.qids) || !s.qids.length) return '分区「' + s.type + '」没有题目';
    const dur = Number(s.durationSec);
    if (!(dur >= 0)) return '分区「' + s.type + '」时长非法';
    total += dur;
    for (const qid of s.qids) {
      if (seen.has(qid)) return '题目重复出现在多个分区: ' + qid;
      seen.add(qid);
    }
  }
  if (seen.size !== p.questionIds.length) return 'questionIds 与分区题目不一致';
  if (!(Number(p.durationSec) > 0)) return '试卷总时长非法';
  if (Number(p.durationSec) !== total) return '总时长必须等于各分区时长之和';
  if (p.status !== undefined && !Q_STATUS.includes(p.status)) return '状态必须是 on/off';
  return null;
}

async function readState() {
  const data = await readJson(DATA_KEY);
  if (data && Array.isArray(data.questions) && Array.isArray(data.papers)) return data;
  return seed();
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置' }, 500);
  }
  try {
    const body = await request.json();
    const action = body.action;

    // ── 读：学生 realm 或工作人员 realm 均可 ──
    const whoStaff = verifyToken(body.token);
    const whoUser = whoStaff ? null : verifyUserToken(String(body.token || ''));
    if (!whoStaff && !whoUser) return json({ error: '未登录或登录已过期' }, 401);
    await auditLog(
      (whoStaff && whoStaff.username) || (whoUser && whoUser.username),
      whoStaff ? whoStaff.role : 0,
      'cet:' + action,
      ''
    );

    if (action === 'get') {
      const state = await readState();
      return json({
        config: state.config,
        questions: state.questions,
        papers: state.papers,
      });
    }

    // ── 写：仅工作人员 ──
    if (!whoStaff || Number(whoStaff.role) < 1) {
      return json({ error: '需要工作人员权限' }, 403);
    }

    if (action === 'saveQuestion') {
      const { question } = body;
      const err = validateQuestion(question);
      if (err) return json({ error: err }, 400);
      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data && Array.isArray(data.questions) ? data : seed();
        const q = Object.assign({}, question, {
          id: String(question.id).trim(),
          updatedAt: Date.now(),
          status: Q_STATUS.includes(question.status) ? question.status : 'on',
        });
        const idx = state.questions.findIndex((x) => x.id === q.id);
        if (idx >= 0) state.questions[idx] = q;
        else state.questions.push(q);
        const r = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (r.ok) return json({ ok: true, question: q });
        if (r.status !== 412) return json({ error: '写入失败 ' + r.status }, 502);
      }
      return json({ error: '写入冲突(并发编辑)，请刷新后重试', conflict: true }, 409);
    }

    if (action === 'deleteQuestion') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: '缺 id' }, 400);
      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data && Array.isArray(data.questions) ? data : seed();
        state.questions = state.questions.filter((q) => q.id !== id);
        // 同步清掉各试卷里对该题的引用
        for (const p of state.papers) {
          p.questionIds = (p.questionIds || []).filter((x) => x !== id);
          for (const s of p.sections || []) s.qids = (s.qids || []).filter((x) => x !== id);
        }
        const r = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (r.ok) return json({ ok: true });
        if (r.status !== 412) return json({ error: '写入失败 ' + r.status }, 502);
      }
      return json({ error: '写入冲突，请刷新后重试', conflict: true }, 409);
    }

    if (action === 'savePaper') {
      const { paper } = body;
      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data && Array.isArray(data.papers) ? data : seed();
        const err = validatePaper(paper, state.questions);
        if (err) return json({ error: err }, 400);
        const p = Object.assign({}, paper, {
          id: String(paper.id).trim(),
          updatedAt: Date.now(),
          status: Q_STATUS.includes(paper.status) ? paper.status : 'off',
        });
        const idx = state.papers.findIndex((x) => x.id === p.id);
        if (idx >= 0) state.papers[idx] = p;
        else state.papers.push(p);
        const r = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (r.ok) return json({ ok: true, paper: p });
        if (r.status !== 412) return json({ error: '写入失败 ' + r.status }, 502);
      }
      return json({ error: '写入冲突，请刷新后重试', conflict: true }, 409);
    }

    if (action === 'deletePaper') {
      const id = String(body.id || '').trim();
      if (!id) return json({ error: '缺 id' }, 400);
      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data && Array.isArray(data.papers) ? data : seed();
        state.papers = state.papers.filter((p) => p.id !== id);
        const r = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (r.ok) return json({ ok: true });
        if (r.status !== 412) return json({ error: '写入失败 ' + r.status }, 502);
      }
      return json({ error: '写入冲突，请刷新后重试', conflict: true }, 409);
    }

    if (action === 'saveConfig') {
      const cfg = body.config;
      if (!cfg || typeof cfg !== 'object') return json({ error: '配置非法' }, 400);
      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = data && Array.isArray(data.questions) ? data : seed();
        state.config = {
          enabled: !!cfg.enabled,
          announce: String(cfg.announce || '').slice(0, 300),
        };
        const r = await writeJsonIfMatch(DATA_KEY, state, etag);
        if (r.ok) return json({ ok: true, config: state.config });
        if (r.status !== 412) return json({ error: '写入失败 ' + r.status }, 502);
      }
      return json({ error: '写入冲突，请刷新后重试', conflict: true }, 409);
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
