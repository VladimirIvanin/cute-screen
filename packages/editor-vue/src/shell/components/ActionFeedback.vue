<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { CaptureProgressState } from '../../platform'
import type {
  AsyncActionName,
  AsyncActionState,
} from '../types'
const props = defineProps<{
  state: AsyncActionState
  t: (
    key:
      | 'cancel'
      | 'retry'
      | 'reopen'
      | 'capturePermissionSettings'
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
const emit = defineEmits<{ cancel: []; retry: []; settings: [] }>()
function reopensApp(): boolean {
  return props.state.status === 'error' && props.state.recovery === 'relaunch'
}
const actionKey: Record<
  AsyncActionName,
  'captureAction' | 'captureWindowAction' | 'openImageAction' | 'copyAction' | 'exportAction'
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
        (state.action === 'capture' || state.action === 'captureWindow') && state.captureProgress
          ? t(progressKey[state.captureProgress])
          : `${t(actionKey[state.action])}…`
      }}
    </span>
    <span v-else>{{ state.message }}</span>
    <progress
      v-if="state.status === 'pending' && state.progress !== undefined"
      :value="state.progress"
      max="1"
    />
    <span v-if="state.status === 'pending' && state.progress !== undefined">{{ Math.round(state.progress * 100) }}%</span>
    <NButton
      v-if="reopensApp()"
      text
      @click="emit('settings')"
    >
      {{ t('capturePermissionSettings') }}
    </NButton>
    <NButton
      v-if="state.status === 'pending'"
      text
      @click="emit('cancel')"
    >
      {{ t('cancel') }}
    </NButton>
    <NButton
      v-else-if="state.status === 'error'"
      text
      @click="emit('retry')"
    >
      {{ reopensApp() ? t('reopen') : t('retry') }}
    </NButton>
  </div>
</template>
