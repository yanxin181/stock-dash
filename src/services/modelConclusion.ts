import type { DashboardResult } from '../types/analysis'
import { ModelRequestError, readModelResponse } from './modelErrors'

export interface ConclusionFact { id: string; text: string }
export interface ConclusionResult { conclusions: string[]; usedModel: boolean; notice?: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const metricNames = { price: '收盘价', volume: '成交量', dailyChange: '每日涨跌幅', relativePrice: '相对股价' } as const
const metricUnits = { price: '元', volume: '万股', dailyChange: '%', relativePrice: '基准点' } as const

/** 只从同一次分析结果提取事实；不使用模型生成的标题、文字或数值。 */
export function extractConclusionFacts(result: DashboardResult): ConclusionFact[] {
  if (result.analyses.length) return result.analyses.map((analysis, index) => {
    const stock = result.stocks.find(item => item.stock === analysis.stock)!
    const first = stock.rows[0].date, last = stock.rows[stock.rows.length - 1].date
    return { id: `f${index + 1}`, text: `${first} 至 ${last}：${result.conclusions[index]}` }
  })
  const metric = result.schema.charts[0].metric
  return result.stocks.map((stock, index) => {
    const row = stock.rows[stock.rows.length - 1]
    const value = metric === 'price' ? row.close : metric === 'volume' ? row.volume : metric === 'dailyChange' ? row.dailyChange : row.relativePrice
    const text = value === null ? '无法计算' : `为 ${value.toFixed(2)}${metricUnits[metric] === '%' ? '%' : ` ${metricUnits[metric]}`}`
    return { id: `f${index + 1}`, text: `${stock.stock} 公司 ${row.date} 的${metricNames[metric]}${text}。` }
  })
}

/** 模型只可选择并排序事实，文字由程序生成；任何无法验证的输出都回退模板。 */
export async function generateModelConclusion(result: DashboardResult, fetchImpl: typeof fetch = fetch): Promise<ConclusionResult> {
  const fallback = (reason: string): ConclusionResult => ({ conclusions: result.conclusions, usedModel: false, notice: `${reason} 已保留新看板并使用程序生成的模板结论。` })
  try {
    const facts = extractConclusionFacts(result)
    if (!facts.length || facts.length > 50 || facts.some(fact => fact.text.length > 500)) return fallback('结论事实过多或过长，请简化分析需求后重试。')
    let response: Response
    try { response = await fetchImpl('/api/conclusion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts }) }) }
    catch { throw new ModelRequestError('BACKEND_UNAVAILABLE') }
    const body = await readModelResponse(response)
    if (!isObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.factIds) || !body.factIds.length || body.factIds.length > facts.length) throw new ModelRequestError('INVALID_RESPONSE')
    const byId = new Map(facts.map(fact => [fact.id, fact.text]))
    if (!body.factIds.every(id => typeof id === 'string' && byId.has(id)) || new Set(body.factIds).size !== body.factIds.length) throw new ModelRequestError('INVALID_RESPONSE')
    return { conclusions: body.factIds.map(id => byId.get(id)!), usedModel: true }
  } catch (error) { return fallback(error instanceof ModelRequestError ? error.message : '结论生成失败，请稍后重试。') }
}
