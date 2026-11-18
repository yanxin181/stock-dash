import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { analyzeDashboard } from './analyzeDashboard'
import { applyFollowUp } from './followUp'
import type { DashboardSchema } from '../types/schema'

function update(text: string, schema: DashboardSchema): DashboardSchema {
  const result = applyFollowUp(text, schema)
  expect(result.kind).toBe('success')
  if (result.kind !== 'success') throw new Error('追问未成功')
  return result.schema
}

describe('看板追问', () => {
  it('识别省略“把”的表达并根据原看板生成涨跌幅图表', () => {
    const original = structuredClone(schemaExamples[0].schema)
    for (const text of ['成交量改为涨跌幅', '成交量改成涨跌幅。', '把成交量改为涨跌幅']) {
      const next = update(text, original)
      expect(next.stocks).toEqual(original.stocks)
      expect(next.timeRange).toEqual(original.timeRange)
      expect(next.charts.map(chart => chart.metric)).toEqual(['price', 'dailyChange'])
      expect(analyzeDashboard(next).success).toBe(true)
    }
    expect(applyFollowUp('成交量改为涨跌幅')).toMatchObject({ kind: 'error', message: expect.stringContaining('先生成') })
  })
  it('替换成交量并保留股票、日期、其他指标和无关分析', () => {
    const original = structuredClone(schemaExamples[0].schema)
    original.analysis.push({ type: 'highestVolume', count: 3, display: 'ranking' })
    const before = structuredClone(original)
    const next = update('把成交量改成涨跌幅。', original)
    expect(original).toEqual(before)
    expect(next.stocks).toEqual(original.stocks)
    expect(next.timeRange).toEqual(original.timeRange)
    expect(next.charts).toEqual([
      original.charts[0],
      { title: '每日涨跌幅', metric: 'dailyChange', type: 'bar', unit: '%' },
    ])
    expect(next.analysis).toEqual([{ type: 'largestDeclines', count: 3, display: 'ranking' }])
    expect(next.title).not.toContain('成交量')
    const result = analyzeDashboard(next)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.charts[1].spec.metric).toBe('dailyChange')
      expect(result.data.charts[1].series[0].values).toEqual(result.data.stocks[0].rows.map(row => row.dailyChange))
      expect(result.data.conclusions[0]).toContain('跌幅排名')
    }
  })

  it('更新时间范围并保留分析配置，重新计算数据与结论', () => {
    const original = structuredClone(schemaExamples[1].schema)
    const before = structuredClone(original)
    const next = update('改成最近 20 个交易日。', original)
    expect(original).toEqual(before)
    expect(next.timeRange.count).toBe(20)
    expect(next.title).toContain('20 个交易日')
    expect(next.stocks).toEqual(original.stocks)
    expect(next.charts).toEqual(original.charts)
    expect(next.analysis).toEqual(original.analysis)
    const result = analyzeDashboard(next)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.stocks[0].rows).toHaveLength(20)
      expect(result.data.charts[0].dates).toHaveLength(20)
      const maximum = Math.max(...result.data.stocks[0].rows.map(row => row.close))
      expect(result.data.analyses[0].points[0].value).toBe(maximum)
      expect(result.data.conclusions[0]).toContain(maximum.toFixed(2))
    }
  })

  it('允许基于成功结果连续追问', () => {
    const original = structuredClone(schemaExamples[0].schema)
    const first = update('改为最近 10 个交易日', original)
    const second = update('把成交量改为涨跌幅', first)
    expect(second.timeRange.count).toBe(10)
    expect(second.charts.map(chart => chart.metric)).toEqual(['price', 'dailyChange'])
    const result = analyzeDashboard(second)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.stocks[0].rows).toHaveLength(10)
  })

  it('无原看板、无成交量或无效范围时返回明确提示，不修改原配置', () => {
    expect(applyFollowUp('改为最近 10 个交易日')).toMatchObject({ kind: 'error', message: expect.stringContaining('先生成') })
    const withoutVolume = structuredClone(schemaExamples[1].schema)
    const before = structuredClone(withoutVolume)
    expect(applyFollowUp('把成交量改成涨跌幅', withoutVolume)).toMatchObject({ kind: 'error', message: expect.stringContaining('没有成交量') })
    for (const text of ['改为最近 0 个交易日', '改为最近 61 个交易日', '改为最近 999999999999999999999 个交易日']) {
      expect(applyFollowUp(text, withoutVolume)).toMatchObject({ kind: 'error', message: expect.stringContaining('2 至 60') })
    }
    expect(withoutVolume).toEqual(before)
    expect(applyFollowUp('改为最近 10 天', withoutVolume)).toMatchObject({ kind: 'error', message: expect.stringContaining('不支持') })
    expect(applyFollowUp('查看 A 公司最近 10 个交易日的股价', withoutVolume)).toEqual({ kind: 'not-follow-up' })
  })

  it('支持股价、成交量和每日涨跌幅的两两互换，并移除不再适用的分析', () => {
    const cases = [
      ['股价', 'price', 1], ['成交量', 'volume', 3], ['涨跌幅', 'dailyChange', 2],
    ] as const
    for (const [sourceName, sourceMetric, sourceIndex] of cases) {
      for (const [targetName, targetMetric] of cases) {
        if (sourceMetric === targetMetric) continue
        const original = structuredClone(schemaExamples[sourceIndex].schema)
        const copy = structuredClone(original)
        const next = update(`把${sourceName}改为${targetName}`, original)
        expect(next.charts.map(chart => chart.metric)).toEqual([targetMetric])
        expect(next.stocks).toEqual(original.stocks)
        expect(next.timeRange).toEqual(original.timeRange)
        expect(next.analysis).toEqual([])
        expect(analyzeDashboard(next).success).toBe(true)
        expect(original).toEqual(copy)
      }
    }
    const mixed = update('成交量改为股价', structuredClone(schemaExamples[0].schema))
    expect(mixed.charts.map(chart => chart.metric)).toEqual(['price'])
  })

  it('按指定指标或原图表类型切换图表，对歧义和对比图给出提示', () => {
    const original = structuredClone(schemaExamples[0].schema)
    const price = update('把股价图改成柱状图', original)
    expect(price.charts.map(chart => chart.type)).toEqual(['bar', 'bar'])
    const volume = update('成交量改为折线图', original)
    expect(volume.charts.map(chart => chart.type)).toEqual(['line', 'line'])
    expect(update('把柱状图改成折线图', original).charts.map(chart => chart.type)).toEqual(['line', 'line'])
    expect(applyFollowUp('改成柱状图', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('多张图') })
    expect(applyFollowUp('把折线图改成柱状图', schemaExamples[4].schema)).toMatchObject({ kind: 'error', message: expect.stringContaining('只支持折线图') })
    expect(original).toEqual(schemaExamples[0].schema)
  })

  it('增加极值及新增或调整跌幅排名，计算结果保持一致', () => {
    const original = structuredClone(schemaExamples[3].schema)
    const marked = update('增加最高价和最低价', original)
    expect(marked.charts.map(chart => chart.metric)).toEqual(['volume', 'price'])
    expect(marked.analysis).toContainEqual({ type: 'priceExtrema', marks: ['highest', 'lowest'] })
    const ranked = update('标出跌幅最大的5个交易日', marked)
    const changed = update('把跌幅排名改为前2名', ranked)
    expect(changed.analysis).toContainEqual({ type: 'largestDeclines', count: 2, display: 'ranking' })
    const result = analyzeDashboard(changed)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.analyses.find(item => item.spec.type === 'largestDeclines')?.points.length).toBeLessThanOrEqual(2)
    expect(applyFollowUp('跌幅排名改为前5名', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('没有跌幅排名') })
    expect(applyFollowUp('标出跌幅最大的0个交易日', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('正整数') })
  })

  it('替换股票或增加另一家公司进行价格对比，失败时不改变原配置', () => {
    const original = structuredClone(schemaExamples[0].schema)
    const snapshot = structuredClone(original)
    const changed = update('把A公司改成B公司', original)
    expect(changed.stocks).toEqual(['B'])
    expect(update('把 A 公司换成 B 公司', original).stocks).toEqual(['B'])
    expect(changed.title).toContain('B 公司')
    expect(changed.analysis).toEqual(original.analysis)
    const compared = update('增加B公司进行对比', original)
    expect(compared.stocks).toEqual(['A', 'B'])
    expect(compared.charts.map(chart => chart.metric)).toEqual(['relativePrice', 'volume'])
    expect(compared.analysis).toContainEqual({ type: 'periodChange', display: 'comparison', unit: '%' })
    const result = analyzeDashboard(compared)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.charts[0].series.map(series => series.values[0])).toEqual([100, 100])
    expect(applyFollowUp('增加A公司进行对比', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('已在') })
    expect(applyFollowUp('改成C公司', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('仅支持') })
    expect(applyFollowUp('改成B公司', compared)).toMatchObject({ kind: 'error', message: expect.stringContaining('多家公司') })
    expect(original).toEqual(snapshot)
  })

  it('识别公司简称、大小写、礼貌语及换成等表达，不忽略额外要求', () => {
    const original = structuredClone(schemaExamples[0].schema)
    const snapshot = structuredClone(original)
    for (const text of ['把a公司换成b', '请把 A 换成 B 公司吧。', '将a股票替换为b', '换成b', '切换到B公司', '改为b']) {
      const next = update(text, original)
      expect(next.stocks, text).toEqual(['B'])
      expect(next.timeRange).toEqual(original.timeRange)
      expect(next.charts).toEqual(original.charts)
      expect(analyzeDashboard(next).success).toBe(true)
    }
    expect(update('增加b对比', original).stocks).toEqual(['A', 'B'])
    expect(applyFollowUp('把a换成c', original)).toMatchObject({ kind: 'error', message: expect.stringContaining('仅支持') })
    expect(applyFollowUp('换成b', schemaExamples[4].schema)).toMatchObject({ kind: 'error', message: expect.stringContaining('多家公司') })
    expect(applyFollowUp('把a公司换成b并增加收益预测', original).kind).toBe('error')
    expect(original).toEqual(snapshot)
  })

  it('指标、图表和时间追问接受常见换成表达', () => {
    const original = structuredClone(schemaExamples[0].schema)
    expect(update('请将成交量换成涨跌幅吧', original).charts.map(chart => chart.metric)).toEqual(['price', 'dailyChange'])
    expect(update('把股价图替换为柱状图', original).charts[0].type).toBe('bar')
    expect(update('换成近10个交易日', original).timeRange.count).toBe(10)
  })

  it('关键词文档中的连续追问可依次计算，非法范围不覆盖有效配置', () => {
    let current = structuredClone(schemaExamples[0].schema)
    for (const text of ['成交量改为涨跌幅', '把涨跌幅图改成折线图', '增加最高价和最低价', '跌幅排名改为前5名', '增加B公司进行对比']) {
      current = update(text, current)
      expect(analyzeDashboard(current).success).toBe(true)
    }
    expect(current.stocks).toEqual(['A', 'B'])
    expect(current.charts.map(chart => chart.metric)).toEqual(['relativePrice', 'dailyChange'])
    expect(current.charts[1].type).toBe('line')
    expect(current.analysis).toContainEqual({ type: 'largestDeclines', count: 5, display: 'ranking' })
    const snapshot = structuredClone(current)
    expect(applyFollowUp('改为最近61个交易日', current).kind).toBe('error')
    expect(current).toEqual(snapshot)
    const final = update('改为最近10个交易日', current)
    const result = analyzeDashboard(final)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.stocks.every(stock => stock.rows.length === 10)).toBe(true)
  })
})
