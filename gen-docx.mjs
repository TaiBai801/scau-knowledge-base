import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak,
  TableOfContents, Header, Footer, PageNumber, LevelFormat } from 'docx';
import fs from 'fs';

const B = "2E4057";
const B_MUTED = "7A8B99";
const B_LINE = "D0D5D9";
const B_HEAD = "F5F7F8";
const FONT_SIZE = 21; // 10.5pt
const TITLE_SIZE = 44; // 22pt
const H1_SIZE = 28; // 14pt
const H2_SIZE = 24; // 12pt

const border = { style: BorderStyle.SINGLE, size: 1, color: B_LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const cellM = { top: 60, bottom: 60, left: 120, right: 120 };
const tblW = { size: 9360, type: WidthType.DXA };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: opts.size || FONT_SIZE, 
      color: opts.color || B, bold: opts.bold || false, ...opts.runOverrides || {} })],
  });
}

function h1(title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text: title, font: "Arial", size: H1_SIZE, bold: true, color: B })],
  });
}

function h2(title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: title, font: "Arial", size: H2_SIZE, bold: true, color: B })],
  });
}

function bulletItem(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Arial", size: FONT_SIZE, color: B_MUTED })],
  });
}

function makeTable(headers, rows) {
  const colCount = headers.length;
  const colW = Math.floor(9360 / colCount);
  const colWidths = Array(colCount).fill(colW);
  return new Table({
    width: tblW,
    columnWidths: colWidths,
    rows: [
      new TableRow({
        children: headers.map(h => new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          shading: { fill: B_HEAD, type: ShadingType.CLEAR },
          margins: cellM,
          children: [new Paragraph({ children: [new TextRun({ text: h, font: "Arial", size: 20, bold: true, color: B })] })],
        })),
      }),
      ...rows.map(row => new TableRow({
        children: row.map((cell, i) => new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          margins: cellM,
          children: [new Paragraph({ children: [new TextRun({ text: String(cell), font: "Arial", size: 20, color: i === 0 ? B : B_MUTED })] })],
        })),
      })),
    ],
  });
}

function section(title, children) {
  return [h1(title), ...children];
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: FONT_SIZE } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: H1_SIZE, bold: true, font: "Arial", color: B },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: H2_SIZE, bold: true, font: "Arial", color: B },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "机电学院知识库项目介绍书", font: "Arial", size: 18, color: B_MUTED, italics: true })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "第 ", font: "Arial", size: 18, color: B_MUTED }), 
                   new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: B_MUTED }),
                   new TextRun({ text: " 页", font: "Arial", size: 18, color: B_MUTED })],
      })] }),
    },
    children: [
      // ── 封面 ──
      new Paragraph({ spacing: { before: 3600 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "机电学院知识库", font: "Arial", size: 56, bold: true, color: B })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "项 目 介 绍 书", font: "Arial", size: 48, bold: true, color: B })],
      }),
      new Paragraph({ spacing: { before: 800 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "四川农业大学 · 机电学院", font: "Arial", size: 24, color: B_MUTED })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "负责人：杨彬", font: "Arial", size: 22, color: B_MUTED })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "2026年6月 | v1.0", font: "Arial", size: 22, color: B_MUTED })],
      }),

      // ── 分页 ──
      new Paragraph({ children: [new PageBreak()] }),

      // ── 目录 ──
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "目   录", font: "Arial", size: 36, bold: true, color: B })],
      }),
      new TableOfContents("", { hyperlink: true, headingStyleRange: "1-2" }),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══ 一、项目概述 ═══
      ...section("一、项目概述", [
        h2("1.1 项目名称"),
        p("机电学院知识库（SCAU Knowledge Base）"),
        h2("1.2 项目背景"),
        p("四川农业大学机电学院设有电子科学与技术、电气工程及其自动化、农业机械化及其自动化、农业工程共四个本科专业，覆盖346门课程。长期以来，课程资料、考试真题、学习经验等优质资源分散在各年级学生的个人硬盘、QQ群文件、网盘链接中，缺乏统一管理和可持续积累机制。每到期末，学生都在重复相同的信息搜集工作，学长学姐的学习经验无法有效传承。"),
        h2("1.3 核心价值主张"),
        p("建立一个「全院共建、人人共享」的课程知识平台，让每一门课的复习资料、考试真题、学习经验都有迹可循、有处可查、有源可溯。"),
        h2("1.4 解决的问题"),
        makeTable(["痛点", "解决方案"], [
          ["资料分散在QQ群/网盘，链接失效频繁", "统一托管于站点 + EdgeOne CDN，永久可访问"],
          ["学长经验口口相传，毕业后断裂", "\u201Cta说\u201D板块留存高分同学经验，结构化记录"],
          ["课程结构复杂，346门课无从下手", "按专业/学期/课程三级导航，3步找课"],
          ["多人协作编辑缺乏入口", "腾讯文档在线协作 + 管理后台编辑"],
          ["无校园官方课程资料平台", "自建Web知识库，GitHub开源运营"],
        ]),
      ]),

      // ═══ 二、现状分析 ═══
      ...section("二、现状分析", [
        h2("2.1 当前已完成功能"),
        makeTable(["模块", "完成度", "说明"], [
          ["VitePress站点框架", "100%", "响应式布局、暗色模式、无障碍支持"],
          ["四专业346门课程页面", "100%", "32个学期页 + 177个课程详情页"],
          ["全站导航系统", "100%", "44个导航入口，3级路由结构"],
          ["腾讯文档空间", "100%", "4专业×8学期全部课程文档创建"],
          ["文档模板框架", "99%", "每门课含5个标准化板块"],
          ["大一上复习资料", "已上传", "5门核心课程共24份资料"],
          ["管理后台（admin）", "80%", "课程列表 + 五段式编辑器 + 文件上传区"],
          ["云函数后端", "已写好", "CloudBase云函数代码，待部署"],
        ]),
        h2("2.2 技术架构"),
        p("前端框架：VitePress 1.6.4（Vue 3 + Vite）+ Ardot设计系统"),
        p("设计令牌：品牌色#0D5C5A / 底色#F7F5F0 / 字体Crimson Pro + PingFang SC"),
        p("协作编辑：腾讯文档MCP API（346门课程在线文档）"),
        p("认证与存储：CloudBase云函数（待部署）→ GitHub API直写"),
        p("部署：EdgeOne Pages自动构建（push即部署）"),
        h2("2.3 已识别的痛点"),
        bulletItem("内容填充率低：文档模板已建好，具体课程内容需逐门填充"),
        bulletItem("管理后台未闭环：在线编辑器已建成，缺少保存到GitHub的云端代理"),
        bulletItem("腾讯文档与站点不同步：两套系统独立维护"),
        bulletItem("内容持续性：依赖学生志愿者贡献，无激励机制"),
        bulletItem("域名缺失：当前使用EdgeOne默认域名"),
      ]),

      // ═══ 三、项目目标与范围 ═══
      ...section("三、项目目标与范围", [
        h2("3.1 短期目标（3个月内）"),
        makeTable(["里程碑", "量化指标"], [
          ["M1: 后端上线", "CloudBase云函数部署，admin页面可保存内容"],
          ["M2: 10门课内容填充", "5门大一上 + 5门大一下，每门课至少含课件+练习题"],
          ["M3: 注册独立域名", "购买自定义域名，绑定EdgeOne"],
          ["M4: 首页信息完善", "Hero区域优化 + 统计数据实时展示"],
          ["M5: 首次推广", "班群推广，目标200UV"],
        ]),
        h2("3.2 长期愿景"),
        bulletItem("全院346门课至少60%有实质性课程资料"),
        bulletItem("每届新生入学即可在平台找到所有必修课完整复习资料"),
        bulletItem("支持用户登录、收藏课程、点评功能"),
        bulletItem("与教务系统对接，自动同步课程变动"),
        h2("3.3 项目边界"),
        makeTable(["在范围内", "不在范围内"], [
          ["课程资料的结构化存管与展示", "在线直播教学"],
          ["学长经验分享（\u201Cta说\u201D板块）", "在线作业提交与批改"],
          ["管理后台与内容协作编辑", "教务选课系统集成"],
          ["四专业346门课程的完整覆盖", "其他学院/专业的扩展"],
        ]),
      ]),

      // ═══ 四、目标用户与场景 ═══
      ...section("四、目标用户与场景", [
        h2("4.1 主要用户群体"),
        makeTable(["用户角色", "核心需求", "占比"], [
          ["在校本科生", "查找考试真题、复习资料、选课参考", "80%"],
          ["考研备考学生", "系统回顾专业课知识点", "10%"],
          ["内容贡献者", "分享学习经验、上传自整理资料", "5%"],
          ["教师/教务处", "参考课程资料的学生反馈", "5%"],
        ]),
        h2("4.2 典型使用场景"),
        p("场景一：期末复习 — 大三学生打开站点 → 搜索\u201C信号与系统\u201D → 下载历年试卷 → 查看学长经验 → 完成针对性复习"),
        p("场景二：选课决策 — 大一新生浏览课程总览 → 查看课程介绍、学分、难度评价 → 合理规划选课"),
        p("场景三：内容贡献 — 高分学长打开管理后台 → 选择对应课程 → 填写学习经验 → 上传复习笔记 → 一键保存发布"),
      ]),

      // ═══ 五、功能规划 ═══
      ...section("五、功能规划", [
        h2("5.1 核心功能列表"),
        makeTable(["优先级", "功能", "状态"], [
          ["P0", "课程浏览与搜索（346门课）", "✅ 已上线"],
          ["P0", "专业/学期/课程三级导航", "✅ 已上线"],
          ["P0", "课程文档5板块框架", "✅ 已部署"],
          ["P1", "管理后台在线编辑保存", "🔄 代码就绪，待部署云函数"],
          ["P1", "课程资料上传与下载", "🔄 框架就绪，内容待填充"],
          ["P2", "用户登录与权限管理", "📋 规划中"],
          ["P2", "课程收藏与学习记录", "📋 规划中"],
          ["P3", "教务数据自动同步", "📋 远期规划"],
        ]),
        h2("5.2 后续迭代规划"),
        bulletItem("v1.1：云函数部署，admin可保存；域名注册；全站SEO优化"),
        bulletItem("v1.2：10门核心课程内容填充上线；文件上传功能完整打通"),
        bulletItem("v2.0：用户系统上线（GitHub OAuth登录）；课程收藏功能"),
        bulletItem("v3.0：数据看板（课程访问量、下载量排行）；推荐系统"),
      ]),

      // ═══ 六、技术方案 ═══
      ...section("六、技术方案", [
        h2("6.1 技术选型依据"),
        makeTable(["技术", "选择理由"], [
          ["VitePress", "构建速度4秒；Vue 3生态；纯Markdown驱动；零运行时JS"],
          ["EdgeOne Pages", "CDN加速国内访问；与GitHub集成；免费额度够用"],
          ["腾讯文档MCP API", "批量管理346门课程文档；在线协作编辑"],
          ["CloudBase云函数", "免费额度10万次/月；代理GitHub API隐藏Token"],
          ["Ardot设计系统", "品牌一致性；预定义设计令牌减少CSS重复"],
        ]),
        h2("6.2 架构设计"),
        p("解耦三层架构：内容层（Markdown + 腾讯文档）→ 构建层（VitePress + GitHub Actions）→ 编辑层（Admin页面 + CloudBase云函数）。所有课程内容为纯文本Markdown，Git版本控制；前端与内容完全解耦，不依赖数据库。"),
        h2("6.3 技术难点与应对"),
        makeTable(["难点", "应对策略"], [
          ["346门课文档模板批量插入", "编写Python脚本走MCP API批量操作，已完成"],
          ["移动端菜单黑屏/溢出", "分析VitePress双菜单机制，CSS层覆盖原生变量"],
          ["腾讯文档API限流", "限速0.1s/次 + 分批执行 + 换日重试"],
          ["多专业课程交叉共享", "设计shared/courses/目录，共享课程引用统一路径"],
        ]),
      ]),

      // ═══ 七、项目计划 ═══
      ...section("七、项目计划", [
        h2("7.1 阶段划分"),
        makeTable(["阶段", "时间", "核心任务", "交付物"], [
          ["一期：基础建设", "已完成", "站点搭建 + 346门课创建 + 文档模板", "线上站点 + 腾讯文档空间"],
          ["二期：后端闭环", "2周", "CloudBase部署 + admin保存上线", "可用的管理后台"],
          ["三期：内容填充", "4-6周", "10-20门核心课内容 + SEO", "高覆盖率的资料库"],
          ["四期：推广运营", "持续", "班群推广 + 贡献者激励", "用户增长 + UGC循环"],
        ]),
        h2("7.2 资源投入"),
        makeTable(["角色", "人数", "投入"], [
          ["项目管理 + 前端开发", "1人（杨彬）", "已完成主体开发"],
          ["内容贡献者", "5-10人", "按课程分配"],
          ["服务器/域名", "—", "约¥60/年（域名）+ 云函数免费"],
        ]),
      ]),

      // ═══ 八、风险评估 ═══
      ...section("八、风险评估", [
        makeTable(["风险", "影响", "概率", "应对措施"], [
          ["内容贡献者不足", "高", "中", "班群定点推广 + 贡献打卡奖励"],
          ["Token泄露风险", "高", "低", "Token仅存云函数环境变量，设置最小权限"],
          ["腾讯文档API变更", "高", "低", "文本内容已Markdown化，可随时迁移"],
          ["课程大纲变更", "中", "低", "每年开学季核查一次课程结构"],
          ["免费额度用尽", "低", "低", "学生项目可申请教育额度"],
        ]),
      ]),

      // ═══ 九、预期成果 ═══
      ...section("九、预期成果", [
        h2("9.1 量化指标"),
        makeTable(["指标", "目标值"], [
          ["课程覆盖率", "346/346（100%）✅ 已达成"],
          ["核心课程内容填充", "20门课有实质内容（目标首期）"],
          ["站点日UV", "100+（首月推广目标）"],
          ["页面加载速度", "FCP < 1.5s（已有CDN）"],
          ["构建时间", "< 5s（当前4s）✅"],
          ["死链数量", "0（已开启ignoreDeadLinks:false检测）✅"],
        ]),
        h2("9.2 验收标准"),
        bulletItem("任意用户可通过3步操作找到任意课程（浏览专业→选学期→点课程）"),
        bulletItem("管理后台可在线编辑任意课程内容并保存发布，无需命令行操作"),
        bulletItem("5门必修课各含≥3份复习资料文件"),
        bulletItem("站点可通过自定义域名访问"),
        bulletItem("README含完整贡献指南，新贡献者10分钟内可上手"),
      ]),

      // ── 末页 ──
      new Paragraph({ spacing: { before: 600 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "本项目为开源社区驱动的知识共享平台", font: "Arial", size: 20, color: B_MUTED, italics: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "欢迎机电学院全体师生参与共建", font: "Arial", size: 20, color: B_MUTED, italics: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "GitHub: TaiBai801/scau-knowledge-base", font: "Arial", size: 20, color: B_MUTED })],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("D:/培养方案拓展/项目介绍书.docx", buffer);
console.log("Done: 项目介绍书.docx");
