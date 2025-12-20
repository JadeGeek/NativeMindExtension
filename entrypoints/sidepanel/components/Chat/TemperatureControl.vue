<template>
  <Selector
    v-model="selected"
    :options="options"
    containerClass="min-w-[64px] h-6"
    dropdownClass="text-xs text-text-primary w-20"
    dropdownAlign="left"
    :placeholder="t('chat.temperature.label')"
  >
    <template #button="{ option }">
      <div class="flex items-center gap-0.5 px-[2px] py-[1px] h-6 rounded-sm text-[11px] text-text-secondary hover:text-text-primary cursor-pointer">
        <IconIdea class="w-4 h-4" />
        <span>{{ option?.label ?? displayValue }}</span>
      </div>
    </template>
    <template #option="{ option }">
      <div class="text-xs">
        {{ option.label }}
      </div>
    </template>
  </Selector>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import IconIdea from '@/assets/icons/idea-stroke-rounded.svg?component'
import Selector from '@/components/Selector.vue'
import { useI18n } from '@/utils/i18n'
import { getUserConfig } from '@/utils/user-config'

import { Chat } from '../../utils/chat'

const { t } = useI18n()
const userConfig = await getUserConfig()
const chat = await Chat.getInstance()

const temperatureRef = computed<number>({
  get() {
    return chat.historyManager.chatHistory.value.temperature ?? userConfig.llm.temperature.get()
  },
  set(value: number) {
    const clamped = Math.min(1, Math.max(0, value))
    chat.historyManager.chatHistory.value.temperature = clamped
    userConfig.llm.temperature.set(clamped)
  },
})

const displayValue = computed(() => temperatureRef.value.toFixed(1))

const options = Array.from({ length: 11 }, (_, i) => {
  const value = (i / 10).toFixed(1)
  return { id: value, label: value }
})

const selected = computed({
  get() {
    return displayValue.value
  },
  set(value: string | undefined) {
    const numeric = value ? parseFloat(value) : temperatureRef.value
    if (!Number.isNaN(numeric)) temperatureRef.value = numeric
  },
})
</script>
