import { describe, expect, it, vi } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { analyzeDashboard } from './analyzeDashboard'
import { extractConclusionFacts, generateModelConclusion } from './modelConclusion'

function result(index: number) {
  const computed = analyzeDashboard(schemaExamples[index].schema)
  if (!computed.success) throw new Error(computed.message)
  return computed.data
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const mock = (value: unknown, status = 200) => vi.fn(async () => json(value, status)) as unknown as typeof fetch

describe('基于计算事实的模型结论', () => {
  it('从同一次分析生成含公司、日期、数值及单位的事实，按模型选择顺序组装', async () => {
    const data = result(4)
    const facts = extractConclusionFacts(data)
    expect(facts).toHaveLength(2)
    expect(facts[0].text).toContain('A 公司')
    expect(facts[1].text).toContain('B 公司')
    for (const fact of facts) { expect(fact.text).toMatch(/\d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2}/); expect(fact.text).toMatch(/[-+]?\d+\.\d{2}%/) }
    const fetchMock = mock({ factIds: ['f2', 'f1'] })
    const response = await generateModelConclusion(data, fetchMock)
    expect(response).toEqual({ usedModel: true, conclusions: [facts[1].text, facts[0].text] })
    expect(JSON.parse(vi.mocked(fetchMock).mock.calls[0][1]!.body as string)).toEqual({ facts })
  })
  it('没有分析项时从图表对应的数据生成事实，不采信模型提供的图表标题', () => {
    const data = result(1)
    data.analyses = []
    data.schema.charts[0].title = '股价明天必涨，建议买入'
    const facts = extractConclusionFacts(data)
    const row = data.stocks[0].rows.at(-1)!
    expect(facts[0].text).toBe(`B 公司 ${row.date} 的收盘价为 ${row.close.toFixed(2)} 元。`)
    expect(facts[0].text).not.toContain('建议')
  })
  it.each([
    { factIds: ['missing'] },
    { factIds: ['f1', 'f1'] },
    { factIds: [] },
    { factIds: ['f1'], text: 'A 公司上涨 999%' },
    { factIds: ['f1'], direction: '上涨' },
    { factIds: ['f1'], stock: 'C' },
    { factIds: ['f1'], date: '2099-01-01' },
    { text: '自由文本：建议购买' },
  ])('拒绝无法验证或混入自由文本的模型响应 %#', async (payload) => {
    const data = result(4)
    const output = await generateModelConclusion(data, mock(payload))
    expect(output.usedModel).toBe(false)
    expect(output.conclusions).toEqual(data.conclusions)
    expect(output.notice).toContain('模板结论')
  })
  it('请求失败、错误状态和无效 JSON 保留模板结论', async () => {
    const data = result(0)
    const requests = [vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch, mock({}, 503), vi.fn(async () => new Response('not JSON')) as typeof fetch]
    for (const fetchMock of requests) {
      const output = await generateModelConclusion(data, fetchMock)
      expect(output.conclusions).toEqual(data.conclusions)
      expect(output.usedModel).toBe(false)
      expect(output.notice).toContain('模板结论')
    }
  })
})
