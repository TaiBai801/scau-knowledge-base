# 机电学院知识库项目记忆

## 技术栈
- VitePress v1.6.4 静态站点
- 自定义 Vue 组件：Layout.vue, CustomFooter.vue, BackToTop.vue
- Ardot 设计系统：品牌色 #0D5C5A，底色 #F7F5F0，字体 Crimson Pro / PingFang SC

## 关键 VitePress 结构发现
- 首页 (`layout: home`) 的 VPContent 自动加 `.is-home` 类（源码在 VPContent.vue）
- Layout div **不会**加 `.home` 类，选择器要用 `.VPContent.is-home` 而非 `.Layout.home`
- VPContent 同时会加 `.has-sidebar` 类（有侧边栏的页面）
- VitePress 默认断点：960px 切换侧边栏显示/隐藏

## 响应式布局策略
- **<768px**：移动端，汉堡菜单 `display: flex !important`
- **768-959px**：侧边栏强制可见（fixed），隐藏汉堡菜单和 VPLocalNav
- **≥960px**：完全交由 VitePress 原生布局处理，仅控制宽度
- 首页用 `.VPContent:not(.is-home)` 排除侧边栏相关样式

## 已完成的 UI 重建
- Ardot 设计系统全站重建（颜色/字体/圆角/阴影）
- 院徽 emblem.png 全面替换（logo/favicon/Hero/Feature图标）
- 13项 UI 优化 + 14项前端优化（无障碍/性能/响应式/代码质量）
- 85个课程页 onclick → back-link 批量替换
- TOC 不遮挡 Footer 修复（z-index + padding-bottom）

## VitePress 自定义样式关键规则
- **Vue Scoped 覆盖问题**：VitePress 导航栏/侧边栏组件用 `<style scoped>`，全局 CSS 裸写类名（特异性 0,1,0）会被 scoped 选择器 `.class[data-v-xxx]`（特异性 0,2,0）覆盖
- **解法**：用父选择器提特异性（如 `.VPNavBar .VPNavBarMenuLink`→0,2,0）+ 全属性 `!important`
- **宽屏断点（≥960px）**：VitePress 会重构导航栏结构——`.title` 变绝对定位、`.content-body` 独立背景色、`.VPNavBar` 自身变透明
- **宽屏导航栏统一**：`@media (min-width: 960px)` 强制 `.VPNavBar .title` 和 `.VPNavBar .content-body` 设 `background: transparent !important` 继承父背景
- **"课程总览"下拉组**用的是 `VPFlyout` 组件（非 `VPNavBarMenuLink`），需单独用 `.VPNavBar .VPFlyout > .button` 覆盖

## 自定义页面组件的两个铁律
- **必须注册**：在 `.vitepress/theme/index.ts` 里 `app.component('Xxx', Xxx)`，否则 md 里
  写的 `<Xxx />` 会被原样输出成文本（曾导致贡献者墙「展示混乱」）
- **md 内嵌 HTML 不能有空行**：markdown-it 遇到空行就终止 HTML block，后面的标签会被
  当普通文本/代码块渲染。要写大段 HTML 就用 Vue 组件，别直接塞进 md

## 指标口径与统计架构（2026-10-17 固化，别再改）
- **对外「346+ 门课程」的真实来源**：`课程任务分配表.xlsx` 347 行 = 1 表头 +
  346 条（电子 93 / 电气 85 / 农机 82 / 农工 86）。**机器人工程不在此表内**，
  加号是真实含义。已固化为 `data/curriculum.json`（`scripts/import-curriculum.py`
  生成，带断言：346 条 + 93/85/82/86 分布）
- 其他已核实真实值：唯一课程 325（编号去重）/ 课程页面 434 / 共享课程 271 /
  专业 5 / 年级 11 / 学期页 88 / 学长说 4 / 章节 977 / 知识点 4248 /
  题库 421（14 门）/ 资料 59（12 门）/ 贡献者 6 人 368 次
- **两个不要搞混的口径**：`curriculum.byMajor` 是 xlsx 任务分配条数（电气 85），
  `yearPlans[].courseCount` 是站点课程卡数（电气 2024 是 99）。346 条按课程名
  去重只有 174 个唯一名——严格说 346 是「培养方案课程条目数」，不是「多少门不同的课」
- **架构：构建期快照 + 云端实时双层**。随 git 变的上构建期快照
  （`data/site-metrics.json`，SSR 直出）；后台可改的走 `/api/overview` 实时聚合。
  铁律：快照里的数字永远不来自 COS，接口里的数字永远不写死

## 构建期脚本的三个坑
- **`.vitepress/config.mts` 会被 Vite 打包成 `config.mts.timestamp-*.mjs`**，
  届时 `import.meta.url` 指向 `.vitepress/` 而不是项目根。脚本里一律用
  `process.cwd()` 向上找根；config 里调用外部脚本用 `execFileSync`，别 `import`
- **frontmatter 不经过 markdown 管道**，markdown-it 插件碰不到它。
  首页 features 这类文案里的数字必须用 `transformPageData` 单独替换
- **生成器「内容不变」时要刷新文件 mtime，但不要改 generatedAt**：
  git 只比内容不比 mtime，所以既不会产生无意义 diff，又让「源文件是否更新」
  的判断能生效。否则每次构建都会重跑一遍生成器

## ⚠️ 未处理的安全债（2026-10-20 审计发现，优先处理）
- **`/api/lottery` 线上仍存活且无鉴权**：`GET /api/lottery` 直接返回奖池与中奖历史；
  `setClosed`（lottery.js:111-120）无任何校验，任何人可重新开奖；
  `freshState()` 返回 `closed:false`，**COS 的 data/lottery.json 一旦被删，抽奖自动复活**。
  前台入口已清除但接口没下线 —— 删 `lottery.js` 并重新部署才能根治
- **明文 COS 密钥进了 git 历史**：`.workbuddy/upload_all.py:4-5` 硬编码 SecretId/SecretKey，
  文件本身 untracked，但 `git log -S` 命中提交 `7a3448b`。**删文件无济于事，
  必须去腾讯云控制台轮换并更新 EdgeOne 环境变量**
- `.workbuddy/deploy_cs.py:13` 有 CloudBase Space Key 且**已 tracked**
- `ARCHITECTURE.md:171/187` 仍在写后台口令 `123456#`（实际早已是 HMAC token），属过期文档

## 数据文件位置（三处，别搞混）
- `data/*.json`：仓库源数据
- `public/data/*.json`：构建时拷到站点根，前端 `fetch('/data/xxx.json')` 读这份。
  **`scripts/site-metrics.mjs` 的 `SYNC_FILES` 决定哪些同步过来**，新增被 fetch 的文件必须加进去，
  否则线上 404（`cards.json` 漏过一次）
- COS `data/*.json`：云函数读写。`materials.json` 是**双轨断裂**的典型：
  前端 `materials-loader.js` 只读 COS；`StudyPlan.vue:264` 却 fetch 本地 `/data/materials.json`，
  而 public 侧没这份也不在 SYNC_FILES → 恒 404（有 catch 兜底所以静默）
- **COS 侧对象不存在时让云函数自举最稳**：读不到 → 用内置 SEED 以 `If-None-Match:*`
  创建 → 重读拿 ETag（`/api/contributors` 首次就返回过空数组）

## 资料盘活的真实盘子（2026-10-20 用 COS 快照复算）
- `files/` 下 731 对象 / 1086.3 MB，但**只有 216 个是真文档**，515 个是网页导出碎资源
  （png 482 / 。下载 12 / css 8）。数电一门课 526 个对象里只有 24 个文档
- **可盘活 164 条**，可把覆盖从 12 门 59 条提到 22~23 门 223 条
- `_cos.js` **没有列举对象能力**，但签名可复用 `cosAuth('get','')`（`list_bucket.py` 已验证）
- 补录两条硬约束：url 必须以 COS 全域名开头（`previewInfo` 靠字符串剥前缀拿 key）；
  ext 必须是小写真实扩展名
- **`public/files/`（9.4 MB）是死重**：59 条索引 URL 前缀只有 COS 全域名一种，
  以 `/files/` 开头的 0 条、站内引用本地 `/files/` 的 0 处。每次部署多拷 9.4 MB

## 活动支撑的三处硬缺口
- 学生**不能上传**：`upload.js:94-96` 收请求第一行就 `verifyToken`（要求管理员 realm）；
  学生 token 是 `{realm:'user'}` → 必 401
- **「认领」零实现**：全站没有 claim/reserve 任何代码
- **「选课人数」零数据**：只能换代理口径（开课专业数 + 是否必修 + 学分 + 缺口 + 悬赏点赞）
- 覆盖率**只有当前值没有历史序列**，活动三的"覆盖率变化"必须先落 `coverage-history.json`
- ⚠️ `semester-index.json` 滞后：上传写的是 COS 的 materials.json，构建钩子只看仓库那份的 mtime

## 云函数鉴权与统计规范
- 鉴权放在 action 分发之前，未认证请求一律 401，不走业务分支、不泄露接口细节
- 写敏感数据一律 `writeJsonIfMatch(key, data, etag, 'private')`：一次调用同时拿到
  ETag 乐观锁与私有 ACL。**只有 track 埋点曾经漏掉 ETag，导致并发丢计数**
- 统计口径统一用 `_date.js` 的 `gmt8Date()`（东八区）；`checkin.js` 用运行时本地时区，
  EdgeOne 是 UTC，两者在注释里标注了差异

## 「只公示用户可感知的变化」——更新日志口径
- 面向用户的前端功能更新 → 写入公告；后台内部 bug 修复 → 不公告；
  已删除的功能（如抽奖）→ 不得出现
- 保留条目里抹掉实现细节用词（scrypt / ETag / COS / 数据万象）
- 对外版本号允许留空档，与 git 内部历史对应关系不变

## 部署与源站（2026-08-27 最终修正）
- **真实部署架构**：**EdgeOne Pages** 项目 `scau-knowledge-base`，**git push → GitHub → Pages 自动部署**
- **唯一 COS 桶**：`scau-files-1440179010`（成都），同时存网站产物 + 课件资料（files/ 731 个）

### ⚠️ 关键：DNS 双记录问题（已修复 2026-08-27）
- 域名 `sicau-jdxy-resource.cn` 曾在 DNSPod 里同时存在两条 @ 主机的 CNAME（同默认线路）：
  - Pages：`sicau-jdxy-resource.cn.pages.dnsoe5.com`（正确）
  - COS：`scau-files-1440179010.cos.ap-chengdu.myqcloud.com`（08-01 残留，导致 IPv4 `/` 403）
- **已修复**：删除 COS 那条 CNAME，现在 A/AAAA/CNAME 全部指向 Pages，IPv4/IPv6 都 200
- **COS 默认域名不提供首页索引**（`/` 必 403），只有 cos-website 域名才映射 index.html
- 资料/数据访问走 COS 桶完整域名，不经 `sicau-jdxy-resource.cn`，删域名 COS 记录不影响资料下载
- **排查"间歇性"先查 DNS 多源分流**：用多 DoH 交叉查 A/AAAA/CNAME + `--resolve` 强制指定后端

### 历史误判（血的教训）
- 曾误判为"证书问题"→"EdgeOne 回源域名错"→"IPv6 不稳定建议禁 IPv6"，**全都错**。真相是 DNS 同主机两条 CNAME（COS + Pages）随机分流，IPv4 指错到 COS。

## 旧部署（已废弃）
- **CloudBase 静态托管**：`tcb hosting deploy -e scau-knowledge-base-d7b3ed8d2fc8` → 永久域名 `https://scau-knowledge-base-d7b3ed8d2fc8-1440179010.tcloudbaseapp.com`
- **CloudBase 云函数**：SCF 代理 GitHub Contents API，admin 后台保存课程
- **EdgeOne Pages**：临时域名 3 小时过期（`eo_time missing`），不适合做长期入口
