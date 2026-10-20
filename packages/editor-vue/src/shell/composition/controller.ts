import { useCompositionMaterials } from './materials-controller'
import {
  computed,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  type CompositionSettings,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { createWorkspaceState } from '../workspace/workspace-state'
import type { useEditorShellStore } from '../store'
import { compositionEditingKey } from './editing'

type Workspace = ReturnType<typeof createWorkspaceState>
export function useComposition(
  props: ResolvedEditorShellProps,
  workspace: Workspace,
  store: ReturnType<typeof useEditorShellStore>,
) {
  const compositionOpen = ref(false)
  const compositionSpace = ref<'content' | 'card'>('content')
  const compositionPreview = shallowRef<CompositionSettings>()
  const settings = computed(() => workspace.activeDocument.value?.presentation.composition)
  const pending = ref(false)
  const editing = ref(false)
  const selectedBrand = ref<string>()
  const gradientTarget = ref<'background' | 'header' | 'footer'>('background')
  const disabled = computed(() => props.readOnlyDocument || !props.documentSession || pending.value || store.actionState.status === 'pending')
  const t = (ru: string, en: string) => store.locale === 'ru' ? ru : en
  function cancel(): void {
    compositionPreview.value = undefined
  }
  function commit(value: CompositionSettings): void {
    const doc = workspace.activeDocument.value
    if (!doc || disabled.value) return
    cancel()
    if (JSON.stringify(doc.presentation.composition) === JSON.stringify(value)) return
    props.documentSession!.execute({ type: 'setPresentation', before: doc.presentation,
      after: { ...doc.presentation, composition: value } })
  }
  function preview(value: CompositionSettings): void {
    if (!disabled.value) compositionPreview.value = value
  }
  const library = useCompositionMaterials({ props, workspace, settings, selectedBrand, disabled, commit, t, pending })
  const { materials, error, load, saveMaterial, removeMaterial, applyMaterial, importImage } = library
  function switchSpace(space: 'content' | 'card'): void {
    workspace.canvasViewport.value?.finishTextEditing(() => {
      compositionSpace.value = space
      props.documentSession?.setLayerSpace(space)
      store.clearLayerSelection()
    })
  }
  function activateSpace(space: 'content' | 'card'): void {
    compositionSpace.value = space
    props.documentSession?.setLayerSpace(space)
    store.clearLayerSelection()
  }
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
      compositionSpace.value = layer.space ?? 'content'
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
  onBeforeUnmount(() => {
    cancel()
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
    compositionMaterials: materials,

    compositionPending: pending, compositionError: error, compositionDisabled: disabled,
    toggleComposition: toggle,
    activateCompositionSpace: activateSpace,
    commitComposition: commit,
    previewComposition: preview,

    cancelCompositionPreview: cancel, importCompositionImage: importImage, saveCompositionMaterial: saveMaterial,
    removeCompositionMaterial: removeMaterial,
    applyCompositionMaterial: applyMaterial,
    reloadCompositionMaterials: load,

    compositionGradientEditing: editing,
    compositionSelectedBrand: selectedBrand,
    compositionGradientTarget: gradientTarget }
}
