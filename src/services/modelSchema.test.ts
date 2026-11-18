import { describe, expect, it, vi } from 'vitest'
import { DATA_AS_OF, DATA_SOURCE } from '../data/stocks'
import { schemaExamples } from '../examples/schemas'
import { analyzeDashboard } from './analyzeDashboard'
import { requestModelSchema } from './modelSchema'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const mockResponse = (value: unknown, status = 200) => vi.fn(async () => json(value, status)) as unknown as typeof fetch

describe('模型首次需求处理', () => {
  it.each(schemaExamples)('使用固定模型结果生成示例看板：$instruction', async ({ instruction, schema }) => {
    const fetchMock = mockResponse({ kind: 'schema', schema: { ...schema, dataSource: '模型编造', dataAsOf: '2099-01-01' } })
    const result = await requestModelSchema(instruction, fetchMock)
    expect(result).toEqual(schema)
    expect(result.dataSource).toBe(DATA_SOURCE)
    expect(result.dataAsOf).toBe(DATA_AS_OF)
    expect(analyzeDashboard(result).success).toBe(true)
    expect(JSON.parse((vi.mocked(fetchMock).mock.calls[0][1] as RequestInit).body as string)).toEqual({ input: instruction })
  })
  it.each([
    ['不支持的股票', (schema: any) => { schema.stocks = ['C'] }, /仅支持 A、B/],
    ['不支持的指标', (schema: any) => { schema.charts[0].metric = 'PE' }, /不支持该指标/],
    ['不匹配的单位', (schema: any) => { schema.charts[0].unit = '%' }, /单位/],
    ['交易日范围缺失', (schema: any) => { delete schema.timeRange }, /时间范围/],
    ['标注没有对应图表', (schema: any) => { schema.charts = [{ title: '成交量', metric: 'volume', type: 'bar', unit: '万股' }]; schema.analysis = [{ type: 'priceExtrema', marks: ['highest'] }] }, /需要股价/],
  ])('拒绝%s', async (_label, mutate, expected) => {
    const candidate = structuredClone(schemaExamples[0].schema)
    mutate(candidate)
    await expect(requestModelSchema('测试', mockResponse({ kind: 'schema', schema: candidate }))).rejects.toThrow(expected)
  })
  it('缺失信息或不支持的需求返回模型澄清，不伪装成功', async () => {
    for (const message of ['请提供交易日范围', '仅支持 A、B 公司', '不支持市盈率']) {
      await expect(requestModelSchema('测试', mockResponse({ kind: 'clarification', message }))).rejects.toThrow(message)
    }
  })
  it('区分后端不可达、配置缺失和无效响应', async () => {
    await expect(requestModelSchema('测试', vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch)).rejects.toThrow('无法连接本地后端')
    await expect(requestModelSchema('测试', mockResponse({ error: { code: 'CONFIG_MISSING' } }, 503))).rejects.toThrow('API Key')
    await expect(requestModelSchema('测试', mockResponse({ kind: 'schema', schema: null }))).rejects.toThrow('格式无效')
    await expect(requestModelSchema('测试', vi.fn(async () => new Response('not json')) as typeof fetch)).rejects.toThrow('格式无效')
  })
})

describe('模型追问', () => {
  const original = schemaExamples[0].schema
  const changedDays = () => ({ ...structuredClone(original), title: 'A 公司近 10 个交易日股价与成交量', timeRange: { type: 'tradingDays' as const, count: 10 } })
  const changedMetric = () => ({ ...structuredClone(original), title: 'A 公司近 30 个交易日股价与每日涨跌幅', charts: [structuredClone(original.charts[0]), { title: '每日涨跌幅', metric: 'dailyChange' as const, type: 'bar' as const, unit: '%' as const }] })
  it.each([
    ['把成交量改成涨跌幅', changedMetric],
    ['把量换成每天涨跌', changedMetric],
    ['改为最近 10 个交易日', changedDays],
    ['时间缩短到十天', changedDays],
  ])('将当前 Schema 与“%s”发送并验证追问候选', async (input, makeCandidate) => {
    const snapshot = structuredClone(original)
    const candidate = makeCandidate()
    const fetchMock = mockResponse({ kind: 'schema', intent: 'followup', schema: candidate })
    const result = await requestModelSchema(input, fetchMock, undefined, original)
    expect(JSON.parse((vi.mocked(fetchMock).mock.calls[0][1] as RequestInit).body as string)).toEqual({ input, currentSchema: snapshot })
    expect(result).toEqual(candidate)
    expect(result.stocks).toEqual(snapshot.stocks)
    expect(result.analysis).toEqual(snapshot.analysis)
    expect(analyzeDashboard(result).success).toBe(true)
    expect(original).toEqual(snapshot)
  })
  it('新的完整需求可以取代旧配置，不沿用旧股票与图表', async () => {
    const fresh = schemaExamples[1].schema
    const result = await requestModelSchema(schemaExamples[1].instruction, mockResponse({ kind: 'schema', intent: 'new', schema: fresh }), undefined, original)
    expect(result).toEqual(fresh)
    expect(result.stocks).toEqual(['B'])
  })
  it('多张图表的模糊追问要求指明目标，不请求模型', async () => {
    const fetchMock = mockResponse({})
    await expect(requestModelSchema('改成柱状图', fetchMock, undefined, original)).rejects.toThrow('请指定')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('拒绝格式合法但额外改变股票或图表的追问结果', async () => {
    const unexpected = { ...changedDays(), stocks: ['B'] }
    await expect(requestModelSchema('时间缩短到十天', mockResponse({ kind: 'schema', intent: 'followup', schema: unexpected }), undefined, original)).rejects.toThrow('追问以外的条件')
    await expect(requestModelSchema('改为最近 10 个交易日', mockResponse({ kind: 'schema', intent: 'new', schema: changedDays() }), undefined, original)).rejects.toThrow('无法确认追问目标')
  })
  it('澄清、非法修改和模型故障都不修改当前配置', async () => {
    const snapshot = structuredClone(original)
    const invalid = { ...structuredClone(original), timeRange: { type: 'tradingDays', count: 100 } }
    const mocks = [mockResponse({ kind: 'clarification', message: '请说明要修改哪张图' }), mockResponse({ kind: 'schema', intent: 'followup', schema: invalid }), vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch, mockResponse({ kind: 'schema', schema: original })]
    for (const fetchMock of mocks) {
      await expect(requestModelSchema('修改', fetchMock, undefined, original)).rejects.toThrow()
      expect(original).toEqual(snapshot)
    }
  })
})
