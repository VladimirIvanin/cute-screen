<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextToolbarSchema } from '../types'
import { UiIcon } from '../icon'
import { GRADIENT_PLACEMENTS } from '../tools/gradient-placement'
import { usePreviewPopover } from '../ui/use-preview-popover'

const props = defineProps<{ schema: ContextToolbarSchema; locale: 'en' | 'ru'; disabled: boolean }>()
const emit = defineEmits<{ action: [id: string] }>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const open = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const hint = ref('')
const position = usePreviewPopover(() => open.value ? trigger.value : undefined, () => panel.value)
const controls = computed(() => GRADIENT_PLACEMENTS.flatMap((item) => {
  const control = props.schema.controls.find((control) => control.id === item.id)
  return control?.kind === 'action' ? [{ ...item, control }] : []
}))
const reason = computed(() => controls.value.find((item) => item.control.disabled)?.control.disabledReason
  ?? (props.schema.gradient?.single === false ? text('Select one backdrop', 'Выберите одну подложку') : ''))
function close(focus = false): void {
  open.value = false
  if (focus) trigger.value?.focus({ preventScroll: true })
}
async function toggle(): Promise<void> {
  if (open.value) return close(true)
  open.value = true
  await nextTick()
  const target = panel.value?.querySelector<HTMLElement>('button:not(:disabled)') ?? panel.value
  target?.focus({ preventScroll: true })
}
function outside(event: PointerEvent): void {
  if (!panel.value?.contains(event.target as Node) && !trigger.value?.contains(event.target as Node)) close()
}
function keydown(event: KeyboardEvent): void {
  const directions: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }
  const delta = directions[event.key]
  if (!delta) return
  const buttons = [...panel.value!.querySelectorAll<HTMLButtonElement>('button')]
  const index = buttons.indexOf(event.target as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  const next = buttons[(index + delta + buttons.length) % buttons.length]
  if (!next?.disabled) next?.focus()
}
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
</script>

<template>
  <button
    ref="trigger"
    class="cs-gradient-placement-trigger"
    type="button"
    :disabled="disabled"
    :aria-label="text('Placement', 'Расположение')"
    :aria-expanded="open"
    aria-haspopup="dialog"
    @click="toggle"
  >
    <UiIcon name="placement" />
    <span>{{ text('Placement', 'Расположение') }}</span>
  </button>
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
      class="cs-gradient-placement cs-shape-popover"
      role="dialog"
      tabindex="-1"
      :aria-label="text('Placement', 'Расположение')"
      @pointerdown.stop
      @keydown.esc.stop.prevent="close(true)"
      @keydown="keydown"
    >
      <header>{{ text('Align to frame', 'Выровнять по кадру') }}</header>
      <div
        class="cs-gradient-placement-grid"
        role="group"
        :aria-label="text('Align and stretch', 'Выравнивание и растягивание')"
      >
        <button
          v-for="item in controls"
          :key="item.id"
          type="button"
          :data-gradient-placement="item.id"
          :disabled="disabled || item.control.disabled"
          :aria-label="item.control.label"
          :title="item.control.disabledReason ?? item.control.label"
          :aria-pressed="schema.gradient?.activeActions?.includes(item.id) ?? false"
          @mouseenter="hint = item.control.label"
          @focus="hint = item.control.label"
          @click="emit('action', item.id)"
        >
          <UiIcon :name="item.icon" />
          <span>{{ locale === 'ru' ? item.ru : item.en }}</span>
        </button>
      </div>
      <p aria-live="polite">{{ reason || hint || text('Position and size within the current frame', 'Положение и размер в текущем кадре') }}</p>
    </section>
  </NPopover>
</template>

<style scoped>
.cs-gradient-placement-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.cs-gradient-placement-trigger:disabled {
  opacity: .45;
  cursor: default;
}
.cs-gradient-placement-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.cs-gradient-placement {
  box-sizing: border-box;
  width: 288px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  color: var(--text);
  font-size: 12px;
}
.cs-gradient-placement header {
  margin-bottom: 10px;
  font-weight: 600;
}
.cs-gradient-placement-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.cs-gradient-placement-grid button {
  display: flex;
  min-width: 0;
  min-height: 56px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.cs-gradient-placement-grid button:nth-child(4n) {
  border-style: dashed;
}
.cs-gradient-placement-grid button:hover:not(:disabled) {
  background: var(--surface-hover);
}
.cs-gradient-placement-grid button[aria-pressed="true"] {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cs-gradient-placement-grid button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.cs-gradient-placement-grid button:disabled {
  opacity: .45;
  cursor: default;
}
.cs-gradient-placement p {
  min-height: 30px;
  margin: 10px 0 0;
  color: var(--text-muted);
  line-height: 1.3;
}
</style>
