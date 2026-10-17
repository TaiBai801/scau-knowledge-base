// 日期辅助模块（不注册路由，供其他云函数 import）

// 东八区自然日，格式 YYYY-MM-DD
export function gmt8Date(offsetDays) {
  const t = Date.now() + 8 * 3600 * 1000 - (offsetDays || 0) * 24 * 3600 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

export function nowMs() {
  return Date.now();
}
