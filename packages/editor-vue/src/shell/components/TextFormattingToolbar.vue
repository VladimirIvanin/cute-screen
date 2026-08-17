<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { UiIcon } from '../icon'
import type { ContextToolbarSchema } from '../types'

const props = defineProps<{
  text: NonNullable<ContextToolbarSchema['text']>
  title: string
  pickerLocale?: 'en' | 'ru'
  variant?: 'bottom' | 'floating'
}>()
const emit = defineEmits<{
  change: [id: string, value: string]
}>()

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

function textLabel(
  key:
    | 'color'
    | 'font'
    | 'size'
    | 'bold'
    | 'italic'
    | 'strike'
    | 'list'
    | 'alignment'
    | 'background'
    | 'none'
    | 'padding'
    | 'radius'
    | 'apply'
    | 'cancel'
    | 'mixed',
): string {
  const ru = props.pickerLocale === 'ru'
  const labels = ru
    ? {
        color: 'Цвет текста',
        font: 'Шрифт',
        size: 'Размер шрифта',
        bold: 'Полужирный',
        italic: 'Курсив',
        strike: 'Зачёркнутый',
        list: 'Маркированный список',
        alignment: 'Выравнивание текста',
        background: 'Фон',
        none: 'Нет',
        padding: 'Отступ',
        radius: 'Скругление',
        apply: 'Применить',
        cancel: 'Отмена',
        mixed: 'смешанное',
      }
    : {
        color: 'Text color',
        font: 'Font family',
        size: 'Font size',
        bold: 'Bold',
        italic: 'Italic',
        strike: 'Strikethrough',
        list: 'Bullet list',
        alignment: 'Text alignment',
        background: 'Background',
        none: 'None',
        padding: 'Padding',
        radius: 'Radius',
        apply: 'Apply',
        cancel: 'Cancel',
        mixed: 'mixed',
      }
  return labels[key]
}

function textValue<T>(value: T | null, fallback: T): T {
  return value ?? fallback
}

function textMixed(value: unknown): boolean {
  return value === null
}

function textToggle(id: string, value: boolean | null): void {
  emit('change', id, String(!textValue(value, false)))
}

function openTextSize(): void {
  textSizeDraft.value = String(props.text.fontSize ?? 24)
  textSizeOpen.value = true
}

function closeTextSize(): void {
  textSizeOpen.value = false
  void nextTick(() => textSizeTrigger.value?.focus({ preventScroll: true }))
}

function applyTextSize(value = Number(textSizeDraft.value)): void {
  if (!Number.isInteger(value) || value < 8 || value > 256) return
  emit('change', 'textFontSize', String(value))
  closeTextSize()
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
  emit(
    'change',
    'textList',
    props.text.listKind === 'bullet' ? 'none' : 'bullet',
  )
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
  textBackgroundReturnTrigger.value = returnTrigger
  const current = props.text.background
  textBackgroundDraft.value = current
    ? { ...current }
    : { color: '#fff2a8', padding: 0, radius: 0 }
  textBackgroundOpen.value = true
}

function openDirectTextBackground(): void {
  openTextBackground(textBackgroundTrigger.value)
}

function closeTextBackground(): void {
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

function commitTextBackground(
  value: typeof textBackgroundDraft.value | null,
): void {
  if (value && !validTextBackground(value)) return
  emit('change', 'textBackground', JSON.stringify(value))
  closeTextBackground()
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

onMounted(() =>
  document.addEventListener('pointerdown', closeOnOutsidePointer, true),
)
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true),
)
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
        @change="
          emit('change', 'textColor', ($event.target as HTMLInputElement).value)
        "
      />
    </label>
    <select
      data-text-control="font"
      :value="text.fontFamily ?? ''"
      :aria-label="`${textLabel('font')}${textMixed(text.fontFamily) ? `: ${textLabel('mixed')}` : ''}`"
      @change="
        emit('change', 'textFont', ($event.target as HTMLSelectElement).value)
      "
    >
      <option value="" disabled>{{ textLabel('mixed') }}</option>
      <option
        v-if="text.fontFamily && !text.fonts.includes(text.fontFamily)"
        :value="text.fontFamily"
      >
        {{ text.fontFamily }}
      </option>
      <option v-for="font in text.fonts" :key="font" :value="font">
        {{ font }}
      </option>
    </select>
    <button
      ref="textSizeTrigger"
      data-text-control="size"
      :aria-label="`${textLabel('size')}${textMixed(text.fontSize) ? `: ${textLabel('mixed')}` : ''}`"
      :aria-expanded="textSizeOpen"
      aria-haspopup="dialog"
      @click="openTextSize"
    >
      {{ text.fontSize ?? '—' }}
    </button>
    <section
      v-if="textSizeOpen"
      ref="textSizeRoot"
      class="cs-text-size-popover"
      role="dialog"
      :aria-label="textLabel('size')"
      @keydown.escape.prevent.stop="closeTextSize"
    >
      <button
        v-for="size in [16, 24, 32, 48, 64]"
        :key="size"
        type="button"
        :aria-pressed="text.fontSize === size"
        @click="applyTextSize(size)"
      >
        {{ size }}
      </button>
      <label
        >{{ textLabel('size') }}
        <input
          v-model="textSizeDraft"
          type="number"
          min="8"
          max="256"
          :aria-label="textLabel('size') + ' value'"
      /></label>
      <button
        type="button"
        :disabled="
          !Number.isInteger(Number(textSizeDraft)) ||
          Number(textSizeDraft) < 8 ||
          Number(textSizeDraft) > 256
        "
        @click="applyTextSize()"
      >
        {{ textLabel('apply') }}
      </button>
      <button type="button" @click="closeTextSize">
        {{ textLabel('cancel') }}
      </button>
    </section>
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
      :aria-pressed="
        textMixed(text.strikethrough) ? 'mixed' : (text.strikethrough ?? false)
      "
      @click="textToggle('textStrikethrough', text.strikethrough)"
    >
      <s>S</s>
    </button>
    <button
      data-text-control="list"
      class="cs-text-overflowable"
      type="button"
      :aria-label="textLabel('list')"
      :aria-pressed="
        textMixed(text.listKind) ? 'mixed' : text.listKind === 'bullet'
      "
      :disabled="text.disabled.includes('list')"
      :title="text.disabled.includes('list') ? text.disabledReason : undefined"
      @click="
        emit(
          'change',
          'textList',
          text.listKind === 'bullet' ? 'none' : 'bullet',
        )
      "
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="6" r="1.5" />
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="5" cy="18" r="1.5" />
        <path d="M10 6h9M10 12h9M10 18h9" />
      </svg>
    </button>
    <select
      data-text-control="alignment"
      class="cs-text-overflowable"
      :aria-label="textLabel('alignment')"
      :value="text.alignment ?? ''"
      @change="
        emit('change', 'textAlign', ($event.target as HTMLSelectElement).value)
      "
    >
      <option value="" disabled>{{ textLabel('mixed') }}</option>
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
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 8h8v8H8z" />
      </svg>
    </button>
    <section
      v-if="textBackgroundOpen"
      ref="textBackgroundRoot"
      class="cs-text-background-popover"
      role="dialog"
      :aria-label="textLabel('background')"
      @keydown.escape.prevent.stop="closeTextBackground"
    >
      <button
        type="button"
        :disabled="text.disabled.includes('none')"
        :title="
          text.disabled.includes('none') ? text.disabledReason : undefined
        "
        @click="commitTextBackground(null)"
      >
        {{ textLabel('none') }}
      </button>
      <label
        >{{ textLabel('color') }}
        <input
          v-model="textBackgroundDraft.color"
          type="color"
          :aria-label="textLabel('background') + ' ' + textLabel('color')"
      /></label>
      <label
        >{{ textLabel('padding') }}
        <input
          v-model.number="textBackgroundDraft.padding"
          type="number"
          min="0"
          max="256"
          :disabled="text.disabled.includes('padding')"
          :title="
            text.disabled.includes('padding') ? text.disabledReason : undefined
          "
      /></label>
      <label
        >{{ textLabel('radius') }}
        <input
          v-model.number="textBackgroundDraft.radius"
          type="number"
          min="0"
          max="256"
          :disabled="text.disabled.includes('radius')"
          :title="
            text.disabled.includes('radius') ? text.disabledReason : undefined
          "
      /></label>
      <button
        type="button"
        :disabled="!validTextBackground(textBackgroundDraft)"
        @click="commitTextBackground(textBackgroundDraft)"
      >
        {{ textLabel('apply') }}
      </button>
      <button type="button" @click="closeTextBackground">
        {{ textLabel('cancel') }}
      </button>
    </section>
    <button
      ref="textOverflowTrigger"
      class="cs-text-overflow-trigger"
      type="button"
      :aria-label="
        pickerLocale === 'ru'
          ? 'Дополнительные настройки текста'
          : 'More text settings'
      "
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
      :aria-label="
        pickerLocale === 'ru'
          ? 'Дополнительные настройки текста'
          : 'More text settings'
      "
      @keydown.escape.prevent.stop="closeTextOverflow"
    >
      <button
        type="button"
        :aria-label="textLabel('list')"
        :aria-pressed="
          textMixed(text.listKind) ? 'mixed' : text.listKind === 'bullet'
        "
        :disabled="text.disabled.includes('list')"
        :title="
          text.disabled.includes('list') ? text.disabledReason : undefined
        "
        @click="chooseOverflowList"
      >
        {{ textLabel('list') }}
      </button>
      <select
        :aria-label="textLabel('alignment')"
        :value="text.alignment ?? ''"
        @change="chooseOverflowAlign"
      >
        <option value="" disabled>{{ textLabel('mixed') }}</option>
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
