// 批量补齐课程文档和学期页面
// 基于培养方案文档数据，确保所有专业课程完整
import fs from 'fs';
import path from 'path';

const BASE = 'D:/培养方案拓展';
const majors = ['dianzikexue', 'dianqigongcheng', 'nongyejixiehua', 'nongyegongcheng'];

// 学期中文名映射
const semNames = [
  null,
  '大一上学期', '大一下学期', '大二上学期', '大二下学期',
  '大三上学期', '大三下学期', '大四上学期', '大四下学期'
];

// ============================================================
// 课程数据 - 按专业/学期整理，来自培养方案docx
// ============================================================

// 电气工程及其自动化 — 99门课程
const dianqigongchengData = [
  // 第1学期 (13门)
  { semester: 1, courses: [
    { name: 'C语言程序设计', slug: 'c', shared: true, credits: '2.5', type: '必修', code: '1210004000' },
    { name: 'C语言程序设计实验', slug: 'c-lab', shared: true, credits: '1.5', type: '必修', code: '4210004000' },
    { name: '大学生心理健康与职业发展II', slug: '大学生心理健康与职业发展ii', shared: true, credits: '0.5', type: '必修', code: '1212418020' },
    { name: '大学体育I', slug: '大学体育i', shared: true, credits: '1.0', type: '必修', code: '1215787000' },
    { name: '大学英语AI', slug: 'english-a1', shared: true, credits: '4.0', type: '必修', code: '2210141110' },
    { name: '高等数学AI', slug: 'math-a1', shared: true, credits: '5.0', type: '必修', code: '1215607110' },
    { name: '国家安全教育', slug: '国家安全教育', shared: true, credits: '1.0', type: '必修', code: '1217000010' },
    { name: '思想道德与法治', slug: '思想道德与法治', shared: true, credits: '2.5', type: '必修', code: '1215841000' },
    { name: '形势与政策I', slug: '形势与政策i', shared: true, credits: '0.5', type: '必修', code: '1211227010' },
    { name: '中国近现代史纲要', slug: '中国近现代史纲要', shared: true, credits: '2.5', type: '必修', code: '1215845000' },
    { name: '专业概论与新生研讨', slug: '专业概论与新生研讨', shared: true, credits: '0.5', type: '必修', code: '1215838010' },
    { name: '大学生心理健康与职业发展I', slug: '大学生心理健康与职业发展i', shared: true, credits: '0.5', type: '实践教学', code: '1212418010' },
    { name: '军训', slug: '军训', shared: true, credits: '0.0', type: '实践教学', code: '3215858000' },
  ]},
  // 第2学期 (12门)
  { semester: 2, courses: [
    { name: '大学体育II', slug: '大学体育ii', shared: true, credits: '1.0', type: '必修', code: '1215788000' },
    { name: '大学物理B', slug: 'physics-b', shared: true, credits: '3.0', type: '必修', code: '1215749220' },
    { name: '大学物理实验B', slug: 'physics-b-lab', shared: true, credits: '1.0', type: '必修', code: '4215752220' },
    { name: '大学英语AII', slug: 'english-a2', shared: true, credits: '4.0', type: '必修', code: '2210141120' },
    { name: '概率论与数理统计B', slug: 'prob', shared: true, credits: '4.0', type: '必修', code: '1210255207' },
    { name: '高等数学AII', slug: 'math-a2', shared: true, credits: '5.0', type: '必修', code: '1210267121' },
    { name: '人工智能', slug: 'ai-intro', shared: true, credits: '1.0', type: '必修', code: '1217001000' },
    { name: '线性代数', slug: 'linalg', shared: true, credits: '2.0', type: '必修', code: '1215104001' },
    { name: '形势与政策II', slug: '形势与政策ii', shared: true, credits: '0.5', type: '必修', code: '1211227020' },
    { name: 'MATLAB程序设计', slug: 'matlab', shared: true, credits: '2.0', type: '专业方向课', code: '1210008001' },
    { name: 'MATLAB程序设计实验', slug: 'matlab-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4214493000' },
  ]},
  // 第3学期 (12门)
  { semester: 3, courses: [
    { name: '大学生心理健康与职业发展III', slug: '大学生心理健康与职业发展iii', shared: true, credits: '0.5', type: '必修', code: '1212418030' },
    { name: '大学体育III', slug: '大学体育iii', shared: true, credits: '1.0', type: '必修', code: '1211045000' },
    { name: '电路分析', slug: 'circuit', shared: true, credits: '3.0', type: '必修', code: '1210175201' },
    { name: '电路分析实验', slug: 'circuit-lab', shared: true, credits: '1.0', type: '必修', code: '4214496000' },
    { name: '复变函数与积分变换', slug: 'complex', shared: true, credits: '2.0', type: '必修', code: '1210254001' },
    { name: '工程电磁学', slug: 'engem', shared: false, credits: '2.5', type: '必修', code: '2210288001' },
    { name: '劳动教育', slug: '劳动教育', shared: true, credits: '1.0', type: '必修', code: '1215857000' },
    { name: '离散数学', slug: 'discrete', shared: false, credits: '3.5', type: '必修', code: '2210612001' },
    { name: '毛泽东思想和中国特色社会主义理论体系概论', slug: '毛泽东思想和中国特色社会主义理论体系概论', shared: true, credits: '2.5', type: '必修', code: '1210657000' },
    { name: '模拟电子技术', slug: 'analog', shared: true, credits: '3.0', type: '必修', code: '1210672001' },
    { name: '模拟电子技术实验', slug: 'analog-lab', shared: true, credits: '1.0', type: '必修', code: '4214419000' },
    { name: '习近平新时代中国特色社会主义思想概论', slug: '习近平新时代中国特色社会主义思想概论', shared: true, credits: '3.0', type: '必修', code: '1215844000' },
  ]},
  // 第4学期 (12门)
  { semester: 4, courses: [
    { name: '形势与政策III', slug: '形势与政策iii', shared: true, credits: '0.5', type: '必修', code: '1211217030' },
    { name: 'Python语言及应用', slug: 'python语言及应用', shared: true, credits: '2.0', type: '专业方向课', code: '1215689001' },
    { name: 'Python语言及应用实验', slug: 'python语言及应用实验', shared: true, credits: '1.0', type: '专业方向课', code: '4215689002' },
    { name: '大学生劳动教育（实践I）', slug: '大学生劳动教育-实践i-', shared: true, credits: '0.5', type: '必修', code: '4215858000' },
    { name: '单片机原理与应用', slug: 'mcu', shared: true, credits: '2.0', type: '必修', code: '1215949001' },
    { name: '单片机原理与应用实验', slug: 'mcu-lab', shared: true, credits: '1.0', type: '必修', code: '4215949000' },
    { name: '马克思主义基本原理概论', slug: '马克思主义基本原理概论', shared: true, credits: '2.5', type: '必修', code: '1210656000' },
    { name: '数字电子技术', slug: 'digital', shared: true, credits: '2.5', type: '必修', code: '1210969000' },
    { name: '数字电子技术实验', slug: 'digital-lab', shared: true, credits: '1.0', type: '必修', code: '4214418000' },
    { name: '信号与系统', slug: 'signal', shared: true, credits: '3.0', type: '必修', code: '1211204000' },
    { name: '信号与系统实验', slug: 'signal-lab', shared: true, credits: '1.0', type: '必修', code: '4211204000' },
    { name: '自动控制原理', slug: 'control', shared: true, credits: '3.0', type: '必修', code: '1211478000' },
  ]},
  // 第5学期 (12门)
  { semester: 5, courses: [
    { name: '自动控制原理实验', slug: 'control-lab', shared: true, credits: '1.0', type: '必修', code: '4214551000' },
    { name: '数据挖掘', slug: '数据挖掘', shared: false, credits: '2.0', type: '专业方向课', code: '1210961000' },
    { name: '数据挖掘实验', slug: '数据挖掘实验', shared: false, credits: '1.0', type: '专业方向课', code: '4219951000' },
    { name: '大学生劳动教育（实践II）', slug: '大学生劳动教育-实践ii-', shared: true, credits: '0.5', type: '必修', code: '4215859000' },
    { name: '大学生心理健康与职业发展IV', slug: '大学生心理健康与职业发展iv', shared: true, credits: '0.5', type: '必修', code: '1212418040' },
    { name: '电机学', slug: 'motor', shared: true, credits: '2.0', type: '必修', code: '1210169001' },
    { name: '电机学实验', slug: 'motor-lab', shared: true, credits: '1.0', type: '必修', code: '4214563000' },
    { name: '电力系统分析', slug: 'psa', shared: false, credits: '3.0', type: '必修', code: '1210172001' },
    { name: '电力系统分析实验', slug: 'psa-lab', shared: false, credits: '1.0', type: '必修', code: '4214589000' },
    { name: '电气测量技术', slug: 'emeasure', shared: false, credits: '2.0', type: '必修', code: '1210179001' },
    { name: '电气测量技术实验', slug: 'emeasure-lab', shared: false, credits: '1.0', type: '必修', code: '4214566000' },
    { name: '电气控制技术', slug: 'ec', shared: true, credits: '2.0', type: '必修', code: '1210181000' },
  ]},
  // 第6学期 (12门)
  { semester: 6, courses: [
    { name: '电气控制技术实验', slug: 'ec-lab', shared: true, credits: '1.0', type: '必修', code: '4210181000' },
    { name: '形势与政策V', slug: '形势与政策v', shared: true, credits: '0.5', type: '必修', code: '1211227050' },
    { name: '单片机原理与应用综合实践', slug: '单片机原理与应用综合实践', shared: true, credits: '1.0', type: '实践教学', code: '3215949000' },
    { name: '电子电路综合实践', slug: '电子电路综合实践', shared: false, credits: '1.0', type: '实践教学', code: '3214599000' },
    { name: '嵌入式系统开发与应用', slug: 'embed', shared: true, credits: '2.5', type: '专业方向课', code: '1210771001' },
    { name: '嵌入式系统开发与应用实验', slug: 'embed-lab', shared: true, credits: '1.5', type: '专业方向课', code: '4219950000' },
    { name: '人工智能原理及应用', slug: 'ai-app', shared: true, credits: '2.5', type: '专业方向课', code: '2216406000' },
    { name: '试验设计与统计分析（研）', slug: '试验设计与统计分析-研-', shared: true, credits: '2.0', type: '专业方向课', code: '1219921902' },
    { name: '变电工程设计', slug: '变电工程设计', shared: false, credits: '2.0', type: '必修', code: '1210038002' },
    { name: '变电工程设计实验', slug: '变电工程设计实验', shared: false, credits: '1.0', type: '必修', code: '4214587000' },
    { name: '电力电子技术', slug: 'pe', shared: true, credits: '2.0', type: '必修', code: '1210170001' },
    { name: '电力电子技术实验', slug: 'pe-lab', shared: true, credits: '1.0', type: '必修', code: '4214554000' },
  ]},
  // 第7学期 (5门)
  { semester: 7, courses: [
    { name: '形势与政策VI', slug: '形势与政策vi', shared: true, credits: '0.5', type: '必修', code: '1211227060' },
    { name: '电力系统继电保护', slug: '电力系统继电保护', shared: false, credits: '2.0', type: '必修', code: '1210173001' },
    { name: '电力系统继电保护实验', slug: '电力系统继电保护实验', shared: false, credits: '1.0', type: '必修', code: '4214592000' },
    { name: '传感器技术', slug: 'sensor', shared: true, credits: '2.5', type: '专业方向课', code: '1210121001' },
    { name: '传感器技术实验', slug: 'sensor-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4214657000' },
  ]},
  // 第8学期 (8门)
  { semester: 8, courses: [
    { name: '电力系统仿真技术', slug: '电力系统仿真技术', shared: false, credits: '2.0', type: '专业方向课', code: '1210171001' },
    { name: '电力系统仿真技术实验', slug: '电力系统仿真技术实验', shared: false, credits: '1.0', type: '专业方向课', code: '4214703000' },
    { name: '电子电路设计与仿真', slug: 'ecds', shared: true, credits: '2.5', type: '专业方向课', code: '1210184001' },
    { name: '电子电路设计与仿真实验', slug: 'ecds-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4214411000' },
    { name: '现代控制理论', slug: '现代控制理论', shared: false, credits: '2.5', type: '专业方向课', code: '2211172000' },
    { name: '毕业设计（论文）', slug: '毕业设计-论文-', shared: false, credits: '6.0', type: '实践教学', code: '3212676000' },
    { name: '毕业实习', slug: '毕业实习', shared: true, credits: '4.0', type: '实践教学', code: '3219930000' },
    { name: '创新创业实践', slug: '创新创业实践', shared: true, credits: '2.0', type: '实践教学', code: '3215859000' },
  ]},
];

// 农业工程 — 88门
const nongyegongchengData = [
  { semester: 1, courses: [
    { name: 'C语言程序设计', slug: 'c', shared: true, credits: '2.5', type: '必修', code: '1210004000' },
    { name: 'C语言程序设计实验', slug: 'c-lab', shared: true, credits: '1.5', type: '必修', code: '4210004000' },
    { name: '大学生心理健康与职业发展II', slug: '大学生心理健康与职业发展ii', shared: true, credits: '0.5', type: '必修', code: '1212418020' },
    { name: '大学体育I', slug: '大学体育i', shared: true, credits: '1.0', type: '必修', code: '1215787000' },
    { name: '大学英语AI', slug: 'english-a1', shared: true, credits: '4.0', type: '必修', code: '2210141110' },
    { name: '高等数学AI', slug: 'math-a1', shared: true, credits: '5.0', type: '必修', code: '1215607110' },
    { name: '国家安全教育', slug: '国家安全教育', shared: true, credits: '1.0', type: '必修', code: '1217000010' },
    { name: '思想道德与法治', slug: '思想道德与法治', shared: true, credits: '2.5', type: '必修', code: '1215841000' },
    { name: '形势与政策I', slug: '形势与政策i', shared: true, credits: '0.5', type: '必修', code: '1211227010' },
    { name: '中国近现代史纲要', slug: '中国近现代史纲要', shared: true, credits: '2.5', type: '必修', code: '1215845000' },
    { name: '专业概论与新生研讨', slug: '专业概论与新生研讨', shared: true, credits: '0.5', type: '必修', code: '1215947000' },
    { name: '大学生心理健康与职业发展I', slug: '大学生心理健康与职业发展i', shared: true, credits: '0.5', type: '实践教学', code: '1212418010' },
    { name: '军训', slug: '军训', shared: true, credits: '0.0', type: '实践教学', code: '3215858000' },
  ]},
  { semester: 2, courses: [
    { name: '大学体育II', slug: '大学体育ii', shared: true, credits: '1.0', type: '必修', code: '1215788000' },
    { name: '大学物理B', slug: 'physics-b', shared: true, credits: '3.0', type: '必修', code: '1215749220' },
    { name: '大学物理实验B', slug: 'physics-b-lab', shared: true, credits: '1.0', type: '必修', code: '4215752220' },
    { name: '大学英语AII', slug: 'english-a2', shared: true, credits: '4.0', type: '必修', code: '2210141120' },
    { name: '概率论与数理统计B', slug: 'prob', shared: true, credits: '4.0', type: '必修', code: '1210255207' },
    { name: '高等数学AII', slug: 'math-a2', shared: true, credits: '5.0', type: '必修', code: '1210267121' },
    { name: '马克思主义基本原理概论', slug: '马克思主义基本原理概论', shared: true, credits: '2.5', type: '必修', code: '1210656000' },
    { name: '线性代数', slug: 'linalg', shared: true, credits: '2.0', type: '必修', code: '1215104001' },
    { name: '形势与政策II', slug: '形势与政策ii', shared: true, credits: '0.5', type: '必修', code: '1211227020' },
  ]},
  { semester: 3, courses: [
    { name: 'CAD计算机辅助设计实验', slug: 'cad计算机辅助设计实验', shared: true, credits: '1.0', type: '必修', code: '4211119000' },
    { name: '大学生心理健康与职业发展III', slug: '大学生心理健康与职业发展iii', shared: true, credits: '0.5', type: '必修', code: '1212418030' },
    { name: '大学体育III', slug: '大学体育iii', shared: true, credits: '1.0', type: '必修', code: '1211045000' },
    { name: '电路分析', slug: 'circuit', shared: true, credits: '3.0', type: '必修', code: '1210175201' },
    { name: '电路分析实验', slug: 'circuit-lab', shared: true, credits: '1.0', type: '必修', code: '4214496000' },
    { name: '复变函数与积分变换', slug: 'complex', shared: true, credits: '2.0', type: '必修', code: '1210254001' },
    { name: '机械设计基础B', slug: '机械设计基础b', shared: false, credits: '3.0', type: '必修', code: '2210433201' },
    { name: '劳动教育', slug: '劳动教育', shared: true, credits: '1.0', type: '必修', code: '1215857000' },
    { name: '模拟电子技术', slug: 'analog', shared: true, credits: '3.0', type: '必修', code: '1210672001' },
    { name: '模拟电子技术实验', slug: 'analog-lab', shared: true, credits: '1.0', type: '必修', code: '4214419000' },
    { name: '农业与生物系统工程导论', slug: '农业与生物系统工程导论', shared: false, credits: '2.5', type: '必修', code: '2212677010' },
    { name: '形势与政策III', slug: '形势与政策iii', shared: true, credits: '0.5', type: '必修', code: '1211217030' },
    { name: '单片机原理与应用综合实践', slug: '单片机原理与应用综合实践', shared: true, credits: '1.0', type: '实践教学', code: '3215949000' },
    { name: '机械设计基础课程设计', slug: '机械设计基础课程设计', shared: false, credits: '1.0', type: '实践教学', code: '3212467000' },
    { name: '单片机原理与应用', slug: 'mcu', shared: true, credits: '2.0', type: '专业方向课', code: '1215949001' },
    { name: '单片机原理与应用实验', slug: 'mcu-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4215949000' },
  ]},
  { semester: 4, courses: [
    { name: '传感器技术', slug: 'sensor', shared: true, credits: '2.5', type: '必修', code: '1210121001' },
    { name: '传感器技术实验', slug: 'sensor-lab', shared: true, credits: '1.0', type: '必修', code: '4214657000' },
    { name: '大学生劳动教育（实践I）', slug: '大学生劳动教育-实践i-', shared: true, credits: '0.5', type: '必修', code: '4215858000' },
    { name: '毛泽东思想和中国特色社会主义理论体系概论', slug: '毛泽东思想和中国特色社会主义理论体系概论', shared: true, credits: '2.5', type: '必修', code: '1210657000' },
    { name: '数字电子技术', slug: 'digital', shared: true, credits: '2.5', type: '必修', code: '1210969000' },
    { name: '数字电子技术实验', slug: 'digital-lab', shared: true, credits: '1.0', type: '必修', code: '4214418000' },
    { name: '自动控制原理', slug: 'control', shared: true, credits: '3.0', type: '必修', code: '1211478000' },
    { name: '自动控制原理实验', slug: 'control-lab', shared: true, credits: '1.0', type: '必修', code: '4214551000' },
    { name: '传感器技术教学实习', slug: '传感器技术教学实习', shared: false, credits: '1.0', type: '实践教学', code: '3212418050' },
    { name: '创新创业实践', slug: '创新创业实践', shared: true, credits: '2.0', type: '实践教学', code: '3215859000' },
    { name: '思政课社会实践', slug: '思政课社会实践', shared: true, credits: '2.0', type: '实践教学', code: '3218038001' },
    { name: '自动控制原理综合实践', slug: '自动控制原理综合实践', shared: true, credits: '1.0', type: '实践教学', code: '3215950040' },
    { name: '电子电路设计与仿真', slug: 'ecds', shared: true, credits: '2.5', type: '专业方向课', code: '1210184001' },
    { name: '电子电路设计与仿真实验', slug: 'ecds-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4214411000' },
    { name: '农业机械设计与计算', slug: '农业机械设计与计算', shared: true, credits: '3.0', type: '专业方向课', code: '2219920000' },
  ]},
  { semester: 5, courses: [
    { name: '大学生劳动教育（实践II）', slug: '大学生劳动教育-实践ii-', shared: true, credits: '0.5', type: '必修', code: '4215859000' },
    { name: '大学生心理健康与职业发展IV', slug: '大学生心理健康与职业发展iv', shared: true, credits: '0.5', type: '必修', code: '1212418040' },
    { name: '电机学', slug: 'motor', shared: true, credits: '2.0', type: '必修', code: '1210169001' },
    { name: '电机学实验', slug: 'motor-lab', shared: true, credits: '1.0', type: '必修', code: '4214563000' },
    { name: '机械制造基础', slug: 'mfg', shared: true, credits: '3.5', type: '必修', code: '2210438001' },
    { name: '机械制造基础实验', slug: '机械制造基础实验', shared: false, credits: '1.0', type: '必修', code: '4219933000' },
    { name: '汽车拖拉机学', slug: 'tractor', shared: true, credits: '3.5', type: '必修', code: '2210770001' },
    { name: '汽车拖拉机学实验', slug: '汽车拖拉机学实验', shared: false, credits: '1.0', type: '必修', code: '4219935000' },
    { name: '人工智能', slug: 'ai-intro', shared: true, credits: '1.0', type: '必修', code: '1217001000' },
    { name: '习近平新时代中国特色社会主义思想概论', slug: '习近平新时代中国特色社会主义思想概论', shared: true, credits: '3.0', type: '必修', code: '1215844000' },
    { name: '机械制造基础教学实习', slug: '机械制造基础教学实习', shared: true, credits: '1.0', type: '实践教学', code: '3219939000' },
    { name: '汽车与拖拉机学教学实习', slug: '汽车与拖拉机学教学实习', shared: true, credits: '1.0', type: '实践教学', code: '3219941000' },
    { name: 'Python语言及应用', slug: 'python语言及应用', shared: true, credits: '2.0', type: '专业方向课', code: '1215689001' },
    { name: 'Python语言及应用实验', slug: 'python语言及应用实验', shared: true, credits: '1.0', type: '专业方向课', code: '4215689002' },
    { name: '机器学习', slug: '机器学习', shared: false, credits: '2.0', type: '专业方向课', code: '1219760000' },
    { name: '机器学习实验', slug: '机器学习实验', shared: false, credits: '1.0', type: '专业方向课', code: '4219761000' },
    { name: '工程技术经济学', slug: '工程技术经济学', shared: false, credits: '3.0', type: '必修', code: '2212680070' },
  ]},
  { semester: 6, courses: [
    { name: '形势与政策V', slug: '形势与政策v', shared: true, credits: '0.5', type: '必修', code: '1211227050' },
    { name: '机械制造工艺学', slug: '机械制造工艺学', shared: false, credits: '3.0', type: '必修', code: '2210437001' },
    { name: '机械制造工艺学教学实习', slug: '机械制造工艺学教学实习', shared: true, credits: '1.0', type: '实践教学', code: '3212648060' },
    { name: '设施农业工程及其装备', slug: '设施农业工程及其装备', shared: false, credits: '3.5', type: '必修', code: '2212678060' },
    { name: '设施农业工程及其装备教学实习', slug: '设施农业工程及其装备教学实习', shared: false, credits: '1.0', type: '实践教学', code: '3212648080' },
    { name: '电气控制技术', slug: 'ec', shared: true, credits: '2.0', type: '专业方向课', code: '1210181000' },
    { name: '电气控制技术实验', slug: 'ec-lab', shared: true, credits: '1.0', type: '专业方向课', code: '4210181000' },
    { name: '农业机械化化学', slug: '农业机械化化学', shared: false, credits: '3.0', type: '专业方向课', code: '2210719001' },
  ]},
  { semester: 7, courses: [
    { name: '生物系统模拟', slug: '生物系统模拟', shared: false, credits: '2.0', type: '专业方向课', code: '1212681060' },
    { name: '生物系统模拟实验', slug: '生物系统模拟实验', shared: false, credits: '1.0', type: '专业方向课', code: '4212681060' },
    { name: '试验设计与统计分析（研）', slug: '试验设计与统计分析-研-', shared: true, credits: '2.0', type: '专业方向课', code: '1219921902' },
    { name: '农业机械化管理', slug: '农业机械化管理', shared: false, credits: '3.0', type: '必修', code: '2210718001' },
    { name: '形势与政策VII', slug: '形势与政策vii', shared: true, credits: '0.5', type: '必修', code: '1211217070' },
    { name: '机械系统动力学', slug: '机械系统动力学', shared: false, credits: '3.0', type: '专业方向课', code: '2219922000' },
  ]},
  { semester: 8, courses: [
    { name: '毕业论文（毕业设计）', slug: '毕业论文-毕业设计-', shared: true, credits: '6.0', type: '实践教学', code: '3212676000' },
    { name: '毕业实习', slug: '毕业实习', shared: true, credits: '4.0', type: '实践教学', code: '3219930000' },
  ]},
];

// ============================================================
// 证书类型映射
// ============================================================
const typeStyles = {
  '必修': 'badge-required',
  '专业方向课': 'badge-core',
  '实践教学': 'badge-elective',
};

// ============================================================
// 生成course .md 文件
// ============================================================
function ensureCourseFile(slug, courseName, major, credits, type, semNum, code, shared) {
  const dir = shared
    ? path.join(BASE, 'majors', 'shared', 'courses')
    : path.join(BASE, 'majors', major, 'courses');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${slug}.md`);
  if (fs.existsSync(filePath)) return false; // 已存在，跳过

  const semName = semNames[semNum];
  const backLink = shared
    ? '/majors/shared'
    : `/majors/${major}/semester${Math.ceil(semNum/2)}-${semNum % 2 === 0 ? 2 : 1}`;

  const content = `# ${courseName}

<span class="semester-badge" style="background:${semNum <= 2 ? '#eff6ff;color:#2563eb' : semNum <= 4 ? '#fef2f2;color:#dc2626' : semNum <= 6 ? '#fffbeb;color:#d97706' : '#f0fdf4;color:#16a34a'}">${semName}</span>
<span class="${typeStyles[type] || 'badge-required'} semester-badge">${type}</span>
<span>**${credits} 学分**</span>

> 课程编号：${code}

<a href="${backLink}" style="display:inline-block;margin:0.5rem 0 1rem;font-size:0.9rem;color:var(--vp-c-brand-1);">← 返回${shared ? '共享课程列表' : `${semName}课程列表`}</a>

---

## ① 课程介绍

| 项目 | 内容 |
|------|------|
| **课程名称** | ${courseName} |
| **课程编号** | ${code} |
| **学分** | ${credits} |
| **开设学期** | ${semName} |
| **课程性质** | ${type} |

> 📦 该课程资料正在整理中，敬请期待！

## ② 课程资料

> 📄 资料收集中。

## ③ 练习题

> ✏️ 整理中。

## ④ 推荐资源

> 🚧 待老师推荐。

## ⑤ 优秀学长「ta 说」

<div class="ta-card" style="text-align:center;padding:32px;">
  <p style="font-size:1.2rem;">🔎 招募中</p>
  <p>如果你学过《${courseName}》且成绩不错，欢迎联系管理员。</p>
  <p><a href="mailto:2286318767@qq.com">2286318767@qq.com</a></p>
</div>

> 📩 联系管理员参与共建。
`;

  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

// ============================================================
// 生成学期页面
// ============================================================
function generateSemesterPage(major, semNum, courses, majorName) {
  const semName = semNames[semNum];
  const half = Math.ceil(semNum / 2);
  const sub = semNum % 2 === 0 ? 2 : 1;

  const dir = path.join(BASE, 'majors', major);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let table = `| 序号 | 课程名称 | 学分 | 课程性质 |\n|------|----------|------|----------|\n`;
  courses.forEach((c, i) => {
    const link = c.shared
      ? `/majors/shared/courses/${c.slug}`
      : `/majors/${major}/courses/${c.slug}`;
    const typeLabel = c.type;
    const typeClass = typeStyles[c.type] || 'badge-required';
    table += `| ${i + 1} | [${c.name}](${link}) | ${c.credits} | <span class="${typeClass} semester-badge">${typeLabel}</span> |\n`;
  });

  const content = `# ${semName} · 课程列表

> ${majorName} · ${semName}

<span class="semester-badge" style="background:${semNum <= 2 ? '#eff6ff;color:#2563eb' : semNum <= 4 ? '#fef2f2;color:#dc2626' : semNum <= 6 ? '#fffbeb;color:#d97706' : '#f0fdf4;color:#16a34a'}">${semName}</span>

${table}
`;

  fs.writeFileSync(path.join(dir, `semester${half}-${sub}.md`), content, 'utf-8');
}

// ============================================================
// 主流程
// ============================================================
const majorNames = {
  dianqigongcheng: '电气工程及其自动化',
  nongyegongcheng: '农业工程',
};

const dataMap = {
  dianqigongcheng: dianqigongchengData,
  nongyegongcheng: nongyegongchengData,
};

let totalCreated = 0;
let totalSemesters = 0;

for (const [major, data] of Object.entries(dataMap)) {
  const majorName = majorNames[major];
  console.log(`\n=== ${majorName} (${major}) ===`);

  let majorCourseCount = 0;

  for (const sem of data) {
    const semNum = sem.semester;
    let createdInSem = 0;

    for (const c of sem.courses) {
      const created = ensureCourseFile(c.slug, c.name, major, c.credits, c.type, semNum, c.code, c.shared);
      if (created) createdInSem++;
      majorCourseCount++;
    }

    generateSemesterPage(major, semNum, sem.courses, majorName);
    totalSemesters++;

    if (createdInSem > 0) {
      console.log(`  第${semNum}学期: 新建 ${createdInSem} 个课程文件`);
    }
  }

  console.log(`  总计: ${majorCourseCount} 门课程`);
  totalCreated += majorCourseCount;
}

console.log(`\n✅ 完成! 生成了 ${totalSemesters} 个学期页面`);
