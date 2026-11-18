import type { DashboardSchema } from '../types/schema'

export interface SchemaIssue { path: string; message: string }
export type SchemaValidationResult =
  | { success: true; data: DashboardSchema }
  | { success: false; errors: SchemaIssue[] }

type ObjectValue = Record<string, unknown>
const isObject = (value: unknown): value is ObjectValue => typeof value === 'object' && value !== null && !Array.isArray(value)
const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isDate = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** 对不可信输入执行运行时校验；失败时返回字段路径与可展示的中文错误。 */
export function validateDashboardSchema(input: unknown): SchemaValidationResult {
  const errors: SchemaIssue[] = []
  const issue = (path: string, message: string) => errors.push({ path, message })
  if (!isObject(input)) return { success: false, errors: [{ path: '$', message: '看板配置必须是对象。' }] }

  if (!nonEmptyString(input.title)) issue('title', '请输入看板标题。')
  if (!Array.isArray(input.stocks) || input.stocks.length === 0) issue('stocks', '请至少选择一只股票。')
  else {
    input.stocks.forEach((stock, i) => {
      if (stock !== 'A' && stock !== 'B') issue(`stocks[${i}]`, '目前仅支持 A、B 公司。')
    })
    if (new Set(input.stocks).size !== input.stocks.length) issue('stocks', '股票不能重复。')
  }

  if (!isObject(input.timeRange)) issue('timeRange', '请提供时间范围。')
  else {
    if (input.timeRange.type !== 'tradingDays') issue('timeRange.type', '时间范围仅支持交易日。')
    if (!isPositiveInteger(input.timeRange.count) || input.timeRange.count < 2 || input.timeRange.count > 60)
      issue('timeRange.count', '交易日数量须为 2 至 60 的整数。')
  }

  if (!Array.isArray(input.charts) || input.charts.length === 0) issue('charts', '请至少配置一个图表。')
  else input.charts.forEach((chart, i) => {
    const path = `charts[${i}]`
    if (!isObject(chart)) { issue(path, '图表配置必须是对象。'); return }
    if (!nonEmptyString(chart.title)) issue(`${path}.title`, '请输入图表标题。')
    const units: Record<string, string> = { price: '元', volume: '万股', dailyChange: '%', relativePrice: '基准点' }
    const metric = typeof chart.metric === 'string' && Object.hasOwn(units, chart.metric) ? chart.metric : undefined
    if (!metric) issue(`${path}.metric`, '不支持该指标；可选股价、成交量、每日涨跌幅或相对股价。')
    if (chart.type !== 'line' && chart.type !== 'bar') issue(`${path}.type`, '图表类型仅支持折线图或柱状图。')
    if (metric && chart.unit !== units[metric]) issue(`${path}.unit`, `该指标的单位应为「${units[metric]}」。`)
    if (!metric && !nonEmptyString(chart.unit)) issue(`${path}.unit`, '请提供图表单位。')
    if (metric === 'relativePrice') {
      if (chart.type !== 'line') issue(`${path}.type`, '相对股价走势须使用折线图。')
      if (chart.base !== 100) issue(`${path}.base`, '相对股价基准必须为 100。')
    }
  })

  if (!Array.isArray(input.analysis)) issue('analysis', '分析配置必须是数组，可为空数组。')
  else input.analysis.forEach((item, i) => {
    const path = `analysis[${i}]`
    if (!isObject(item)) { issue(path, '分析配置必须是对象。'); return }
    switch (item.type) {
      case 'priceExtrema':
        if (!Array.isArray(item.marks) || item.marks.length === 0 || item.marks.some(mark => mark !== 'highest' && mark !== 'lowest') || new Set(item.marks).size !== item.marks.length)
          issue(`${path}.marks`, '最高最低标注须包含 highest 和/或 lowest，且不能重复。')
        break
      case 'largestGain':
        if (item.count !== 1) issue(`${path}.count`, '最大涨幅标注数量必须为 1。')
        if (item.display !== 'mark') issue(`${path}.display`, '最大涨幅使用标注展示。')
        break
      case 'largestDeclines':
      case 'highestVolume':
        if (!isPositiveInteger(item.count)) issue(`${path}.count`, '排名数量须为正整数。')
        if (item.display !== 'ranking' && item.display !== 'mark') issue(`${path}.display`, '展示方式须为排名或标注。')
        break
      case 'periodChange':
        if (item.display !== 'comparison') issue(`${path}.display`, '区间涨跌幅使用对比展示。')
        if (item.unit !== '%') issue(`${path}.unit`, '区间涨跌幅单位应为「%」。')
        break
      default: issue(`${path}.type`, '不支持该分析类型。')
    }
    if (Array.isArray(input.charts)) {
      const metrics = input.charts.filter(isObject).map(chart => chart.metric)
      const priceChart = metrics.includes('price') || metrics.includes('relativePrice')
      if (item.type === 'priceExtrema' && !priceChart) issue(path, '最高最低价标注需要股价或相对股价图表。')
      if ((item.type === 'largestGain' || (item.type === 'largestDeclines' && item.display === 'mark')) && !priceChart && !metrics.includes('dailyChange')) issue(path, '涨跌幅标注需要股价、相对股价或每日涨跌幅图表。')
      if (item.type === 'highestVolume' && item.display === 'mark' && !metrics.includes('volume')) issue(path, '成交量标注需要成交量图表。')
    }
  })
  if (!nonEmptyString(input.dataSource)) issue('dataSource', '请提供数据来源。')
  if (!isDate(input.dataAsOf)) issue('dataAsOf', '数据截止日期须为有效的 YYYY-MM-DD 日期。')

  return errors.length ? { success: false, errors } : { success: true, data: input as unknown as DashboardSchema }
}
