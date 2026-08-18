<script setup lang="ts">
import { NButton, NTooltip } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ToolDescriptor } from '../types'

defineProps<{
  tools: readonly ToolDescriptor[]
  activeToolId?: string | undefined
  t: (key: ToolDescriptor['labelKey'] | 'tools') => string
}>()
const emit = defineEmits<{
  select: [id: string]
  configure: [id: string, anchor: HTMLElement]
}>()

const toolGroups = ['canvas', 'annotate', 'more'] as const

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

function onConfigure(
  tool: ToolDescriptor,
  event: MouseEvent | KeyboardEvent,
): void {
  const anchor = event.currentTarget
  if (!(anchor instanceof HTMLElement)) return
  event.preventDefault()
  emit('configure', tool.id, anchor)
}

function onToolKeydown(tool: ToolDescriptor, event: KeyboardEvent): void {
  if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
    onConfigure(tool, event)
  }
}
</script>

<template>
  <aside class="cs-toolrail cs-toolrail--horizontal" :aria-label="t('tools')">
    <template v-for="(group, groupIndex) in toolGroups" :key="group">
      <div
        v-if="groupIndex > 0 && tools.some((tool) => tool.group === group)"
        class="cs-tool-group-separator"
        aria-hidden="true"
      />
      <div
        v-if="tools.some((tool) => tool.group === group)"
        class="cs-tool-group"
      >
        <NTooltip
          v-for="tool in tools.filter((item) => item.group === group)"
          :key="tool.id"
          placement="top"
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
              @contextmenu="onConfigure(tool, $event)"
              @keydown="onToolKeydown(tool, $event)"
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
