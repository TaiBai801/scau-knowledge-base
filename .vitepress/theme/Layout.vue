<script setup>
import DefaultTheme from 'vitepress/theme'
import CustomFooter from './CustomFooter.vue'
import BackToTop from './BackToTop.vue'
import SharedCourses from './SharedCourses.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <a class="skip-to-content" href="#main-content">跳到主要内容</a>
  <Layout>
    <template #layout-bottom>
      <CustomFooter />
    </template>
    <template #layout-top>
      <BackToTop />
    </template>
    <template #layout-404>
      <SharedCourses v-if="$frontmatter.pageClass === 'shared-courses-page'" />
    </template>
  </Layout>
</template>
