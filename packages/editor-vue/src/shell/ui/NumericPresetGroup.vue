<script setup lang="ts">
import {
  NButton,
  NButtonGroup,
} from 'naive-ui'

defineProps<{
  values: readonly number[]
  value: number
  label: string
  unit?: string | undefined
  mixed?: boolean | undefined
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{ choose: [value: number] }>()
</script>

<template>
  <NButtonGroup
    class="cs-numeric-presets"
    role="group"
    :aria-label="label"
    size="small"
  >
    <NButton
      v-for="preset in values"
      :key="preset"
      :aria-label="`${preset}${unit ? ` ${unit}` : ''}`"
      :aria-pressed="!mixed && preset === value"
      :type="!mixed && preset === value ? 'primary' : 'default'"
      :disabled="disabled"
      @click="emit('choose', preset)"
    >
      <slot :value="preset">{{ preset }}{{ unit === '×' ? '×' : '' }}</slot>
    </NButton>
  </NButtonGroup>
</template>
