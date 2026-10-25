<script setup lang="ts">
import { ref } from 'vue'
import type { EditorShellEmit } from '../contracts'
import {
  editorShellRuntimeEmits,
  editorShellRuntimeProps,
} from '../contracts'
import EditorWorkspace from './EditorWorkspace.vue'

defineSlots<{ history(props: { locale: 'ru' | 'en' }): unknown }>()
const workspace = ref<InstanceType<typeof EditorWorkspace>>()
defineExpose({
  isAgentBusy: () => workspace.value?.isAgentBusy() ?? false,
  prepareNavigation: () => workspace.value?.prepareNavigation(),
  restoreZoom: (viewport: { zoom: number; mode: string }) => workspace.value?.restoreZoom(viewport),
})
const props = defineProps(editorShellRuntimeProps)
const emit = defineEmits(editorShellRuntimeEmits) as EditorShellEmit
</script>

<template>
  <EditorWorkspace
    ref="workspace"
    v-bind="props"
    @hosts-ready="emit('hostsReady', $event)"
    @frame-ready="emit('frameReady', $event)"
    @retry-load="emit('retryLoad')"
    @quick-frame-change="emit('quickFrameChange', $event)"
    @quick-selection-complete="emit('quickSelectionComplete', $event)"
  >
    <template v-if="$slots.history" #history="scope"><slot name="history" v-bind="scope" /></template>
  </EditorWorkspace>
</template>
