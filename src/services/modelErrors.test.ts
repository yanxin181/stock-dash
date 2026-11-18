import { describe, expect, it, vi } from 'vitest'
import { requestModelSchema } from './modelSchema'
import { generateModelConclusion } from './modelConclusion'
import { schemaExamples } from '../examples/schemas'
import { analyzeDashboard } from './analyzeDashboard'

const cases = [
  ['INVALID_INPUT', '输入无效'], ['CONFIG_MISSING', 'API Key'], ['AUTH_FAILED', '鉴权失败'],
  ['QUOTA_OR_RATE_LIMIT', '额度不足'], ['TIMEOUT', '超时'], ['NETWORK_ERROR', '网络'],
  ['INVALID_RESPONSE', '格式无效'],
] as const
describe('模型请求错误分类', () => {
  it.each(cases)('解析阶段区分 %s，不泄露服务端文本', async (code, message) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'secret-test-key' } }), { status: 502 })) as typeof fetch
    await expect(requestModelSchema('分析 A 公司', fetchMock)).rejects.toThrow(message)
    try { await requestModelSchema('分析 A 公司', fetchMock) } catch (error) { expect(String(error)).not.toContain('secret-test-key') }
  })
  it.each(cases)('结论阶段保留模板并提示 %s', async (code, message) => {
    const computed = analyzeDashboard(schemaExamples[0].schema)
    if (!computed.success) throw new Error(computed.message)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'secret-test-key' } }), { status: 502 })) as typeof fetch
    const output = await generateModelConclusion(computed.data, fetchMock)
    expect(output.notice).toContain(message)
    expect(output.notice).toContain('模板结论')
    expect(output.notice).not.toContain('secret-test-key')
    expect(output.conclusions).toEqual(computed.data.conclusions)
  })
  it('后端关闭或开发代理报错时提示启动后端', async () => {
    const offline = vi.fn().mockRejectedValue(new Error('connection refused')) as typeof fetch
    const proxyError = vi.fn(async () => new Response('', { status: 500 })) as typeof fetch
    for (const fetchMock of [offline, proxyError]) await expect(requestModelSchema('测试', fetchMock)).rejects.toThrow('后端')
  })
})
