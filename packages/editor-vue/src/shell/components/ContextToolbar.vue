<script setup lang="ts">
import { NButton } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'
import { numericPresentation } from '../ui/numeric-presentation'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import NumericControl from '../ui/NumericControl.vue'
import { numericDefaultsKey } from '../ui/numeric-preview'
import UiSelect from '../ui/UiSelect.vue'
import TextFormattingToolbar from './TextFormattingToolbar.vue'
import CalloutFormattingToolbar from './CalloutFormattingToolbar.vue'
import ArrowFormattingToolbar from './ArrowFormattingToolbar.vue'
import GradientFormattingToolbar from './GradientFormattingToolbar.vue'
import ShapeFormattingToolbar from './ShapeFormattingToolbar.vue'
import LoupeFormattingToolbar from './LoupeFormattingToolbar.vue'
import ImageFormattingToolbar from './ImageFormattingToolbar.vue'
import EmojiFormattingToolbar from './EmojiFormattingToolbar.vue'
import CensorFormattingToolbar from './CensorFormattingToolbar.vue'
import ToolFormattingToolbar from './ToolFormattingToolbar.vue'
import HighlighterFormattingToolbar from './HighlighterFormattingToolbar.vue'
import {
  computed,
  ref,
  provide,
} from 'vue'
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
const props = defineProps<{
  defaultsTool?: string
  schema?: ContextToolbarSchema | undefined
  label: string
  recentColors?: readonly SrgbColor[]
  pickerLocale?: 'en' | 'ru'
}>()
const cropPresetControl = computed(() => props.schema?.controls.find((control) => control.id === 'cropPreset' && control.kind === 'select'))
const cropResetControl = computed(() => props.schema?.controls.find((control) => control.id === 'cropReset'))
const cropActions = computed(() => props.schema?.controls
  .filter((control) => control.id === 'cropCancel' || control.id === 'cropApply')
  .sort((left, right) => Number(left.id === 'cropApply') - Number(right.id === 'cropApply')) ?? [])
provide(numericDefaultsKey, () => props.defaultsTool)
const emit = defineEmits<{
  action: [id: string]
  change: [id: string, value: string]
  eyedropper: [id: string]
}>()
</script>

<template>
  <fieldset
    v-if="schema"
    :disabled="schema.toolSettings ? false : schema.disabled ?? false"
    :title="schema.disabledReason"
    class="cs-context-toolbar"
    :class="{
      'cs-context-toolbar--crop': schema.icon === 'crop',
      'cs-context-toolbar--text': schema.text,
      'cs-context-toolbar--arrow': ['arrow', 'line'].includes(schema.icon),
      'cs-context-toolbar--shape': Boolean(schema.shape),
      'cs-context-toolbar--highlighter': Boolean(schema.highlighter),
      'cs-context-toolbar--precision': ['crop', 'privacy', 'spotlight', 'ruler', 'loupe'].includes(schema.icon),
    }"
    :aria-label="label"
    :aria-description="schema.hint"
  >
    <span hidden>{{ schema.hint }}</span>
    <template v-if="schema.text && !schema.callout">
      <TextFormattingToolbar
        :text="schema.text"
        :disabled="schema.disabled"
        :title="schema.title"
        :picker-locale="pickerLocale ?? 'en'"
        variant="bottom"
        @change="(id, value) => emit('change', id, value)"
      />
    </template>
    <span
      v-else-if="!['emoji', 'arrow', 'line', 'loupe', 'privacy', 'image'].includes(schema.icon) && !schema.shape && !schema.highlighter && !schema.toolSettings"
      class="cs-context-icon"
      :class="`cs-context-icon--${schema.icon}`"
    ><UiIcon :name="schema.icon"/></span>
    <EmojiFormattingToolbar
      v-if="schema.emoji"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      @change="(id, value) => emit('change', id, value)"
    />
    <CalloutFormattingToolbar
      v-else-if="schema.callout"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      @change="(id, value) => emit('change', id, value)"
    />
    <ArrowFormattingToolbar
      v-else-if="['arrow', 'line'].includes(schema.icon)"
      variant="floating"
      :controls="schema.controls"
      :line-alignment="schema.lineAlignment"
      :picker-locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <CensorFormattingToolbar
      v-else-if="schema.icon === 'privacy'"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <ImageFormattingToolbar
      v-else-if="schema.icon === 'image'"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <LoupeFormattingToolbar
      v-else-if="schema.icon === 'loupe'"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <ToolFormattingToolbar
      v-else-if="schema.toolSettings"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @action="emit('action', $event)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <HighlighterFormattingToolbar
      v-else-if="schema.highlighter"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <GradientFormattingToolbar
      v-else-if="schema.icon === 'gradient'"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @action="emit('action', $event)"
    />
    <ShapeFormattingToolbar
      v-else-if="schema.shape"
      :schema="schema"
      :locale="pickerLocale ?? 'en'"
      :recent-colors="recentColors ?? []"
      @change="(id, value) => emit('change', id, value)"
      @action="emit('action', $event)"
      @eyedropper="emit('eyedropper', $event)"
    />
    <div
      v-else-if="schema.icon === 'crop'"
      class="cs-context-controls cs-crop-controls"
      @keydown.enter.stop
    >
      <label v-if="cropPresetControl?.kind === 'select'" class="cs-crop-preset">
        <span>{{ cropPresetControl.label }}</span>
        <UiSelect
          class="cs-ui-select"
          :model-value="cropPresetControl.value"
          v-bind="{ ariaLabel: cropPresetControl.label }"
          :options="cropPresetControl.options"
          :disabled="Boolean(schema.disabled || cropPresetControl.disabled)"
          @update:model-value="emit('change', cropPresetControl.id, String($event))"
        />
      </label>
      <NButton
        v-if="cropResetControl"
        size="small"
        quaternary
        class="cs-crop-button"
        :disabled="Boolean(schema.disabled || cropResetControl.disabled)"
        @click="emit('action', cropResetControl.id)"
      >
        {{ cropResetControl.label }}
      </NButton>
      <span class="cs-crop-separator" aria-hidden="true" />
      <div class="cs-crop-actions">
        <NButton
          v-for="control in cropActions"
          :key="control.id"
          size="small"
          class="cs-crop-button"
          :type="control.id === 'cropApply' ? 'primary' : 'default'"
          :disabled="Boolean(schema.disabled || control.disabled)"
          :aria-keyshortcuts="control.id === 'cropApply' ? 'Enter' : 'Escape'"
          :title="`${control.label} (${control.id === 'cropApply' ? 'Enter' : 'Escape'})`"
          @click="emit('action', control.id)"
        >
          {{ control.label }}
        </NButton>
      </div>
    </div>
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
          <component
            :is="['marker', 'shape'].includes(schema.icon) ? SimpleColorPicker : DeferredColorPicker"
            :palette="schema.icon === 'marker' ? 'highlighter' : 'drawing'"
            :mixed="control.mixed ?? false"
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
        <NumericControl
          v-else-if="control.kind === 'range'"
          class="cs-context-control"
          :label="control.label"
          :value="control.value"
          :min="control.min"
          :max="control.max"
          :step="control.step"
          :mixed="control.mixed"
          :disabled="schema.disabled || control.disabled"
          :control-id="control.id"
          :locale="pickerLocale"
          v-bind="numericPresentation(control)"
          @commit="emit('change', control.id, String($event))"
        />
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
