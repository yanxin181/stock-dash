import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { validateDashboardSchema } from '../src/services/validateSchema.js'
import { schemaPrompt } from './schemaPrompt.js'
import { fetchWencaiQuotes, WencaiError } from './wencai.js'

export interface ModelConfig { apiKey?: string; baseUrl: string; model: string; timeoutMs: number; wencaiApiKey?: string }
type Fetch = typeof fetch
type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

async function readLimited(response: globalThis.Response): Promise<string> {
  if (!response.body) throw new ApiError(502, 'INVALID_RESPONSE', '模型返回了空响应。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0, text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 128 * 1024) { await reader.cancel(); throw new ApiError(502, 'INVALID_RESPONSE', '模型响应过大。') }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

async function requestModel(config: ModelConfig, system: string, payload: unknown, fetchImpl: Fetch): Promise<unknown> {
  if (!config.apiKey) throw new ApiError(503, 'CONFIG_MISSING', '尚未配置百炼 API Key，请在后端环境变量中设置 DASHSCOPE_API_KEY。')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }], response_format: { type: 'json_object' } }),
    })
    if (!response.ok) {
      if (response.status === 429 || response.status === 402) throw new ApiError(429, 'QUOTA_OR_RATE_LIMIT', '模型额度不足或请求过于频繁，请检查百炼额度并稍后重试。')
      if (response.status === 401 || response.status === 403) throw new ApiError(502, 'AUTH_FAILED', '模型服务鉴权失败，请检查 API Key、地域和模型权限。')
      throw new ApiError(502, 'UPSTREAM_ERROR', '模型服务暂时不可用，请检查模型配置后重试。')
    }
    let envelope: unknown
    try { envelope = JSON.parse(await readLimited(response)) } catch (error) {
      if (error instanceof ApiError) throw error
      if (controller.signal.aborted) throw new ApiError(504, 'TIMEOUT', '模型请求超时，请稍后重试。')
      throw new ApiError(502, 'INVALID_RESPONSE', '模型返回了无效响应。')
    }
    const choices = isObject(envelope) ? envelope.choices : undefined
    const first = Array.isArray(choices) ? choices[0] : undefined
    const message = isObject(first) ? first.message : undefined
    const content = isObject(message) ? message.content : undefined
    if (typeof content !== 'string') throw new ApiError(502, 'INVALID_RESPONSE', '模型响应缺少有效内容。')
    try { return JSON.parse(content) } catch { throw new ApiError(502, 'INVALID_RESPONSE', '模型没有返回有效 JSON。') }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new ApiError(504, 'TIMEOUT', '模型请求超时，请稍后重试。')
    throw new ApiError(502, 'NETWORK_ERROR', '无法连接模型服务，请检查网络和服务地址。')
  } finally { clearTimeout(timer) }
}

export function createApp(config: ModelConfig, fetchImpl: Fetch = fetch) {
  const app = express()
  app.disable('x-powered-by')
  // 仅接受来自本机网页的调用，避免其他网站借用本地服务发起模型请求。
  app.use((req, res, next) => {
    const host = req.hostname.toLowerCase()
    const origin = req.get('origin')
    let localOrigin = !origin
    if (origin) { try { const url = new URL(origin); localOrigin = ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) } catch { localOrigin = false } }
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) || !localOrigin) return res.status(403).json({ error: { code: 'FORBIDDEN', message: '仅允许本机访问。' } })
    next()
  })
  app.use(express.json({ limit: '32kb', strict: true }))
  app.post('/api/schema', async (req, res, next) => {
    try {
      if (!isObject(req.body) || !boundedText(req.body.input, 2000) || Object.keys(req.body).some(k => !['input', 'currentSchema'].includes(k))) throw new ApiError(400, 'INVALID_INPUT', '请输入不超过 2000 字的需求。')
      if (req.body.currentSchema !== undefined && !validateDashboardSchema(req.body.currentSchema).success) throw new ApiError(400, 'INVALID_INPUT', '当前看板 Schema 无效。')
      const result = await requestModel(config, schemaPrompt, req.body, fetchImpl)
      if (!isObject(result) || !((result.kind === 'schema' && isObject(result.schema)) || (result.kind === 'clarification' && boundedText(result.message, 1000)))) throw new ApiError(502, 'INVALID_RESPONSE', '模型返回的 Schema 响应格式无效。')
      if (result.kind === 'schema' && req.body.currentSchema !== undefined && result.intent !== 'new' && result.intent !== 'followup') throw new ApiError(502, 'INVALID_RESPONSE', '模型没有明确区分新需求和追问。')
      res.json(result)
    } catch (error) { next(error) }
  })
  app.post('/api/wencai/quotes', async (req, res, next) => {
    try {
      const quotes = await fetchWencaiQuotes(req.body, config.wencaiApiKey, fetchImpl)
      res.json({ source: '同花顺问财', priceBasis: '未确认', volumeUnit: '未确认', quotes })
    } catch (error) { next(error) }
  })
  app.post('/api/conclusion', async (req, res, next) => {
    try {
      if (!isObject(req.body) || Object.keys(req.body).some(k => k !== 'facts') || !Array.isArray(req.body.facts) || req.body.facts.length < 1 || req.body.facts.length > 50 || !req.body.facts.every((fact: unknown) => isObject(fact) && boundedText(fact.id, 100) && boundedText(fact.text, 500) && Object.keys(fact).every(k => ['id', 'text'].includes(k)))) throw new ApiError(400, 'INVALID_INPUT', '请提供 1 至 50 条含 id 和 text 的精简事实。')
      if (new Set(req.body.facts.map((fact: JsonObject) => fact.id)).size !== req.body.facts.length) throw new ApiError(400, 'INVALID_INPUT', '事实 ID 不能重复。')
      const result = await requestModel(config, '为看板结论安排事实 ID 的顺序，覆盖给定的全部公司、图表和分析结果。优先呈现整体区间变化，再呈现分布、排名和其他细节。每个 ID 只出现一次，返回且仅返回 JSON：{"factIds":["事实ID"]}。不得改写或合并事实，不得输出额外字段、解释、预测、原因或建议。', req.body, fetchImpl)
      const ids = new Set(req.body.facts.map((fact: JsonObject) => fact.id))
      if (!isObject(result) || Object.keys(result).length !== 1 || !Array.isArray(result.factIds) || result.factIds.length < 1 || result.factIds.length > ids.size || !result.factIds.every((id: unknown) => typeof id === 'string' && ids.has(id)) || new Set(result.factIds).size !== result.factIds.length) throw new ApiError(502, 'INVALID_RESPONSE', '模型返回的事实引用无效。')
      res.json(result)
    } catch (error) { next(error) }
  })
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof WencaiError) return res.status(error.status).json({ error: { code: error.code, message: error.message } })
    if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code, message: error.message } })
    if (isObject(error) && error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: '请求内容过大。' } })
    if (isObject(error) && error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求 JSON 格式无效。' } })
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务处理失败，请稍后重试。' } })
  })
  return app
}
