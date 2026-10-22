<script setup>
// 统一页面 Hero（P2 模板层）——取代手写 ardot-page-hero 结构
// 渲染与全局 style.css 中 .ardot-page-hero 完全相同的类，视觉零变化
defineProps({
  tag: { type: String, default: '' },
  title: { type: String, required: true },
  sub: { type: String, default: '' },
  center: Boolean,
})
</script>

<template>
  <div class="ardot-page-hero" :class="{ 'ar-hero--center': center }">
    <div class="ardot-page-inner">
      <span v-if="tag" class="ardot-tag">{{ tag }}</span>
      <h1>{{ title }}</h1>
      <p v-if="sub">{{ sub }}</p>
      <div v-if="$slots.default" class="ar-hero-actions">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ar-hero--center { text-align: center; }
.ar-hero-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.ar-hero--center .ar-hero-actions { justify-content: center; }
</style>
