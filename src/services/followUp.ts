import type { AnalysisSpec, ChartSpec, DashboardSchema } from '../types/schema'
import type { StockId } from '../types/stock'
import { validateDashboardSchema } from './validateSchema'

export type FollowUpResult =
  | { kind: 'not-follow-up' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; schema: DashboardSchema }

type Metric = 'price' | 'volume' | 'dailyChange'
const metricNames = '每日涨跌幅|涨跌幅|收盘价|股价|成交量'
const metricOf = (name: string): Metric => name === '股价' || name === '收盘价' ? 'price' : name === '成交量' ? 'volume' : 'dailyChange'
const matchesMetric = (chart: ChartSpec, metric: Metric) => chart.metric === metric || (metric === 'price' && chart.metric === 'relativePrice')
const makeChart = (metric: Metric, type: 'line' | 'bar'): ChartSpec => metric === 'price'
  ? { title: '收盘价走势', metric: 'price', type, unit: '元' }
  : metric === 'volume' ? { title: '成交量', metric: 'volume', type, unit: '万股' }
    : { title: '每日涨跌幅', metric: 'dailyChange', type, unit: '%' }
const titleFor = (schema: DashboardSchema) => `${schema.stocks.map(stock => `${stock} 公司`).join('、')}近 ${schema.timeRange.count} 个交易日分析`
const unsupported = '暂不支持该追问，请参照关键词文档中的示例描述修改。'

/** 生成新的候选配置；调用方必须在计算成功后才提交为当前看板。 */
export function applyFollowUp(input: string, current?: DashboardSchema): FollowUpResult {
  // 只归一化明确无歧义的礼貌用语，不丢弃其他未识别内容。
  const text = input.replace(/\s+/g, '').replace(/[。.!！?？]+$/, '').replace(/^(?:请|麻烦)/, '').replace(/(?:吧|呢|谢谢)$/, '')
  const days = text.match(/^(?:改|换)(?:为|成)(?:最近|近)(\d+)个?交易日$/)
  const metric = text.match(new RegExp(`^(?:把|将)?(${metricNames})(?:图|图表)?(?:改|换|替换)(?:成|为)(${metricNames})$`))
  const graph = text.match(new RegExp(`^(?:把|将)?(?:(${metricNames})(?:图|图表)?|(折线图|柱状图))?(?:改|换|替换)(?:成|为)(折线图|柱状图)$`))
  const extrema = text.match(/^(?:增加|添加|标出|标记)(最高价|最低价)(?:(?:和|及|与)(最高价|最低价))?$/)
  const ranking = text.match(/^(?:(?:把)?跌幅排名改(?:成|为)前(\d+)名|(?:标出|列出|增加|添加)跌幅最大(?:的)?(\d+)个?交易日)$/)
  const replaceStock = text.match(/^(?:把|将)?([A-Za-z])(?:公司|股票)?(?:改|换|替换)(?:成|为)([A-Za-z])(?:公司|股票)?$/i)
  const setStock = text.match(/^(?:改|换|切换)(?:成|为|到)([A-Za-z])(?:公司|股票)?$/i)
  const addStock = text.match(/^(?:增加|添加)([A-Za-z])(?:公司|股票)?(?:进行对比|对比|比较)$/i)
  if (!days && !metric && !graph && !extrema && !ranking && !replaceStock && !setStock && !addStock) {
    if (/^(?:改|换|切换|把|将|调整|增加|添加|标出|标记|列出)/.test(text)) return { kind: 'error', message: unsupported }
    return { kind: 'not-follow-up' }
  }
  if (!current) return { kind: 'error', message: '请先生成一个本地看板，再提出追问。' }
  const error = (message: string): FollowUpResult => ({ kind: 'error', message })
  let next: DashboardSchema = { ...current }

  if (days) {
    const count = Number(days[1])
    const replaceDays = (title: string) => title.replace(/((?:最近|近)\s*)\d+(\s*个?交易日)/g, (_, prefix: string, suffix: string) => `${prefix}${count}${suffix}`)
    next = { ...next, title: replaceDays(next.title), timeRange: { type: 'tradingDays', count }, charts: next.charts.map(chart => ({ ...chart, title: replaceDays(chart.title) })) }
  } else if (metric) {
    const from = metricOf(metric[1]), to = metricOf(metric[2])
    if (from === to) return error('原指标与目标指标相同，请指定不同的指标。')
    const originals = next.charts.filter(chart => matchesMetric(chart, from))
    if (!originals.length) return error(`当前看板没有${metric[1]}图表，无法替换。`)
    // 已有目标指标时保留原图，移除源图，避免出现两张同指标图。
    const targetExists = next.charts.some(chart => matchesMetric(chart, to))
    const charts = targetExists ? next.charts.filter(chart => !matchesMetric(chart, from))
      : next.charts.map(chart => matchesMetric(chart, from) ? makeChart(to, chart.type) : chart)
    const analysis = next.analysis.filter(item => !(
      (from === 'volume' && item.type === 'highestVolume') ||
      (from === 'price' && (item.type === 'priceExtrema' || item.type === 'periodChange')) ||
      (from === 'dailyChange' && (item.type === 'largestGain' || item.type === 'largestDeclines'))
    ))
    next = { ...next, charts, analysis }
    next.title = titleFor(next)
  } else if (graph) {
    const requested = graph[1] ? metricOf(graph[1]) : undefined
    const sourceType = graph[2] === '折线图' ? 'line' : graph[2] === '柱状图' ? 'bar' : undefined
    const targetType = graph[3] === '折线图' ? 'line' : 'bar'
    const indices = next.charts.map((chart, index) => ({ chart, index })).filter(({ chart }) => requested ? matchesMetric(chart, requested) : sourceType ? chart.type === sourceType : true)
    if (!indices.length) return error('当前看板没有指定的图表，请确认指标或图表类型。')
    if (!requested && !sourceType && indices.length !== 1) return error('当前看板有多张图，请指定要修改的指标或原图表类型。')
    if (targetType === 'bar' && indices.some(({ chart }) => chart.metric === 'relativePrice')) return error('双股票相对股价对比只支持折线图。')
    const selected = new Set(indices.map(item => item.index))
    next = { ...next, charts: next.charts.map((chart, index): ChartSpec => selected.has(index) && chart.metric !== 'relativePrice' ? { ...chart, type: targetType } : chart) }
  } else if (extrema) {
    const marks: ('highest' | 'lowest')[] = []
    for (const value of [extrema[1], extrema[2]]) {
      const mark = value === '最高价' ? 'highest' : value === '最低价' ? 'lowest' : undefined
      if (mark && !marks.includes(mark)) marks.push(mark)
    }
    const existing = next.analysis.find(item => item.type === 'priceExtrema')
    const combined = [...new Set([...(existing?.type === 'priceExtrema' ? existing.marks : []), ...marks])]
    const analysis: AnalysisSpec[] = [...next.analysis.filter(item => item.type !== 'priceExtrema'), { type: 'priceExtrema', marks: combined }]
    const charts: ChartSpec[] = next.charts.some(chart => chart.metric === 'price') ? next.charts : [...next.charts, makeChart('price', 'line')]
    next = { ...next, charts, analysis }
  } else if (ranking) {
    const count = Number(ranking[1] ?? ranking[2])
    if (!Number.isSafeInteger(count) || count < 1) return error('跌幅排名数量须为正整数。')
    if (ranking[1] && !next.analysis.some(item => item.type === 'largestDeclines')) return error('当前看板没有跌幅排名，请先添加跌幅排名。')
    const analysis: AnalysisSpec[] = [...next.analysis.filter(item => item.type !== 'largestDeclines'), { type: 'largestDeclines', count, display: 'ranking' }]
    next = { ...next, analysis }
  } else {
    const code = (value: string) => value.toUpperCase() as StockId
    const source = replaceStock ? code(replaceStock[1]) : undefined
    const target = code(replaceStock?.[2] ?? setStock?.[1] ?? addStock![1])
    if ((source && source !== 'A' && source !== 'B') || (target !== 'A' && target !== 'B')) return error('目前仅支持 A、B 公司。')
    if (addStock) {
      if (next.stocks.includes(target)) return error(`${target} 公司已在当前看板中。`)
      const charts: ChartSpec[] = next.charts.map(chart => chart.metric === 'price' ? { title: '相对股价走势', metric: 'relativePrice', type: 'line', unit: '基准点', base: 100 } : chart)
      if (!charts.some(chart => chart.metric === 'relativePrice')) charts.push({ title: '相对股价走势', metric: 'relativePrice', type: 'line', unit: '基准点', base: 100 })
      const analysis: AnalysisSpec[] = next.analysis.some(item => item.type === 'periodChange') ? next.analysis : [...next.analysis, { type: 'periodChange', display: 'comparison', unit: '%' }]
      next = { ...next, stocks: [...next.stocks, target], charts, analysis }
    } else {
      if (!source && next.stocks.length !== 1) return error('当前看板有多家公司，请明确要替换的公司，例如“把 A 公司改成 B 公司”。')
      const old = source ?? next.stocks[0]
      if (!next.stocks.includes(old)) return error(`当前看板没有 ${old} 公司。`)
      if (next.stocks.includes(target) && old !== target) return error(`${target} 公司已在当前看板中，不能重复。`)
      next = { ...next, stocks: next.stocks.map(stock => stock === old ? target : stock) }
    }
    next.title = titleFor(next)
  }
  const validated = validateDashboardSchema(next)
  if (!validated.success) return error(`追问后的配置无效：${validated.errors.map(item => item.message).join('；')}`)
  return { kind: 'success', schema: validated.data }
}
