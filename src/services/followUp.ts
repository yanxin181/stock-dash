import type { ChartSpec, DashboardSchema } from '../types/schema'
import { validateDashboardSchema } from './validateSchema'

export type FollowUpResult =
  | { kind: 'not-follow-up' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; schema: DashboardSchema }

/** 只处理指定的两类追问。所有修改均产生新对象，不改动当前有效配置。 */
export function applyFollowUp(input: string, current?: DashboardSchema): FollowUpResult {
  const text = input.replace(/\s+/g, '').replace(/[。.!！]$/, '')
  const daysMatch = text.match(/^改(?:为|成)最近(\d+)个?交易日$/)
  const replaceVolume = /^把成交量改(?:成|为)涨跌幅$/.test(text)
  if (!daysMatch && !replaceVolume) {
    if (/^(?:改|把|调整)/.test(text)) return { kind: 'error', message: '暂不支持该追问。可以试试“改为最近 10 个交易日”或“把成交量改成涨跌幅”。' }
    return { kind: 'not-follow-up' }
  }
  if (!current) return { kind: 'error', message: '请先生成一个本地看板，再提出追问。' }

  let candidate: DashboardSchema
  if (daysMatch) {
    const count = Number(daysMatch[1])
    const replaceDays = (title: string) => title.replace(/((?:最近|近)\s*)\d+(\s*个?交易日)/g, (_, prefix: string, suffix: string) => `${prefix}${count}${suffix}`)
    candidate = {
      ...current,
      title: replaceDays(current.title),
      timeRange: { type: 'tradingDays', count },
      charts: current.charts.map(chart => ({ ...chart, title: replaceDays(chart.title) })),
    }
  } else {
    if (!current.charts.some(chart => chart.metric === 'volume')) return { kind: 'error', message: '当前看板没有成交量图表，请先生成包含成交量的看板。' }
    const replaceTitle = (title: string) => title.replace(/每日成交量|成交量/g, '每日涨跌幅')
    const charts: ChartSpec[] = current.charts.map(chart => chart.metric === 'volume'
      ? { title: chart.title.includes('成交量') ? replaceTitle(chart.title) : '每日涨跌幅', metric: 'dailyChange', type: chart.type, unit: '%' }
      : chart)
    candidate = { ...current, title: replaceTitle(current.title), charts, analysis: current.analysis.filter(item => item.type !== 'highestVolume') }
  }

  const validated = validateDashboardSchema(candidate)
  if (!validated.success) return { kind: 'error', message: `追问后的配置无效：${validated.errors.map(error => error.message).join('；')}` }
  return { kind: 'success', schema: validated.data }
}
