<script setup lang="ts">
import { UiIcon } from '../icon'
import type { ToolDescriptor } from '../types'

defineProps<{
  tools: readonly ToolDescriptor[]
  activeToolId?: string | undefined
  t: (key: ToolDescriptor['labelKey'] | 'tools') => string
}>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <aside class="cs-toolrail" :aria-label="t('tools')">
    <template
      v-for="group in ['canvas', 'annotate', 'more'] as const"
      :key="group"
    >
      <div
        v-if="tools.some((tool) => tool.group === group)"
        class="cs-tool-group"
      >
        <button
          v-for="tool in tools.filter((item) => item.group === group)"
          :key="tool.id"
          type="button"
          class="cs-tool-button"
          :class="{ 'is-active': activeToolId === tool.id }"
          :disabled="tool.disabled"
          :aria-pressed="activeToolId === tool.id"
          :aria-label="t(tool.labelKey)"
          :title="
            tool.shortcut
              ? `${t(tool.labelKey)} (${tool.shortcut})`
              : t(tool.labelKey)
          "
          @click="emit('select', tool.id)"
        >
          <UiIcon :name="tool.icon" />
        </button>
      </div>
    </template>
  </aside>
</template>
