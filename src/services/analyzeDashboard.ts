import { stockRecords } from '../data/stocks'
import type { DashboardComputation, ChartData, StockAnalysis, AnalysisResult, ValuePoint } from '../types/analysis'
import type { StockRecord } from '../types/stock'
import { validateDashboardSchema } from './validateSchema'

const format = (value: number) => value.toFixed(2)
const withSign = (value: number) => `${value > 0 ? '+' : ''}${format(value)}%`
const sortedByValue = (points: ValuePoint[], descending: boolean) => [...points].sort((a, b) =>
  (descending ? b.value - a.value : a.value - b.value) || a.date.localeCompare(b.date))

/** 输入校验、筛选与计算的唯一入口。输出可被图表、标注、排名和结论共同使用。 */
export function analyzeDashboard(input: unknown, records: readonly StockRecord[] = stockRecords): DashboardComputation {
  const checked = validateDashboardSchema(input)
  if (!checked.success) return { success: false, stage: '校验 Schema', message: checked.errors.map(e => `${e.path}：${e.message}`).join('；') }
  const schema = checked.data
  const warnings: string[] = []
  const stocks: StockAnalysis[] = []
  const requiresDaily = schema.charts.some(chart => chart.metric === 'dailyChange') || schema.analysis.some(a => a.type === 'largestGain' || a.type === 'largestDeclines')
  const requiresRelative = schema.charts.some(chart => chart.metric === 'relativePrice')
  const requiresPeriod = schema.analysis.some(a => a.type === 'periodChange')

  for (const stock of schema.stocks) {
    const rows = records.filter(row => row.stock === stock && row.date <= schema.dataAsOf).slice().sort((a, b) => a.date.localeCompare(b.date))
    if (!rows.length) return { success: false, stage: '处理数据', message: `${stock} 公司在截止日期 ${schema.dataAsOf} 前没有可用数据。` }
    if (rows.some((row, i) => !Number.isFinite(row.close) || row.close < 0 || !Number.isFinite(row.volume) || row.volume < 0 || (i > 0 && row.date === rows[i - 1].date)))
      return { success: false, stage: '处理数据', message: `${stock} 公司存在无效价格、成交量或重复日期，请检查数据源。` }
    const start = Math.max(0, rows.length - schema.timeRange.count)
    const selected = rows.slice(start)
    if (selected.length < schema.timeRange.count) warnings.push(`${stock} 公司仅有 ${selected.length} 条交易日数据，少于请求的 ${schema.timeRange.count} 条。`)
    const base = selected[0].close
    const calculated = selected.map((row, i) => {
      const previous = rows[start + i - 1]
      return { ...row, dailyChange: previous && previous.close !== 0 ? (row.close - previous.close) / previous.close * 100 : null,
        relativePrice: base !== 0 ? row.close / base * 100 : null }
    })
    const unavailableDays = calculated.filter(row => row.dailyChange === null).length
    if (requiresDaily && unavailableDays) warnings.push(`${stock} 公司有 ${unavailableDays} 个交易日缺少有效前一日价格，每日涨跌幅不可用且不参与排名。`)
    if (base === 0 && (requiresRelative || requiresPeriod)) warnings.push(`${stock} 公司区间首日收盘价为零，相对走势及区间涨跌幅无法计算。`)
    stocks.push({ stock, rows: calculated, periodChange: base !== 0 ? (selected[selected.length - 1].close - base) / base * 100 : null })
  }

  const dates = [...new Set(stocks.flatMap(stock => stock.rows.map(row => row.date)))].sort()
  if (stocks.length > 1 && stocks.some(stock => stock.rows.length !== dates.length)) warnings.push('各股票交易日期不完全一致；缺失日期保留为空值，相对走势分别以各自区间首日为基准。')
  const charts: ChartData[] = schema.charts.map(spec => ({
    spec, dates,
    series: stocks.map(stock => {
      const byDate = new Map(stock.rows.map(row => [row.date, row]))
      return { stock: stock.stock, values: dates.map(date => {
        const row = byDate.get(date)
        if (!row) return null
        switch (spec.metric) {
          case 'price': return row.close
          case 'volume': return row.volume
          case 'dailyChange': return row.dailyChange
          case 'relativePrice': return row.relativePrice
        }
      }) }
    }),
  }))

  const analyses: AnalysisResult[] = []
  const conclusions: string[] = []
  for (const spec of schema.analysis) for (const stock of stocks) {
    const prefix = `${stock.stock} 公司`
    const rows = stock.rows
    if (spec.type === 'periodChange') {
      analyses.push({ spec, stock: stock.stock, unit: '%', points: [], periodChange: stock.periodChange, ...(stock.periodChange === null ? { message: '区间首日收盘价为零，无法计算区间涨跌幅。' } : {}) })
      conclusions.push(stock.periodChange === null ? `${prefix}区间首日价格为零，无法计算区间涨跌幅。` : `${prefix}区间涨跌幅为 ${withSign(stock.periodChange)}。`)
    } else if (spec.type === 'priceExtrema') {
      const prices = rows.map(row => ({ date: row.date, value: row.close }))
      const points: ValuePoint[] = spec.marks.map(mark => ({ ...sortedByValue(prices, mark === 'highest')[0], label: mark }))
      analyses.push({ spec, stock: stock.stock, unit: '元', points })
      conclusions.push(`${prefix}${points.map(point => `${point.label === 'highest' ? '最高' : '最低'}收盘价 ${format(point.value)} 元（${point.date}）`).join('，')}。`)
    } else {
      const volume = spec.type === 'highestVolume'
      const values = rows.flatMap(row => {
        const value = volume ? row.volume : row.dailyChange
        return value === null ? [] : [{ date: row.date, value }]
      })
      const eligible = spec.type === 'largestDeclines' ? values.filter(point => point.value < 0) : spec.type === 'largestGain' ? values.filter(point => point.value > 0) : values
      const count = spec.count
      const points = sortedByValue(eligible, spec.type !== 'largestDeclines').slice(0, count)
      const name = spec.type === 'largestDeclines' ? '跌幅排名' : spec.type === 'largestGain' ? '最大单日涨幅' : '成交量排名'
      const unit = volume ? '万股' : '%'
      const message = points.length < count ? `请求 ${count} 条，实际符合条件 ${points.length} 条。` : undefined
      analyses.push({ spec, stock: stock.stock, unit, points, ...(message ? { message } : {}) })
      const display = points.map(point => `${point.date}（${volume ? format(point.value) : withSign(point.value)}${volume ? ' 万股' : ''}）`).join('、')
      conclusions.push(`${prefix}${name}：${display || '无符合条件的数据'}。${message ?? ''}`)
    }
  }
  if (!conclusions.length) {
    for (const stock of stocks) {
      const chart = schema.charts[0]
      const last = stock.rows[stock.rows.length - 1]
      const value = chart.metric === 'price' ? last.close : chart.metric === 'volume' ? last.volume : chart.metric === 'dailyChange' ? last.dailyChange : last.relativePrice
      conclusions.push(value === null ? `${stock.stock} 公司 ${last.date} 的${chart.title}无法计算。` : `${stock.stock} 公司 ${last.date} 的${chart.title}为 ${format(value)} ${chart.unit}。`)
    }
  }
  return { success: true, data: { schema, stocks, charts, analyses, conclusions, warnings } }
}
