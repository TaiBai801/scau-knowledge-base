# 机电学院知识库 — 项目交付摘要

**日期**：2026-06-06  
**负责人**：邱柯文（202405387）  

---

## 一、在线链接

| 资源 | 地址 |
|------|------|
| 🌐 **线上站点** | https://scau-knowledge-base-nhlkrpf1.edgeone.cool |
| 📦 **GitHub 仓库** | https://github.com/TaiBai801/scau-knowledge-base |
| 📝 **腾讯文档空间** | https://docs.qq.com/space/DZXBYSkhnRXRwSWpv |
| 🛠 **管理后台** | https://scau-knowledge-base-nhlkrpf1.edgeone.cool/admin/index.html |
| 🗺 **全站导航** | https://scau-knowledge-base-nhlkrpf1.edgeone.cool/nav |

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | VitePress 1.6.4（Vue 3 + Vite） |
| 设计系统 | Ardot（品牌色 #0D5C5A / 底色 #F7F5F0 / 字体 Crimson Pro + PingFang SC） |
| 自定义组件 | Layout.vue, CustomFooter.vue, BackToTop.vue |
| 托管 | GitHub Pages / EdgeOne Pages 自动部署 |
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
    ├── 形势与政策/（上学期组、下学期组）
    ├── 英语类/（大学英语A I/II）
    ├── 电路电子类/（电路、模电、数电各含理论+实验）
    ├── 编程类/（C语言+实验）
    └── 物理类/（大学物理B+实验）

总计：692个节点（346文件夹 + 346 Word文档）
每门课程文档模板：课程介绍 / 学习目标 / 课程大纲 / 课件资料 / 课后练习 / 参考资源
```

### 代码仓库
```
D:\培养方案拓展/
├── .vitepress/          # VitePress 配置与主题
│   ├── config.mts        # 站点配置（路由/导航/搜索）
│   └── theme/
│       ├── style.css      # 全局样式（响应式/暗色/导航卡片）
│       ├── Layout.vue     # 自定义布局
│       ├── CustomFooter.vue
│       └── BackToTop.vue
├── majors/              # 课程页面（Markdown）
│   ├── dianzikexue/semester*.md  (8页)
│   ├── dianqigongcheng/semester*.md (8页)
│   ├── nongyejixiehua/semester*.md (8页)
│   ├── nongyegongcheng/semester*.md (8页)
│   └── shared/index.md
├── public/              # 静态资源
│   ├── admin/           # 管理后台
│   │   ├── index.html    # 课程总览（筛选+搜索）
│   │   └── edit.html     # 课程编辑器（五段式表单）
│   ├── course_metadata.txt
│   └── 课程任务分配表.xlsx
├── create_courses.py    # 批量创建课程（农业工程）
├── create_nongyejixie.py # 批量创建课程（农业机械化）
├── insert_templates.py  # 批量插入文档模板
├── 腾讯文档文件夹结构.md
├── 课程任务分配表.xlsx
└── curriculum_raw.txt
```

---

## 四、核心脚本

| 脚本 | 功能 |
|------|------|
| `create_courses.py` | 通过 MCP API 批量创建课程文件夹+文档 |
| `insert_templates.py` | 批量插入标准化文档模板（6板块+占位） |
| `课程任务分配表.xlsx` | 346门课程的任务分配/状态跟踪 |

---

## 五、发布流程

```
腾讯文档编辑 → Python脚本同步 .md → git push → EdgeOne自动构建部署（1-2分钟）
```

---

## 六、已完成清单

- [x] 4专业346门课程在腾讯文档空间全部创建
- [x] 共享课程22分类+23核心课程文档
- [x] 课程任务分配表（Excel，346行）
- [x] 管理后台（/admin/）
- [x] 全站导航页（/nav，44入口）
- [x] 前端响应式完整适配（移动端/平板/桌面）
- [x] 暗色模式适配
- [x] Footer 管理后台入口
- [x] 贡献者页面重构
- [x] 构建性能优化（4秒）
- [ ] 文档模板全覆盖填充（已165/346，限流后待续）
- [ ] 同步脚本（腾讯文档→.md）
