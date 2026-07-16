# 机电学院知识库项目记忆

## 技术栈
- VitePress v1.6.4 静态站点
- 自定义 Vue 组件：Layout.vue, CustomFooter.vue, BackToTop.vue
- Ardot 设计系统：品牌色 #0D5C5A，底色 #F7F5F0，字体 Crimson Pro / PingFang SC

## 关键 VitePress 结构发现
- 首页 (`layout: home`) 的 VPContent 自动加 `.is-home` 类（源码在 VPContent.vue）
- Layout div **不会**加 `.home` 类，选择器要用 `.VPContent.is-home` 而非 `.Layout.home`
- VPContent 同时会加 `.has-sidebar` 类（有侧边栏的页面）
- VitePress 默认断点：960px 切换侧边栏显示/隐藏

## 响应式布局策略
- **<768px**：移动端，汉堡菜单 `display: flex !important`
- **768-959px**：侧边栏强制可见（fixed），隐藏汉堡菜单和 VPLocalNav
- **≥960px**：完全交由 VitePress 原生布局处理，仅控制宽度
- 首页用 `.VPContent:not(.is-home)` 排除侧边栏相关样式

## 已完成的 UI 重建
- Ardot 设计系统全站重建（颜色/字体/圆角/阴影）
- 院徽 emblem.png 全面替换（logo/favicon/Hero/Feature图标）
- 13项 UI 优化 + 14项前端优化（无障碍/性能/响应式/代码质量）
- 85个课程页 onclick → back-link 批量替换
- TOC 不遮挡 Footer 修复（z-index + padding-bottom）

## VitePress 自定义样式关键规则
- **Vue Scoped 覆盖问题**：VitePress 导航栏/侧边栏组件用 `<style scoped>`，全局 CSS 裸写类名（特异性 0,1,0）会被 scoped 选择器 `.class[data-v-xxx]`（特异性 0,2,0）覆盖
- **解法**：用父选择器提特异性（如 `.VPNavBar .VPNavBarMenuLink`→0,2,0）+ 全属性 `!important`
- **宽屏断点（≥960px）**：VitePress 会重构导航栏结构——`.title` 变绝对定位、`.content-body` 独立背景色、`.VPNavBar` 自身变透明
- **宽屏导航栏统一**：`@media (min-width: 960px)` 强制 `.VPNavBar .title` 和 `.VPNavBar .content-body` 设 `background: transparent !important` 继承父背景
- **"课程总览"下拉组**用的是 `VPFlyout` 组件（非 `VPNavBarMenuLink`），需单独用 `.VPNavBar .VPFlyout > .button` 覆盖

## 部署
- **CloudBase 静态托管**：`tcb hosting deploy -e scau-knowledge-base-d7b3ed8d2fc8` → 永久域名 `https://scau-knowledge-base-d7b3ed8d2fc8-1440179010.tcloudbaseapp.com`
- **CloudBase 云函数**：SCF 代理 GitHub Contents API，admin 后台保存课程
- **EdgeOne Pages**：临时域名 3 小时过期（`eo_time missing`），不适合做长期入口
