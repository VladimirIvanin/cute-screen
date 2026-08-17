<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NPopover } from 'naive-ui'
import { UiIcon } from '../icon'
import type { ContextControl, ContextToolbarSchema } from '../types'
import type { SrgbColor } from '@cute-screen/editor-renderer'
import DeferredColorPicker from '../ui/DeferredColorPicker.vue'
import DeferredSlider from '../ui/DeferredSlider.vue'
import UiSelect from '../ui/UiSelect.vue'
const props = defineProps<{
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

const openPopover = ref<Record<string, boolean>>({})
const triggers = ref<Record<string, HTMLButtonElement | undefined>>({})
const popoverRoots = ref<Record<string, HTMLElement | undefined>>({})
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
const text = computed(() => props.schema?.text)
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
  textSizeDraft.value = String(text.value?.fontSize ?? 24)
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
  if (!text.value) return
  emit(
    'change',
    'textList',
    text.value.listKind === 'bullet' ? 'none' : 'bullet',
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
  const current = text.value?.background
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

function setTrigger(id: string, element: HTMLButtonElement | null): void {
  triggers.value[id] = element ?? undefined
}

function setPopoverRoot(id: string, element: HTMLElement | null): void {
  popoverRoots.value[id] = element ?? undefined
}

function onPopoverShown(id: string, shown: boolean): void {
  openPopover.value = { ...openPopover.value, [id]: shown }
  if (!shown) {
    void nextTick(() => triggers.value[id]?.focus({ preventScroll: true }))
  }
}

function closePopover(id: string): void {
  onPopoverShown(id, false)
}

function togglePopover(event: KeyboardEvent, id: string): void {
  event.preventDefault()
  onPopoverShown(id, !(openPopover.value[id] ?? false))
}

function choose(id: string, value: string): void {
  emit('change', id, value)
  closePopover(id)
}

function arrowStrokeStyles(
  control: Extract<ContextControl, { readonly kind: 'arrowStroke' }>,
): readonly ('solid' | 'dashed' | 'dotted')[] {
  return control.style === 'dotted'
    ? (['solid', 'dashed', 'dotted'] as const)
    : (['solid', 'dashed'] as const)
}

function popoverKeydown(event: KeyboardEvent, id: string): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closePopover(id)
}

function closeOnOutsidePointer(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node)) return
  for (const [id, shown] of Object.entries(openPopover.value)) {
    if (!shown) continue
    if (
      triggers.value[id]?.contains(target) ||
      popoverRoots.value[id]?.contains(target)
    ) {
      continue
    }
    closePopover(id)
  }
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
  <section
    v-if="schema"
    class="cs-context-toolbar"
    :class="{
      'cs-context-toolbar--arrow': schema.icon === 'arrow',
      'cs-context-toolbar--text': schema.text,
      'cs-context-toolbar--precision': [
        'crop',
        'privacy',
        'spotlight',
        'ruler',
        'loupe',
      ].includes(schema.icon),
    }"
    :aria-label="label"
    :aria-description="schema.hint"
  >
    <span hidden>{{ schema.hint }}</span>
    <template v-if="schema.text && text">
      <div
        class="cs-text-toolbar"
        role="group"
        :aria-label="schema.title"
        @keydown.escape="closeOpenTextPopover"
      >
        <label class="cs-text-toolbar-color" data-text-control="color">
          <span class="sr-only">{{ textLabel('color') }}</span>
          <input
            type="color"
            :value="text.color ?? '#000000'"
            :aria-label="`${textLabel('color')}${textMixed(text.color) ? `: ${textLabel('mixed')}` : ''}`"
            @change="
              emit(
                'change',
                'textColor',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
        <select
          data-text-control="font"
          :value="text.fontFamily ?? ''"
          :aria-label="`${textLabel('font')}${textMixed(text.fontFamily) ? `: ${textLabel('mixed')}` : ''}`"
          @change="
            emit(
              'change',
              'textFont',
              ($event.target as HTMLSelectElement).value,
            )
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
          :aria-pressed="
            textMixed(text.italic) ? 'mixed' : (text.italic ?? false)
          "
          @click="textToggle('textItalic', text.italic)"
        >
          <i>I</i>
        </button>
        <button
          data-text-control="strikethrough"
          type="button"
          :aria-label="`${textLabel('strike')}${textMixed(text.strikethrough) ? `: ${textLabel('mixed')}` : ''}`"
          :aria-pressed="
            textMixed(text.strikethrough)
              ? 'mixed'
              : (text.strikethrough ?? false)
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
          :title="
            text.disabled.includes('list') ? text.disabledReason : undefined
          "
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
            emit(
              'change',
              'textAlign',
              ($event.target as HTMLSelectElement).value,
            )
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
                text.disabled.includes('padding')
                  ? text.disabledReason
                  : undefined
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
                text.disabled.includes('radius')
                  ? text.disabledReason
                  : undefined
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
            props.pickerLocale === 'ru'
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
            props.pickerLocale === 'ru'
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
    <span
      v-else
      class="cs-context-icon"
      :class="`cs-context-icon--${schema.icon}`"
      ><UiIcon :name="schema.icon"
    /></span>
    <div class="cs-context-controls">
      <template v-for="control in schema.controls" :key="control.id">
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
        <label
          v-else-if="control.kind === 'color'"
          class="cs-context-control"
          :class="{ 'cs-arrow-toolbar-control': control.compact }"
          :data-control="control.compact ? control.id : undefined"
        >
          <span v-if="!control.compact">{{ control.label }}</span>
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
        <div
          v-else-if="control.kind === 'arrowStroke'"
          class="cs-arrow-toolbar-control"
          data-control="stroke"
        >
          <NPopover
            :show="openPopover[control.id] ?? false"
            trigger="click"
            placement="top"
            :show-arrow="false"
            raw
            to=".cs-overlay-root"
            @update:show="onPopoverShown(control.id, $event)"
          >
            <template #trigger>
              <button
                :ref="
                  (element) =>
                    setTrigger(control.id, element as HTMLButtonElement | null)
                "
                class="cs-arrow-toolbar-trigger"
                type="button"
                :disabled="control.disabled ?? false"
                :aria-label="`${control.label}: ${control.width} px`"
                :title="control.label"
                :aria-expanded="openPopover[control.id] ?? false"
                aria-haspopup="dialog"
                @keydown.enter.space="togglePopover($event, control.id)"
              >
                <svg viewBox="0 0 36 18" aria-hidden="true" focusable="false">
                  <path
                    d="M3 9h30"
                    fill="none"
                    stroke="currentColor"
                    :stroke-width="Math.min(control.width, 7)"
                    stroke-linecap="round"
                    :stroke-dasharray="
                      control.style === 'dashed'
                        ? '7 4'
                        : control.style === 'dotted'
                          ? '1 4'
                          : undefined
                    "
                  />
                </svg>
                <span>{{ control.width }} px</span>
              </button>
            </template>
            <section
              :ref="
                (element) =>
                  setPopoverRoot(control.id, element as HTMLElement | null)
              "
              class="cs-arrow-toolbar-popover"
              role="dialog"
              :aria-label="control.label"
              @keydown="popoverKeydown($event, control.id)"
            >
              <div
                class="cs-arrow-toolbar-options"
                role="group"
                :aria-label="control.label"
              >
                <button
                  v-for="style in arrowStrokeStyles(control)"
                  :key="style"
                  type="button"
                  :aria-label="
                    style === 'solid'
                      ? control.solidLabel
                      : style === 'dashed'
                        ? control.dashedLabel
                        : control.dottedLabel
                  "
                  :aria-pressed="control.style === style"
                  @click="choose('strokeStyle', style)"
                >
                  <svg viewBox="0 0 42 16" aria-hidden="true" focusable="false">
                    <path
                      d="M3 8h36"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      :stroke-dasharray="
                        style === 'dashed'
                          ? '7 4'
                          : style === 'dotted'
                            ? '1 4'
                            : undefined
                      "
                    />
                  </svg>
                  <span>{{
                    style === 'solid'
                      ? control.solidLabel
                      : style === 'dashed'
                        ? control.dashedLabel
                        : control.dottedLabel
                  }}</span>
                </button>
              </div>
              <div
                class="cs-arrow-toolbar-options"
                role="group"
                aria-label="Width presets"
              >
                <span
                  v-if="![2, 4, 6, 8, 10].includes(control.width)"
                  class="cs-arrow-legacy-width"
                >
                  {{ control.width }} px
                </span>
                <button
                  v-for="width in [2, 4, 6, 8, 10]"
                  :key="width"
                  type="button"
                  :aria-label="`${width} px`"
                  :aria-pressed="control.width === width"
                  @click="choose('width', String(width))"
                >
                  <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
                    <path
                      d="M3 11h18"
                      fill="none"
                      stroke="currentColor"
                      :stroke-width="width"
                      stroke-linecap="round"
                    />
                  </svg>
                  <span>{{ width }} px</span>
                </button>
              </div>
            </section>
          </NPopover>
        </div>
        <div
          v-else-if="control.kind === 'arrowCap'"
          class="cs-arrow-toolbar-control"
          :data-control="control.id"
        >
          <NPopover
            :show="openPopover[control.id] ?? false"
            trigger="click"
            placement="top"
            :show-arrow="false"
            raw
            to=".cs-overlay-root"
            @update:show="onPopoverShown(control.id, $event)"
          >
            <template #trigger>
              <button
                :ref="
                  (element) =>
                    setTrigger(control.id, element as HTMLButtonElement | null)
                "
                class="cs-arrow-toolbar-trigger"
                type="button"
                :disabled="control.disabled ?? false"
                :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
                :title="control.label"
                :aria-expanded="openPopover[control.id] ?? false"
                aria-haspopup="dialog"
                @keydown.enter.space="togglePopover($event, control.id)"
              >
                <svg viewBox="0 0 36 22" aria-hidden="true" focusable="false">
                  <path
                    d="M4 11h18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <path
                    v-if="control.value === 'lineArrow'"
                    d="m18 5 7 6-7 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    v-else-if="control.value === 'solidArrow'"
                    d="m17 4 10 7-10 7z"
                    fill="currentColor"
                  />
                  <path
                    v-else-if="control.value === 'triangle'"
                    d="m17 4 10 7-10 7z"
                    fill="var(--surface-raised)"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                  <circle
                    v-else-if="control.value === 'circle'"
                    cx="24"
                    cy="11"
                    r="5"
                    fill="var(--surface-raised)"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path
                    v-else-if="control.value === 'diamond'"
                    d="m24 4 6 7-6 7-6-7z"
                    fill="var(--surface-raised)"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </template>
            <section
              :ref="
                (element) =>
                  setPopoverRoot(control.id, element as HTMLElement | null)
              "
              class="cs-arrow-toolbar-popover"
              role="dialog"
              :aria-label="control.label"
              @keydown="popoverKeydown($event, control.id)"
            >
              <div
                class="cs-arrow-toolbar-options cs-arrow-toolbar-options--caps"
                role="group"
                :aria-label="control.label"
              >
                <button
                  v-for="option in control.options"
                  :key="option.value"
                  type="button"
                  :aria-label="option.label"
                  :aria-pressed="control.value === option.value"
                  @click="choose(control.id, option.value)"
                >
                  <span>{{ option.label }}</span>
                </button>
              </div>
            </section>
          </NPopover>
        </div>
        <div
          v-else-if="control.kind === 'arrowPath'"
          class="cs-arrow-toolbar-control"
          data-control="arrowPath"
        >
          <NPopover
            :show="openPopover[control.id] ?? false"
            trigger="click"
            placement="top"
            :show-arrow="false"
            raw
            to=".cs-overlay-root"
            @update:show="onPopoverShown(control.id, $event)"
          >
            <template #trigger>
              <button
                :ref="
                  (element) =>
                    setTrigger(control.id, element as HTMLButtonElement | null)
                "
                class="cs-arrow-toolbar-trigger"
                type="button"
                :disabled="control.disabled ?? false"
                :aria-label="`${control.label}: ${control.options.find((option) => option.value === control.value)?.label ?? control.value}`"
                :title="control.label"
                :aria-expanded="openPopover[control.id] ?? false"
                aria-haspopup="dialog"
                @keydown.enter.space="togglePopover($event, control.id)"
              >
                <svg viewBox="0 0 38 22" aria-hidden="true" focusable="false">
                  <path
                    v-if="control.value === 'straight'"
                    d="M4 17 30 5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <path
                    v-else-if="control.value === 'elbow'"
                    d="M4 17h14V5h12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    v-else
                    d="M4 17C13 17 18 5 30 5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </template>
            <section
              :ref="
                (element) =>
                  setPopoverRoot(control.id, element as HTMLElement | null)
              "
              class="cs-arrow-toolbar-popover"
              role="dialog"
              :aria-label="control.label"
              @keydown="popoverKeydown($event, control.id)"
            >
              <div
                class="cs-arrow-toolbar-options"
                role="group"
                :aria-label="control.label"
              >
                <button
                  v-for="option in control.options"
                  :key="option.value"
                  type="button"
                  :aria-label="option.label"
                  :aria-pressed="control.value === option.value"
                  @click="choose(control.id, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>
          </NPopover>
        </div>
        <label v-else-if="control.kind === 'range'" class="cs-context-control">
          <span>{{ control.label }}</span>
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
          <span>{{ control.label }}</span>
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
    </div>
  </section>
</template>
