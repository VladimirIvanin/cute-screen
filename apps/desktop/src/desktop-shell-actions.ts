import {
  ActionCancelledError,
  type CanvasViewportHosts,
  type DocumentSessionController,
  type PlatformCapabilities,
  type ShellActionAdapter,
} from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'
import { dispatchNativeCapture } from './capture-request'
import { writeResultCanvasToClipboard } from './result-clipboard'
import { currentDesktopWindow } from './platform/tauri/window-adapter'
import type { CaptureOutcomeV2 } from './generated/desktop-ipc'

type ShellAction = Parameters<ShellActionAdapter['run']>[0]
type ProgressReporter = Parameters<ShellActionAdapter['run']>[2]

export interface DesktopShellActionPorts {
  readonly canvasHosts: ShallowRef<CanvasViewportHosts | undefined>
  readonly documentSession: ShallowRef<DocumentSessionController | undefined>
  readonly platformCapabilities: ShallowRef<PlatformCapabilities | undefined>
  readonly correlationId: () => string
  readonly mountCapturedDocument: () => Promise<boolean>
}

export function createDesktopShellActions(
  ports: DesktopShellActionPorts,
): ShellActionAdapter | undefined {
  if (!('__TAURI_INTERNALS__' in window)) return undefined
  return {
    run: (action, signal, reportProgress) =>
      runDesktopAction(ports, action, signal, reportProgress),
  }
}

async function runDesktopAction(
  ports: DesktopShellActionPorts,
  action: ShellAction,
  signal: AbortSignal,
  reportProgress: ProgressReporter,
): Promise<string> {
  if (action === 'copy') return copyRenderedResult(ports, signal)
  const flush = await ports.documentSession.value?.flush()
  if (flush?.kind === 'failed') throw new Error(flush.error)
  if (action === 'openImage') return openImage(ports, signal)
  if (action !== 'capture' && action !== 'captureWindow') {
    throw new Error(`${action} is not available yet`)
  }
  return capture(ports, action, signal, reportProgress)
}

async function copyRenderedResult(
  ports: DesktopShellActionPorts,
  signal: AbortSignal,
): Promise<string> {
  const scene = ports.canvasHosts.value?.scene
  if (!scene) throw new Error('The rendered result is not ready')
  if (signal.aborted) throw new ActionCancelledError('Copy cancelled')
  const { tauriDesktopBridge } = await import('./desktop-bridge')
  await writeResultCanvasToClipboard(scene, {
    writePng: tauriDesktopBridge.writeClipboardPng,
  })
  if (signal.aborted) throw new ActionCancelledError('Copy cancelled')
  return 'Result copied'
}

async function openImage(
  ports: DesktopShellActionPorts,
  signal: AbortSignal,
): Promise<string> {
  const { tauriDesktopBridge } = await import('./desktop-bridge')
  const outcome = await tauriDesktopBridge.repositoryOpenImage(
    ports.correlationId(),
  )
  if (signal.aborted || outcome.kind === 'cancelled') {
    throw new ActionCancelledError('Open image cancelled')
  }
  if (!(await ports.mountCapturedDocument())) {
    throw new Error('Image was saved, but the editor could not open it')
  }
  return 'Image opened'
}

async function capture(
  ports: DesktopShellActionPorts,
  action: 'capture' | 'captureWindow',
  signal: AbortSignal,
  reportProgress: ProgressReporter,
): Promise<string> {
  const { tauriDesktopBridge } = await import('./desktop-bridge')
  const onAbort = () => {
    void tauriDesktopBridge.captureCancel().catch((error) => {
      console.warn('cute-screen capture cancellation failed', error)
    })
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    reportProgress?.('probing')
    const capabilities =
      ports.platformCapabilities.value ??
      (await tauriDesktopBridge.platformCapabilities(ports.correlationId()))
    ports.platformCapabilities.value = capabilities
    validateCapture(capabilities, action, signal)
    reportProgress?.('ready')
    const captureAction = resolveCaptureAction(capabilities, action)
    const outcome = await dispatchNativeCapture({
      session: capabilities.session,
      mainWindow: await currentDesktopWindow(),
      waitForMainWindowUnmap: () =>
        tauriDesktopBridge.captureWaitForEditorUnmap(ports.correlationId()),
      capture: () =>
        tauriDesktopBridge.captureRequest({
          correlationId: ports.correlationId(),
          action: captureAction,
          delayMs: 0,
          cursor: false,
          invocationSource: 'ui',
        }),
    })
    return handleCaptureOutcome(ports, outcome as CaptureOutcomeV2)
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function validateCapture(
  capabilities: PlatformCapabilities,
  action: 'capture' | 'captureWindow',
  signal: AbortSignal,
): void {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (!capabilities.capture.available) {
    throw new Error('Capture is unavailable in this desktop session')
  }
  if (action === 'captureWindow' && !capabilities.capture.windowTarget) {
    throw new Error('Window capture is unavailable')
  }
}

function resolveCaptureAction(
  capabilities: PlatformCapabilities,
  action: 'capture' | 'captureWindow',
): 'window' | 'area' | 'screen' {
  if (action === 'captureWindow') return 'window'
  return capabilities.capture.interactiveSelector ? 'area' : 'screen'
}

async function handleCaptureOutcome(
  ports: DesktopShellActionPorts,
  outcome: CaptureOutcomeV2,
): Promise<string> {
  if (outcome.outcome === 'captured') {
    if (!(await ports.mountCapturedDocument())) {
      throw new Error('Capture was saved, but the editor could not open it')
    }
    return 'Capture opened'
  }
  if (outcome.outcome === 'cancelled') {
    throw new ActionCancelledError('Capture cancelled')
  }
  if (outcome.outcome === 'permissionDenied') {
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    try {
      await tauriDesktopBridge.openScreenRecordingSettings()
    } catch (error) {
      console.warn(
        'cute-screen Screen Recording settings could not be opened',
        error,
      )
    }
    throw new Error('permissionDenied')
  }
  throw new Error(`Capture ${outcome.outcome}`)
}
