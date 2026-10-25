<script setup lang="ts">
import {
  nextTick,
  ref,
  useId,
  watch,
} from 'vue'
import {
  NButton,
  NPopover,
  NTooltip,
} from 'naive-ui'
import { describeError } from '../../document-session'
import { UiIcon } from '../icon'
import type {
  SupportedLocale,
  ThemePreference,
  TranslationKey,
} from '../types'

const props = defineProps<{
  locale: SupportedLocale
  theme: ThemePreference
  canEditCanvas?: boolean
  connectAgent?: (() => Promise<void>) | undefined
  openSettings?: (() => Promise<void>) | undefined
  t: (key: TranslationKey) => string
}>()
const emit = defineEmits<{
  locale: [value: SupportedLocale]
  theme: [value: ThemePreference]
  canvasAction: [name: 'flipHorizontal' | 'flipVertical']
}>()
const id = useId()
const show = ref(false)
const opening = ref(false)
const error = ref<string>()
const trigger = ref<InstanceType<typeof NButton>>()
const panel = ref<HTMLElement>()

function close(restoreFocus = false): void {
  show.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.$el.focus())
}

watch(show, async (visible) => {
  if (!visible) return
  await nextTick()
  if (show.value) panel.value?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true })
}, { flush: 'post' })

function onTriggerEscape(event: KeyboardEvent): void {
  if (!show.value) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}

function flip(action: 'flipHorizontal' | 'flipVertical'): void {
  emit('canvasAction', action)
  close(true)
}

async function openApplicationSettings(agent = false): Promise<void> {
  const action = agent ? props.connectAgent : props.openSettings
  if (!action || opening.value) return
  opening.value = true
  error.value = undefined
  try {
    await action()
    close()
  } catch (cause) {
    const detail = describeError(cause, '')
    error.value = detail ? `${props.t('settingsOpenFailed')} ${detail}` : props.t('settingsOpenFailed')
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <NPopover
    v-model:show="show"
    trigger="click"
    placement="bottom-end"
    :show-arrow="false"
    raw
    to=".cs-overlay-root"
  >
    <template #trigger>
      <NTooltip :disabled="show" :delay="400">
        <template #trigger>
          <NButton
            ref="trigger"
            quaternary
            circle
            class="cs-icon-button"
            aria-haspopup="dialog"
            :aria-expanded="show"
            :aria-controls="show ? id : undefined"
            :aria-label="t('settings')"
            @keydown.esc="onTriggerEscape"
          >
            <UiIcon name="settings" />
          </NButton>
        </template>
        {{ t('settings') }}
      </NTooltip>
    </template>
    <div
      :id="id"
      ref="panel"
      class="cs-settings-popover"
      role="dialog"
      :aria-label="t('settings')"
      @keydown.esc.prevent.stop="close(true)"
    >
      <fieldset :aria-label="t('theme')">
        <legend>{{ t('appearance') }}</legend>
        <div class="cs-settings-choices">
          <label v-for="value in ['system', 'light', 'dark'] as const" :key="value">
            <input
              type="radio"
              :name="`${id}-theme`"
              :value="value"
              :checked="theme === value"
              @change="emit('theme', value)"
            />
            <span>{{ t(value === 'system' ? 'systemTheme' : value === 'light' ? 'lightTheme' : 'darkTheme') }}</span>
          </label>
        </div>
      </fieldset>
      <fieldset :aria-label="t('language')">
        <legend>{{ t('language') }}</legend>
        <div class="cs-settings-choices">
          <label v-for="value in ['ru', 'en'] as const" :key="value">
            <input
              type="radio"
              :name="`${id}-locale`"
              :value="value"
              :checked="locale === value"
              @change="emit('locale', value)"
            />
            <span>{{ value === 'ru' ? 'Русский' : 'English' }}</span>
          </label>
        </div>
      </fieldset>
      <section class="cs-settings-image-actions" :aria-label="t('imageActions')">
        <h3>{{ t('imageActions') }}</h3>
        <NButton
          v-for="action in ['flipHorizontal', 'flipVertical'] as const"
          :key="action"
          text
          :disabled="!canEditCanvas"
          @click="flip(action)"
        >
          {{ t(action) }}
        </NButton>
      </section>
      <div class="cs-settings-app-link">
        <NButton
          v-if="connectAgent"
          text
          class="cs-agent-overflow"
          :disabled="opening"
          @click="openApplicationSettings(true)"
        >
          <template #icon><UiIcon name="agent" /></template>
          {{ locale === 'ru' ? 'Подключить агента' : 'Connect agent' }}
        </NButton>
        <NButton
          text
          :loading="opening"
          :disabled="!openSettings || opening"
          :aria-label="opening ? t('settingsOpening') : t('applicationSettings')"
          :aria-describedby="!openSettings ? `${id}-unavailable` : undefined"
          @click="openApplicationSettings(false)"
        >
          {{ opening ? t('settingsOpening') : t('applicationSettings') }}
        </NButton>
        <p v-if="!openSettings" :id="`${id}-unavailable`">{{ t('settingsUnavailable') }}</p>
        <p
          v-if="error"
          class="cs-settings-open-error"
          role="alert"
        >
          {{ error }}
        </p>
      </div>
    </div>
  </NPopover>
</template>
