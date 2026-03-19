import JSZip from 'jszip'

import { SkillDefinition, SkillFile } from '@/types/skill'

import { getSkillFiles } from './files'
import { buildSkillMarkdown, parseSkillMarkdown, validateSkillFrontmatter } from './parse'

const TEXT_EXTENSIONS = new Set([
  'md',
  'txt',
  'json',
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sh',
  'yaml',
  'yml',
  'css',
  'html',
  'svg',
])

function isTextPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? TEXT_EXTENSIONS.has(ext) : false
}

function pickRootDir(paths: string[]): string | null {
  const skillMdPath = paths.find((path) => /(^|\/)SKILL\.md$/i.test(path))
  if (!skillMdPath) return null
  const parts = skillMdPath.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return parts[0]
}

export async function importSkillZip(file: File): Promise<{ skill: SkillDefinition, files: SkillFile[] }> {
  const zip = await JSZip.loadAsync(file)
  const paths = Object.keys(zip.files)
  const rootDir = pickRootDir(paths)
  if (!rootDir) {
    throw new Error('SKILL.md not found in zip.')
  }
  const skillMdEntry = zip.file(`${rootDir}/SKILL.md`)
  if (!skillMdEntry) {
    throw new Error('SKILL.md not found in skill root.')
  }
  const skillMdContent = await skillMdEntry.async('string')
  const parsed = parseSkillMarkdown(skillMdContent)
  const errors = validateSkillFrontmatter(parsed.frontmatter, rootDir)
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }
  if (parsed.frontmatter.entry) {
    const normalizedEntry = parsed.frontmatter.entry.replace(/^\/+/, '')
    if (normalizedEntry.includes('..')) {
      throw new Error('Invalid entry path in SKILL.md.')
    }
    const entryZipPath = `${rootDir}/${normalizedEntry}`
    if (!zip.file(entryZipPath)) {
      throw new Error(`Entry script not found: ${normalizedEntry}`)
    }
    const extension = normalizedEntry.split('.').pop()?.toLowerCase()
    if (extension !== 'js' && extension !== 'ts') {
      throw new Error(`Unsupported entry script type: ${normalizedEntry}`)
    }
    parsed.frontmatter.entry = normalizedEntry
  }

  const files: SkillFile[] = []
  await Promise.all(
    paths
      .filter((path) => path.startsWith(`${rootDir}/`))
      .filter((path) => !path.endsWith('/'))
      .filter((path) => !path.endsWith('/SKILL.md'))
      .map(async (path) => {
        const relativePath = path.slice(rootDir.length + 1)
        const entry = zip.file(path)
        if (!entry) return
        if (isTextPath(path)) {
          const content = await entry.async('string')
          files.push({ path: relativePath, content, encoding: 'utf-8' })
        }
        else {
          const content = await entry.async('base64')
          files.push({ path: relativePath, content, encoding: 'base64' })
        }
      }),
  )

  const timestamp = Date.now()
  const skill: SkillDefinition = {
    ...parsed.frontmatter,
    body: parsed.body,
    files: [],
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return { skill, files }
}

export async function exportSkillZip(skill: SkillDefinition): Promise<Blob> {
  const zip = new JSZip()
  const root = zip.folder(skill.name)
  if (!root) {
    throw new Error('Failed to create skill zip.')
  }
  const skillMarkdown = buildSkillMarkdown(skill)
  root.file('SKILL.md', skillMarkdown)
  const files = await getSkillFiles(skill.name)
  if (files.length === 0 && skill.entry) {
    throw new Error('Skill files missing; re-import the skill.')
  }
  files.forEach((file) => {
    if (file.encoding === 'base64') {
      root.file(file.path, file.content, { base64: true })
    }
    else {
      root.file(file.path, file.content)
    }
  })
  return zip.generateAsync({ type: 'blob' })
}
