import { SkillAllowedTools } from '@/types/skill'

type SkillRunParams = {
  name: string
  source: string
  args?: unknown
  allowedTools: SkillAllowedTools
  invokeSw: (request: { name: string, tool: string, args: unknown[] }) => Promise<unknown>
  timeoutMs?: number
}

type DomApi = {
  querySelector: (selector: string) => Element | null
  querySelectorAll: (selector: string) => Element[]
  getTextList: (selector: string) => string[]
  getText: (selector: string) => string
  setText: (selector: string, text: string) => boolean
  click: (selector: string) => boolean
  clickByText: (selector: string, candidates: string[]) => boolean
  setValue: (selector: string, value: string) => boolean
  getAttribute: (selector: string, name: string) => string | null
  setAttribute: (selector: string, name: string, value: string) => boolean
}

type SkillApi = {
  dom: DomApi
  sw: {
    fetchText: (url: string, init?: RequestInit) => Promise<string>
    getAllTabs: () => Promise<unknown>
    getTabInfoById: (tabId: number) => Promise<unknown>
    storageGet: (key: string) => Promise<unknown>
    storageSet: (key: string, value: unknown) => Promise<void>
    contextMenuCreate: (id: string, props: unknown) => Promise<unknown>
    contextMenuUpdate: (id: string, props: unknown) => Promise<unknown>
    contextMenuDelete: (menuId: string) => Promise<unknown>
  }
}

function ensureRead(allowed: SkillAllowedTools) {
  if (!allowed.dom.read) throw new Error('DOM read access denied')
}

function ensureWrite(allowed: SkillAllowedTools) {
  if (!allowed.dom.write) throw new Error('DOM write access denied')
}

function buildDomApi(allowed: SkillAllowedTools): DomApi {
  return {
    querySelector: (selector) => {
      ensureRead(allowed)
      return document.querySelector(selector)
    },
    querySelectorAll: (selector) => {
      ensureRead(allowed)
      return Array.from(document.querySelectorAll(selector))
    },
    getTextList: (selector) => {
      ensureRead(allowed)
      return Array.from(document.querySelectorAll(selector)).map((el) => el.textContent?.trim() || '')
    },
    getText: (selector) => {
      ensureRead(allowed)
      return document.querySelector(selector)?.textContent ?? ''
    },
    setText: (selector, text) => {
      ensureWrite(allowed)
      const el = document.querySelector(selector)
      if (!el) return false
      el.textContent = text
      return true
    },
    click: (selector) => {
      ensureWrite(allowed)
      const el = document.querySelector(selector) as HTMLElement | null
      if (!el) return false
      el.click()
      return true
    },
    clickByText: (selector, candidates) => {
      ensureWrite(allowed)
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
    },
    setValue: (selector, value) => {
      ensureWrite(allowed)
      const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) return false
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    },
    getAttribute: (selector, name) => {
      ensureRead(allowed)
      const el = document.querySelector(selector)
      return el?.getAttribute(name) ?? null
    },
    setAttribute: (selector, name, value) => {
      ensureWrite(allowed)
      const el = document.querySelector(selector)
      if (!el) return false
      el.setAttribute(name, value)
      return true
    },
  }
}

function buildSwApi(allowed: SkillAllowedTools, name: string, invokeSw: SkillRunParams['invokeSw']): SkillApi['sw'] {
  return {
    fetchText: async (url, init) => {
      if (!allowed.sw.fetch) throw new Error('SW fetch access denied')
      return await invokeSw({ name, tool: 'fetchText', args: [url, init] }) as string
    },
    getAllTabs: async () => {
      if (!allowed.sw.tabs) throw new Error('SW tabs access denied')
      return await invokeSw({ name, tool: 'getAllTabs', args: [] })
    },
    getTabInfoById: async (tabId) => {
      if (!allowed.sw.tabs) throw new Error('SW tabs access denied')
      return await invokeSw({ name, tool: 'getTabInfoById', args: [tabId] })
    },
    storageGet: async (key) => {
      if (!allowed.sw.storage) throw new Error('SW storage access denied')
      return await invokeSw({ name, tool: 'storageGet', args: [key] })
    },
    storageSet: async (key, value) => {
      if (!allowed.sw.storage) throw new Error('SW storage access denied')
      await invokeSw({ name, tool: 'storageSet', args: [key, value] })
    },
    contextMenuCreate: async (id, props) => {
      if (!allowed.sw.contextMenu) throw new Error('SW contextMenu access denied')
      return await invokeSw({ name, tool: 'contextMenuCreate', args: [id, props] })
    },
    contextMenuUpdate: async (id, props) => {
      if (!allowed.sw.contextMenu) throw new Error('SW contextMenu access denied')
      return await invokeSw({ name, tool: 'contextMenuUpdate', args: [id, props] })
    },
    contextMenuDelete: async (menuId) => {
      if (!allowed.sw.contextMenu) throw new Error('SW contextMenu access denied')
      return await invokeSw({ name, tool: 'contextMenuDelete', args: [menuId] })
    },
  }
}

export async function runSkillScript({ name, source, args, allowedTools, invokeSw, timeoutMs = 8000 }: SkillRunParams) {
  const dom = buildDomApi(allowedTools)
  const sw = buildSwApi(allowedTools, name, invokeSw)
  const api: SkillApi = { dom, sw }

  const executor = async () => {
    const module = { exports: {} as Record<string, unknown> }
    const runner = new Function('api', 'args', 'module', 'exports', `"use strict";\n${source}`)
    runner(api, args, module, module.exports)
    const exported = module.exports as { run?: (input: { api: SkillApi, args?: unknown }) => Promise<unknown> | unknown }
    if (exported?.run) {
      return await exported.run({ api, args })
    }
    throw new Error('Skill script must export a run() function')
  }

  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer)
      reject(new Error('Skill script timed out'))
    }, timeoutMs)
  })

  return await Promise.race([executor(), timeoutPromise])
}
