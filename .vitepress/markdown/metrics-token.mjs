/**
 * markdown-it 令牌插件：把正文里的 [[m:key]] 在构建期替换成真实数字。
 *
 * 为什么需要它：散文里像「五专业 **346+** 门课程」这样的数字嵌在加粗、列表、
 * 表格单元格内部，用 Vue 组件替换会把句子切碎；frontmatter 又完全不经过
 * markdown 管道。令牌替换只动 text token，最轻也最稳。
 *
 * 分工（务必遵守）：
 *   静态指标（随 git 变）      → 用 [[m:key]] 令牌，构建期替换、SSR 直出
 *   运行时可变指标（后台能改） → 用 <InlineMetric>，由 /api/overview 刷新
 * 对 live key 使用令牌会直接抛错，避免把一个每天会变的数字写死进构建产物。
 *
 * 用法：
 *   [[m:courses.planEntries]]         → 346
 *   [[m:courses.planEntries|plus]]    → 346+
 *   [[m:content.syllabus.points|comma]] → 4,248
 */

const TOKEN_RE = /\[\[m:([A-Za-z0-9_.]+)(?:\|([a-z]+))?\]\]/g

// 只允许在构建期固化的指标
const STATIC_PREFIXES = ['courses.', 'site.', 'content.syllabus.']

export function isStaticKey(key) {
  return STATIC_PREFIXES.some((p) => key.startsWith(p))
}

export function formatValue(value, format) {
  if (format === 'plus') return `${value}+`
  if (format === 'comma') return Number(value).toLocaleString('en-US')
  return String(value)
}

/**
 * @param {import('markdown-it')} md
 * @param {(key: string) => number | null} readSnapshot 从快照读数的函数
 */
export function metricsTokenPlugin(md, readSnapshot) {
  md.core.ruler.after('inline', 'metrics-token', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children) continue
      for (const child of token.children) {
        // 只替换普通文本，不碰代码块、链接、行内代码
        if (child.type !== 'text' || child.content.indexOf('[[m:') === -1) continue

        child.content = child.content.replace(TOKEN_RE, (raw, key, format) => {
          if (!isStaticKey(key)) {
            throw new Error(
              `[metrics] [[m:${key}]] 是运行时指标，不能写进构建产物；` +
                `请改用 <InlineMetric k="${key}" /> 组件`
            )
          }
          const value = readSnapshot(key)
          if (value == null || !Number.isFinite(value)) {
            throw new Error(
              `[metrics] 令牌 [[m:${key}]] 无法解析：该 key 不在 site-metrics.json 中，` +
                `请检查拼写或运行 node scripts/site-metrics.mjs`
            )
          }
          return formatValue(value, format)
        })
      }
    }
  })
}

export default metricsTokenPlugin
