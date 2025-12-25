<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import Checkbox from '@/components/Checkbox.vue'
import Input from '@/components/Input.vue'
import Loading from '@/components/Loading.vue'
import ScrollTarget from '@/components/ScrollTarget.vue'
import Button from '@/components/ui/Button.vue'
import Text from '@/components/ui/Text.vue'
import WarningMessage from '@/components/WarningMessage.vue'
import { useValueGuard } from '@/composables/useValueGuard'
import { SettingsScrollTarget } from '@/types/scroll-targets'
import { MIN_CONTEXT_WINDOW_SIZE } from '@/utils/constants'
import { useI18n } from '@/utils/i18n'
import { useLLMBackendStatusStore } from '@/utils/pinia-store/store'
import { settings2bRpc } from '@/utils/rpc'
import { getUserConfig } from '@/utils/user-config'

import Block from '../../Block.vue'
import SavedMessage from '../../SavedMessage.vue'
import Section from '../../Section.vue'

defineProps<{
  scrollTarget?: SettingsScrollTarget
}>()

const { t } = useI18n()
const llmBackendStatusStore = useLLMBackendStatusStore()
const { openaiConnectionStatus: connectionStatus } = storeToRefs(llmBackendStatusStore)
const userConfig = await getUserConfig()
const baseUrl = userConfig.llm.backends.openai.baseUrl.toRef()
const apiKey = userConfig.llm.apiKey.toRef()
const endpointType = userConfig.llm.endpointType.toRef()
const open = userConfig.settings.blocks.openaiConfig.open.toRef()
const { value: numCtx, guardedValue: guardedNumCtx, errorMessage: numCtxError } = useValueGuard(userConfig.llm.backends.openai.numCtx.toRef(), (value) => {
  return {
    isValid: value >= MIN_CONTEXT_WINDOW_SIZE,
    errorMessage: t('settings.openai.context_window_size_error', { min: MIN_CONTEXT_WINDOW_SIZE }),
  }
})
const enableNumCtx = userConfig.llm.backends.openai.enableNumCtx.toRef()
const loading = ref(false)

const testConnection = async () => {
  loading.value = true
  try {
    const models = await llmBackendStatusStore.updateOpenAIModelList()
    const success = connectionStatus.value === 'connected'
    if (!success || models.length === 0) {
      llmBackendStatusStore.clearOpenAIModelList()
    }
    settings2bRpc.updateSidepanelModelList()
    return success
  }
  finally {
    loading.value = false
  }
}

watch([baseUrl, apiKey], () => {
  // ensure switching to OpenAI backend if user configures it explicitly
  if (endpointType.value === 'web-llm') return
  if (endpointType.value !== 'openai-compatible') endpointType.value = 'openai-compatible'
})

// Refresh status when the OpenAI block is opened and OpenAI is the active endpoint
watch(open, async (isOpen) => {
  if (isOpen) {
    await testConnection()
  }
}, { immediate: true })
</script>

<template>
  <Block
    v-model:open="open"
    :title="t('settings.providers.openai.title')"
    collapsible
  >
    <div class="flex flex-col gap-4">
      <Section>
        <div class="flex flex-col gap-3">
          <ScrollTarget
            :autoScrollIntoView="scrollTarget === 'openai-server-address-section'"
            showHighlight
            class="w-full"
          >
            <Section
              :title="t('settings.openai.server_address')"
              class="w-full"
            >
              <div class="flex flex-col gap-1">
                <div class="flex gap-3 items-stretch">
                  <Input
                    v-model="baseUrl"
                    class="rounded-md py-2 px-4 grow"
                    wrapperClass="w-full"
                  />
                </div>
                <Text
                  color="secondary"
                  size="xs"
                  display="block"
                >
                  {{ t('settings.openai.server_address_desc') }}
                </Text>
                <SavedMessage :watch="baseUrl" />
              </div>
            </Section>
          </ScrollTarget>
          <Section
            :title="t('settings.openai.api_key')"
            class="w-full"
          >
            <div class="flex flex-col gap-1">
              <div class="flex gap-3 items-stretch">
                <Input
                  v-model="apiKey"
                  type="password"
                  class="rounded-md py-2 px-4 grow"
                  wrapperClass="w-full"
                />
              </div>
              <Text
                color="secondary"
                size="xs"
                display="block"
              >
                {{ t('settings.openai.api_key_desc') }}
              </Text>
              <SavedMessage :watch="apiKey" />
            </div>
          </Section>
          <Section class="w-full">
            <template #title>
              <div class="flex justify-between">
                <Text
                  class="font-medium text-sm"
                  display="block"
                >
                  {{ t('settings.openai.context_window_size') }}
                </Text>
                <div class="flex gap-2 items-center">
                  <Checkbox v-model="enableNumCtx">
                    <template #label>
                      <Text
                        class="font-medium text-xs"
                        display="block"
                      >
                        {{ t('settings.openai.custom_context_window_size') }}
                      </Text>
                    </template>
                  </Checkbox>
                </div>
              </div>
            </template>
            <div class="flex flex-col gap-1">
              <div class="flex gap-3 items-stretch">
                <Input
                  v-model="numCtx"
                  min="512"
                  :error="!!numCtxError"
                  type="number"
                  :disabled="!enableNumCtx"
                  class="rounded-md py-2 px-4 grow"
                  wrapperClass="w-full"
                />
              </div>
              <div>
                <Text
                  color="secondary"
                  size="xs"
                  display="block"
                >
                  {{ t('settings.openai.context_window_size_desc') }}
                </Text>
                <SavedMessage
                  v-if="!numCtxError"
                  :watch="[guardedNumCtx, enableNumCtx]"
                />
              </div>
              <WarningMessage
                v-if="numCtxError"
                class="text-xs"
                :message="numCtxError"
              />
            </div>
          </Section>
          <div class="flex items-center justify-center flex-wrap gap-2 w-full font-medium">
            <Button
              variant="secondary"
              class="flex items-center justify-center min-h-8 min-w-40 py-1"
              @click="testConnection"
            >
              <Loading
                v-if="loading"
                :size="12"
              />
              <span v-else>
                {{ t('settings.general.refresh_status') }}
              </span>
            </Button>
            <div class="text-xs text-text-secondary">
              {{ t('settings.openai.connection_status', { status: connectionStatus }) }}
            </div>
          </div>
        </div>
      </Section>
    </div>
  </Block>
</template>
