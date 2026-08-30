<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NPopover, NTooltip } from 'naive-ui'
import { UiIcon } from '../icon'
import type { SupportedLocale, ThemePreference } from '../types'
import type { DocumentSaveState } from '../types'

const props = withDefaults(
  defineProps<{
    locale: SupportedLocale
    theme: ThemePreference
    canCopyOrExport: boolean
    canUndo?: boolean
    canRedo?: boolean
    saveState?: DocumentSaveState | undefined
    saveError?: string | undefined
    pending?: boolean
    captureAvailable?: boolean
    captureWindowAvailable?: boolean
    captureUnavailableReason?: string | undefined
    openImageAvailable?: boolean
    t: (key: Parameters<typeof import('../i18n').t>[1]) => string
  }>(),
  {
    saveState: undefined,
    saveError: undefined,
    pending: false,
    captureAvailable: true,
    captureWindowAvailable: false,
    captureUnavailableReason: undefined,
    openImageAvailable: false,
  },
)
const emit = defineEmits<{
  action: [name: 'capture' | 'captureWindow' | 'openImage' | 'copy' | 'export']
  undo: []
  redo: []
  retrySave: []
  exportRecovery: []
  locale: [value: SupportedLocale]
  theme: [value: ThemePreference]
}>()
const menuOpen = ref(false)
const disabled = computed(() => props.pending)
const captureDisabled = computed(
  () => disabled.value || !props.captureAvailable,
)
const captureTitle = computed(() =>
  props.captureAvailable
    ? props.t('capture')
    : (props.captureUnavailableReason ?? props.t('captureUnavailable')),
)
const openImageTitle = computed(() =>
  props.openImageAvailable
    ? props.t('openImage')
    : props.t('openImageUnavailable'),
)
function selectTheme(value: ThemePreference): void {
  menuOpen.value = false
  emit('theme', value)
}
function selectLocale(value: SupportedLocale): void {
  menuOpen.value = false
  emit('locale', value)
}
</script>

<template>
  <header class="cs-topbar">
    <div class="cs-brand" :aria-label="t('appName')">
      <span class="cs-brand-mark" aria-hidden="true"
        ><UiIcon name="camera"
      /></span>
      <strong>Cute Screen</strong>
    </div>
    <div class="cs-history" role="group" :aria-label="t('undo')">
      <NTooltip>
        <template #trigger>
          <NButton
            quaternary
            circle
            class="cs-icon-button"
            :aria-label="t('undo')"
            :title="t('undo')"
            :disabled="!canUndo"
            @click="emit('undo')"
          >
            <UiIcon name="undo" />
          </NButton>
        </template>
        {{ t('undo') }}
      </NTooltip>
      <NTooltip v-if="captureWindowAvailable">
        <template #trigger>
          <NButton
            secondary
            class="cs-button cs-button-quiet"
            :disabled="disabled"
            :aria-label="t('captureWindow')"
            :title="t('captureWindow')"
            @click="emit('action', 'captureWindow')"
          >
            <UiIcon name="camera" /><span>{{ t('captureWindow') }}</span>
          </NButton>
        </template>
        {{ t('captureWindow') }}
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <NButton
            quaternary
            circle
            class="cs-icon-button"
            :aria-label="t('redo')"
            :title="t('redo')"
            :disabled="!canRedo"
            @click="emit('redo')"
          >
            <UiIcon name="redo" />
          </NButton>
        </template>
        {{ t('redo') }}
      </NTooltip>
    </div>
    <p
      v-if="saveState && saveState !== 'saved'"
      class="cs-save-status"
      role="status"
      aria-live="polite"
      :data-state="saveState"
    >
      {{
        saveState === 'dirty'
          ? t('unsavedChanges')
          : saveState === 'saving'
            ? t('savingDocument')
            : saveState === 'readOnly'
              ? t('readOnlyDocument')
              : (saveError ?? t('saveFailed'))
      }}
      <NButton
        v-if="saveState === 'error'"
        class="cs-save-retry"
        @click="emit('retrySave')"
      >
        {{ t('retry') }}
      </NButton>
      <NButton
        v-if="saveState === 'error'"
        class="cs-save-retry"
        @click="emit('exportRecovery')"
      >
        {{ t('exportRecovery') }}
      </NButton>
    </p>
    <div class="cs-top-actions">
      <NTooltip>
        <template #trigger>
          <NButton
            secondary
            class="cs-button cs-button-quiet"
            :disabled="captureDisabled"
            :aria-label="t('capture')"
            :title="captureTitle"
            @click="emit('action', 'capture')"
          >
            <UiIcon name="camera" /><span>{{ t('capture') }}</span>
          </NButton>
        </template>
        {{ captureTitle }}
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <NButton
            secondary
            class="cs-button cs-button-quiet"
            :disabled="disabled || !openImageAvailable"
            :aria-label="t('openImage')"
            :title="openImageTitle"
            @click="emit('action', 'openImage')"
          >
            <UiIcon name="image" /><span>{{ t('openImage') }}</span>
          </NButton>
        </template>
        {{ openImageTitle }}
      </NTooltip>
      <NTooltip>
        <template #trigger>
          <NButton
            secondary
            class="cs-button cs-button-quiet"
            :disabled="disabled || !canCopyOrExport"
            :aria-label="t('copy')"
            :title="canCopyOrExport ? t('copy') : t('copyUnavailable')"
            @click="emit('action', 'copy')"
          >
            <UiIcon name="copy" /><span>{{ t('copy') }}</span>
          </NButton>
        </template>
        {{ canCopyOrExport ? t('copy') : t('copyUnavailable') }}
      </NTooltip>
      <NPopover
        v-model:show="menuOpen"
        trigger="click"
        placement="bottom-end"
        :show-arrow="false"
        raw
        to=".cs-overlay-root"
      >
        <template #trigger>
          <NButton
            quaternary
            circle
            class="cs-icon-button"
            :aria-expanded="menuOpen"
            :aria-label="t('moreActions')"
            :title="t('moreActions')"
          >
            <UiIcon name="more" />
          </NButton>
        </template>
        <div class="cs-menu" role="menu">
          <p>{{ t('theme') }}</p>
          <NButton
            v-for="value in ['system', 'light', 'dark'] as const"
            :key="value"
            role="menuitemradio"
            text
            :aria-checked="theme === value"
            @click="selectTheme(value)"
          >
            {{
              t(
                value === 'system'
                  ? 'systemTheme'
                  : value === 'light'
                    ? 'lightTheme'
                    : 'darkTheme',
              )
            }}
          </NButton>
          <p>{{ t('language') }}</p>
          <NButton
            v-for="value in ['ru', 'en'] as const"
            :key="value"
            role="menuitemradio"
            text
            :aria-checked="locale === value"
            @click="selectLocale(value)"
          >
            {{ value.toUpperCase() }}
          </NButton>
        </div>
      </NPopover>
      <NTooltip>
        <template #trigger>
          <NButton
            type="primary"
            class="cs-button cs-button-primary"
            :disabled="disabled || !canCopyOrExport"
            :aria-label="t('export')"
            :title="canCopyOrExport ? t('export') : t('exportUnavailable')"
            @click="emit('action', 'export')"
          >
            <UiIcon name="export" /><span>{{ t('export') }}</span>
          </NButton>
        </template>
        {{ canCopyOrExport ? t('export') : t('exportUnavailable') }}
      </NTooltip>
    </div>
  </header>
</template>
