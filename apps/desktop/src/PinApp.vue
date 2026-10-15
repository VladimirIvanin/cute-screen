<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PinWindowStateV1 } from './generated/desktop-ipc'
import {
  closeCurrentPinWindow,
  startPinDrag,
  startPinResize,
} from './platform/tauri/pin-window-adapter'

const state = ref<PinWindowStateV1>()
const imageUrl = ref<string>()
const error = ref<string>()
const opacity = ref(100)
let ownedUrl: string | undefined
let syncTimer: number | undefined

async function load(): Promise<void> {
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const current = await tauriDesktopBridge.getPinState()
    state.value = current
    opacity.value = current.opacity
    const staged = await tauriDesktopBridge.stageImage(
      current.snapshotToken,
      `pin-${Date.now()}`,
    )
    if (staged.assetUrl) imageUrl.value = staged.assetUrl
    else {
      const bytes = await tauriDesktopBridge.readImageBytes(
        current.snapshotToken,
        `pin-${Date.now()}`,
      )
      ownedUrl = URL.createObjectURL(
        new Blob([bytes], { type: staged.mimeType }),
      )
      imageUrl.value = ownedUrl
    }
    syncTimer = window.setInterval(() => void updateState(), 750)
  } catch (reason) {
    error.value =
      reason instanceof Error
        ? reason.message
        : 'Pin snapshot is no longer available.'
    window.setTimeout(() => void closeCurrentPinWindow(), 1600)
  }
}
async function updateState(): Promise<void> {
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    state.value = await tauriDesktopBridge.updatePinState(opacity.value)
  } catch (reason) {
    console.warn('cute-screen pin state update failed', reason)
  }
}
async function closePin(): Promise<void> {
  const { tauriDesktopBridge } = await import('./desktop-bridge')
  await tauriDesktopBridge.closePin()
}
function drag(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('button,input')) return
  void startPinDrag()
}
function resize(): void {
  void startPinResize()
}
onMounted(() => void load())
onBeforeUnmount(() => {
  window.clearInterval(syncTimer)
  if (ownedUrl) URL.revokeObjectURL(ownedUrl)
})
</script>

<template>
  <main
    class="cs-pin"
    :style="{ '--pin-opacity': opacity / 100 }"
    @pointerdown="drag"
  >
    <img
      v-if="imageUrl"
      :src="imageUrl"
      alt="Pinned Cute Screen result"
      draggable="false"
    />
    <p v-else-if="error" role="alert">{{ error }}</p>
    <div v-else class="cs-pin-loading" aria-label="Loading pin">···</div>
    <div v-if="state" class="cs-pin-controls">
      <label
        ><span>Opacity</span
        ><input
          v-model.number="opacity"
          type="range"
          min="25"
          max="100"
          step="5"
          @change="updateState"
      /></label>
      <button type="button" aria-label="Close pin" @click="closePin">×</button>
    </div>
    <button
      v-if="state"
      class="cs-pin-resize"
      type="button"
      aria-label="Resize pin"
      @pointerdown.stop="resize"
    >
      ◢
    </button>
  </main>
</template>

<style scoped>
.cs-pin {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #101216;
  color: #f7f8fa;
  font:
    12px Inter,
    system-ui,
    sans-serif;
  user-select: none;
}
.cs-pin img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: var(--pin-opacity);
  pointer-events: none;
}
.cs-pin > p,
.cs-pin-loading {
  display: grid;
  height: 100%;
  margin: 0;
  place-items: center;
  padding: 16px;
  text-align: center;
}
.cs-pin-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #ffffff26;
  border-radius: 9px;
  background: #101216db;
  opacity: 0;
  transition: opacity 120ms ease;
}
.cs-pin:hover .cs-pin-controls,
.cs-pin:focus-within .cs-pin-controls {
  opacity: 1;
}
.cs-pin-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-pin-controls input {
  width: 88px;
}
.cs-pin-controls button,
.cs-pin-resize {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 20px;
}
.cs-pin-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 7px;
  opacity: 0;
}
.cs-pin:hover .cs-pin-resize,
.cs-pin:focus-within .cs-pin-resize {
  opacity: 0.85;
}
</style>
