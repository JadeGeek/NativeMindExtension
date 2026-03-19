import { SkillDefinition } from '@/types/skill'

export function buildSkillActivationContext(skill: SkillDefinition, userInput?: string): string {
  const inputPart = userInput?.trim()
  const inputSection = inputPart ? `\n\n# User Input\n${inputPart}` : ''
  return `<skill_instructions>
<name>${skill.name}</name>
<description>${skill.description}</description>
<instructions>
${skill.body}
</instructions>
${inputSection}
</skill_instructions>`
}
