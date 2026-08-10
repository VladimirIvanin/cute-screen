<script setup lang="ts">
import type { CaptureProgressState } from '../../platform'
import type { AsyncActionName, AsyncActionState } from '../types'
defineProps<{
  state: AsyncActionState
  t: (
    key:
      | 'cancel'
      | 'retry'
      | 'captureAction'
      | 'openImageAction'
      | 'copyAction'
      | 'exportAction'
      | 'captureProbing'
      | 'captureReady'
      | 'captureDelay'
      | 'captureSelecting'
      | 'captureCapturing'
      | 'capturePersisting',
  ) => string
}>()
const emit = defineEmits<{ cancel: []; retry: [] }>()
const actionKey: Record<
  AsyncActionName,
  'captureAction' | 'openImageAction' | 'copyAction' | 'exportAction'
> = {
  capture: 'captureAction',
  openImage: 'openImageAction',
  copy: 'copyAction',
  export: 'exportAction',
}
const progressKey: Record<
  CaptureProgressState,
  | 'captureProbing'
  | 'captureReady'
  | 'captureDelay'
  | 'captureSelecting'
  | 'captureCapturing'
  | 'capturePersisting'
> = {
  probing: 'captureProbing',
  ready: 'captureReady',
  delay: 'captureDelay',
  selecting: 'captureSelecting',
  capturing: 'captureCapturing',
  persisting: 'capturePersisting',
}
</script>

<template>
  <div
    v-if="state.status !== 'idle'"
    class="cs-action-feedback"
    :class="`is-${state.status}`"
    :role="state.status === 'error' ? 'alert' : 'status'"
  >
    <span v-if="state.status === 'pending'">
      {{
        state.action === 'capture' && state.captureProgress
          ? t(progressKey[state.captureProgress])
          : `${t(actionKey[state.action])}…`
      }}
    </span>
    <span v-else>{{ state.message }}</span>
    <button
      v-if="state.status === 'pending'"
      type="button"
      @click="emit('cancel')"
    >
      {{ t('cancel') }}
    </button>
    <button
      v-else-if="state.status === 'error'"
      type="button"
      @click="emit('retry')"
    >
      {{ t('retry') }}
    </button>
  </div>
</template>
