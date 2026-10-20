<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  TEXT_FONT_FAMILIES,
  isBundledTextFont,
  loadTextFontFamily,
} from '../../text-fonts'
import { fontFamilyCss } from '../../font-family-css'
import { UiIcon } from '../icon'
import { usePreviewPopover } from './use-preview-popover'

const props = defineProps<{
  modelValue: string | null
  previewText?: string | undefined
  locale?: 'en' | 'ru' | undefined
  disabled?: boolean | undefined
  ariaLabel: string
}>()
const emit = defineEmits<{ commit: [family: string]; opened: [] }>()
const shown = ref(false)
const trigger = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const status = ref<Record<string, 'loading' | 'ready' | 'error'>>({})
const position = usePreviewPopover(
  () => shown.value ? trigger.value : undefined,
  () => shown.value ? panel.value : undefined,
)
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const sample = computed(() => {
  const fallback = text('Sample text Aa 123', 'Пример текста Aa 123')
  const value = props.previewText?.replace(/\s+/gu, ' ').trim() || fallback
  return Array.from(value).slice(0, 32).join('')
})
const legacy = computed(() => props.modelValue && !isBundledTextFont(props.modelValue) ? props.modelValue : undefined)

function close(restoreFocus = true): void {
  if (!shown.value) return
  shown.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus({ preventScroll: true }))
}
async function load(family: string): Promise<void> {
  if (status.value[family] === 'ready') return
  status.value[family] = 'loading'
  try {
    await loadTextFontFamily(family)
    status.value[family] = 'ready'
  } catch (error) {
    console.warn('Text font could not be loaded', { family, error })
    status.value[family] = 'error'
  }
}
function open(): void {
  if (props.disabled) return
  if (shown.value) return close()
  emit('opened')
  shown.value = true
  void Promise.all(TEXT_FONT_FAMILIES.map(load)).then(() => {
    if (!shown.value || document.activeElement !== panel.value) return
    const selected = panel.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)')
    selected?.focus({ preventScroll: true })
    selected?.scrollIntoView?.({ block: 'nearest' })
  })
  void nextTick(() => panel.value?.focus({ preventScroll: true }))
}
function choose(family: string): void {
  if (props.disabled || status.value[family] !== 'ready') return
  emit('commit', family)
  close()
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  const options = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])
  const index = options.indexOf(document.activeElement as HTMLButtonElement)
  let next: number
  switch (event.key) {
    case 'Home': next = 0
      break
    case 'End': next = options.length - 1
      break
    case 'ArrowDown': next = Math.min(options.length - 1, index + 1)
      break
    case 'ArrowUp': next = index < 0 ? options.length - 1 : Math.max(0, index - 1)
      break
    default: return
  }
  event.preventDefault()
  options[next]?.focus({ preventScroll: true })
  options[next]?.scrollIntoView?.({ block: 'nearest' })
}
watch(() => props.disabled, (disabled) => {
  if (disabled) close()
})
defineExpose({ close })
</script>

<template>
  <div class="cs-text-font-picker">
    <button
      ref="trigger"
      type="button"
      class="cs-text-font-trigger"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :title="ariaLabel"
      :aria-expanded="shown"
      aria-haspopup="listbox"
      @click="open"
    >
      <span>{{ modelValue ?? '—' }}</span><UiIcon name="chevronDown" />
    </button>
    <NPopover
      :show="shown"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @clickoutside="close(false)"
    >
      <section
        ref="panel"
        class="cs-text-font-popover"
        :aria-label="ariaLabel"
        role="listbox"
        tabindex="0"
        @keydown.stop="keydown"
        @pointerdown.stop
      >
        <p
          v-if="legacy"
          class="cs-text-font-warning"
          role="status"
        >
          {{ text('Current font', 'Текущий шрифт') }}: {{ legacy }}. {{ text('Outside the bundled set; appearance depends on this computer.', 'Вне встроенного набора; отображение зависит от компьютера.') }}
        </p>
        <div
          v-for="family in TEXT_FONT_FAMILIES"
          :key="family"
          class="cs-text-font-row"
        >
          <button
            type="button"
            role="option"
            tabindex="-1"
            :aria-label="family"
            :aria-selected="modelValue === family"
            :disabled="disabled || status[family] !== 'ready'"
            @click="choose(family)"
          >
            <span class="cs-text-font-name">{{ family }}<UiIcon v-if="modelValue === family" name="check" /></span>
            <span
              v-if="status[family] === 'ready'"
              class="cs-text-font-sample"
              :style="{ fontFamily: fontFamilyCss(family) }"
            >{{ sample }}</span>
            <span v-else class="cs-text-font-status">{{ status[family] === 'error' ? text('Font unavailable', 'Шрифт недоступен') : text('Loading…', 'Загрузка…') }}</span>
          </button>
          <button
            v-if="status[family] === 'error'"
            type="button"
            class="cs-text-font-retry"
            :aria-label="text('Retry', 'Повторить') + ': ' + family"
            @click="load(family)"
          >
            {{ text('Retry', 'Повторить') }}
          </button>
        </div>
      </section>
    </NPopover>
  </div>
</template>
