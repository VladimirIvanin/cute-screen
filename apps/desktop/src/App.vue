<script setup lang="ts">
import type {} from './harness-globals'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue'
import {
  DocumentSessionController,
  DocumentSessionCoordinator,
  EditorShell,
  describeError,
  shortcutLetter,
  type CaptureProgressState,
  type CanvasViewportHosts,
  type ShellActionAdapter,
  type ShellDocumentState,
  type TextureFillBridge,
  type SystemFontFace,
  type ContentImageBridge,
  type ClipboardBridge,
} from '@cute-screen/editor-vue'
import HistoryPopover from './history/HistoryPopover.vue'
import WindowCaptureRecovery from './WindowCaptureRecovery.vue'
import {
  nativeHistory,
} from './history/bridge'
import { createHistoryDocumentLoader } from './history/document-loader'
import { HistoryNavigation } from './history/navigation'
import { runEditorStartup } from './editor-startup'
import { useDesktopCapabilities } from './platform-capability-monitor'
import { EditorFirstFrameGate } from './editor-first-frame'
import {
  readAppHarnessConfig,
  captureHarnessError,
} from './app-harness-config'
import { mountM05HarnessDocument as mountM05Harness } from './m05-harness'
import { createDesktopShellActions } from './desktop-shell-actions'
import { installDesktopLifecycleGuards } from './platform/tauri/lifecycle-adapter'
import { M08HarnessController } from './m08-harness'
import { openActivationSettings } from './platform/tauri/activation-settings-adapter'

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
            const captureError = captureHarnessError(harness, action)
            if (captureError) {
              reject(captureError)
              return
            }
            const timer = window.setTimeout(() => resolve(`${action} completed`), 150)
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

const shell = shallowRef<InstanceType<typeof EditorShell>>()
const historyPopover = shallowRef<InstanceType<typeof HistoryPopover>>()
const historyActiveCaptureId = shallowRef<string>()
const historyBusy = shallowRef(false)
const historyError = shallowRef<string>()
const historyNavigation = new HistoryNavigation()
let maintenanceTimer: ReturnType<typeof setTimeout> | undefined
let periodicMaintenance: ReturnType<typeof setInterval> | undefined
let disposedHistory = false
let stopHistorySession: (() => void) | undefined
const documentSession = shallowRef<DocumentSessionController>()
const documentCoordinator = shallowRef<DocumentSessionCoordinator>()
const {
  platformCapabilities,
  refreshPlatformCapabilities,
  listenForCapabilityChanges,
} = useDesktopCapabilities(correlationId)
const captureProgress = shallowRef<CaptureProgressState>()
const sourceImage = shallowRef<HTMLImageElement>()
const materialBridge = shallowRef<import('@cute-screen/editor-vue').MaterialBridge>()
const textureBridge = shallowRef<TextureFillBridge>()
const contentImageBridge = shallowRef<ContentImageBridge>()
const clipboardBridge = shallowRef<ClipboardBridge>()
const systemFonts = shallowRef<readonly SystemFontFace[]>([])
const canvasViewportHosts = shallowRef<CanvasViewportHosts>()
async function waitForCanvasRender(): Promise<void> {
  await nextTick()
  const wait = canvasViewportHosts.value?.waitForRender
  if (!wait) throw new Error('Canvas render host has not mounted')
  await wait()
}
const m08HarnessController = new M08HarnessController(harness, {
  documentSession,
  sourceImage,
  clipboardBridge,
  correlationId,
  waitForRender: waitForCanvasRender,
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
        prepareDocumentChange: prepareHistory,
      })
const editorFirstFrame = new EditorFirstFrameGate()
let capturedDocumentMount: Promise<boolean> | undefined
const documentState = shallowRef<ShellDocumentState>({ kind: 'loading' })
const readOnlyDocument = shallowRef(false)
const initialDocumentState =
  import.meta.env.VITE_TEST_HARNESS === 'true' && !m03Harness && !m04CaptureHarness ? undefined : documentState
const lifecycleCleanup: Array<() => void> = []
const captureAvailable = computed(() =>
  import.meta.env.VITE_TEST_HARNESS === 'true' || !('__TAURI_INTERNALS__' in window)
    ? true
    : (platformCapabilities.value?.capture.interactiveSelector ?? false) ||
      (platformCapabilities.value?.capture.monitorTarget ?? false))
const captureWindowAvailable = computed(() => platformCapabilities.value?.capture.windowTarget ?? false)
const openImageAvailable = computed(() => '__TAURI_INTERNALS__' in window)
const openSettings = openImageAvailable.value ? openActivationSettings : undefined
const connectAgent = openImageAvailable.value ? async () => {
  const { openAgentSettings } = await import('./platform/tauri/agent-settings-adapter')
  await openAgentSettings()
} : undefined
const captureFallbackCommand = computed(() =>
  m04FallbackHarness
    ? "'/opt/Cute Screen/cute-screen' capture --mode area"
    : platformCapabilities.value?.cliFallback
      ? platformCapabilities.value.cliFallbackCommand
      : undefined)

async function openDroppedImage(
  token: string,
  signal: AbortSignal,
): Promise<void> {
  if (
    documentSession.value ||
    readOnlyDocument.value ||
    historyBusy.value
  ) return
  await prepareHistory()
  if (signal.aborted || documentSession.value) return
  const { tauriDesktopBridge } = await import('./desktop-bridge')
  const outcome = await tauriDesktopBridge.repositoryOpenDroppedImage(token)
  if (signal.aborted || documentSession.value) return
  if (outcome.kind === 'opened' && !(await mountCapturedDocument(outcome.document.captureId))) {
    throw new Error('Image was saved, but the editor could not open it')
  }
}

function correlationId(): string {
  return `m03-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function onCanvasViewportHostsReady(hosts: CanvasViewportHosts): void {
  canvasViewportHosts.value = hosts
}

function onEditorFrameReady(): void {
  editorFirstFrame.frameReady()
  scheduleHistoryMaintenance()
}

function scheduleHistoryMaintenance(): void {
  if (!('__TAURI_INTERNALS__' in window) || disposedHistory) return
  clearTimeout(maintenanceTimer)
  maintenanceTimer = setTimeout(() => {
    if (historyBusy.value || disposedHistory) return
    void nativeHistory.request({ kind: 'maintain' }).then(() => {
      historyError.value = undefined
    }).catch((error) => {
      historyError.value = describeError(error, 'History cleanup failed')
      console.warn('cute-screen history maintenance failed', error)
    })
  }, 1000)
}

async function prepareHistory(): Promise<void> {
  const zoom = await shell.value?.prepareNavigation()
  const flush = await documentSession.value?.flush()
  if (flush?.kind === 'failed') throw new Error(flush.error)
  const scroll = canvasViewportHosts.value?.scrollContainer
  if (historyActiveCaptureId.value && zoom) {
    await nativeHistory.request({ kind: 'saveViewport', captureId: historyActiveCaptureId.value, viewport: {
      ...zoom, scrollLeft: scroll?.scrollLeft ?? 0, scrollTop: scroll?.scrollTop ?? 0,
    } })
  }
}

async function selectHistoryCapture(id: string | null): Promise<boolean> {
  return historyNavigation.run(async (isCurrent) => {
    await prepareHistory()
    if (!isCurrent()) return false
    historyBusy.value = true
    try {
      if (!id) {
        await historyLoader.clear()
        return true
      }
      const loaded = await historyLoader.load(id, isCurrent)
      if (!loaded && isCurrent()) throw new Error(historyError.value ?? 'Unable to open capture')
      return loaded
    } finally {
      historyBusy.value = false
    }
  })
}

async function loadSystemFonts(): Promise<void> {
  if (import.meta.env.VITE_TEST_HARNESS === 'true') return
  if (!('__TAURI_INTERNALS__' in window)) return
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    systemFonts.value = await tauriDesktopBridge.listSystemFonts(correlationId())
  } catch (error) {
    console.warn('cute-screen system font catalog failed', error)
  }
}

function onHistoryDocumentMounted(): void {
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
}

const historyLoader = createHistoryDocumentLoader({
  session: documentSession, coordinator: documentCoordinator, state: documentState, readOnly: readOnlyDocument,
  source: sourceImage, activeId: historyActiveCaptureId, error: historyError, shell, hosts: canvasViewportHosts,
  createCoordinator: createDocumentCoordinator, close: closeDocumentSession, mounted: onHistoryDocumentMounted,
})

async function loadPersistedDocument(captureId?: string): Promise<boolean> {
  if (
    import.meta.env.VITE_TEST_HARNESS === 'true' &&
      !m03Harness &&
      !m04CaptureHarness
  ) return true
  historyNavigation.cancel()
  return historyLoader.load(captureId)
}

async function pasteClipboardIntoEmptyDocument(): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window) || documentSession.value) return
  try {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const outcome = await tauriDesktopBridge.clipboardOpenImage(correlationId())
    if (outcome.kind !== 'opened') return
    await mountCapturedDocument(outcome.document.captureId)
  } catch (error) {
    console.warn('cute-screen empty clipboard image paste failed', error)
  }
}

function onWindowClipboardKeydown(event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    !(event.metaKey || event.ctrlKey) ||
    shortcutLetter(event) !== 'v' ||
    documentSession.value
  ) {
    return
  }
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    (event.target instanceof HTMLElement &&
      event.target.isContentEditable)
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
    installClipboardBridge: () => m08HarnessController.installBrowserClipboardBridge(),
    installHarnessFacade: () => m08HarnessController.installFacade(),
    waitForRender: waitForCanvasRender,
  })
  if (
    import.meta.env.VITE_TEST_HARNESS === 'true' &&
      harness.imageIngress
  ) {
    const { installImageIngressHarness } = await import('./image-ingress-harness')
    lifecycleCleanup.push(installImageIngressHarness(contentImageBridge, clipboardBridge, documentSession))
  }
}

/** Shares the native outcome event and the command response for one capture. */
async function mountCapturedDocument(captureId?: string): Promise<boolean> {
  if (capturedDocumentMount) return capturedDocumentMount
  const mount = loadPersistedDocument(captureId)
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
        bridge.repositorySaveDocument(save.documentId, save.revision, save.documentJson, correlation),
      exportRecoveryBundle: async (documentId, correlation) => {
        try {
          return await bridge.repositoryExportRecoveryBundle(documentId, correlation)
        } catch (error) {
          return {
            kind: 'failed' as const,
            error: describeError(error, 'Unable to export the recovery bundle.'),
          }
        }
      },
    },
    correlationId,
    onActiveSession: (session) => {
      stopHistorySession?.()
      documentSession.value = session
      stopHistorySession = session?.subscribe((snapshot) => {
        if (snapshot.saveState === 'saved') scheduleHistoryMaintenance()
      })
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
  if (historyBusy.value) return false
  try {
    await prepareHistory()
    return true
  } catch (error) {
    historyError.value = describeError(error, 'Unable to save the current document')
    return false
  }
}

async function installLifecycleGuards(): Promise<void> {
  lifecycleCleanup.push(
    ...(await installDesktopLifecycleGuards({
      enabled: import.meta.env.VITE_TEST_HARNESS !== 'true' || m03Harness || m04CaptureHarness,
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
  periodicMaintenance = setInterval(scheduleHistoryMaintenance, 3_600_000)
  void (async () => {
    if ('__TAURI_INTERNALS__' in window && !harness.imageIngress) {
      const { tauriDesktopBridge } = await import('./desktop-bridge')
      materialBridge.value = (await import('./platform/tauri/materials-adapter')).nativeMaterialBridge
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
    if ('__TAURI_INTERNALS__' in window) {
      await (await import('./platform/tauri/history-menu-adapter')).installHistoryMenuListener(
        selectHistoryCapture, historyPopover, historyError, () => disposedHistory, lifecycleCleanup,
      )
      const { installAgentRuntime } = await import('./platform/tauri/agent-runtime')
      lifecycleCleanup.push(await installAgentRuntime({
        session: () => documentSession.value,
        busy: () => Boolean(
          historyBusy.value || readOnlyDocument.value || captureProgress.value || shell.value?.isAgentBusy(),
        ),
        open: (id) => selectHistoryCapture(id),
        hosts: () => canvasViewportHosts.value,
        capabilities: () => platformCapabilities.value,
      }))
    }
    listenForCapabilityChanges()
    scheduleHistoryMaintenance()
  })()
})

onBeforeUnmount(() => {
  disposedHistory = true
  clearTimeout(maintenanceTimer)
  clearInterval(periodicMaintenance)
  stopHistorySession?.()
  historyNavigation.cancel()
  historyLoader.dispose()
  window.removeEventListener('keydown', onWindowClipboardKeydown)
  if ('__TAURI_INTERNALS__' in window) {
    void import('./desktop-bridge').then(({ tauriDesktopBridge }) =>
      tauriDesktopBridge.capturePreflightSetReady(false).catch((error) => {
        console.warn('cute-screen capture preflight shutdown failed', error)
      }))
  }
  for (const cleanup of lifecycleCleanup.splice(0)) cleanup()
  documentCoordinator.value?.dispose()
})
</script>

<template>
  <component :is="M05ReferencePerformance" v-if="m05ReferencePerfHarness && M05ReferencePerformance" />
  <EditorShell
    v-else
    ref="shell"
    :fixture="fixture"
    :initial-document-state="initialDocumentState"
    :read-only-document="readOnlyDocument || historyBusy"
    :document-session="documentSession"
    :actions="desktopActions"
    :capture-available="captureAvailable && !historyBusy"
    :capture-window-available="captureWindowAvailable && !historyBusy"
    :open-image-available="openImageAvailable && !historyBusy"
    :open-settings="openSettings"
    :connect-agent="connectAgent"
    :capture-fallback-command="captureFallbackCommand"
    :capture-progress="captureProgress"
    :source-image="sourceImage"
    :material-bridge="materialBridge"
    :texture-bridge="textureBridge"
    :content-image-bridge="contentImageBridge"
    :open-dropped-image="openDroppedImage"
    :clipboard-bridge="clipboardBridge"
    :system-fonts="systemFonts"
    @hosts-ready="onCanvasViewportHostsReady"
    @frame-ready="onEditorFrameReady"
    @retry-load="loadPersistedDocument"
  >
    <template v-if="openImageAvailable" #history="{ locale }">
      <HistoryPopover
        ref="historyPopover"
        :bridge="nativeHistory"
        :active-id="historyActiveCaptureId"
        :locale="locale"
        :open-capture="selectHistoryCapture"
        :prepare="prepareHistory"
        :cancel-navigation="() => historyNavigation.cancel()"
        :maintenance-error="historyError"
        :busy="historyBusy"
        @retry-maintenance="scheduleHistoryMaintenance"
      />
    </template>
  </EditorShell>
  <WindowCaptureRecovery v-if="openImageAvailable" :session="platformCapabilities?.session ?? 'unknown'" />
</template>
