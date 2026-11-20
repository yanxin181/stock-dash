import { describe, expect, it } from 'vitest'
import { schemaExamples } from '../examples/schemas'
import { applyFollowUp } from './followUp'
import { parseInstruction } from './parseInstruction'
import { getInputSuggestions } from './inputSuggestions'

describe('输入推荐', () => {
  it('推荐可执行的完整示例，并按对比或指标筛选', () => {
    const defaults = getInputSuggestions('')
    expect(defaults.length).toBeGreaterThan(0)
    expect(defaults.every(item => item.kind === '示例' && parseInstruction(item.text).success)).toBe(true)
    const comparisons = getInputSuggestions('对比')
    expect(comparisons.some(item => item.label.includes('股价') && item.label.includes('涨跌幅'))).toBe(true)
    expect(comparisons.some(item => item.label.includes('成交量'))).toBe(true)
    expect(getInputSuggestions('成交量').every(item => item.topics.includes('成交量'))).toBe(true)
    expect(getInputSuggestions('无关内容xyz')).toEqual([])
  })

  it('推荐以当前看板为依据且可执行的追问', () => {
    for (const { schema } of schemaExamples) {
      const suggestions = getInputSuggestions('', schema)
      const followUps = suggestions.filter(item => item.kind === '追问')
      expect(followUps.length).toBeGreaterThan(0)
      expect(followUps.every(item => applyFollowUp(item.text, schema).kind === 'success')).toBe(true)
    }
    const single = getInputSuggestions('对比', schemaExamples[0].schema)
    expect(single.some(item => item.text === '增加 B 公司进行对比')).toBe(true)
    const both = getInputSuggestions('对比', schemaExamples[4].schema)
    expect(both.some(item => item.kind === '追问' && /增加.*公司/.test(item.text))).toBe(false)
  })
})
