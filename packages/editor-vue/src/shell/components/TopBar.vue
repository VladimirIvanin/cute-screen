<script setup lang="ts">
import { computed, ref } from 'vue'
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
    captureUnavailableReason?: string | undefined
    t: (key: Parameters<typeof import('../i18n').t>[1]) => string
  }>(),
  {
    saveState: undefined,
    saveError: undefined,
    pending: false,
    captureAvailable: true,
    captureUnavailableReason: undefined,
  },
)
const emit = defineEmits<{
  action: [name: 'capture' | 'copy' | 'export']
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
      <button
        type="button"
        class="cs-icon-button"
        :aria-label="t('undo')"
        :title="t('undo')"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <UiIcon name="undo" />
      </button>
      <button
        type="button"
        class="cs-icon-button"
        :aria-label="t('redo')"
        :title="t('redo')"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <UiIcon name="redo" />
      </button>
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
      <button
        v-if="saveState === 'error'"
        type="button"
        class="cs-save-retry"
        @click="emit('retrySave')"
      >
        {{ t('retry') }}
      </button>
      <button
        v-if="saveState === 'error'"
        type="button"
        class="cs-save-retry"
        @click="emit('exportRecovery')"
      >
        {{ t('exportRecovery') }}
      </button>
    </p>
    <div class="cs-top-actions">
      <button
        type="button"
        class="cs-button cs-button-quiet"
        :disabled="captureDisabled"
        :aria-label="t('capture')"
        :title="captureTitle"
        @click="emit('action', 'capture')"
      >
        <UiIcon name="camera" /><span>{{ t('capture') }}</span>
      </button>
      <button
        type="button"
        class="cs-button cs-button-quiet"
        :disabled="disabled || !canCopyOrExport"
        :aria-label="t('copy')"
        :title="canCopyOrExport ? t('copy') : t('copyUnavailable')"
        @click="emit('action', 'copy')"
      >
        <UiIcon name="copy" /><span>{{ t('copy') }}</span>
      </button>
      <div class="cs-overflow">
        <button
          type="button"
          class="cs-icon-button"
          :aria-expanded="menuOpen"
          :aria-label="t('moreActions')"
          :title="t('moreActions')"
          @click="menuOpen = !menuOpen"
        >
          <UiIcon name="more" />
        </button>
        <div v-if="menuOpen" class="cs-menu" role="menu">
          <p>{{ t('theme') }}</p>
          <button
            v-for="value in ['system', 'light', 'dark'] as const"
            :key="value"
            type="button"
            role="menuitemradio"
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
          </button>
          <p>{{ t('language') }}</p>
          <button
            v-for="value in ['ru', 'en'] as const"
            :key="value"
            type="button"
            role="menuitemradio"
            :aria-checked="locale === value"
            @click="selectLocale(value)"
          >
            {{ value.toUpperCase() }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="cs-button cs-button-primary"
        :disabled="disabled || !canCopyOrExport"
        :aria-label="t('export')"
        :title="canCopyOrExport ? t('export') : t('exportUnavailable')"
        @click="emit('action', 'export')"
      >
        <UiIcon name="export" /><span>{{ t('export') }}</span>
      </button>
    </div>
  </header>
</template>
