<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import {
  createEditorDocumentFromImage,
  describeError,
  DocumentSessionController,
  EditorShell,
  loadImageWithBinaryFallback,
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
  presentThenWaitForStableQuickCaptureLayout,
  type QuickRect,
} from './quick-capture-layout'
import { useQuickCaptureCoordinator } from './use-quick-capture-coordinator'
import { QuickCaptureLayoutController } from './quick-capture-layout-controller'
import { QuickCaptureCommitController } from './quick-capture-commit-controller'
import { QuickCaptureActionController } from './quick-capture-action-controller'
import { listenQuickCaptureAvailable } from './platform/tauri/quick-capture-events'

const draft = shallowRef<QuickCaptureDraftV1>()
const session = shallowRef<DocumentSessionController>()
const sourceImage = shallowRef<HTMLImageElement>()
const hosts = shallowRef<CanvasViewportHosts>()
const documentState = ref<ShellDocumentState>({ kind: 'loading' })
const pending = ref(false)
const materialized = ref(false)
const error = ref<string>()
const quickLayoutReady = ref(false)
const coordinator = useQuickCaptureCoordinator(tauriDesktopBridge)
const selectionPending = computed(() => coordinator.phase.value === 'selecting')
const russian = navigator.language.toLowerCase().startsWith('ru')
const labels = russian
  ? {
      actions: 'Действия со снимком',
      editor: 'Редактор',
      copy: 'Копировать',
      save: 'Сохранить PNG',
      close: 'Закрыть',
      selectArea: 'Выделите область',
      portalLimit: 'Область можно уменьшать только внутри фрагмента портала',
    }
  : {
      actions: 'Quick capture actions',
      editor: 'Editor',
      copy: 'Copy',
      save: 'Save PNG',
      close: 'Close',
      selectArea: 'Select an area',
      portalLimit: 'The frame can only be reduced inside the portal fragment',
    }
const currentCrop = ref({ x: 0, y: 0, width: 0, height: 0 })
const layoutController = new QuickCaptureLayoutController({
  hosts,
  session,
  currentCrop,
})
const commitController = new QuickCaptureCommitController({
  draft,
  session,
  hosts,
  currentCrop,
  materialized,
  selectionPending,
  coordinator,
})
const actionController = new QuickCaptureActionController({
  hosts,
  draft,
  pending,
  error,
  materialized,
  selectionPending,
  coordinator,
  commit: commitController,
  dismissWindow,
})
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

function updateQuickLayout(crop: QuickRect = currentCrop.value) {
  return layoutController.update(crop)
}

function nextLayoutFrame(): Promise<void> {
  return layoutController.nextFrame()
}

function onQuickFrameChange(crop: QuickRect): void {
  updateQuickLayout(crop)
}

async function onQuickSelectionComplete(crop: QuickRect): Promise<void> {
  const active = draft.value
  if (!active || !selectionPending.value || pending.value) return
  pending.value = true
  error.value = undefined
  try {
    const selection = normalizeQuickCaptureSelection(crop, {
      width: active.width,
      height: active.height,
    })
    if (!(await coordinator.confirmSelection(active.draftId, selection))) {
      throw new Error('Quick capture selection is no longer active')
    }
    currentCrop.value = selection
    await nextTick()
    await nextTick()
    updateQuickLayout(selection)
  } catch (cause) {
    await terminateFailedPresentation(active.draftId, cause)
  } finally {
    pending.value = false
  }
}

function onWindowResize(): void {
  updateQuickLayout()
}

function onSceneDoubleClick(event: MouseEvent): void {
  if (selectionPending.value) return
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
  coordinator.reset()
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
    if (selectionPending.value) {
      if (!(await tauriDesktopBridge.quickCapturePresent(draftId))) {
        throw new Error('Quick capture draft is no longer active')
      }
      quickLayoutReady.value = true
      await nextTick()
      await nextLayoutFrame()
      if (!(await tauriDesktopBridge.quickCaptureReveal(draftId))) {
        throw new Error('Quick capture draft is no longer active')
      }
      presentedDraftId = draftId
      return
    }
    const presentation = await presentThenWaitForStableQuickCaptureLayout({
      present: () => tauriDesktopBridge.quickCapturePresent(draftId),
      reveal: async () => {
        quickLayoutReady.value = true
        await nextTick()
        await nextLayoutFrame()
        if (!(await tauriDesktopBridge.quickCaptureReveal(draftId))) {
          throw new Error('Quick capture draft is no longer active')
        }
      },
      measure: () => updateQuickLayout(),
      nextFrame: nextLayoutFrame,
    })
    if (draft.value?.draftId !== draftId) return
    if (!presentation.presented) {
      throw new Error('Quick capture draft is no longer active')
    }
    if (!presentation.layout) {
      throw new Error('Quick capture chrome did not reach a stable layout')
    }
    presentedDraftId = draftId
  } finally {
    if (presentingDraftId === draftId) presentingDraftId = undefined
  }
}

async function terminateFailedPresentation(
  draftId: string,
  cause: unknown,
): Promise<void> {
  console.warn('cute-screen quick capture presentation failed', cause)
  try {
    await cancelQuickCaptureAction({
      draftId,
      cancelDraft: coordinator.cancel,
      closeWindow: dismissWindow,
    })
  } catch (cleanupError) {
    console.warn(
      'cute-screen quick capture presentation cleanup failed',
      cleanupError,
    )
  }
}

function onFrameReady(documentId: string): void {
  const activeDraft = draft.value
  if (!activeDraft || session.value?.snapshot.core.document.id !== documentId)
    return
  void presentPreparedDraft(activeDraft.draftId).catch((cause) => {
    void terminateFailedPresentation(activeDraft.draftId, cause)
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
  coordinator.projectDraft(active)
  if (!(await tauriDesktopBridge.quickCaptureWarmup(active.draftId))) {
    throw new Error('Quick capture draft is no longer active')
  }
  if (revision !== loadRevision || draft.value?.draftId !== active.draftId)
    return
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
    crop: active.selectionPending
      ? null
      : {
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
    const message = describeError(cause, 'Quick capture could not be prepared')
    documentState.value = { kind: 'error', message }
    error.value = message
    const activeDraft = draft.value
    if (activeDraft) {
      try {
        await presentPreparedDraft(activeDraft.draftId)
      } catch (presentationError) {
        await terminateFailedPresentation(
          activeDraft.draftId,
          presentationError,
        )
      }
    }
  }
}

function recordPreparationError(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  documentState.value = { kind: 'error', message }
  error.value = message
}

async function initializeQuickCaptureWindow(): Promise<void> {
  unsubscribeQuickCaptureAvailable = await listenQuickCaptureAvailable(
    () => void prepareActiveDraft().catch(recordPreparationError),
  )
  await prepareActiveDraft()
}

const copy = () => actionController.copy()
const save = () => actionController.save()
const openEditor = () => actionController.openEditor()
const cancel = () => actionController.cancel()
const onKeydown = (event: KeyboardEvent) => actionController.keydown(event)

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
    :class="{
      'is-layout-ready': quickLayoutReady,
      'is-selecting': selectionPending,
    }"
    data-testid="quick-capture-shell"
  >
    <EditorShell
      quick-mode
      :quick-selection-mode="selectionPending"
      :initial-document-state="documentState"
      :document-session="session"
      :source-image="sourceImage"
      :content-image-bridge="tauriDesktopBridge"
      @hosts-ready="onHostsReady"
      @frame-ready="onFrameReady"
      @quick-frame-change="onQuickFrameChange"
      @quick-selection-complete="onQuickSelectionComplete"
    />
    <div v-if="draft" class="cs-quick-size-a11y" aria-live="polite">
      {{ currentCrop.width }} × {{ currentCrop.height }}
    </div>
    <p
      v-if="draft && selectionPending"
      class="cs-quick-selection-hint"
      role="status"
    >
      {{ labels.selectArea }}
    </p>
    <nav
      v-if="draft && !selectionPending"
      class="cs-quick-actions"
      :aria-label="labels.actions"
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
      v-if="draft && !selectionPending && !draft.canExpandSelection"
      class="cs-quick-portal-limit"
      role="note"
    >
      {{ labels.portalLimit }}
    </p>
    <p v-if="error" class="cs-quick-error" role="alert">{{ error }}</p>
  </main>
</template>
