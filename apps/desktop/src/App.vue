<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import {
  DocumentSessionController,
  DocumentSessionCoordinator,
  EditorShell,
  ActionCancelledError,
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type CaptureOutcomeV1,
  type CaptureProgressState,
  type CaptureProgressV1,
  type FrameSummary,
  type EditorDocumentV1,
  type PlatformCapabilities,
  type ShellActionAdapter,
  type ShellDocumentState,
} from '@cute-screen/editor-vue'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot(): { crop: unknown; saveState: string } | undefined
    }
    __cuteScreenE2eM05?: {
      snapshot(): EditorDocumentV1 | undefined
    }
  }
}

const fixture =
  import.meta.env.VITE_TEST_HARNESS === 'true'
    ? ((new URLSearchParams(window.location.search).get('m02') as
        'empty' | 'error' | 'loading' | 'ready' | null) ?? 'empty')
    : 'empty'
const m03Harness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m03') === '1'
const m04CaptureHarness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m04') === '1'
const m05Harness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m05') === '1'

const testActions: ShellActionAdapter | undefined =
  import.meta.env.VITE_TEST_HARNESS === 'true' && !m04CaptureHarness
    ? {
        run: (action, signal) =>
          new Promise((resolve, reject) => {
            const timer = window.setTimeout(
              () => resolve(`${action} completed`),
              150,
            )
            signal.addEventListener(
              'abort',
              () => {
                window.clearTimeout(timer)
                reject(new DOMException('Cancelled', 'AbortError'))
              },
              { once: true },
            )
          }),
      }
    : undefined

const desktopActions: ShellActionAdapter | undefined =
  import.meta.env.VITE_TEST_HARNESS === 'true' && !m04CaptureHarness
    ? testActions
    : '__TAURI_INTERNALS__' in window
      ? {
          run: async (action, signal, reportCaptureProgress) => {
            if (action !== 'capture') {
              throw new Error(`${action} is not available yet`)
            }
            const flush = await documentSession.value?.flush()
            if (flush?.kind === 'failed') {
              throw new Error(flush.error)
            }
            const { tauriDesktopBridge } = await import('./desktop-bridge')
            const onAbort = () => {
              void tauriDesktopBridge.captureCancel().catch((error) => {
                console.warn('cute-screen capture cancellation failed', error)
              })
            }
            signal.addEventListener('abort', onAbort, { once: true })
            try {
              reportCaptureProgress?.('probing')
              const capabilities =
                platformCapabilities.value ??
                (await tauriDesktopBridge.platformCapabilities(correlationId()))
              platformCapabilities.value = capabilities
              if (signal.aborted) {
                throw new DOMException('Cancelled', 'AbortError')
              }
              if (!capabilities.capture.available) {
                throw new Error(
                  'Capture is unavailable in this desktop session',
                )
              }
              reportCaptureProgress?.('ready')
              const captureAction =
                capabilities.session === 'x11' &&
                capabilities.capture.monitorTarget &&
                !capabilities.capture.interactiveSelector
                  ? 'screen'
                  : 'area'
              const outcome = await tauriDesktopBridge.captureRequest({
                correlationId: correlationId(),
                action: captureAction,
                delayMs: 0,
                cursor: false,
                invocationSource: 'ui',
              })
              if (outcome.outcome === 'captured') {
                const mounted = await mountCapturedDocument()
                if (!mounted) {
                  throw new Error(
                    'Capture was saved, but the editor could not open it',
                  )
                }
                return 'Capture opened'
              }
              if (outcome.outcome === 'cancelled') {
                throw new ActionCancelledError('Capture cancelled')
              }
              throw new Error(`Capture ${outcome.outcome}`)
            } finally {
              signal.removeEventListener('abort', onAbort)
            }
          },
        }
      : undefined

const documentSession = shallowRef<DocumentSessionController>()
const documentCoordinator = shallowRef<DocumentSessionCoordinator>()
const platformCapabilities = shallowRef<PlatformCapabilities>()
const captureProgress = shallowRef<CaptureProgressState>()
const seriesFrames = shallowRef<readonly FrameSummary[]>([])
const sourceImage = shallowRef<HTMLImageElement>()
let capturedDocumentMount: Promise<boolean> | undefined
const documentState = shallowRef<ShellDocumentState>({ kind: 'loading' })
const readOnlyDocument = shallowRef(false)
const initialDocumentState =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  !m03Harness &&
  !m04CaptureHarness
    ? undefined
    : documentState
const lifecycleCleanup: Array<() => void> = []
const captureAvailable = computed(() =>
  import.meta.env.VITE_TEST_HARNESS === 'true' ||
  !('__TAURI_INTERNALS__' in window)
    ? true
    : (platformCapabilities.value?.capture.available ?? false),
)
const captureFallbackCommand = computed(() =>
  platformCapabilities.value?.cliFallback
    ? platformCapabilities.value.cliFallbackCommand
    : undefined,
)

function correlationId(): string {
  return `m03-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function refreshPlatformCapabilities(): Promise<void> {
  if (import.meta.env.VITE_TEST_HARNESS === 'true') return
  if (!('__TAURI_INTERNALS__' in window)) return
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    platformCapabilities.value =
      await tauriDesktopBridge.platformCapabilities(correlationId())
  } catch (error) {
    console.warn('cute-screen platform capability probe failed', error)
  }
}

async function loadPersistedDocument(): Promise<boolean> {
  if (
    import.meta.env.VITE_TEST_HARNESS === 'true' &&
    !m03Harness &&
    !m04CaptureHarness
  )
    return true
  documentState.value = { kind: 'loading' }
  readOnlyDocument.value = false
  try {
    // Keep the native API out of browser-mode bundles: merely evaluating the
    // Tauri bridge is not supported by all test WebViews.
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const record = await tauriDesktopBridge.repositoryOpenLast(correlationId())
    if (!record) {
      await closeDocumentSession()
      documentState.value = { kind: 'empty' }
      return false
    }
    const frames =
      await tauriDesktopBridge.repositoryListActiveSeriesFrames(correlationId())
    seriesFrames.value = frames.map((frame, index) => ({
      id: frame.captureId,
      label: String(index + 1),
      selected: frame.captureId === record.captureId,
    }))
    const parsed = parsePersistedDocument(record)
    if (record.imageToken) {
      await loadImageWithBinaryFallback({
        token: record.imageToken,
        correlationId: correlationId(),
        bridge: tauriDesktopBridge,
        createResource: async (image) => {
          sourceImage.value = image
          return image
        },
      })
    } else {
      sourceImage.value = undefined
    }
    if (parsed.kind === 'readOnly') {
      await closeDocumentSession()
      readOnlyDocument.value = true
      documentState.value = {
        kind: 'ready',
        title: `Document ${record.documentId.slice(0, 8)}`,
        dimensions: 'Compatibility mode',
      }
      return true
    }
    const incoming = {
      documentId: record.documentId,
      document: parsed.document,
      revision: record.revision,
    }
    const coordinator = documentCoordinator.value
    if (coordinator) {
      const handoff = await coordinator.handoff(incoming)
      if (handoff.kind === 'failed') throw new Error(handoff.flush.error)
    } else {
      const created = createDocumentCoordinator(tauriDesktopBridge)
      created.openInitial(incoming)
      documentCoordinator.value = created
    }
    if (m03Harness) {
      window.__cuteScreenE2eDocument = {
        setCrop: () => {
          const active = documentSession.value
          if (!active) throw new Error('M03 session is not ready')
          active.execute({
            type: 'setCrop',
            before: active.snapshot.core.document.crop,
            after: { x: 0, y: 0, width: 120, height: 80 },
          })
        },
        snapshot: () => {
          const active = documentSession.value
          return active
            ? {
                crop: active.snapshot.core.document.crop,
                saveState: active.snapshot.saveState,
              }
            : undefined
        },
      }
    }
    return true
  } catch (error) {
    documentState.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    return false
  }
}

function loadM05HarnessImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error('M05 fixture failed')),
      { once: true },
    )
    image.src =
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="120"%3E%3Crect width="160" height="120" fill="%23273d5a"/%3E%3C/svg%3E'
  })
}

async function mountM05HarnessDocument(): Promise<void> {
  const hash = 'f'.repeat(64)
  const document: EditorDocumentV1 = {
    schemaVersion: 2,
    id: '019c1f62-058e-7000-8000-000000000005',
    source: {
      blobHash: hash,
      format: 'svg',
      mimeType: 'image/svg+xml',
      width: 160,
      height: 120,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 160, height: 120 },
    crop: { x: 20, y: 15, width: 100, height: 80 },
    layers: [
      {
        id: '019c1f62-058e-7000-8000-000000000101',
        kind: 'image',
        localBounds: { x: 0, y: 0, width: 160, height: 120 },
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 1,
        visible: true,
        locked: true,
        payload: {
          blobHash: hash,
          intrinsicWidth: 160,
          intrinsicHeight: 120,
          format: 'svg',
          orientationApplied: true,
          color: { colorSpace: 'srgb', hasIccProfile: false },
          role: 'base',
        },
      },
      ...[
        '019c1f62-058e-7000-8000-000000000102',
        '019c1f62-058e-7000-8000-000000000103',
        '019c1f62-058e-7000-8000-000000000104',
      ].map((id, index) => ({
        id,
        kind: 'shape' as const,
        localBounds: { x: 0, y: 0, width: 60, height: 40 },
        transform: {
          translateX: 40,
          translateY: 30,
          rotation: index * 5,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 1,
        visible: true,
        locked: false,
        payload: {},
      })),
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }
  const session = new DocumentSessionController({
    document,
    revision: 0,
    debounceMs: 0,
    bridge: {
      saveDocument: async (record) => record.revision + 1,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
    correlationId,
  })
  documentSession.value = session
  window.__cuteScreenE2eM05 = {
    snapshot: () => documentSession.value?.snapshot.core.document,
  }
  sourceImage.value = await loadM05HarnessImage()
}

/** Shares the native outcome event and the command response for one capture. */
async function mountCapturedDocument(): Promise<boolean> {
  if (capturedDocumentMount) return capturedDocumentMount
  const mount = loadPersistedDocument()
  capturedDocumentMount = mount
  try {
    return await mount
  } finally {
    if (capturedDocumentMount === mount) capturedDocumentMount = undefined
  }
}

function createDocumentCoordinator(
  bridge: Awaited<typeof import('./desktop-bridge')>['tauriDesktopBridge'],
): DocumentSessionCoordinator {
  return new DocumentSessionCoordinator({
    bridge: {
      saveDocument: (save, correlation) =>
        bridge.repositorySaveDocument(
          save.documentId,
          save.revision,
          save.documentJson,
          correlation,
        ),
      exportRecoveryBundle: async (documentId, correlation) => {
        try {
          return await bridge.repositoryExportRecoveryBundle(
            documentId,
            correlation,
          )
        } catch (error) {
          return {
            kind: 'failed' as const,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
    },
    correlationId,
    onActiveSession: (session) => {
      documentSession.value = session
    },
  })
}

async function closeDocumentSession(): Promise<void> {
  const coordinator = documentCoordinator.value
  if (!coordinator) return
  const flush = await coordinator.active?.flush()
  if (flush?.kind === 'failed') throw new Error(flush.error)
  coordinator.dispose()
  documentCoordinator.value = undefined
}

async function flushBeforeLifecycleAction(): Promise<boolean> {
  const outcome = await documentSession.value?.flush()
  return outcome?.kind !== 'failed'
}

async function installLifecycleGuards(): Promise<void> {
  if (
    import.meta.env.VITE_TEST_HARNESS === 'true' &&
    !m03Harness &&
    !m04CaptureHarness
  )
    return
  if (!('__TAURI_INTERNALS__' in window)) return
  const [{ getCurrentWindow }, { listen }, { tauriDesktopBridge }] =
    await Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/event'),
      import('./desktop-bridge'),
    ])
  const currentWindow = getCurrentWindow()
  lifecycleCleanup.push(
    await currentWindow.onCloseRequested(async (event) => {
      event.preventDefault()
      if (!(await flushBeforeLifecycleAction())) return
      try {
        await tauriDesktopBridge.lifecycleCompleteMainWindowClose()
      } catch (error) {
        documentState.value = {
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
  lifecycleCleanup.push(
    await listen('cute-screen:request-quit', async () => {
      if (!(await flushBeforeLifecycleAction())) return
      try {
        await tauriDesktopBridge.lifecycleFinishQuit()
      } catch (error) {
        documentState.value = {
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
  lifecycleCleanup.push(
    await listen<CaptureOutcomeV1>(
      'cute-screen:capture-outcome',
      async (event) => {
        captureProgress.value = undefined
        if (event.payload.outcome === 'captured') await mountCapturedDocument()
      },
    ),
  )
  lifecycleCleanup.push(
    await listen<CaptureProgressV1>('cute-screen:capture-progress', (event) => {
      if (event.payload.version === 1)
        captureProgress.value = event.payload.state
    }),
  )
  lifecycleCleanup.push(
    await listen<string>('cute-screen:capture-preflight', async (event) => {
      let allowed = false
      try {
        allowed = await flushBeforeLifecycleAction()
      } catch (error) {
        console.warn('cute-screen capture preflight save failed', error)
      }
      try {
        await tauriDesktopBridge.capturePreflightComplete(
          event.payload,
          allowed,
        )
      } catch (error) {
        console.warn(
          'cute-screen capture preflight acknowledgement failed',
          error,
        )
      }
    }),
  )
  try {
    await tauriDesktopBridge.capturePreflightSetReady(true)
  } catch (error) {
    console.warn('cute-screen capture preflight registration failed', error)
  }
}

onMounted(() => {
  void (async () => {
    if (m05Harness) {
      try {
        await mountM05HarnessDocument()
      } catch (error) {
        documentState.value = {
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        }
      }
      return
    }
    // Do not acknowledge native tray/hotkey preflight until the persisted
    // session, if any, is mounted and can actually be flushed.
    await loadPersistedDocument()
    await refreshPlatformCapabilities()
    await installLifecycleGuards()
  })()
})

onBeforeUnmount(() => {
  if ('__TAURI_INTERNALS__' in window) {
    void import('./desktop-bridge').then(({ tauriDesktopBridge }) =>
      tauriDesktopBridge.capturePreflightSetReady(false).catch((error) => {
        console.warn('cute-screen capture preflight shutdown failed', error)
      }),
    )
  }
  for (const cleanup of lifecycleCleanup.splice(0)) cleanup()
  documentCoordinator.value?.dispose()
})
</script>

<template>
  <EditorShell
    :fixture="fixture"
    :initial-document-state="initialDocumentState"
    :read-only-document="readOnlyDocument"
    :document-session="documentSession"
    :actions="desktopActions"
    :capture-available="captureAvailable"
    :capture-fallback-command="captureFallbackCommand"
    :capture-progress="captureProgress"
    :frames="seriesFrames"
    :source-image="sourceImage"
    @retry-load="loadPersistedDocument"
  />
</template>
