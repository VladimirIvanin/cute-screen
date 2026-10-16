<script setup lang="ts">
import {
  computed,
  nextTick,
  onUpdated,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  NButton,
  NInput,
  NSlider,
} from 'naive-ui'
import NumericPresetGroup from './NumericPresetGroup.vue'
import {
  numericDefaultsKey,
  numericPreviewKey,
  numericLocaleKey,
} from './numeric-preview'

const props = withDefaults(defineProps<{
  label: string
  compactLabel?: string | undefined
  value: number
  min: number
  max?: number | undefined
  step: number
  unit?: string | undefined
  displayScale?: number | undefined
  slider?: boolean | undefined
  stepper?: boolean | undefined
  presets?: readonly number[] | undefined
  mixed?: boolean | undefined
  disabled?: boolean | undefined
  disabledReason?: string | undefined
  locale?: 'en' | 'ru' | undefined
  controlId?: string | undefined
  layerId?: string | undefined
}>(), { displayScale: 1 })
const emit = defineEmits<{
  commit: [value: number]
  preview: [value: number]
  cancel: []
  invalid: [value: boolean]
}>()
const service = inject(numericPreviewKey, undefined)
const getLocale = inject(numericLocaleKey, () => 'en' as const)
const localeValue = computed(() => props.locale ?? getLocale())
const blocked = computed(() => Boolean(props.disabled || service?.isBlocked?.()))
const defaultsTool = inject(numericDefaultsKey, () => undefined)
const owner = Symbol('numeric-control')
const unregister = service?.register?.(owner, () => {
  cancelledPointer = pointer
  reset()
  emit('cancel')
})
const host = ref<HTMLElement>()
const draft = ref('')
const invalid = ref(false)
let editing = false
let pointer = false
let cancelledPointer = false
let lastCommitted = props.value
const scale = computed(() => props.displayScale)
const shownMin = computed(() => props.min * scale.value)
const shownMax = computed(() => props.max === undefined ? undefined : props.max * scale.value)
const shownStep = computed(() => props.step * scale.value)
const shownValue = computed(() => parse() ?? props.value * scale.value)
const presets = computed(() => props.presets?.map((value) => value * scale.value))

function format(value: number): string {
  return String(Number(value.toFixed(8)))
}

function reset(): void {
  draft.value = props.mixed ? '' : format(props.value * scale.value)
  invalid.value = false
  emit('invalid', false)
  editing = false
  pointer = false
  lastCommitted = props.value
}

function parse(): number | undefined {
  const raw = draft.value.trim().replace(',', '.')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return undefined
  const value = Number(raw)
  const steps = (value - shownMin.value) / shownStep.value
  if (
    !Number.isFinite(value) ||
    value < shownMin.value ||
    (shownMax.value !== undefined &&
      value > shownMax.value) ||
      Math.abs(steps - Math.round(steps)) > 0.000001
  ) return undefined
  return value
}

function preview(next: string): void {
  if (blocked.value) return
  draft.value = next
  editing = true
  const value = parse()
  invalid.value = value === undefined
  emit('invalid', invalid.value)
  if (value === undefined) {
    service?.cancel(owner)
    return
  }
  const actual = Number((value / scale.value).toFixed(10))
  emit('preview', actual)
  if (props.controlId) service?.preview(owner, {
    id: props.controlId,
    defaultsTool: defaultsTool(),
    layerId: props.layerId,
  }, String(actual))
}

function commit(): void {
  if (blocked.value || !editing) return
  const value = parse()
  invalid.value = value === undefined
  emit('invalid', invalid.value)
  if (value === undefined) return
  const actual = Number((value / scale.value).toFixed(10))
  editing = false
  pointer = false
  service?.cancel(owner)
  if (actual !== lastCommitted || props.mixed) {
    lastCommitted = actual
    emit('commit', actual)
  }
}

function cancel(): void {
  const pending = editing
  service?.cancel(owner)
  reset()
  if (pending) emit('cancel')
}

function choose(value: number): void {
  preview(format(value))
  commit()
}

function increment(
  direction: number,
  multiplier = 1,
): void {
  const current = parse() ?? props.value * scale.value
  const moved = current + direction * shownStep.value * multiplier
  const next = Math.max(shownMin.value, Math.min(shownMax.value ?? Infinity, moved))
  preview(format(next))
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelledPointer = pointer
    cancel()
    return
  }
  if (blocked.value) return
  const slider = event.target instanceof Element && Boolean(event.target.closest('.n-slider'))
  const directions: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, ArrowRight: 1, ArrowLeft: -1 }
  if (
    event.key in directions &&
    (slider ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown')
  ) {
    event.preventDefault()
    event.stopPropagation()
    increment(directions[event.key]!, event.shiftKey ? 10 : 1)
  } else if (
    slider &&
    (event.key === 'Home' ||
      event.key === 'End')
  ) {
    event.preventDefault()
    event.stopPropagation()
    preview(format(event.key === 'Home' ? shownMin.value : shownMax.value ?? shownValue.value))
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commit()
  }
}

function keyup(event: KeyboardEvent): void {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) commit()
}

function pointerdown(event: PointerEvent): void {
  if (blocked.value || event.button !== 0) return
  if (event.target instanceof Element && event.target.closest('.n-slider')) {
    cancelledPointer = false
    pointer = true
  }
}

function sliderUpdate(value: number): void {
  if (!cancelledPointer) preview(format(value))
}

function pointerup(): void {
  if (pointer && !cancelledPointer) queueMicrotask(commit)
}

function pointercancel(): void {
  if (!pointer) return
  cancelledPointer = true
  cancel()
}

function globalEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !editing) return
  cancelledPointer = pointer
  cancel()
}

function outside(event: PointerEvent): void {
  if (!editing || !(event.target instanceof Node)) return
  const panel = host.value?.closest('[role="dialog"], fieldset, .cs-layers-controls') ?? host.value
  if (!panel?.contains(event.target)) cancel()
}

function blur(event: FocusEvent): void {
  if (pointer) return
  // A text projection restores its range and returns focus synchronously.
  // Only an actual focus departure completes numeric input.
  queueMicrotask(() => {
    if (!editing || document.activeElement === event.target) return
    if (event.relatedTarget instanceof Node && host.value?.contains(event.relatedTarget)) return
    const panel = host.value?.closest('[role="dialog"], fieldset, .cs-layers-controls') ?? host.value
    if (
      !event.relatedTarget ||
      (event.relatedTarget instanceof Node &&
        panel?.contains(event.relatedTarget))
    ) commit()
  })
}

watch(() => [props.value, props.mixed, props.displayScale] as const, () => {
  if (!editing) reset()
}, { immediate: true })
watch(blocked, (disabled) => {
  if (disabled) cancel()
})
function labelSlider(): void {
  const slider = host.value?.querySelector<HTMLElement>('[role="slider"]')
  slider?.setAttribute('aria-label', props.label)
  slider?.setAttribute('aria-valuetext', props.mixed && !editing ? '—' : `${format(shownValue.value)}${props.unit ?? ''}`)
}

onUpdated(labelSlider)
onMounted(() => {
  void nextTick(() => nextTick(labelSlider))
  document.addEventListener('keydown', globalEscape, true)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('pointerup', pointerup)
  document.addEventListener('pointercancel', pointercancel)
  window.addEventListener('blur', cancel)
})
onBeforeUnmount(() => {
  unregister?.()
  document.removeEventListener('keydown', globalEscape, true)
  service?.cancel(owner)
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('pointerup', pointerup)
  document.removeEventListener('pointercancel', pointercancel)
  window.removeEventListener('blur', cancel)
})
</script>

<template>
  <div
    ref="host"
    class="cs-numeric-control"
    :class="{ 'cs-numeric-control--slider': slider }"
    @keydown.capture="keydown"
    @keyup="keyup"
    @pointerdown.capture="pointerdown"
  >
    <span class="cs-numeric-label">{{ compactLabel ?? label }}</span>
    <div class="cs-numeric-values">
      <NumericPresetGroup
        v-if="presets?.length"
        :values="presets"
        :value="shownValue"
        :mixed="mixed && !editing"
        :disabled="blocked"
        :label="`${label} ${localeValue === 'ru' ? 'пресеты' : 'presets'}`"
        :unit="unit"
        @choose="choose"
      >
        <template v-if="$slots.preset" #default="preset">
          <slot name="preset" :value="preset.value"/>
        </template>
      </NumericPresetGroup>
      <NInput
        class="cs-numeric-entry"
        :class="{ 'cs-numeric-entry--stepper': stepper }"
        :value="draft"
        size="small"
        :theme-overrides="{ heightSmall: '32px', paddingSmall: '0 6px' }"
        :disabled="blocked"
        :placeholder="mixed ? '—' : ''"
        v-bind="invalid ? { status: 'error' as const } : {}"
        :input-props="{
          role: 'spinbutton',
          title: blocked ? disabledReason : undefined,
          inputmode: 'decimal',
          'aria-label': label,
          'aria-valuemin': shownMin,
          'aria-valuemax': shownMax,
          'aria-valuenow': mixed && !editing ? undefined : shownValue,
          'aria-valuetext': mixed && !editing ? '—' : `${draft}${unit ?? ''}`,
          'aria-invalid': invalid,
        }"
        @update:value="preview"
        @blur="blur"
        @wheel.stop
      >
        <template v-if="stepper" #prefix>
          <NButton
            class="cs-numeric-step"
            quaternary
            size="small"
            :disabled="blocked || (!mixed && shownValue <= shownMin)"
            :aria-label="`${label} −`"
            @click="increment(-1); commit()"
          >
            −
          </NButton>
        </template>
        <template v-if="unit || stepper" #suffix>
          <span v-if="unit" class="cs-numeric-unit">{{ unit }}</span>
          <NButton
            v-if="stepper"
            class="cs-numeric-step"
            quaternary
            size="small"
            :disabled="blocked || (!mixed && shownMax !== undefined && shownValue >= shownMax)"
            :aria-label="`${label} +`"
            @click="increment(1); commit()"
          >
            +
          </NButton>
        </template>
      </NInput>
    </div>
    <NSlider
      v-if="slider && max !== undefined"
      :value="shownValue"
      :min="shownMin"
      :max="shownMax ?? 100"
      :step="shownStep"
      :disabled="blocked"
      :format-tooltip="(value: number) => `${format(value)}${unit ?? ''}`"
      :aria-label="label"
      @update:value="sliderUpdate"
      @dragend="pointerup"
    />
    <small
      v-if="invalid"
      class="cs-numeric-error"
      role="alert"
    >{{ shownMin }}–{{ shownMax ?? '∞' }} · {{ localeValue === 'ru' ? 'шаг' : 'step' }} {{ format(shownStep) }}</small>
  </div>
</template>
