import { useCompositionMaterials } from './materials-controller'
import {
  computed,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
  type Ref,
} from 'vue'
import {
  createComposition,
  updateCompositionPresentation,
  type CompositionSettings,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { createWorkspaceState } from '../workspace/workspace-state'
import type { useEditorShellStore } from '../store'
import { compositionEditingKey } from './editing'
import { compositionImagesKey } from './image-preview'

type Workspace = ReturnType<typeof createWorkspaceState>

function finishSpaceChange(
  props: ResolvedEditorShellProps,
  workspace: Workspace,
  store: ReturnType<typeof useEditorShellStore>,
  current: Ref<'content' | 'card'>,
  space: 'content' | 'card',
): void {
  workspace.canvasViewport.value?.finishTextEditing(() => {
    current.value = space
    props.documentSession?.setLayerSpace(space)
    store.clearLayerSelection()
  })
}

function removeComposition(
  props: ResolvedEditorShellProps,
  workspace: Workspace,
  disabled: () => boolean,
  cancel: () => void,
): void {
  const finish = () => {
    const doc = workspace.activeDocument.value
    if (!doc?.presentation.composition || disabled()) return
    cancel()
    const after = updateCompositionPresentation(doc, undefined)
    props.documentSession!.execute({ type: 'setPresentation', before: doc.presentation, after })
  }
  if (workspace.canvasViewport.value) workspace.canvasViewport.value.finishTextEditing(finish)
  else finish()
}

function neutralComposition(): CompositionSettings {
  const neutral = createComposition()
  return {
    ...neutral,
    layout: { ...neutral.layout, insets: { ...neutral.layout.insets, top: 0, right: 0, bottom: 0, left: 0 } },
    background: { ...neutral.background, kind: 'transparent' },
    radius: 0,
    shadow: 0,
  }
}

function compositionCommit(
  props: ResolvedEditorShellProps,
  workspace: Workspace,
  disabled: Ref<boolean>,
  settings: Ref<CompositionSettings | undefined>,
  cancel: () => void,
) {
  return (value: CompositionSettings, automaticPhoneOrientation = true): void => {
    const doc = workspace.activeDocument.value
    if (!doc || disabled.value) return
    cancel()
    if (JSON.stringify(settings.value) === JSON.stringify(value)) return
    props.documentSession!.execute({ type: 'setPresentation', before: doc.presentation,
      after: updateCompositionPresentation(doc, value, automaticPhoneOrientation) })
  }
}

function useCompositionPreview(
  workspace: Workspace,
  disabled: () => boolean,
) {
  const compositionPreview = shallowRef<CompositionSettings>()
  let previewFrame: number | undefined
  let pendingPreview: CompositionSettings | undefined
  let previewDocument: typeof workspace.activeDocument.value
  function cancel(): void {
    if (previewFrame !== undefined) cancelAnimationFrame(previewFrame)
    previewFrame = undefined
    pendingPreview = undefined
    previewDocument = undefined
    compositionPreview.value = undefined
  }
  function preview(value: CompositionSettings): void {
    if (disabled()) return
    pendingPreview = value
    previewDocument = workspace.activeDocument.value
    previewFrame ??= requestAnimationFrame(() => {
      previewFrame = undefined
      if (previewDocument === workspace.activeDocument.value && !disabled()) {
        compositionPreview.value = pendingPreview
      }
      pendingPreview = undefined
    })
  }
  watch(() => workspace.activeDocument.value, cancel, { flush: 'sync' })
  watch(disabled, (blocked) => {
    if (blocked) cancel()
  }, { flush: 'sync' })
  onBeforeUnmount(cancel)
  return { compositionPreview, preview, cancel }
}

export function useComposition(
  props: ResolvedEditorShellProps,
  workspace: Workspace,
  store: ReturnType<typeof useEditorShellStore>,
) {
  provide(compositionImagesKey, { images: workspace.textureImages, error: workspace.toolError })
  const compositionOpen = ref(false)
  const compositionSpace = ref<'content' | 'card'>('content')
  const neutralSettings = neutralComposition()
  const applied = computed(() => Boolean(workspace.activeDocument.value?.presentation.composition))
  const settings = computed(() => {
    const document = workspace.activeDocument.value
    return document ? document.presentation.composition ?? neutralSettings : undefined
  })
  const pending = ref(false)
  const editing = ref(false)
  const selectedBrand = ref<string>()
  const gradientTarget = ref<'background' | 'header' | 'footer'>('background')
  const disabled = computed(() => props.readOnlyDocument || !props.documentSession || pending.value || store.actionState.status === 'pending')
  const { compositionPreview, preview, cancel } = useCompositionPreview(workspace, () => disabled.value)
  const t = (ru: string, en: string) => store.locale === 'ru' ? ru : en
  const commit = compositionCommit(props, workspace, disabled, settings, cancel)
  const library = useCompositionMaterials({ props, workspace, settings, selectedBrand, disabled,
    commit: (value) => commit(value, false), t, pending })
  const { materials, error, load, saveMaterial, removeMaterial, applyMaterial, importImage } = library
  function switchSpace(space: 'content' | 'card'): void {
    finishSpaceChange(props, workspace, store, compositionSpace, space)
  }
  function activateSpace(space: 'content' | 'card'): void {
    compositionSpace.value = space
    props.documentSession?.setLayerSpace(space)
    store.clearLayerSelection()
  }
  function remove(): void {
    if (disabled.value || !applied.value) return
    removeComposition(props, workspace, () => disabled.value, cancel)
  }
  watch(applied, (value) => {
    if (value) return
    cancel()
    editing.value = false
    selectedBrand.value = undefined
    activateSpace('content')
  }, { flush: 'sync' })
  function toggle(): void {
    store.setZoom(store.zoom)
    editing.value = false
    cancel()
    compositionOpen.value = !compositionOpen.value
    if (compositionOpen.value) {
      store.setLayersOpen(false)
      void load()
    }
  }
  watch(() => store.layersOpen, (open) => {
    if (open) {
      compositionOpen.value = false
      editing.value = false
      cancel()
    }
  })
  watch(() => store.selectedLayerId, (id) => {
    const layer = workspace.activeDocument.value?.layers.find((l) => l.id === id)
    if (layer && store.selectedLayerIds.some((selected) => (workspace.activeDocument.value?.layers.find((l) => l.id === selected)?.space ?? 'content') !== (layer.space ?? 'content'))) {
      store.clearLayerSelection()
      store.selectLayer(layer.id)
    }
    if (layer) {
      compositionSpace.value = applied.value ? layer.space ?? 'content' : 'content'
      props.documentSession?.setLayerSpace(compositionSpace.value)
    }
  })
  watch(() => workspace.activeDocument.value?.id, () => {
    cancel()
    compositionSpace.value = 'content'
    props.documentSession?.setLayerSpace('content')
    editing.value = false
  })
  watch(() => store.activeToolId, (tool) => {
    if (tool === 'crop') switchSpace('content')
  })
  provide(compositionEditingKey,
    { settings,
      preview: compositionPreview,
      editing,
      selectedBrand,
      gradientTarget,
      commit,
      showPreview: preview,
      cancel,
      disabled })
  return { compositionOpen,
    compositionSpace,
    compositionPreview,
    compositionSettings: settings,
    compositionApplied: applied,
    compositionMaterials: materials,

    compositionPending: pending, compositionError: error, compositionDisabled: disabled,
    toggleComposition: toggle,
    activateCompositionSpace: activateSpace,
    commitComposition: commit,
    removeComposition: remove,
    previewComposition: preview,

    cancelCompositionPreview: cancel, importCompositionImage: importImage, saveCompositionMaterial: saveMaterial,
    removeCompositionMaterial: removeMaterial,
    applyCompositionMaterial: applyMaterial,
    reloadCompositionMaterials: load,

    compositionGradientEditing: editing,
    compositionSelectedBrand: selectedBrand,
    compositionGradientTarget: gradientTarget }
}
