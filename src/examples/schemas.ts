import { DATA_AS_OF, DATA_SOURCE } from '../data/stocks'
import type { DashboardSchema } from '../types/schema'

export interface SchemaExample { instruction: string; schema: DashboardSchema }

/** 预期配置，供后续解析器、校验器和看板实现使用。 */
export const schemaExamples: SchemaExample[] = [
  {
    instruction: '分析 A 公司最近 30 个交易日的股价和成交量，并标出跌幅最大的 3 个交易日。',
    schema: {
      title: 'A 公司近 30 个交易日股价与成交量', stocks: ['A'],
      timeRange: { type: 'tradingDays', count: 30 },
      charts: [
        { title: '收盘价走势', metric: 'price', type: 'line', unit: '元' },
        { title: '成交量', metric: 'volume', type: 'bar', unit: '万股' },
      ],
      analysis: [{ type: 'largestDeclines', count: 3, display: 'ranking' }],
      dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
    },
  },
  {
    instruction: '查看 B 公司最近 10 个交易日的股价走势，并标出区间内的最高价和最低价。',
    schema: {
      title: 'B 公司近 10 个交易日股价走势', stocks: ['B'],
      timeRange: { type: 'tradingDays', count: 10 },
      charts: [{ title: '收盘价走势', metric: 'price', type: 'line', unit: '元' }],
      analysis: [{ type: 'priceExtrema', marks: ['highest', 'lowest'] }],
      dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
    },
  },
  {
    instruction: '展示 A 公司最近 20 个交易日的每日涨跌幅，并找出涨幅最大的交易日。',
    schema: {
      title: 'A 公司近 20 个交易日每日涨跌幅', stocks: ['A'],
      timeRange: { type: 'tradingDays', count: 20 },
      charts: [{ title: '每日涨跌幅', metric: 'dailyChange', type: 'bar', unit: '%' }],
      analysis: [{ type: 'largestGain', count: 1, display: 'mark' }],
      dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
    },
  },
  {
    instruction: '用柱状图展示 B 公司最近 15 个交易日的成交量，并列出成交量最高的 3 个交易日。',
    schema: {
      title: 'B 公司近 15 个交易日成交量', stocks: ['B'],
      timeRange: { type: 'tradingDays', count: 15 },
      charts: [{ title: '成交量', metric: 'volume', type: 'bar', unit: '万股' }],
      analysis: [{ type: 'highestVolume', count: 3, display: 'ranking' }],
      dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
    },
  },
  {
    instruction: '对比 A 公司和 B 公司最近 30 个交易日的股价走势，并展示两家公司在这段时间内的涨跌幅。',
    schema: {
      title: 'A、B 公司近 30 个交易日走势对比', stocks: ['A', 'B'],
      timeRange: { type: 'tradingDays', count: 30 },
      charts: [{ title: '相对股价走势', metric: 'relativePrice', type: 'line', unit: '基准点', base: 100 }],
      analysis: [{ type: 'periodChange', display: 'comparison', unit: '%' }],
      dataSource: DATA_SOURCE, dataAsOf: DATA_AS_OF,
    },
  },
]
