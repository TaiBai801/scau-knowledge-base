const fs = require('fs');
const path = require('path');

// Parse the curriculum data from the raw text
const raw = fs.readFileSync('curriculum_raw.txt', 'utf-8');

// Extract courses for each major
function extractDocCourses(startPattern, endPattern, text) {
  const start = text.indexOf(startPattern);
  const end = endPattern ? text.indexOf(endPattern, start) : text.length;
  const section = text.slice(start, end > 0 ? end : text.length);
  
  const courses = [];
  const lines = section.split('\n');
  for (const line of lines) {
    // Match: course name followed by credits and course type
    const match = line.match(/^(.+?)[：:]\s*([\d.]+)\s*学分[,，]\s*课程编号.*?(必修|专业方向课|实践教学)/);
    if (match) {
      courses.push({
        name: match[1].trim(),
        credits: match[2],
        type: match[3],
      });
    }
  }
  return courses;
}

// Get existing courses from semester pages
function getExistingCourses(semesterDir) {
  const courses = [];
  const files = fs.readdirSync(semesterDir).filter(f => f.startsWith('semester'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(semesterDir, file), 'utf-8');
    const matches = content.matchAll(/\[([^\]]+)\]\((\/majors\/[^)]+)\)/g);
    for (const m of matches) {
      courses.push({ name: m[1], link: m[2], file });
    }
  }
  return courses;
}

// Normalize course name for comparison
function normalize(name) {
  return name
    .replace(/[（(][^)）]*[)）]/g, '') // Remove parenthetical notes
    .replace(/[A-EⅠⅡⅢⅣⅤⅥⅦ]/g, '') // Remove Roman numerals
    .replace(/\s+/g, '')
    .toLowerCase();
}

// ==== 电气 comparison ====
console.log("=== 电气工程及其自动化 ===\n");
const elecDocCourses = extractDocCourses('电气工程及自动化的理论教学计划', '以下是四川农业大学（根据网址jiaowu.sicau.edu.cn判断）农业工程专业', raw);
console.log(`文档中共 ${elecDocCourses.length} 门课`);

const elecExisting = getExistingCourses('majors/dianqigongcheng');
console.log(`学期页中共 ${elecExisting.length} 条课程链接`);

const elecDocNames = new Set(elecDocCourses.map(c => normalize(c.name)));
const elecExistingNames = new Set(elecExisting.map(c => normalize(c.name)));

console.log("\n文档有但学期页没有的课程:");
for (const c of elecDocCourses) {
  if (!elecExistingNames.has(normalize(c.name))) {
    console.log(`  ✗ ${c.name} (${c.credits}学分, ${c.type})`);
  }
}

console.log("\n学期页有但文档没有的课程:");
for (const c of elecExisting) {
  if (!elecDocNames.has(normalize(c.name))) {
    console.log(`  ? ${c.name} (${c.link})`);
  }
}

// ==== 农业工程 comparison ====
console.log("\n\n=== 农业工程 ===\n");
const agriDocCourses = extractDocCourses('以下是四川农业大学（根据网址jiaowu.sicau.edu.cn判断）农业工程专业', '说明', raw);
console.log(`文档中共 ${agriDocCourses.length} 门课`);

const agriExisting = getExistingCourses('majors/nongyegongcheng');
console.log(`学期页中共 ${agriExisting.length} 条课程链接`);

const agriDocNames = new Set(agriDocCourses.map(c => normalize(c.name)));
const agriExistingNames = new Set(agriExisting.map(c => normalize(c.name)));

console.log("\n文档有但学期页没有的课程:");
for (const c of agriDocCourses) {
  if (!agriExistingNames.has(normalize(c.name))) {
    console.log(`  ✗ ${c.name} (${c.credits}学分, ${c.type})`);
  }
}

// ==== 农机 comparison ====
console.log("\n\n=== 农业机械化及其自动化 ===\n");
const nongjiSection = raw.indexOf('完整的农机专业的理论教学计划');
const nongjiEnd = raw.indexOf('电气工程及自动化的理论教学计划');
const nongjiText = raw.slice(nongjiSection, nongjiEnd);

// Parse 农机 courses from the table format
const nongjiDocCourses = [];
const nongjiLines = nongjiText.split('\n');
for (const line of nongjiLines) {
  // Table format: number | course name | credits | course number | type | semester
  const match = line.match(/^\d+\s+(.+?)\s+([\d.]+)\s+\d{10,}\s+(必修|专业方向课|实践教学)/);
  if (match) {
    nongjiDocCourses.push({
      name: match[1].trim(),
      credits: match[2],
      type: match[3],
    });
  }
}

console.log(`文档中共 ${nongjiDocCourses.length} 门课`);
const nongjiExisting = getExistingCourses('majors/nongyejixiehua');
console.log(`学期页中共 ${nongjiExisting.length} 条课程链接`);

const nongjiDocNames = new Set(nongjiDocCourses.map(c => normalize(c.name)));
const nongjiExistingNames = new Set(nongjiExisting.map(c => normalize(c.name)));

console.log("\n文档有但学期页没有的课程:");
for (const c of nongjiDocCourses) {
  if (!nongjiExistingNames.has(normalize(c.name))) {
    console.log(`  ✗ ${c.name} (${c.credits}学分, ${c.type})`);
  }
}

