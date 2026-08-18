<script setup lang="ts">
import { NButton } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'
import UiSelect from '../ui/UiSelect.vue'
import TextFormattingToolbar from './TextFormattingToolbar.vue'
defineProps<{
  schema?: ContextToolbarSchema | undefined
  label: string
  recentColors?: readonly SrgbColor[]
  pickerLocale?: 'en' | 'ru'
}>()
const emit = defineEmits<{
  action: [id: string]
  change: [id: string, value: string]
  eyedropper: [id: string]
}>()
</script>

<template>
  <section
    v-if="schema"
    class="cs-context-toolbar"
    :class="{
      'cs-context-toolbar--text': schema.text,
      'cs-context-toolbar--precision': [
        'crop',
        'privacy',
        'spotlight',
        'ruler',
        'loupe',
      ].includes(schema.icon),
    }"
    :aria-label="label"
    :aria-description="schema.hint"
  >
    <span hidden>{{ schema.hint }}</span>
    <template v-if="schema.text">
      <TextFormattingToolbar
        :text="schema.text"
        :title="schema.title"
        :picker-locale="pickerLocale ?? 'en'"
        variant="bottom"
        @change="(id, value) => emit('change', id, value)"
      />
    </template>
    <span
      v-else
      class="cs-context-icon"
      :class="`cs-context-icon--${schema.icon}`"
      ><UiIcon :name="schema.icon"
    /></span>
    <div class="cs-context-controls">
      <template v-for="control in schema.controls" :key="control.id">
        <NButton
          v-if="control.kind === 'action'"
          size="small"
          tertiary
          class="cs-context-control"
          :disabled="control.disabled ?? false"
          @click="emit('action', control.id)"
        >
          {{ control.label }}
        </NButton>
        <label v-else-if="control.kind === 'color'" class="cs-context-control">
          <span v-if="!control.compact">{{ control.label }}</span>
          <DeferredColorPicker
            :model-value="control.value"
            :recent-colors="recentColors ?? []"
            :disabled="control.disabled ?? false"
            :eyedropper="control.eyedropper ?? true"
            :compact="control.compact ?? false"
            :locale="pickerLocale ?? 'en'"
            v-bind="{ ariaLabel: control.label }"
            @commit="emit('change', control.id, $event)"
            @eyedropper="emit('eyedropper', control.id)"
          />
        </label>
        <label v-else-if="control.kind === 'range'" class="cs-context-control">
          <span>{{ control.label }}</span>
          <DeferredSlider
            :model-value="control.value"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :disabled="control.disabled ?? false"
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
            :disabled="control.disabled ?? false"
            @update:model-value="emit('change', control.id, String($event))"
          />
        </label>
      </template>
    </div>
  </section>
</template>
