# 下一阶段功能建设方案

> 依据：`REFACTOR_AUDIT.md` 的审计结论 + 方案文档第一/二/四部分
> 编制日期：2026-10-20　　状态：待评审

---

## 一、总体目标与主线判断

### 1.1 现状诊断

上一阶段 12 项学习工具已全部上线。但对当前状态做一次体检，问题很清楚：

| 指标 | 现状 | 问题 |
|---|---|---|
| 有资料的课程 | 12 / 235 门 | **219 门课零资料**，其中 213 门连题库也没有 |
| 工具可服务的内容 | 12 门课 | 检索、冲刺、健康度、概念卡都只能覆盖少数课 |
| 学期健康度 | 均值 24%，最高 52% | 没有一门学期达到 60% |

**结论：工具已经够用，卡点在内容供给。** 再堆工具，只会让"点进去发现没东西"的体验更明显。

### 1.2 下一阶段主线

> **从"工具有了"转向"内容补上来"——把资料覆盖率从 5% 拉到 20% 以上，并建立可持续的补料通道。**

这条主线直接对应方案文档的学期目标（「课程覆盖率从 3.7% 提升至 20% 以上」）和三条判断里的第三条（「内容靠岗位，不靠个人」）。

### 1.3 明确不做（本阶段范围外）

- 排行榜（`leaderboard` 保持占位，不实装）
- PWA / 多语言 / 移动端 App 化
- 活动运营的线上化（报名、组队、积分等级）——方案明确砍掉了这些
- 任何引入账号绑定、需要用户注册才能用的新功能（除认领外）

---

## 二、优先级与批次

| 批次 | 内容 | 为什么这个优先级 | 预估 |
|---|---|---|---|
| **前置 P0** | 安全项下线 + 地基修复 | 抽奖接口正在对外服务且无鉴权；阻塞项不修，后面全是空转 | 1 天 |
| **P0-A** | **COS 存量盘活** | **ROI 最高**：164 条一次性入库，12→22 门课，**不依赖学生参与** | 1.5 天 |
| **P0-B** | 缺口清单与缺课榜 | 让内容线知道该采什么；也是活动二的榜单 | 1 天 |
| **P1-A** | 认领与提交（学生补充通道） | 方案定位学生只做"补充与纠错"，所以排在存量盘活之后 | 2 天 |
| **P1-B** | 盘点报告与覆盖率历史 | 活动三的交付物；成本低但要先有历史数据 | 1 天 |
| **P2** | 数据一致性治理 | 隐性技术债，不阻塞功能但会持续误导 | 1 天 |

**排序逻辑**：先修会咬人的（安全），再做不依赖人的（存量盘活），再做依赖人的（认领），最后做收尾（盘点与一致性）。

---

## 三、逐项实现要点

### 前置 P0：安全下线与地基修复

| # | 事项 | 实现要点 | 关键位置 |
|---|---|---|---|
| 1 | 下线抽奖接口 | 删 `lottery.js` + `public/admin/lottery.html`；`ARCHITECTURE.md` 5 处相关行同步清理；部署后验证 `/api/lottery` → 404；再清 COS 的 `data/lottery.json`（含真实姓名） | `node-functions/api/lottery.js` |
| 2 | 轮换 COS 密钥 | 腾讯云控制台轮换 → 更新 EdgeOne 环境变量 → 删 `.workbuddy/upload_all.py`（**人工操作，不可自动化**） | 控制台 |
| 3 | 补 `.gitignore` | 改为 `.vitepress/dist-*/`、`.vitepress/.temp*/`、`.workbuddy/*.py` + `!.workbuddy/memory/`、`.ardot-*/`、`.backup_redundant/`、`*.pid`；对已 tracked 垃圾 `git rm --cached` | `.gitignore` |
| 4 | 清旧构建 | 删 `dist-old1~13` + `.temp-old1`（563 MB）+ `dist-old`、`dist-bak` | `.vitepress/` |
| 5 | 修真 bug | `StudyPlan.vue:264` fetch `/data/materials.json` 恒 404 → 把 `materials.json` 加进 `site-metrics.mjs` 的 `SYNC_FILES` | `scripts/site-metrics.mjs:31` |

**验收**：`/api/lottery` 返回 404；`git status` 的 `??` 只剩 `.workbuddy/`；`npm run build` 通过；`/plan` 页不再有静默 404。

---

### P0-A：COS 存量盘活

**目标**：把 `files/` 下已存在但未编目的文档挂到课程页，**课程覆盖 12 → 22~23 门，条目 59 → 约 223 条**。

#### 实现路径（三选一，推荐 A2）

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A1 纯离线补丁 | 读 `cos_index.txt` 快照生成补丁 → 人工 review → 一次性 PUT | 当天出结果、零线上改动 | 一次性，且快照已过期 7 条 |
| **A2 云函数 `listObjects` + 后台扫描页**（推荐） | 云函数列举 → 后台生成候选 → 人工确认 → 批量入库 | 长期可用、可增量、候选可审 | 需写 XML 解析 |
| A3 upload.html 逐门重传 | 直接拖文件重传 | 无需改动 | **不盘活存量**（生成新 key，旧文件仍无索引，等于再存 1 GB） |

#### A2 的关键实现点

**1) `_cos.js` 新增 `listObjects`**
```js
export async function listObjects(prefix = 'files/', marker = '')
// 签名复用 cosAuth('get', '')，key='' 时 httpString 为 get\n/\n\nhost=HOST\n
// 即 List Objects 的资源格式，已在 list_bucket.py 上验证可行
// 返回解析后的 [{ key, size, lastModified }]，并处理 IsTruncated / NextMarker 分页
```
⚠️ 无 SDK、无 DOMParser，需极简 XML 正则解析；用 V1 的 `marker` 分页（V2 的 `list-type` 要进签名）。

**2) `upload.js` 新增两个 action**（插在 `action==='save'` 之前）
```
POST { action:'scan', token }
  → { ok, total, groups:[{ prefix, dir, docCount, files:[{key,size,lastModified}] }], skipped:{ fragments: n } }
  过滤规则：扩展名白名单 pdf/doc/docx/ppt/pptx/xls/xlsx/zip/rar/7z；其余计入 skipped

POST { action:'bulkSave', token, items:[{ courseKey, name, key, ext, size }] }
  → { ok, added, skipped, conflicts }
  ⚠️ 必须 readJsonWithEtag → 合并 → writeJsonIfMatch，一次读一次写
     （现在 save 是无 ETag 全量覆写，164 次串行会互相覆盖）
```

**3) 新建 `public/admin/materials-scan.html`**
表格列：目录 / 推断课程（可改的下拉）/ 文件名（可改）/ 大小 / 状态（已录·新增）/ 勾选。
顶部显示「共 N 个文档，已录 M，可新增 K」；底部「批量入库」。

**4) 目录→课程映射表**：新建 `data/dir-map.json`，4 组歧义**必须人工确认后写入**：

| 目录 | 候选课程 | 处理 |
|---|---|---|
| `大二上/思想政治` | 习近平新时代中国特色社会主义思想概论（**不是**思想道德与法治） | 待确认 |
| `大三上/电力系统` | 多门同名课 | 待确认 |
| `大三上/电气控制与PLC` | courses.json 里只有「电气控制技术」 | 待确认 |
| `大二下/单片机` | 6 个近似名 | 待确认 |

#### 验收标准

1. `scan` 返回文档数 **≥ 216**，`skipped.fragments` ≥ 500
2. `bulkSave` 后 `/api/overview` 的 `materials.courses ≥ 22`、`items ≥ 200`
3. 抽查「电路分析 / 数字电子技术 / 信号与系统」三门课，课程页资料行数 = 索引条数
4. **并发安全**：两个 `bulkSave` 同时执行，最终条数 = 两者并集，无丢失
5. 数电目录**只入库 24 条文档**，页面不出现 500 行卡死
6. 预览链路回归：任取一条新入库 PDF，`/api/preview` 能正常打开

#### 风险与对策

| 风险 | 对策 |
|---|---|
| List XML 解析出错（无 SDK） | 先在本机用真实响应跑通解析，再上云函数；解析失败返回空数组而非抛错 |
| 归一化函数有两套（upload.html 保留 A/B 后缀，gen-semester-index 会剥） | **统一到 `normalizeCourseName`**，`courseKey` 一律用它算；加一条「入库后健康度必须变」的回归检查 |
| 一次全量 PUT 期间有人用 upload.html | `bulkSave` 用 ETag 重试；同时在扫描页提示「操作期间勿在另一后台页面增删资料」 |
| 挂错课 | 歧义 4 组一律留空待人工；候选页必须显示"推断课程"而不是直接入库 |
| 碎资源混入 | 扩展名白名单 + `skipped` 计数可核对；入库前二次确认 |

---

### P0-B：缺口清单与缺课榜

**目标**：把「哪门课没资料」从分散的学期页徽标，变成一个可排序、可解释的榜单，供内容线和学生看。

#### 关键实现点

**1) 新建 `scripts/gen-gap-board.mjs`** → `public/data/gap-board.json`
照 `gen-semester-index.mjs` 的模板：`findProjectRoot(process.cwd())`、内容不变只刷 mtime、`contentHash`、CLI 入口。

**2) 需求强度公式（代理口径，因无选课人数）**
```
score = 2 × 开课专业数
      + 2 × (是否必修)
      + 0.3 × 学分
      + 3 × 缺口系数（无资料且无题库 = 1.0；仅无资料 = 0.6；其他 = 0）
      + 0.5 × 悬赏点赞数（可选，样本少时可置 0）
```
数据全部来自 `curriculum.json`（专业数/学分/必修）+ `semester-index.json`（缺口）+ 可选 `/api/bounty`。

**3) 新建 `/gap` 页面 + `GapBoard.vue`**
- 顶部分档筛选：全部 / 零资料 / 缺题库 / 缺大纲
- 表格：排名 / 课程名 / 开课专业数 / 学分 / 必修 / 资料 / 题库 / 需求分
- **公式和口径必须公开写在页面上**（"没有选课人数，用开课专业数+必修+学分做代理"），否则数字不可信

**4) 构建链接入**：`package.json` 的 `build` 与 `predev` 加一步；`config.mts` 加快照缺失时的兜底触发。

#### 验收标准

1. 榜单覆盖 **≥ 200 门**课（当前 219 门零资料）
2. Top 20 人工抽查合理：「概率论与数理统计B」「习思想概论」这类多专业+必修+零资料的课应靠前
3. 页面上公式可见、口径可解释
4. 内容不变时二次构建 git 无 diff

#### 风险

- **无选课人数**：只能代理，必须在 UI 明说，不能用"热门度"这类会误导的措辞
- 悬赏点赞样本极少（当前几乎为 0），该权重建议先置 0 并标注"数据不足暂不计入"

---

### P1-A：认领与提交（学生补充通道）

**目标**：让学生能"认领一门缺资料课 → 提交资料 → 内容线审核 → 计入贡献榜"，即方案活动一的完整闭环。

#### 关键实现点

**1) 新建 `node-functions/api/claims.js`**，COS `data/claims.json`
```
POST { action:'list' }                         → 公开，当前学期缺口 + 认领状态
POST { action:'claim', token, courseName, courseCode, kind }  → 学生 token
POST { action:'release', token, id }           → 仅本人
POST { action:'mine', token }                  → 我的认领与提交状态
POST { action:'adminList', token }             → 管理员全量
POST { action:'review', token, id, status, note } → 管理员审核
POST { action:'stats' }                        → 公开聚合（已认领数/已通过数）
```
数据结构见 `REFACTOR_AUDIT.md` §2.3。

**2) 学生提交通道**：`upload.js` 新增 `action:'submit'`
- 走 `verifyUserToken`（**不是** `verifyToken`），否则学生会 401
- key 前缀用 `files/pending/{username}/{ts}.{ext}`，与正式资料区隔离，审核通过后不移动文件、只写索引
- 提交元数据写 `data/submissions.json`（**不改 materials.json 结构**，课程页零改动）

**3) 配额与并发**
- 配额：`claims.filter(c => c.claimer===u && c.term===term && c.status!=='rejected').length < 2`
- 先到先得：`readJsonWithEtag` + `writeJsonIfMatch`，冲突重试 5 次
- 同课竞争：`if (existing && existing.status !== 'rejected') return 409`

**4) 页面与后台**
- `/claim` + `ClaimBoard.vue`（缺资料清单 + 认领按钮 + 我的状态）
- `public/admin/claim.html`（审核队列，照 `bounty.html` 的 tab 结构）
- 审核通过时 `contributors` 自动 +1（或先写 `contributions[]` 明细再聚合，推荐后者）

#### 验收标准

1. 学生认领第 1、2 门成功，**第 3 门被拒**并提示原因
2. 两个账号同时认领同一门，**只有一人成功**，另一人 409
3. 学生提交后能在 `/claim` 看到状态流转：`claimed → submitted → approved/rejected`
4. 审核通过后：materials.json 出现该条目、课程页立刻可见、贡献者 count +1
5. 学生 token 调 `upload.js` 其它 action（save/remove）仍返回 401（**不能顺手把管理员权限放开**）
6. 管理员 token 调 `claims` 的 `claim` 返回 401（realm 隔离双向成立）

#### 风险

| 风险 | 对策 |
|---|---|
| 放开学生通道时误开管理员 action | `submit` 用独立分支，其它 action 保持原 `verifyToken`；验收第 5 条专门测这个 |
| 恶意认领占坑 | 配额 + 7 天未提交自动 expired（写 `expiresAt`） |
| 上传内容不合规 | 提交进 `pending/` 前缀，审核通过才入索引；COW 保证课程页不受污染 |
| `semester-index` 滞后导致认领后仍显示"缺资料" | 榜单页直读 COS 的 materials.json，或认领后前端本地乐观更新 |

---

### P1-B：盘点报告与覆盖率历史

**目标**：给活动三一个可交付的"学期盘点报告"，展示覆盖率变化。

#### 关键实现点

1. **`scripts/site-metrics.mjs` 追加写 `data/coverage-history.json`**
   ```json
   { "version": 1, "points": [{ "date": "2026-10-20", "courses": 235,
       "withMaterials": 16, "withBank": 17, "withSyllabus": 164,
       "items": 59, "questions": 421 }] }
   ```
   按 `date` 去重（同一天覆盖），最多保留 400 条。
2. **`/report` 页面 + `SemesterReport.vue`**
   - 本学期 vs 学期初的覆盖率变化（双柱或折线，纯 CSS/SVG，不引图表库）
   - 按专业分组的健康度对比
   - 贡献榜 Top 10（复用 `/contributors`）
   - 「致谢名单」+ 导出 Markdown（供期末公示用）

#### 验收标准

1. 首次构建后 `coverage-history.json` 有 1 条；第二天再构建变 2 条（同日重复构建不增加）
2. `/report` 显示"学期初 X% → 现在 Y%"，起止点与历史数据一致
3. 导出 Markdown 包含课程数、贡献名单、日期

#### 风险

- **历史只能从现在开始积累**，无法回溯。页面上要如实写"数据自 2026-10 起记录"

---

### P2：数据一致性治理

| 事项 | 问题 | 方案 |
|---|---|---|
| `semester-index` 滞后 | 上传写 COS，构建钩子只看仓库 mtime | ① 后台入库后同步回写仓库文件；② 或健康度页直读 COS。二选一，推荐①（构建期数据仍单源） |
| `materials.json` 双轨 | 前端读 COS，`StudyPlan` 读本地 `/data/materials.json`（404） | 已在前置 P0 修 |
| `courses.json` 孤本 | 325 条、无生成脚本、2 个月未更新，6 个消费者 | 写 `scripts/gen-courses.mjs` 从 `curriculum.json` 生成，纳入构建链 |
| `course_metadata.txt` 孤本 | `/admin/index.html` 唯一数据源、格式是 `|` 分隔 6 列 | 同上，生成或直接让后台改读 `courses.json` |

**验收**：`npm run build` 后 `courses.json` 与 `curriculum.json` 的课程名集合差异 < 5 条（并说明差异原因）。

---

## 四、关键模块与接口汇总

### 新增文件

| 类型 | 路径 | 归属 |
|---|---|---|
| 云函数 | `node-functions/api/claims.js` | P1-A |
| 云函数 | `_cos.js` 增 `listObjects()`；`upload.js` 增 `scan`/`bulkSave`/`submit` | P0-A / P1-A |
| 脚本 | `scripts/gen-gap-board.mjs`、`scripts/gen-courses.mjs` | P0-B / P2 |
| 数据 | `data/claims.json`、`data/submissions.json`、`data/coverage-history.json`、`data/dir-map.json` | 各批 |
| 生成物 | `public/data/gap-board.json` | P0-B |
| 页面 | `claim.md`、`gap.md`、`report.md` | 各批 |
| 组件 | `ClaimBoard.vue`、`GapBoard.vue`、`SemesterReport.vue` | 各批 |
| 后台 | `public/admin/materials-scan.html`、`public/admin/claim.html` | P0-A / P1-A |

### 接口契约要点

| 接口 | 鉴权 | 并发控制 | 说明 |
|---|---|---|---|
| `/api/claims` 只读 | 公开 | — | 只出聚合与状态，不出提交人真实姓名（用 displayName 或匿名） |
| `/api/claims` 写 | 学生 token（claim/release/mine） | ETag + 重试 5 | 配额 ≤2 |
| `/api/claims` 审核 | 管理员 token | ETag | 建议要求 `role===2` |
| `/api/upload` `submit` | **学生 token** | — | 写 `files/pending/`，不直接入索引 |
| `/api/upload` `scan`/`bulkSave` | 管理员 token | **bulkSave 必须 ETag** | scan 只读，burn 不写 |

### 必须遵守的既有铁律

1. 写敏感数据一律 `writeJsonIfMatch(key, data, etag, 'private')` —— 一次拿到乐观锁与私有 ACL
2. 鉴权放在 action 分发之前，未认证一律 401，不泄露接口细节
3. 私有数据（users/checkins/audit-log/contributors/stats）只出聚合，不出明细
4. 新增被前端 `fetch` 的数据文件，**必须加进 `site-metrics.mjs` 的 `SYNC_FILES`**

---

## 五、阶段验收总标准

| 维度 | 标准 |
|---|---|
| **内容** | 有资料课程 12 → **≥ 22**；资料条目 59 → **≥ 200**；学期健康度均值 24% → **≥ 35%** |
| **可用性** | 三个活动在网站上能走完整流程（认领→提交→审核→入账），不需要邮件和人工介入 |
| **数据可信** | 缺口榜公式公开可解释；覆盖率有历史序列；`/api/overview` 与页面显示一致 |
| **安全** | `/api/lottery` 404；无新增无鉴权写接口；学生与管理员 realm 双向隔离验证通过 |
| **可维护** | 生成器全部纳入 `npm run build`；`.gitignore` 补齐后 `git status` 只剩业务改动 |
| **成本** | 不新增任何第三方服务、不产生订阅费用；COS 存储不因盘活而增长（**只建索引，不重复上传**） |

---

## 六、总体风险清单

| 风险 | 等级 | 影响 | 对策 |
|---|---|---|---|
| COS 密钥未轮换，git 历史已泄露 | **高** | 桶被写入/删除 | 控制台轮换 + 更新 EdgeOne 环境变量；这是唯一"不做就出事"的项 |
| `/api/lottery` 未下线 | **高** | 任何人可重开已关闭活动、泄露中奖名单 | 前置 P0 第一步 |
| 存量盘活挂错课 | 中 | 学生看到不属于这门课的资料，信任受损 | 歧义 4 组留空人工确认；候选页必须显示"推断课程"；入库后抽样回归 |
| 学生通道误开管理员权限 | 中 | 任意学生可改资料库 | `submit` 独立分支；验收专门测"其它 action 仍 401" |
| 无选课人数导致榜单失真 | 中 | 榜单不反映真实需求 | 公式与口径在页面公开；标注"代理口径" |
| 一次性全量 PUT 覆盖并发写 | 中 | 丢资料 | `bulkSave` 用 ETag；操作期提示独占 |
| 覆盖率历史无法回溯 | 低 | 首份报告只有一个点 | 页面注明起始日期；不伪造历史 |
| 清理旧构建时误删 dist | 低 | 需重新构建 | 只删 `dist-old*`/`.temp*`，保留 `.vitepress/dist` |

---

## 七、建议的启动顺序

```
第 1 天  前置 P0：下线 lottery → 补 gitignore → 清 640MB → 修 /data/materials.json 404
         （密钥轮换由人工在控制台完成）
第 2-3 天 P0-A：listObjects + scan/bulkSave + 扫描页 + 4 组歧义确认 → 导入 164 条
第 4 天   P0-B：gap-board 生成器 + /gap 页面
第 5-6 天 P1-A：claims 云函数 + 学生 submit + /claim + 后台审核队列
第 7 天   P1-B：coverage-history + /report
第 8 天   P2：数据一致性 + 全量回归
```

**每批独立 commit、独立可回滚；每批完成后跑一次完整构建 + 线上冒烟。**
