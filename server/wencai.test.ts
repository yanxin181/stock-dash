import { describe, expect, it, vi } from 'vitest'
import { fetchWencaiQuotes, WencaiError } from './wencai'

const sample = { code_count: 1, datas: [{ '股票代码': '600519.SH', '股票简称': '贵州茅台', '收盘价[20260102]': 10, '成交量[20260102]': 120, '收盘价[20260105]': 11, '成交量[20260105]': 130, '收盘价[20260106]': 12, '成交量[20260106]': 140 }] }
describe('问财行情适配', () => {
  it('校验标的并按日期转换上游数据', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })) as unknown as typeof fetch
    const result = await fetchWencaiQuotes({ stocks: ['600519.SH'], count: 2 }, 'test-key', fetcher)
    expect(result[0].records).toEqual([{ date: '2026-01-02', close: 10, volume: 120 }, { date: '2026-01-05', close: 11, volume: 130 }, { date: '2026-01-06', close: 12, volume: 140 }])
  })
  it('拒绝不匹配的股票和缺失的日期字段', async () => {
    for (const data of [{ ...sample, datas: [{ ...sample.datas[0], 股票代码: '000001.SZ' }] }, { ...sample, datas: [{ ...sample.datas[0], '成交量[20260105]': null }] }]) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify(data))) as unknown as typeof fetch
      await expect(fetchWencaiQuotes({ stocks: ['600519.SH'], count: 2 }, 'key', fetcher)).rejects.toMatchObject({ code: 'WENCAI_DATA' })
    }
  })
  it('拒绝自由文本、缺失 Key 和鉴权失败', async () => {
    await expect(fetchWencaiQuotes({ stocks: ['任意查询'], count: 2 }, 'key')).rejects.toBeInstanceOf(WencaiError)
    await expect(fetchWencaiQuotes({ stocks: ['600519.SH'], count: 2 }, undefined)).rejects.toMatchObject({ code: 'WENCAI_CONFIG_MISSING' })
    const fetcher = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch
    await expect(fetchWencaiQuotes({ stocks: ['600519.SH'], count: 2 }, 'key', fetcher)).rejects.toMatchObject({ code: 'WENCAI_AUTH' })
  })
})
