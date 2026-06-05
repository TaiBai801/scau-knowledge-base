const fs = require('fs');
const path = require('path');

const base = 'D:/培养方案拓展/majors';

// ============================================================
// 电子科学与技术 — 来自培养方案 (93门课, 168.5学分)
// ============================================================
const dianzikexue = {
  'semester1-1': [
    { name:'C语言程序设计', credit:'2.5', type:'必修' },
    { name:'C语言程序设计实验', credit:'1.5', type:'必修' },
    { name:'大学生心理健康与职业发展II', credit:'0.5', type:'必修' },
    { name:'大学体育I', credit:'1.0', type:'必修' },
    { name:'大学英语A I', credit:'4.0', type:'必修' },
    { name:'高等数学A I', credit:'5.0', type:'必修' },
    { name:'国家安全教育', credit:'1.0', type:'必修' },
    { name:'思想道德与法治', credit:'2.5', type:'必修' },
    { name:'形势与政策I', credit:'0.5', type:'必修' },
    { name:'中国近现代史纲要', credit:'2.5', type:'必修' },
    { name:'专业概论与新生研讨', credit:'0.5', type:'必修' },
    { name:'大学生心理健康与职业发展I', credit:'0.5', type:'实践教学' },
    { name:'军训', credit:'0.0', type:'实践教学' },
  ],
  'semester1-2': [
    { name:'大学体育II', credit:'1.0', type:'必修' },
    { name:'大学物理B', credit:'3.0', type:'必修' },
    { name:'大学物理实验B', credit:'1.0', type:'必修' },
    { name:'大学英语A II', credit:'4.0', type:'必修' },
    { name:'概率论与数理统计B', credit:'4.0', type:'必修' },
    { name:'高等数学A II', credit:'5.0', type:'必修' },
    { name:'人工智能', credit:'1.0', type:'必修' },
    { name:'线性代数', credit:'2.0', type:'必修' },
    { name:'形势与政策II', credit:'0.5', type:'必修' },
  ],
  'semester2-1': [
    { name:'大学生心理健康与职业发展III', credit:'0.5', type:'必修' },
    { name:'大学体育III', credit:'1.0', type:'必修' },
    { name:'电磁场与电磁波', credit:'3.5', type:'必修' },
    { name:'电路分析', credit:'3.0', type:'必修' },
    { name:'电路分析实验', credit:'1.0', type:'必修' },
    { name:'复变函数与积分变换', credit:'2.0', type:'必修' },
    { name:'固体物理学', credit:'3.0', type:'必修' },
    { name:'劳动教育', credit:'1.0', type:'必修' },
    { name:'模拟电子技术', credit:'3.0', type:'必修' },
    { name:'模拟电子技术实验', credit:'1.0', type:'必修' },
    { name:'形势与政策III', credit:'0.5', type:'必修' },
    { name:'MATLAB程序设计', credit:'2.0', type:'专业方向课' },
    { name:'MATLAB程序设计实验', credit:'1.0', type:'专业方向课' },
  ],
  'semester2-2': [
    { name:'半导体物理', credit:'3.0', type:'必修' },
    { name:'半导体物理实验', credit:'1.0', type:'必修' },
    { name:'大学生劳动教育（实践I）', credit:'0.5', type:'必修' },
    { name:'毛泽东思想和中国特色社会主义理论体系概论', credit:'2.5', type:'必修' },
    { name:'数字电子技术', credit:'2.5', type:'必修' },
    { name:'数字电子技术实验', credit:'1.0', type:'必修' },
    { name:'信号与系统', credit:'3.0', type:'必修' },
    { name:'信号与系统实验', credit:'1.0', type:'必修' },
    { name:'形势与政策IV', credit:'0.5', type:'必修' },
    { name:'自动控制原理', credit:'3.0', type:'必修' },
    { name:'自动控制原理实验', credit:'1.0', type:'必修' },
    { name:'半导体物理综合实践', credit:'1.0', type:'实践教学' },
    { name:'思政课社会实践', credit:'2.0', type:'实践教学' },
    { name:'信号与系统综合实践', credit:'1.0', type:'实践教学' },
    { name:'自动控制原理综合实践', credit:'1.0', type:'实践教学' },
  ],
  'semester3-1': [
    { name:'EDA技术', credit:'2.0', type:'必修' },
    { name:'EDA技术实验', credit:'1.5', type:'必修' },
    { name:'大学生劳动教育（实践II）', credit:'0.5', type:'必修' },
    { name:'大学生心理健康与职业发展IV', credit:'0.5', type:'必修' },
    { name:'激光原理与技术', credit:'2.5', type:'必修' },
    { name:'激光原理与技术实验', credit:'1.0', type:'必修' },
    { name:'马克思主义基本原理概论', credit:'2.5', type:'必修' },
    { name:'习近平新时代中国特色社会主义思想概论', credit:'3.0', type:'必修' },
    { name:'形势与政策V', credit:'0.5', type:'必修' },
    { name:'传感器技术', credit:'2.5', type:'专业方向课' },
    { name:'传感器技术实验', credit:'1.0', type:'专业方向课' },
    { name:'单片机原理与应用', credit:'2.0', type:'专业方向课' },
    { name:'单片机原理与应用实验', credit:'1.0', type:'专业方向课' },
    { name:'电子电路设计与仿真', credit:'2.5', type:'专业方向课' },
    { name:'电子电路设计与仿真实验', credit:'1.0', type:'专业方向课' },
    { name:'人工智能原理及应用', credit:'2.5', type:'专业方向课' },
    { name:'电子技术综合实践', credit:'1.0', type:'实践教学' },
    { name:'EDA技术综合实践', credit:'1.0', type:'实践教学' },
  ],
  'semester3-2': [
    { name:'半导体集成电路', credit:'3.0', type:'必修' },
    { name:'半导体集成电路实验', credit:'1.0', type:'必修' },
    { name:'固态电子器件', credit:'3.0', type:'必修' },
    { name:'光电子技术', credit:'3.0', type:'必修' },
    { name:'光电子技术实验', credit:'1.0', type:'必修' },
    { name:'形势与政策VI', credit:'0.5', type:'必修' },
    { name:'大数据处理技术', credit:'2.0', type:'专业方向课' },
    { name:'大数据处理技术实验', credit:'1.0', type:'专业方向课' },
    { name:'电力电子技术', credit:'2.0', type:'专业方向课' },
    { name:'电力电子技术实验', credit:'1.0', type:'专业方向课' },
    { name:'电气控制技术', credit:'2.0', type:'专业方向课' },
    { name:'电气控制技术实验', credit:'1.0', type:'专业方向课' },
    { name:'嵌入式系统开发与应用', credit:'2.5', type:'专业方向课' },
    { name:'嵌入式系统开发与应用实验', credit:'1.5', type:'专业方向课' },
    { name:'系统仿真技术', credit:'3.0', type:'专业方向课' },
    { name:'虚拟仪器技术', credit:'2.0', type:'专业方向课' },
    { name:'虚拟仪器技术实验', credit:'1.0', type:'专业方向课' },
    { name:'半导体器件与集成电路综合实践', credit:'1.0', type:'实践教学' },
    { name:'光电子技术综合实践', credit:'1.0', type:'实践教学' },
  ],
};

// ============================================================
// 农业机械化及其自动化 (农机) — 83门课, 170学分
// ============================================================
const nongji = {
  'semester1-1': [
    { name:'大学生心理健康与职业发展II', credit:'0.5', type:'必修', code:'1212418020' },
    { name:'大学体育I', credit:'1.0', type:'必修', code:'1215787000' },
    { name:'大学英语A I', credit:'4.0', type:'必修', code:'2210141110' },
    { name:'高等数学A I', credit:'5.0', type:'必修', code:'1215607110' },
    { name:'国家安全教育', credit:'1.0', type:'必修', code:'1217000010' },
    { name:'机械制图', credit:'3.0', type:'必修', code:'1210436000' },
    { name:'军事理论', credit:'1.0', type:'必修', code:'1217002010' },
    { name:'农学概论', credit:'2.5', type:'必修', code:'2210710001' },
    { name:'思想道德与法治', credit:'2.5', type:'必修', code:'1215841000' },
    { name:'形势与政策I', credit:'0.5', type:'必修', code:'1211227010' },
    { name:'专业概论与新生研讨（农机）', credit:'0.5', type:'必修', code:'1222111003' },
    { name:'大学生心理健康与职业发展I', credit:'0.5', type:'实践教学', code:'1212418010' },
    { name:'机械制图教学实习', credit:'1.0', type:'实践教学', code:'3210436000' },
    { name:'机械制图实验', credit:'1.0', type:'实践教学', code:'4210436000' },
    { name:'军训(军事技能)', credit:'0.0', type:'实践教学', code:'3217002010' },
  ],
  'semester1-2': [
    { name:'大学体育II', credit:'1.0', type:'必修', code:'1215788000' },
    { name:'大学英语A II', credit:'4.0', type:'必修', code:'2210141120' },
    { name:'高等数学A II', credit:'5.0', type:'必修', code:'1210267121' },
    { name:'机械制造基础', credit:'3.5', type:'必修', code:'2210438001' },
    { name:'毛泽东思想和中国特色社会主义理论体系概论', credit:'2.5', type:'必修', code:'1210657000' },
    { name:'习近平新时代中国特色社会主义思想概论', credit:'3.0', type:'必修', code:'1215844000' },
    { name:'形势与政策II', credit:'0.5', type:'必修', code:'1211227020' },
    { name:'中国近现代史纲要', credit:'2.5', type:'必修', code:'1215845000' },
    { name:'机械制造基础教学实习', credit:'1.0', type:'实践教学', code:'3219939000' },
    { name:'计算机辅助设计B', credit:'3.0', type:'专业方向课', code:'2210469201' },
  ],
  'semester2-1': [
    { name:'材料力学B', credit:'3.0', type:'必修', code:'2170043204' },
    { name:'大学生心理健康与职业发展III', credit:'0.5', type:'必修', code:'1212418030' },
    { name:'大学体育III', credit:'1.0', type:'必修', code:'1211045000' },
    { name:'大学物理C', credit:'2.0', type:'必修', code:'1215750320' },
    { name:'大学物理实验C', credit:'1.0', type:'必修', code:'4215753320' },
    { name:'电工学', credit:'2.0', type:'必修', code:'1211497000' },
    { name:'电工学实验', credit:'1.0', type:'必修', code:'4214509000' },
    { name:'概率论与数理统计B', credit:'4.0', type:'必修', code:'1210255207' },
    { name:'劳动教育', credit:'1.0', type:'必修', code:'1215857000' },
    { name:'理论力学', credit:'3.0', type:'必修', code:'2210613001' },
    { name:'形势与政策III', credit:'0.5', type:'必修', code:'1211217030' },
    { name:'C语言程序设计', credit:'2.5', type:'专业方向课', code:'1210004000' },
    { name:'C语言程序设计实验', credit:'1.5', type:'专业方向课', code:'4210004000' },
  ],
  'semester2-2': [
    { name:'复变函数与积分变换', credit:'2.0', type:'必修', code:'1210254001' },
    { name:'大学生劳动教育（实践I）', credit:'0.5', type:'必修', code:'4215858000' },
    { name:'机械原理', credit:'3.0', type:'必修', code:'2210434001' },
    { name:'控制工程基础', credit:'3.0', type:'必修', code:'2210597000' },
    { name:'马克思主义基本原理概论', credit:'2.5', type:'必修', code:'1210656000' },
    { name:'人工智能', credit:'1.0', type:'必修', code:'1217001000' },
    { name:'线性代数', credit:'2.0', type:'必修', code:'1215104001' },
    { name:'形势与政策IV', credit:'0.5', type:'必修', code:'1211217040' },
    { name:'思政课社会实践', credit:'2.0', type:'实践教学', code:'3218038002' },
    { name:'单片机原理与应用', credit:'2.0', type:'专业方向课', code:'1215949001' },
    { name:'单片机原理与应用实验', credit:'1.0', type:'专业方向课', code:'4215949000' },
    { name:'单片机原理与应用综合实践', credit:'1.0', type:'专业方向课', code:'3215949000' },
    { name:'机械工程材料', credit:'3.0', type:'专业方向课', code:'2219917000' },
    { name:'机械工程三维建模与仿真', credit:'3.0', type:'专业方向课', code:'2210431000' },
  ],
  'semester3-1': [
    { name:'大学生劳动教育（实践II）', credit:'0.5', type:'必修', code:'4215859000' },
    { name:'大学生心理健康与职业发展IV', credit:'0.5', type:'必修', code:'1212418040' },
    { name:'工程测试技术', credit:'3.0', type:'必修', code:'2210283001' },
    { name:'互换性与测量技术', credit:'2.0', type:'必修', code:'2210376001' },
    { name:'机械设计', credit:'4.0', type:'必修', code:'2210432001' },
    { name:'汽车拖拉机学', credit:'3.5', type:'必修', code:'2210770001' },
    { name:'形势与政策V', credit:'0.5', type:'必修', code:'1211227050' },
    { name:'机械设计教学实习', credit:'1.0', type:'实践教学', code:'3219945000' },
    { name:'汽车与拖拉机学教学实习', credit:'1.0', type:'实践教学', code:'3219941000' },
    { name:'电子电路设计与仿真', credit:'2.5', type:'专业方向课', code:'1210184001' },
    { name:'电子电路设计与仿真实验', credit:'1.0', type:'专业方向课', code:'4214411000' },
    { name:'现代机械设计方法', credit:'3.0', type:'专业方向课', code:'2211170000' },
  ],
  'semester3-2': [
    { name:'机械电子学', credit:'3.0', type:'必修', code:'2210430000' },
    { name:'机械制造工艺学', credit:'3.0', type:'必修', code:'2210437001' },
    { name:'形势与政策VI', credit:'0.5', type:'必修', code:'1211227060' },
    { name:'机械制造工艺学教学实习', credit:'1.0', type:'实践教学', code:'3219942000' },
    { name:'农业机械学', credit:'3.5', type:'必修', code:'2210720001' },
    { name:'农业机械学教学实习', credit:'1.0', type:'实践教学', code:'3219944000' },
    { name:'农产品加工机械', credit:'3.0', type:'专业方向课', code:'2219949000' },
    { name:'汽车拖拉机理论', credit:'3.0', type:'专业方向课', code:'2210769001' },
    { name:'人工智能原理及应用', credit:'2.5', type:'专业方向课', code:'2216406000' },
  ],
};

// ============================================================
// 电气工程及其自动化
// ============================================================
const dianqi = {
  'semester1-1': [
    { name:'C语言程序设计', credit:'2.5', type:'必修' },
    { name:'C语言程序设计实验', credit:'1.5', type:'必修' },
    { name:'大学生心理健康与职业发展II', credit:'0.5', type:'必修' },
    { name:'大学体育I', credit:'1.0', type:'必修' },
    { name:'大学英语A I', credit:'4.0', type:'必修' },
    { name:'高等数学A I', credit:'5.0', type:'必修' },
    { name:'国家安全教育', credit:'1.0', type:'必修' },
    { name:'思想道德与法治', credit:'2.5', type:'必修' },
    { name:'形势与政策I', credit:'0.5', type:'必修' },
    { name:'中国近现代史纲要', credit:'2.5', type:'必修' },
    { name:'专业概论与新生研讨', credit:'0.5', type:'必修' },
    { name:'大学生心理健康与职业发展I', credit:'0.5', type:'实践教学' },
    { name:'军训', credit:'0.0', type:'实践教学' },
  ],
  'semester1-2': [
    { name:'大学体育II', credit:'1.0', type:'必修' },
    { name:'大学物理B', credit:'3.0', type:'必修' },
    { name:'大学物理实验B', credit:'1.0', type:'必修' },
    { name:'大学英语A II', credit:'4.0', type:'必修' },
    { name:'概率论与数理统计B', credit:'4.0', type:'必修' },
    { name:'高等数学A II', credit:'5.0', type:'必修' },
    { name:'人工智能', credit:'1.0', type:'必修' },
    { name:'线性代数', credit:'2.0', type:'必修' },
    { name:'形势与政策II', credit:'0.5', type:'必修' },
    { name:'MATLAB程序设计', credit:'2.0', type:'专业方向课' },
    { name:'MATLAB程序设计实验', credit:'1.0', type:'专业方向课' },
  ],
  'semester2-1': [
    { name:'大学生心理健康与职业发展III', credit:'0.5', type:'必修' },
    { name:'大学体育III', credit:'1.0', type:'必修' },
    { name:'电路分析', credit:'3.0', type:'必修' },
    { name:'电路分析实验', credit:'1.0', type:'必修' },
    { name:'复变函数与积分变换', credit:'2.0', type:'必修' },
    { name:'工程电磁学', credit:'2.5', type:'必修' },
    { name:'劳动教育', credit:'1.0', type:'必修' },
    { name:'离散数学', credit:'3.5', type:'必修' },
    { name:'毛概', credit:'2.5', type:'必修' },
    { name:'模拟电子技术', credit:'3.0', type:'必修' },
    { name:'模拟电子技术实验', credit:'1.0', type:'必修' },
    { name:'习近平新时代中国特色社会主义思想概论', credit:'3.0', type:'必修' },
  ],
};

// Utility functions
function slug(name) {
  const map = {
    'C语言程序设计':'c-language','C语言程序设计实验':'c-language-lab',
    '大学英语A I':'english-a1','大学英语A II':'english-a2',
    '高等数学A I':'math-a1','高等数学A II':'math-a2',
    '高等数学AⅠ':'math-a1','高等数学AⅡ':'math-a2',
    '大学物理B':'physics-b','大学物理实验B':'physics-b-lab',
    '大学物理C':'physics-c','大学物理实验C':'physics-c-lab',
    '概率论与数理统计B':'prob-stat',
    '线性代数':'linear-algebra','人工智能':'ai-intro',
    '电路分析':'circuit-analysis','电路分析实验':'circuit-analysis-lab',
    '模拟电子技术':'analog-electronics','模拟电子技术实验':'analog-electronics-lab',
    '数字电子技术':'digital-electronics','数字电子技术实验':'digital-electronics-lab',
    '信号与系统':'signals-systems','信号与系统实验':'signals-systems-lab',
    '信号与系统综合实践':'signals-systems-practice',
    '电磁场与电磁波':'em-field-wave',
    '复变函数与积分变换':'complex-analysis',
    '固体物理学':'solid-state-physics',
    '半导体物理':'semiconductor-physics','半导体物理实验':'semiconductor-physics-lab',
    '半导体物理综合实践':'semiconductor-physics-practice',
    '自动控制原理':'auto-control','自动控制原理实验':'auto-control-lab',
    '自动控制原理综合实践':'auto-control-practice',
    '毛概':'mao-zedong-thought',
    '毛泽东思想和中国特色社会主义理论体系概论':'mao-zedong-thought',
    '思政课社会实践':'political-practice',
    'EDA技术':'eda-tech','EDA技术实验':'eda-tech-lab','EDA技术综合实践':'eda-tech-practice',
    '激光原理与技术':'laser-principle','激光原理与技术实验':'laser-principle-lab',
    '传感器技术':'sensor-tech','传感器技术实验':'sensor-tech-lab',
    '单片机原理与应用':'mcu-principle','单片机原理与应用实验':'mcu-principle-lab',
    '单片机原理与应用综合实践':'mcu-practice',
    '电子电路设计与仿真':'circuit-design-sim','电子电路设计与仿真实验':'circuit-design-sim-lab',
    '电子技术综合实践':'electronics-practice',
    '人工智能原理及应用':'ai-applications',
    '半导体集成电路':'semiconductor-ic','半导体集成电路实验':'semiconductor-ic-lab',
    '固态电子器件':'solid-state-devices',
    '光电子技术':'optoelectronics','光电子技术实验':'optoelectronics-lab',
    '光电子技术综合实践':'optoelectronics-practice',
    '大数据处理技术':'big-data','大数据处理技术实验':'big-data-lab',
    '电力电子技术':'power-electronics','电力电子技术实验':'power-electronics-lab',
    '电气控制技术':'electrical-control','电气控制技术实验':'electrical-control-lab',
    '嵌入式系统开发与应用':'embedded-systems','嵌入式系统开发与应用实验':'embedded-systems-lab',
    '系统仿真技术':'system-simulation',
    '虚拟仪器技术':'virtual-instrument','虚拟仪器技术实验':'virtual-instrument-lab',
    '半导体器件与集成电路综合实践':'semiconductor-practice',
    '机械制图':'mechanical-drawing','机械制图教学实习':'mech-drawing-practice','机械制图实验':'mech-drawing-lab',
    '机械制造基础':'manufacturing-basics','机械制造基础教学实习':'manufacturing-practice',
    '机械制造基础实验':'manufacturing-lab',
    '电工学':'electrical-engineering','电工学实验':'electrical-engineering-lab',
    '计算机辅助设计B':'cad-b',
    '材料力学B':'material-mechanics','理论力学':'theoretical-mechanics',
    '机械原理':'mechanical-principle','机械设计':'mechanical-design','机械设计教学实习':'mech-design-practice',
    '控制工程基础':'control-engineering','工程测试技术':'engineering-testing',
    '互换性与测量技术':'interchangeability','汽车拖拉机学':'auto-tractor',
    '汽车与拖拉机学教学实习':'auto-tractor-practice','汽车拖拉机理论':'auto-tractor-theory',
    '机械制造工艺学':'manufacturing-process','机械制造工艺学教学实习':'manufacturing-process-practice',
    '农业机械学':'agricultural-machinery','农业机械学教学实习':'agricultural-machinery-practice',
    '农产品加工机械':'agri-processing-machinery',
    '机械电子学':'mechatronics','机械工程材料':'mechanical-materials',
    '机械工程三维建模与仿真':'3d-modeling-sim',
    '现代机械设计方法':'modern-mech-design',
    '工程电磁学':'engineering-electromagnetics','离散数学':'discrete-math',
    '电机学':'electrical-machines','电机学实验':'electrical-machines-lab',
    '电力系统分析':'power-system-analysis','电力系统分析实验':'power-system-analysis-lab',
    '电气测量技术':'electrical-measurement','电气测量技术实验':'electrical-measurement-lab',
  };
  if (map[name]) return map[name];
  return name.replace(/[（）()\s]/g,'-').replace(/[^\w\u4e00-\u9fff-]/g,'').toLowerCase().slice(0,40);
}

function typeClass(type) {
  if (type.includes('实践')) return 'badge-elective';
  if (type.includes('方向')) return 'badge-core';
  if (type.includes('必修') || type.includes('专业必修')) return 'badge-required';
  return 'badge-common';
}

function typeEmoji(type) {
  if (type.includes('实践')) return '🔧';
  if (type.includes('方向')) return '📐';
  if (type.includes('必修')) return '📖';
  return '📘';
}

function semesterLabel(key) {
  const map = {
    'semester1-1':'大一上学期','semester1-2':'大一下学期',
    'semester2-1':'大二上学期','semester2-2':'大二下学期',
    'semester3-1':'大三上学期','semester3-2':'大三下学期',
  };
  return map[key] || key;
}

function semesterColor(key) {
  const map = {
    'semester1-1':'#eff6ff;color:#2563eb',
    'semester1-2':'#f0fdf4;color:#16a34a',
    'semester2-1':'#fef2f2;color:#dc2626',
    'semester2-2':'#faf5ff;color:#7c3aed',
    'semester3-1':'#fffbeb;color:#d97706',
    'semester3-2':'#fdf2f8;color:#db2777',
  };
  return map[key] || '#eff6ff;color:#2563eb';
}

function genSemester(majorDir, key, courses, majorName) {
  const s = semesterLabel(key);
  const sc = semesterColor(key);
  let md = `# ${s} · 课程列表\n\n`;
  md += `> ${majorName} · ${s}\n\n`;
  md += `<span class="semester-badge" style="background:${sc}">${s}</span>\n\n`;
  if (courses.length === 0) {
    md += `> 🚧 课程清单待完善\n`;
    fs.writeFileSync(path.join(majorDir, `${key}.md`), md);
    return [];
  }
  md += `| 序号 | 课程名称 | 学分 | 课程性质 |\n`;
  md += `|------|----------|------|----------|\n`;
  courses.forEach((c, i) => {
    const s = slug(c.name);
    const tc = typeClass(c.type);
    md += `| ${i+1} | [${c.name}](/majors/${path.basename(majorDir)}/courses/${s}) | ${c.credit} | <span class="${tc} semester-badge">${c.type}</span> |\n`;
  });
  fs.writeFileSync(path.join(majorDir, `${key}.md`), md);
  return courses;
}

function genCourse(majorDir, course, key) {
  const s = slug(course.name);
  const sl = semesterLabel(key);
  const sc = semesterColor(key);
  const tc = typeClass(course.type);
  const code = course.code || '';

  let md = `# ${course.name}\n\n`;
  md += `<span class="semester-badge" style="background:${sc}">${sl}</span>\n`;
  md += `<span class="${tc} semester-badge">${course.type}</span>\n`;
  md += `<span>**${course.credit} 学分**</span>\n`;
  if (code) md += `\n> 课程编号：${code}\n`;

  md += `\n---\n\n`;
  md += `## ① 课程介绍\n\n`;
  md += `| 项目 | 内容 |\n|------|------|\n`;
  md += `| **课程名称** | ${course.name} |\n`;
  if (code) md += `| **课程编号** | ${code} |\n`;
  md += `| **学分** | ${course.credit} |\n`;
  md += `| **开设学期** | ${sl} |\n`;
  md += `| **课程性质** | ${course.type} |\n\n`;
  md += `> 📦 该课程资料正在整理中，敬请期待！\n\n`;

  md += `## ② 课程资料\n\n> 📄 课件、讲义、实验指导等资料正在收集中。如果你有相关资料，欢迎联系管理员投稿！\n\n`;
  md += `## ③ 练习题\n\n> ✏️ 章节习题、历年真题和解析正在整理中。\n\n`;
  md += `## ④ 推荐资源\n\n### 🎬 老师推荐自学网课\n> 🚧 待专业课老师推荐后补充。\n\n### 📚 推荐教辅书\n> 🚧 待专业课老师推荐后补充。\n\n`;

  md += `## ⑤ 优秀学长「ta 说」\n\n`;
  md += `<div class="ta-card" style="text-align:center;padding:32px;">\n`;
  md += `  <p style="font-size:1.2rem;margin-bottom:8px;">🔎 「ta 说」栏目招募中</p>\n`;
  md += `  <p>如果你是学过《${course.name}》并且取得了不错成绩的同学，欢迎联系管理员分享你的学习经验。</p>\n`;
  md += `  <p style="margin-top:12px;">联系方式：<a href="mailto:2286318767@qq.com">2286318767@qq.com</a></p>\n`;
  md += `</div>\n\n`;
  md += `> 🔄 本页内容同步自腾讯文档编辑后台\n> 📩 想要分享你的学习经验？联系管理员。\n`;

  fs.writeFileSync(path.join(majorDir, 'courses', `${s}.md`), md);
}

// ============================================================
// MAIN
// ============================================================

function processMajor(name, data) {
  const majorDir = path.join(base, name);
  if (!fs.existsSync(majorDir)) fs.mkdirSync(majorDir, { recursive: true });
  if (!fs.existsSync(path.join(majorDir, 'courses'))) fs.mkdirSync(path.join(majorDir, 'courses'));

  // Generate semester pages and collect all courses
  let totalCourses = 0;
  for (const [key, courses] of Object.entries(data)) {
    genSemester(majorDir, key, courses, name === 'dianzikexue' ? '电子科学与技术' : name === 'nongyejixiehua' ? '农业机械化及其自动化' : '电气工程及其自动化');
    for (const c of courses) {
      genCourse(majorDir, c, key);
      totalCourses++;
    }
  }
  
  // Generate major index page
  const majorNames = {
    'dianzikexue': '电子科学与技术', 'nongyejixiehua': '农业机械化及其自动化', 'dianqigongcheng': '电气工程及其自动化'
  };
  const mn = majorNames[name] || name;
  const allKeys = ['semester1-1','semester1-2','semester2-1','semester2-2','semester3-1','semester3-2'];
  
  let idx = `# ${mn}\n\n`;
  idx += `> ${mn}专业培养方案 · ${totalCourses} 门课程\n\n`;
  idx += `---\n\n`;
  idx += `## 📖 按学期浏览\n\n`;
  
  for (const key of allKeys) {
    if (!data[key]) continue;
    const sl = semesterLabel(key);
    const sc = semesterColor(key);
    idx += `### [${sl}](/majors/${name}/${key})\n\n`;
    idx += `<span class="semester-badge" style="background:${sc}">${sl}</span>\n\n`;
    idx += `| 序号 | 课程名称 | 学分 | 性质 |\n`;
    idx += `|------|----------|------|------|\n`;
    for (const [i, c] of data[key].entries()) {
      const s = slug(c.name);
      idx += `| ${i+1} | [${c.name}](/majors/${name}/courses/${s}) | ${c.credit} | <span class="${typeClass(c.type)} semester-badge">${c.type}</span> |\n`;
    }
    idx += `\n`;
  }
  
  idx += `---\n\n`;
  idx += `## 📂 或按类别浏览\n\n`;
  idx += `- 🏛️ **公共必修课** — 全校统一课程\n`;
  idx += `- 📐 **学科基础课** — 专业相关基础课程\n`;
  idx += `- ⚙️ **专业必修课** — 专业核心能力课程\n`;
  idx += `- 🧪 **专业方向课** — 按兴趣方向选择\n`;
  idx += `- 🔧 **实践教学** — 实验/实习/课程设计\n`;
  
  fs.writeFileSync(path.join(majorDir, 'index.md'), idx);
  console.log(`✅ ${mn}: ${totalCourses}门课`);
}

processMajor('dianzikexue', dianzikexue);
processMajor('nongyejixiehua', nongji);
processMajor('dianqigongcheng', dianqi);
console.log('\n🎉 完成');
