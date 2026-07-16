import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak,
  TableOfContents, Header, Footer, PageNumber, LevelFormat } from 'docx';
import fs from 'fs';

const B = '2E4057', B2 = '7A8B99', BL = 'D0D5D9', BH = 'F5F7F8', GR = '0D5C5A';
const F1 = 21, H1 = 32, H2 = 26, H3 = 22;
const border = { style: BorderStyle.SINGLE, size: 1, color: BL };
const borders = { top: border, bottom: border, left: border, right: border };
const cm = { top: 60, bottom: 60, left: 120, right: 120 };

function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text, font: 'Arial', size: opts.size || F1, color: opts.color || B, bold: opts.bold || false })] });
}
function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 }, children: [new TextRun({ text: t, font: 'Arial', size: H1, bold: true, color: B })] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: t, font: 'Arial', size: H2, bold: true, color: B })] }); }
function bullet(text) {
  return new Paragraph({ numbering: { reference: 'bl', level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, font: 'Arial', size: F1, color: B2 })] });
}
function T(headers, rows) {
  const N = headers.length, W = Math.floor(9026 / N), cw = Array(N).fill(W);
  return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: cw, rows: [
    new TableRow({ children: headers.map(h => new TableCell({ borders, width: { size: W, type: WidthType.DXA }, shading: { fill: BH, type: ShadingType.CLEAR }, margins: cm, children: [new Paragraph({ children: [new TextRun({ text: h, font: 'Arial', size: 20, bold: true, color: B })] })] })) }),
    ...rows.map(row => new TableRow({ children: row.map((c,i) => new TableCell({ borders, width: { size: W, type: WidthType.DXA }, margins: cm, children: [new Paragraph({ children: [new TextRun({ text: String(c), font: 'Arial', size: 20, color: i===0?B:B2 })] })] })) }))
  ]});
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: F1 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: H1, bold: true, font: 'Arial', color: B }, paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: H2, bold: true, font: 'Arial', color: B }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'bl', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '机电学院知识库 \u00b7 策划与计划书', font: 'Arial', size: 18, color: B2, italics: true })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '第 ', font: 'Arial', size: 18, color: B2 }), new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: B2 }), new TextRun({ text: ' 页', font: 'Arial', size: 18, color: B2 })] })] }) },
    children: [
      // 封面
      new Paragraph({ spacing: { before: 3200 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: '机电学院知识库', font: 'Arial', size: 56, bold: true, color: B })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: '策划与计划书', font: 'Arial', size: 44, bold: true, color: B })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: '四川农业大学 \u00b7 机电学院', font: 'Arial', size: 24, color: B2 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: '项目负责人：杨彬', font: 'Arial', size: 22, color: B2 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: '2026年7月 | v2.0', font: 'Arial', size: 22, color: B2 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'GitHub: TaiBai801/scau-knowledge-base', font: 'Arial', size: 20, color: B2 })] }),
      new Paragraph({ children: [new PageBreak()] }),
      // 目录
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: '目  录', font: 'Arial', size: 36, bold: true, color: B })] }),
      new TableOfContents('', { hyperlink: true, headingStyleRange: '1-2' }),
      new Paragraph({ children: [new PageBreak()] }),

      // 一
      h1('一、项目概述'),
      h2('1.1 项目背景'),
      p('四川农业大学机电学院设有电子科学与技术、电气工程及其自动化、农业机械化及其自动化、农业工程四个本科专业，覆盖346门课程。当前课程资料、考试真题、学习经验分散于QQ群文件、个人网盘，缺乏统一管理平台，学生期末复习时重复搜集资料效率低下。'),
      h2('1.2 项目目标'),
      p('建立"全院共建、人人共享"的课程知识平台，实现课程资料的结构化存管、学长经验的持续传承、四专业内容的统一检索。'),
      h2('1.3 核心价值对比'),
      T(['维度', '现状', '目标'], [['资料管理', '分散在QQ群/网盘', '统一CDN托管，永久可访问'], ['经验传承', '口口相传，毕业后断裂', '"ta说"板块结构化记录'], ['课程导航', '346门课无从下手', '专业/学期/课程三级导航'], ['内容协作', '单打独斗', '腾讯文档+管理后台协同编辑']]),

      // 二
      h1('二、现状分析'),
      h2('2.1 已完成功能'),
      T(['模块', '完成度', '说明'], [['VitePress站点框架', '100%', '响应式布局、暗色模式、Ardot设计系统'], ['四专业346门课程页面', '100%', '32个学期页+177个课程详情页'], ['全站导航系统', '100%', '44个导航入口，3级路由结构'], ['腾讯文档空间', '100%', '4专业*8学期全部课程文档创建'], ['文档模板框架', '99%', '5个标准化板块(1)-(5)'], ['管理后台（admin）', '90%', '课程列表+五段式编辑器+文件上传+保存'], ['CloudBase后端', '90%', '云函数save-course+HTTP触发器+CORS']]),
      h2('2.2 技术架构'),
      bullet('前端：VitePress 1.6.4 + Vue 3 + Ardot 设计系统'),
      bullet('部署：EdgeOne Pages 自动构建（push即部署）'),
      bullet('后端：CloudBase 云函数 -> GitHub API 直写'),
      bullet('协作：腾讯文档 MCP API（346门课程在线文档）'),
      bullet('管理：CloudBase 静态托管 -> 独立 admin 控制台'),
      h2('2.3 当前核心痛点'),
      bullet('EdgeOne默认域名3小时过期，admin需独立托管解决'),
      bullet('云函数尚未完全稳定，需加固错误处理和日志'),
      bullet('内容填充率低，346门课中有实质内容不足20门'),
      bullet('尚未购买自定义域名，无ICP备案'),
      bullet('搜索引擎未收录，无SEO优化'),

      // 三
      h1('三、项目目标与范围'),
      h2('3.1 短期里程碑（1-3个月）'),
      T(['里程碑', '目标', '预计完成'], [['M1', 'CloudBase后端完全稳定', '1周'], ['M2', 'admin保存功能投产使用', '1周'], ['M3', '购买域名+ICP备案', '3-4周'], ['M4', '20门核心课程内容填充', '6周'], ['M5', 'Google/Bing搜索引擎收录', '2周']]),
      h2('3.2 长期愿景'),
      bullet('全院346门课至少60%有实质性课程资料'),
      bullet('支持用户登录（GitHub OAuth）和课程收藏'),
      bullet('数据看板（课程访问量、下载量排行）'),
      bullet('自动化内容同步 + 公众号推送'),
      h2('3.3 项目边界'),
      T(['在范围内', '不在范围内'], [['课程资料的结构化存管', '在线直播教学'], ['学长经验分享板块', '在线作业提交/批改'], ['管理后台与协作编辑', '教务选课系统集成'], ['四专业346门课程覆盖', '其他学院扩展']]),

      // 四
      h1('四、目标用户与场景'),
      h2('4.1 用户画像'),
      T(['角色', '核心需求', '占比'], [['在校本科生', '查找考试真题、复习资料', '80%'], ['考研备考学生', '系统回顾专业课知识点', '10%'], ['内容贡献者', '分享经验、上传资料', '5%'], ['教师/教务处', '参考学生反馈', '5%']]),
      h2('4.2 典型使用场景'),
      bullet('场景A（期末复习）：大三学生搜索"信号与系统" -> 下载历年试卷 -> 查看学长经验 -> 针对性复习'),
      bullet('场景B（选课决策）：大一新生浏览课程总览 -> 查看课程介绍/学分/难度 -> 合理规划选课'),
      bullet('场景C（内容贡献）：学长通过admin后台 -> 选课填经验 -> 上传笔记 -> 一键保存发布'),

      // 五
      h1('五、功能规划'),
      h2('5.1 核心功能优先级'),
      T(['优先级', '功能', '状态'], [['P0', '课程浏览与搜索（346门课）', '\u2705 已上线'], ['P0', '专业/学期/课程三级导航', '\u2705 已上线'], ['P1', '管理后台在线编辑+保存', '\ud83d\udd04 调试中'], ['P1', '课程资料上传与下载链接', '\ud83d\udd04 调试中'], ['P2', '自定义域名+ICP备案', '\ud83d\udccb 待启动'], ['P2', 'SEO搜索引擎优化', '\ud83d\udccb 计划中'], ['P3', '用户登录+课程收藏', '\ud83d\udccb 远期']]),
      h2('5.2 版本迭代路线'),
      bullet('v1.1（当前）：CloudBase后端稳定 + admin可保存 + Ardot全部页面视觉实装'),
      bullet('v1.2：域名注册 + ICP备案 + SEO优化 + 20门课内容填充'),
      bullet('v2.0：用户系统（GitHub OAuth）+ 课程收藏 + 数据看板'),
      bullet('v3.0：自动化内容同步 + 公众号推送'),

      // 六
      h1('六、技术方案'),
      h2('6.1 系统架构设计'),
      p('解耦三层架构：内容层（Markdown+腾讯文档）-> 构建层（VitePress+GitHub Actions）-> 编辑层（Admin页面+CloudBase云函数）。所有课程内容为纯文本Markdown，Git版本控制，前端与内容完全解耦。'),
      bullet('EdgeOne Pages：CDN加速，免费额度，国内可访问'),
      bullet('CloudBase云函数：代理GitHub API，隐藏Token，免费10万次/月'),
      bullet('GitHub Actions：push即自动构建部署'),
      bullet('腾讯文档MCP API：346门课程在线协作编辑'),
      h2('6.2 关键技术难点与应对'),
      T(['难点', '对策'], [['EdgeOne域名3小时过期', 'admin独立部署CloudBase静态托管'], ['云函数CORS问题', '添加OPTIONS预检+Access-Control头'], ['VitePress多Vue组件编译慢', '核心页面用组件，次要页面用Markdown+CSS'], ['腾讯文档API限流', '0.1s/次限速+分批执行']]),

      // 七
      h1('七、项目计划与阶段'),
      h2('7.1 时间线'),
      T(['阶段', '时间', '核心任务', '交付物'], [['一期：基础建设', '已完成', '站点+346门课+文档模板', '线上站点+腾讯文档空间'], ['二期：后端闭环', '进行中', 'CloudBase部署+admin可保存', '可用的管理后台'], ['三期：域名备案', '3-4周', '购买域名+ICP备案+绑定', '自定义域名访问'], ['四期：内容填充', '4-6周', '20门核心课内容填充+SEO', '高覆盖率的资料库'], ['五期：推广运营', '持续', '班群推广+贡献者激励', '日UV 100+']]),
      h2('7.2 资源配置'),
      T(['资源', '详情', '费用'], [['域名', '.cn域名（腾讯云/阿里云）', '\u00a529-60/年'], ['服务器', '轻量云服务器2核2G（备案用）', '\u00a558/月'], ['CloudBase', '云函数+静态托管（免费额度）', '\u00a50'], ['EdgeOne Pages', 'CDN+构建部署', '\u00a50'], ['GitHub', '代码托管+Actions', '\u00a50']]),

      // 八
      h1('八、风险评估与应对'),
      T(['风险', '影响', '概率', '应对措施'], [['内容贡献者不足', '高', '中', '班群定向推广+贡献奖励机制'], ['GitHub Token泄露', '高', '低', '最小权限+仅环境变量存储'], ['腾讯文档API变更', '高', '低', '内容已Markdown化，可随时迁移'], ['免费额度用尽', '低', '低', '申请教育额度或升级付费']]),

      // 九
      h1('九、推广与运营策略'),
      h2('9.1 推广渠道'),
      bullet('机电学院各班QQ群、微信群定向推广'),
      bullet('QQ空间/朋友圈分享站点核心亮点'),
      bullet('联系辅导员/教师推荐背书，增加权威性'),
      bullet('GitHub开源社区曝光，吸引技术方向同学贡献'),
      h2('9.2 内容贡献激励机制'),
      bullet('贡献者墙：公开致谢所有内容贡献者'),
      bullet('优先展示：优秀内容置顶陈列'),
      bullet('学分激励：与学院协商将贡献纳入社会实践学分'),
      h2('9.3 运营指标对照'),
      T(['指标', '目标值', '当前状态'], [['日UV', '100+', '未统计'], ['课程覆盖率', '346/346', '\u2705 已达成'], ['核心课内容填充', '20门', '\ud83d\udd04 5门']]),

      // 十
      h1('十、预期成果与验收标准'),
      h2('10.1 量化指标'),
      bullet('课程覆盖率：346/346（100%）'),
      bullet('核心课程内容填充：20门有实质资料'),
      bullet('站点日UV：100+'),
      bullet('页面加载速度：FCP < 1.5s'),
      bullet('死链数量：0'),
      h2('10.2 验收标准'),
      bullet('任意用户通过3步操作找到任意课程'),
      bullet('Admin后台可在线编辑任意课程并保存发布'),
      bullet('5门必修课各含3份以上复习资料文件'),
      bullet('站点可通过自定义域名访问'),
      bullet('README含完整贡献指南，新贡献者10分钟内可上手'),

      // 尾页
      new Paragraph({ spacing: { before: 500 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '本项目为开源社区驱动的知识共享平台', font: 'Arial', size: 20, color: B2, italics: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '欢迎机电学院全体师生参与共建', font: 'Arial', size: 20, color: B2, italics: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '联系：2286318767@qq.com', font: 'Arial', size: 20, color: B2 })] }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync('D:/培养方案拓展/机电学院知识库-策划与计划书.docx', buf);
console.log('Done: 策划与计划书.docx ' + (buf.length/1024).toFixed(1) + 'KB');
