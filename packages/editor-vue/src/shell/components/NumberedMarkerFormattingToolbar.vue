<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import type { ContextToolbarSchema } from '../types'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import TextFontPicker from '../ui/TextFontPicker.vue'
import NumericControl from '../ui/NumericControl.vue'
import { numericPreviewKey } from '../ui/numeric-preview'
import { usePreviewPopover } from '../ui/use-preview-popover'

const props = withDefaults(defineProps<{
  text: NonNullable<ContextToolbarSchema['text']>
  locale: 'en' | 'ru'
  disabled?: boolean | undefined
  recentColors?: readonly import('@cute-screen/editor-renderer').SrgbColor[] | undefined
}>(), { disabled: false, recentColors: () => [] })
const emit = defineEmits<{ change: [id: string, value: string] }>()
const service = inject(numericPreviewKey, undefined)
const blocked = computed(() => Boolean(props.disabled || service?.isBlocked?.()))
const marker = computed(() => props.text.marker)
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const open = ref<'size' | 'more'>()
const panel = ref<HTMLElement>()
const sizeTrigger = ref<HTMLButtonElement>()
const moreTrigger = ref<HTMLButtonElement>()
const badgePicker = ref<InstanceType<typeof SimpleColorPicker>>()
const labelPicker = ref<InstanceType<typeof SimpleColorPicker>>()
const numberDraft = ref('')
const numberInvalid = computed(() => !/^[0-9]+$/u.test(numberDraft.value) || !Number.isSafeInteger(Number(numberDraft.value)) || Number(numberDraft.value) < 1)
watch(() => marker.value?.sequence, (value) => {
  numberDraft.value = value === null || value === undefined ? '' : String(value)
}, { immediate: true })
const position = usePreviewPopover(() => open.value === 'size' ? sizeTrigger.value : open.value === 'more' ? moreTrigger.value : undefined, () => panel.value)
const shapes = computed(() => [
  { id: 'circle', name: text('Circle', 'Круг') },
  { id: 'square', name: text('Square', 'Квадрат') },
  { id: 'diamond', name: text('Diamond', 'Ромб') },
  { id: 'star', name: text('Star', 'Звезда') },
])
const formats = computed(() => [
  { id: 'textBold', name: text('Bold', 'Полужирный'), icon: 'bold' as const, value: props.text.bold },
  { id: 'textItalic', name: text('Italic', 'Курсив'), icon: 'italic' as const, value: props.text.italic },
  { id: 'textStrikethrough', name: text('Strikethrough', 'Зачёркнутый'), icon: 'strikethrough' as const, value: props.text.strikethrough },
])
const alignments = computed(() => [
  { id: 'start', name: text('Align left', 'По левому краю'), icon: 'alignLeft' as const },
  { id: 'center', name: text('Align center', 'По центру'), icon: 'alignCenter' as const },
  { id: 'end', name: text('Align right', 'По правому краю'), icon: 'alignRight' as const },
])
function change(
  id: string,
  value: string,
): void {
  if (!blocked.value) emit('change', id, value)
}
function commitNumber(): void {
  if (numberInvalid.value) return
  const id = marker.value?.mode === 'defaults' ? 'markerNext' : 'markerSequence'
  if (
    Number(numberDraft.value) !== marker.value?.sequence ||
    id === 'markerNext' &&
    !marker.value?.manual
  ) change(id, numberDraft.value)
}
function outside(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('.cs-text-font-popover, .cs-color-picker-popover')) return
  close(false)
}
function stepNumber(event: KeyboardEvent): void {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const value = Number(numberDraft.value)
  const next = value + (event.key === 'ArrowUp' ? 1 : -1)
  if (Number.isSafeInteger(next) && next > 0) {
    numberDraft.value = String(next)
    commitNumber()
  }
}
function close(restoreFocus = true): void {
  const previous = open.value
  open.value = undefined
  if (restoreFocus) void nextTick(() => (previous === 'size' ? sizeTrigger.value : moreTrigger.value)?.focus({ preventScroll: true }))
}
function show(menu: 'size' | 'more'): void {
  if (blocked.value) return
  if (open.value === menu) {
    close()
    return
  }
  badgePicker.value?.close()
  labelPicker.value?.close()
  open.value = menu
  void nextTick(() => panel.value?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true }))
}
</script>

<template>
  <div
    class="cs-numbered-marker-toolbar"
    :class="{ 'cs-numbered-marker-toolbar--inline': marker?.mode === 'inline' }"
    role="group"
    :aria-label="text('Numbered marker', 'Номерная метка')"
  >
    <div
      v-if="marker?.mode !== 'inline' && marker?.mode !== 'multiple'"
      class="cs-marker-control-group cs-marker-number-group"
      data-marker-control="number"
    >
      <label class="cs-marker-number-label">
        <span>{{ marker?.mode === 'defaults' ? text('Next number', 'Следующий номер') : text('Number', 'Номер') }}</span>
        <input
          v-model="numberDraft"
          type="text"
          inputmode="numeric"
          role="spinbutton"
          :aria-valuemin="1"
          :aria-valuemax="Number.MAX_SAFE_INTEGER"
          :aria-valuenow="numberInvalid ? undefined : Number(numberDraft)"
          :aria-invalid="numberInvalid"
          :aria-label="marker?.mode === 'defaults' ? text('Next number', 'Следующий номер') : text('Number', 'Номер')"
          :disabled="blocked"
          @change="commitNumber"
          @keydown="stepNumber"
          @keydown.enter.prevent.stop="commitNumber"
          @keydown.escape.prevent.stop="numberDraft = String(marker?.sequence ?? 1)"
        />
      </label>
      <button
        v-if="marker?.mode === 'defaults'"
        type="button"
        :disabled="blocked || !marker.manual"
        :title="text('Maximum existing number + 1', 'Максимальный существующий номер + 1')"
        @click="change('markerAuto', '')"
      >
        {{ text('Auto', 'Авто') }}
      </button>
      <button
        v-if="marker?.customLabel"
        type="button"
        :disabled="blocked"
        @click="change('markerRemoveCaption', '')"
      >
        {{ text('Remove label', 'Убрать подпись') }}
      </button>
      <small v-if="numberInvalid" role="alert">{{ text('Enter a positive whole number', 'Введите положительное целое число') }}</small>
      <small v-else-if="marker?.duplicate" role="status">{{ text('This number is already used', 'Этот номер уже используется') }}</small>
    </div>
    <div
      v-if="marker?.mode !== 'inline'"
      class="cs-marker-control-group cs-marker-shapes"
      role="group"
      :aria-label="text('Shape', 'Форма')"
      data-marker-control="shape"
    >
      <button
        v-for="shape in shapes"
        :key="shape.id"
        type="button"
        :aria-label="shape.name"
        :title="shape.name"
        :disabled="blocked"
        :aria-pressed="marker?.shape === shape.id"
        @click="change('markerShape', shape.id)"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle
            v-if="shape.id === 'circle'"
            cx="16"
            cy="16"
            r="12"
          />
          <rect
            v-else-if="shape.id === 'square'"
            x="4"
            y="4"
            width="24"
            height="24"
          />
          <path v-else-if="shape.id === 'diamond'" d="M16 2L30 16L16 30L2 16Z" />
          <path v-else d="M16 1L20 11L31 12L23 20L25 31L16 25L7 31L9 20L1 12L12 11Z" />
          <text
            x="16"
            y="20"
            text-anchor="middle"
          >1</text>
        </svg>
      </button>
    </div>
    <div class="cs-marker-control-group" data-marker-control="size">
      <button
        ref="sizeTrigger"
        type="button"
        :disabled="blocked"
        :aria-expanded="open === 'size'"
        aria-haspopup="dialog"
        :aria-label="text('Font size', 'Размер шрифта')"
        @click="show('size')"
      >
        <span>{{ props.text.fontSize ?? '—' }}</span><span class="cs-marker-unit">px</span><UiIcon name="chevronDown" />
      </button>
    </div>
    <div class="cs-marker-control-group cs-marker-color-group" data-marker-control="badgeColor">
      <span>{{ text('Badge', 'Метка') }}</span>
      <SimpleColorPicker
        ref="badgePicker"
        :recent-colors="recentColors ?? []"
        :model-value="marker?.badgeColor ?? '#000000'"
        :mixed="marker?.badgeColor === null"
        :ariaLabel="text('Badge color', 'Цвет метки')"
        :locale="locale"
        :disabled="blocked"
        @opened="close(false); labelPicker?.close()"
        @commit="change('markerBadgeColor', $event)"
        @eyedropper="change('markerSample', 'markerBadgeColor')"
      />
    </div>
    <div class="cs-marker-control-group cs-marker-color-group" data-marker-control="labelColor">
      <span>{{ text('Label', 'Подпись') }}</span>
      <SimpleColorPicker
        ref="labelPicker"
        :recent-colors="recentColors ?? []"
        :model-value="props.text.color ?? '#FFFFFF'"
        :mixed="props.text.color === null"
        :ariaLabel="text('Label color', 'Цвет подписи')"
        :locale="locale"
        :disabled="blocked"
        @opened="close(false); badgePicker?.close()"
        @commit="change('textColor', $event)"
        @eyedropper="change('markerSample', 'textColor')"
      />
    </div>
    <div class="cs-marker-control-group" data-marker-control="more">
      <button
        ref="moreTrigger"
        type="button"
        :disabled="blocked"
        :aria-expanded="open === 'more'"
        aria-haspopup="dialog"
        @click="show('more')"
      >
        {{ text('More', 'Ещё') }}<UiIcon name="chevronDown" />
      </button>
      <button
        v-if="marker?.mode === 'selection'"
        type="button"
        :disabled="blocked"
        @click="change('markerEditLabel', '')"
      >
        {{ marker?.customLabel ? text('Edit label', 'Изменить подпись') : text('Add label', 'Добавить подпись') }}
      </button>
    </div>
    <NPopover
      :show="Boolean(open)"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @clickoutside="outside"
    >
      <div
        v-if="open"
        ref="panel"
        class="cs-marker-popover"
        role="dialog"
        :aria-label="open === 'size' ? text('Font size', 'Размер шрифта') : text('Label formatting', 'Форматирование подписи')"
        @pointerdown.stop
        @keydown.escape.prevent.stop="close()"
      >
        <NumericControl
          v-if="open === 'size'"
          :label="text('Font size value', 'Значение размера шрифта')"
          :value="props.text.fontSize ?? 16"
          :mixed="props.text.fontSize === null"
          :min="8"
          :max="256"
          :step="1"
          :presets="[12, 16, 24, 32]"
          unit="px"
          stepper
          control-id="textFontSize"
          :locale="locale"
          :disabled="blocked"
          @commit="change('textFontSize', String($event))"
        />
        <template v-else>
          <TextFontPicker
            :model-value="props.text.fontFamily"
            :preview-text="props.text.fontPreviewText ?? '123'"
            :locale="locale"
            :ariaLabel="text('Font family', 'Шрифт')"
            :disabled="blocked"
            @commit="change('textFont', $event)"
          />
          <div
            class="cs-marker-control-group"
            role="group"
            :aria-label="text('Text style', 'Начертание')"
          >
            <button
              v-for="format in formats"
              :key="format.id"
              type="button"
              :aria-label="format.name"
              :disabled="blocked"
              :aria-pressed="format.value === null ? 'mixed' : format.value"
              @click="change(format.id, String(!format.value))"
            >
              <UiIcon :name="format.icon" />
            </button>
          </div>
          <div
            class="cs-marker-control-group"
            role="group"
            :aria-label="text('Text alignment', 'Выравнивание текста')"
          >
            <button
              v-for="alignment in alignments"
              :key="alignment.id"
              type="button"
              :aria-label="alignment.name"
              :disabled="blocked"
              :aria-pressed="props.text.alignment === alignment.id"
              @click="change('textAlign', alignment.id)"
            >
              <UiIcon :name="alignment.icon" />
            </button>
          </div>
        </template>
      </div>
    </NPopover>
  </div>
</template>
