<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
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
import {
  cancelQuickCaptureAction,
  normalizeQuickCaptureSelection,
} from './quick-capture-actions'
import {
  computeQuickCaptureLayout,
  type QuickRect,
  waitForStableQuickCaptureLayout,
} from './quick-capture-layout'

const draft = shallowRef<QuickCaptureDraftV1>()
const session = shallowRef<DocumentSessionController>()
const sourceImage = shallowRef<HTMLImageElement>()
const hosts = shallowRef<CanvasViewportHosts>()
const documentState = ref<ShellDocumentState>({ kind: 'loading' })
const pending = ref(false)
const materialized = ref(false)
const error = ref<string>()
const quickLayoutReady = ref(false)
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
let unsubscribeSession: (() => void) | undefined
let unsubscribeQuickCaptureAvailable: (() => void) | undefined
let sceneElement: HTMLCanvasElement | undefined
let loadRevision = 0
let presentedDraftId: string | undefined
let presentingDraftId: string | undefined

function onHostsReady(value: CanvasViewportHosts): void {
  sceneElement?.removeEventListener('dblclick', onSceneDoubleClick)
  hosts.value = value
  sceneElement = value.scene
  sceneElement.addEventListener('dblclick', onSceneDoubleClick)
  requestAnimationFrame(() => updateQuickLayout())
}

function updateQuickLayout(
  crop: QuickRect = currentCrop.value,
): string | undefined {
  if (!hosts.value || crop.width <= 0 || crop.height <= 0) return undefined
  const bounds = hosts.value.scene.getBoundingClientRect()
  const sourceWidth = session.value?.snapshot.core.document.canvas.width ?? 1
  const sourceHeight = session.value?.snapshot.core.document.canvas.height ?? 1
  const quickRoot = document.querySelector<HTMLElement>('.cs-quick-capture')
  const actions = quickRoot?.querySelector<HTMLElement>('.cs-quick-actions')
  const toolRow = quickRoot?.querySelector<HTMLElement>(
    '.cs-quick-toolrail-group',
  )
  const context = quickRoot?.querySelector<HTMLElement>('.cs-context-toolbar')
  if (
    !actions ||
    !toolRow ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    actions.offsetWidth <= 0 ||
    actions.offsetHeight <= 0 ||
    toolRow.offsetWidth <= 0 ||
    toolRow.offsetHeight <= 0
  )
    return undefined
  const contextHeight = context?.offsetHeight ?? 0
  const verticalGap = context ? 6 : 0
  const groupHeight = contextHeight + verticalGap + toolRow.offsetHeight
  const groupWidth = Math.max(toolRow.offsetWidth, context?.offsetWidth ?? 0)
  const layout = computeQuickCaptureLayout({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scene: {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    },
    source: { width: sourceWidth, height: sourceHeight },
    crop,
    actionSize: {
      width: actions.offsetWidth,
      height: actions.offsetHeight,
    },
    toolSize: {
      width: groupWidth,
      height: groupHeight,
    },
  })
  actions.style.left = `${Math.round(layout.actions.left)}px`
  actions.style.right = 'auto'
  actions.style.top = `${Math.round(layout.actions.top)}px`
  actions.style.transform = 'none'
  actions.dataset.placement = layout.actions.side
  if (context) {
    context.style.left = `${Math.round(layout.tools.left)}px`
    context.style.top = `${Math.round(layout.tools.top)}px`
    context.style.bottom = 'auto'
    context.style.transform = 'none'
  }
  toolRow.style.left = `${Math.round(layout.tools.left)}px`
  toolRow.style.top = `${Math.round(layout.tools.top + contextHeight + verticalGap)}px`
  toolRow.style.bottom = 'auto'
  toolRow.style.transform = 'none'
  toolRow.dataset.placement = layout.tools.side
  return [
    window.innerWidth,
    window.innerHeight,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    sourceWidth,
    sourceHeight,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    actions.offsetWidth,
    actions.offsetHeight,
    groupWidth,
    groupHeight,
  ].join(':')
}

function nextLayoutFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(finish, 32)
    requestAnimationFrame(finish)
  })
}

function onQuickFrameChange(crop: QuickRect): void {
  updateQuickLayout(crop)
}

function onWindowResize(): void {
  updateQuickLayout()
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

function resetDraftSession(): void {
  unsubscribeSession?.()
  unsubscribeSession = undefined
  session.value?.dispose()
  session.value = undefined
  sourceImage.value = undefined
  draft.value = undefined
  currentCrop.value = { x: 0, y: 0, width: 0, height: 0 }
  documentState.value = { kind: 'loading' }
  materialized.value = false
  quickLayoutReady.value = false
  error.value = undefined
  presentedDraftId = undefined
  presentingDraftId = undefined
}

async function dismissWindow(): Promise<void> {
  const dismissed = await tauriDesktopBridge.quickCaptureDismiss()
  if (!dismissed) throw new Error('Quick capture window is unavailable')
  resetDraftSession()
}

async function presentPreparedDraft(draftId: string): Promise<void> {
  if (presentedDraftId === draftId || presentingDraftId === draftId) return
  presentingDraftId = draftId
  try {
    await nextTick()
    if (draft.value?.draftId !== draftId) return
    const stableLayout = await waitForStableQuickCaptureLayout({
      measure: () => updateQuickLayout(),
      nextFrame: nextLayoutFrame,
    })
    if (draft.value?.draftId !== draftId) return
    if (!stableLayout && documentState.value.kind !== 'error') {
      throw new Error('Quick capture chrome layout is unavailable')
    }
    quickLayoutReady.value = stableLayout !== undefined
    await nextTick()
    if (draft.value?.draftId !== draftId) return
    const presented = await tauriDesktopBridge.quickCapturePresent(draftId)
    if (!presented) throw new Error('Quick capture draft is no longer active')
    presentedDraftId = draftId
  } finally {
    if (presentingDraftId === draftId) presentingDraftId = undefined
  }
}

function onFrameReady(documentId: string): void {
  const activeDraft = draft.value
  if (!activeDraft || session.value?.snapshot.core.document.id !== documentId)
    return
  void presentPreparedDraft(activeDraft.draftId).catch((cause) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
}

async function loadDraft(): Promise<void> {
  const revision = ++loadRevision
  const active = await tauriDesktopBridge.quickCaptureGetActive()
  if (revision !== loadRevision) return
  if (!active) {
    resetDraftSession()
    return
  }
  resetDraftSession()
  draft.value = active
  const loaded = await loadImageWithBinaryFallback({
    token: active.imageToken,
    correlationId: active.correlationId,
    bridge: tauriDesktopBridge,
    createResource: async (image: HTMLImageElement) => image,
  })
  if (revision !== loadRevision) return
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
    requestAnimationFrame(() => updateQuickLayout())
  })
  documentState.value = {
    kind: 'ready',
    title: 'Quick capture',
    dimensions: `${active.selection.width} × ${active.selection.height}`,
  }
}

async function prepareActiveDraft(): Promise<void> {
  error.value = undefined
  try {
    await loadDraft()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    documentState.value = { kind: 'error', message }
    error.value = message
    const activeDraft = draft.value
    if (activeDraft) await presentPreparedDraft(activeDraft.draftId)
  }
}

function recordPreparationError(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  documentState.value = { kind: 'error', message }
  error.value = message
}

async function initializeQuickCaptureWindow(): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event')
  unsubscribeQuickCaptureAvailable = await listen(
    'cute-screen:quick-capture-available',
    () => void prepareActiveDraft().catch(recordPreparationError),
  )
  await prepareActiveDraft()
}

function hexDigest(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

function physicalSelection(): QuickRect {
  if (!draft.value) throw new Error('Quick capture draft is not ready')
  return normalizeQuickCaptureSelection(currentCrop.value, {
    width: draft.value.width,
    height: draft.value.height,
  })
}

async function commit(
  completion: 'copied' | 'saved' | 'editor',
  preparedPng?: Uint8Array,
  preparedSelection?: QuickRect,
): Promise<void> {
  if (materialized.value) return
  if (!draft.value || !session.value) return
  const selection = preparedSelection ?? physicalSelection()
  const png = preparedPng ?? (await resultPng(selection))
  const sourceHash = hexDigest(
    await crypto.subtle.digest('SHA-256', Uint8Array.from(png).buffer),
  )
  const materializedDocument = materializeQuickCaptureDocument(
    { ...session.value.snapshot.core.document, crop: selection },
    {
      source: {
        blobHash: sourceHash,
        format: 'png',
        mimeType: 'image/png',
        width: selection.width,
        height: selection.height,
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
    selection,
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

async function resultPng(
  selection: QuickRect = physicalSelection(),
): Promise<Uint8Array> {
  if (!hosts.value) throw new Error('Rendered capture is not ready')
  const source = hosts.value.scene
  const output = document.createElement('canvas')
  output.width = selection.width
  output.height = selection.height
  const context = output.getContext('2d')
  if (!context) throw new Error('PNG canvas is unavailable')
  context.drawImage(
    source,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    selection.width,
    selection.height,
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
    const selection = physicalSelection()
    const png = await resultPng(selection)
    await commit('copied', png, selection)
    await tauriDesktopBridge.quickCaptureCopyPng(png)
    await dismissWindow()
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
    const selection = physicalSelection()
    const png = await resultPng(selection)
    const selected = await tauriDesktopBridge.quickCaptureChooseSavePng()
    if (!selected) return
    await commit('saved', png, selection)
    await tauriDesktopBridge.quickCaptureWriteSavePng(png)
    await dismissWindow()
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
    await dismissWindow()
  } catch (cause) {
    await detectMaterializedAfterError()
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

async function cancel(): Promise<void> {
  if (pending.value) return
  pending.value = true
  error.value = undefined
  try {
    await cancelQuickCaptureAction({
      draftId: draft.value?.draftId,
      cancelDraft: tauriDesktopBridge.quickCaptureCancel,
      closeWindow: dismissWindow,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
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
  window.addEventListener('resize', onWindowResize)
  void initializeQuickCaptureWindow().catch(recordPreparationError)
})
onBeforeUnmount(() => {
  loadRevision += 1
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onWindowResize)
  sceneElement?.removeEventListener('dblclick', onSceneDoubleClick)
  unsubscribeQuickCaptureAvailable?.()
  unsubscribeSession?.()
  session.value?.dispose()
})
</script>

<template>
  <main
    class="cs-quick-capture"
    :class="{ 'is-layout-ready': quickLayoutReady }"
    data-testid="quick-capture-shell"
  >
    <EditorShell
      quick-mode
      :initial-document-state="documentState"
      :document-session="session"
      :source-image="sourceImage"
      :content-image-bridge="tauriDesktopBridge"
      @hosts-ready="onHostsReady"
      @frame-ready="onFrameReady"
      @quick-frame-change="onQuickFrameChange"
    />
    <div v-if="draft" class="cs-quick-size-a11y" aria-live="polite">
      {{ currentCrop.width }} × {{ currentCrop.height }}
    </div>
    <nav v-if="draft" class="cs-quick-actions" :aria-label="labels.actions">
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
