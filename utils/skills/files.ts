import type { SkillFile } from '@/types/skill'
import { getUserConfig } from '@/utils/user-config'

export async function listAllSkillFiles(): Promise<Record<string, SkillFile[]>> {
  const userConfig = await getUserConfig()
  return userConfig.chat.skills.files.get() as Record<string, SkillFile[]>
}

export async function getSkillFiles(name: string): Promise<SkillFile[]> {
  const filesMap = await listAllSkillFiles()
  const files = filesMap[name]
  return Array.isArray(files) ? files : []
}

export async function setSkillFiles(name: string, files: SkillFile[]): Promise<void> {
  const userConfig = await getUserConfig()
  const filesMap = userConfig.chat.skills.files.get() as Record<string, SkillFile[]>
  userConfig.chat.skills.files.set({
    ...filesMap,
    [name]: files,
  })
}

export async function removeSkillFiles(name: string): Promise<void> {
  const userConfig = await getUserConfig()
  const filesMap = userConfig.chat.skills.files.get() as Record<string, SkillFile[]>
  if (!(name in filesMap)) return
  const nextMap = { ...filesMap }
  delete nextMap[name]
  userConfig.chat.skills.files.set(nextMap)
}
