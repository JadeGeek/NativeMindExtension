const pendingApiCalls = new Map()

function serializeError(error) {
  if (error instanceof Error) {
    const cause = error.cause
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: cause instanceof Error
        ? { name: cause.name, message: cause.message, stack: cause.stack }
        : cause,
    }
  }
  if (error && typeof error === 'object') {
    const message = typeof error.message === 'string' ? error.message : undefined
    const keys = Object.getOwnPropertyNames(error)
    const type = Object.prototype.toString.call(error)
    const stringValue = String(error)
    return {
      message,
      type,
      keys,
      string: stringValue,
      cause: typeof error.cause !== 'undefined' ? error.cause : undefined,
      ...error,
    }
  }
  return { message: String(error) }
}

function formatSkillError(error) {
  const serialized = serializeError(error)
  const message = typeof serialized?.message === 'string' && serialized.message.trim()
    ? serialized.message
    : typeof error === 'string' && error.trim()
      ? error
      : 'Skill run failed'
  return {
    message,
    details: JSON.stringify(serialized, null, 2),
  }
}

function ensureAllowed(allowed, target, tool) {
  if (target === 'dom') {
    const readTools = new Set(['querySelector', 'querySelectorAll', 'getTextList', 'getText', 'getAttribute', 'getDocumentHtml', 'getWindowJson', 'getWindowValue', 'fetchText'])
    const writeTools = new Set(['setText', 'click', 'clickByText', 'setValue', 'setAttribute'])
    if (readTools.has(tool) && !allowed.dom.read) throw new Error('DOM read access denied')
    if (writeTools.has(tool) && !allowed.dom.write) throw new Error('DOM write access denied')
  }
  if (target === 'sw') {
    const map = {
      fetchText: allowed.sw.fetch,
      getAllTabs: allowed.sw.tabs,
      getTabInfoById: allowed.sw.tabs,
      storageGet: allowed.sw.storage,
      storageSet: allowed.sw.storage,
      contextMenuCreate: allowed.sw.contextMenu,
      contextMenuUpdate: allowed.sw.contextMenu,
      contextMenuDelete: allowed.sw.contextMenu,
    }
    if (tool in map && !map[tool]) throw new Error(`SW ${tool} access denied`)
  }
}

function createApiCaller(name, allowedTools, tabId) {
  const call = (target, tool, args) => {
    ensureAllowed(allowedTools, target, tool)
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      pendingApiCalls.set(id, { resolve, reject, tool, args })
      window.parent.postMessage({ type: 'skill-api', request: { id, name, target, tool, args, tabId } }, '*')
    })
  }
  return {
    dom: {
      querySelector: (selector) => call('dom', 'querySelector', [selector]),
      querySelectorAll: (selector) => call('dom', 'querySelectorAll', [selector]),
      getTextList: (selector) => call('dom', 'getTextList', [selector]),
      getText: (selector) => call('dom', 'getText', [selector]),
      setText: (selector, text) => call('dom', 'setText', [selector, text]),
      click: (selector) => call('dom', 'click', [selector]),
      clickByText: (selector, candidates) => call('dom', 'clickByText', [selector, candidates]),
      setValue: (selector, value) => call('dom', 'setValue', [selector, value]),
      getAttribute: (selector, nameAttr) => call('dom', 'getAttribute', [selector, nameAttr]),
      setAttribute: (selector, nameAttr, value) => call('dom', 'setAttribute', [selector, nameAttr, value]),
      getDocumentHtml: () => call('dom', 'getDocumentHtml', []),
      getWindowJson: (nameKey) => call('dom', 'getWindowJson', [nameKey]),
      getWindowValue: (path) => call('dom', 'getWindowValue', [path]),
      fetchText: (url, init) => call('dom', 'fetchText', [url, init]),
    },
    sw: {
      fetchText: (url, init) => call('sw', 'fetchText', [url, init]),
      getAllTabs: () => call('sw', 'getAllTabs', []),
      getTabInfoById: (tab) => call('sw', 'getTabInfoById', [tab]),
      storageGet: (key) => call('sw', 'storageGet', [key]),
      storageSet: (key, value) => call('sw', 'storageSet', [key, value]),
      contextMenuCreate: (id, props) => call('sw', 'contextMenuCreate', [id, props]),
      contextMenuUpdate: (id, props) => call('sw', 'contextMenuUpdate', [id, props]),
      contextMenuDelete: (id) => call('sw', 'contextMenuDelete', [id]),
    },
  }
}

async function runSkill(request) {
  const api = createApiCaller(request.name, request.allowedTools, request.tabId)
  const module = { exports: {} }
  const runner = new Function('api', 'args', 'module', 'exports', `"use strict";\n${request.source}`)
  try {
    runner(api, request.args, module, module.exports)
  }
  catch (error) {
    if (error instanceof Error) throw error
    const wrapped = new Error('Skill script error')
    wrapped.cause = error
    throw wrapped
  }
  const exported = module.exports
  if (!exported || typeof exported.run !== 'function') {
    throw new Error('Skill script must export a run() function')
  }
  return await exported.run({ api, args: request.args })
}

window.addEventListener('message', async (event) => {
  const payload = event.data || {}
  if (payload.type === 'sandbox-ping') {
    window.parent.postMessage({ type: 'sandbox-ready' }, '*')
    return
  }
  if (payload.type === 'skill-run') {
    const request = payload.request
    try {
      const result = await runSkill(request)
      window.parent.postMessage({ type: 'skill-result', id: request.id, result }, '*')
    }
    catch (error) {
      const formatted = formatSkillError(error)
      if (formatted.details === '{}') {
        formatted.details = JSON.stringify({
          message: formatted.message,
          type: typeof error,
          string: String(error),
        }, null, 2)
      }
      window.parent.postMessage({ type: 'skill-result', id: request.id, error: formatted.message, errorDetails: formatted.details }, '*')
    }
  }
  if (payload.type === 'skill-api-result') {
    const { id, result, error, errorDetails } = payload
    const pending = pendingApiCalls.get(id)
    if (!pending) return
    pendingApiCalls.delete(id)
    if (error) {
      const detail = typeof errorDetails === 'string'
        ? errorDetails
        : typeof error === 'string'
          ? error
          : JSON.stringify(error ?? {})
      const resolvedDetail = detail || JSON.stringify({
        tool: pending.tool,
        args: pending.args,
        rawError: error ?? null,
        rawDetails: errorDetails ?? null,
      })
      pending.reject(new Error(resolvedDetail))
    }
    else {
      pending.resolve(result)
    }
  }
})

window.parent.postMessage({ type: 'sandbox-ready' }, '*')
