<script setup lang="ts">
import {
  nextTick,
  computed,
  watch,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  type CSSProperties,
} from 'vue'
import { UiIcon } from '../icon'
import NumericControl from '../ui/NumericControl.vue'
import { textFormattingLabel } from '../ui/text-formatting-labels'
import { usePreviewPopover } from '../ui/use-preview-popover'
import type { PreviewPlacement } from '../ui/preview-placement'
import {
  numericDefaultsKey,
  numericPreviewKey,
} from '../ui/numeric-preview'
import type { ContextToolbarSchema } from '../types'

const props = defineProps<{
  text: NonNullable<ContextToolbarSchema['text']>
  title: string
  pickerLocale?: 'en' | 'ru'
  variant?: 'bottom' | 'floating'
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
}>()

const numericPreview = inject(numericPreviewKey, undefined)
const blocked = computed(() => Boolean(props.disabled || numericPreview?.isBlocked?.()))
const numericDefaultsTool = inject(numericDefaultsKey, () => undefined)
const backgroundOwner = Symbol('text-background')
const backgroundInvalid = ref({ padding: false, radius: false })
const textBackgroundOpen = ref(false)
const textBackgroundTrigger = ref<HTMLButtonElement>()
const textBackgroundRoot = ref<HTMLElement>()
const textBackgroundDraft = ref({ color: '#fff2a8', padding: 0, radius: 0 })
const textSizeOpen = ref(false)
const textSizeTrigger = ref<HTMLButtonElement>()
const textSizeRoot = ref<HTMLElement>()
const textSizeDraft = ref('24')
const textOverflowOpen = ref(false)
const textOverflowTrigger = ref<HTMLButtonElement>()
const textOverflowRoot = ref<HTMLElement>()
const textBackgroundReturnTrigger = ref<HTMLButtonElement>()

const unregisterBackground = numericPreview?.register(backgroundOwner, () => {
  if (textBackgroundOpen.value) closeTextBackground()
})

const sizePosition = usePreviewPopover(
  () => textSizeOpen.value ? textSizeTrigger.value : undefined,
  () => textSizeRoot.value,
)
const backgroundPosition = usePreviewPopover(
  () => textBackgroundOpen.value ? textBackgroundReturnTrigger.value : undefined,
  () => textBackgroundRoot.value,
)
function numericPopoverStyle(position: PreviewPlacement | undefined): CSSProperties {
  return {
    position: 'fixed',
    left: `${position?.left ?? 0}px`,
    top: `${position?.top ?? 0}px`,
    bottom: 'auto',
    transform: 'none',
    visibility: position ? 'visible' : 'hidden',
  }
}

const textLabel = (key: Parameters<typeof textFormattingLabel>[1]) => textFormattingLabel(props.pickerLocale, key)

function textValue<T>(
  value: T | null,
  fallback: T,
): T {
  return value ?? fallback
}

function textMixed(value: unknown): boolean {
  return value === null
}

function textToggle(
  id: string,
  value: boolean | null,
): void {
  emit('change', id, String(!textValue(value, false)))
}

function openTextSize(): void {
  if (blocked.value) return
  textSizeDraft.value = String(props.text.fontSize ?? 24)
  textSizeOpen.value = true
}

function closeTextSize(): void {
  textSizeOpen.value = false
  void nextTick(() => textSizeTrigger.value?.focus({ preventScroll: true }))
}

function applyTextSize(value = Number(textSizeDraft.value)): void {
  if (blocked.value) return
  if (
    !Number.isInteger(value) ||
    value < 8 ||
    value > 256
  ) return
  emit('change', 'textFontSize', String(value))
  textSizeDraft.value = String(value)
}

function validTextBackground(value: typeof textBackgroundDraft.value): boolean {
  return (
    Number.isFinite(value.padding) &&
    Number.isInteger(value.padding) &&
    value.padding >= 0 &&
    value.padding <= 256 &&
    Number.isFinite(value.radius) &&
    Number.isInteger(value.radius) &&
    value.radius >= 0 &&
    value.radius <= 256
  )
}

function chooseOverflowList(): void {
  emit('change', 'textList', props.text.listKind === 'bullet' ? 'none' : 'bullet')
  closeTextOverflow()
}

function chooseOverflowAlign(event: Event): void {
  emit('change', 'textAlign', (event.target as HTMLSelectElement).value)
  closeTextOverflow()
}

function openOverflowBackground(): void {
  textOverflowOpen.value = false
  openTextBackground(textOverflowTrigger.value)
}

function openTextBackground(returnTrigger = textBackgroundTrigger.value): void {
  if (blocked.value) return
  textBackgroundReturnTrigger.value = returnTrigger
  const current = props.text.background
  textBackgroundDraft.value = current ? { ...current } : { color: '#fff2a8', padding: 0, radius: 0 }
  backgroundInvalid.value = { padding: false, radius: false }
  textBackgroundOpen.value = true
}

function openDirectTextBackground(): void {
  openTextBackground(textBackgroundTrigger.value)
}

function closeTextBackground(): void {
  numericPreview?.cancel(backgroundOwner)
  textBackgroundOpen.value = false
  const returnTrigger = textBackgroundReturnTrigger.value
  textBackgroundReturnTrigger.value = undefined
  void nextTick(() => returnTrigger?.focus({ preventScroll: true }))
}

function closeTextOverflow(): void {
  textOverflowOpen.value = false
  void nextTick(() => textOverflowTrigger.value?.focus({ preventScroll: true }))
}

function closeOpenTextPopover(event: KeyboardEvent): void {
  if (textBackgroundOpen.value) closeTextBackground()
  else if (textSizeOpen.value) closeTextSize()
  else if (textOverflowOpen.value) closeTextOverflow()
  else return
  event.preventDefault()
  event.stopPropagation()
}

function commitTextBackground(value: typeof textBackgroundDraft.value | null): void {
  if (blocked.value) return
  if (value && !validTextBackground(value)) return
  numericPreview?.cancel(backgroundOwner)
  emit('change', 'textBackground', JSON.stringify(value))
  closeTextBackground()
}

function previewTextBackground(
  key: 'padding' | 'radius',
  value: number,
): void {
  textBackgroundDraft.value = { ...textBackgroundDraft.value, [key]: value }
  if (validTextBackground(textBackgroundDraft.value)) numericPreview?.preview(backgroundOwner, {
    id: 'textBackground', defaultsTool: numericDefaultsTool(),
  }, JSON.stringify(textBackgroundDraft.value))
}

function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    textBackgroundOpen.value &&
    !textBackgroundTrigger.value?.contains(target) &&
    !textBackgroundRoot.value?.contains(target)
  ) {
    closeTextBackground()
  }
  if (
    textSizeOpen.value &&
    !textSizeTrigger.value?.contains(target) &&
    !textSizeRoot.value?.contains(target)
  ) {
    closeTextSize()
  }
  if (
    textOverflowOpen.value &&
    !textOverflowTrigger.value?.contains(target) &&
    !textOverflowRoot.value?.contains(target)
  ) {
    closeTextOverflow()
  }
}

watch(blocked, (disabled) => {
  if (disabled) {
    closeTextSize()
    closeTextBackground()
    closeTextOverflow()
  }
})
onMounted(() => document.addEventListener('pointerdown', closeOnOutsidePointer, true))
onBeforeUnmount(() => {
  unregisterBackground?.()
  numericPreview?.cancel(backgroundOwner)
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
})
</script>

<template>
  <div
    class="cs-text-toolbar"
    :class="{ 'cs-text-floating-toolbar': variant === 'floating' }"
    role="group"
    :aria-label="title"
    @keydown.escape="closeOpenTextPopover"
  >
    <label class="cs-text-toolbar-color" data-text-control="color">
      <span class="sr-only">{{ textLabel('color') }}</span>
      <input
        type="color"
        :value="text.color ?? '#000000'"
        :aria-label="`${textLabel('color')}${textMixed(text.color) ? `: ${textLabel('mixed')}` : ''}`"
        @change="emit('change', 'textColor', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <select
      data-text-control="font"
      :value="text.fontFamily ?? ''"
      :aria-label="`${textLabel('font')}${textMixed(text.fontFamily) ? `: ${textLabel('mixed')}` : ''}`"
      @change="emit('change', 'textFont', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>
        {{ textLabel('mixed') }}
      </option>
      <option v-if="text.fontFamily && !text.fonts.includes(text.fontFamily)" :value="text.fontFamily">
        {{ text.fontFamily }}
      </option>
      <option
        v-for="font in text.fonts"
        :key="font"
        :value="font"
      >
        {{ font }}
      </option>
    </select>
    <button
      ref="textSizeTrigger"
      data-text-control="size"
      :disabled="blocked"
      :aria-label="`${textLabel('size')}${textMixed(text.fontSize) ? `: ${textLabel('mixed')}` : ''}`"
      :aria-expanded="textSizeOpen"
      aria-haspopup="dialog"
      @click="openTextSize"
    >
      {{ text.fontSize ?? '—' }}
    </button>
    <Teleport to=".cs-overlay-root" defer>
      <section
        v-if="textSizeOpen"
        ref="textSizeRoot"
        class="cs-text-size-popover cs-text-numeric-popover"
        :style="numericPopoverStyle(sizePosition)"
        role="dialog"
        :aria-label="textLabel('size')"
        @keydown.escape.prevent.stop="closeTextSize"
      >
        <NumericControl
          :label="pickerLocale === 'ru' ? 'Значение размера шрифта' : textLabel('size') + ' value'"
          :compact-label="textLabel('size')"
          :value="text.fontSize ?? 24"
          :mixed="textMixed(text.fontSize)"
          :min="8"
          :max="256"
          :step="1"
          stepper
          unit="px"
          control-id="textFontSize"
          :locale="pickerLocale"
          :presets="[16, 24, 32, 48, 64]"
          @preview="textSizeDraft = String($event)"
          @commit="applyTextSize($event)"
        />
        <button type="button" @click="closeTextSize">
          {{ textLabel('cancel') }}
        </button>
      </section>
    </Teleport>
    <button
      data-text-control="bold"
      type="button"
      :aria-label="`${textLabel('bold')}${textMixed(text.bold) ? `: ${textLabel('mixed')}` : ''}`"
      :aria-pressed="textMixed(text.bold) ? 'mixed' : (text.bold ?? false)"
      @click="textToggle('textBold', text.bold)"
    >
      B
    </button>
    <button
      data-text-control="italic"
      type="button"
      :aria-label="`${textLabel('italic')}${textMixed(text.italic) ? `: ${textLabel('mixed')}` : ''}`"
      :aria-pressed="textMixed(text.italic) ? 'mixed' : (text.italic ?? false)"
      @click="textToggle('textItalic', text.italic)"
    >
      <i>I</i>
    </button>
    <button
      data-text-control="strikethrough"
      type="button"
      :aria-label="`${textLabel('strike')}${textMixed(text.strikethrough) ? `: ${textLabel('mixed')}` : ''}`"
      :aria-pressed="textMixed(text.strikethrough) ? 'mixed' : (text.strikethrough ?? false)"
      @click="textToggle('textStrikethrough', text.strikethrough)"
    >
      <s>S</s>
    </button>
    <button
      data-text-control="list"
      class="cs-text-overflowable"
      type="button"
      :aria-label="textLabel('list')"
      :aria-pressed="textMixed(text.listKind) ? 'mixed' : text.listKind === 'bullet'"
      :disabled="text.disabled.includes('list')"
      :title="text.disabled.includes('list') ? text.disabledReason : undefined"
      @click="emit('change', 'textList', text.listKind === 'bullet' ? 'none' : 'bullet')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="5"
          cy="6"
          r="1.5"
        />
        <circle
          cx="5"
          cy="12"
          r="1.5"
        />
        <circle
          cx="5"
          cy="18"
          r="1.5"
        />
        <path d="M10 6h9M10 12h9M10 18h9" />
      </svg>
    </button>
    <select
      data-text-control="alignment"
      class="cs-text-overflowable"
      :aria-label="textLabel('alignment')"
      :value="text.alignment ?? ''"
      @change="emit('change', 'textAlign', ($event.target as HTMLSelectElement).value)"
    >
      <option value="" disabled>
        {{ textLabel('mixed') }}
      </option>
      <option value="start">Start</option>
      <option value="center">Center</option>
      <option value="end">End</option>
    </select>
    <button
      ref="textBackgroundTrigger"
      data-text-control="background"
      class="cs-text-overflowable"
      type="button"
      :aria-label="textLabel('background')"
      :aria-expanded="textBackgroundOpen"
      aria-haspopup="dialog"
      @click="openDirectTextBackground"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="3"
        />
        <path d="M8 8h8v8H8z" />
      </svg>
    </button>
    <Teleport to=".cs-overlay-root" defer>
      <section
        v-if="textBackgroundOpen"
        ref="textBackgroundRoot"
        class="cs-text-background-popover cs-text-numeric-popover"
        :style="numericPopoverStyle(backgroundPosition)"
        role="dialog"
        :aria-label="textLabel('background')"
        @keydown.escape.prevent.stop="closeTextBackground"
      >
        <button
          type="button"
          :disabled="text.disabled.includes('none')"
          :title="text.disabled.includes('none') ? text.disabledReason : undefined"
          @click="commitTextBackground(null)"
        >
          {{ textLabel('none') }}
        </button>
        <label>{{ textLabel('color') }}
          <input
            v-model="textBackgroundDraft.color"
            type="color"
            :aria-label="textLabel('background') + ' ' + textLabel('color')"
          /></label>
        <NumericControl
          v-for="key in ['padding', 'radius'] as const"
          :key="key"
          :label="textLabel(key)"
          :value="textBackgroundDraft[key]"
          :min="0"
          :max="256"
          :step="1"
          slider
          unit="px"
          :locale="pickerLocale"
          :disabled="text.disabled.includes(key)"
          :disabled-reason="text.disabledReason"
          @invalid="backgroundInvalid[key] = $event"
          @preview="previewTextBackground(key, $event)"
          @commit="previewTextBackground(key, $event)"
          @cancel="numericPreview?.cancel(backgroundOwner)"
        />
        <button
          type="button"
          :disabled="!validTextBackground(textBackgroundDraft) || backgroundInvalid.padding || backgroundInvalid.radius"
          @click="commitTextBackground(textBackgroundDraft)"
        >
          {{ textLabel('apply') }}
        </button>
        <button type="button" @click="closeTextBackground">
          {{ textLabel('cancel') }}
        </button>
      </section>
    </Teleport>
    <button
      ref="textOverflowTrigger"
      class="cs-text-overflow-trigger"
      type="button"
      :aria-label="pickerLocale === 'ru' ? 'Дополнительные настройки текста' : 'More text settings'"
      :aria-expanded="textOverflowOpen"
      aria-haspopup="dialog"
      @click="textOverflowOpen = !textOverflowOpen"
    >
      <UiIcon name="more" />
    </button>
    <section
      v-if="textOverflowOpen"
      ref="textOverflowRoot"
      class="cs-text-overflow-popover"
      role="dialog"
      :aria-label="pickerLocale === 'ru' ? 'Дополнительные настройки текста' : 'More text settings'"
      @keydown.escape.prevent.stop="closeTextOverflow"
    >
      <button
        type="button"
        :aria-label="textLabel('list')"
        :aria-pressed="textMixed(text.listKind) ? 'mixed' : text.listKind === 'bullet'"
        :disabled="text.disabled.includes('list')"
        :title="text.disabled.includes('list') ? text.disabledReason : undefined"
        @click="chooseOverflowList"
      >
        {{ textLabel('list') }}
      </button>
      <select
        :aria-label="textLabel('alignment')"
        :value="text.alignment ?? ''"
        @change="chooseOverflowAlign"
      >
        <option value="" disabled>
          {{ textLabel('mixed') }}
        </option>
        <option value="start">Start</option>
        <option value="center">Center</option>
        <option value="end">End</option>
      </select>
      <button
        type="button"
        :aria-label="textLabel('background')"
        @click="openOverflowBackground"
      >
        {{ textLabel('background') }}
      </button>
    </section>
  </div>
</template>
