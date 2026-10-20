<script setup lang="ts">
import { UiIcon } from '../icon'
import type { TranslationKey } from '../types'
defineProps<{ copied: boolean; command: string; t: (key: TranslationKey) => string }>()
defineEmits<{ copy: []; dismiss: [] }>()
</script>
<template>
  <div
    class="cs-capture-fallback"
    role="status"
    aria-live="polite"
    data-placement="overlay"
  >
    <span>{{ t('captureFallback') }}</span>
    <code>{{ command }}</code>
    <button
      type="button"
      :aria-label="t('copyCaptureFallback')"
      @click="$emit('copy')"
    >
      {{ copied ? t('captureFallbackCopied') : t('copyCaptureFallback') }}
    </button>
    <button
      class="cs-capture-fallback-dismiss"
      type="button"
      :aria-label="t('dismissCaptureFallback')"
      :title="t('dismissCaptureFallback')"
      @click="$emit('dismiss')"
    >
      <UiIcon name="close" />
    </button>
  </div>
</template>
