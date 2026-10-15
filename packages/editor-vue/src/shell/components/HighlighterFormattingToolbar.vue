<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import ShapeNumericControl from './ShapeNumericControl.vue'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'en' | 'ru'; recentColors: readonly SrgbColor[] }>()
const emit = defineEmits<{ change: [id: string, value: string]; eyedropper: [id: string] }>()
type Menu = 'width' | 'layerOpacity' | 'markerMode'
const open = ref<Menu>()
const panel = ref<HTMLElement>()
const colorPicker = ref<InstanceType<typeof SimpleColorPicker>>()
const triggers = new Map<Menu, HTMLButtonElement>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const mixed = (id: string) => Boolean(control(id)?.mixed)
const value = (id: string) => {
  const item = control(id)
  return item && 'value' in item ? String(item.value) : ''
}
const disabled = computed(() => Boolean(props.schema.disabled || control('color')?.disabled))
const modes = computed(() => [
  { id: 'auto', name: text('Auto', 'Авто'), hint: text('Choose for this screenshot', 'Подобрать по всему скриншоту'), sample: 'auto' },
  { id: 'highlight', name: text('Highlight', 'Выделить'), hint: text('Dark text on a light background', 'Тёмный текст на светлом фоне'), sample: 'multiply' },
  { id: 'illuminate', name: text('Illuminate', 'Подсветить'), hint: text('Light text on a dark background', 'Светлый текст на тёмном фоне'), sample: 'screen' },
  { id: 'veil', name: text('Tint', 'Окрасить'), hint: text('Apply translucent colour over the image and text', 'Нанести полупрозрачный цвет поверх изображения и текста'), sample: 'normal' },
])
const summary = computed(() => {
  if (mixed('markerMode')) return '—'
  const mode = value('markerMode')
  if (mode !== 'auto') return modes.value.find((item) => item.id === mode)?.name ?? text('Saved effect', 'Сохранённый эффект')
  const analysis = props.schema.highlighter
  const suffix = analysis?.status === 'loading' ? text('analysing', 'определяем фон')
    : modes.value.find((item) => item.id === (analysis?.effect ?? 'highlight'))?.name
  return `${text('Auto', 'Авто')} · ${suffix}`
})
const labels = computed(() => ({ width: text('Width', 'Толщина'), layerOpacity: text('Intensity', 'Интенсивность'), markerMode: text('Effect', 'Режим') }))
function show(
  menu: Menu,
  shown: boolean,
): void {
  if (!shown && open.value !== menu) return
  if (shown) colorPicker.value?.close()
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) panel.value?.querySelector<HTMLElement>('[aria-pressed="true"], input, button:not(:disabled)')?.focus({ preventScroll: true })
    else triggers.get(menu)?.focus({ preventScroll: true })
  })
}
function change(
  id: string,
  next: string,
): void {
  if (!disabled.value) emit('change', id, next)
}
function chooseMode(next: string): void {
  change('markerMode', next)
  show('markerMode', false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
watch(disabled, (blocked) => {
  if (blocked) open.value = undefined
})
</script>

<template>
  <div class="cs-highlighter-toolbar">
    <SimpleColorPicker
      ref="colorPicker"
      :model-value="value('color')"
      v-bind="{ ariaLabel: text('Colour', 'Цвет') }"
      :mixed="mixed('color')"
      :disabled="disabled"
      :locale="locale"
      :recent-colors="recentColors"
      :eyedropper="control('color')?.kind === 'color' && Boolean((control('color') as { eyedropper?: boolean }).eyedropper)"
      palette="highlighter"
      @opened="open = undefined"
      @commit="change('color', $event)"
      @eyedropper="emit('eyedropper', 'color')"
    />
    <NPopover
      v-for="menu in ['width', 'layerOpacity', 'markerMode'] as const"
      :key="menu"
      :show="open === menu"
      trigger="click"
      placement="top"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @update:show="show(menu, $event)"
    >
      <template #trigger>
        <button
          :ref="(element) => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
          class="cs-highlighter-trigger"
          type="button"
          :disabled="disabled"
          :aria-label="labels[menu]"
          :title="labels[menu]"
          :aria-expanded="open === menu"
          aria-haspopup="dialog"
        >
          <svg
            v-if="menu === 'width'"
            viewBox="0 0 24 24"
            aria-hidden="true"
          ><path
            d="M5 17L19 7"
            stroke="currentColor"
            :stroke-width="Math.min(9, Math.max(2, Number(value(menu)) / 5))"
            stroke-linecap="round"
          /></svg>
          <span v-else>{{ menu === 'markerMode' ? summary : mixed(menu) ? '—' : `${Math.round(Number(value(menu)))}%` }}</span>
          <UiIcon name="chevronDown"/>
        </button>
      </template>
      <div
        :ref="(element) => { if (open === menu) panel = element as HTMLElement }"
        class="cs-highlighter-popover"
        role="dialog"
        :aria-label="labels[menu]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <template v-if="menu === 'markerMode'">
          <button
            v-for="mode in modes"
            :key="mode.id"
            type="button"
            class="cs-highlighter-mode"
            :disabled="disabled"
            :aria-label="mode.name"
            :aria-pressed="!mixed(menu) && value(menu) === mode.id"
            @click="chooseMode(mode.id)"
          >
            <span class="cs-highlighter-sample" :class="`is-${mode.id}`"><span :style="{ backgroundColor: value('color'), mixBlendMode: mode.sample === 'auto' ? 'multiply' : mode.sample as 'multiply' | 'screen' | 'normal', opacity: Number(value('layerOpacity')) / 100 }"/><b>Aa</b></span>
            <span><strong>{{ mode.name }}</strong><small>{{ mode.hint }}</small></span>
            <UiIcon v-if="!mixed(menu) && value(menu) === mode.id" name="check"/>
          </button>
          <p v-if="schema.highlighter?.status === 'unavailable'" class="cs-highlighter-hint">{{ text('Automatic analysis unavailable. Using Highlight; choose any effect manually.', 'Автоподбор недоступен. Используем «Выделить»; режим можно выбрать вручную.') }}</p>
        </template>
        <template v-else>
          <ShapeNumericControl
            :label="labels[menu]"
            :value="Number(value(menu))"
            :mixed="mixed(menu)"
            :min="menu === 'width' ? 1 : 0"
            :max="menu === 'width' ? 96 : 100"
            :step="1"
            :disabled="disabled"
            @commit="change(menu, String($event))"
          />
          <div class="cs-highlighter-presets">
            <button
              v-for="preset in menu === 'width' ? [8, 18, 32, 48] : [20, 35, 50, 75]"
              :key="preset"
              type="button"
              :disabled="disabled"
              :aria-pressed="!mixed(menu) && Number(value(menu)) === preset"
              @click="change(menu, String(preset))"
            >
              {{ preset }}{{ menu === 'width' ? ' px' : '%' }}
            </button>
          </div>
        </template>
      </div>
    </NPopover>
  </div>
</template>
