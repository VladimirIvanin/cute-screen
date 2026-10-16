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
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import TextFontPicker from '../ui/TextFontPicker.vue'
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
const toolbarRoot = ref<HTMLElement>()
let toolbarObserver: ResizeObserver | undefined
const colorPicker = ref<InstanceType<typeof SimpleColorPicker>>()
const fontPicker = ref<InstanceType<typeof TextFontPicker>>()
const unregisterBackground = numericPreview?.register(backgroundOwner, () => {
  if (textBackgroundOpen.value) closeTextBackground()
})

const sizePosition = usePreviewPopover(
  () => textSizeOpen.value ? textSizeTrigger.value : undefined,
  () => textSizeRoot.value,
)
const backgroundPosition = usePreviewPopover(
  () => textBackgroundOpen.value ? textBackgroundTrigger.value : undefined,
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

const formattingControls = computed(() => [
  { id: 'textBold', key: 'bold', icon: 'bold', value: props.text.bold },
  { id: 'textItalic', key: 'italic', icon: 'italic', value: props.text.italic },
  { id: 'textStrikethrough', key: 'strike', icon: 'strikethrough', value: props.text.strikethrough },
] as const)
const alignments = [
  { value: 'start', label: 'alignStart', icon: 'alignLeft' },
  { value: 'center', label: 'alignCenter', icon: 'alignCenter' },
  { value: 'end', label: 'alignEnd', icon: 'alignRight' },
] as const

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
  closeOtherPopovers('size')
  textSizeDraft.value = String(props.text.fontSize ?? 24)
  textSizeOpen.value = true
  void nextTick(() => textSizeRoot.value?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }))
}

function closeTextSize(restoreFocus = true): void {
  if (!textSizeOpen.value) return
  textSizeOpen.value = false
  if (restoreFocus) void nextTick(() => textSizeTrigger.value?.focus({ preventScroll: true }))
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

function closeOtherPopovers(except?: 'color' | 'font' | 'size' | 'background'): void {
  if (except !== 'color') colorPicker.value?.close()
  if (except !== 'font') fontPicker.value?.close()
  if (except !== 'size' && textSizeOpen.value) closeTextSize()
  if (except !== 'background' && textBackgroundOpen.value) closeTextBackground()
}
function openDirectTextBackground(): void {
  if (blocked.value) return
  closeOtherPopovers('background')
  const current = props.text.background
  textBackgroundDraft.value = current ? { ...current } : { color: '#fff2a8', padding: 0, radius: 0 }
  backgroundInvalid.value = { padding: false, radius: false }
  textBackgroundOpen.value = true
  void nextTick(() => {
    const button = textBackgroundRoot.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    button?.focus({ preventScroll: true })
  })
}

function closeTextBackground(restoreFocus = true): void {
  if (!textBackgroundOpen.value) return
  numericPreview?.cancel(backgroundOwner)
  textBackgroundOpen.value = false
  if (restoreFocus) void nextTick(() => textBackgroundTrigger.value?.focus({ preventScroll: true }))
}

function closeOpenTextPopover(event: KeyboardEvent): void {
  if (textBackgroundOpen.value) closeTextBackground()
  else if (textSizeOpen.value) closeTextSize()
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
    !textBackgroundRoot.value?.contains(target) &&
    !(target instanceof Element && target.closest('.cs-color-picker-popover'))
  ) {
    closeTextBackground(false)
  }
  if (
    textSizeOpen.value &&
    !textSizeTrigger.value?.contains(target) &&
    !textSizeRoot.value?.contains(target)
  ) {
    closeTextSize(false)
  }

}

watch(blocked, (disabled) => {
  if (disabled) {
    closeTextSize()
    closeTextBackground()
    closeOtherPopovers()
  }
})
onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePointer, true)
  if (typeof ResizeObserver !== 'undefined' && toolbarRoot.value) {
    toolbarObserver = new ResizeObserver(() => document.dispatchEvent(new Event('cs-text-toolbar-resize')))
    toolbarObserver.observe(toolbarRoot.value)
  }
})
onBeforeUnmount(() => {
  toolbarObserver?.disconnect()
  unregisterBackground?.()
  numericPreview?.cancel(backgroundOwner)
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
})
</script>

<template>
  <div
    ref="toolbarRoot"
    class="cs-text-toolbar"
    :class="{ 'cs-text-floating-toolbar': variant === 'floating' }"
    role="group"
    :aria-label="title"
    @keydown.escape="closeOpenTextPopover"
  >
    <div class="cs-text-control-group" data-text-control="color">
      <SimpleColorPicker
        ref="colorPicker"
        :model-value="text.color ?? '#000000'"
        :mixed="textMixed(text.color)"
        :ariaLabel="`${textLabel('color')}${textMixed(text.color) ? `: ${textLabel('mixed')}` : ''}`"
        :locale="pickerLocale ?? 'en'"
        :eyedropper="false"
        :disabled="blocked"
        @opened="closeOtherPopovers('color')"
        @commit="emit('change', 'textColor', $event)"
      />
    </div>
    <div class="cs-text-control-group cs-text-type-group">
      <TextFontPicker
        ref="fontPicker"
        data-text-control="font"
        :model-value="text.fontFamily"
        :preview-text="text.fontPreviewText"
        :locale="pickerLocale"

        :ariaLabel="`${textLabel('font')}${textMixed(text.fontFamily) ? `: ${textLabel('mixed')}` : ''}`"
        :disabled="blocked"
        @opened="closeOtherPopovers('font')"
        @commit="emit('change', 'textFont', $event)"
      />
      <button
        ref="textSizeTrigger"
        data-text-control="size"
        :disabled="blocked"
        :aria-label="`${textLabel('size')}${textMixed(text.fontSize) ? `: ${textLabel('mixed')}` : ''}`"
        :title="textLabel('size')"
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
          @keydown.escape.prevent.stop="closeTextSize()"
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
          <button type="button" @click="closeTextSize()">
            {{ textLabel('cancel') }}
          </button>
        </section>
      </Teleport>
    </div>
    <div class="cs-text-control-group">
      <button
        v-for="control in formattingControls"
        :key="control.id"
        type="button"
        :data-text-control="control.icon"
        :aria-label="`${textLabel(control.key)}${textMixed(control.value) ? `: ${textLabel('mixed')}` : ''}`"
        :title="textLabel(control.key)"
        :aria-pressed="textMixed(control.value) ? 'mixed' : (control.value ?? false)"
        :disabled="blocked"
        @click="textToggle(control.id, control.value)"
      >
        <UiIcon :name="control.icon" />
      </button>
    </div>
    <div class="cs-text-control-group">
      <button
        data-text-control="list"
        type="button"
        :aria-label="textLabel('list')"
        :aria-pressed="textMixed(text.listKind) ? 'mixed' : text.listKind === 'bullet'"
        :disabled="blocked || text.disabled.includes('list')"
        :title="text.disabled.includes('list') ? text.disabledReason : textLabel('list')"
        @click="emit('change', 'textList', text.listKind === 'bullet' ? 'none' : 'bullet')"
      >
        <UiIcon name="list" />
      </button>
    </div>
    <div
      class="cs-text-control-group"
      data-text-control="alignment"
      role="group"
      :aria-label="textLabel('alignment')"
    >
      <button
        v-for="align in alignments"
        :key="align.value"
        type="button"
        :aria-label="textLabel(align.label)"
        :title="textLabel(align.label)"
        :aria-pressed="text.alignment === align.value"
        :disabled="blocked"
        @click="emit('change', 'textAlign', align.value)"
      >
        <UiIcon :name="align.icon" />
      </button>
    </div>
    <div class="cs-text-control-group">
      <button
        ref="textBackgroundTrigger"
        data-text-control="background"
        type="button"
        :aria-label="textLabel('background')"
        :title="textLabel('background')"
        :aria-expanded="textBackgroundOpen"
        :class="{ 'has-background': text.background }"
        :disabled="blocked"
        aria-haspopup="dialog"
        @click="openDirectTextBackground"
      >
        <UiIcon name="textBackground" /><span
          v-if="text.background"
          class="cs-text-background-indicator"
          :style="{ backgroundColor: text.background.color }"
        />
      </button>
    </div>
    <Teleport to=".cs-overlay-root" defer>
      <section
        v-if="textBackgroundOpen"
        ref="textBackgroundRoot"
        class="cs-text-background-popover cs-text-numeric-popover"
        :style="numericPopoverStyle(backgroundPosition)"
        role="dialog"
        :aria-label="textLabel('background')"
        @keydown.escape.prevent.stop="closeTextBackground()"
      >
        <button
          type="button"
          :disabled="text.disabled.includes('none')"
          :title="text.disabled.includes('none') ? text.disabledReason : undefined"
          @click="commitTextBackground(null)"
        >
          {{ textLabel('none') }}
        </button>
        <div class="cs-text-background-color">
          <span>{{ textLabel('color') }}</span>
          <SimpleColorPicker
            :model-value="textBackgroundDraft.color"
            :ariaLabel="textLabel('background') + ' ' + textLabel('color')"
            :locale="pickerLocale ?? 'en'"
            :eyedropper="false"
            :disabled="blocked"
            embedded
            @commit="textBackgroundDraft.color = $event"
            @dismiss="closeTextBackground()"
          />
        </div>
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
        <button type="button" @click="closeTextBackground()">
          {{ textLabel('cancel') }}
        </button>
      </section>
    </Teleport>
  </div>
</template>
