<script setup lang="ts">
import type { EditorShellEmit } from '../contracts'
import { editorShellRuntimeEmits, editorShellRuntimeProps } from '../contracts'
import EditorWorkspace from './EditorWorkspace.vue'

const props = defineProps(editorShellRuntimeProps)
const emit = defineEmits(editorShellRuntimeEmits) as EditorShellEmit
</script>

<template>
  <EditorWorkspace
    v-bind="props"
    @hosts-ready="emit('hostsReady', $event)"
    @frame-ready="emit('frameReady', $event)"
    @retry-load="emit('retryLoad')"
    @quick-frame-change="emit('quickFrameChange', $event)"
    @quick-selection-complete="emit('quickSelectionComplete', $event)"
  />
</template>
