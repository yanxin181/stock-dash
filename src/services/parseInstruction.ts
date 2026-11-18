import { DATA_AS_OF, DATA_SOURCE } from '../data/stocks'
import type { AnalysisSpec, ChartSpec, DashboardSchema } from '../types/schema'
import type { StockId } from '../types/stock'
import { validateDashboardSchema, type SchemaIssue } from './validateSchema'

export type ParseResult =
  | { success: true; schema: DashboardSchema }
  | { success: false; stage: '理解需求' | '生成 Schema'; message: string; issues?: SchemaIssue[] }

/** 按有限的本地规则生成看板配置；不支持的文字不会被悄悄忽略。 */
export function parseInstruction(input: string): ParseResult {
  const fail = (message: string): ParseResult => ({ success: false, stage: '理解需求', message })
  let text = input.replace(/\s+/g, '')
  if (!text) return fail('请输入分析需求，例如：分析 A 公司最近 30 个交易日的股价。')

  const stocks: StockId[] = []
  text = text.replace(/([A-Za-z])(?:公司|股票)/gi, (_, name: string) => {
    const stock = name.toUpperCase()
    if (stock === 'A' || stock === 'B') stocks.push(stock)
    else stocks.push(stock as StockId)
    return ' '
  })
  if (stocks.some(stock => stock !== 'A' && stock !== 'B')) return fail('暂不支持该股票，本地模式仅支持 A、B 公司。')
  const uniqueStocks = [...new Set(stocks)]
  if (!uniqueStocks.length) return fail('请明确指定 A 公司或 B 公司。')

  const ranges = [...text.matchAll(/(?:最近|近)(\d+)个?交易日/g)]
  if (ranges.length !== 1) return fail('请指定一个时间范围，例如“最近 30 个交易日”。')
  const days = Number(ranges[0][1])
  text = text.replace(ranges[0][0], ' ')
  if (!Number.isSafeInteger(days) || days < 2 || days > 60) return fail('交易日数量须为 2 至 60 的整数。')

  const analysis: AnalysisSpec[] = []
  const declines = [...text.matchAll(/跌幅最大(?:的)?(\d+)个?交易日/g)]
  const volumes = [...text.matchAll(/成交量最高(?:的)?(\d+)个?交易日/g)]
  if (declines.length > 1 || volumes.length > 1) return fail('请为每类排名只指定一个数量。')
  let hasVolume = false
  if (declines.length) {
    const count = Number(declines[0][1])
    if (!Number.isSafeInteger(count) || count < 1) return fail('跌幅排名数量须为正整数。')
    analysis.push({ type: 'largestDeclines', count, display: 'ranking' })
    text = text.replace(declines[0][0], ' ')
  }
  if (volumes.length) {
    const count = Number(volumes[0][1])
    if (!Number.isSafeInteger(count) || count < 1) return fail('成交量排名数量须为正整数。')
    analysis.push({ type: 'highestVolume', count, display: 'ranking' })
    hasVolume = true
    text = text.replace(volumes[0][0], ' ')
  }
  if (!declines.length && /跌幅最大(?:的)?交易日|最大跌幅(?:的交易日)?/.test(text)) {
    analysis.push({ type: 'largestDeclines', count: 1, display: 'ranking' })
    text = text.replace(/跌幅最大(?:的)?交易日|最大跌幅(?:的交易日)?/g, ' ')
  }
  const hasGain = /涨幅最大(?:的)?交易日|最大涨幅(?:的交易日)?/.test(text)
  if (hasGain) {
    analysis.push({ type: 'largestGain', count: 1, display: 'mark' })
    text = text.replace(/涨幅最大(?:的)?交易日|最大涨幅(?:的交易日)?/g, ' ')
  }
  if (/成交量(?:最高|最低)/.test(text)) return fail('请明确成交量排名数量，例如“成交量最高的 3 个交易日”。')
  const priceMentioned = /股价|收盘价/.test(text)
  const highest = /最高价/.test(text) || (priceMentioned && /最高/.test(text))
  const lowest = /最低价/.test(text) || (priceMentioned && /最低/.test(text))
  if (highest || lowest) {
    const marks: ('highest' | 'lowest')[] = []
    if (highest) marks.push('highest')
    if (lowest) marks.push('lowest')
    analysis.push({ type: 'priceExtrema', marks })
    text = text.replace(/最高价|最低价|最高|最低/g, ' ')
  }

  const comparison = /对比|比较/.test(text)
  const hasPrice = /股价|收盘价/.test(text) || highest || lowest
  hasVolume ||= /成交量/.test(text)
  const hasChange = /涨跌幅|每日涨幅|每日跌幅/.test(text)
  const dailyChange = /每日涨跌幅|每日涨幅|每日跌幅/.test(text)
  if (comparison && uniqueStocks.length !== 2) return fail('对比需要同时指定 A 公司和 B 公司。')
  if (comparison && !hasPrice) return fail('目前仅支持比较 A、B 公司的股价走势。')
  const relativePrice = comparison && hasPrice
  const periodChange = relativePrice && hasChange && !dailyChange
  if (periodChange) analysis.push({ type: 'periodChange', display: 'comparison', unit: '%' })
  const showDailyChange = (hasChange && !periodChange) || ((hasGain || analysis.some(item => item.type === 'largestDeclines')) && !hasPrice && !hasVolume)

  const line = /折线图/.test(text), bar = /柱状图/.test(text)
  if (line && bar) return fail('请只指定一种图表类型，或分别提出需求。')
  if (relativePrice && bar) return fail('两家公司相对股价对比仅支持折线图。')
  const chartType = line ? 'line' : bar ? 'bar' : undefined
  const charts: ChartSpec[] = []
  if (relativePrice) charts.push({ title: '相对股价走势', metric: 'relativePrice', type: 'line', unit: '基准点', base: 100 })
  else if (hasPrice) charts.push({ title: '收盘价走势', metric: 'price', type: chartType ?? 'line', unit: '元' })
  if (hasVolume) charts.push({ title: '成交量', metric: 'volume', type: chartType ?? 'bar', unit: '万股' })
  if (showDailyChange) charts.push({ title: '每日涨跌幅', metric: 'dailyChange', type: chartType ?? 'bar', unit: '%' })
  if (!charts.length) return fail('请指定支持的指标：股价、成交量或每日涨跌幅。')

  // 只消耗已识别的表达，剩余文字表明含有未知要求或不支持的指标。
  text = text.replace(/每日涨跌幅|每日涨幅|每日跌幅|涨跌幅|股价|收盘价|成交量|折线图|柱状图/g, ' ')
  text = text.replace(/分析|查看|展示|用|并且|并|标出|标记|找出|列出|比较|对比|这段时间内|区间内|两家公司|走势|的|和|与|以及|在|为|及/g, ' ')
  const remaining = text.replace(/[\s，。！？、,.!?：:；;（）()]/g, '')
  if (remaining) return fail(`暂不支持或无法理解“${remaining}”，请参考示例描述股票、时间和指标。`)

  const stockTitle = uniqueStocks.map(stock => `${stock} 公司`).join('、')
  const title = `${stockTitle}近 ${days} 个交易日分析`
  const candidate: DashboardSchema = {
    title, stocks: uniqueStocks, timeRange: { type: 'tradingDays', count: days },
    charts, analysis, dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
  }
  const result = validateDashboardSchema(candidate)
  if (!result.success) return { success: false, stage: '生成 Schema', message: '生成的看板配置未通过校验，请调整需求。', issues: result.errors }
  return { success: true, schema: result.data }
}
