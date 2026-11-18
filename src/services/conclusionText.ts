import type { StockId } from '../types/stock'

export interface ChangeDistribution { rise: number; fall: number; flat: number; missing: number }

/** 占比以可计算涨跌幅的交易日为分母；完全无有效数据时不计算占比。 */
export function describeChangeDistribution(stock: StockId, { rise, fall, flat, missing }: ChangeDistribution): string {
  const valid = rise + fall + flat
  if (!valid) return `${stock} 公司没有可计算涨跌幅的交易日；${missing} 天因缺少有效前收盘价未纳入统计。`
  const comparison = rise === fall ? '上涨与下跌天数相同' : rise > fall ? `上涨日比下跌日多 ${rise - fall} 天` : `下跌日比上涨日多 ${fall - rise} 天`
  const missingText = missing ? `；另有 ${missing} 天涨跌幅不可计算，未计入占比` : ''
  return `${stock} 公司 ${valid} 个有效交易日中，上涨 ${rise} 天（${(rise / valid * 100).toFixed(2)}%）、下跌 ${fall} 天（${(fall / valid * 100).toFixed(2)}%）、持平 ${flat} 天；${comparison}${missingText}。`
}
