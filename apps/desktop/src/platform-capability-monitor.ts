import type { PlatformCapabilities } from '@cute-screen/editor-vue'
import {
  onScopeDispose,
  shallowRef,
} from 'vue'

interface CapabilityMonitorPorts {
  read(): Promise<PlatformCapabilities>
  apply(value: PlatformCapabilities): void
  reportError(error: unknown): void
}

/** A temporary compositor/IPC failure must not disable capture for the window's lifetime. */
export function createPlatformCapabilityMonitor(ports: CapabilityMonitorPorts) {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Promise<void> | undefined

  function probe(attempt: number): Promise<void> {
    if (disposed) return Promise.resolve()
    if (pending) return pending
    clearTimeout(timer)
    pending = (async () => {
      let ready = false
      try {
        const value = await ports.read()
        if (disposed) return
        ports.apply(value)
        ready = value.capture.interactiveSelector || value.capture.monitorTarget
      } catch (error) {
        if (!disposed) ports.reportError(error)
      } finally {
        pending = undefined
        if (
          !disposed &&
          !ready &&
          attempt < 2
        ) {
          timer = setTimeout(() => {
            void probe(attempt + 1)
          }, 1000)
        }
      }
    })()
    return pending
  }

  return {
    refresh: () => probe(0),
    dispose: () => {
      disposed = true
      clearTimeout(timer)
    },
  }
}

export function useDesktopCapabilities(correlationId: () => string) {
  const platformCapabilities = shallowRef<PlatformCapabilities>()
  let active = true
  const monitor = createPlatformCapabilityMonitor({
    read: async () => {
      const { tauriDesktopBridge } = await import('./desktop-bridge')
      return tauriDesktopBridge.platformCapabilities(correlationId())
    },
    apply: (value) => {
      platformCapabilities.value = value
    },
    reportError: (error) => {
      console.warn('cute-screen platform capability probe failed', error)
    },
  })
  async function refreshPlatformCapabilities(): Promise<void> {
    if (import.meta.env.VITE_TEST_HARNESS === 'true' || !('__TAURI_INTERNALS__' in window)) return
    await monitor.refresh()
  }
  onScopeDispose(() => {
    active = false
    monitor.dispose()
    window.removeEventListener('focus', refreshPlatformCapabilities)
  })
  return {
    platformCapabilities,
    refreshPlatformCapabilities,
    listenForCapabilityChanges: () => {
      if (active) window.addEventListener('focus', refreshPlatformCapabilities)
    },
  }
}
