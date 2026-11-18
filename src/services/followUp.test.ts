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
})
