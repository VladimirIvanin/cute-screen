<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { t } from '../i18n'
import { createBrowserPreferencesStorage } from '../preferences'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { CaptureProgressState } from '../../platform'
import type {
  CanvasViewportHosts,
  FrameSummary,
  ShellDocumentState,
  ShellActionAdapter,
  ToolDescriptor,
} from '../types'
import type {
  DocumentSessionController,
  DocumentSessionSnapshot,
} from '../../document-session'
import {
  createFlipCanvasCommand,
  type EditorDocumentV1,
  type ImageLayer,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import ActionFeedback from './ActionFeedback.vue'
import CanvasViewport from './CanvasViewport.vue'
import ContextToolbar from './ContextToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'

const props = withDefaults(
  defineProps<{
    actions?: ShellActionAdapter | undefined
    documentSession?: DocumentSessionController | undefined
    fixture?: 'empty' | 'error' | 'loading' | 'ready'
    initialDocumentState?: ShellDocumentState | undefined
    readOnlyDocument?: boolean
    captureAvailable?: boolean
    captureUnavailableReason?: string | undefined
    captureFallbackCommand?: string | undefined
    captureProgress?: CaptureProgressState | undefined
    frames?: readonly FrameSummary[] | undefined
    sourceImage?: HTMLImageElement | undefined
  }>(),
  {
    actions: undefined,
    documentSession: undefined,
    fixture: 'empty',
    initialDocumentState: undefined,
    readOnlyDocument: false,
    captureAvailable: true,
    captureUnavailableReason: undefined,
    captureFallbackCommand: undefined,
    captureProgress: undefined,
    frames: undefined,
    sourceImage: undefined,
  },
)
const emit = defineEmits<{
  hostsReady: [hosts: CanvasViewportHosts]
  retryLoad: []
}>()
const store = useEditorShellStore()
const state = storeToRefs(store)
const fallbackCopied = ref(false)
const activeDocument = ref<EditorDocumentV1>()
const baseImageLayer = computed(() =>
  activeDocument.value?.layers.find(
    (layer): layer is ImageLayer =>
      layer.kind === 'image' && layer.payload.role === 'base',
  ),
)
const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
const hasInteractiveDocument = computed(
  () => props.documentSession !== undefined || props.fixture === 'ready',
)
const tools: readonly ToolDescriptor[] = [
  {
    id: 'select',
    group: 'canvas',
    icon: 'select',
    labelKey: 'toolSelect',
    shortcut: 'V',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'hand',
    group: 'canvas',
    icon: 'hand',
    labelKey: 'toolHand',
    shortcut: 'H',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'crop',
    group: 'canvas',
    icon: 'crop',
    labelKey: 'toolCrop',
    shortcut: 'C',
    disabled: true,
  },
  {
    id: 'arrow',
    group: 'annotate',
    icon: 'arrow',
    labelKey: 'toolArrow',
    shortcut: 'A',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'shape',
    group: 'annotate',
    icon: 'shape',
    labelKey: 'toolShape',
    shortcut: 'S',
    disabled: true,
  },
  {
    id: 'pencil',
    group: 'annotate',
    icon: 'pencil',
    labelKey: 'toolPencil',
    shortcut: 'P',
    disabled: true,
  },
  {
    id: 'marker',
    group: 'annotate',
    icon: 'marker',
    labelKey: 'toolMarker',
    shortcut: 'M',
    disabled: true,
  },
  {
    id: 'text',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolText',
    shortcut: 'T',
    disabled: true,
  },
  {
    id: 'privacy',
    group: 'more',
    icon: 'privacy',
    labelKey: 'toolPrivacy',
    disabled: true,
  },
  {
    id: 'spotlight',
    group: 'more',
    icon: 'spotlight',
    labelKey: 'toolSpotlight',
    disabled: true,
  },
]
const contextSchema = computed(() =>
  state.activeToolId.value === 'arrow'
    ? {
        icon: 'arrow' as const,
        title: translate('toolArrow'),
        hint: translate('arrowHint'),
        controls: [
          { kind: 'color' as const, id: 'color', label: translate('color') },
          { kind: 'range' as const, id: 'width', label: translate('width') },
        ],
      }
    : activeDocument.value
      ? {
          icon: 'select' as const,
          title: translate('canvasActions'),
          hint: translate('canvasViewport'),
          controls: [
            {
              kind: 'action' as const,
              id: 'flipHorizontal',
              label: translate('flipHorizontal'),
            },
            {
              kind: 'action' as const,
              id: 'flipVertical',
              label: translate('flipVertical'),
            },
          ],
        }
      : undefined,
)
function onContextAction(id: string): void {
  const document = activeDocument.value
  if (!document || !props.documentSession) return
  if (id === 'flipHorizontal' || id === 'flipVertical') {
    props.documentSession.execute(
      createFlipCanvasCommand(
        document,
        id === 'flipHorizontal' ? 'horizontal' : 'vertical',
      ),
    )
  }
}
function updateLayerProperty(
  id: string,
  property: 'visible' | 'locked' | 'opacity' | 'rotation',
  value?: number,
): void {
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (
    !layer ||
    !props.documentSession ||
    (layer.locked && property !== 'locked')
  )
    return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after:
      property === 'visible'
        ? { ...layer, visible: !layer.visible }
        : property === 'locked'
          ? { ...layer, locked: !layer.locked }
          : property === 'opacity'
            ? {
                ...layer,
                opacity: Math.max(0, Math.min(1, value ?? layer.opacity)),
              }
            : {
                ...layer,
                transform: {
                  ...layer.transform,
                  rotation: value ?? layer.transform.rotation,
                },
              },
  })
}
function reorderLayer(id: string, direction: 'up' | 'down'): void {
  const layers = activeDocument.value?.layers
  if (!layers || !props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const toIndex = fromIndex + (direction === 'up' ? 1 : -1)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex >= layers.length ||
    layers[fromIndex]?.locked
  )
    return
  props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex,
  })
}
function onLayerOpacity(id: string, opacity: number): void {
  updateLayerProperty(id, 'opacity', opacity)
}
function onLayerRotation(id: string, rotation: number): void {
  updateLayerProperty(id, 'rotation', rotation)
}
function onLayerReorder(id: string, direction: 'up' | 'down'): void {
  reorderLayer(id, direction)
}
function onLayerReorderTo(id: string, targetId: string): void {
  const layers = activeDocument.value?.layers
  if (!layers || !props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const targetIndex = layers.findIndex((layer) => layer.id === targetId)
  if (
    fromIndex < 0 ||
    targetIndex < 0 ||
    layers[fromIndex]?.locked ||
    fromIndex === targetIndex
  )
    return
  props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex: targetIndex,
  })
}
function moveLayer(id: string, deltaX: number, deltaY: number): void {
  const selected = new Set(store.selectedLayerIds)
  const layers = activeDocument.value?.layers.filter((layer) =>
    selected.has(layer.id),
  )
  if (
    !layers?.length ||
    !props.documentSession ||
    !selected.has(id) ||
    layers.some((layer) => layer.locked)
  ) {
    return
  }
  const commands = layers.map((layer) => ({
    type: 'updateLayer' as const,
    before: layer,
    after: {
      ...layer,
      transform: {
        ...layer.transform,
        translateX: layer.transform.translateX + deltaX,
        translateY: layer.transform.translateY + deltaY,
      },
    },
  }))
  props.documentSession.execute(
    commands.length === 1 ? commands[0]! : { type: 'batch', commands },
  )
}
function selectLayer(id: string, toggle = false, range = false): void {
  store.selectLayer(id, toggle, range)
}
function transformLayer(id: string, transform: Transform2D): void {
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (!layer || layer.locked || !props.documentSession) return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: { ...layer, transform },
  })
}
const media: Pick<
  MediaQueryList,
  'matches' | 'addEventListener' | 'removeEventListener'
> =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : {
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }
const onMediaChange = (event: MediaQueryListEvent) =>
  store.setSystemDark(event.matches)
function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch (error) {
    void error
    return undefined
  }
}
const preferencesOptions: ShellStoreOptions = {
  ...(props.actions ? { actions: props.actions } : {}),
  languages:
    import.meta.env.VITE_TEST_HARNESS === 'true'
      ? (['en'] as const)
      : navigator.languages,
  preferences: createBrowserPreferencesStorage(
    browserStorage(),
    import.meta.env.VITE_TEST_HARNESS === 'true'
      ? (['en'] as const)
      : navigator.languages,
  ),
  systemDark: () => media.matches,
}

function loadFixture(): void {
  if (props.fixture === 'loading') {
    store.setDocumentState({ kind: 'loading' })
    return
  }
  if (props.fixture === 'error') {
    store.setDocumentState({
      kind: 'error',
      message: translate('readyLoadError'),
    })
    return
  }
  if (props.fixture === 'ready') {
    store.setFixture({
      document: {
        kind: 'ready',
        title: 'Landing-page redesign',
        dimensions: '1440 × 900',
      },
      activeToolId: 'arrow',
      selectedLayerId: 'arrow-1',
      layers: [
        {
          id: 'text-1',
          icon: 'text',
          name: 'CTA comment',
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
        },
        {
          id: 'arrow-1',
          icon: 'arrow',
          name: 'Arrow to button',
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
        },
        {
          id: 'marker-1',
          icon: 'marker',
          name: 'Title highlight',
          visible: true,
          locked: true,
          opacity: 1,
          rotation: 0,
        },
      ],
      frames: [
        { id: 'frame-1', label: '1', selected: true },
        { id: 'frame-2', label: '2', selected: false },
        { id: 'frame-3', label: '3', selected: false },
      ],
    })
    store.setLayersOpen(true)
    return
  }
  store.setFixture({ document: { kind: 'empty' } })
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redoDocument()
    else undoDocument()
    return
  }
  if (modifier && event.key.toLowerCase() === 'd' && store.selectedLayerId) {
    const source = activeDocument.value?.layers.find(
      (layer) => layer.id === store.selectedLayerId,
    )
    if (source && !source.locked) {
      event.preventDefault()
      props.documentSession?.execute({
        type: 'duplicateLayer',
        sourceId: source.id,
        layer: {
          ...source,
          id: crypto.randomUUID(),
          transform: {
            ...source.transform,
            translateX: source.transform.translateX + 10,
            translateY: source.transform.translateY + 10,
          },
        },
      })
    }
    return
  }
  if (
    modifier &&
    (event.key === '[' || event.key === ']') &&
    store.selectedLayerId
  ) {
    event.preventDefault()
    reorderLayer(store.selectedLayerId, event.key === ']' ? 'up' : 'down')
    return
  }
  const arrowDeltas: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const delta = arrowDeltas[event.key]
  if (delta && store.selectedLayerIds.length > 0) {
    const selected = new Set(store.selectedLayerIds)
    const layers = activeDocument.value?.layers.filter((layer) =>
      selected.has(layer.id),
    )
    if (layers?.length && !layers.some((layer) => layer.locked)) {
      event.preventDefault()
      const multiplier = event.shiftKey ? 10 : 1
      const commands = layers.map((layer) => ({
        type: 'updateLayer' as const,
        before: layer,
        after: {
          ...layer,
          transform: {
            ...layer.transform,
            translateX: layer.transform.translateX + delta[0] * multiplier,
            translateY: layer.transform.translateY + delta[1] * multiplier,
          },
        },
      }))
      props.documentSession?.execute(
        commands.length === 1 ? commands[0]! : { type: 'batch', commands },
      )
    }
    return
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    store.selectedLayerId
  ) {
    const layer = activeDocument.value?.layers.find(
      (candidate) => candidate.id === store.selectedLayerId,
    )
    if (layer && !layer.locked) {
      event.preventDefault()
      props.documentSession?.execute({
        type: 'removeLayer',
        layer,
        index: activeDocument.value?.layers.indexOf(layer) ?? -1,
      })
    }
    return
  }
  if (event.key === 'Escape') {
    store.clearFeedback()
    store.setLayersOpen(false)
    store.clearLayerSelection()
  }
}
function applyDocumentSnapshot(snapshot: DocumentSessionSnapshot): void {
  activeDocument.value = snapshot.core.document
  if (
    store.selectedLayerIds.some((id) => {
      const layer = snapshot.core.document.layers.find(
        (candidate) => candidate.id === id,
      )
      return !layer || !layer.visible || layer.locked
    })
  ) {
    store.clearLayerSelection()
  }
  store.setDocumentState({
    kind: 'ready',
    title: `Document ${snapshot.core.document.id.slice(0, 8)}`,
    dimensions: `${snapshot.core.document.canvas.width} × ${snapshot.core.document.canvas.height}`,
  })
  store.setDocumentHistory({
    canUndo: snapshot.core.canUndo,
    canRedo: snapshot.core.canRedo,
    saveState: snapshot.saveState,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  })
  store.setLayers(
    [...snapshot.core.document.layers].reverse().map((layer) => ({
      id: layer.id,
      icon: layer.kind === 'image' ? 'image' : 'shape',
      name:
        layer.kind === 'image' && layer.payload.role === 'base'
          ? translate('baseImage')
          : layer.kind,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      rotation: layer.transform.rotation,
    })),
  )
}
function undoDocument(): void {
  props.documentSession?.undo()
}
function redoDocument(): void {
  props.documentSession?.redo()
}
async function copyCaptureFallback(): Promise<void> {
  const command = props.captureFallbackCommand
  if (!command || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(command)
    fallbackCopied.value = true
  } catch (error) {
    console.warn('cute-screen fallback command copy failed', error)
  }
}
function retryDocumentSave(): void {
  void props.documentSession?.retry()
}
async function exportDocumentRecovery(): Promise<void> {
  const outcome = await props.documentSession?.exportRecoveryBundle()
  if (outcome?.kind === 'failed') {
    store.setDocumentHistory({
      ...store.documentHistory,
      saveState: 'error',
      error: outcome.error,
    })
  }
}
onMounted(() => {
  store.initialize(preferencesOptions)
  if (!props.documentSession) {
    store.setDocumentState(props.initialDocumentState ?? { kind: 'empty' })
    if (!props.initialDocumentState) loadFixture()
    if (props.readOnlyDocument) {
      store.setDocumentHistory({
        canUndo: false,
        canRedo: false,
        saveState: 'readOnly',
      })
    }
  }
  media.addEventListener('change', onMediaChange)
  window.addEventListener('keydown', onKeydown)
})
watch(
  () => props.frames,
  (frames) => {
    if (frames) store.setFrames(frames)
  },
  { immediate: true },
)
watch(
  () => props.documentSession,
  (session, _previous, onCleanup) => {
    if (!session) return
    const unsubscribe = session.subscribe(applyDocumentSnapshot)
    onCleanup(unsubscribe)
  },
  { immediate: true },
)
watch(
  () => props.captureProgress,
  (progress) => {
    if (progress) store.setCaptureProgress(progress)
  },
)
watch(
  () => props.initialDocumentState,
  (state) => {
    if (!props.documentSession && state) store.setDocumentState(state)
  },
)
watch(
  () => props.readOnlyDocument,
  (readOnly) => {
    if (!props.documentSession && readOnly) {
      store.setDocumentHistory({
        canUndo: false,
        canRedo: false,
        saveState: 'readOnly',
      })
    }
  },
)
onBeforeUnmount(() => {
  // Navigation/remount must not leave the coalesced save behind.
  void props.documentSession?.flush()
  props.documentSession?.dispose()
  media.removeEventListener('change', onMediaChange)
  window.removeEventListener('keydown', onKeydown)
})
watch(
  [state.resolvedTheme, state.locale],
  ([theme, locale]) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
  },
  { immediate: true },
)
</script>

<template>
  <div class="cs-editor-shell">
    <TopBar
      :locale="store.locale"
      :theme="store.preferences.theme"
      :can-copy-or-export="store.canCopyOrExport"
      :can-undo="store.documentHistory.canUndo"
      :can-redo="store.documentHistory.canRedo"
      :save-state="store.documentHistory.saveState"
      :save-error="store.documentHistory.error"
      :pending="store.actionState.status === 'pending'"
      :capture-available="props.captureAvailable"
      :capture-unavailable-reason="
        props.captureUnavailableReason ?? translate('captureUnavailable')
      "
      :t="translate"
      @action="store.runAction"
      @undo="undoDocument"
      @redo="redoDocument"
      @retry-save="retryDocumentSave"
      @export-recovery="exportDocumentRecovery"
      @locale="store.setLocale"
      @theme="store.setTheme"
    />
    <div
      v-if="props.captureFallbackCommand"
      class="cs-capture-fallback"
      role="status"
    >
      <span>{{ translate('captureFallback') }}</span>
      <code>{{ props.captureFallbackCommand }}</code>
      <button
        type="button"
        :aria-label="translate('copyCaptureFallback')"
        @click="copyCaptureFallback"
      >
        {{
          fallbackCopied
            ? translate('captureFallbackCopied')
            : translate('copyCaptureFallback')
        }}
      </button>
    </div>
    <div class="cs-workbench">
      <ToolRail
        :tools="tools"
        :active-tool-id="store.activeToolId"
        :t="translate"
        @select="store.selectTool"
      />
      <CanvasViewport
        :document-state="store.documentState"
        :canvas="activeDocument?.canvas"
        :image="props.sourceImage"
        :image-layer="baseImageLayer"
        :document="activeDocument"
        :selected-layer-id="store.selectedLayerId"
        :selected-layer-ids="store.selectedLayerIds"
        :active-tool="store.activeToolId"
        :zoom="store.zoom"
        :fit-mode="store.zoomMode === 'fit'"
        :t="translate"
        @hosts-ready="emit('hostsReady', $event)"
        @select-layer="selectLayer"
        @move-layer="moveLayer"
        @transform-layer="transformLayer"
        @zoom="store.setZoom"
        @fit-zoom="store.setFitZoom"
        @retry="emit('retryLoad')"
      />
      <LayersPanel
        :layers="store.layers"
        :open="store.layersOpen"
        :selected-layer-id="store.selectedLayerId"
        :selected-layer-ids="store.selectedLayerIds"
        :t="translate"
        @select="selectLayer"
        @toggle="store.toggleLayers"
        @visibility="updateLayerProperty($event, 'visible')"
        @lock="updateLayerProperty($event, 'locked')"
        @opacity="onLayerOpacity"
        @rotation="onLayerRotation"
        @reorder="onLayerReorder"
        @reorder-to="onLayerReorderTo"
      />
      <ZoomControls
        :zoom="store.zoom"
        :t="translate"
        @zoom="store.setZoom"
        @fit="store.enableFit"
      />
      <ContextToolbar
        :schema="contextSchema"
        :label="translate('toolSettings')"
        @action="onContextAction"
      />
    </div>
    <SeriesFilmstrip
      :frames="store.frames"
      :active-frame-id="store.activeFrameId"
      :t="translate"
      @select="store.selectFrame"
    />
    <ActionFeedback
      :state="store.actionState"
      :t="translate"
      @cancel="store.cancelAction"
      @retry="
        store.runAction(
          store.actionState.status === 'error'
            ? store.actionState.action
            : 'capture',
        )
      "
    />
  </div>
</template>
