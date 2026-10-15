<script setup lang="ts">
withDefaults(defineProps<{
  orientation?: 'vertical' | 'horizontal'
  length?: number
}>(), {
  orientation: 'vertical',
  length: 20,
})
</script>

<template>
  <span
    class="cs-ui-separator"
    aria-hidden="true"
    :style="{
      width: orientation === 'vertical' ? '1px' : `${length}px`,
      height: orientation === 'vertical' ? `${length}px` : '1px',
    }"
  />
</template>

<style scoped>
.cs-ui-separator {
  display: block;
  flex: none;
  align-self: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--border);
  pointer-events: none;
}
</style>
