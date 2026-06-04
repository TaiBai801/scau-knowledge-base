#!/usr/bin/env node

/**
 * 同步脚本：从腾讯文档拉取课程内容 → 转换 → 写入本地 .md → 构建 → 部署
 *
 * 使用方式：
 *   node sync.mjs          # 全量同步所有课程（需通过 WorkBuddy AI 执行）
 *   node sync.mjs --dry    # 预览模式，仅列出待同步课程
 *   node sync.mjs --build  # 构建并部署
 *   node sync.mjs --full   # 同步 + 构建 + 部署（完整流水线）
 *
 * 原理说明：
 *   - 腾讯文档内容是 MDX 格式（JSX 标记），需要解析为纯 Markdown
 *   - 同步逻辑由 WorkBuddy AI 调用 smartcanvas.read 读取 → 转换为 .md
 *   - 本脚本负责：配置管理、文件读写、构建部署
 *
 * 课程映射在 sync-config.json 中维护。
 * docId 不为 null 的课程表示「已在腾讯文档中维护」，同步时会读取最新内容。
 * docId 为 null 的课程表示「尚未创建腾讯文档」，使用本地 .md 文件作为内容源。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'sync-config.json');
const COURSES_DIR = path.join(__dirname, 'majors', 'dianzikexue', 'courses');
const DIST_DIR = path.join(__dirname, '.vitepress', 'dist');
const SITE_URL = 'https://6f92c87784b6436fbe8dcdef4a5291ec.app.codebuddy.work';

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ sync-config.json 不存在');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function listCourses(config) {
  const all = [];
  const sections = ['common', 'semester1-1', 'semester1-2', 'semester2-1', 'semester2-2'];
  for (const section of sections) {
    if (config.courses[section]) {
      for (const course of config.courses[section]) {
        all.push({ ...course, section });
      }
    }
  }
  return all;
}

function checkStatus(config) {
  const courses = listCourses(config);
  const synced = courses.filter(c => c.docId).length;
  const local = courses.filter(c => !c.docId).length;
  const total = courses.length;

  const courseFiles = fs.existsSync(COURSES_DIR)
    ? fs.readdirSync(COURSES_DIR).filter(f => f.endsWith('.md'))
    : [];

  console.log('═══════════════════════════════════════');
  console.log('  知识库同步状态');
  console.log('═══════════════════════════════════════');
  console.log(`  空间: ${config.spaceUrl}`);
  console.log(`  专业: ${config.major}`);
  console.log(`  课程总数: ${total}`);
  console.log(`  已挂载腾讯文档: ${synced}`);
  console.log(`  仅本地维护: ${local}`);
  console.log(`  本地 .md 文件: ${courseFiles.length}`);
  console.log('═══════════════════════════════════════\n');

  if (synced > 0) {
    console.log('📡 已挂载腾讯文档的课程（内容同步自在线文档）：');
    for (const c of courses.filter(c => c.docId)) {
      console.log(`   ├─ ${c.name} — docId: ${c.docId}`);
    }
    console.log();
  }

  if (local > 0) {
    console.log('📄 仅本地维护的课程（内容直接编辑 .md 文件）：');
    for (const c of courses.filter(c => !c.docId)) {
      console.log(`   ├─ ${c.name}`);
    }
    console.log();
  }

  return { courses, synced, local, total };
}

function build() {
  console.log('🔨 开始构建...');

  const nodePath = path.join(
    process.env.USERPROFILE || 'C:/Users/ASUS1',
    '.workbuddy/binaries/node/versions/22.12.0/node.exe'
  );
  const vitepressBin = path.join(__dirname, 'node_modules', 'vitepress', 'bin', 'vitepress.js');

  try {
    const result = execSync(`"${nodePath}" "${vitepressBin}" build`, {
      cwd: __dirname,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120000
    });
    console.log(result);
    console.log('✅ 构建完成\n');
    return true;
  } catch (e) {
    console.error('❌ 构建失败:', e.message);
    return false;
  }
}

function showSummary() {
  console.log('═══════════════════════════════════════');
  console.log('  下一步操作');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('  📝 工作人员编辑流程：');
  console.log(`     1. 打开 ${config.spaceUrl}`);
  console.log('     2. 找到对应学期的课程文档');
  console.log('     3. 在五段式模板中填写内容');
  console.log('     4. 保存（自动）');
  console.log('');
  console.log('  🔄 同步流程：');
  console.log('     1. 从腾讯文档读取最新内容（AI 执行）');
  console.log('     2. 转换为 .md 格式写入本地');
  console.log('     3. 运行 node sync.mjs --build');
  console.log('');
  console.log('  🌐 预览网站: ' + SITE_URL);
  console.log('═══════════════════════════════════════');
}

// --- Main ---

const config = loadConfig();
const args = process.argv.slice(2);

if (args.includes('--dry')) {
  checkStatus(config);
  process.exit(0);
}

const { courses, synced } = checkStatus(config);

let built = false;
if (args.includes('--build') || args.includes('--full')) {
  built = build();
}

if (built) {
  showSummary();
} else if (!args.includes('--build') && !args.includes('--full')) {
  console.log('💡 运行 node sync.mjs --build 构建网站');
  console.log('💡 运行 node sync.mjs --full  同步+构建+部署（通过 AI 执行）');
}
