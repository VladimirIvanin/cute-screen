<script setup lang="ts">
import { NButton } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'
import UiSelect from '../ui/UiSelect.vue'
import TextFormattingToolbar from './TextFormattingToolbar.vue'
import ArrowFormattingToolbar from './ArrowFormattingToolbar.vue'
import { ref } from 'vue'
const expanded = ref(false)
function controlsFor(schema: ContextToolbarSchema) {
  const order = schema.icon === 'ruler' ? ['rulerColor', 'rulerThickness', 'rulerFontSize', 'rulerUnit'] : []
  const controls = order.length
    ? [...schema.controls].sort((a, b) => {
        const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
        return rank(a.id) - rank(b.id)
      })
    : schema.controls
  return expanded.value ? controls : controls.slice(0, 4)
}
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
  <fieldset
    v-if="schema"
    :disabled="schema.disabled ?? false"
    :title="schema.disabledReason"
    class="cs-context-toolbar"
    :class="{
      'cs-context-toolbar--text': schema.text,
      'cs-context-toolbar--precision': ['crop', 'privacy', 'spotlight', 'ruler', 'loupe'].includes(schema.icon),
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
    ><UiIcon :name="schema.icon"/></span>
    <ArrowFormattingToolbar
      v-if="schema.icon === 'arrow'"
      variant="floating"
      :controls="schema.controls"
      :picker-locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <div v-else class="cs-context-controls">
      <ArrowFormattingToolbar
        v-if="schema.controls.some((control) => control.kind === 'arrowStroke')"
        variant="floating"
        :controls="schema.controls.filter((control) => control.kind === 'arrowStroke')"
        :picker-locale="pickerLocale ?? 'en'"
        @change="(id, value) => emit('change', id, value)"
      />
      <template v-for="control in controlsFor(schema)" :key="control.id">
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
          <span v-if="!control.compact">{{ control.label }}{{ control.mixed ? ' · —' : '' }}</span>
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
          <span>{{ control.label }}{{ control.mixed ? ' · —' : '' }}</span>
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
          <span>{{ control.label }}{{ control.mixed ? ' · —' : '' }}</span>
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
      <NButton
        v-if="schema.controls.length > 4"
        size="small"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{
          pickerLocale === 'ru' ? (expanded ? 'Свернуть' : 'Ещё') : expanded ? 'Less' : 'More'
        }}
      </NButton>
    </div>
  </fieldset>
</template>
