# 知识库每日构建部署 — 执行记录

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
