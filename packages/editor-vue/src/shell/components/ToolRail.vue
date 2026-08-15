<script setup lang="ts">
import { NButton, NTooltip } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ToolDescriptor } from '../types'

defineProps<{
  tools: readonly ToolDescriptor[]
  activeToolId?: string | undefined
  t: (key: ToolDescriptor['labelKey'] | 'tools') => string
}>()
const emit = defineEmits<{ select: [id: string] }>()

function toolTitle(
  tool: ToolDescriptor,
  translate: (key: ToolDescriptor['labelKey'] | 'tools') => string,
): string {
  if (tool.disabled && tool.disabledReasonKey) {
    return translate(tool.disabledReasonKey)
  }
  return tool.shortcut
    ? `${translate(tool.labelKey)} (${tool.shortcut})`
    : translate(tool.labelKey)
}
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
        <NTooltip
          v-for="tool in tools.filter((item) => item.group === group)"
          :key="tool.id"
          placement="right"
          :delay="400"
        >
          <template #trigger>
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :class="{ 'is-active': activeToolId === tool.id }"
              :disabled="Boolean(tool.disabled)"
              :aria-pressed="activeToolId === tool.id"
              :aria-label="t(tool.labelKey)"
              :title="toolTitle(tool, t)"
              @click="emit('select', tool.id)"
            >
              <UiIcon :name="tool.icon" />
            </NButton>
          </template>
          {{ toolTitle(tool, t) }}
        </NTooltip>
      </div>
    </template>
  </aside>
</template>
