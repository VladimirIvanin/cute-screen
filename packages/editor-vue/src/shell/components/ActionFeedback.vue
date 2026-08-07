<script setup lang="ts">
import type { AsyncActionState } from '../types'
defineProps<{
  state: AsyncActionState
  t: (key: 'cancel' | 'retry') => string
}>()
const emit = defineEmits<{ cancel: []; retry: [] }>()
</script>

<template>
  <div
    v-if="state.status !== 'idle'"
    class="cs-action-feedback"
    :class="`is-${state.status}`"
    :role="state.status === 'error' ? 'alert' : 'status'"
  >
    <span v-if="state.status === 'pending'">{{ state.action }}…</span>
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
