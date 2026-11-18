import { randomBytes } from 'node:crypto'

export class WencaiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
type Quote = { code: string; name: string; records: { date: string; close: number; volume: number }[] }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const validDate = (raw: string) => {
  const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  const date = new Date(`${formatted}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === formatted ? formatted : null
}
const positiveNumber = (value: unknown, zero = false): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null
  const num = Number(value)
  return Number.isFinite(num) && (zero ? num >= 0 : num > 0) ? num : null
}

/** 仅接受显式代码，绝不把自由文本直接拼入上游查询。 */
export async function fetchWencaiQuotes(input: unknown, apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<Quote[]> {
  if (!object(input) || Object.keys(input).some(key => !['stocks', 'count'].includes(key)) || !Array.isArray(input.stocks) || input.stocks.length < 1 || input.stocks.length > 2 || !input.stocks.every((code: unknown) => typeof code === 'string' && /^(?:\d{6})\.(?:SH|SZ|BJ)$/.test(code)) || new Set(input.stocks).size !== input.stocks.length || !Number.isInteger(input.count) || (input.count as number) < 2 || (input.count as number) > 60) throw new WencaiError(400, 'INVALID_INPUT', '请提供一到两个完整股票代码和 2 至 60 个交易日。')
  if (!apiKey) throw new WencaiError(503, 'WENCAI_CONFIG_MISSING', '尚未配置问财 API Key，请设置 IWENCAI_API_KEY。')
  const stocks = input.stocks as string[]
  const count = input.count as number
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetchImpl('https://openapi.iwencai.com/v1/query2data', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Claw-Call-Type': 'normal', 'X-Claw-Skill-Id': 'hithink-market-query', 'X-Claw-Skill-Version': '1.0.0', 'X-Claw-Plugin-Id': 'none', 'X-Claw-Plugin-Version': 'none', 'X-Claw-Trace-Id': randomBytes(32).toString('hex') },
      body: JSON.stringify({ query: `${stocks.join('和')}最近${count + 1}个交易日每日收盘价和成交量`, page: '1', limit: '10', is_cache: '1', expand_index: 'true' }),
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new WencaiError(502, 'WENCAI_AUTH', '问财鉴权失败或账号无权限，请检查问财 Key 和权限。')
      if (response.status === 429 || response.status === 402) throw new WencaiError(429, 'WENCAI_LIMIT', '问财请求受限或额度不足，请稍后重试。')
      throw new WencaiError(502, 'WENCAI_UPSTREAM', '问财服务返回错误，请稍后重试。')
    }
    const length = Number(response.headers.get('content-length'))
    if (length > 256 * 1024) throw new WencaiError(502, 'WENCAI_RESPONSE', '问财响应过大。')
    const reader = response.body?.getReader()
    if (!reader) throw new WencaiError(502, 'WENCAI_RESPONSE', '问财返回空响应。')
    const decoder = new TextDecoder(); let text = '', size = 0
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 256 * 1024) { await reader.cancel(); throw new WencaiError(502, 'WENCAI_RESPONSE', '问财响应过大。') }; text += decoder.decode(part.value, { stream: true }) }
    text += decoder.decode()
    let data: unknown
    try { data = JSON.parse(text) } catch { throw new WencaiError(502, 'WENCAI_RESPONSE', '问财返回了无效 JSON。') }
    if (!object(data) || !Array.isArray(data.datas) || data.datas.length !== stocks.length || data.code_count !== stocks.length) throw new WencaiError(502, 'WENCAI_DATA', '问财未返回全部指定股票，请核对代码及账号权限。')
    const result: Quote[] = []
    for (const item of data.datas) {
      if (!object(item) || typeof item['股票代码'] !== 'string' || !stocks.includes(item['股票代码']) || typeof item['股票简称'] !== 'string' || !item['股票简称'].trim() || item['股票简称'].length > 100 || result.some(row => row.code === item['股票代码'])) throw new WencaiError(502, 'WENCAI_DATA', '问财返回了无效或重复的股票标识。')
      const closes = new Map<string, number>(); const volumes = new Map<string, number>()
      for (const [key, value] of Object.entries(item)) {
        const match = /^(收盘价|成交量)\[(\d{8})\]$/.exec(key)
        if (!match) continue
        const date = validDate(match[2]); const number = positiveNumber(value, match[1] === '成交量')
        if (!date || number === null) throw new WencaiError(502, 'WENCAI_DATA', '问财返回无效日期、价格或成交量。')
        ;(match[1] === '收盘价' ? closes : volumes).set(date, number)
      }
      if (closes.size !== volumes.size || [...closes.keys()].some(date => !volumes.has(date))) throw new WencaiError(502, 'WENCAI_DATA', '问财收盘价与成交量日期不一致。')
      const records = [...closes].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close, volume: volumes.get(date)! }))
      if (records.length < count + 1 || records.length > 100) throw new WencaiError(502, 'WENCAI_DATA', '问财有效交易记录不足或超出限制。')
      result.push({ code: item['股票代码'], name: item['股票简称'], records: records.slice(-(count + 1)) })
    }
    return stocks.map(code => result.find(item => item.code === code)!)
  } catch (error) {
    if (error instanceof WencaiError) throw error
    if (controller.signal.aborted) throw new WencaiError(504, 'WENCAI_TIMEOUT', '问财请求超时，请稍后重试。')
    throw new WencaiError(502, 'WENCAI_NETWORK', '无法连接问财，请检查网络后重试。')
  } finally { clearTimeout(timer) }
}
