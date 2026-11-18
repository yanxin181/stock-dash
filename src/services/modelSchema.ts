import { DATA_AS_OF, DATA_SOURCE } from '../data/stocks'
import type { DashboardSchema } from '../types/schema'
import { validateDashboardSchema } from './validateSchema'
import { applyFollowUp } from './followUp'
import { ModelRequestError, readModelResponse } from './modelErrors'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const stable = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => isObject(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
export async function requestModelSchema(input: string, fetchImpl: typeof fetch = fetch, onCandidate?: () => void | Promise<void>, currentSchema?: DashboardSchema): Promise<DashboardSchema> {
  if (!input.trim() || input.length > 2000) throw new ModelRequestError('INVALID_INPUT')
  const compact = input.replace(/\s+/g, '').replace(/[。.!！?？]+$/, '').replace(/^(?:请|麻烦)/, '').replace(/(?:吧|呢|谢谢)$/, '')
  if (currentSchema && currentSchema.charts.length > 1 && /^(?:改|换|调整)(?:成|为|到)(?:柱状图|折线图)$/.test(compact)) throw new Error('当前看板有多张图，请指定要修改的指标或图表。')
  let response: Response
  try {
    response = await fetchImpl('/api/schema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input, ...(currentSchema ? { currentSchema } : {}) }) })
  } catch { throw new ModelRequestError('BACKEND_UNAVAILABLE') }
  const body = await readModelResponse(response)
  if (!isObject(body)) throw new ModelRequestError('INVALID_RESPONSE')
  if (body.kind === 'clarification' && typeof body.message === 'string' && body.message.trim() && body.message.length <= 1000) throw new Error(body.message)
  if (body.kind !== 'schema' || !isObject(body.schema)) throw new ModelRequestError('INVALID_RESPONSE')
  if (currentSchema && body.intent !== 'new' && body.intent !== 'followup') throw new Error('模型未能区分新需求和追问，请补充说明。')
  await onCandidate?.()
  const checked = validateDashboardSchema({ ...body.schema, dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF })
  if (!checked.success) throw new Error(`校验 Schema：${checked.errors.map(error => `${error.path}：${error.message}`).join('；')}`)
  // 对有明确、无歧义的已支持追问，再核对模型是否擅自修改其他条件。
  const aliases: Record<string, string> = { '把量换成每天涨跌': '把成交量改成涨跌幅', '时间缩短到十天': '改为最近10个交易日' }
  const canonical = aliases[compact] ?? compact
  if (currentSchema && (canonical === '把成交量改成涨跌幅' || canonical === '改为最近10个交易日')) {
    const expected = applyFollowUp(canonical, currentSchema)
    if (expected.kind === 'error') throw new Error(expected.message)
    if (expected.kind !== 'success' || body.intent !== 'followup') throw new Error('无法确认追问目标，请明确说明要修改的内容。')
    const compare = (schema: DashboardSchema) => ({ stocks: schema.stocks, timeRange: schema.timeRange, charts: schema.charts.map(({ title: _title, ...chart }) => chart), analysis: schema.analysis })
    if (stable(compare(checked.data)) !== stable(compare(expected.schema))) throw new Error('模型修改了追问以外的条件，请重试或更明确地描述需求。')
  }
  return checked.data
}
