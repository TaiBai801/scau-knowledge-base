<script setup>
import { ref } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  credits: { type: String, default: '-' },
  semester: { type: String, default: '大一上学期' },
  nature: { type: String, default: '必修' },
})

const files = ref([])

function handleFiles(e) {
  const list = e.target.files
  if (!list) return
  for (const f of list) {
    files.value.push({ name: f.name, size: f.size })
  }
}

function removeFile(i) {
  files.value.splice(i, 1)
}

const semStyle = {
  '大一上学期': 'background:#eff6ff;color:#2563eb',
  '大一下学期': 'background:#eff6ff;color:#2563eb',
  '大二上学期': 'background:#f0fdf4;color:#059669',
  '大二下学期': 'background:#f0fdf4;color:#059669',
  '大三上学期': 'background:#fffbeb;color:#D97706',
  '大三下学期': 'background:#fffbeb;color:#D97706',
  '大四上学期': 'background:#fef2f2;color:#dc2626',
  '大四下学期': 'background:#fef2f2;color:#dc2626',
}[props.semester] || 'background:#f1f5f9;color:#64748b'

const natClass = props.nature === '必修' ? 'ardot-badge-bixiu' : 'ardot-badge-fangxiang'
</script>

<template>
  <div class="ardot-course-detail">
    <a href="javascript:history.back()" class="ardot-back">← 返回</a>
    <h1 class="ardot-cd-title">{{ name }}</h1>
    <div class="ardot-cd-meta">
      <span class="ardot-cd-badge" :style="semStyle">{{ semester }}</span>
      <span class="ardot-cd-badge" :class="natClass">{{ nature }}</span>
      <span class="ardot-cd-credits">**{{ credits }} 学分**</span>
    </div>

    <section class="ardot-cd-section">
      <h2>① 课程介绍</h2>
      <div class="ardot-cd-table">
        <div class="ardot-cd-tr"><div>课程名称</div><div>{{ name }}</div></div>
        <div class="ardot-cd-tr"><div>学分</div><div>{{ credits }}</div></div>
        <div class="ardot-cd-tr"><div>开设学期</div><div>{{ semester }}</div></div>
        <div class="ardot-cd-tr"><div>课程性质</div><div>{{ nature }}</div></div>
      </div>
    </section>

    <section class="ardot-cd-section">
      <h2>② 课程资料</h2>
      <div class="ardot-cd-files" v-if="files.length">
        <div v-for="(f, i) in files" :key="f.name" class="ardot-cd-file">
          <span>📎 {{ f.name }}</span>
          <span class="ardot-cd-file-size">{{ (f.size/1024).toFixed(1) }} KB</span>
          <button @click="removeFile(i)">✕</button>
        </div>
      </div>
      <div class="ardot-cd-upload">
        <input type="file" multiple @change="handleFiles" id="cd-upload-input" />
        <label for="cd-upload-input" class="ardot-cd-upload-btn">📤 上传资料（PDF/DOC/PPT）</label>
      </div>
    </section>

    <section class="ardot-cd-section">
      <h2>③ 练习题</h2>
      <p class="ardot-cd-empty">✏️ 整理中。</p>
    </section>

    <section class="ardot-cd-section">
      <h2>④ 推荐资源</h2>
      <p class="ardot-cd-empty">🚧 待老师推荐。</p>
    </section>

    <section class="ardot-cd-section">
      <h2>⑤ 优秀学长「ta 说」</h2>
      <div class="ardot-cd-tashuo">
        <p>🔎 招募中</p>
        <p>如果你是学过《{{ name }}》且成绩不错的同学，欢迎联系管理员。</p>
        <p>邮箱：<a href="mailto:2286318767@qq.com">2286318767@qq.com</a></p>
      </div>
    </section>

    <div class="ardot-cd-footer">
      <p>📩 联系管理员参与共建</p>
      <p>🔄 内容同步自 <a href="https://docs.qq.com/space/DZXBYSkhnRXRwSWpv">腾讯文档</a></p>
    </div>
  </div>
</template>
