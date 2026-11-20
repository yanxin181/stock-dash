import type { DashboardSchema } from '../types/schema'
import { parseInstruction } from './parseInstruction'
import { applyFollowUp } from './followUp'

export interface InputSuggestion { label: string; text: string; kind: '示例' | '追问'; topics: string[] }

// 示例都是可直接发送的完整指令，不推测用户输入中缺失的公司或时间。
const examples: InputSuggestion[] = [
  { label: '对比两家公司的股价与涨跌幅', text: '对比 A 公司和 B 公司最近 30 个交易日的股价走势，并展示两家公司的涨跌幅。', kind: '示例', topics: ['对比', '股价', '涨跌幅', 'A', 'B'] },
  { label: '对比两家公司的股价与成交量', text: '对比 A 公司和 B 公司最近 30 个交易日的股价和成交量。', kind: '示例', topics: ['对比', '股价', '成交量', 'A', 'B'] },
  { label: '分析股价和成交量', text: '分析 A 公司最近 30 个交易日的股价和成交量。', kind: '示例', topics: ['股价', '成交量', 'A'] },
  { label: '查看每日涨跌幅', text: '展示 A 公司最近 20 个交易日的每日涨跌幅。', kind: '示例', topics: ['涨跌幅', 'A'] },
  { label: '查看股价与 5 日均线', text: '查看 A 公司最近 30 个交易日的 5 日均线。', kind: '示例', topics: ['股价', '均线', 'A'] },
  { label: '探索成交量与涨跌幅关系', text: '分析 A 公司最近 30 个交易日的成交量与每日涨跌幅的关系。', kind: '示例', topics: ['成交量', '涨跌幅', '量价', 'A'] },
  { label: '查看上涨、下跌天数分布', text: '展示 B 公司最近 20 个交易日的涨跌天数占比。', kind: '示例', topics: ['涨跌幅', '分布', 'B'] },
]

function followUps(current: DashboardSchema): InputSuggestion[] {
  const items: InputSuggestion[] = []
  const add = (label: string, text: string, topics: string[]) => {
    if (applyFollowUp(text, current).kind === 'success') items.push({ label, text, topics, kind: '追问' })
  }
  if (current.stocks.length === 1) {
    const other = current.stocks[0] === 'A' ? 'B' : 'A'
    add(`增加 ${other} 公司对比`, `增加 ${other} 公司进行对比`, ['对比', '股价', other])
    add(`换成 ${other} 公司`, `换成 ${other} 公司`, ['公司', other])
  }
  add('更换交易日范围', `改为最近 ${current.timeRange.count === 10 ? 20 : 10} 个交易日`, ['时间'])
  for (const [metric, name, alternatives] of [
    ['price', '股价', ['成交量', '涨跌幅']],
    ['volume', '成交量', ['涨跌幅', '股价']],
    ['dailyChange', '涨跌幅', ['成交量', '股价']],
  ] as const) {
    if (!current.charts.some(chart => chart.metric === metric || (metric === 'price' && chart.metric === 'relativePrice'))) continue
    for (const target of alternatives) add(`${name}改为${target}`, `把${name}改为${target}`, [name, target, '指标'])
  }
  if (!current.analysis.some(item => item.type === 'priceExtrema' && item.marks.includes('highest') && item.marks.includes('lowest'))) {
    add('标出最高价和最低价', '增加最高价和最低价', ['股价', '最高', '最低'])
  }
  add('查看跌幅前 5 名', current.analysis.some(item => item.type === 'largestDeclines') ? '跌幅排名改为前5名' : '标出跌幅最大的5个交易日', ['跌幅', '排名'])
  return items
}

/** 以已识别关键词筛选推荐；不存在匹配时不替用户猜测内容。 */
export function getInputSuggestions(input: string, current?: DashboardSchema): InputSuggestion[] {
  const query = input.replace(/\s+/g, '').toLowerCase()
  const available = [...(current ? followUps(current) : []), ...examples.filter(item => parseInstruction(item.text).success)]
  if (!query) return available.slice(0, 8)
  const topics: string[] = []
  if (/对比|比较|对照|对/.test(query)) topics.push('对比')
  if (/股价|收盘价|股票价格|股/.test(query)) topics.push('股价')
  if (/成交量|成交|量价/.test(query)) topics.push('成交量')
  if (/涨跌幅|涨幅|跌幅|涨跌|收益/.test(query)) topics.push('涨跌幅', '跌幅')
  if (/均线|移动平均/.test(query)) topics.push('均线')
  if (/分布|天数|占比/.test(query)) topics.push('分布')
  if (/最高/.test(query)) topics.push('最高')
  if (/最低/.test(query)) topics.push('最低')
  if (/排名|前\d/.test(query)) topics.push('排名')
  if (/交易日|时间|最近/.test(query)) topics.push('时间')
  if (/指标/.test(query)) topics.push('指标')
  if (/(?:^|[^a-z])a(?:公司|股票)?/i.test(query)) topics.push('A')
  if (/(?:^|[^a-z])b(?:公司|股票)?/i.test(query)) topics.push('B')
  const exactText = (item: InputSuggestion) => item.text.replace(/\s+/g, '').toLowerCase().includes(query)
  const score = (item: InputSuggestion) => topics.filter(topic => item.topics.includes(topic)).length + (exactText(item) ? 3 : 0)
  return available.map((item, index) => ({ item, index, score: score(item) }))
    .filter(entry => entry.score > 0 && entry.item.text.replace(/\s+/g, '').toLowerCase() !== query)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8).map(entry => entry.item)
}
