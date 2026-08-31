import type {
  CaptureProgressV1,
  CaptureProgressState,
  ShellDocumentState,
} from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'
import type { CaptureOutcomeV2 } from '../../generated/desktop-ipc'
import type { EditorFirstFrameGate } from '../../editor-first-frame'

export interface DesktopLifecyclePorts {
  readonly enabled: boolean
  readonly documentState: ShallowRef<ShellDocumentState>
  readonly captureProgress: ShallowRef<CaptureProgressState | undefined>
  readonly firstFrame: EditorFirstFrameGate
  readonly flushBeforeAction: () => Promise<boolean>
  readonly mountCapturedDocument: () => Promise<boolean>
}

export async function installDesktopLifecycleGuards(
  ports: DesktopLifecyclePorts,
): Promise<Array<() => void>> {
  if (!ports.enabled || !('__TAURI_INTERNALS__' in window)) return []
  const [{ getCurrentWindow }, { listen }, { tauriDesktopBridge }] =
    await Promise.all([
      import('@tauri-apps/api/window'),
      import('@tauri-apps/api/event'),
      import('../../desktop-bridge'),
    ])
  const cleanup: Array<() => void> = []
  cleanup.push(
    await getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault()
      if (!(await ports.flushBeforeAction())) return
      try {
        await tauriDesktopBridge.lifecycleCompleteMainWindowClose()
      } catch (error) {
        setLifecycleError(ports, error)
      }
    }),
  )
  cleanup.push(
    await listen('cute-screen:request-quit', async () => {
      if (!(await ports.flushBeforeAction())) return
      try {
        await tauriDesktopBridge.lifecycleFinishQuit()
      } catch (error) {
        setLifecycleError(ports, error)
      }
    }),
  )
  cleanup.push(
    await listen<CaptureOutcomeV2>('cute-screen:capture-outcome', (event) =>
      handleCaptureOutcome(ports, event.payload),
    ),
    await listen<CaptureProgressV1>('cute-screen:capture-progress', (event) => {
      if (event.payload.version === 1) {
        ports.captureProgress.value = event.payload.state
      }
    }),
    await listen<string>('cute-screen:capture-preflight', async (event) => {
      let allowed = false
      try {
        allowed = await ports.flushBeforeAction()
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
  return cleanup
}

async function handleCaptureOutcome(
  ports: DesktopLifecyclePorts,
  outcome: CaptureOutcomeV2,
): Promise<void> {
  ports.captureProgress.value = undefined
  if (outcome.outcome !== 'captured') return
  let mounted = false
  const documentId = outcome.document?.documentId
  const waitsForEditorFrame =
    outcome.completion === 'editor' && documentId !== undefined
  const firstFrame = waitsForEditorFrame
    ? ports.firstFrame.waitForNextFrame()
    : undefined
  try {
    mounted = await ports.mountCapturedDocument()
    if (mounted && firstFrame) await firstFrame
    if (!mounted && firstFrame) {
      ports.firstFrame.fail(new Error('editor document mount failed'))
      await firstFrame
    }
  } catch (error) {
    mounted = false
    ports.firstFrame.fail(error)
    await firstFrame?.catch(() => undefined)
  } finally {
    if (waitsForEditorFrame) {
      const { tauriDesktopBridge } = await import('../../desktop-bridge')
      await tauriDesktopBridge.quickCaptureEditorMounted(documentId, mounted)
    }
  }
}

function setLifecycleError(ports: DesktopLifecyclePorts, error: unknown): void {
  ports.documentState.value = {
    kind: 'error',
    message: error instanceof Error ? error.message : String(error),
  }
}
