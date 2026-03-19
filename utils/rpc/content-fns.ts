import { EventEmitter } from 'events'
import { Browser } from 'wxt/browser'

import { SkillAllowedTools } from '@/types/skill'

import type { ContextMenuId } from '../context-menu'
import { parseDocument } from '../document-parser'
import { logger } from '../logger'
import { memoFunction } from '../memo'
import { parsePdfFileOfUrl } from '../pdf'
import { formatSkillError } from '../skills/errors'
import { runSkillScript } from '../skills/runtime'

const eventEmitter = new EventEmitter()

export type Events = {
  toggleContainer(opts: { _toTab?: number, open?: boolean }): void
  summarizePage(): void
  tabUpdated(opts: { tabId: number, url?: string, faviconUrl?: string, title?: string }): void
  tabRemoved(opts: { tabId: number } & Browser.tabs.TabRemoveInfo): void
  contextMenuClicked(opts: { _toTab?: number } & Browser.contextMenus.OnClickData & { menuItemId: ContextMenuId }): void
  selectionChanged(opts: { tabId: number, selectedText: string }): void
}

export type EventKey = keyof Events

const parsePdfFileOfCurrentUrl = memoFunction(parsePdfFileOfUrl)

export async function getPageContentType(_: { _toTab?: number }) {
  return document.contentType
}

export async function getPagePDFContent(_: { _toTab?: number }) {
  if (document.contentType === 'application/pdf') {
    const pdfContent = await parsePdfFileOfCurrentUrl(location.href)
    if (pdfContent) {
      return {
        type: 'pdf',
        ...pdfContent,
        url: location.href,
      } as const
    }
  }
  return undefined
}

export async function getDocumentContent(_: { _toTab?: number }) {
  const article = await parseDocument(window.document)
  const url = window.location.href
  return {
    type: 'html',
    ...article,
    url,
  } as const
}

export function ping(_: { _toTab?: number }) {
  return 'pong'
}

export function getSelectedText(_: { _toTab?: number }) {
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim() || ''
  return selectedText
}

export async function skillRun(params: { _toTab?: number, name: string, source: string, args?: unknown, allowedTools: SkillAllowedTools }) {
  const { name, source, args, allowedTools } = params
  const { c2bRpc } = await import('./index')
  try {
    return await runSkillScript({
      name,
      source,
      args,
      allowedTools,
      invokeSw: (request) => c2bRpc.skillInvokeSwApi(request),
    })
  }
  catch (error) {
    const formatted = formatSkillError(error)
    return { error: formatted.message, errorDetails: formatted.details }
  }
}

function readWindowValue(path: string) {
  const parts = path.split('.').filter(Boolean)
  let current: unknown = window
  for (const part of parts) {
    if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>
      if (part in record) {
        current = record[part]
        continue
      }
    }
    return undefined
  }
  return current
}

export async function skillDomInvoke(params: { _toTab?: number, tool: string, args: unknown[] }) {
  const { tool, args } = params
  switch (tool) {
    case 'fetchText': {
      const [url, init] = args as [string, RequestInit | undefined]
      const response = await fetch(url, init)
      const text = await response.text()
      return { status: response.status, text, contentType: response.headers.get('content-type') || '' }
    }
    case 'getDocumentHtml': {
      return document?.documentElement?.outerHTML || ''
    }
    case 'getWindowJson': {
      const [name] = args as [string]
      try {
        const value = (window as unknown as Record<string, unknown>)[name]
        return JSON.stringify(value ?? null)
      }
      catch {
        return ''
      }
    }
    case 'getWindowValue': {
      const [path] = args as [string]
      const value = readWindowValue(path)
      if (typeof value === 'string') return value
      try {
        return JSON.stringify(value ?? null)
      }
      catch {
        return ''
      }
    }
    case 'querySelector': {
      const [selector] = args as [string]
      return Boolean(document.querySelector(selector))
    }
    case 'querySelectorAll': {
      const [selector] = args as [string]
      return Array.from(document.querySelectorAll(selector)).map((el) => (el as HTMLElement).outerHTML ?? '')
    }
    case 'getTextList': {
      const [selector] = args as [string]
      return Array.from(document.querySelectorAll(selector)).map((el) => (el as HTMLElement).textContent?.trim() || '')
    }
    case 'getText': {
      const [selector] = args as [string]
      return document.querySelector(selector)?.textContent ?? ''
    }
    case 'setText': {
      const [selector, text] = args as [string, string]
      const el = document.querySelector(selector)
      if (!el) return false
      el.textContent = text
      return true
    }
    case 'click': {
      const [selector] = args as [string]
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) return false
      el.click()
      return true
    }
    case 'clickByText': {
      const [selector, candidates] = args as [string, string[]]
      const items = Array.from(document.querySelectorAll(selector)) as HTMLElement[]
      const tokens = (candidates || []).map((entry) => entry.toLowerCase())
      for (const item of items) {
        const text = (item.textContent || '').toLowerCase()
        if (!text) continue
        if (tokens.some((token) => text.includes(token))) {
          item.click()
          return true
        }
      }
      return false
    }
    case 'setValue': {
      const [selector, value] = args as [string, string]
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) return false
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    case 'getAttribute': {
      const [selector, name] = args as [string, string]
      return document.querySelector(selector)?.getAttribute(name) ?? null
    }
    case 'setAttribute': {
      const [selector, name, value] = args as [string, string, string]
      const el = document.querySelector(selector)
      if (!el) return false
      el.setAttribute(name, value)
      return true
    }
    default:
      throw new Error(`Unsupported DOM tool: ${tool}`)
  }
}

export const contentFunctions = {
  emit: <E extends keyof Events>(ev: E, ...args: Parameters<Events[E]>) => {
    eventEmitter.emit(ev, ...args)
  },
  contentScriptLoaded: () => {
    return true
  },
  getPagePDFContent,
  getPageContentType,
  getDocumentContent,
  getSelectedText,
  skillRun,
  skillDomInvoke,
  ping,
} as const

export function registerContentScriptRpcEvent<E extends EventKey>(ev: E, fn: (...args: Parameters<Events[E]>) => void) {
  logger.debug('registering content script rpc event', ev)
  eventEmitter.on(ev, fn)
  return () => {
    eventEmitter.off(ev, fn)
  }
}
