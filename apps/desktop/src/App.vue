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
  describeError,
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type CaptureProgressState,
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
import { runEditorStartup } from './editor-startup'
import { EditorFirstFrameGate } from './editor-first-frame'
import { readAppHarnessConfig } from './app-harness-config'
import { mountM05HarnessDocument as mountM05Harness } from './m05-harness'
import { createDesktopShellActions } from './desktop-shell-actions'
import { installDesktopLifecycleGuards } from './platform/tauri/lifecycle-adapter'
import { M08HarnessController } from './m08-harness'

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
      versionToken(): number | undefined
    }
    __cuteScreenE2eM08?: {
      snapshot():
        | {
            document: EditorDocumentV1
            decodedSource?: {
              width: number
              height: number
            }
            clipboardText?: string
          }
        | undefined
      readClipboardText(): Promise<string | undefined>
    }
  }
}

const harness = readAppHarnessConfig()
const fixture = harness.fixture
const m03Harness = harness.m03
const m04CaptureHarness = harness.m04Capture
const m04FallbackHarness = harness.m04Fallback
const m05Harness = harness.m05
const m05ReferencePerfHarness = harness.m05ReferencePerf
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
const m08HarnessController = new M08HarnessController(harness, {
  documentSession,
  sourceImage,
  clipboardBridge,
  correlationId,
})
const desktopActions: ShellActionAdapter | undefined =
  import.meta.env.VITE_TEST_HARNESS === 'true' && !m04CaptureHarness
    ? testActions
    : createDesktopShellActions({
        canvasHosts: canvasViewportHosts,
        documentSession,
        platformCapabilities,
        correlationId,
        mountCapturedDocument,
      })
const editorFirstFrame = new EditorFirstFrameGate()
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
const captureWindowAvailable = computed(
  () => platformCapabilities.value?.capture.windowTarget ?? false,
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

function onEditorFrameReady(): void {
  editorFirstFrame.frameReady()
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

async function loadSystemFonts(): Promise<void> {
  if (import.meta.env.VITE_TEST_HARNESS === 'true') return
  if (!('__TAURI_INTERNALS__' in window)) return
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    systemFonts.value =
      await tauriDesktopBridge.listSystemFonts(correlationId())
  } catch (error) {
    console.warn('cute-screen system font catalog failed', error)
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
    if (parsed.kind !== 'editable') {
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
    m08HarnessController.installFacade()
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
      message: describeError(error, 'Unable to open the saved document.'),
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

async function mountM05HarnessDocument(): Promise<void> {
  await mountM05Harness(harness, {
    documentSession,
    sourceImage,
    correlationId,
    installClipboardBridge: () =>
      m08HarnessController.installBrowserClipboardBridge(),
    installHarnessFacade: () => m08HarnessController.installFacade(),
  })
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
  lifecycleCleanup.push(
    ...(await installDesktopLifecycleGuards({
      enabled:
        import.meta.env.VITE_TEST_HARNESS !== 'true' ||
        m03Harness ||
        m04CaptureHarness,
      documentState,
      captureProgress,
      firstFrame: editorFirstFrame,
      flushBeforeAction: flushBeforeLifecycleAction,
      mountCapturedDocument,
    })),
  )
}

onMounted(() => {
  window.addEventListener('keydown', onWindowClipboardKeydown)
  void (async () => {
    if ('__TAURI_INTERNALS__' in window) {
      const { tauriDesktopBridge } = await import('./desktop-bridge')
      textureBridge.value = tauriDesktopBridge
      contentImageBridge.value = tauriDesktopBridge
      clipboardBridge.value = tauriDesktopBridge
      m08HarnessController.installFacade()
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
    await runEditorStartup({
      loadPersistedDocument,
      loadSystemFonts,
      refreshPlatformCapabilities,
      installLifecycleGuards,
    })
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
    :capture-window-available="captureWindowAvailable"
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
    @frame-ready="onEditorFrameReady"
    @retry-load="loadPersistedDocument"
  />
</template>
