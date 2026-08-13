<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue'
import {
  DocumentSessionController,
  DocumentSessionCoordinator,
  EditorShell,
  ActionCancelledError,
  describeError,
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type CaptureOutcomeV1,
  type CaptureProgressState,
  type CaptureProgressV1,
  type CanvasViewportHosts,
  type FrameSummary,
  type EditorDocumentV1,
  type PlatformCapabilities,
  type ShellActionAdapter,
  type ShellDocumentState,
  type TextureFillBridge,
  type SystemFontFace,
  type ContentImageBridge,
  type ClipboardBridge,
} from '@cute-screen/editor-vue'
import { writeResultCanvasToClipboard } from './result-clipboard'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot():
        | {
            crop: unknown
            layers: EditorDocumentV1['layers']
            saveState: string
          }
        | undefined
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
const m04FallbackHarness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m04fallback') === '1'
const m05Harness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m05') === '1'
const m05ViewportHarness =
  m05Harness &&
  new URLSearchParams(window.location.search).get('m05viewport') === '1'
const m05ReferencePerfHarness =
  import.meta.env.VITE_TEST_HARNESS === 'true' &&
  new URLSearchParams(window.location.search).get('m05perf') === '1'
const M05ReferencePerformance =
  import.meta.env.VITE_TEST_HARNESS === 'true'
    ? defineAsyncComponent(() => import('./M05ReferencePerformance.vue'))
    : undefined

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
            if (action === 'copy') {
              const scene = canvasViewportHosts.value?.scene
              if (!scene) throw new Error('The rendered result is not ready')
              if (signal.aborted) {
                throw new ActionCancelledError('Copy cancelled')
              }
              await writeResultCanvasToClipboard(scene)
              if (signal.aborted) {
                throw new ActionCancelledError('Copy cancelled')
              }
              return 'Result copied'
            }
            const flush = await documentSession.value?.flush()
            if (flush?.kind === 'failed') {
              throw new Error(flush.error)
            }
            const { tauriDesktopBridge } = await import('./desktop-bridge')
            if (action === 'openImage') {
              const outcome =
                await tauriDesktopBridge.repositoryOpenImage(correlationId())
              if (signal.aborted || outcome.kind === 'cancelled') {
                throw new ActionCancelledError('Open image cancelled')
              }
              const mounted = await mountCapturedDocument()
              if (!mounted) {
                throw new Error(
                  'Image was saved, but the editor could not open it',
                )
              }
              return 'Image opened'
            }
            if (action !== 'capture') {
              throw new Error(`${action} is not available yet`)
            }
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
              const captureAction = capabilities.capture.interactiveSelector
                ? 'area'
                : 'screen'
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
const textureBridge = shallowRef<TextureFillBridge>()
const contentImageBridge = shallowRef<ContentImageBridge>()
const clipboardBridge = shallowRef<ClipboardBridge>()
const systemFonts = shallowRef<readonly SystemFontFace[]>([])
const canvasViewportHosts = shallowRef<CanvasViewportHosts>()
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
const openImageAvailable = computed(() => '__TAURI_INTERNALS__' in window)
const captureFallbackCommand = computed(() =>
  m04FallbackHarness
    ? "'/opt/Cute Screen/cute-screen' capture --mode area"
    : platformCapabilities.value?.cliFallback
      ? platformCapabilities.value.cliFallbackCommand
      : undefined,
)

function correlationId(): string {
  return `m03-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function onCanvasViewportHostsReady(hosts: CanvasViewportHosts): void {
  canvasViewportHosts.value = hosts
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
                layers: active.snapshot.core.document.layers,
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

async function pasteClipboardIntoEmptyDocument(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window) || documentSession.value) return
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const outcome = await tauriDesktopBridge.clipboardOpenImage(correlationId())
    if (outcome.kind !== 'opened') return
    await mountCapturedDocument()
  } catch (error) {
    console.warn('cute-screen empty clipboard image paste failed', error)
  }
}

function onWindowClipboardKeydown(event: KeyboardEvent): void {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.key.toLowerCase() !== 'v' ||
    documentSession.value
  ) {
    return
  }
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  ) {
    return
  }
  event.preventDefault()
  void pasteClipboardIntoEmptyDocument()
}

function loadM05HarnessImage(
  dimensions: Readonly<{ width: number; height: number }>,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener(
      'error',
      () => reject(new Error('M05 fixture failed')),
      { once: true },
    )
    image.src = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"><rect width="100%" height="100%" fill="#273d5a"/></svg>`,
    )}`
  })
}

async function mountM05HarnessDocument(): Promise<void> {
  const hash = 'f'.repeat(64)
  const dimensions = m05ViewportHarness
    ? { width: 2560, height: 1440 }
    : { width: 160, height: 120 }
  const document: EditorDocumentV1 = {
    schemaVersion: 2,
    id: '019c1f62-058e-7000-8000-000000000005',
    source: {
      blobHash: hash,
      format: 'svg',
      mimeType: 'image/svg+xml',
      width: dimensions.width,
      height: dimensions.height,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: dimensions,
    crop: { x: 20, y: 15, width: 100, height: 80 },
    layers: [
      {
        id: '019c1f62-058e-7000-8000-000000000101',
        kind: 'image',
        localBounds: {
          x: 0,
          y: 0,
          width: dimensions.width,
          height: dimensions.height,
        },
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
          intrinsicWidth: dimensions.width,
          intrinsicHeight: dimensions.height,
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
        payload: {
          shape: 'rectangle',
          fill: {
            kind: 'solid',
            color: { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 },
            opacity: 1,
          },
        },
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
  sourceImage.value = await loadM05HarnessImage(dimensions)
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
            error: describeError(
              error,
              'Unable to export the recovery bundle.',
            ),
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
  window.addEventListener('keydown', onWindowClipboardKeydown)
  void (async () => {
    if ('__TAURI_INTERNALS__' in window) {
      const { tauriDesktopBridge } = await import('./desktop-bridge')
      textureBridge.value = tauriDesktopBridge
      contentImageBridge.value = tauriDesktopBridge
      clipboardBridge.value = tauriDesktopBridge
      if (import.meta.env.VITE_TEST_HARNESS !== 'true') {
        try {
          systemFonts.value =
            await tauriDesktopBridge.listSystemFonts(correlationId())
        } catch (error) {
          console.warn('cute-screen system font catalog failed', error)
        }
      }
    }
    if (m05ReferencePerfHarness) return
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
  window.removeEventListener('keydown', onWindowClipboardKeydown)
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
  <component
    :is="M05ReferencePerformance"
    v-if="m05ReferencePerfHarness && M05ReferencePerformance"
  />
  <EditorShell
    v-else
    :fixture="fixture"
    :initial-document-state="initialDocumentState"
    :read-only-document="readOnlyDocument"
    :document-session="documentSession"
    :actions="desktopActions"
    :capture-available="captureAvailable"
    :open-image-available="openImageAvailable"
    :capture-fallback-command="captureFallbackCommand"
    :capture-progress="captureProgress"
    :frames="seriesFrames"
    :source-image="sourceImage"
    :texture-bridge="textureBridge"
    :content-image-bridge="contentImageBridge"
    :clipboard-bridge="clipboardBridge"
    :system-fonts="systemFonts"
    @hosts-ready="onCanvasViewportHostsReady"
    @retry-load="loadPersistedDocument"
  />
</template>
