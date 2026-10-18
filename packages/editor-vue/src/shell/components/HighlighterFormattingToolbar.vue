<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  useId,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import HighlighterSample from '../ui/HighlighterSample.vue'
import UiSeparator from '../ui/UiSeparator.vue'
import ShapeNumericControl from './ShapeNumericControl.vue'
import { focusPopoverControl } from '../ui/focus-popover-control'

import { useTransientSurface } from '../ui/transient-surface'
const surfaceOwner = useTransientSurface()

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
const descriptionId = `cs-highlighter-effect-${useId()}`
const sampleMixed = computed(() => mixed('color') || mixed('layerOpacity'))
const legacy = computed(() => !['auto', 'highlight', 'illuminate', 'veil'].includes(value('markerMode')))
const analysing = computed(() => value('markerMode') === 'auto' && props.schema.highlighter?.status === 'loading')
const effect = computed(() => {
  const mode = value('markerMode')
  return mode === 'illuminate' || mode === 'veil' || mode === 'highlight'
    ? mode : props.schema.highlighter?.effect ?? 'highlight'
})
const modes = computed(() => [
  { id: 'auto', name: text('Auto', 'Авто'), hint: text('Choose for this screenshot', 'Подобрать по всему скриншоту') },
  { id: 'highlight', name: text('Highlight', 'Выделить'), hint: text('Dark text on a light background', 'Тёмный текст на светлом фоне') },
  { id: 'illuminate', name: text('Illuminate', 'Подсветить'), hint: text('Light text on a dark background', 'Светлый текст на тёмном фоне') },
  { id: 'veil', name: text('Tint', 'Окрасить'), hint: text('Apply translucent colour over the image and text', 'Нанести полупрозрачный цвет поверх изображения и текста') },
] as const)
const summary = computed(() => {
  if (mixed('markerMode')) return '—'
  const mode = value('markerMode')
  const name = { highlight: text('Darker', 'Темнее'), illuminate: text('Lighter', 'Светлее'), veil: text('Tint', 'Окрасить') }[effect.value]
  if (mode !== 'auto') return modes.value.some((item) => item.id === mode) ? name : text('Saved effect', 'Сохранённый эффект')
  return `${text('Auto', 'Авто')} · ${analysing.value ? text('analysing', 'определяем фон') : name}`
})
const unavailableHint = computed(() => text(
  'Automatic analysis unavailable. Using Highlight; choose any effect manually.',
  'Автоподбор недоступен. Используем «Выделить»; режим можно выбрать вручную.',
))
const description = computed(() => {
  if (mixed('markerMode')) return text('Multiple effects selected', 'Выбраны разные режимы наложения')
  if (legacy.value) return text('Saved effect. Choose a mode to change it.', 'Сохранённый эффект. Выберите режим, чтобы изменить его.')
  if (analysing.value) return text('Auto: analysing the screenshot background', 'Авто: определяем фон скриншота')
  const hint = {
    highlight: text('Darkens a light background, preserving dark text.', 'Затемняет светлый фон, сохраняя тёмный текст.'),
    illuminate: text('Lightens a dark background, preserving light text.', 'Осветляет тёмный фон, сохраняя светлый текст.'),
    veil: text('Apply translucent colour over the image and text.', 'Нанести полупрозрачный цвет поверх изображения и текста.'),
  }[effect.value]
  const fallback = value('markerMode') === 'auto' && props.schema.highlighter?.status === 'unavailable'
    ? ` ${unavailableHint.value}` : ''
  const mixedHint = sampleMixed.value ? text(' Colour or intensity varies across the selection.', ' Цвет или интенсивность различаются у выбранных объектов.') : ''
  return `${summary.value}. ${hint}${fallback}${mixedHint}`
})
const labels = computed(() => ({ width: text('Width', 'Толщина'), layerOpacity: text('Intensity', 'Интенсивность'), markerMode: text('Effect', 'Режим') }))
function show(
  menu: Menu,
  shown: boolean,
  restoreFocus = true,
): void {
  if (!shown && open.value !== menu) return
  if (shown) colorPicker.value?.close()
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown) focusPopoverControl(panel.value)
    else if (restoreFocus) triggers.get(menu)?.focus({ preventScroll: true })
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
    <template v-for="menu in ['width', 'layerOpacity', 'markerMode'] as const" :key="menu">
      <UiSeparator v-if="menu !== 'width'" :length="21" />
      <NPopover
        :show="open === menu"
        trigger="click"
        placement="top"
        :show-arrow="false"
        raw
        to=".cs-overlay-root"
        @update:show="show(menu, $event, false)"
      >
        <template #trigger>
          <button
            :ref="(element) => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
            class="cs-highlighter-trigger"
            type="button"
            :disabled="disabled"
            :aria-label="labels[menu]"
            :title="menu === 'markerMode' ? description : labels[menu]"
            :aria-describedby="menu === 'markerMode' ? descriptionId : undefined"
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
            <template v-else-if="menu === 'markerMode'">
              <HighlighterSample
                :effect="effect"
                :color="value('color')"
                :intensity="Number(value('layerOpacity'))"
                :neutral="mixed('markerMode') || sampleMixed || analysing || legacy"
                compact
              />
              <span>{{ summary }}</span>
            </template>
            <span v-else>{{ mixed(menu) ? '—' : `${Math.round(Number(value(menu)))}%` }}</span>
            <UiIcon name="chevronDown"/>
          </button>
        </template>
        <div
          :ref="(element) => { if (open === menu) panel = element as HTMLElement }"
          class="cs-highlighter-popover"
          :data-cs-surface="surfaceOwner"
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
              <HighlighterSample
                :effect="mode.id === 'auto' ? schema.highlighter?.effect ?? 'highlight' : mode.id"
                :color="value('color')"
                :intensity="Number(value('layerOpacity'))"
                :neutral="sampleMixed || (mode.id === 'auto' && schema.highlighter?.status === 'loading')"
              />
              <span><strong>{{ mode.name }}</strong><small>{{ mode.hint }}</small></span>
              <UiIcon v-if="!mixed(menu) && value(menu) === mode.id" name="check"/>
            </button>
            <p v-if="schema.highlighter?.status === 'unavailable'" class="cs-highlighter-hint">{{ unavailableHint }}</p>
          </template>
          <template v-else>
            <ShapeNumericControl
              :control-id="menu"
              :locale="locale"
              slider
              :unit="menu === 'width' ? 'px' : '%'"
              :presets="menu === 'width' ? [8, 18, 32, 48] : [20, 35, 50, 75]"
              :label="labels[menu]"
              :value="Number(value(menu))"
              :mixed="mixed(menu)"
              :min="menu === 'width' ? 1 : 0"
              :max="menu === 'width' ? 96 : 100"
              :step="1"
              :disabled="disabled"
              @commit="change(menu, String($event))"
            />
          </template>
        </div>
      </NPopover>
    </template>
    <span :id="descriptionId" hidden>{{ description }}</span>
  </div>
</template>
