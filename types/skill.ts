export type SkillFrontmatter = {
  name: string
  description: string
  entry?: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string
}

export type SkillPermissionState = {
  approved: boolean
  approvedAt?: number
  allowedTools?: string
}

export type SkillAllowedTools = {
  dom: {
    read: boolean
    write: boolean
  }
  sw: {
    tabs: boolean
    fetch: boolean
    storage: boolean
    contextMenu: boolean
  }
}

export type SkillFile = {
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
}

export type SkillDefinition = SkillFrontmatter & {
  body: string
  files: SkillFile[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type SkillMetadata = Pick<SkillDefinition, 'name' | 'description' | 'enabled'>
