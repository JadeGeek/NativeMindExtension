import { SkillDefinition, SkillMetadata } from '@/types/skill'
import { getUserConfig } from '@/utils/user-config'

import { listAllSkillFiles, removeSkillFiles } from './files'

export async function listSkills(): Promise<SkillDefinition[]> {
  const userConfig = await getUserConfig()
  const skills = userConfig.chat.skills.items.get() as SkillDefinition[]
  const filesMap = await listAllSkillFiles()
  return skills.map((skill) => ({
    ...skill,
    files: Array.isArray(filesMap[skill.name]) ? filesMap[skill.name] : [],
  }))
}

export async function listSkillMetadata(): Promise<SkillMetadata[]> {
  const skills = await listSkills()
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
  }))
}

export async function getSkillByName(name: string): Promise<SkillDefinition | undefined> {
  const userConfig = await getUserConfig()
  const skills = userConfig.chat.skills.items.get() as SkillDefinition[]
  const filesMap = await listAllSkillFiles()
  const skill = skills.find((item) => item.name === name)
  if (!skill) return undefined
  return {
    ...skill,
    files: Array.isArray(filesMap[skill.name]) ? filesMap[skill.name] : [],
  }
}

export async function upsertSkill(nextSkill: SkillDefinition): Promise<void> {
  const userConfig = await getUserConfig()
  const skills = userConfig.chat.skills.items.get() as SkillDefinition[]
  const { files: _files, ...rest } = nextSkill
  const storedSkill: SkillDefinition = { ...rest, files: [] }
  const existingIndex = skills.findIndex((skill) => skill.name === nextSkill.name)
  if (existingIndex >= 0) {
    skills.splice(existingIndex, 1, storedSkill)
  }
  else {
    skills.push(storedSkill)
  }
  userConfig.chat.skills.items.set([...skills])
}

export async function removeSkill(name: string): Promise<void> {
  const userConfig = await getUserConfig()
  const skills = (userConfig.chat.skills.items.get() as SkillDefinition[]).filter((skill) => skill.name !== name)
  userConfig.chat.skills.items.set(skills)
  await removeSkillFiles(name)
}

export async function setSkills(skills: SkillDefinition[]): Promise<void> {
  const userConfig = await getUserConfig()
  const normalized = skills.map((skill) => ({ ...skill, files: [] }))
  userConfig.chat.skills.items.set(normalized)
}
