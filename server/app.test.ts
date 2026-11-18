import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import { createApp, type ModelConfig } from './app'
import { schemaExamples } from '../src/examples/schemas'
import { requestModelSchema } from '../src/services/modelSchema'
import { analyzeDashboard } from '../src/services/analyzeDashboard'

const config: ModelConfig = { apiKey: 'secret-test-key', baseUrl: 'https://example.test/v1', model: 'qwen3.7-flash', timeoutMs: 30 }
const envelope = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] }), { status: 200 })
let server: Server
let base: string
async function start(overrides: Partial<ModelConfig> = {}, upstream: typeof fetch = vi.fn(async () => envelope({ kind: 'clarification', message: '请补充需求' })) as typeof fetch) {
  server = await new Promise<Server>(resolve => { const s = createApp({ ...config, ...overrides }, upstream).listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
beforeEach(() => { vi.restoreAllMocks() })
afterEach(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })

describe('本地模型接口', () => {
  it('使用千问兼容接口并返回结构化响应，不暴露密钥', async () => {
    const upstream = vi.fn(async () => envelope({ kind: 'clarification', message: '请补充股票' }))
    await start({}, upstream as typeof fetch)
    const response = await post('/api/schema', { input: '分析股价' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'clarification', message: '请补充股票' })
    expect(upstream.mock.calls[0][0]).toBe('https://example.test/v1/chat/completions')
    const options = upstream.mock.calls[0][1] as RequestInit
    expect(JSON.parse(options.body as string).model).toBe('qwen3.7-flash')
    expect(JSON.stringify(await post('/api/schema', { input: '' }).then(r => r.json()))).not.toContain(config.apiKey)
  })
  it('未配置密钥时给出明确提示', async () => {
    await start({ apiKey: undefined })
    const response = await post('/api/schema', { input: '分析 A 公司' })
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('CONFIG_MISSING')
  })
  it('请求超时返回明确错误', async () => {
    const upstream: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    await start({}, upstream)
    const response = await post('/api/schema', { input: '分析 A 公司' })
    expect(response.status).toBe(504)
    expect((await response.json()).error.code).toBe('TIMEOUT')
  })
  it('拒绝无效模型 JSON 和不存在的事实引用', async () => {
    const upstream = vi.fn().mockResolvedValueOnce(envelope('not json')).mockResolvedValueOnce(envelope({ factIds: ['unknown'] }))
    await start({}, upstream as typeof fetch)
    expect((await post('/api/schema', { input: '分析 A 公司' })).status).toBe(502)
    expect((await post('/api/conclusion', { facts: [{ id: '1', text: 'A 上涨 1%' }] })).status).toBe(502)
  })
  it('接受结论事实引用并拒绝非法输入和跨站来源', async () => {
    await start({}, vi.fn(async () => envelope({ factIds: ['1'] })) as typeof fetch)
    expect(await (await post('/api/conclusion', { facts: [{ id: '1', text: 'A 上涨 1%' }] })).json()).toEqual({ factIds: ['1'] })
    expect((await post('/api/schema', { input: 'x'.repeat(2001) })).status).toBe(400)
    expect((await post('/api/schema', { input: '分析 A' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await post('/api/schema', { input: 'x'.repeat(40000) })).status).toBe(413)
  })
  it('拒绝结论结果中包含模型添加的文字或不在事实中的引用', async () => {
    const upstream = vi.fn().mockResolvedValueOnce(envelope({ factIds: ['1'], text: '股价上涨 999%' })).mockResolvedValueOnce(envelope({ factIds: ['2'] }))
    await start({}, upstream as typeof fetch)
    const facts = [{ id: '1', text: 'A 公司 2026-01-30 的收盘价为 1 元。' }]
    expect((await post('/api/conclusion', { facts })).status).toBe(502)
    expect((await post('/api/conclusion', { facts })).status).toBe(502)
  })
  it('处理额度、鉴权和网络失败而不泄露上游内容', async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response('secret-test-key', { status: 429 })).mockResolvedValueOnce(new Response('secret-test-key', { status: 401 })).mockRejectedValueOnce(new Error('secret-test-key'))
    await start({}, upstream as typeof fetch)
    for (const [status, code] of [[429, 'QUOTA_OR_RATE_LIMIT'], [502, 'AUTH_FAILED'], [502, 'NETWORK_ERROR']] as const) {
      const response = await post('/api/schema', { input: '分析 A' })
      const body = await response.text()
      expect(response.status).toBe(status)
      expect(body).toContain(code)
      expect(body).not.toContain('secret-test-key')
    }
  })
  it('五条示例经过前端、后端和模拟模型后生成有效看板', async () => {
    const upstream = vi.fn(async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(init.body as string)
      const user = JSON.parse(request.messages[1].content)
      const example = schemaExamples.find(item => item.instruction === user.input)!
      return envelope({ kind: 'schema', schema: example.schema })
    })
    await start({}, upstream as typeof fetch)
    const localFetch: typeof fetch = (input, init) => fetch(base + String(input), init)
    for (const example of schemaExamples) {
      const schema = await requestModelSchema(example.instruction, localFetch)
      expect(schema).toEqual(example.schema)
      expect(analyzeDashboard(schema).success).toBe(true)
    }
    const request = JSON.parse((upstream.mock.calls[0][1] as RequestInit).body as string)
    expect(request.messages[0].content).toContain('largestDeclines')
    expect(request.messages[0].content).toContain(schemaExamples[4].instruction)
    expect(request.messages[0].content).not.toContain('2025-11-07')
  })
  it('将当前有效 Schema 传给模型，并拒绝未分类和无效的追问结果', async () => {
    const current = schemaExamples[0].schema
    const candidate = { ...structuredClone(current), timeRange: { type: 'tradingDays', count: 10 } }
    const upstream = vi.fn().mockResolvedValueOnce(envelope({ kind: 'schema', intent: 'followup', schema: candidate })).mockResolvedValueOnce(envelope({ kind: 'schema', schema: candidate }))
    await start({}, upstream as typeof fetch)
    const response = await post('/api/schema', { input: '时间缩短到十天', currentSchema: current })
    expect(response.status).toBe(200)
    const sent = JSON.parse((upstream.mock.calls[0][1] as RequestInit).body as string)
    expect(JSON.parse(sent.messages[1].content)).toEqual({ input: '时间缩短到十天', currentSchema: current })
    expect(sent.messages[0].content).toContain('保留用户未要求改变')
    expect((await post('/api/schema', { input: '修改', currentSchema: current })).status).toBe(502)
    expect((await post('/api/schema', { input: '修改', currentSchema: { ...current, stocks: ['C'] } })).status).toBe(400)
  })
})
