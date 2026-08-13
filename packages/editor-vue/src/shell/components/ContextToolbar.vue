<script setup lang="ts">
import { NButton } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'
import UiSelect from '../ui/UiSelect.vue'
defineProps<{
  schema?: ContextToolbarSchema | undefined
  label: string
}>()
const emit = defineEmits<{
  action: [id: string]
  change: [id: string, value: string]
}>()
</script>

<template>
  <section v-if="schema" class="cs-context-toolbar" :aria-label="label">
    <span class="cs-context-icon" :class="`cs-context-icon--${schema.icon}`"
      ><UiIcon :name="schema.icon"
    /></span>
    <div class="cs-context-controls">
      <template v-for="control in schema.controls" :key="control.id">
        <NButton
          v-if="control.kind === 'action'"
          size="small"
          tertiary
          class="cs-context-control"
          @click="emit('action', control.id)"
        >
          {{ control.label }}
        </NButton>
        <label v-else-if="control.kind === 'color'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <DeferredColorPicker
            :model-value="control.value"
            v-bind="{ ariaLabel: control.label }"
            @commit="emit('change', control.id, $event)"
          />
        </label>
        <label v-else-if="control.kind === 'range'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <DeferredSlider
            :model-value="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            v-bind="{ ariaLabel: control.label }"
            @commit="emit('change', control.id, String($event))"
          />
        </label>
        <label v-else-if="control.kind === 'select'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <UiSelect
            class="cs-ui-select"
            :model-value="control.value"
            v-bind="{ ariaLabel: control.label }"
            :options="control.options"
            @update:model-value="emit('change', control.id, String($event))"
          />
        </label>
      </template>
    </div>
  </section>
</template>
