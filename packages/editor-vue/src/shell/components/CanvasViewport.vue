<script lang="ts">
export type {
  CanvasViewportEmits,
  CanvasViewportExpose,
  CanvasViewportProps,
  TextFormattingPatch,
  TextToolbarSnapshot,
  TextToolDefaults,
} from '../canvas/contracts'
</script>

<script setup lang="ts">
import { ref } from 'vue'
import type { CropPreset } from '@cute-screen/editor-renderer'
import type {
  CanvasViewportEmit,
  CanvasViewportEmits,
  CanvasViewportExpose,
} from '../canvas/contracts'
import {
  canvasViewportRuntimeEmits,
  canvasViewportRuntimeProps,
} from '../canvas/contracts'
import CanvasWorkspace from './CanvasWorkspace.vue'

const props = defineProps(canvasViewportRuntimeProps)
const emit = defineEmits(canvasViewportRuntimeEmits) as CanvasViewportEmit
const workspace = ref<CanvasViewportExpose>()
const forwardSelectLayer = (...args: CanvasViewportEmits['selectLayer']) =>
  emit('selectLayer', ...args)
const forwardMoveLayer = (...args: CanvasViewportEmits['moveLayer']) =>
  emit('moveLayer', ...args)
const forwardTransformLayer = (
  ...args: CanvasViewportEmits['transformLayer']
) => emit('transformLayer', ...args)
const forwardUpdateLayerPayload = (
  ...args: CanvasViewportEmits['updateLayerPayload']
) => emit('updateLayerPayload', ...args)
const forwardAddLayer = (...args: CanvasViewportEmits['addLayer']) =>
  emit('addLayer', ...args)
const forwardTextToolbarChange = (
  ...args: CanvasViewportEmits['textToolbarChange']
) => emit('textToolbarChange', ...args)
const forwardArrowToolbarChange = (
  ...args: CanvasViewportEmits['arrowToolbarChange']
) => emit('arrowToolbarChange', ...args)

const exposed: CanvasViewportExpose = {
  applyCropDraft: () => workspace.value?.applyCropDraft(),
  cancelCropDraft: () => workspace.value?.cancelCropDraft(),
  resetCropDraft: () => workspace.value?.resetCropDraft(),
  setCropPresetValue: (preset: CropPreset) =>
    workspace.value?.setCropPresetValue(preset),
  refitCanvas: () => workspace.value?.refitCanvas(),
}
defineExpose(exposed)
</script>

<template>
  <CanvasWorkspace
    ref="workspace"
    v-bind="props"
    @hosts-ready="emit('hostsReady', $event)"
    @frame-ready="emit('frameReady', $event)"
    @select-layer="forwardSelectLayer"
    @move-layer="forwardMoveLayer"
    @transform-layer="forwardTransformLayer"
    @update-layer-payload="forwardUpdateLayerPayload"
    @add-layer="forwardAddLayer"
    @document-command="emit('documentCommand', $event)"
    @text-editing="emit('textEditing', $event)"
    @text-editing-cancelled="emit('textEditingCancelled', $event)"
    @text-toolbar-change="forwardTextToolbarChange"
    @arrow-toolbar-change="forwardArrowToolbarChange"
    @request-image-import="emit('requestImageImport', $event)"
    @open-image="emit('openImage')"
    @select-tool="emit('selectTool', $event)"
    @zoom="emit('zoom', $event)"
    @fit-zoom="emit('fitZoom', $event)"
    @retry="emit('retry')"
    @color-sample="emit('colorSample', $event)"
    @color-sample-error="emit('colorSampleError', $event)"
    @color-sample-cancel="emit('colorSampleCancel')"
    @tool-error="emit('toolError', $event)"
    @quick-frame-change="emit('quickFrameChange', $event)"
    @quick-selection-complete="emit('quickSelectionComplete', $event)"
  />
</template>
