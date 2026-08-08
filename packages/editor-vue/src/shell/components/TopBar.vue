<script setup lang="ts">
import { computed, ref } from 'vue'
import { UiIcon } from '../icon'
import type { SupportedLocale, ThemePreference } from '../types'

const props = defineProps<{
  locale: SupportedLocale
  theme: ThemePreference
  canCopyOrExport: boolean
  pending?: boolean
  t: (key: Parameters<typeof import('../i18n').t>[1]) => string
}>()
const emit = defineEmits<{
  action: [name: 'capture' | 'copy' | 'export']
  locale: [value: SupportedLocale]
  theme: [value: ThemePreference]
}>()
const menuOpen = ref(false)
const disabled = computed(() => props.pending)
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
        disabled
      >
        <UiIcon name="undo" />
      </button>
      <button
        type="button"
        class="cs-icon-button"
        :aria-label="t('redo')"
        :title="t('redo')"
        disabled
      >
        <UiIcon name="redo" />
      </button>
    </div>
    <div class="cs-top-actions">
      <button
        type="button"
        class="cs-button cs-button-quiet"
        :disabled="disabled"
        :aria-label="t('capture')"
        :title="t('capture')"
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
