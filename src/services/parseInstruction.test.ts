import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { validateDashboardSchema } from './validateSchema'
import { parseInstruction } from './parseInstruction'

describe('本地指令解析', () => {
  it('五条示例均生成预期的股票、时间、图表及分析配置', () => {
    for (const { instruction, schema: expected } of schemaExamples) {
      const result = parseInstruction(instruction)
      expect(result, instruction).toMatchObject({ success: true })
      if (!result.success) continue
      const actual = result.schema
      expect(actual.stocks).toEqual(expected.stocks)
      expect(actual.timeRange).toEqual(expected.timeRange)
      expect(actual.charts).toEqual(expected.charts)
      expect(actual.analysis).toEqual(expected.analysis)
      expect(actual.dataSource).toBe(expected.dataSource)
      expect(actual.dataAsOf).toBe(expected.dataAsOf)
      expect(validateDashboardSchema(actual).success).toBe(true)
      expect(parseInstruction(instruction)).toEqual(result)
    }
  })
  it('支持不同股票、时间、排名数量和明确指定的图表', () => {
    const result = parseInstruction('用折线图展示 B 公司最近 12 个交易日的成交量，并列出成交量最高的 5 个交易日。')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.schema.stocks).toEqual(['B'])
      expect(result.schema.timeRange.count).toBe(12)
      expect(result.schema.charts).toEqual([{ title: '成交量', metric: 'volume', type: 'line', unit: '万股' }])
      expect(result.schema.analysis).toEqual([{ type: 'highestVolume', count: 5, display: 'ranking' }])
    }
    const price = parseInstruction('用柱状图查看 A 公司近 10 个交易日的股价和最高价。')
    expect(price.success).toBe(true)
    if (price.success) expect(price.schema.charts[0]).toMatchObject({ metric: 'price', type: 'bar' })
  })
  it('识别股价最高最低与单日最大跌幅', () => {
    const extrema = parseInstruction('查看 B 公司最近 10 个交易日股价的最高和最低')
    expect(extrema.success).toBe(true)
    if (extrema.success) expect(extrema.schema.analysis).toContainEqual({ type: 'priceExtrema', marks: ['highest', 'lowest'] })
    const decline = parseInstruction('查看 A 公司最近 10 个交易日跌幅最大的交易日')
    expect(decline.success).toBe(true)
    if (decline.success) expect(decline.schema.charts[0].metric).toBe('dailyChange')
  })
  it('拒绝空、缺少关键信息和超出范围的输入', () => {
    for (const text of ['', '你好', '分析 A 公司股价', '查看 A 公司最近 61 个交易日的股价', '分析 A 公司最近 0 个交易日的股价']) {
      const result = parseInstruction(text)
      expect(result.success, text).toBe(false)
      if (!result.success) expect(result.message.length).toBeGreaterThan(0)
    }
  })
  it('拒绝混入不支持的股票、指标、图表和无法识别的附加要求', () => {
    for (const text of [
      '查看 C 公司最近 10 个交易日的股价',
      '查看 A 公司最近 10 个交易日的市盈率和股价',
      '用饼图展示 A 公司最近 10 个交易日的成交量',
      '分析 A 公司最近 30 个交易日的股价并预测未来走势',
      '对比 A 公司最近 10 个交易日的股价',
      '用柱状图对比 A 公司和 B 公司最近 10 个交易日的股价',
      '展示 A 公司最近 10 个交易日的股价和成交量最高的 0 个交易日',
    ]) expect(parseInstruction(text).success, text).toBe(false)
  })
})
