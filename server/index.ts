import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 4174)
const timeoutMs = Number(process.env.MODEL_TIMEOUT_MS ?? 30000)
const baseUrl = process.env.MODEL_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const model = process.env.MODEL_NAME ?? 'qwen3.7-flash'
if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000 || !model.trim()) throw new Error('后端端口、模型名称或超时配置无效。')
try { if (new URL(baseUrl).protocol !== 'https:') throw new Error() } catch { throw new Error('MODEL_BASE_URL 必须是有效的 HTTPS 地址。') }

createApp({ apiKey: process.env.DASHSCOPE_API_KEY, baseUrl, model, timeoutMs }).listen(port, '127.0.0.1', (error?: Error) => {
  if (error) { console.error(`后端无法监听本地端口 ${port}，请检查端口是否被占用或系统保留，并修改 PORT。`); process.exitCode = 1; return }
  console.log(`本地后端已启动：http://127.0.0.1:${port}`)
})
