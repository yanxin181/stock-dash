export const modelErrorMessages: Record<string, string> = {
  INVALID_INPUT: '输入无效，请检查需求内容并控制在 2000 字以内。',
  CONFIG_MISSING: '后端缺少百炼 API Key，请配置 DASHSCOPE_API_KEY 后重启后端。',
  AUTH_FAILED: '模型鉴权失败，请检查 API Key、地域和模型权限。',
  QUOTA_OR_RATE_LIMIT: '模型额度不足或请求过于频繁，请检查百炼额度，或稍后重试。',
  TIMEOUT: '模型请求超时，请检查网络并稍后重试。',
  NETWORK_ERROR: '后端无法连接模型服务，请检查网络及模型服务地址。',
  UPSTREAM_ERROR: '模型服务暂时不可用，请稍后重试。',
  INVALID_RESPONSE: '模型输出格式无效，请重试或调整需求。',
  TOO_LARGE: '输入内容过大，请缩短需求后重试。',
  BACKEND_UNAVAILABLE: '无法连接本地后端，请运行 npm run dev:all 并确认后端已启动。',
  UNKNOWN: '本地后端处理失败，请检查服务状态后重试。',
}

export class ModelRequestError extends Error {
  constructor(public code: string) { super(modelErrorMessages[code] ?? modelErrorMessages.UNKNOWN) }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** 服务端只返回错误代码；不向页面转发任意上游错误文本。 */
export async function readModelResponse(response: Response): Promise<unknown> {
  let body: unknown
  try { body = await response.json() } catch {
    throw new ModelRequestError(response.ok ? 'INVALID_RESPONSE' : 'BACKEND_UNAVAILABLE')
  }
  if (!response.ok) {
    const code = isObject(body) && isObject(body.error) && typeof body.error.code === 'string' ? body.error.code : 'UNKNOWN'
    throw new ModelRequestError(code)
  }
  return body
}
