<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { CaptureProgressState } from '../../platform'
import type { AsyncActionName, AsyncActionState } from '../types'
defineProps<{
  state: AsyncActionState
  t: (
    key:
      | 'cancel'
      | 'retry'
      | 'captureAction'
      | 'captureWindowAction'
      | 'openImageAction'
      | 'copyAction'
      | 'exportAction'
      | 'captureProbing'
      | 'captureReady'
      | 'captureDelay'
      | 'captureSelecting'
      | 'captureCapturing'
      | 'capturePersisting'
      | 'captureQuickEditing',
  ) => string
}>()
const emit = defineEmits<{ cancel: []; retry: [] }>()
const actionKey: Record<
  AsyncActionName,
  | 'captureAction'
  | 'captureWindowAction'
  | 'openImageAction'
  | 'copyAction'
  | 'exportAction'
> = {
  capture: 'captureAction',
  captureWindow: 'captureWindowAction',
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
  | 'captureQuickEditing'
> = {
  probing: 'captureProbing',
  ready: 'captureReady',
  delay: 'captureDelay',
  selecting: 'captureSelecting',
  capturing: 'captureCapturing',
  persisting: 'capturePersisting',
  quickEditing: 'captureQuickEditing',
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
        (state.action === 'capture' || state.action === 'captureWindow') &&
        state.captureProgress
          ? t(progressKey[state.captureProgress])
          : `${t(actionKey[state.action])}…`
      }}
    </span>
    <span v-else>{{ state.message }}</span>
    <NButton v-if="state.status === 'pending'" text @click="emit('cancel')">
      {{ t('cancel') }}
    </NButton>
    <NButton v-else-if="state.status === 'error'" text @click="emit('retry')">
      {{ t('retry') }}
    </NButton>
  </div>
</template>
