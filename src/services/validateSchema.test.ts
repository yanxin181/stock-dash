import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { validateDashboardSchema } from './validateSchema'

const valid = () => structuredClone(schemaExamples[0].schema)
const paths = (input: unknown) => {
  const result = validateDashboardSchema(input)
  expect(result.success).toBe(false)
  return result.success ? [] : result.errors.map(error => error.path)
}

describe('看板 Schema 运行时校验', () => {
  it('接受全部五条预期配置，并返回可用的类型化数据', () => {
    for (const { schema } of schemaExamples) {
      const result = validateDashboardSchema(schema)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data).toEqual(schema)
    }
  })
  it('拒绝非对象、缺失字段和错误类型，并收集多个字段错误', () => {
    expect(paths(null)).toContain('$')
    expect(paths([])).toContain('$')
    const result = validateDashboardSchema({ title: '', stocks: [], timeRange: null, charts: [], analysis: null, dataAsOf: '2026-02-30' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.errors.map(e => e.path)).toEqual(expect.arrayContaining(['title', 'stocks', 'timeRange', 'charts', 'analysis', 'dataSource', 'dataAsOf']))
  })
  it('检查股票、交易日范围和数值类型', () => {
    for (const value of [0, 1, 61, 2.5, '30', null, NaN, Infinity]) {
      const schema = valid() as unknown as Record<string, unknown>
      schema.timeRange = { type: 'tradingDays', count: value }
      expect(paths(schema)).toContain('timeRange.count')
    }
    const schema = valid() as unknown as Record<string, unknown>
    schema.stocks = ['C', 'C']
    schema.timeRange = { type: 'calendarDays', count: 30 }
    expect(paths(schema)).toEqual(expect.arrayContaining(['stocks[0]', 'stocks[1]', 'stocks', 'timeRange.type']))
  })
  it('检查指标、图表类型、单位和相对走势基准', () => {
    const schema = valid() as unknown as Record<string, unknown>
    schema.charts = [
      { title: 'x', metric: 'unknown', type: 'pie', unit: '元' },
      { title: 'x', metric: 'volume', type: 'bar', unit: '元' },
      { title: 'x', metric: 'relativePrice', type: 'bar', unit: '基准点', base: 0 },
      null,
    ]
    expect(paths(schema)).toEqual(expect.arrayContaining(['charts[0].metric', 'charts[0].type', 'charts[1].unit', 'charts[2].type', 'charts[2].base', 'charts[3]']))
  })
  it('校验各类分析配置和排名数量', () => {
    const schema = valid() as unknown as Record<string, unknown>
    schema.analysis = [
      { type: 'priceExtrema', marks: ['highest', 'highest'] },
      { type: 'largestGain', count: 2, display: 'ranking' },
      { type: 'largestDeclines', count: -1, display: 'ranking' },
      { type: 'highestVolume', count: '3', display: 'other' },
      { type: 'periodChange', display: 'mark', unit: '元' },
      { type: 'unknown' },
    ]
    expect(paths(schema)).toEqual(expect.arrayContaining(['analysis[0].marks', 'analysis[1].count', 'analysis[1].display', 'analysis[2].count', 'analysis[3].count', 'analysis[3].display', 'analysis[4].unit', 'analysis[4].display', 'analysis[5].type']))
  })
  it('允许分析列表为空及实际下跌天数不足的排名配置', () => {
    const schema = valid()
    schema.analysis = []
    expect(validateDashboardSchema(schema).success).toBe(true)
    schema.analysis = [{ type: 'largestDeclines', count: 100, display: 'ranking' }]
    expect(validateDashboardSchema(schema).success).toBe(true)
  })
})
