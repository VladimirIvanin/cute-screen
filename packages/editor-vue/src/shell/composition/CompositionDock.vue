<script setup lang="ts">
import CompositionPanel from './CompositionPanel.vue'
import { useEditorShellStore } from '../store'
import type { useComposition } from './controller'
const props = defineProps<{ controller: ReturnType<typeof useComposition>; canImport: boolean; canSave: boolean }>()
const store = useEditorShellStore()
const { compositionOpen, compositionSettings, compositionMaterials,
  compositionPending, compositionError, compositionDisabled, toggleComposition,
  commitComposition, previewComposition, cancelCompositionPreview, importCompositionImage,
  saveCompositionMaterial, removeCompositionMaterial, applyCompositionMaterial, reloadCompositionMaterials,
  compositionGradientEditing, compositionSelectedBrand, compositionGradientTarget } = props.controller
function editGradient(target: 'background' | 'header' | 'footer'): void {
  compositionGradientEditing.value = compositionGradientTarget.value === target
    ? !compositionGradientEditing.value : true
  compositionGradientTarget.value = target
}
</script>
<template>
  <CompositionPanel
    v-show="compositionOpen"
    :value="compositionSettings"
    :locale="store.locale"
    :disabled="compositionDisabled"
    :materials="compositionMaterials"
    :pending="compositionPending"
    :error="compositionError"
    :can-import="canImport"
    :can-save="canSave"
    :editing="compositionGradientEditing"
    :target="compositionGradientTarget"
    :selected-brand="compositionSelectedBrand"
    @change="commitComposition"
    @preview="previewComposition"
    @cancel="cancelCompositionPreview"
    @close="compositionGradientEditing = false; toggleComposition()"
    @layers="store.setLayersOpen(true)"
    @edit="editGradient"
    @import="importCompositionImage"
    @save="saveCompositionMaterial"
    @remove="removeCompositionMaterial"
    @apply="applyCompositionMaterial"
    @retry="reloadCompositionMaterials"
    @select-brand="compositionSelectedBrand = $event"
  />
</template>
