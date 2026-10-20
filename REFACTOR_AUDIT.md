# 重构前审计：活动支撑功能 · COS 存量盘活 · 待清理项

> 用途：上新「活动支撑功能」和「盘活 COS 存量」之前，把相关模块、逻辑、历史遗留物盘清楚。
> 所有结论均经只读核查；标注 **[已验证]** 的条目我亲自复算或打过线上接口。
> 审计日期：2026-10-20
>
> **更新 2026-10-20 晚**：§1 的两项红项已处理其一 —— `node-functions/api/lottery.js` 与
> `public/admin/lottery.html` 已删除、`ARCHITECTURE.md` 相关行已清理，待重新部署后
> `/api/lottery` 即 404；COS 的 `data/lottery.json` 仍需手工清理。
> 密钥轮换仍未执行。

---

## 一、结论摘要

### 🔴 两件必须立刻处理（与清理无关，属安全）

| # | 事项 | 依据 |
|---|---|---|
| 1 | **轮换 COS 密钥** | `.workbuddy/upload_all.py:4-5` 有明文 SecretId/SecretKey，且该字符串**已进 git 历史**（`git log -S` 命中 `7a3448b`）。删文件不能止损，必须去腾讯云控制台轮换，再同步更新 EdgeOne 环境变量 |
| 2 | ~~**下线 `/api/lottery`**~~ ✅ **已于 2026-10-20 删除源码** | ~~**[已验证]** 线上 `GET /api/lottery` 返回 **HTTP 200**，无鉴权直接吐出奖池与中奖历史。且 `lottery.js:111-120` 的 `setClosed` **无鉴权**，任何人可重新开奖；`freshState()` 返回 `closed:false`，**COS 的 `data/lottery.json` 一旦被删，抽奖会自动复活**~~ → 源码已删，**待部署生效**；COS 对象待清 |

### 🟡 三处会挡住功能建设的结构性缺口

| 缺口 | 现状 | 后果 |
|---|---|---|
| 学生不能上传 | `upload.js:94-96` 在收请求第一行 `verifyToken`（要求管理员 realm `r`）；学生 token 是 `{realm:'user'}` → 必 401 | 活动一的「提交资料」这一环不存在 |
| 「认领」零实现 | 全站 grep `认领\|claim\|reserve` 只命中 CSS `preserve-3d` | 活动一、二的核心实体、配额、先到先得全部要新建 |
| 「选课人数」零数据 | 只有站点级注册数，无按课程人数 | 活动二的排序必须换代理口径（已有可跑通的公式） |

### 🟢 数据基础够用

- **219 门课 `materials=0`**，其中 **213 门连题库也没有** —— 缺口池足够大
- 悬赏链路的审核三态 + 20 秒轮询刷新已具备，可直接当模板
- 并发锁基础设施（`readJsonWithEtag` + `writeJsonIfMatch`）现成，只是 `upload.js` 偏偏没用
- 学生账号体系已有（`/api/user` + `AuthPanel.vue`），"一人≤2 门"的身份前提不需重建

### 📦 可回收空间约 **650 MB**

| 来源 | 体积 |
|---|---|
| `.vitepress/dist-old1~13` + `.temp-old1` | 563 MB（**未被 gitignore**） |
| `.vitepress/dist-old` + `dist-bak` | 77 MB（已 gitignore） |
| `public/files/`（本地资料副本） | 9.4 MB |

---

## 二、活动支撑功能：模块与逻辑梳理

### 2.1 能力现状总表

| 能力 | 状态 | 位置 | 备注 |
|---|---|---|---|
| 缺资料计数数据 | ✅ 已有 | `public/data/semester-index.json` | 235 课名 / 219 门无资料 |
| 缺资料**汇总页** | ❌ 缺失 | — | 只有 `semester-health.js` 在学期页内联徽标 |
| 资料上传（管理员） | ✅ 已有 | `upload.js`、`public/admin/upload.html` | presign/save/remove/rename，**无审核、无元数据、无并发锁** |
| 资料上传（学生） | ❌ 缺失 | 同上 | `upload.js:94` 管理员 realm，学生 401 |
| 认领（claim） | ❌ 缺失 | — | 全站 0 实现 |
| 认领配额（≤2 门） | ❌ 缺失 | — | 身份已有，规则需新写 |
| 先到先得并发控制 | 🟡 基础设施已有 | `_cos.js` | `readJsonWithEtag` / `writeJsonIfMatch` 现成 |
| 悬赏发布/点赞 | ✅ 已有 | `BountySection.vue`、`bounty.js` | 匿名 fp，无登录 |
| 悬赏审核三态 | ✅ 已有 | `bounty.js`、`admin/bounty.html` | `pending/approved/rejected` + `completed` 布尔 |
| 悬赏认领/接单 | ❌ 缺失 | — | `bounty.js:130` status 白名单写死三态 |
| 自动缺课榜 | ❌ 缺失 | — | 现榜单 = 学生手写文本 + 点赞，非系统排序 |
| 榜单即时刷新 | ✅ 已有 | `BountySection.vue:82` | 20 秒轮询，够用 |
| 需求强度代理数据 | ✅ 已有 | `curriculum.json` + `semester-index.json` | 专业数/学分/必修/缺口皆可算 |
| 选课人数 | ❌ 缺失 | — | 无按课程人数 |
| 学生查提交状态 | ❌ 缺失 | — | 只有后台看得到 |
| 48h 反馈 SLA | ❌ 缺失 | — | 无时间戳、无通知 |
| 贡献榜展示 | ✅ 已有 | `/contributors`、`contributors.js` | — |
| 贡献榜自动入账 | ❌ 缺失 | — | `count` 纯手工，无"审核通过自动 +1" |
| 覆盖率当前值 | ✅ 已有 | `semester-index.totals.coverage` | withMaterials 16 / 235 |
| 覆盖率历史序列 | ❌ 缺失 | — | 活动三的"覆盖率变化"画不出来 |
| 学期盘点报告 | ❌ 缺失 | — | 无页面、无生成器 |
| 致谢名单学期维度 | 🟡 部分 | `ContributorsPage.vue` | 可当名单，但无学期维度、无导出 |

### 2.2 三个活动的缺口与新建位置

**活动一 · 期初「课程资料认领」**

可直接用：缺资料计数（`semester-index`）、上传技术链路（presign→PUT→save）、审核范式（照抄 bounty 三态）、贡献榜、学生身份。

必须新建：
1. 缺资料**汇总页** → `claim.md` + `ClaimBoard.vue`
2. 认领实体 → `data/claims.json` + `node-functions/api/claims.js`
3. 配额与先到先得 → 用 `readJsonWithEtag + writeJsonIfMatch`，规则 `count(claimer && term && status!=='rejected') < 2`
4. **学生提交通道** → 给 `upload.js` 加 `submit` action 走 `verifyUserToken`，或新建 `submissions.js`
5. 提交元数据 → **不要塞进 materials.json**（它装不下章节/来源/提交人/状态）。另建 `data/submissions.json`，审核通过后再由云函数写回 materials.json，保持课程页零改动
6. 学生侧状态可见 → `claims.js` 加 `mine` action + 前端状态块
7. 贡献榜自动入账 → 审核通过时 `contributors` 自动 +N
8. 48 小时 SLA → 存 `reviewedAt`，超时高亮

**活动二 · 期中「缺课悬赏」**

可直接用：悬赏表单与点赞、审核、20 秒轮询刷新、缺口与需求强度数据。

必须新建：
1. 自动缺课榜 → `scripts/gen-gap-board.mjs` → `public/data/gap-board.json`（照 `gen-semester-index.mjs` 模板：`findProjectRoot` + 内容不变不写 + `contentHash`）
2. 认领字段 → 建议与活动一**共用 `claims.js`**（`kind: 'material' | 'bounty'`），一套状态机管两类认领
3. `bounty.js:130` status 白名单要加 `claimed/submitted`，并同步 `admin/bounty.html:97-111` 的 badge 映射
4. 悬赏与提交物关联 → `submissionId` 反向指针

**活动三 · 期末「成果盘点与致谢」**

可直接用：覆盖率当前值、健康度公式、`/contributors` 当贡献榜、visible 列表当致谢名单。

必须新建：
1. **覆盖率历史序列** → `data/coverage-history.json`，在 `site-metrics.mjs` 写完快照后 append 一条 `{date, coverage, content}`，按日期去重
2. 盘点报告页 → `semester-report.md` + `SemesterReport.vue` 或纯构建期生成器
3. 贡献统计学期维度、致谢名单导出

### 2.3 建议的 claims.json 结构

```json
{ "version": 1, "updatedAt": 0,
  "claims": [{
    "id": "k_xxx",
    "term": "2026-2027-1",
    "kind": "material | bounty",
    "courseName": "", "courseCode": "",
    "bountyId": "",
    "claimer": "username", "displayName": "", "groupId": "",
    "status": "claimed | submitted | approved | rejected | expired",
    "createdAt": 0, "submittedAt": 0, "reviewedAt": 0,
    "reviewer": "", "note": "",
    "submission": { "chapter": "", "source": "", "url": "", "key": "", "size": 0, "ext": "" }
  }]
}
```

### 2.4 一个必须解决的时序问题

`semester-index.json` **会滞后于真实上传**：管理员上传后写的是 **COS** 的 `materials.json`，而构建钩子只看**仓库**那份的 mtime。课程页立刻能看到新资料，但"缺资料清单/健康度"要等仓库文件同步并重建才更新。

**活动二要"榜单即时刷新"，这条不解决就是假的。** 两条路：榜单页直读 COS，或上传后回写仓库并触发重建。

---

## 三、COS 存量盘活：链路与路径

### 3.1 索引链路 [已验证]

- **唯一写入方**：`upload.js`。`save` 时 `list.push({name, url, ext, size})`，**每次整份读改写、无 ETag** → 并发上传互相覆盖
- **前端只读 COS**：`materials-loader.js:7` 的 `MATERIALS_URL = BASE + '/data/materials.json'`，**无本地回退**
- **本地 `data/materials.json` 只服务构建期**：`site-metrics.mjs`（首页数字）、`gen-semester-index.mjs`（学期页徽标）
- **改本地对线上零影响**；补录必须「先写云端、再回写本地并提交」

两个补录硬约束：
1. `url` 必须以 `https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com/` 开头 —— `previewInfo()` 用字符串 replace 剥前缀拿 key，相对路径会让 `/api/preview` 直接 400
2. `ext` 必须是真实扩展名小写，否则静默降级成纯下载链接

### 3.2 存量规模 [已验证，独立复算]

| 指标 | 数值 |
|---|---|
| `files/` 对象总数 | **731** |
| 总体积 | **1086.3 MB** |
| 文档类（pdf/doc/docx/ppt/pptx/xls/xlsx/zip/rar/7z） | **216** |
| 网页导出碎资源（png 482 / 。下载 12 / css 8 …） | **515** |
| 已编目文档 | 52 |
| **可盘活条目** | **164** |

预计效果：**课程覆盖 12 → 22~23 门，条目 59 → 223（约 3.8 倍）**。

### 3.3 盘活的三个方案

| 方案 | 前提 | 需改动位置 | 风险 |
|---|---|---|---|
| **A 云函数加 listFiles + 后台扫描页** | EdgeOne 已配 COS 凭证（现状已配）；需极简 XML 解析；操作人 role=2 | `_cos.js` 加 `listObjects()`；`upload.js` 加 `scan`/`bulkSave`；新建 `public/admin/materials-scan.html` | `bulkSave` 必须一次读一次写；List 返回 731 条 XML 的体积与耗时 |
| **B 离线快照 + 生成补丁 + 一次性 PUT** | 一次性拿到凭证；**快照需重跑**（现有快照是 8-26 的，索引 59 条里有 7 条在快照中缺失） | 新建 `scripts/gen-materials-patch.mjs`；复用现有 PUT 脚本 | 只解决一次性；目录映射歧义会挂错课 |
| **C upload.html 逐门重传** | 无 | 无需改动 | **不盘活存量**：生成新 key，旧文件仍无索引，等于再存 1 GB |

**建议：B 先出成果（当天、风险最低），A 作为长期增量能力。**

### 3.4 三个必须避开的坑

1. **不按扩展名过滤会卡死页面**：数电目录 526 个对象里只有 24 个真文档（482 个是 png）。`materials-loader.js:185-193` **无分页**，塞 500 行直接卡死
2. **归一化函数有两套且不一致**：`upload.html:120-125` 保留 A/B/AI 后缀；`gen-semester-index.mjs:82-104` 会剥分级字母。用错会出现「资料挂在 `大学物理` 上、课程页读 `大学物理B` → 页面照样显示『资料建设中』」
3. **目录名 ≠ 课程名**，4 组歧义必须人工判定（约 44 条）：`思想政治`（是习思想概论，不是思想道德与法治）、`电力系统`（多门同名）、`电气控制与PLC`（courses.json 里只有"电气控制技术"）、`单片机`（6 个近似名）

---

## 四、待清理 / 待废弃项清单

> 影响范围一列说明「谁引用它、删了会怎样、是否需同步改文档」。

### A. 死代码

| 项目 | 位置 | 影响范围 | 建议 |
|---|---|---|---|
| `CourseDetail.vue` | `.vitepress/theme/` | 仅 `index.ts:3` import + `:31` 注册；全站 0 处 `<CourseDetail`。删：改 index.ts 两行 | 删（同 commit 改 index.ts + ARCHITECTURE.md:48） |
| `SemesterList.vue` | 同上 | **完全孤儿**，index.ts 未 import | 删（零影响） |
| `NotFoundPage.vue` | 同上 | **完全孤儿**；404 用根目录 `404.md` | 删（零影响） |
| `SharedCourses.vue` | 同上 | `index.ts:2/30` + `Layout.vue:7/26-28` 的条件槽；**全仓无任何 md 设置 `pageClass='shared-courses-page'`，槽永不渲染** | 删需连带改 index.ts + Layout.vue；`public/icons/` 唯一引用者就是它，可整目录删 |
| `compare_curriculum.js` + `curriculum_raw.txt` | 根目录（tracked） | 二者互为唯一引用，无其他调用 | 成对 `git rm` |
| `fill_templates.py` / `fill_templates2.py` / `refill_templates.py` | 根目录（**tracked**） | 全仓 0 引用，三者是同一件事的三次迭代 | `git rm` |
| `generate_all.mjs` | 根目录（tracked） | 0 引用 | `git rm` |
| `gen-docx.mjs` / `gen-plan.mjs` | 根目录（tracked） | 0 调用；`docx` 依赖的唯一使用者 | `git rm`，随后移除 `dependencies.docx` |
| `create_*.py` / `insert_templates.py` | 根目录（untracked，已 gitignore） | 腾讯文档一次性脚本，任务已完成 | 直接删 |
| `vitepress.pid` | 根目录（**tracked**，内容 `877`） | 进程号残留被误提交 | `git rm` |
| `test-deploy-check.md` | 根目录（tracked，`# deploy ok`） | 会构建出一个 `/test-deploy-check.html` 页面 | `git rm` |
| `.backup_redundant/` | 根目录（**96 文件 tracked**） | 重构前扁平结构旧 md；点号目录不发布，功能零影响 | `git rm -r`，单独 commit |
| `NVIDIA Corporation/` | 根目录 | 0 字节空目录 | 删 |
| `dev.log` | 根目录（untracked） | 本地调试日志 | 删 |

### B. 已下线功能的残留

| 项目 | 位置 | 影响范围 | 建议 |
|---|---|---|---|
| **`lottery.js`** | `node-functions/api/` | **[已验证]** 线上 `GET /api/lottery` 返回 200 且无鉴权吐中奖名单；`setClosed` 无鉴权；状态丢失即自动复活 | **立刻删函数**（需重新部署才生效），并清理 COS 的 `data/lottery.json`（含真实姓名，属个人信息） |
| `public/admin/lottery.html` | `public/admin/` | 仍会被发布成公开 URL | 删（该 URL 变 404） |
| `leaderboard.js`（api）+ `leaderboard.js`（theme） | `node-functions/api/`、`.vitepress/theme/` | 两处恒返回 `open:false`，**但上报分支真写盘**（存了数据永远无人读） | 建议**保留落数据能力**（将来实装可直接用历史），但删掉用户可见的空头承诺 |
| `Checkin.vue` 排行榜文案 | `.vitepress/theme/Checkin.vue:181/229` | 对用户明说"榜页建设中" | 改成中性文案或去掉 |

### C. 重复与过期数据

| 项目 | 位置 | 影响范围 | 建议 |
|---|---|---|---|
| **`public/files/`（9.4 MB）** | `public/` | **[已验证] 59 条索引 URL 前缀只有一种：COS 全域名；以 `/files/` 开头的 0 条；站内引用本地 `/files/` 的 0 处** —— 纯死重，每次部署多拷 9.4 MB | 删（建议保留一份离线备份后再删） |
| `ta-say.svg` | `public/` | 全仓 0 引用（Ta说已由组件实现） | 删 |
| `public/icons/`（13 个 svg） | `public/` | 唯一引用者是死组件 `SharedCourses.vue`；另 8 个在现 md 中 0 引用 | 删 SharedCourses 后整目录删 |
| `public/课程任务分配表.xlsx` | `public/` | 与根目录同名重复，且会被公开下载 | 删 |
| `public/manifest.json` | `public/` | head 里无 `link rel=manifest` 注入，PWA 声明未生效 | 要么接线，要么删 |
| `data/content.json`（33 字节） | `data/` | **本地这份无人读**：前端读 COS 侧；不在 `SYNC_FILES`；无 import。真实源在 COS | 删本地这份，改 ARCHITECTURE.md 表述为"COS 对象" |
| `data/materials.json` 双轨断裂 | `data/` vs `public/data/` | **现存真 bug**：`StudyPlan.vue:264` 请求 `/data/materials.json`，但 public 侧没这份、也不在 `SYNC_FILES` → **必然 404**（有 catch 兜底所以静默） | 修：加进 `SYNC_FILES`，或让 StudyPlan 走 COS |
| `public/data/courses.json` | `public/` | 6 个消费者（含 4 个 admin 页）+ `gen-kp-index.mjs`；**无生成脚本、已 2 个月未更新** | 删不得；需确认与 `curriculum.json` 是否一致 |
| `public/course_metadata.txt` | `public/` | `/admin/index.html:83` **唯一数据源**，删则后台崩；已 2 个月未更新 | 保留，但需确认一致性（隐性技术债） |
| 6 个 `.md.bak` | 根目录 | 对应正式文件全部存在且更新过；`*.bak` 已 gitignore，untracked | 整批删 |
| `.vitepress/dist-old1~13` + `.temp-old1` | `.vitepress/` | **563 MB，未 gitignore**，持续出现在 `git status` 的 `??` 里，有被 `git add .` 误提交的风险；不参与发布 | 删 + 先补 gitignore |
| `.vitepress/dist-old` + `dist-bak` | `.vitepress/` | 77 MB，已 gitignore | 删 |
| `.workbuddy/zip_extract/`、`zip2_extract/`、`emblem.png.bak`、`cloudbase_style.css`、`cos_index.html` | `.workbuddy/` | 交付包解压副本 / 旧备份 / CloudBase 时代样式；`cos_index.txt` 是 8-26 快照，**已过期**（缺 bank/leaderboard/lottery 等对象） | 删；但盘活时如需参考可先重跑列举 |

### D. 配置与文档过期

| 项目 | 位置 | 影响范围 | 建议 |
|---|---|---|---|
| `sync` / `deploy` npm 脚本 | `package.json:13-14` | `sync.mjs:29` 的域名是 CodeBuddy/CloudBase 时代旧站；`sync.mjs:27` 的课程目录路径**已不存在**；`deploy` 实际只构建**不部署**，名字有误导性 | 两条脚本 + `sync.mjs` + `sync-config.json` 一起删 |
| `dependencies.docx` | `package.json:17` | 唯一使用者是死代码 `gen-docx.mjs` / `gen-plan.mjs` | 删死代码后移除依赖 |
| `srcExclude: ['cloud-function/**']` | `config.mts:152` | 该目录**已不存在**，属失效配置（无害） | 清理时一并去掉 |
| **`PROJECT_DELIVERY.md`** | 根目录 | **最大认知陷阱**：整篇停留在 CloudBase + GitHub Pages + GitHub Contents API 架构，与现状（EdgeOne Pages + COS）完全不符，还列出 4 个死组件与已不存在目录 | **整篇重写或归档**，不要逐行修 |
| `ARCHITECTURE.md` 8 处 | 根目录 | `:48-49` 死组件列为在用；`:63/72/170/232/261` 抽奖；`:86` docx 依赖；`:182` 漏 cards/site-metrics 且未提 materials 双轨断裂；另 `:171/187` 仍写后台口令 `123456#`（实际已是 HMAC token） | 逐处修 |
| `OPTIMIZATION_PLAN.md` | 根目录 | 2026-07 规划稿，已被 10 月三批实现超越 | 归档 |
| `.gitignore` 缺口 | 根目录 | **只覆盖 `dist-old`/`dist-old2`/`dist-bak`**，`dist-old1`/`dist-old3~13`/`.temp-old1` 全未覆盖；`.workbuddy/` 只列 6 个文件名（另有 30+ 脚本未覆盖，其中 `deploy_cs.py`/`upload_cos.py` **已 tracked**）；`.ardot-*`（12 文件 tracked）、`.backup_redundant/`（96 tracked）、`*.pid` 均无规则 | 改为 `.vitepress/dist-*/`、`.vitepress/.temp*/`、`.workbuddy/*.py` + `!.workbuddy/memory/`、`.ardot-*/`、`.backup_redundant/`、`*.pid`，再对已 tracked 的垃圾 `git rm --cached` |

### E. 危险项（只报告，未改动）

| 项目 | 位置 | 风险 |
|---|---|---|
| **明文 COS SecretId/SecretKey** | `.workbuddy/upload_all.py:4-5` | 该文件 untracked，但密钥**已进 git 历史**（`7a3448b`）。删文件无济于事，**必须轮换** |
| CloudBase Space Key | `.workbuddy/deploy_cs.py:13` | 该文件 **tracked**，密钥在 git 中。旧架构已停用，风险等级中等 |
| `/api/lottery` 无鉴权 | `lottery.js:41-44` / `:111-120` | 泄露中奖名单 + 任何人可重新开奖 |
| 其余 `.workbuddy/*.py` | `configure_cors.py`、`list_bucket.py` 等 9 个 | 均已改用 `os.environ.get`，**无明文**，安全 |

---

## 五、我裁决的两处冲突

审计过程中出现两处判断分歧，均以实测为准：

1. **`public/files/` 能不能删** —— 一份审计报告认为"59 处 `/files/` 路径被渲染成下载链接，删则 404"。实测：59 条 URL 的**唯一前缀是 COS 全域名**，以 `/files/` 开头的记录 **0 条**，站内引用本地 `/files/` 的 **0 处**。结论：**可删**，但要留离线备份。
2. **抽奖是否只剩代码残留** —— 前一份报告认为"前台入口已彻底清除"。实测线上 `GET /api/lottery` **HTTP 200** 且返回真实中奖历史。结论：**不只是残留，是正在对外服务的无鉴权接口**，优先级为最高。

---

## 六、建议清理顺序

**第 0 步（立刻，与清理无关）**
1. 轮换 COS 密钥 → 删 `.workbuddy/upload_all.py` → 更新 EdgeOne 环境变量
2. 删 `lottery.js` 与 `public/admin/lottery.html` → 重新部署 → 验证 `/api/lottery` 返回 404 → 清 COS 的 `data/lottery.json`

**第 1 步：零影响批量删除（一个 commit）**
`.vitepress/dist-old*` + `.temp-old1`（先补 gitignore）、6 个 `.md.bak`、`dev.log`、`vitepress.pid`、`test-deploy-check.md`、`NVIDIA Corporation/`、`public/files/`、`public/ta-say.svg`、`public/课程任务分配表.xlsx`、`.old-courses/`、`.workbuddy/` 一次性脚本与解压副本

**第 2 步：删代码，同 commit 改引用（一个 commit）**
4 个死组件（含 index.ts + Layout.vue + `public/icons/`）、根目录每个死脚本、`sync.mjs` + `sync-config.json` + 两条 npm 脚本、`docx` 依赖

**第 3 步：修真 bug（独立 commit）**
`StudyPlan.vue:264` 的 `/data/materials.json` 404 —— 把 `materials.json` 加进 `SYNC_FILES` 或改走 COS

**第 4 步：文档治理**
`PROJECT_DELIVERY.md` 整篇重写；`ARCHITECTURE.md` 修 8 处；`.gitignore` 补齐并对已 tracked 垃圾 `git rm --cached`

---

## 七、必须保留

- `scripts/` 四个生成器 —— 构建链核心，`predev`/`build` 直接依赖
- `data/` 九个 json（`curriculum` / `bank` / `syllabus` / `course-index` / `cards` / `changelog` / `contributors` / `stories` / `site-metrics`）
- `public/data/` 全部，尤其 `kp-index.json`、`semester-index.json`、`courses.json`
- `public/course_metadata.txt` —— 后台主数据源
- `public/` 四个 loader 脚本 —— `config.mts` 全局注入
- `node-functions/api/` 除 lottery 外全部，含 4 个 `_*.js` 共享模块
- `.workbuddy/memory/` —— 项目决策史料，本次多处结论靠它交叉验证
