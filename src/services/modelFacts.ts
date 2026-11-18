import type { AnalysisResult, ChartData, StockAnalysis } from '../types/analysis'
import { describeChangeDistribution } from './conclusionText'

const format = (n: number) => n.toFixed(2)
const signed = (n: number) => `${n > 0 ? '+' : ''}${format(n)}`
const period = (stock: StockAnalysis) => `${stock.rows[0].date} 至 ${stock.rows[stock.rows.length - 1].date}，${stock.stock} 公司`
const average = (numbers: number[]) => numbers.reduce((sum, value) => sum + value, 0) / numbers.length
const movement = (change: number) => change > 0 ? `上涨 ${format(change)}%` : change < 0 ? `下跌 ${format(-change)}%` : '持平'

/** 从已计算的数据生成可验证的分析表述，不使用模型提供的标题或结论。 */
export function describeChart(stock: StockAnalysis, chart: ChartData): string {
  const { rows } = stock
  const first = rows[0], last = rows[rows.length - 1]
  const prefix = period(stock)
  switch (chart.spec.metric) {
    case 'price': {
      const trend = stock.periodChange === null ? '区间首日收盘价为零，无法计算区间涨跌幅' : `区间${movement(stock.periodChange)}`
      let text = `${prefix}收盘价从 ${format(first.close)} 元变为 ${format(last.close)} 元，${trend}。`
      if (chart.spec.ma5) {
        if (last.ma5 === null) text += '末日缺少足够历史记录，无法计算 5 日均线。'
        else {
          const relation = last.close > last.ma5 ? '高于' : last.close < last.ma5 ? '低于' : '等于'
          text += `${last.date} 的 5 日均线为 ${format(last.ma5)} 元，收盘价${relation}均线 ${format(Math.abs(last.close - last.ma5))} 元。`
        }
      }
      return text
    }
    case 'volume': {
      const mean = average(rows.map(row => row.volume))
      const lastComparison = mean > 0 ? last.volume === mean ? '末日成交量与日均水平相同' : `末日成交量较日均${last.volume > mean ? '高' : '低'} ${format(Math.abs(last.volume / mean - 1) * 100)}%` : '日均成交量为零，无法计算相对差异'
      return `${prefix}日均成交量为 ${format(mean)} 万股，${last.date} 的成交量为 ${format(last.volume)} 万股；${lastComparison}。`
    }
    case 'dailyChange': {
      const values = rows.flatMap(row => row.dailyChange === null ? [] : [row.dailyChange])
      if (!values.length) return `${prefix}区间内没有可计算每日涨跌幅的交易日。`
      const rise = values.filter(value => value > 0).length, fall = values.filter(value => value < 0).length, flat = values.filter(value => value === 0).length
      const omitted = rows.length - values.length
      return `${prefix}有 ${values.length} 个有效交易日：上涨 ${rise} 天、下跌 ${fall} 天、持平 ${flat} 天；日均涨跌幅为 ${signed(average(values))}%。${omitted ? `另有 ${omitted} 天缺少有效前收盘价，未参与统计。` : ''}`
    }
    case 'relativePrice': {
      if (last.relativePrice === null || stock.periodChange === null) return `${prefix}区间首日价格为零，无法计算相对股价走势。`
      return `${prefix}以区间首日为 100 基准点，末日相对股价为 ${format(last.relativePrice)} 基准点，对应区间${movement(stock.periodChange)}。`
    }
    case 'changeDistribution': {
      const distribution = chart.series.find(series => series.stock === stock.stock)?.distribution
      return distribution ? `${first.date} 至 ${last.date}：${describeChangeDistribution(stock.stock, distribution)}` : `${prefix}缺少涨跌分布数据。`
    }
    case 'volumeChange': {
      const points = chart.series.find(series => series.stock === stock.stock)?.scatter ?? []
      if (!points.length) return `${prefix}没有成交量与每日涨跌幅均可用的交易日。`
      const highest = points.reduce((best, point) => point.volume > best.volume ? point : best)
      const omitted = rows.length - points.length
      return `${prefix}量价散点图包含 ${points.length} 个有效交易日；其中成交量最高的是 ${highest.date}，为 ${format(highest.volume)} 万股，当日涨跌幅为 ${signed(highest.change)}%。${omitted ? `另有 ${omitted} 天因缺少有效涨跌幅未纳入。` : ''}`
    }
  }
}

export function describeAnalysis(stock: StockAnalysis, analysis: AnalysisResult, template: string): string {
  const prefix = `${stock.rows[0].date} 至 ${stock.rows[stock.rows.length - 1].date}：`
  switch (analysis.spec.type) {
    case 'priceExtrema': {
      const high = analysis.points.find(point => point.label === 'highest')
      const low = analysis.points.find(point => point.label === 'lowest')
      if (!high || !low) {
        const selected = high ?? low
        if (!selected) return prefix + template
        const mean = average(stock.rows.map(row => row.close))
        const relation = selected.value > mean ? '高于' : selected.value < mean ? '低于' : '等于'
        return `${prefix}${template}区间平均收盘价为 ${format(mean)} 元，该极值${relation}均价 ${format(Math.abs(selected.value - mean))} 元。`
      }
      const diff = high.value - low.value
      return `${prefix}${template}最高与最低收盘价相差 ${format(diff)} 元${low.value > 0 ? `，相当于最低价的 ${format(diff / low.value * 100)}%` : '；最低价为零，无法计算相对差异'}。`
    }
    case 'periodChange': {
      const first = stock.rows[0], last = stock.rows[stock.rows.length - 1]
      return `${prefix}${template}区间首日收盘价为 ${format(first.close)} 元，末日为 ${format(last.close)} 元。`
    }
    case 'largestGain': {
      const values = stock.rows.flatMap(row => row.dailyChange === null ? [] : [row.dailyChange])
      if (!analysis.points.length || !values.length) return prefix + template
      return `${prefix}${template}区间内 ${values.length} 个有效交易日的平均每日涨跌幅为 ${signed(average(values))}%。`
    }
    case 'largestDeclines': {
      const values = stock.rows.flatMap(row => row.dailyChange === null ? [] : [row.dailyChange])
      if (!values.length) return `${prefix}${template}区间没有可计算涨跌幅的交易日。`
      const down = values.filter(value => value < 0).length
      const first = analysis.points[0]
      const deepest = first ? `跌幅最大交易日为 ${first.date}（${signed(first.value)}%）；` : '区间内没有符合条件的下跌日；'
      return `${prefix}${stock.stock} 公司${deepest}${values.length} 个有效交易日中有 ${down} 个下跌日，占 ${format(down / values.length * 100)}%。${analysis.message ?? ''}`
    }
    case 'highestVolume': return prefix + template
  }
}
