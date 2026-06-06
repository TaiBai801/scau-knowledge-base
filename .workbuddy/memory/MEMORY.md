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

## VitePress 移动端菜单
- 移动端（<960px）汉堡菜单走 **VPNavScreen**（顶部下拉面板），非 VPSidebar（桌面侧边栏）
- VPNavScreen 和 VPSidebar 是两套独立组件，JS 按断点自动切换
- 黑屏问题 = VPNavScreen 默认透明背景 → 需显式设置 `background` + 自定义样式
- 汉堡菜单修复方向：给 VPNavScreen 穿 Ardot 皮肤（不要隐藏它）
- 菜单项触控：`min-height: 44px` + `touch-action: manipulation`
- 遮罩 VPOverlay：`z-index: 35`，VPNavScreen：`z-index: 40`
