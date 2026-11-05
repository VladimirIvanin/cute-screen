<script setup lang="ts">
import CompositionPanel from './CompositionPanel.vue'
import { useEditorShellStore } from '../store'
import type { useComposition } from './controller'
const props = defineProps<{ controller: ReturnType<typeof useComposition>; canImport: boolean; canSave: boolean }>()
const store = useEditorShellStore()
const { compositionOpen, compositionSettings, compositionMaterials, compositionApplied, removeComposition,
  compositionPending, compositionLoading, compositionError, compositionDisabled, compositionCopying, toggleComposition,
  commitComposition, previewComposition, cancelCompositionPreview, importCompositionImage,
  saveCompositionMaterial, removeCompositionMaterial, applyCompositionMaterial, reloadCompositionMaterials,
  compositionGradientEditing, compositionSelectedBrand } = props.controller
function editGradient(): void {
  compositionGradientEditing.value = !compositionGradientEditing.value
}
</script>
<template>
  <CompositionPanel
    v-show="compositionOpen"
    :active="compositionOpen"
    :value="compositionSettings"
    :applied="compositionApplied"
    :locale="store.locale"
    :disabled="compositionDisabled"
    :inert="compositionCopying ? '' : undefined"
    :aria-busy="compositionCopying"
    :materials="compositionMaterials"
    :pending="compositionPending"
    :loading="compositionLoading"
    :error="compositionError"
    :can-import="canImport"
    :can-save="canSave"
    :editing="compositionGradientEditing"
    :selected-brand="compositionSelectedBrand"
    @change="commitComposition"
    @reset="removeComposition"
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
