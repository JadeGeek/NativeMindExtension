import { makeCustomFetch } from '@/utils/fetch'
import logger from '@/utils/logger'
import { getUserConfig } from '@/utils/user-config'

const log = logger.child('llm:openai-compatible')

export type OpenAICompatibleModelInfo = {
  id: string
  owned_by?: string
  object?: string
}

const ensureTrailingSlash = (url: string) => url.endsWith('/') ? url : `${url}/`

let inFlightModelList: Promise<{ models: OpenAICompatibleModelInfo[], success: boolean }> | null = null
let inFlightKey: string | null = null
let cachedModelList: { models: OpenAICompatibleModelInfo[], success: boolean, timestamp: number, key: string } | null = null
const MODEL_LIST_TTL_MS = 5000

const makeCacheKey = (baseUrl: string, apiKey: string | undefined) => `${baseUrl}::${apiKey ?? ''}`

export const getLocalModelList = async (): Promise<{ models: OpenAICompatibleModelInfo[], success: boolean }> => {
  const userConfig = await getUserConfig()
  const baseUrl = ensureTrailingSlash(userConfig.llm.backends.openai.baseUrl.get())
  const apiKey = userConfig.llm.apiKey.get()
  const cacheKey = makeCacheKey(baseUrl, apiKey)

  if (cachedModelList && cachedModelList.key === cacheKey && (Date.now() - cachedModelList.timestamp) < MODEL_LIST_TTL_MS) {
    return { models: cachedModelList.models, success: cachedModelList.success }
  }
  if (inFlightModelList && inFlightKey === cacheKey) return inFlightModelList

  const fetch = makeCustomFetch({
    extraHeaders: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  })

  const url = new URL('models', baseUrl).href
  inFlightKey = cacheKey
  inFlightModelList = (async () => {
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      log.warn('Failed to fetch models', { status: response.status, statusText: response.statusText, text: text?.slice?.(0, 200) })
      return { models: [], success: false }
    }
    const rawText = await response.text().catch(() => '')
    let data: unknown = rawText
    try {
      data = rawText ? JSON.parse(rawText) : {}
    }
    catch (error) {
      log.warn('Failed to parse models response as JSON', { error, rawText: rawText?.slice?.(0, 500) })
      return { models: [], success: false }
    }
    const modelList = (data && typeof data === 'object' && 'data' in data ? (data as { data?: unknown }).data : undefined)
    if (!Array.isArray(modelList)) return { models: [], success: true }
    const models: OpenAICompatibleModelInfo[] = []
    for (const m of modelList) {
      if (m && typeof m === 'object' && 'id' in m && typeof (m as { id?: unknown }).id === 'string') {
        const { id, owned_by, object } = m as { id: string, owned_by?: string, object?: string }
        models.push({ id, owned_by, object })
      }
    }
    log.debug('Fetched OpenAI-compatible models', { count: models.length })
    cachedModelList = { models, success: true, timestamp: Date.now(), key: cacheKey }
    return cachedModelList
  })().finally(() => {
    inFlightModelList = null
    inFlightKey = null
  })

  return inFlightModelList
}

export const testConnection = async () => {
  const { success } = await getLocalModelList()
  if (!success) log.warn('OpenAI-compatible connection test failed')
  return success
}
