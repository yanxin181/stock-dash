import type { DashboardResult } from '../types/analysis'
import type { DashboardSchema } from '../types/schema'
import { analyzeDashboard } from './analyzeDashboard'
import { applyFollowUp } from './followUp'
import { generateModelConclusion } from './modelConclusion'
import { requestModelSchema } from './modelSchema'
import { parseInstruction } from './parseInstruction'
import { validateDashboardSchema } from './validateSchema'

export type AnalysisMode = 'local' | 'model'
export type AnalysisStage = '理解需求 / 生成 Schema' | '校验 Schema' | '处理数据' | '生成结论' | '渲染图表'
export interface AnalysisOutcome { dashboard: DashboardResult; content: string; usedFallback: boolean }

/** 不修改 current；只有调用方收到成功结果后才能提交新的有效 Schema。 */
export async function runAnalysis(input: string, mode: AnalysisMode, current: DashboardSchema | undefined, onStage: (stage: AnalysisStage) => Promise<void>, fetchImpl: typeof fetch = fetch): Promise<AnalysisOutcome> {
  await onStage('理解需求 / 生成 Schema')
  let schema: DashboardSchema
  if (mode === 'model') {
    schema = await requestModelSchema(input, fetchImpl, () => onStage('校验 Schema'), current)
  } else {
    const followUp = applyFollowUp(input, current)
    if (followUp.kind === 'error') throw new Error(`理解追问：${followUp.message}`)
    if (followUp.kind === 'success') schema = followUp.schema
    else {
      const parsed = parseInstruction(input)
      if (!parsed.success) throw new Error(`${parsed.stage}：${parsed.message}`)
      schema = parsed.schema
    }
    await onStage('校验 Schema')
    const checked = validateDashboardSchema(schema)
    if (!checked.success) throw new Error(`校验 Schema：${checked.errors.map(error => `${error.path}：${error.message}`).join('；')}。请调整需求后重试。`)
    schema = checked.data
  }
  await onStage('处理数据')
  const computed = analyzeDashboard(schema)
  if (!computed.success) throw new Error(`${computed.stage}：${computed.message} 请检查需求或数据后重试。`)
  let content = '已根据你的需求生成本地分析看板。'
  let usedFallback = false
  if (mode === 'model') {
    await onStage('生成结论')
    const conclusion = await generateModelConclusion(computed.data, fetchImpl)
    computed.data.conclusions = conclusion.conclusions
    usedFallback = !conclusion.usedModel
    content = conclusion.notice ?? '已根据你的需求生成分析看板，结论由程序计算并结合模型建议的顺序展示。'
  }
  return { dashboard: computed.data, content, usedFallback }
}
