import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { parseInstruction } from './parseInstruction'
import { analyzeDashboard } from './analyzeDashboard'
import type { StockRecord } from '../types/stock'
import type { DashboardSchema } from '../types/schema'

const records: StockRecord[] = [
  { stock: 'A', date: '2026-01-01', close: 100, volume: 8 },
  { stock: 'A', date: '2026-01-02', close: 110, volume: 9 },
  { stock: 'A', date: '2026-01-03', close: 99, volume: 7 },
  { stock: 'A', date: '2026-01-04', close: 99, volume: 10 },
  { stock: 'A', date: '2026-01-05', close: 500, volume: 1 }, // 截止日之后
  { stock: 'B', date: '2026-01-01', close: 50, volume: 8 },
  { stock: 'B', date: '2026-01-02', close: 100, volume: 9 },
  { stock: 'B', date: '2026-01-04', close: 110, volume: 10 },
]
const schema = (index: number, days = 3): DashboardSchema => ({ ...structuredClone(schemaExamples[index].schema), timeRange: { type: 'tradingDays', count: days }, dataAsOf: '2026-01-04' })
const run = (input: unknown, data: StockRecord[] = records) => {
  const result = analyzeDashboard(input, data)
  if (!result.success) throw new Error(result.message)
  return result.data
}

describe('数据筛选、计算与结论', () => {
  it('五条文档示例从解析到计算稳定完成', () => {
    for (const example of schemaExamples) {
      const parsed = parseInstruction(example.instruction)
      expect(parsed.success).toBe(true)
      if (!parsed.success) continue
      const a = analyzeDashboard(parsed.schema)
      expect(a.success).toBe(true)
      expect(analyzeDashboard(parsed.schema)).toEqual(a)
      if (a.success) {
        expect(a.data.charts.length).toBeGreaterThan(0)
        expect(a.data.conclusions.length).toBeGreaterThan(0)
      }
    }
  })
  it('排序并筛选截止日期，使用区间首日前一条数据计算每日涨跌幅', () => {
    const data = run(schema(0), [...records].reverse())
    const a = data.stocks[0]
    expect(a.rows.map(row => row.date)).toEqual(['2026-01-02', '2026-01-03', '2026-01-04'])
    expect(a.rows.map(row => row.dailyChange)).toEqual([10, -10, 0])
    expect(a.periodChange).toBeCloseTo(-10)
    expect(data.charts[0].series[0].values).toEqual([110, 99, 99])
    expect(data.analyses[0].points).toEqual([{ date: '2026-01-03', value: -10 }])
    expect(data.analyses[0].message).toContain('实际符合条件 1 条')
    expect(data.conclusions[0]).toContain('-10.00%')
  })
  it('最高最低、涨幅和成交量排名使用相同筛选数据', () => {
    const extrema = schema(1); extrema.stocks = ['A']
    const a = run(extrema)
    expect(a.analyses[0].points).toEqual([{ date: '2026-01-02', value: 110, label: 'highest' }, { date: '2026-01-03', value: 99, label: 'lowest' }])
    const gain = run(schema(2))
    expect(gain.analyses[0].points).toEqual([{ date: '2026-01-02', value: 10 }])
    expect(gain.charts[0].series[0].values).toEqual([10, -10, 0])
    const vol = schema(3); vol.stocks = ['A']
    const top = run(vol)
    expect(top.analyses[0].points.map(p => p.value)).toEqual([10, 9, 7])
    expect(top.charts[0].series[0].values).toEqual([9, 7, 10])
  })
  it('成交量排名结论比较区间均值和排名集中度，并与图表一致', () => {
    const input = schema(3); input.stocks = ['A']; input.analysis = [{ type: 'highestVolume', count: 2, display: 'ranking' }]
    const data = run(input)
    expect(data.charts[0].series[0].values).toEqual([9, 7, 10])
    expect(data.analyses[0].points).toEqual([{ date: '2026-01-04', value: 10 }, { date: '2026-01-02', value: 9 }])
    expect(data.conclusions[0]).toContain('区间日均成交量为 8.67 万股')
    expect(data.conclusions[0]).toContain('最高成交量为 10.00 万股（2026-01-04）')
    expect(data.conclusions[0]).toContain('比日均水平高 15.38%')
    expect(data.conclusions[0]).toContain('排名前 2 个交易日的成交量合计占区间总成交量的 73.08%')
  })
  it('成交量全为零时说明无法计算比例，数量不足时报告实际条数', () => {
    const input = schema(3); input.stocks = ['A']; input.analysis = [{ type: 'highestVolume', count: 5, display: 'ranking' }]
    const zeroRecords = records.filter(row => row.stock === 'A').map(row => ({ ...row, volume: 0 }))
    const data = run(input, zeroRecords)
    expect(data.conclusions[0]).toContain('区间日均成交量为 0.00 万股')
    expect(data.conclusions[0]).toContain('无法计算相对差异')
    expect(data.conclusions[0]).toContain('无法计算排名占比')
    expect(data.conclusions[0]).toContain('实际符合条件 3 条')
    expect(data.conclusions[0]).not.toMatch(/NaN|Infinity/)
  })
  it('双股票按日期对齐，缺失值为空且相对走势各自归一化', () => {
    const data = run(schema(4))
    expect(data.charts[0].dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'])
    expect(data.charts[0].series[0].values).toEqual([null, 100, 90, 90])
    expect(data.charts[0].series[1].values).toEqual([100, 200, null, 220.00000000000003])
    expect(data.analyses[0].periodChange).toBeCloseTo(-10)
    expect(data.analyses[1].periodChange).toBeCloseTo(120)
    expect(data.warnings.join()).toContain('缺失日期')
  })
  it('缺少前值、前值为零或区间首价为零时返回空值与提示', () => {
    const input = schema(2, 3)
    const zeros: StockRecord[] = [
      { stock: 'A', date: '2026-01-01', close: 0, volume: 2 },
      { stock: 'A', date: '2026-01-02', close: 10, volume: 3 },
      { stock: 'A', date: '2026-01-03', close: 9, volume: 4 },
    ]
    const data = run(input, zeros)
    expect(data.stocks[0].rows.map(r => r.dailyChange)).toEqual([null, null, -10])
    expect(data.analyses[0].points).toEqual([])
    expect(data.conclusions[0]).toContain('无符合条件')
    expect(data.warnings.join()).toContain('缺少有效前一日价格')
    const compare = schema(4); compare.stocks = ['A']
    const relative = run(compare, zeros)
    expect(relative.charts[0].series[0].values).toEqual([null, null, null])
    expect(relative.analyses[0].periodChange).toBeNull()
    expect(relative.conclusions[0]).toContain('无法计算')
  })
  it('对空数据、缺少股票、无效记录及非法 Schema 返回清晰错误', () => {
    expect(analyzeDashboard(schema(0), [])).toMatchObject({ success: false, stage: '处理数据' })
    expect(analyzeDashboard(schema(4), records.filter(r => r.stock === 'A'))).toMatchObject({ success: false, stage: '处理数据' })
    expect(analyzeDashboard(schema(0), [...records, records[0]])).toMatchObject({ success: false, stage: '处理数据' })
    expect(analyzeDashboard({})).toMatchObject({ success: false, stage: '校验 Schema' })
  })
})
