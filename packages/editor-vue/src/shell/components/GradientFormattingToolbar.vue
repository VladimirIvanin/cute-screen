<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  DEFAULT_GRADIENT_FILL,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import { useGradientEditing } from '../ui/gradient-editing'
import { usePreviewPopover } from '../ui/use-preview-popover'
import {
  type LinearFill,
  gradientStrip,
} from '../ui/shape-gradient'
import ShapeGradientEditor from './ShapeGradientEditor.vue'
import ShapeNumericControl from './ShapeNumericControl.vue'
import GradientPlacementControl from './GradientPlacementControl.vue'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'en' | 'ru'; recentColors: readonly SrgbColor[] }>()
const emit = defineEmits<{ change: [id: string, value: string]; action: [id: string] }>()
const editing = useGradientEditing()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const position = usePreviewPopover(() => open.value ? trigger.value : undefined, () => panel.value)
const fill = computed(() => props.schema.shape?.fill?.kind === 'linearGradient' ? props.schema.shape.fill : DEFAULT_GRADIENT_FILL)
const mixedFill = computed(() => props.schema.shape?.fill === null)
const opacity = computed(() => props.schema.controls.find((control) => control.id === 'layerOpacity'))
const actions = computed(() => props.schema.controls.filter((control) => control.kind === 'action'))
const disabled = computed(() => Boolean(props.schema.disabled || opacity.value?.disabled))
function close(focus = false): void {
  open.value = false
  if (focus) trigger.value?.focus({ preventScroll: true })
}
function outside(event: PointerEvent): void {
  if (!panel.value?.contains(event.target as Node) && !trigger.value?.contains(event.target as Node)) close()
}
async function show(): Promise<void> {
  if (open.value) return close(true)
  open.value = true
  await nextTick()
  panel.value?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true })
}
function commit(value: LinearFill): void {
  if (!disabled.value) emit('change', 'fillGradient', JSON.stringify(value))
}
function rotate(): void {
  // Rotate in local pixel space, keeping the center and length of the transition.
  // The canvas editing handles provide free direction adjustment.
  emit('change', 'gradientRotate', '90')
}
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
</script>

<template>
  <div class="cs-gradient-toolbar" @keydown.enter.stop>
    <div
      v-if="actions.length && schema.gradient?.single !== false"
      class="cs-gradient-modes"
      role="group"
      :aria-label="text('Editing mode', 'Режим редактирования')"
    >
      <button
        v-for="mode in ['size', 'transition'] as const"
        :key="mode"
        type="button"
        :disabled="disabled || actions.some((item) => item.mixed)"
        :aria-pressed="editing.mode.value === mode"
        @click="editing.mode.value = mode"
      >
        {{ mode === 'size' ? text('Size', 'Размер') : text('Transition', 'Переход') }}
      </button>
    </div>
    <button
      ref="trigger"
      class="cs-gradient-fill-trigger"
      type="button"
      :disabled="disabled"
      :aria-label="text('Gradient settings', 'Настройки градиента')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="show"
    >
      <span :style="mixedFill ? {} : { background: gradientStrip(fill) }">{{ mixedFill ? '—' : '' }}</span>
    </button>
    <ShapeNumericControl
      v-if="opacity?.kind === 'range'"
      :label="text('Opacity', 'Непрозрачность')"
      class="cs-gradient-opacity"
      compact-label="α"
      :title="text('Opacity', 'Непрозрачность')"
      :value="opacity.value"
      :mixed="opacity.mixed"
      :min="0"
      :max="100"
      :step="1"
      unit="%"
      :disabled="disabled"
      :locale="locale"
      @commit="emit('change', 'layerOpacity', String($event))"
    />
    <GradientPlacementControl
      v-if="actions.length"
      :schema="schema"
      :locale="locale"
      :disabled="disabled"
      @action="emit('action', $event)"
    />
    <NPopover
      :show="open"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
    >
      <section
        v-if="open"
        ref="panel"
        class="cs-shape-popover cs-gradient-popover"
        role="dialog"
        :aria-label="text('Gradient settings', 'Настройки градиента')"
        @pointerdown.stop
        @keydown.esc.stop.prevent="close(true)"
      >
        <p v-if="mixedFill">{{ text('Mixed gradients. Reset to edit together.', 'Разные градиенты. Сбросьте для общей правки.') }}</p>
        <ShapeGradientEditor
          v-else
          :fill="fill"
          :disabled="disabled"
          :locale="locale"
          :recent-colors="recentColors"
          :selected-index="editing.stop.value"
          :geometry="schema.gradient"
          @select="editing.stop.value = $event"
          @commit="commit"
          @dismiss="close(true)"
        />
        <div class="cs-gradient-extra-actions">
          <button
            type="button"
            :disabled="disabled"
            @click="rotate"
          >
            {{ text('Rotate 90°', 'Повернуть на 90°') }}
          </button>
          <button
            type="button"
            :disabled="disabled"
            @click="emit('change', 'gradientReset', 'true')"
          >
            {{ text('Reset gradient', 'Сбросить градиент') }}
          </button>
        </div>
      </section>
    </NPopover>
  </div>
</template>

<style scoped>
.cs-gradient-toolbar,
.cs-gradient-modes,
.cs-gradient-extra-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cs-gradient-toolbar {
  flex-wrap: wrap;
  max-width: min(100%, calc(100vw - 40px));
}
.cs-gradient-modes {
  flex: 0 0 auto;
}
.cs-gradient-toolbar > *,
.cs-gradient-modes > * {
  flex-shrink: 0;
}
.cs-gradient-toolbar button {
  background: var(--surface);
  color: inherit;
  border: 1px solid var(--border);
  border-radius: 6px;
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.cs-gradient-toolbar button[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.cs-gradient-toolbar button:disabled {
  opacity: .45;
  cursor: default;
}
.cs-gradient-toolbar button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.cs-gradient-fill-trigger {
  width: 36px;
  padding: 4px;
  background: repeating-conic-gradient(#999 0% 25%, #eee 0% 50%) 0 0 / 8px 8px !important;
}
.cs-gradient-fill-trigger span {
  display: block;
  width: 26px;
  height: 16px;
}
.cs-gradient-opacity {
  width: auto;
  margin: 0;
  flex-wrap: nowrap;
}
.cs-gradient-opacity :deep(.cs-numeric-label) {
  flex: 0 0 auto;
  font-size: 14px;
}
.cs-gradient-opacity :deep(.cs-numeric-values) {
  flex-wrap: nowrap;
}
.cs-gradient-opacity :deep(.cs-numeric-entry) {
  width: 76px;
}
.cs-gradient-popover {
  width: min(330px, calc(100vw - 32px));
}
.cs-gradient-extra-actions {
  justify-content: space-between;
  margin-top: 10px;
}
</style>
