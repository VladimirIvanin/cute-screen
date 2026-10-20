<script setup lang="ts">
import {
  computed,
  nextTick,
  onUpdated,
  inject,
  onMounted,
  ref,
} from 'vue'
import {
  NButton,
  NInput,
  NSlider,
} from 'naive-ui'
import NumericPresetGroup from './NumericPresetGroup.vue'
import { numericLocaleKey } from './numeric-preview'
import { useNumericDraft } from './use-numeric-draft'
import type { NumericCancelReason } from './numeric-draft-model'

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
  previewValue?: ((value: number) => string) | undefined
  layerId?: string | undefined
}>(), { displayScale: 1 })
const emit = defineEmits<{
  commit: [value: number]
  preview: [value: number]
  cancel: [reason?: NumericCancelReason]
  invalid: [value: boolean]
}>()
const getLocale = inject(numericLocaleKey, () => 'en' as const)
const localeValue = computed(() => props.locale ?? getLocale())
const host = ref<HTMLElement>()
const {
  draft, invalid, editing, blocked, shownMin, shownMax, shownStep, shownValue, ariaValue, errorId,
  preview, commit, increment, keydown, keyup, pointerdown, pointerup, sliderUpdate, blur,
  compositionstart, compositionend, format,
} = useNumericDraft(props, host, {
  preview: (value) => emit('preview', value),
  commit: (value) => emit('commit', value),
  cancel: (reason) => emit('cancel', reason),
  invalid: (value) => emit('invalid', value),
})
const presets = computed(() => props.presets?.map((value) => value * (props.displayScale ?? 1)))
function choose(value: number): void {
  preview(format(value))
  commit()
}

function labelSlider(): void {
  const slider = host.value?.querySelector<HTMLElement>('[role="slider"]')
  slider?.setAttribute('aria-label', props.label)
  slider?.setAttribute('aria-valuetext', props.mixed && !editing ? '—' : `${format(shownValue.value)}${props.unit ?? ''}`)
}

onUpdated(labelSlider)
onMounted(() => {
  void nextTick(() => nextTick(labelSlider))
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
    @compositionstart="compositionstart"
    @compositionend="compositionend"
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
          'aria-valuenow': ariaValue,
          'aria-describedby': invalid ? errorId : undefined,
          'aria-valuetext': mixed && !editing ? '—' : `${draft}${unit ?? ''}`,
          'aria-invalid': invalid,
        }"
        @update:value="preview"
        @blur="blur"
      >
        <template v-if="stepper" #prefix>
          <NButton
            class="cs-numeric-step"
            quaternary
            size="small"
            :disabled="blocked || invalid || (mixed && !editing) || shownValue <= shownMin"
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
            :disabled="blocked || invalid || (mixed && !editing) || (shownMax !== undefined && shownValue >= shownMax)"
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
      :id="errorId"
      class="cs-numeric-error"
      role="alert"
    >{{ shownMin }}–{{ shownMax ?? '∞' }} · {{ localeValue === 'ru' ? 'шаг' : 'step' }} {{ format(shownStep) }}</small>
  </div>
</template>
