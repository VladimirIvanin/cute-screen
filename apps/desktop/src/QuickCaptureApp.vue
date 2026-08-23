<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  createEditorDocumentFromImage,
  DocumentSessionController,
  EditorShell,
  loadImageWithBinaryFallback,
  materializeQuickCaptureDocument,
  type CanvasViewportHosts,
  type QuickCaptureDraftV1,
  type ShellDocumentState,
} from '@cute-screen/editor-vue'
import { tauriDesktopBridge } from './desktop-bridge'

const draft = shallowRef<QuickCaptureDraftV1>()
const session = shallowRef<DocumentSessionController>()
const sourceImage = shallowRef<HTMLImageElement>()
const hosts = shallowRef<CanvasViewportHosts>()
const documentState = ref<ShellDocumentState>({ kind: 'loading' })
const pending = ref(false)
const materialized = ref(false)
const error = ref<string>()
const russian = navigator.language.toLowerCase().startsWith('ru')
const labels = russian
  ? {
      actions: 'Действия со снимком',
      editor: 'Редактор',
      copy: 'Копировать',
      save: 'Сохранить PNG',
      close: 'Закрыть',
      portalLimit: 'Область можно уменьшать только внутри фрагмента портала',
    }
  : {
      actions: 'Quick capture actions',
      editor: 'Editor',
      copy: 'Copy',
      save: 'Save PNG',
      close: 'Close',
      portalLimit: 'The frame can only be reduced inside the portal fragment',
    }
const currentCrop = ref({ x: 0, y: 0, width: 0, height: 0 })
const actionStyle = shallowRef<Record<string, string>>()
let unsubscribeSession: (() => void) | undefined
let sceneElement: HTMLCanvasElement | undefined

function onHostsReady(value: CanvasViewportHosts): void {
  sceneElement?.removeEventListener('dblclick', onSceneDoubleClick)
  hosts.value = value
  sceneElement = value.scene
  sceneElement.addEventListener('dblclick', onSceneDoubleClick)
  updateQuickLayout()
}

function updateQuickLayout(): void {
  if (!hosts.value || currentCrop.value.width <= 0) return
  const bounds = hosts.value.scene.getBoundingClientRect()
  const sourceWidth = session.value?.snapshot.core.document.canvas.width ?? 1
  const sourceHeight = session.value?.snapshot.core.document.canvas.height ?? 1
  const scaleX = bounds.width / sourceWidth
  const scaleY = bounds.height / sourceHeight
  const crop = currentCrop.value
  const left = bounds.left + crop.x * scaleX
  const right = left + crop.width * scaleX
  const centerY = bounds.top + (crop.y + crop.height / 2) * scaleY
  const barWidth = 124
  const gap = 12
  let barLeft: number
  if (window.innerWidth - right >= barWidth + gap + 8) {
    barLeft = right + gap
  } else if (left >= barWidth + gap + 8) {
    barLeft = left - barWidth - gap
  } else {
    barLeft = Math.max(8, window.innerWidth - barWidth - 8)
  }
  actionStyle.value = {
    left: `${Math.round(barLeft)}px`,
    right: 'auto',
    top: `${Math.round(Math.max(96, Math.min(window.innerHeight - 96, centerY)))}px`,
  }

  const quickRoot = document.querySelector<HTMLElement>('.cs-quick-capture')
  const toolRow = quickRoot?.querySelector<HTMLElement>(
    '.cs-quick-toolrail-group',
  )
  const context = quickRoot?.querySelector<HTMLElement>('.cs-context-toolbar')
  if (!toolRow) return
  const contextHeight = context?.offsetHeight ?? 0
  const verticalGap = context ? 6 : 0
  const groupHeight = contextHeight + verticalGap + toolRow.offsetHeight
  const cropTop = bounds.top + crop.y * scaleY
  const cropBottom = cropTop + crop.height * scaleY
  const below = cropBottom + gap
  const groupTop =
    below + groupHeight <= window.innerHeight - 8
      ? below
      : cropTop - gap - groupHeight >= 8
        ? cropTop - gap - groupHeight
        : Math.max(8, window.innerHeight - groupHeight - 8)
  const groupWidth = Math.max(toolRow.offsetWidth, context?.offsetWidth ?? 0)
  const centeredLeft = left + (right - left - groupWidth) / 2
  const groupLeft = Math.max(
    8,
    Math.min(window.innerWidth - groupWidth - 8, centeredLeft),
  )
  if (context) {
    context.style.left = `${Math.round(groupLeft)}px`
    context.style.top = `${Math.round(groupTop)}px`
    context.style.bottom = 'auto'
    context.style.transform = 'none'
  }
  toolRow.style.left = `${Math.round(groupLeft)}px`
  toolRow.style.top = `${Math.round(groupTop + contextHeight + verticalGap)}px`
  toolRow.style.bottom = 'auto'
  toolRow.style.transform = 'none'
}

function onSceneDoubleClick(event: MouseEvent): void {
  if ((session.value?.snapshot.core.document.layers.length ?? 0) !== 1) return
  if (!hosts.value || !session.value) return
  const bounds = hosts.value.scene.getBoundingClientRect()
  const canvas = session.value.snapshot.core.document.canvas
  const point = {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  }
  const crop = currentCrop.value
  if (
    point.x < crop.x ||
    point.y < crop.y ||
    point.x > crop.x + crop.width ||
    point.y > crop.y + crop.height
  )
    return
  event.preventDefault()
  void copy()
}

async function closeWindow(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

async function loadDraft(): Promise<void> {
  const active = await tauriDesktopBridge.quickCaptureGetActive()
  if (!active) {
    documentState.value = {
      kind: 'error',
      message: 'Quick capture draft is no longer available.',
    }
    return
  }
  draft.value = active
  const loaded = await loadImageWithBinaryFallback({
    token: active.imageToken,
    correlationId: active.correlationId,
    bridge: tauriDesktopBridge,
    createResource: async (image: HTMLImageElement) => image,
  })
  sourceImage.value = loaded.resource
  const now = new Date().toISOString()
  const created = createEditorDocumentFromImage({
    id: crypto.randomUUID(),
    baseLayerId: crypto.randomUUID(),
    source: {
      blobHash: loaded.metadata.sha256,
      format: 'png',
      mimeType: 'image/png',
      width: loaded.metadata.width,
      height: loaded.metadata.height,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    timestamp: now,
  })
  const document = {
    ...created,
    crop: {
      x: active.selection.x,
      y: active.selection.y,
      width: active.selection.width,
      height: active.selection.height,
    },
  }
  session.value = new DocumentSessionController({
    document,
    revision: 0,
    debounceMs: 60_000,
    correlationId: () => active.correlationId,
    bridge: {
      saveDocument: async (record) => record.revision + 1,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
  })
  unsubscribeSession = session.value.subscribe((snapshot) => {
    const crop = snapshot.core.document.crop
    currentCrop.value = crop
      ? { ...crop }
      : { x: 0, y: 0, width: active.width, height: active.height }
    requestAnimationFrame(updateQuickLayout)
  })
  documentState.value = {
    kind: 'ready',
    title: 'Quick capture',
    dimensions: `${active.selection.width} × ${active.selection.height}`,
  }
}

function hexDigest(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

async function commit(
  completion: 'copied' | 'saved' | 'editor',
  preparedPng?: Uint8Array,
): Promise<void> {
  if (materialized.value) return
  if (!draft.value || !session.value) return
  const png = preparedPng ?? (await resultPng())
  const sourceHash = hexDigest(
    await crypto.subtle.digest('SHA-256', Uint8Array.from(png).buffer),
  )
  const materializedDocument = materializeQuickCaptureDocument(
    session.value.snapshot.core.document,
    {
      source: {
        blobHash: sourceHash,
        format: 'png',
        mimeType: 'image/png',
        width: currentCrop.value.width,
        height: currentCrop.value.height,
        orientationApplied: true,
        provenance: 'capture',
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      updatedAt: new Date().toISOString(),
    },
  )
  await tauriDesktopBridge.quickCapturePreparePng(png)
  await tauriDesktopBridge.quickCaptureCommit(
    draft.value.draftId,
    JSON.stringify(materializedDocument),
    completion,
    currentCrop.value,
  )
  materialized.value = true
}

async function detectMaterializedAfterError(): Promise<void> {
  if (!draft.value || materialized.value) return
  try {
    materialized.value =
      (await tauriDesktopBridge.quickCaptureGetActive()) === null
  } catch {
    // Preserve the original actionable error if the diagnostic probe fails.
  }
}

async function resultPng(): Promise<Uint8Array> {
  if (!hosts.value) throw new Error('Rendered capture is not ready')
  const source = hosts.value.scene
  const crop = currentCrop.value
  const output = document.createElement('canvas')
  output.width = crop.width
  output.height = crop.height
  const context = output.getContext('2d')
  if (!context) throw new Error('PNG canvas is unavailable')
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  )
  const blob = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('PNG encoding failed')),
      'image/png',
    ),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

async function copy(): Promise<void> {
  if (!hosts.value) return
  pending.value = true
  error.value = undefined
  try {
    const png = await resultPng()
    await commit('copied', png)
    await tauriDesktopBridge.quickCaptureCopyPng(png)
    await closeWindow()
  } catch (cause) {
    await detectMaterializedAfterError()
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

async function save(): Promise<void> {
  if (!hosts.value) return
  pending.value = true
  error.value = undefined
  try {
    const png = await resultPng()
    const selected = await tauriDesktopBridge.quickCaptureChooseSavePng()
    if (!selected) return
    await commit('saved', png)
    await tauriDesktopBridge.quickCaptureWriteSavePng(png)
    await closeWindow()
  } catch (cause) {
    await detectMaterializedAfterError()
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

async function openEditor(): Promise<void> {
  pending.value = true
  error.value = undefined
  try {
    if (materialized.value) {
      await tauriDesktopBridge.quickCaptureOpenEditor()
    } else {
      await commit('editor')
    }
    await closeWindow()
  } catch (cause) {
    await detectMaterializedAfterError()
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

async function cancel(): Promise<void> {
  if (draft.value)
    await tauriDesktopBridge.quickCaptureCancel(draft.value.draftId)
  await closeWindow()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || pending.value) return
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
    return
  if (event.key === 'Enter' && !event.repeat) {
    event.preventDefault()
    void copy()
  } else if (event.key === 'Escape' && !event.repeat) {
    event.preventDefault()
    void cancel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateQuickLayout)
  void loadDraft().catch((cause) => {
    documentState.value = {
      kind: 'error',
      message: cause instanceof Error ? cause.message : String(cause),
    }
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateQuickLayout)
  sceneElement?.removeEventListener('dblclick', onSceneDoubleClick)
  session.value?.dispose()
  unsubscribeSession?.()
})
</script>

<template>
  <main class="cs-quick-capture" data-testid="quick-capture-shell">
    <EditorShell
      quick-mode
      :initial-document-state="documentState"
      :document-session="session"
      :source-image="sourceImage"
      :content-image-bridge="tauriDesktopBridge"
      @hosts-ready="onHostsReady"
    />
    <div v-if="draft" class="cs-quick-size-a11y" aria-live="polite">
      {{ currentCrop.width }} × {{ currentCrop.height }}
    </div>
    <nav
      class="cs-quick-actions"
      :aria-label="labels.actions"
      :style="actionStyle"
    >
      <button type="button" :disabled="pending" @click="openEditor">
        {{ labels.editor }}
      </button>
      <button type="button" :disabled="pending" @click="copy">
        {{ labels.copy }}
      </button>
      <button type="button" :disabled="pending" @click="save">
        {{ labels.save }}
      </button>
      <button type="button" :disabled="pending" @click="cancel">
        {{ labels.close }}
      </button>
    </nav>
    <p
      v-if="draft && !draft.canExpandSelection"
      class="cs-quick-portal-limit"
      role="note"
    >
      {{ labels.portalLimit }}
    </p>
    <p v-if="error" class="cs-quick-error" role="alert">{{ error }}</p>
  </main>
</template>
