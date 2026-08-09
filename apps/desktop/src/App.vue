<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import {
  DocumentSessionController,
  DocumentSessionCoordinator,
  EditorShell,
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type ShellActionAdapter,
} from '@cute-screen/editor-vue'

const fixture =
  import.meta.env.VITE_TEST_HARNESS === 'true'
    ? ((new URLSearchParams(window.location.search).get('m02') as
        'empty' | 'error' | 'loading' | 'ready' | null) ?? 'empty')
    : 'empty'

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

function correlationId(): string {
  return `m03-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

onMounted(async () => {
  if (import.meta.env.VITE_TEST_HARNESS === 'true') return
  try {
    // Keep the native API out of browser-mode bundles: merely evaluating the
    // Tauri bridge is not supported by all test WebViews.
    const { tauriDesktopBridge } = await import('./desktop-bridge')
    const record = await tauriDesktopBridge.repositoryOpenLast(correlationId())
    if (!record) return
    const document = parsePersistedDocument(record)
    if (!document) return
    const coordinator = new DocumentSessionCoordinator({
      bridge: {
        saveDocument: (save, correlation) =>
          tauriDesktopBridge.repositorySaveDocument(
            save.documentId,
            save.revision,
            save.documentJson,
            correlation,
          ),
      },
      correlationId,
      onActiveSession: (session) => {
        documentSession.value = session
      },
    })
    coordinator.openInitial({
      documentId: record.documentId,
      document,
      revision: record.revision,
    })
    if (record.imageToken) {
      await loadImageWithBinaryFallback({
        token: record.imageToken,
        correlationId: correlationId(),
        bridge: tauriDesktopBridge,
        createResource: async () => undefined,
      })
    }
  } catch (error) {
    console.warn('Cute Screen storage unavailable during startup', error)
  }
})
</script>

<template>
  <EditorShell
    :fixture="fixture"
    :actions="testActions"
    :document-session="documentSession"
  />
</template>
