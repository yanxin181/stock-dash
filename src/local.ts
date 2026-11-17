export type Stock = 'A' | 'B'
export type Metric = 'price' | 'volume' | 'change'
export interface Query { stocks: Stock[]; days: number; metrics: Metric[] }
interface Point { date: string; price: number; volume: number; change: number | null }

// 固定生成规则和日期使每次运行得到完全一致的数据。
const dates: string[] = []
for (let d = new Date('2026-01-30T00:00:00Z'); dates.length < 61; d.setUTCDate(d.getUTCDate() - 1)) {
  if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.unshift(d.toISOString().slice(0, 10))
}
export const data: Record<Stock, Point[]> = Object.fromEntries((['A', 'B'] as const).map((stock, s) => {
  const prices = dates.map((_, i) => Number(((s ? 27 : 18) + i * (s ? .065 : .085) + Math.sin(i * (s ? .63 : .72)) * (s ? 1.25 : .9)).toFixed(2)))
  return [stock, dates.map((date, i) => ({ date, price: prices[i], volume: Math.round((s ? 680 : 520) + ((i * 137 + s * 83) % 390) + Math.abs(Math.sin(i)) * 120), change: i ? (prices[i] - prices[i - 1]) / prices[i - 1] * 100 : null }))]
})) as Record<Stock, Point[]>

export function parseQuery(input: string, previous?: Query): Query {
  const text = input.trim()
  if (!text) throw new Error('请输入想分析的内容，再发送。')
  if (/C\s*(公司|股票)|茅台|苹果|腾讯|K线|市盈率|营收|利润/i.test(text)) throw new Error('本地演示目前仅支持 A、B 公司，以及股价、成交量和每日涨跌幅。')
  const stocks = (['A', 'B'] as const).filter(s => new RegExp(`${s}\\s*(公司|股票)`, 'i').test(text))
  const dayMatch = text.match(/(?:最近|近|改为|改成)\s*(\d+)\s*(?:个)?\s*交易日/)
  const days = dayMatch ? Number(dayMatch[1]) : previous?.days ?? 30
  if (days < 2 || days > 60) throw new Error('请将交易日范围设置为 2 至 60 天。')
  let metrics: Metric[] = []
  if (/股价|收盘价|走势/.test(text)) metrics.push('price')
  if (/成交量/.test(text)) metrics.push('volume')
  if (/涨跌幅|涨幅|跌幅/.test(text)) metrics.push('change')
  if (/把成交量改成涨跌幅|成交量改为涨跌幅/.test(text) && previous) metrics = [...new Set([...previous.metrics.filter(m => m !== 'volume'), 'change' as Metric])]
  else if (!metrics.length && previous && dayMatch) metrics = previous.metrics
  if ((!stocks.length && !previous) || !metrics.length) throw new Error('暂时没有理解这条需求。试试输入“分析 A 公司最近 30 个交易日的股价”。')
  return { stocks: stocks.length ? stocks : previous!.stocks, days, metrics }
}
export function answer(query: Query): string {
  const lines = query.stocks.map(stock => {
    const rows = data[stock].slice(-query.days), first = rows[0], last = rows.at(-1)!
    const change = (last.price - first.price) / first.price * 100
    const high = rows.reduce((a,b) => a.price >= b.price ? a : b), low = rows.reduce((a,b) => a.price <= b.price ? a : b)
    const parts: string[] = []
    if (query.metrics.includes('price')) parts.push(`收盘价从 ${first.price.toFixed(2)} 元变为 ${last.price.toFixed(2)} 元，区间${change >= 0 ? '上涨' : '下跌'} ${Math.abs(change).toFixed(2)}%；最高 ${high.price.toFixed(2)} 元（${high.date}），最低 ${low.price.toFixed(2)} 元（${low.date}）。`)
    if (query.metrics.includes('volume')) { const top = [...rows].sort((a,b) => b.volume - a.volume).slice(0,3); parts.push(`成交量最高的 3 个交易日：${top.map(p => `${p.date}（${p.volume} 万股）`).join('、')}。`) }
    if (query.metrics.includes('change')) { const valid = rows.filter(p => p.change !== null); const up = [...valid].sort((a,b) => b.change! - a.change!)[0]; const down = valid.filter(p => p.change! < 0).sort((a,b) => a.change! - b.change!).slice(0,3); parts.push(`最大单日涨幅为 ${up.change!.toFixed(2)}%（${up.date}）；跌幅最大的交易日：${down.length ? down.map(p => `${p.date}（${p.change!.toFixed(2)}%）`).join('、') : '区间内没有下跌日'}。`) }
    return `${stock} 公司：${parts.join(' ')}`
  })
  return `已分析最近 ${query.days} 个交易日（${data.A.at(-query.days)!.date} 至 2026-01-30）。\n\n${lines.join('\n\n')}\n\n数据来源：内置模拟数据，仅用于功能演示。`
}
