<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue'
import {
  useEditorShellStore,
  type PlatformCapabilities,
} from '@cute-screen/editor-vue'
import type { CaptureOutcomeV2 } from './generated/desktop-ipc'
import { tauriDesktopBridge } from './desktop-bridge'
import { listenWindowCaptureOutcome } from './platform/tauri/window-capture-events'

const props = defineProps<{ session?: PlatformCapabilities['session'] }>()
const store = useEditorShellStore()
const outcome = shallowRef<CaptureOutcomeV2['outcome']>()
const pending = shallowRef(false)
const retryButton = shallowRef<HTMLButtonElement>()
const areaButton = shallowRef<HTMLButtonElement>()
const ru = computed(() => store.locale === 'ru')
const message = computed(() => {
  if (outcome.value === 'invalidTarget') return ru.value
    ? 'Выбранное окно закрыто или изменилось. Выберите его снова.'
    : 'The selected window closed or changed. Choose it again.'
  if (outcome.value === 'unavailable') return ru.value
    ? 'В этой сессии недоступен отдельный снимок окна. Можно снять область.'
    : 'Window capture is unavailable in this session. You can capture an area.'
  if (outcome.value === 'permissionDenied') {
    if (props.session === 'macos') return ru.value
      ? 'Разрешите запись экрана в системных настройках и повторите выбор окна.'
      : 'Allow Screen Recording in system settings, then choose the window again.'
    return ru.value
      ? 'Система не разрешила захват. Повторите выбор окна и разрешите доступ.'
      : 'The system denied capture. Choose the window again and allow access.'
  }
  return ru.value
    ? 'Не удалось снять окно. Повторите выбор или снимите область.'
    : 'Could not capture the window. Choose it again or capture an area.'
})
let cleanup: (() => void) | undefined
let disposed = false
let previousFocus: HTMLElement | null = null

async function receive(result: CaptureOutcomeV2): Promise<void> {
  if (result.outcome === 'cancelled' || result.outcome === 'captured') {
    outcome.value = undefined
    return
  }
  if (result.outcome === 'busy') return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  outcome.value = result.outcome
  await nextTick()
  if (!disposed) {
    if (result.outcome === 'unavailable') areaButton.value?.focus()
    else retryButton.value?.focus()
  }
}

function dismiss(): void {
  outcome.value = undefined
  previousFocus?.focus()
}

async function openSettings(): Promise<void> {
  try {
    await tauriDesktopBridge.openScreenRecordingSettings()
  } catch (error) {
    console.warn('cute-screen Screen Recording settings failed', error)
    outcome.value = 'failed'
  }
}

async function retry(action: 'window' | 'area'): Promise<void> {
  if (pending.value) return
  pending.value = true
  outcome.value = undefined
  try {
    const result = await tauriDesktopBridge.captureRequest({
      correlationId: crypto.randomUUID(),
      action,
      delayMs: 0,
      cursor: false,
      invocationSource: 'ui',
    })
    if (action === 'window') await receive(result)
    else if (!['captured', 'cancelled'].includes(result.outcome)) outcome.value = result.outcome
  } catch (error) {
    console.warn('cute-screen capture retry failed', error)
    outcome.value = 'failed'
  } finally {
    pending.value = false
  }
}

onMounted(async () => {
  if (!('__TAURI_INTERNALS__' in window)) return
  const stop = await listenWindowCaptureOutcome((result) => {
    void receive(result)
  })
  if (disposed) stop()
  else cleanup = stop
})
onBeforeUnmount(() => {
  disposed = true
  cleanup?.()
})
</script>

<template>
  <section
    v-if="outcome"
    class="cs-window-capture-recovery"
    role="alert"
    :aria-label="ru ? 'Снимок окна' : 'Window capture'"
    @keydown.esc.stop="dismiss"
  >
    <p>{{ message }}</p>
    <div>
      <button
        ref="retryButton"
        type="button"
        :disabled="pending || outcome === 'unavailable'"
        @click="retry('window')"
      >
        {{ ru ? 'Выбрать окно снова' : 'Choose window again' }}
      </button>
      <button
        type="button"
        :disabled="pending"
        ref="areaButton"
        @click="retry('area')"
      >
        {{ ru ? 'Снять область' : 'Capture an area' }}
      </button>
      <button
        v-if="outcome === 'permissionDenied' && session === 'macos'"
        type="button"
        @click="openSettings"
      >
        {{ ru ? 'Системные настройки' : 'System settings' }}
      </button>
      <button type="button" @click="dismiss">{{ ru ? 'Закрыть' : 'Dismiss' }}</button>
    </div>
  </section>
</template>

<style scoped>
.cs-window-capture-recovery {
  position: fixed;
  z-index: 1000;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid #777;
  border-radius: 12px;
  background: #242424;
  color: #fff;
  box-shadow: 0 6px 24px #0004;
}
.cs-window-capture-recovery p {
  margin: 0 0 12px;
}
.cs-window-capture-recovery div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cs-window-capture-recovery button {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid #888;
  border-radius: 6px;
  background: #353535;
  color: inherit;
  cursor: pointer;
}
.cs-window-capture-recovery button:focus-visible {
  outline: 2px solid #8ac5ff;
  outline-offset: 2px;
}
.cs-window-capture-recovery button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
