<template>
  <div
    ref="settingsRef"
    class="flex flex-col font-inter"
  >
    <BlockTitle
      :title="t('settings.chat.title')"
      :description="t('settings.chat.description')"
    />
    <div class="flex flex-col gap-4">
      <Block :title="t('settings.chat.basic_config.title')">
        <div class="flex flex-col gap-6">
          <Section
            :title="t('settings.chat.basic_config.chat_model')"
            :description="t('settings.chat.basic_config.chat_model_description')"
          >
            <div class="flex flex-col gap-2 items-start">
              <ModelSelector
                ref="modelSelectorRef"
                class="max-w-full"
                containerClass="max-w-64"
                type="buttons"
                dropdownAlign="left"
                showDetails
                showDiscoverMore
                allowDelete
                @deleteModel="deleteOllamaModel"
              />
            </div>
          </Section>
          <Section
            :title="t('settings.chat.basic_config.chat_system_prompt')"
            :description="t('settings.chat.basic_config.chat_system_prompt_description')"
          >
            <Textarea
              v-model="chatSystemPrompt"
              :resetDefault="resetDefaultChatSystemPrompt"
            />
          </Section>
          <Section
            :title="t('settings.chat.basic_config.thinking_visibility')"
            :description="t('settings.chat.basic_config.thinking_visibility_description')"
          >
            <RadioGroup
              v-model="thinkingVisibility"
              :options="thinkingVisibilityRadioOptions"
            />
          </Section>
        </div>
      </Block>
      <ScrollTarget
        :autoScrollIntoView="settingsQuery.scrollTarget.matchAndRemove('quick-actions-block')"
        showHighlight
      >
        <Block :title="t('settings.chat.quick_actions.title')">
          <template #action>
            <Button
              variant="secondary"
              class="min-h-8 px-[10px]"
              @click="resetDefaultQuickActions"
            >
              <Text
                size="xs"
                class="font-medium"
              >
                {{ t('settings.chat.quick_actions.reset_to_default') }}
              </Text>
            </Button>
          </template>
          <div class="flex flex-col gap-4">
            <EditCard
              v-for="(action, index) in quickActions"
              :key="index"
              v-model:title="action.editedTitle"
              v-model:prompt="action.prompt"
              v-model:showInContextMenu="action.showInContextMenu"
              v-model:edited="action.edited"
              :defaultTitle="t(defaultQuickActions[index].defaultTitleKey)"
            />
          </div>
        </Block>
      </ScrollTarget>
      <Block :title="t('settings.chat.skills.title')">
        <template #action>
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              class="min-h-8 px-[10px]"
              @click="triggerSkillImport"
            >
              <Text
                size="xs"
                class="font-medium"
              >
                {{ t('settings.chat.skills.import') }}
              </Text>
            </Button>
          </div>
        </template>
        <div class="flex flex-col gap-3">
          <input
            ref="skillImportInputRef"
            type="file"
            accept=".zip"
            class="hidden"
            @change="onImportSkill"
          >
          <div
            v-if="skills.length === 0"
            class="text-sm text-text-secondary"
          >
            {{ t('settings.chat.skills.empty') }}
          </div>
          <div
            v-for="skill in skills"
            :key="skill.name"
            class="flex flex-col gap-2 rounded-md border border-border-strong bg-bg-secondary px-3 py-2"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-sm font-medium text-text-primary">
                  /{{ skill.name }}
                </div>
                <div class="text-xs text-text-secondary line-clamp-2">
                  {{ skill.description }}
                </div>
                <div class="mt-1 text-[11px] text-text-tertiary">
                  {{ t('settings.chat.skills.entry') }}:
                  <span v-if="skill.entry">{{ skill.entry }}</span>
                  <span v-else>{{ t('settings.chat.skills.entry_none') }}</span>
                  <span
                    v-if="skill.entry && !hasSkillEntryFile(skill)"
                    class="ml-1 text-warning"
                  >
                    ({{ t('settings.chat.skills.entry_missing') }})
                  </span>
                </div>
                <div class="text-[11px] text-text-tertiary">
                  {{ t('settings.chat.skills.files') }}: {{ getSkillFilesCount(skill.name) }}
                </div>
                <details
                  v-if="getSkillFilesCount(skill.name) > 0"
                  class="text-[11px] text-text-tertiary"
                >
                  <summary class="cursor-pointer">
                    {{ t('settings.chat.skills.files_view') }}
                  </summary>
                  <ul class="mt-1 list-disc pl-4">
                    <li
                      v-for="file in getSkillFilesList(skill.name)"
                      :key="file.path"
                      class="break-all"
                    >
                      {{ file.path }}
                    </li>
                  </ul>
                </details>
                <div
                  v-if="skill.allowedTools"
                  class="mt-1 text-[11px] text-text-tertiary"
                >
                  {{ t('settings.chat.skills.allowed_tools') }}: {{ skill.allowedTools }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox v-model="skill.enabled" />
                <Button
                  variant="secondary"
                  class="min-h-7 px-2"
                  @click="setSkillApproval(skill.name, !isSkillApproved(skill.name))"
                >
                  <Text
                    size="xs"
                    class="font-medium"
                  >
                    {{ isSkillApproved(skill.name) ? t('settings.chat.skills.revoke') : t('settings.chat.skills.approve') }}
                  </Text>
                </Button>
                <Button
                  variant="secondary"
                  class="min-h-7 px-2"
                  @click="exportSkill(skill.name)"
                >
                  <Text
                    size="xs"
                    class="font-medium"
                  >
                    {{ t('settings.chat.skills.export') }}
                  </Text>
                </Button>
                <Button
                  variant="secondary"
                  class="min-h-7 px-2"
                  @click="removeSkillByName(skill.name)"
                >
                  <Text
                    size="xs"
                    class="font-medium"
                  >
                    {{ t('settings.chat.skills.delete') }}
                  </Text>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Block>
    </div>
  </div>
</template>

<script setup lang="tsx">
import { computed, type Ref, ref, watch } from 'vue'

import Checkbox from '@/components/Checkbox.vue'
import ModelSelector from '@/components/ModelSelector.vue'
import RadioGroup from '@/components/RadioGroup.vue'
import ScrollTarget from '@/components/ScrollTarget.vue'
import Textarea from '@/components/Textarea.vue'
import Button from '@/components/ui/Button.vue'
import Text from '@/components/ui/Text.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useLogger } from '@/composables/useLogger'
import { useToast } from '@/composables/useToast'
import type { SkillDefinition, SkillFile, SkillPermissionState } from '@/types/skill'
import { useI18n } from '@/utils/i18n'
import { settings2bRpc } from '@/utils/rpc'
import { listSkills, removeSkill, upsertSkill } from '@/utils/skills'
import { setSkillFiles } from '@/utils/skills/files'
import { exportSkillZip, importSkillZip } from '@/utils/skills/zip'
import { getUserConfig } from '@/utils/user-config'

import { useSettingsInitialQuery } from '../../composables/useQuery'
import { deleteOllamaModel } from '../../utils/llm'
import Block from '../Block.vue'
import BlockTitle from '../BlockTitle.vue'
import Section from '../Section.vue'
import EditCard from './QuickAction/EditCard.vue'

const { t, locale } = useI18n()
const logger = useLogger()
const toast = useToast()

const confirm = useConfirm()
const settingsQuery = useSettingsInitialQuery()
const userConfig = await getUserConfig()
const chatSystemPromptConfig = userConfig.chat.systemPrompt
const chatSystemPrompt = chatSystemPromptConfig.toRef()
const resetDefaultChatSystemPrompt = computed(() => {
  if (chatSystemPrompt.value !== chatSystemPromptConfig.getDefault()) {
    return () => chatSystemPromptConfig.resetDefault()
  }
  return undefined
})
const quickActions = userConfig.chat.quickActions.actions.toRef()
const defaultQuickActions = userConfig.chat.quickActions.actions.getDefault()
const skills = userConfig.chat.skills.items.toRef() as Ref<SkillDefinition[]>
const skillFiles = userConfig.chat.skills.files.toRef() as Ref<Record<string, SkillFile[]>>
const skillPermissions = userConfig.chat.skills.permissions.toRef() as Ref<Record<string, SkillPermissionState>>
const thinkingVisibility = userConfig.chat.thinkingVisibility.toRef()
const skillImportInputRef = ref<HTMLInputElement | null>(null)

const thinkingVisibilityRadioOptions = computed(() => [
  {
    value: 'hide' as const,
    label: t('settings.chat.basic_config.thinking_visibility_hide'),
    tips: t('settings.chat.basic_config.thinking_visibility_hide_description'),
  },
  {
    value: 'preview' as const,
    label: t('settings.chat.basic_config.thinking_visibility_preview'),
    tips: t('settings.chat.basic_config.thinking_visibility_preview_description'),
  },
  {
    value: 'full' as const,
    label: t('settings.chat.basic_config.thinking_visibility_full'),
    tips: t('settings.chat.basic_config.thinking_visibility_full_description'),
  },
])
const resetDefaultQuickActions = () => {
  confirm({
    message: t('settings.chat.quick_actions.reset_to_default_confirm'),
    onConfirm() { userConfig.chat.quickActions.actions.resetDefault() },
  })
}

const actions = userConfig.chat.quickActions.actions.toRef()
watch(() => {
  const watchValues = actions.value.map((action) => {
    return [action.edited, action.editedTitle, action.showInContextMenu, action.prompt]
  }).flat()
  return JSON.stringify([...watchValues, locale.value])
}, async (_, oldV) => {
  // don't update context menu when the document is not visible, otherwise all tabs will update in the same time
  if (oldV && document.visibilityState !== 'visible') return
  const parentId = 'native-mind-quick-actions'
  await settings2bRpc.deleteContextMenu(parentId).catch((err) => logger.debug(err))
  const showInContextMenuActions = actions.value.filter((action) => action.showInContextMenu)
  if (showInContextMenuActions.length > 0) {
    await settings2bRpc.createContextMenu(parentId, {
      title: t('context_menu.quick_actions.title'),
      contexts: ['all'],
    })
    for (let i = 0; i < actions.value.length; i++) {
      const action = actions.value[i]
      if (!action.showInContextMenu) continue
      await settings2bRpc.createContextMenu(`native-mind-quick-actions-${i}`, {
        title: action.edited ? action.editedTitle : undefined,
        titleKey: action.edited ? undefined : action.defaultTitleKey,
        contexts: ['all'],
        parentId,
        needOpenSidepanel: true,
      })
    }
  }
}, { immediate: true })

const triggerSkillImport = () => {
  skillImportInputRef.value?.click()
}

const onImportSkill = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const { skill, files } = await importSkillZip(file)
    await setSkillFiles(skill.name, files)
    await upsertSkill(skill)
    const preview = files.map((item) => item.path).slice(0, 3).join(', ')
    toast(t('settings.chat.skills.import_success', {
      count: files.length,
      files: preview || t('settings.chat.skills.files_empty'),
    }))
  }
  catch (error) {
    logger.error('Failed to import skill', error)
    const message = error instanceof Error ? error.message : t('settings.chat.skills.import_failed')
    toast(t('settings.chat.skills.import_failed', { error: message }), { type: 'error' })
  }
  finally {
    input.value = ''
  }
}

const exportSkill = async (name: string) => {
  const list = await listSkills()
  const skill = list.find((item) => item.name === name)
  if (!skill) return
  const blob = await exportSkillZip(skill)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${skill.name}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const removeSkillByName = async (name: string) => {
  await removeSkill(name)
}

const isSkillApproved = (name: string) => {
  const permission = skillPermissions.value[name]
  const skill = skills.value.find((entry) => entry.name === name)
  return permission?.approved === true && permission?.allowedTools === (skill?.allowedTools ?? '')
}

const setSkillApproval = (name: string, approved: boolean) => {
  const skill = skills.value.find((entry) => entry.name === name)
  skillPermissions.value = {
    ...skillPermissions.value,
    [name]: {
      approved,
      approvedAt: approved ? Date.now() : undefined,
      allowedTools: approved ? (skill?.allowedTools ?? '') : undefined,
    },
  }
}

const hasSkillEntryFile = (skill: SkillDefinition) => {
  if (!skill.entry) return false
  return getSkillFilesList(skill.name).some((file) => file.path === skill.entry)
}

const getSkillFilesList = (name: string) => {
  return Array.isArray(skillFiles.value[name]) ? skillFiles.value[name] : []
}

const getSkillFilesCount = (name: string) => {
  return getSkillFilesList(name).length
}
</script>
