/** 原始模拟行情：价格为收盘价，成交量单位为万股。 */
export type StockId = 'A' | 'B'
export interface StockRecord {
  stock: StockId
  date: string
  close: number
  volume: number
}
