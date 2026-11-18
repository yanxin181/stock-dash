import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import type { StockRecord } from '../types/stock'
import { analyzeDashboard } from './analyzeDashboard'
import { applyFollowUp } from './followUp'
import { parseInstruction } from './parseInstruction'
import { validateDashboardSchema } from './validateSchema'

const records: StockRecord[] = [
  { stock: 'A', date: '2026-01-01', close: 10, volume: 10 },
  { stock: 'A', date: '2026-01-02', close: 20, volume: 20 },
  { stock: 'A', date: '2026-01-03', close: 30, volume: 30 },
  { stock: 'A', date: '2026-01-04', close: 40, volume: 40 },
  { stock: 'A', date: '2026-01-05', close: 50, volume: 50 },
  { stock: 'A', date: '2026-01-06', close: 50, volume: 60 },
  { stock: 'A', date: '2026-01-07', close: 25, volume: 70 },
]
const makeSchema = (days = 3) => ({ ...structuredClone(schemaExamples[5].schema), timeRange: { type: 'tradingDays' as const, count: days }, dataAsOf: '2026-01-07' })

describe('均线与新增图表', () => {
  it('解析自然语言并生成指定的三种视图', () => {
    const parsed = parseInstruction(schemaExamples[5].instruction)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.schema.charts).toEqual(schemaExamples[5].schema.charts)
  })
  it('使用区间外历史计算均线，图表和统计来自同一批交易日', () => {
    const result = analyzeDashboard(makeSchema(), records)
    expect(result.success).toBe(true)
    if (!result.success) return
    const [line, donut, scatter] = result.data.charts
    expect(line.series[0].values).toEqual([50, 50, 25])
    expect(line.series[0].ma5).toEqual([30, 38, 39])
    expect(donut.series[0].distribution).toEqual({ rise: 1, fall: 1, flat: 1, missing: 0 })
    expect(scatter.series[0].scatter).toEqual([
      { date: '2026-01-05', volume: 50, change: 25 },
      { date: '2026-01-06', volume: 60, change: 0 },
      { date: '2026-01-07', volume: 70, change: -50 },
    ])
  })
  it('不足 5 条时不伪造均线；前值缺失或为零时不纳入分布和散点', () => {
    const zeros: StockRecord[] = [
      { stock: 'A', date: '2026-01-01', close: 0, volume: 5 },
      { stock: 'A', date: '2026-01-02', close: 10, volume: 6 },
      { stock: 'A', date: '2026-01-03', close: 10, volume: 7 },
    ]
    const result = analyzeDashboard(makeSchema(3), zeros)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.charts[0].series[0].ma5).toEqual([null, null, null])
    expect(result.data.charts[1].series[0].distribution).toEqual({ rise: 0, fall: 0, flat: 1, missing: 2 })
    expect(result.data.charts[2].series[0].scatter).toEqual([{ date: '2026-01-03', volume: 7, change: 0 }])
    expect(result.data.warnings.join(' ')).toContain('不足 5 条')
    expect(result.data.warnings.join(' ')).toContain('2 个交易日')
  })
  it('拒绝不匹配的图表类型、单位及均线配置', () => {
    const invalid = [
      { title: '涨跌天数', metric: 'changeDistribution', type: 'bar', unit: '天' },
      { title: '量价关系', metric: 'volumeChange', type: 'scatter', unit: '%' },
      { title: '均线', metric: 'price', type: 'bar', unit: '元', ma5: true },
    ]
    for (const chart of invalid) expect(validateDashboardSchema({ ...makeSchema(), charts: [chart] }).success).toBe(false)
  })
  it('不能在追问中将带均线的图表静默改成柱状图', () => {
    const current = makeSchema()
    const result = applyFollowUp('把股价图改成柱状图', current)
    expect(result.kind).toBe('error')
    if (result.kind === 'error') expect(result.message).toContain('均线')
  })
})
