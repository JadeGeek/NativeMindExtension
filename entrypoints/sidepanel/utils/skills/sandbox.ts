import { browser } from 'wxt/browser'

import type { SkillAllowedTools } from '@/types/skill'
import logger from '@/utils/logger'
import { s2bRpc } from '@/utils/rpc'
import { formatSkillError } from '@/utils/skills/errors'

type SkillRunRequest = {
  id: string
  name: string
  source: string
  args?: unknown
  allowedTools: SkillAllowedTools
  tabId?: number
}

type SkillApiRequest = {
  id: string
  name: string
  target: 'dom' | 'sw'
  tool: string
  args: unknown[]
  tabId?: number
}

type SkillResult = { result?: unknown, error?: string, errorDetails?: string }

let sandboxFrame: HTMLIFrameElement | null = null
let sandboxReady: Promise<void> | null = null
let sandboxReadySignal: Promise<void> | null = null
let sandboxReadyResolve: (() => void) | null = null
let sandboxReadyFlag = false
let sandboxListenerReady = false
const pendingRuns = new Map<string, { resolve: (value: SkillResult) => void, reject: (error: unknown) => void }>()
const sandboxLogger = logger.child('skill-sandbox')

function ensureSandboxFrame() {
  if (sandboxReady) return sandboxReady
  sandboxReady = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.src = browser.runtime.getURL('/skill-sandbox.html')
    frame.style.display = 'none'
    frame.addEventListener('load', () => {
      resolve()
    })
    frame.addEventListener('error', () => {
      reject(new Error('Failed to load sandbox frame'))
    })
    document.body.appendChild(frame)
    sandboxFrame = frame
  })
  return sandboxReady
}

function postToSandbox(message: Record<string, unknown>) {
  if (!sandboxFrame?.contentWindow) {
    throw new Error('Sandbox frame not ready')
  }
  sandboxFrame.contentWindow.postMessage(message, '*')
}

function handleSandboxMessage(event: MessageEvent) {
  if (!sandboxFrame?.contentWindow || event.source !== sandboxFrame.contentWindow) return
  const payload = event.data as Record<string, unknown>
  if (payload?.type === 'sandbox-ready') {
    sandboxReadyFlag = true
    if (sandboxReadyResolve) {
      sandboxReadyResolve()
      sandboxReadyResolve = null
    }
    return
  }
  if (payload?.type === 'skill-result') {
    const { id, result, error, errorDetails } = payload as { id: string, result?: unknown, error?: string, errorDetails?: string }
    const pending = pendingRuns.get(id)
    if (!pending) return
    pendingRuns.delete(id)
    if (error) {
      sandboxLogger.info('skill-run failed', { id, error, errorDetails })
      pending.resolve({ error, errorDetails })
    }
    else {
      pending.resolve({ result })
    }
  }
  if (payload?.type === 'skill-api') {
    const request = payload.request as SkillApiRequest
    const handle = async () => {
      if (request.target === 'sw') {
        return await s2bRpc.skillInvokeSwApi({
          name: request.name,
          tool: request.tool,
          args: request.args,
        })
      }
      return await s2bRpc.skillInvokeDomApi({
        name: request.name,
        tool: request.tool,
        args: request.args,
        tabId: request.tabId ?? 0,
      })
    }
    handle()
      .then((result) => {
        postToSandbox({ type: 'skill-api-result', id: request.id, result })
      })
      .catch((error) => {
        const formatted = formatSkillError(error)
        postToSandbox({ type: 'skill-api-result', id: request.id, error: formatted.message, errorDetails: formatted.details })
      })
  }
}

function ensureSandboxListener() {
  if (sandboxListenerReady) return
  if (typeof window === 'undefined') return
  window.addEventListener('message', handleSandboxMessage)
  sandboxListenerReady = true
}

function waitForSandboxReady(timeoutMs = 3000) {
  if (sandboxReadyFlag) return Promise.resolve()
  if (sandboxReadySignal) return sandboxReadySignal
  sandboxReadySignal = new Promise((resolve, reject) => {
    sandboxReadyResolve = resolve
    const timeoutId = window.setTimeout(() => {
      if (sandboxReadyResolve) sandboxReadyResolve = null
      reject(new Error('sandbox-ready timeout'))
    }, timeoutMs)
    sandboxReadySignal?.then(
      () => window.clearTimeout(timeoutId),
      () => window.clearTimeout(timeoutId),
    )
  })
  return sandboxReadySignal
}

export async function runSkillInSandbox(request: Omit<SkillRunRequest, 'id'>): Promise<SkillResult> {
  if (typeof window === 'undefined') {
    return {
      error: 'sandbox-unavailable',
      errorDetails: 'Skill sandbox can only run in sidepanel',
    }
  }
  ensureSandboxListener()
  try {
    await ensureSandboxFrame()
    if (!sandboxReadyFlag) {
      sandboxLogger.info('posting sandbox-ping')
      postToSandbox({ type: 'sandbox-ping' })
    }
    await waitForSandboxReady()
  }
  catch (error) {
    const formatted = formatSkillError(error)
    if (formatted.message === 'sandbox-ready timeout') {
      return { error: 'sandbox-not-ready', errorDetails: formatted.details }
    }
    return { error: formatted.message, errorDetails: formatted.details }
  }
  const id = crypto.randomUUID()
  const payload: SkillRunRequest = { id, ...request }
  return await new Promise<SkillResult>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      pendingRuns.delete(id)
      resolve({ error: 'sandbox-timeout', errorDetails: 'Timed out waiting for sandbox response' })
    }, 8000)
    pendingRuns.set(id, {
      resolve: (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      reject: (error) => {
        window.clearTimeout(timeoutId)
        const formatted = formatSkillError(error)
        resolve({ error: formatted.message, errorDetails: formatted.details })
      },
    })
    try {
      sandboxLogger.info('posting skill-run', { id, name: request.name })
      postToSandbox({ type: 'skill-run', request: payload })
    }
    catch (error) {
      window.clearTimeout(timeoutId)
      pendingRuns.delete(id)
      const formatted = formatSkillError(error)
      resolve({ error: formatted.message, errorDetails: formatted.details })
    }
  })
}
