import { afterEach, describe, expect, it, vi } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import * as analysis from './analyzeDashboard'
import { runAnalysis, type AnalysisStage } from './runAnalysis'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const successfulSchema = (index: number) => json({ kind: 'schema', intent: 'new', schema: schemaExamples[index].schema })
const onStages = () => {
  const stages: AnalysisStage[] = []
  return { stages, onStage: async (stage: AnalysisStage) => { stages.push(stage) } }
}
afterEach(() => vi.restoreAllMocks())

describe('分析流程状态及回退', () => {
  it('本地模式离线运行并只报告已执行的阶段', async () => {
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    const outcome = await runAnalysis(schemaExamples[0].instruction, 'local', undefined, onStage, fetchMock as typeof fetch)
    expect(stages).toEqual(['理解需求 / 生成 Schema', '校验 Schema', '处理数据'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(outcome.dashboard.schema.stocks).toEqual(['A'])
    expect(outcome.dashboard.schema.timeRange.count).toBe(30)
    expect(outcome.dashboard.charts.map(chart => chart.spec.metric)).toEqual(['price', 'volume'])
  })
  it('解析失败保留原 Schema，且不显示之后的处理阶段', async () => {
    const original = structuredClone(schemaExamples[0].schema)
    const snapshot = structuredClone(original)
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn(async () => json({ error: { code: 'CONFIG_MISSING' } }, 503)) as unknown as typeof fetch
    await expect(runAnalysis('修改需求', 'model', original, onStage, fetchMock)).rejects.toThrow('API Key')
    expect(stages).toEqual(['理解需求 / 生成 Schema'])
    expect(original).toEqual(snapshot)
  })
  it('无效 Schema 显示校验失败，并保留原 Schema', async () => {
    const original = structuredClone(schemaExamples[0].schema)
    const snapshot = structuredClone(original)
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn(async () => json({ kind: 'schema', intent: 'new', schema: { ...original, stocks: ['C'] } })) as unknown as typeof fetch
    await expect(runAnalysis('分析 C 公司', 'model', original, onStage, fetchMock)).rejects.toThrow('校验 Schema')
    expect(stages).toEqual(['理解需求 / 生成 Schema', '校验 Schema'])
    expect(original).toEqual(snapshot)
  })
  it('数据处理失败有独立提示，不继续生成结论', async () => {
    vi.spyOn(analysis, 'analyzeDashboard').mockReturnValue({ success: false, stage: '处理数据', message: '没有可用数据。' })
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn(async () => successfulSchema(1)) as unknown as typeof fetch
    await expect(runAnalysis('分析 B 公司', 'model', undefined, onStage, fetchMock)).rejects.toThrow('处理数据：没有可用数据')
    expect(stages).toEqual(['理解需求 / 生成 Schema', '校验 Schema', '处理数据'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('结论失败返回新看板和模板，不覆盖旧对象并说明原因', async () => {
    const original = structuredClone(schemaExamples[0].schema)
    const snapshot = structuredClone(original)
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn().mockResolvedValueOnce(successfulSchema(1)).mockResolvedValueOnce(json({ error: { code: 'TIMEOUT' } }, 504)) as typeof fetch
    const outcome = await runAnalysis('查看 B 公司', 'model', original, onStage, fetchMock)
    expect(stages).toEqual(['理解需求 / 生成 Schema', '校验 Schema', '处理数据', '生成结论'])
    expect(outcome.usedFallback).toBe(true)
    expect(outcome.content).toContain('超时')
    expect(outcome.content).toContain('模板结论')
    expect(outcome.dashboard.schema).toEqual(schemaExamples[1].schema)
    const template = analysis.analyzeDashboard(schemaExamples[1].schema)
    expect(template.success && outcome.dashboard.conclusions).toEqual(template.success && template.data.conclusions)
    expect(original).toEqual(snapshot)
  })
  it('模型结论成功时正常返回新看板', async () => {
    const { stages, onStage } = onStages()
    const fetchMock = vi.fn().mockResolvedValueOnce(successfulSchema(0)).mockResolvedValueOnce(json({ factIds: ['f1'] })) as typeof fetch
    const outcome = await runAnalysis('分析 A 公司', 'model', undefined, onStage, fetchMock)
    expect(outcome.usedFallback).toBe(false)
    expect(outcome.dashboard.schema.stocks).toEqual(['A'])
    expect(stages).toEqual(['理解需求 / 生成 Schema', '校验 Schema', '处理数据', '生成结论'])
  })
})
