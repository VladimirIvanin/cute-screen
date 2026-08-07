<script setup lang="ts">
import { computed, ref } from 'vue'
import logoUrl from '../../../logo.svg?url'

import {
  tauriDesktopBridge,
  type DesktopBridge,
  type PingResponse,
} from './desktop-bridge'

const props = withDefaults(
  defineProps<{
    bridge?: DesktopBridge
  }>(),
  {
    bridge: () => tauriDesktopBridge,
  },
)

type BridgeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: PingResponse }
  | { status: 'error'; message: string }

const state = ref<BridgeState>({ status: 'idle' })
const actionLabel = computed(() =>
  state.value.status === 'error'
    ? 'Retry desktop bridge'
    : 'Check desktop bridge',
)

async function checkBridge(): Promise<void> {
  state.value = { status: 'loading' }

  try {
    const response = await props.bridge.ping()
    state.value = { status: 'ready', response }
  } catch (error: unknown) {
    state.value = {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Unknown desktop bridge error',
    }
  }
}
</script>

<template>
  <main class="foundation-shell">
    <section class="foundation-card" aria-labelledby="foundation-title">
      <img :src="logoUrl" alt="" width="64" height="64" />
      <p class="eyebrow">M00 · Foundation</p>
      <h1 id="foundation-title">Cute Screen workspace is ready</h1>
      <p class="description">
        Capture, editor, and renderer features are intentionally not implemented
        yet.
      </p>

      <button
        type="button"
        :disabled="state.status === 'loading'"
        @click="checkBridge"
      >
        {{ state.status === 'loading' ? 'Checking…' : actionLabel }}
      </button>

      <p v-if="state.status === 'ready'" role="status" class="status success">
        Desktop bridge ready · protocol {{ state.response.protocolVersion }}
      </p>
      <p v-else-if="state.status === 'error'" role="alert" class="status error">
        {{ state.message }}
      </p>
    </section>
  </main>
</template>
