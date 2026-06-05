import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '机电学院知识库',
  description: '四川农业大学机电学院专业课程资源共享平台 — 别让好资料躺在硬盘里吃灰',
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#2563eb' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '机电学院知识库' }],
    ['meta', { property: 'og:description', content: '四川农业大学机电学院专业课程资源共享平台，覆盖16门课程、8个学期、高分学长经验分享' }],
    ['meta', { property: 'og:site_name', content: '机电学院知识库' }],
  ],

  sitemap: { hostname: 'https://scau-knowledge-base-nhlkrpf1.edgeone.cool' },

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      {
        text: '课程总览',
        items: [
          { text: '电子科学与技术', link: '/majors/dianzikexue/' },
          { text: '电气工程及其自动化', link: '/majors/dianqigongcheng/' },
          { text: '农业机械化及其自动化', link: '/majors/nongyejixiehua/' },
        ],
      },
      { text: '课程地图', link: '/map' },
      { text: '学长说', link: '/stories' },
      { text: '贡献指南', link: '/contribute' },
      { text: '关于本站', link: '/about' },
    ],

    sidebar: {
      '/majors/dianzikexue/': [
        {
          text: '电子科学与技术',
          items: [
            { text: '📖 专业总览', link: '/majors/dianzikexue/' },
            { text: '📦 公共必修课 7', link: '/majors/dianzikexue/common' },
            { text: '📘 大一上学期 5', link: '/majors/dianzikexue/semester1-1' },
            { text: '📗 大一下学期 4', link: '/majors/dianzikexue/semester1-2' },
            { text: '📙 大二上学期 4', link: '/majors/dianzikexue/semester2-1' },
            { text: '📙 大二下学期 3', link: '/majors/dianzikexue/semester2-2' },
            { text: '📕 大三上学期', link: '/majors/dianzikexue/semester3-1' },
            { text: '📕 大三下学期', link: '/majors/dianzikexue/semester3-2' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索课程' },
          modal: {
            displayDetails: '显示详情',
            noResultsText: '未找到相关课程',
            footer: { selectText: '选择', closeText: '关闭' },
          },
        },
      },
    },

    footer: {
      message: '四川农业大学 · 机电学院',
      copyright: `Copyright © ${new Date().getFullYear()} 机电学院知识库`,
    },

    docFooter: { prev: '上一页', next: '下一页' },
    outline: { label: '本页目录', level: [2, 3] },
    lastUpdated: false,
    editLink: {
      pattern: 'https://github.com/TaiBai801/scau-knowledge-base/edit/main/:path',
      text: '在 GitHub 上编辑此页',
    },
  },

  ignoreDeadLinks: true,
})
