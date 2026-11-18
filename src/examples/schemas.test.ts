import { describe, expect, it } from 'vitest'
import { DATA_AS_OF, stockRecords } from '../data/stocks'
import { schemaExamples } from './schemas'

describe('步骤二：模拟数据与示例 Schema', () => {
  it('每家公司都有按日期升序排列的固定行情，并覆盖最长示例的前一交易日', () => {
    for (const stock of ['A', 'B'] as const) {
      const rows = stockRecords.filter(row => row.stock === stock)
      expect(rows.length).toBeGreaterThanOrEqual(31)
      expect(rows.at(-1)?.date).toBe(DATA_AS_OF)
      expect(new Set(rows.map(row => row.date)).size).toBe(rows.length)
      expect(rows.map(row => row.date)).toEqual(rows.map(row => row.date).sort())
      expect(rows.every(row => row.close > 0 && row.volume >= 0)).toBe(true)
    }
  })

  it('五条示例覆盖所需指标、分析及对比口径', () => {
    expect(schemaExamples.length).toBeGreaterThanOrEqual(5)
    const [one, two, three, four, five] = schemaExamples.map(example => example.schema)
    expect(one.charts.map(chart => chart.metric)).toEqual(['price', 'volume'])
    expect(one.analysis).toContainEqual({ type: 'largestDeclines', count: 3, display: 'ranking' })
    expect(two.analysis).toContainEqual({ type: 'priceExtrema', marks: ['highest', 'lowest'] })
    expect(three.charts[0]).toMatchObject({ metric: 'dailyChange', type: 'bar', unit: '%' })
    expect(three.analysis[0].type).toBe('largestGain')
    expect(four.analysis[0]).toMatchObject({ type: 'highestVolume', count: 3 })
    expect(five.stocks).toEqual(['A', 'B'])
    expect(five.charts[0]).toMatchObject({ metric: 'relativePrice', type: 'line', base: 100 })
    expect(five.analysis[0].type).toBe('periodChange')
    expect(schemaExamples.every(({ schema }) => schema.dataAsOf === DATA_AS_OF)).toBe(true)
  })
})
