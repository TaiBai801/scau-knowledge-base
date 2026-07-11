# 知识库每日构建部署 — 执行记录

## 2026-07-11

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.98s)
- 构建产物：`.vitepress/dist/` (22MB)

### 部署
- CloudStudio (`workbuddy_cloudstudio_deploy`)：❌ 工具不可用（第11次出现：06-05/06-08/06-13/06-14/06-23/06-24/06-25/06-29/07-05/07-06/07-11）
- `cloudstudio-mcp-server` API 直连：❌ `CS_API_KEY` 环境变量为空值
- GitHub Actions API：❌ `GITHUB_TOKEN` 环境变量为空值
- 旧版 CloudStudio 站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度 4.98s，与近期稳定水平一致
- CloudStudio deploy 工具连续第 11 次在 automation 环境不可用
- 尝试了 cloudstudio-mcp-server (v1.0.10) 的 Python API 直接部署方案，但 CS_API_KEY/GITHUB_TOKEN 均为空字符串，无法使用
- Python API 部署脚本已保存至 `.workbuddy/deploy_cs.py`，若环境变量可用可立即执行
- 建议：在 automation 配置中注入有效的 `CS_API_KEY` 以启用备选部署路径

## 2026-07-06

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 5.39s)
- 构建产物：`.vitepress/dist/` (745 files, 22MB)

### 部署
- CloudStudio (`workbuddy_cloudstudio_deploy`)：❌ 工具不可用（第10次出现：06-05/06-08/06-13/06-14/06-23/06-24/06-25/06-29/07-05/07-06）
- `deploy.js` 备选：❌ CS_API_KEY 未设置
- GitHub Actions 备选：❌ `gh` CLI 未安装且 GITHUB_TOKEN 未设置
- 旧版 CloudStudio 站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度 5.39s，产物 745 文件 22MB，与近期水平保持一致
- CloudStudio deploy 工具连续第 10 次在 automation 环境不可用
- 建议：在 automation 配置中注入 `CS_API_KEY` 以启用 deploy.js 备选部署路径，或注入 `GITHUB_TOKEN` 触发 GitHub Actions workflow

## 2026-07-05

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.67s)
- 构建产物：`.vitepress/dist/` (745 files, 22MB)

### 部署
- CloudStudio (`workbuddy_cloudstudio_deploy`)：❌ 工具不可用（第9次出现：06-05/06-08/06-13/06-14/06-23/06-24/06-25/06-29/07-05）
- GitHub Actions 备选：❌ 部署步骤失败
  - workflow_dispatch 触发成功 (run #31, 32s)
  - 构建+上传 artifact 均成功 (8.46 MB)
  - "部署到 Pages" 步骤失败：GitHub Pages 未在仓库启用 (404)
  - 修复方式：去 Settings → Pages → Source 选 "GitHub Actions" 启用即可
- 旧版 CloudStudio 站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度 4.67s，与近期稳定水平一致
- CloudStudio deploy 工具连续第 9 次在 automation 环境不可用
- GitHub Pages 只需启用一次即可打通备选部署通道，部署步骤（build + upload artifact）已验证完全正常
- GITHUB_TOKEN/CS_API_KEY 本次均已注入但对应工具不可用

## 2026-06-29

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.59s)
- 构建产物：`.vitepress/dist/` (27 顶层条目, 22MB)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第八次出现：06-05/06-08/06-13/06-14/06-23/06-24/06-25/06-29）
- `gh` CLI 未安装，`GITHUB_TOKEN`/`CS_API_KEY` 均未设置
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度 4.59s，与近期稳定水平一致
- CloudStudio deploy 工具连续第 8 次在 automation 环境不可用
- 距离上次成功部署（06-27）仅隔 2 天，说明该工具在 automation 下不稳定间歇可用
- 建议：在 automation 配置中注入 `GITHUB_TOKEN`，使用 GitHub Actions workflow 部署（已有 deploy.yml）

## 2026-06-27

**结果：构建成功，部署成功** ✅

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 20.07s)
- 构建产物：`.vitepress/dist/` (745 files, 22MB)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：✅ 成功
- 工具：`workbuddy_cloudstudio_deploy` 可用
- 地址：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (verified)

### 备注
- 构建速度 20.07s，产物 745 文件 22MB（与 06-25 一致）
- CloudStudio deploy 工具在 automation 环境下恢复可用（06-15 后首次成功）
- 站点内容已验证可访问，机电学院知识库首页正常加载

## 2026-06-25

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.42s)
- 构建产物：`.vitepress/dist/` (745 files, 22MB)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第七次出现：06-05/06-08/06-13/06-14/06-23/06-24/06-25）
- `gh` CLI 未安装，`GITHUB_TOKEN`/`CS_API_KEY` 均未设置
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅

### 备注
- 构建速度 4.42s，产物 745 文件（较昨日 +3 文件）
- CloudStudio deploy 工具连续第 7 次在 automation 环境不可用
- 建议：在 automation 配置中注入 `GITHUB_TOKEN` 使用 GitHub Actions 部署，或等待平台修复 CloudStudio deploy 工具

## 2026-06-24

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.27s)
- 构建产物：`.vitepress/dist/` (25 个顶层条目)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第六次出现：06-05/06-08/06-13/06-14/06-23/06-24）
- 备选路径：GitHub Actions workflow_dispatch → `gh` CLI 未安装且无 token 可用
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅

### 备注
- 构建速度 4.27s，与近期稳定水平一致
- CloudStudio deploy 工具已连续 6 次 automation 环境不可用，仅 06-06 和 06-15 可用
- 站点内容无变更（git status 仅 automation memory 和 daily logs 被修改）
- 建议：将 automation trigger 改为推送代码触发 GitHub Actions（已有 deploy.yml）

## 2026-06-23

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 5.15s)
- 构建产物：`.vitepress/dist/` (742 files)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第五次出现：06-05/06-08/06-13/06-14/06-23）
- CS_API_KEY 环境变量未设置
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建产物稳定 742 文件，与历史一致
- CloudStudio deploy 工具仅在 06-06 和 06-15 两次可用，其余 5 次均失败
- 建议：将 automation trigger 改为触发 GitHub Actions workflow（已有 deploy.yml），通过 GitHub Pages 部署

## 2026-06-15

**结果：构建成功，部署成功** ✅

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.08s)
- 构建产物：`.vitepress/dist/` (742 files)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：✅ 成功
- 工具：`workbuddy_cloudstudio_deploy` 可用
- 地址：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (verified)

### 备注
- 打破连续4次部署失败局面（06-05/06-08/06-13/06-14），CloudStudio deploy 工具在 automation 环境下恢复可用
- 构建速度稳定 4.08s，产物 742 文件与近几次完全一致

## 2026-06-14

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 3.98s)
- 构建产物：`.vitepress/dist/` (742 files)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第四次出现，前三次为 06-05、06-08、06-13）
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度稳定在4s左右，产物742文件（与06-08/06-13完全一致）
- CloudStudio deploy 工具在 automation 环境下持续不可用，已连续4次失败
- 建议：考虑在 automation 中改用 GitHub Actions 部署（已有 deploy.yml），或将 CS_API_KEY 注入自动化环境变量

## 2026-06-13

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.31s)
- 构建产物：`.vitepress/dist/` (742 files)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用（第三次出现，前两次为 06-05、06-08）
- CS_API_KEY 环境变量也未设置
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅ (HTTP 200)

### 备注
- 构建速度稳定在4s左右，产物742文件（与06-08一致）
- CloudStudio deploy 工具在 automation 环境下间歇性不可用的问题持续存在，需关注平台层面修复

## 2026-06-08

**结果：构建成功，部署失败** ⚠️

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 4.03s)
- 构建产物：`.vitepress/dist/` (742 files, 比上次多 26 个文件)
- 内容变更：正常增量构建

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在 automation 环境下不可用；`deploy.js` 需要 CS_API_KEY 环境变量但未设置
- 旧版站点仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work ✅

### 备注
- 这是第二次出现 deployment tool 不可用的情况（上次 06-05），可能是 automation 环境的间歇性问题
- 需要确认 automation 环境下 CloudStudio deploy 工具是否稳定可用

## 2026-06-06

**结果：构建成功，部署成功** ✅

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 25.53s)
- 构建产物：`.vitepress/dist/` (716 files)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：✅ 成功
- 地址：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work
- 工具：`workbuddy_cloudstudio_deploy` 在 automation 环境下可用

### 备注
- 相较 06-05 部署失败，本次部署成功，`workbuddy_cloudstudio_deploy` 内置工具已可正常调用
- 站点已验证可访问

## 2026-06-05

**结果：构建成功，部署失败**

### 构建
- 命令：`node node_modules/vitepress/bin/vitepress.js build`
- 状态：✅ 成功 (vitepress v1.6.4, 2.24s)
- 构建产物：`.vitepress/dist/` (含 index.html, about.html, majors/, assets/ 等)

### 部署
- 目标：CloudStudio sandbox `6f92c87784b6436fbe8dcdef4a5291ec`
- 状态：❌ 失败
- 原因：`workbuddy_cloudstudio_deploy` 内置工具在当前环境(automation)下不可用；deploy.js 脚本需要 CS_API_KEY 环境变量但未设置
- 旧版部署仍可访问：https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work (HTTP 200)
- 内容有变更（新 hash: d4b5da0f... vs 旧 hash: da1ac6e6...）

### 建议
- 需要确认 automation 环境下 CloudStudio deploy 工具的可用性
- 或在 automation 配置中注入 CS_API_KEY 环境变量
