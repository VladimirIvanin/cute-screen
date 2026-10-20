<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
} from 'vue'
import {
  NButton,
  NTooltip,
} from 'naive-ui'
import { UiIcon } from '../icon'
import EditorSettingsPopover from './EditorSettingsPopover.vue'
import BrandMark from '../assets/BrandMark.vue'
import { attachBrandEyes } from '../brand/brand-eyes'
import type {
  SupportedLocale,
  ThemePreference,
} from '../types'
import type { DocumentSaveState } from '../types'

const props = withDefaults(
  defineProps<{
    locale: SupportedLocale
    theme: ThemePreference
    appearanceOpen?: boolean
    canCopyOrExport: boolean
    canEditCanvas?: boolean
    canUndo?: boolean
    canRedo?: boolean
    saveState?: DocumentSaveState | undefined
    saveError?: string | undefined
    pending?: boolean
    captureAvailable?: boolean
    captureUnavailableReason?: string | undefined
    openImageAvailable?: boolean
    openSettings?: (() => Promise<void>) | undefined
    t: (key: Parameters<typeof import('../i18n').t>[1]) => string
  }>(),
  {
    saveState: undefined,
    saveError: undefined,
    pending: false,
    captureAvailable: true,
    captureUnavailableReason: undefined,
    openImageAvailable: false,
    openSettings: undefined,
  },
)
const emit = defineEmits<{
  appearance: []
  action: [name: 'capture' | 'openImage' | 'copy' | 'export']
  canvasAction: [name: 'flipHorizontal' | 'flipVertical']
  undo: []
  redo: []
  retrySave: []
  exportRecovery: []
  locale: [value: SupportedLocale]
  theme: [value: ThemePreference]
}>()
const disabled = computed(() => props.pending)
const brand = ref<HTMLElement>()
let disposeBrand: (() => void) | undefined
onMounted(() => {
  if (brand.value) disposeBrand = attachBrandEyes(brand.value)
})
onUnmounted(() => disposeBrand?.())
const captureDisabled = computed(() => disabled.value || !props.captureAvailable)
const captureTitle = computed(() =>
  props.captureAvailable ? props.t('capture') : (props.captureUnavailableReason ?? props.t('captureUnavailable')))
const openImageTitle = computed(() =>
  props.openImageAvailable ? props.t('openImage') : props.t('openImageUnavailable'))
</script>

<template>
  <header class="cs-topbar">
    <div
      ref="brand"
      class="cs-brand"
      :aria-label="t('appName')"
    >
      <span class="cs-brand-mark" aria-hidden="true">
        <BrandMark />
      </span>
      <strong>Cute Screen</strong>
    </div>
    <div
      class="cs-history"
      role="group"
      :aria-label="t('undo')"
    >
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
      <NButton
        secondary
        class="cs-button cs-appearance-button"
        :disabled="disabled || !canEditCanvas"
        :aria-expanded="Boolean(appearanceOpen)"
        :aria-label="locale === 'ru' ? 'Оформление' : 'Appearance'"
        @click="emit('appearance')"
      >
        <UiIcon name="palette" /><span>{{ locale === 'ru' ? 'Оформление' : 'Appearance' }}</span>
      </NButton>
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
      <EditorSettingsPopover
        :locale="locale"
        :theme="theme"
        :can-edit-canvas="canEditCanvas"
        :open-settings="openSettings"
        :t="t"
        @canvas-action="emit('canvasAction', $event)"
        @locale="emit('locale', $event)"
        @theme="emit('theme', $event)"
      />
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
