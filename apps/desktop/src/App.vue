<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import {
  DocumentSessionController,
  DocumentSessionCoordinator,
  EditorShell,
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type ShellActionAdapter,
  type ShellDocumentState,
} from '@cute-screen/editor-vue'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot(): { crop: unknown; saveState: string } | undefined
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

const testActions: ShellActionAdapter | undefined =
  import.meta.env.VITE_TEST_HARNESS === 'true'
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
const documentState = shallowRef<ShellDocumentState>({ kind: 'loading' })
const readOnlyDocument = shallowRef(false)
const initialDocumentState =
  import.meta.env.VITE_TEST_HARNESS === 'true' && !m03Harness
    ? undefined
    : documentState
const lifecycleCleanup: Array<() => void> = []

function correlationId(): string {
  return `m03-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function loadPersistedDocument(): Promise<void> {
  if (import.meta.env.VITE_TEST_HARNESS === 'true' && !m03Harness) return
  documentState.value = { kind: 'loading' }
  readOnlyDocument.value = false
  try {
    // Keep the native API out of browser-mode bundles: merely evaluating the
    // Tauri bridge is not supported by all test WebViews.
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const record = await tauriDesktopBridge.repositoryOpenLast(correlationId())
    if (!record) {
      documentState.value = { kind: 'empty' }
      return
    }
    const parsed = parsePersistedDocument(record)
    if (record.imageToken) {
      await loadImageWithBinaryFallback({
        token: record.imageToken,
        correlationId: correlationId(),
        bridge: tauriDesktopBridge,
        createResource: async () => undefined,
      })
    }
    if (parsed.kind === 'readOnly') {
      readOnlyDocument.value = true
      documentState.value = {
        kind: 'ready',
        title: `Document ${record.documentId.slice(0, 8)}`,
        dimensions: 'Compatibility mode',
      }
      return
    }
    const coordinator = new DocumentSessionCoordinator({
      bridge: {
        saveDocument: (save, correlation) =>
          tauriDesktopBridge.repositorySaveDocument(
            save.documentId,
            save.revision,
            save.documentJson,
            correlation,
          ),
        exportRecoveryBundle: async (documentId, correlation) => {
          try {
            return await tauriDesktopBridge.repositoryExportRecoveryBundle(
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
    coordinator.openInitial({
      documentId: record.documentId,
      document: parsed.document,
      revision: record.revision,
    })
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
  } catch (error) {
    documentState.value = {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function flushBeforeLifecycleAction(): Promise<boolean> {
  const outcome = await documentSession.value?.flush()
  return outcome?.kind !== 'failed'
}

async function installLifecycleGuards(): Promise<void> {
  if (import.meta.env.VITE_TEST_HARNESS === 'true' && !m03Harness) return
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
}

onMounted(() => {
  void loadPersistedDocument()
  void installLifecycleGuards()
})

onBeforeUnmount(() => {
  for (const cleanup of lifecycleCleanup.splice(0)) cleanup()
})
</script>

<template>
  <EditorShell
    :fixture="fixture"
    :initial-document-state="initialDocumentState"
    :read-only-document="readOnlyDocument"
    :actions="testActions"
    :document-session="documentSession"
    @retry-load="loadPersistedDocument"
  />
</template>
