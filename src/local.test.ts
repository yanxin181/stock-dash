import { describe, expect, it } from 'vitest'
import { answer, data, parseQuery } from './local'
describe('本地分析', () => {
  it('解析需求并使用固定数据计算结果', () => {
    const q = parseQuery('分析 A 公司最近 30 个交易日的股价和成交量')
    expect(q).toEqual({ stocks: ['A'], days: 30, metrics: ['price', 'volume'] })
    expect(answer(q)).toContain(data.A.at(-1)!.price.toFixed(2))
    expect(answer(q)).toBe(answer(q))
  })
  it('拒绝不支持的范围并保留有效查询供追问', () => {
    expect(() => parseQuery('分析 A 公司最近 100 个交易日的股价')).toThrow()
    const previous = parseQuery('分析 A 公司最近 30 个交易日的股价和成交量')
    expect(parseQuery('改为最近 10 个交易日', previous).days).toBe(10)
    expect(parseQuery('把成交量改成涨跌幅', previous).metrics).toEqual(['price', 'change'])
  })
})
