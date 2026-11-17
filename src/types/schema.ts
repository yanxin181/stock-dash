import type { StockId } from './stock'

/** 阶段二模型输出和本地解析将共用此结构；运行时校验在步骤三实现。 */
export type ChartSpec =
  | { title: string; metric: 'price'; type: 'line' | 'bar'; unit: '元' }
  | { title: string; metric: 'volume'; type: 'line' | 'bar'; unit: '万股' }
  | { title: string; metric: 'dailyChange'; type: 'line' | 'bar'; unit: '%' }
  | { title: string; metric: 'relativePrice'; type: 'line'; unit: '基准点'; base: 100 }

export type AnalysisSpec =
  | { type: 'priceExtrema'; marks: ('highest' | 'lowest')[] }
  | { type: 'largestGain'; count: 1; display: 'mark' }
  | { type: 'largestDeclines'; count: number; display: 'ranking' | 'mark' }
  | { type: 'highestVolume'; count: number; display: 'ranking' | 'mark' }
  | { type: 'periodChange'; display: 'comparison'; unit: '%' }

export interface DashboardSchema {
  title: string
  stocks: StockId[]
  timeRange: { type: 'tradingDays'; count: number }
  charts: ChartSpec[]
  analysis: AnalysisSpec[]
  dataSource: string
  dataAsOf: string
}
