import type { AnalysisSpec, ChartSpec, DashboardSchema } from './schema'
import type { StockId, StockRecord } from './stock'

export interface CalculatedRow extends StockRecord {
  dailyChange: number | null
  relativePrice: number | null
}
export interface StockAnalysis {
  stock: StockId
  rows: CalculatedRow[]
  periodChange: number | null
}
export interface ValuePoint { date: string; value: number; label?: 'highest' | 'lowest' }
export interface ChartData {
  spec: ChartSpec
  dates: string[]
  series: { stock: StockId; values: (number | null)[] }[]
}
export interface AnalysisResult {
  spec: AnalysisSpec
  stock: StockId
  unit: '元' | '万股' | '%'
  points: ValuePoint[]
  periodChange?: number | null
  message?: string
}
export interface DashboardResult {
  schema: DashboardSchema
  stocks: StockAnalysis[]
  charts: ChartData[]
  analyses: AnalysisResult[]
  conclusions: string[]
  warnings: string[]
}
export type DashboardComputation =
  | { success: true; data: DashboardResult }
  | { success: false; stage: '校验 Schema' | '处理数据'; message: string }
