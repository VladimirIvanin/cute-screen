<script setup lang="ts">
import { NPopover } from 'naive-ui'
defineProps<{ show: boolean }>()
defineEmits<{ clickoutside: [] }>()
</script>
<template>
  <NPopover
    :show="show"
    trigger="manual"
    placement="top-start"
    :show-arrow="false"
    raw
    @clickoutside="$emit('clickoutside')"
  >
    <template #trigger><slot name="trigger" /></template>
    <slot />
  </NPopover>
</template>
