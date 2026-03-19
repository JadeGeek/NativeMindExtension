import yaml from 'yaml'

import { SkillDefinition, SkillFrontmatter } from '@/types/skill'

type ParsedSkillMarkdown = {
  frontmatter: SkillFrontmatter
  body: string
}

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/u

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  const match = FRONTMATTER_REGEX.exec(markdown)
  if (!match) {
    throw new Error('SKILL.md is missing YAML frontmatter.')
  }
  const rawFrontmatter = match[1]
  const parsed = yaml.parse(rawFrontmatter) as Record<string, unknown>
  const frontmatter: SkillFrontmatter = {
    name: String(parsed.name ?? ''),
    description: String(parsed.description ?? ''),
    entry: typeof parsed.entry === 'string' ? parsed.entry : undefined,
    license: typeof parsed.license === 'string' ? parsed.license : undefined,
    compatibility: typeof parsed.compatibility === 'string' ? parsed.compatibility : undefined,
    metadata: typeof parsed.metadata === 'object' && parsed.metadata ? parsed.metadata as Record<string, string> : undefined,
    allowedTools: typeof parsed['allowed-tools'] === 'string'
      ? String(parsed['allowed-tools'])
      : typeof parsed.allowedTools === 'string'
        ? String(parsed.allowedTools)
        : undefined,
  }
  const body = markdown.slice(match[0].length).trim()
  return { frontmatter, body }
}

export function validateSkillName(name: string, dirName: string): string[] {
  const errors: string[] = []
  if (!name || name.length < 1 || name.length > 64) {
    errors.push('name must be 1-64 characters')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    errors.push('name must contain lowercase letters, numbers, and single hyphens')
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push('name must not start or end with hyphen')
  }
  if (name.includes('--')) {
    errors.push('name must not contain consecutive hyphens')
  }
  if (dirName && name !== dirName) {
    errors.push('name must match the skill directory name')
  }
  return errors
}

export function validateSkillFrontmatter(frontmatter: SkillFrontmatter, dirName: string): string[] {
  const errors = validateSkillName(frontmatter.name, dirName)
  const description = frontmatter.description?.trim()
  if (!description) {
    errors.push('description is required')
  }
  else if (description.length > 1024) {
    errors.push('description must be <= 1024 characters')
  }
  if (frontmatter.compatibility && frontmatter.compatibility.length > 500) {
    errors.push('compatibility must be <= 500 characters')
  }
  return errors
}

export function buildSkillMarkdown(skill: SkillDefinition): string {
  const frontmatter: SkillFrontmatter & { ['allowed-tools']?: string } = {
    name: skill.name,
    description: skill.description,
  }
  if (skill.entry) frontmatter.entry = skill.entry
  if (skill.license) frontmatter.license = skill.license
  if (skill.compatibility) frontmatter.compatibility = skill.compatibility
  if (skill.metadata && Object.keys(skill.metadata).length > 0) {
    frontmatter.metadata = skill.metadata
  }
  if (skill.allowedTools) frontmatter['allowed-tools'] = skill.allowedTools

  const frontmatterText = yaml.stringify(frontmatter).trimEnd()
  const body = skill.body?.trim() ?? ''
  return `---\n${frontmatterText}\n---\n\n${body}\n`
}
