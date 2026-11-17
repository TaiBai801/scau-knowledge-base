// EdgeOne Pages 云函数 — 工作排期工作站 · 云同步
// 路由: /api/schedule
// 数据: COS data/schedule.json（私有 ACL）
// 结构: { schemaVersion, revision, updatedAt, updatedBy, data:{lanes,bars,settings}, changes:[] }
// 鉴权: 管理员 token（_auth），role >= 1 可读可写；团队共享同一份排期
//
// 并发模型：revision 乐观锁
//   put 必须带 baseRevision，与服务端 revision 相等才写入；不等直接 409 返回服务端数据，
//   由前端弹三方选择（云端 / 本地 / 合并），绝不静默覆盖。
import { readJson, readJsonWithEtag, writeJsonIfMatch, hasSecret } from './_cos.js';
import { verifyToken, auditLog } from './_auth.js';

const DATA_KEY = 'data/schedule.json';
const MAX_BYTES = 512 * 1024;   // 单份排期上限 512 KB
const MAX_CHANGES = 500;        // 变更记录只留最近 500 条
const MAX_ITEMS = 20000;        // lanes+bars+stages+milestones 总量护栏

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

function seed() {
  return {
    schemaVersion: 2,
    revision: 0,
    updatedAt: 0,
    updatedBy: '',
    data: { lanes: [], bars: [], settings: {} },
    changes: [],
  };
}

function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : null;
  if (!s || !s.data || typeof s.data !== 'object') return null;
  const d = s.data;
  return {
    schemaVersion: 2,
    revision: Number(s.revision) || 0,
    updatedAt: Number(s.updatedAt) || 0,
    updatedBy: String(s.updatedBy || ''),
    data: {
      lanes: Array.isArray(d.lanes) ? d.lanes : [],
      bars: Array.isArray(d.bars) ? d.bars : [],
      settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
    },
    changes: Array.isArray(s.changes) ? s.changes : [],
  };
}

// 只做结构护栏，不做业务清洗（业务清洗在前端 sanitizeState，已足够严）
function validatePayload(body) {
  const data = body && body.data;
  if (!data || typeof data !== 'object') return '缺少 data';
  if (!Array.isArray(data.lanes)) return 'data.lanes 必须是数组';
  if (!Array.isArray(data.bars)) return 'data.bars 必须是数组';
  if (data.settings && typeof data.settings !== 'object') return 'data.settings 必须是对象';

  let count = data.lanes.length + data.bars.length;
  for (const bar of data.bars) {
    if (!bar || typeof bar !== 'object') return 'bars 含非法项';
    if (!bar.id || typeof bar.id !== 'string') return 'bars 缺少 id';
    if (bar.stages) {
      if (!Array.isArray(bar.stages)) return 'stages 必须是数组';
      count += bar.stages.length;
    }
    if (bar.milestones) {
      if (!Array.isArray(bar.milestones)) return 'milestones 必须是数组';
      count += bar.milestones.length;
    }
  }
  if (count > MAX_ITEMS) return '条目过多（' + count + '），请清理后再同步';
  return null;
}

async function readState() {
  const raw = await readJson(DATA_KEY);
  const st = normalizeState(raw);
  return st || seed();
}

export async function onRequestPost({ request }) {
  if (!hasSecret()) {
    return json({ error: 'COS 密钥未配置' }, 500);
  }
  try {
    const body = await request.json();
    const action = String(body.action || '');

    // 鉴权：所有动作都要求管理员 token（后台工具，不对学生开放）
    const who = verifyToken(body.token);
    if (!who) return json({ error: '未登录或登录已过期' }, 401);
    if (Number(who.role) < 1) return json({ error: '需要工作人员权限' }, 403);

    if (action === 'get') {
      const state = await readState();
      await auditLog(who.username, who.role, 'schedule:get', '');
      const withChanges = body.withChanges === true;
      return json({
        ok: true,
        found: state.revision > 0,
        revision: state.revision,
        updatedAt: state.updatedAt,
        updatedBy: state.updatedBy,
        data: state.data,
        // 变更记录体积不小，默认不带，显式请求才回
        changes: withChanges ? state.changes.slice(-MAX_CHANGES) : undefined,
        changesTotal: state.changes.length,
      });
    }

    if (action === 'put') {
      const err = validatePayload(body);
      if (err) return json({ error: err }, 400);

      const baseRevision = Number(body.baseRevision);
      if (!Number.isFinite(baseRevision) || baseRevision < 0) {
        return json({ error: '缺少 baseRevision（必须显式声明基于哪个版本）' }, 400);
      }

      const payloadStr = JSON.stringify({
        data: {
          lanes: body.data.lanes,
          bars: body.data.bars,
          settings: body.data.settings || {},
        },
      });
      if (payloadStr.length > MAX_BYTES) {
        return json({
          error: '排期数据超过 ' + Math.round(MAX_BYTES / 1024) + ' KB 上限，请清理变更记录或拆分排期',
          tooLarge: true,
          bytes: payloadStr.length,
        }, 413);
      }

      const incomingChanges = Array.isArray(body.changes) ? body.changes : [];

      for (let i = 0; i < 4; i++) {
        const { data, etag } = await readJsonWithEtag(DATA_KEY);
        const state = normalizeState(data) || seed();

        // 版本不一致：不覆盖，把服务端版本原样退回让前端决策
        if (baseRevision !== state.revision) {
          return json({
            conflict: true,
            error: '版本已变化（服务端 ' + state.revision + '，本次基于 ' + baseRevision + '）',
            serverRevision: state.revision,
            serverUpdatedAt: state.updatedAt,
            serverUpdatedBy: state.updatedBy,
            serverData: state.data,
          }, 409);
        }

        const merged = state.changes.concat(incomingChanges).slice(-MAX_CHANGES);
        const next = {
          schemaVersion: 2,
          revision: state.revision + 1,
          updatedAt: Date.now(),
          updatedBy: String(who.username || ''),
          data: {
            lanes: body.data.lanes,
            bars: body.data.bars,
            settings: body.data.settings || {},
          },
          changes: merged,
        };

        const wr = await writeJsonIfMatch(DATA_KEY, next, etag, 'private');
        if (wr.ok) {
          await auditLog(who.username, who.role, 'schedule:put', 'rev ' + next.revision);
          return json({
            ok: true,
            revision: next.revision,
            updatedAt: next.updatedAt,
            updatedBy: next.updatedBy,
            changesTotal: merged.length,
          });
        }
        if (wr.status !== 412) return json({ error: '写入失败 ' + wr.status }, 502);
        // 412 = 有人抢先写入，重读后再判一次 revision
      }
      return json({ error: '写入冲突（并发较高），请稍后重试', conflict: true, retryable: true }, 409);
    }

    if (action === 'history') {
      const state = await readState();
      const limit = Math.min(MAX_CHANGES, Math.max(1, Math.floor(Number(body.limit) || 100)));
      return json({
        ok: true,
        revision: state.revision,
        total: state.changes.length,
        changes: state.changes.slice(-limit),
      });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: '服务异常: ' + (e && e.message ? e.message : e) }, 500);
  }
}
