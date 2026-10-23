<script setup>
import { computed } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import CustomFooter from './CustomFooter.vue'
import BackToTop from './BackToTop.vue'
import SharedCourses from './SharedCourses.vue'
import FocusTimer from './components/FocusTimer.vue'
import MobileTabBar from './components/MobileTabBar.vue'

const { Layout } = DefaultTheme
const route = useRoute()
// 专注页本身有内联计时器，不再重复挂悬浮球
const showFloatingFocus = computed(() => !/^\/focus(\.html)?$/.test(route.path || ''))
</script>

<template>
  <a class="skip-to-content" href="#main-content">跳到主要内容</a>
  <Layout>
    <template #layout-bottom>
      <CustomFooter />
      <MobileTabBar />
    </template>
    <template #layout-top>
      <BackToTop />
      <FocusTimer v-if="showFloatingFocus" variant="floating" />
    </template>
    <template #layout-404>
      <SharedCourses v-if="$frontmatter.pageClass === 'shared-courses-page'" />
    </template>
  </Layout>
</template>
