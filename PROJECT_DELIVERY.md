# 机电学院知识库 — 项目交付摘要

**日期**：2026-07-12  
**负责人**：杨彬  
**最近更新**：导航栏风格统一 + 右对齐修复

---

## 一、在线链接

| 资源 | 地址 |
|------|------|
| 🌐 **线上站点** | https://sicau-jdxy-resource.cn |
| 📦 **GitHub 仓库** | https://github.com/TaiBai801/scau-knowledge-base |
| 📝 **腾讯文档空间** | https://docs.qq.com/space/DZXBYSkhnRXRwSWpv |
| 🛠 **管理后台** | https://sicau-jdxy-resource.cn/admin/index.html |
| 📡 **云函数 API** | https://scau-knowledge-base-d7b3ed8d2fc8-1440170170.ap-shanghai.app.tcloudbase.com/save-course |
| 🗺 **全站导航** | /nav |

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | VitePress 1.6.4（Vue 3 + Vite） |
| 设计系统 | Ardot（品牌色 #0D5C5A / 底色 #F7F5F0 / 字体 Crimson Pro + PingFang SC） |
| 自定义组件 | Layout.vue, CustomFooter.vue, BackToTop.vue, SharedCourses.vue |
| 后端 | 腾讯云 CloudBase（SCF 云函数 + 静态托管） |
| 数据存储 | GitHub Contents API（课程 md 直写仓库） |
| 托管 | EdgeOne Pages（CDN 自动部署）/ CloudBase Webapps（admin 独立部署） |
| 协作编辑 | 腾讯文档（docs.qq.com） |

---

## 三、空间结构

### 腾讯文档
```
机电学院知识库/
├── 电子科学与技术/（大一~大四 8学期，93门课）
├── 电气工程及其自动化/（大一~大四 8学期，85门课）
├── 农业机械化及其自动化/（大一~大四 8学期，82门课）
├── 农业工程/（大一~大四 8学期，86门课）
└── 共享课程/（22个分类，23门核心课程）
    ├── 数学类/（高数、线代、概率论、复变函数）
    ├── 思政类/（马原、毛概、思修、近现代史、习思想）
    ├── 英语类/（大学英语A I/II）
    ├── 电路电子类/（电路、模电、数电 各含理论+实验）
    ├── 编程类/（C语言+实验）
    └── 物理类/（大学物理B+实验）

总计：692个节点（346文件夹 + 346 Word文档）
每门课程文档模板：课程介绍 / 学习目标 / 课程大纲 / 课件资料 / 课后练习 / 参考资源
```

### 代码仓库
```
D:\培养方案拓展/
├── .vitepress/              # VitePress 配置与主题
│   ├── config.mts            # 站点配置（路由/导航/搜索）
│   └── theme/
│       ├── style.css          # 全局样式（响应式/暗色/Ardot 设计系统）
│       ├── Layout.vue         # 自定义布局（slot 注入 Footer/BackToTop）
│       ├── CustomFooter.vue   # Ardot 风格页脚
│       ├── BackToTop.vue      # 返回顶部按钮
│       ├── SharedCourses.vue  # 共享课程页（Hero/搜索/筛选/网格）
│       ├── MajorOverview.vue  # 专业总览页
│       ├── CourseDetail.vue   # 课程详情页
│       ├── SemesterList.vue   # 学期列表
│       ├── MapPage.vue        # 课程地图
│       ├── StoriesPage.vue    # 学长说
│       ├── ContributePage.vue # 贡献指南
│       ├── ContributorsPage.vue # 贡献者墙
│       ├── AboutPage.vue      # 关于本站
│       └── NotFoundPage.vue   # 404 页面
├── majors/                  # 课程页面（Markdown）
│   ├── dianzikexue/          (8学期)
│   ├── dianqigongcheng/      (8学期)
│   ├── nongyejixiehua/       (8学期)
│   ├── nongyegongcheng/      (8学期)
│   └── shared/               (共享课程)
├── public/                  # 静态资源
│   ├── admin/
│   │   ├── index.html        # 课程总览（筛选+搜索）
│   │   └── edit.html         # 课程编辑器（含文件上传）
│   ├── files/                # 复习资料 PDF/DOC
│   ├── course_metadata.txt   # 课程元数据
│   └── 课程任务分配表.xlsx
├── cloud-function/
│   └── index.js              # CloudBase SCF（GitHub API 写课程）
├── create_*.py               # 批量创建课程脚本
├── insert_templates.py       # 批量插入文档模板
├── gen-plan.mjs              # 策划书 docx 生成
├── 机电学院知识库-策划与计划书.docx
├── 腾讯文档文件夹结构.md
└── curriculum_raw.txt
```

---

## 四、核心脚本

| 脚本 | 功能 |
|------|------|
| `create_courses.py` | 通过腾讯文档 MCP API 批量创建课程文件夹+Word文档 |
| `create_dianqi.py` | 批量创建电气工程专业课程 |
| `create_nongyejixie.py` | 批量创建农业机械化专业课程 |
| `insert_templates.py` | 批量插入标准化文档模板（6板块+占位） |
| `cloud-function/index.js` | CloudBase SCF 云函数，代理 GitHub Contents API 写入课程 md |
| `gen-plan.mjs` | 生成《机电学院知识库—策划与计划书》docx |
| `课程任务分配表.xlsx` | 346门课程的任务分配/状态跟踪 |

## 五、部署架构

```
浏览器 ─→ EdgeOne Pages (CDN) ─→ GitHub Pages (静态站点)
                                     ↑ git push
                               GitHub 仓库
                                     ↑ PUT /contents
管理后台 ─→ CloudBase SCF 云函数 ────┘
(CloudBase 静态托管，永久域名)

腾讯文档（协作编辑）─→ Python 脚本同步 ─→ 生成 .md ─→ git push
```

## 六、已完成清单

### 基础设施
- [x] 4专业346门课程在腾讯文档空间全部创建
- [x] 共享课程22分类+23核心课程文档
- [x] 课程任务分配表（Excel，346行）
- [x] CloudBase 云函数 + HTTP 网关（save-course API）
- [x] 管理后台独立 CloudBase 静态托管（永久域名）

### 前端
- [x] Ardot 设计系统全站覆盖（12个页面 + 共享组件）
- [x] 自定义 Vue 组件：Layout / Footer / BackToTop / SharedCourses
- [x] 专业总览页（梯度 Hero + 学期卡片 + CTA）已实装
- [x] 共享课程页（Hero/搜索/分类/筛选/网格）已实装
- [x] 课程地图（行式卡片 + 学期标签）已实装
- [x] 学长说 / 贡献指南 / 贡献者墙 / 关于本站 / 404 已实装
- [x] 导航栏风格统一：统一底色 + hover 高亮 + 右侧右对齐
- [x] 导航栏响应式：移动端/平板/桌面三档适配
- [x] 暗色模式全局适配
- [x] 首页宽屏比例修复（Hero + Features 居中）
- [x] TOC 不遮挡 Footer 修复（z-index + padding-bottom）
- [x] 无障碍优化（skip-to-content / focus-visible / reduced-motion）

### 内容
- [x] 24份大一上学期复习资料上传至 public/files/
- [x] 策划与计划书 docx 已生成
- [ ] 文档模板全覆盖填充（165/346，API 限流待续）
- [ ] 腾讯文档 → .md 同步脚本
- [ ] admin 保存功能端到端验证

### 待办
- [ ] 正式域名购买 + ICP 备案
- [ ] 服务器采购（2核2G Ubuntu 22.04，备案门票）
- [ ] 全站部署到自有服务器
- [ ] 文档内容众包填写
