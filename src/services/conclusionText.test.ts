import { describe, expect, it } from 'vitest'
import { describeChangeDistribution } from './conclusionText'
import { analyzeDashboard } from './analyzeDashboard'
import { schemaExamples } from '../examples/schemas'
import { extractConclusionFacts } from './modelConclusion'

describe('涨跌分布结论', () => {
  it('使用有效交易日计算占比和天数差，并说明缺失值', () => {
    const text = describeChangeDistribution('B', { rise: 17, fall: 13, flat: 0, missing: 2 })
    expect(text).toContain('30 个有效交易日')
    expect(text).toContain('上涨 17 天（56.67%）')
    expect(text).toContain('下跌 13 天（43.33%）')
    expect(text).toContain('上涨日比下跌日多 4 天')
    expect(text).toContain('2 天涨跌幅不可计算，未计入占比')
  })
  it('正确处理下跌更多、数量相同和没有有效数据', () => {
    expect(describeChangeDistribution('A', { rise: 1, fall: 3, flat: 1, missing: 0 })).toContain('下跌日比上涨日多 2 天')
    expect(describeChangeDistribution('A', { rise: 1, fall: 1, flat: 2, missing: 0 })).toContain('上涨与下跌天数相同')
    const empty = describeChangeDistribution('A', { rise: 0, fall: 0, flat: 0, missing: 2 })
    expect(empty).toContain('没有可计算涨跌幅')
    expect(empty).not.toMatch(/NaN|Infinity|%/)
  })
  it('模型事实和本地模板共享图表统计数据', () => {
    const schema = { ...structuredClone(schemaExamples[5].schema), stocks: ['B'], charts: [structuredClone(schemaExamples[5].schema.charts[1])] }
    const result = analyzeDashboard(schema)
    expect(result.success).toBe(true)
    if (!result.success) return
    const distribution = result.data.charts[0].series[0].distribution!
    const template = result.data.conclusions[0]
    expect(template).toBe(describeChangeDistribution('B', distribution))
    expect(extractConclusionFacts(result.data)[0].text).toContain(template)
  })
})
