import { SkillAllowedTools } from '@/types/skill'

const DEFAULT_ALLOWED_TOOLS: SkillAllowedTools = {
  dom: { read: false, write: false },
  sw: { tabs: false, fetch: false, storage: false, contextMenu: false },
}

export function parseAllowedTools(input?: string): SkillAllowedTools {
  if (!input) return structuredClone(DEFAULT_ALLOWED_TOOLS)
  const allowed: SkillAllowedTools = structuredClone(DEFAULT_ALLOWED_TOOLS)
  const normalized = input.trim()
  const blocks = [...normalized.matchAll(/([A-Za-z]+)\(([^)]*)\)/g)]
  for (const block of blocks) {
    const scope = block[1].toLowerCase()
    const tools = block[2].split(/[,\s]+/).filter(Boolean).map((t) => t.toLowerCase())
    if (scope === 'dom') {
      allowed.dom.read = tools.includes('read') || allowed.dom.read
      allowed.dom.write = tools.includes('write') || allowed.dom.write
    }
    if (scope === 'sw') {
      allowed.sw.tabs = tools.includes('tabs') || allowed.sw.tabs
      allowed.sw.fetch = tools.includes('fetch') || allowed.sw.fetch
      allowed.sw.storage = tools.includes('storage') || allowed.sw.storage
      allowed.sw.contextMenu = tools.includes('contextmenu') || allowed.sw.contextMenu
    }
  }
  return allowed
}
