import { describe, expect, it, vi } from 'vitest'
import type { ChartSpec, AnalysisSpec } from '../types/schema'
import type { StockRecord } from '../types/stock'
import { schemaExamples } from '../examples/schemas'
import { analyzeDashboard } from './analyzeDashboard'
import { extractConclusionFacts, generateModelConclusion } from './modelConclusion'

const records: StockRecord[] = [
  { stock: 'A', date: '2026-01-01', close: 100, volume: 8 },
  { stock: 'A', date: '2026-01-02', close: 110, volume: 9 },
  { stock: 'A', date: '2026-01-03', close: 99, volume: 7 },
  { stock: 'A', date: '2026-01-04', close: 99, volume: 10 },
]
const chartSpecs: ChartSpec[] = [
  { title: '价格', metric: 'price', type: 'line', unit: '元', ma5: true },
  { title: '成交量', metric: 'volume', type: 'bar', unit: '万股' },
  { title: '涨跌幅', metric: 'dailyChange', type: 'bar', unit: '%' },
  { title: '相对走势', metric: 'relativePrice', type: 'line', unit: '基准点', base: 100 },
  { title: '涨跌分布', metric: 'changeDistribution', type: 'donut', unit: '天' },
  { title: '量价', metric: 'volumeChange', type: 'scatter', unit: '万股 / %' },
]
const analyses: AnalysisSpec[] = [
  { type: 'priceExtrema', marks: ['highest', 'lowest'] },
  { type: 'largestGain', count: 1, display: 'mark' },
  { type: 'largestDeclines', count: 2, display: 'ranking' },
  { type: 'highestVolume', count: 2, display: 'ranking' },
  { type: 'periodChange', display: 'comparison', unit: '%' },
]
const run = (charts = chartSpecs, analysis = analyses, data = records) => {
  const schema = { ...structuredClone(schemaExamples[0].schema), stocks: ['A'], timeRange: { type: 'tradingDays', count: 3 }, charts, analysis, dataAsOf: '2026-01-04' }
  const result = analyzeDashboard(schema, data)
  if (!result.success) throw new Error(result.message)
  return result.data
}

describe('大模型模式的分析事实', () => {
  it('为每种分析和每张图提供比较事实，复用同一计算结果', () => {
    const data = run()
    const localBefore = [...data.conclusions]
    const facts = extractConclusionFacts(data).map(item => item.text)
    expect(facts).toHaveLength(11)
    expect(facts[0]).toContain('最高与最低收盘价相差 11.00 元')
    expect(facts[1]).toContain('平均每日涨跌幅为 0.00%')
    expect(facts[2]).toContain('3 个有效交易日中有 1 个下跌日，占 33.33%')
    expect(facts[3]).toContain('区间日均成交量')
    expect(facts[4]).toContain('区间涨跌幅为 -10.00%')
    expect(facts[5]).toContain('区间下跌 10.00%')
    expect(facts[5]).toContain('无法计算 5 日均线')
    expect(facts[6]).toContain('末日成交量较日均高 15.38%')
    expect(facts[7]).toContain('上涨 1 天、下跌 1 天、持平 1 天')
    expect(facts[8]).toContain('末日相对股价为 90.00 基准点')
    expect(facts[9]).toContain('上涨与下跌天数相同')
    expect(facts[10]).toContain('2026-01-04，为 10.00 万股，当日涨跌幅为 0.00%')
    expect(data.conclusions).toEqual(localBefore)
  })
  it('只收到部分事实选择时仍保留所有图表和分析的结论', async () => {
    const data = run()
    const facts = extractConclusionFacts(data)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ factIds: ['f2'] }), { status: 200 })) as typeof fetch
    const result = await generateModelConclusion(data, fetchMock)
    expect(result.usedModel).toBe(true)
    expect(result.conclusions[0]).toBe(facts[1].text)
    expect(result.conclusions).toHaveLength(facts.length)
    expect(new Set(result.conclusions)).toEqual(new Set(facts.map(item => item.text)))
  })
  it('区间首价和成交量为零时不编造比例', () => {
    const zeros = records.map(row => ({ ...row, close: 0, volume: 0 }))
    const data = run(chartSpecs, [], zeros)
    const facts = extractConclusionFacts(data).map(item => item.text)
    expect(facts[0]).toContain('无法计算区间涨跌幅')
    expect(facts[1]).toContain('日均成交量为零')
    expect(facts[2]).toContain('没有可计算每日涨跌幅')
    expect(facts[3]).toContain('无法计算相对股价')
    expect(facts[4]).toContain('没有可计算涨跌幅')
    expect(facts[5]).toContain('没有成交量与每日涨跌幅均可用')
    expect(facts.join()).not.toMatch(/NaN|Infinity/)
  })
  it('只请求一个价格极值时，仍与区间均价比较', () => {
    const data = run([chartSpecs[0]], [{ type: 'priceExtrema', marks: ['highest'] }])
    const fact = extractConclusionFacts(data)[0].text
    expect(fact).toContain('最高收盘价 110.00 元')
    expect(fact).toContain('平均收盘价为 102.67 元')
    expect(fact).toContain('高于均价 7.33 元')
  })
})
