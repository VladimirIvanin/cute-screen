<script setup lang="ts">
import {
  nextTick,
  ref,
  onMounted,
  onBeforeUnmount,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import { usePreviewPopover } from '../ui/use-preview-popover'

defineProps<{ value: 'none' | 'soft' | 'strong' | 'mixed'; locale: 'en' | 'ru'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: 'none' | 'soft' | 'strong'] }>()
const shown = ref(false)
const trigger = ref<HTMLButtonElement>()
const popup = ref<HTMLElement>()
const position = usePreviewPopover(() => trigger.value, () => popup.value)
const options = ['none', 'soft', 'strong'] as const
const names = { en: { none: 'No shadow', soft: 'Soft', strong: 'Strong' }, ru: { none: 'Без тени', soft: 'Мягкая', strong: 'Выраженная' } }
function close(): void {
  shown.value = false
  void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}
function open(): void {
  if (shown.value) return close()
  shown.value = true
  void nextTick(() => popup.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"], button')?.focus({ preventScroll: true }))
}
function choose(value: typeof options[number]): void {
  emit('change', value)
  close()
}
function outside(event: PointerEvent): void {
  if (
    event.target instanceof Node &&
    !trigger.value?.contains(event.target) &&
    !popup.value?.contains(event.target)
  ) shown.value = false
}
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
watch(() => shown.value && popup.value, (element) => {
  if (element) void nextTick(() => element.querySelector<HTMLButtonElement>('[aria-pressed="true"], button')?.focus({ preventScroll: true }))
})
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const buttons = [...popup.value?.querySelectorAll<HTMLButtonElement>('button') ?? []]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[navigationIndex(event.key, current, buttons.length)]?.focus()
  }
}
function navigationIndex(
  key: string,
  current: number,
  count: number,
): number {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return (current + (key === 'ArrowLeft' ? -1 : 1) + count) % count
}
</script>

<template>
  <div class="cs-annotation-shadow">
    <button
      ref="trigger"
      class="cs-annotation-shadow-trigger"
      type="button"
      :disabled="disabled"
      :aria-label="`${locale === 'ru' ? 'Тень' : 'Shadow'}: ${value === 'mixed' ? '—' : names[locale][value]}`"
      :title="locale === 'ru' ? 'Тень' : 'Shadow'"
      :aria-expanded="shown"
      aria-haspopup="dialog"
      @click="open"
    >
      <span
        class="cs-annotation-shadow-sample"
        :data-shadow="value"
        aria-hidden="true"
      />
    </button>
    <NPopover
      :show="shown"
      trigger="manual"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      placement="top-start"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @update:show="shown = $event"
    >
      <section
        ref="popup"
        class="cs-annotation-shadow-popup"
        role="dialog"
        :aria-label="locale === 'ru' ? 'Тень' : 'Shadow'"
        @keydown="keydown"
      >
        <button
          v-for="option in options"
          :key="option"
          type="button"
          :aria-pressed="value === option"
          :disabled="disabled"
          @click="choose(option)"
        >
          <span class="cs-annotation-shadow-preview"><span
            class="cs-annotation-shadow-sample"
            :data-shadow="option"
            aria-hidden="true"
          /></span>
          {{ names[locale][option] }}
        </button>
      </section>
    </NPopover>
  </div>
</template>

<style scoped>
.cs-annotation-shadow { display: flex; flex: 0 0 auto; align-items: center; }
.cs-annotation-shadow-trigger { display: grid; place-items: center; width: 36px; height: 32px; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.cs-annotation-shadow-trigger:hover { background: var(--surface-hover); }
.cs-annotation-shadow-trigger:focus-visible, .cs-annotation-shadow-popup button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cs-annotation-shadow-trigger:disabled, .cs-annotation-shadow-popup button:disabled { opacity: .45; cursor: default; }
.cs-annotation-shadow-sample { display: inline-block; width: 15px; height: 15px; border-radius: 4px; background: currentColor; }
.cs-annotation-shadow-sample[data-shadow="soft"] { box-shadow: 0 3px 4px #0006; }
.cs-annotation-shadow-sample[data-shadow="strong"] { box-shadow: 0 4px 6px #0009; }
.cs-annotation-shadow-sample[data-shadow="none"] { background: transparent; border: 1.5px solid currentColor; box-sizing: border-box; }
.cs-annotation-shadow-sample[data-shadow="mixed"] { opacity: .5; }
.cs-annotation-shadow-popup { display: flex; gap: 4px; padding: 8px; max-width: calc(100vw - 24px); border: 1px solid var(--border); border-radius: 10px; background: var(--surface-raised); box-shadow: var(--shadow-overlay); color: var(--text); }
.cs-annotation-shadow-popup button { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 7px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
.cs-annotation-shadow-popup button[aria-pressed="true"] { border-color: var(--accent); }
.cs-annotation-shadow-preview { display: grid; place-items: center; width: 56px; height: 36px; border-radius: 5px; background: #f8f7f2; color: #f44; }
</style>
