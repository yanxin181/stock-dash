import type { DashboardResult } from '../types/analysis'
import { ModelRequestError, readModelResponse } from './modelErrors'
import { describeAnalysis, describeChart } from './modelFacts'

export interface ConclusionFact { id: string; text: string }
export interface ConclusionResult { conclusions: string[]; usedModel: boolean; notice?: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** 只从同一次分析结果提取事实；不使用模型生成的标题、文字或数值。 */
export function extractConclusionFacts(result: DashboardResult): ConclusionFact[] {
  const texts = result.analyses.map((analysis, index) => {
    const stock = result.stocks.find(item => item.stock === analysis.stock)!
    return describeAnalysis(stock, analysis, result.conclusions[index])
  })
  for (const chart of result.charts) for (const stock of result.stocks) texts.push(describeChart(stock, chart))
  return texts.map((text, index) => ({ id: `f${index + 1}`, text }))
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
    const selected = new Set(body.factIds)
    const ordered = [...body.factIds, ...facts.filter(fact => !selected.has(fact.id)).map(fact => fact.id)]
    return { conclusions: ordered.map(id => byId.get(id)!), usedModel: true }
  } catch (error) { return fallback(error instanceof ModelRequestError ? error.message : '结论生成失败，请稍后重试。') }
}
