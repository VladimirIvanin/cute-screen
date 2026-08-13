<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NButton, NPopover, NTooltip } from 'naive-ui'
import {
  colorPalette,
  colorSuggestions,
  hexToSrgb,
  normalizeHex,
  srgbToHex,
  srgbToHsv,
  hsvToSrgb,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'

const props = withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    recentColors?: readonly SrgbColor[]
    disabled?: boolean
    eyedropper?: boolean
    locale?: 'en' | 'ru'
  }>(),
  { recentColors: () => [], disabled: false, eyedropper: true, locale: 'en' },
)
const emit = defineEmits<{
  commit: [value: string]
  eyedropper: []
}>()

const shown = ref(false)
const trigger = ref<{ $el?: HTMLElement }>()
const hexInput = ref<HTMLInputElement>()
const popover = ref<HTMLElement>()
const draft = ref(normalizeHex(props.modelValue) ?? '#E5484D')
const preservedHue = ref(srgbToHsv(hexToSrgb(draft.value)!).hue)
const hueDragging = ref(false)
const hexError = ref<string>()

const draftColor = computed(() => hexToSrgb(draft.value)!)
const palette = computed(() =>
  colorPalette(draftColor.value, preservedHue.value),
)
const suggestions = computed(() =>
  colorSuggestions(draftColor.value, preservedHue.value),
)
const hue = computed(() => srgbToHsv(draftColor.value).hue)
const recent = computed(() => props.recentColors.slice(0, 2))
const quickColors = computed(() => {
  const values = [
    draft.value,
    ...props.recentColors.map(srgbToHex),
    '#F2C84B',
    '#52B788',
    '#202226',
  ]
  return [...new Set(values)].slice(0, 5)
})

function resetDraft(): void {
  const next = normalizeHex(props.modelValue) ?? '#E5484D'
  draft.value = next
  const hsv = srgbToHsv(hexToSrgb(next)!)
  if (hsv.saturation >= 1) preservedHue.value = hsv.hue
  hexError.value = undefined
}

watch(
  () => props.modelValue,
  () => {
    if (!shown.value) resetDraft()
  },
)

function setDraft(
  value: string,
  options: { preserveHue?: boolean } = {},
): boolean {
  const normalized = normalizeHex(value)
  if (!normalized) return false
  draft.value = normalized
  const hsv = srgbToHsv(hexToSrgb(normalized)!)
  if (options.preserveHue !== true && hsv.saturation >= 1)
    preservedHue.value = hsv.hue
  hexError.value = undefined
  return true
}

function commit(value = draft.value): void {
  if (!setDraft(value)) return
  emit('commit', draft.value)
}

function onShown(next: boolean): void {
  shown.value = next
  if (next) {
    resetDraft()
    void nextTick(() => hexInput.value?.focus({ preventScroll: true }))
  } else {
    resetDraft()
    void nextTick(() => trigger.value?.$el?.focus({ preventScroll: true }))
  }
}

function close(): void {
  onShown(false)
}

function choose(value: string): void {
  if (!setDraft(value)) return
  commit()
}

function onHueInput(event: Event): void {
  const nextHue = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(nextHue)) return
  preservedHue.value = nextHue
  const current = srgbToHsv(draftColor.value)
  setDraft(srgbToHex(hsvToSrgb({ ...current, hue: nextHue })), {
    preserveHue: true,
  })
  if (!hueDragging.value) commit()
}

function onHueChange(): void {
  if (!hueDragging.value) return
  hueDragging.value = false
  commit()
}

function applyHex(): void {
  const input = hexInput.value?.value ?? ''
  if (!setDraft(input)) {
    hexError.value = 'Invalid HEX colour'
    return
  }
  commit()
}

function gridKeydown(event: KeyboardEvent, index: number): void {
  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -8,
    ArrowDown: 8,
  }
  if (!(event.key in moves) && event.key !== 'Home' && event.key !== 'End')
    return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? palette.value.length - 1
        : Math.max(
            0,
            Math.min(palette.value.length - 1, index + moves[event.key]!),
          )
  ;(popover.value ?? document)
    .querySelector<HTMLElement>(`[data-color-palette-index="${next}"]`)
    ?.focus()
}

function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  close()
}

function requestEyedropper(): void {
  close()
  emit('eyedropper')
}
</script>

<template>
  <div class="cs-ui-color-picker">
    <div class="cs-color-quick" :aria-label="ariaLabel">
      <button
        v-for="color in quickColors"
        :key="color"
        class="cs-color-swatch"
        :class="{ 'is-active': color === draft }"
        type="button"
        :style="{ backgroundColor: color }"
        :aria-label="`${ariaLabel}: ${color}`"
        :disabled="disabled"
        @click="choose(color)"
      />
      <NPopover
        v-model:show="shown"
        trigger="click"
        placement="top-start"
        :show-arrow="false"
        to=".cs-overlay-root"
        @update:show="onShown"
      >
        <template #trigger>
          <NButton
            ref="trigger"
            class="cs-color-more"
            quaternary
            circle
            :disabled="disabled"
            :aria-label="ariaLabel"
            :aria-expanded="shown"
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">+</span>
          </NButton>
        </template>
        <section
          class="cs-color-popover"
          role="dialog"
          :aria-label="ariaLabel"
          @keydown="keydown"
        >
          <header class="cs-color-head">
            <span
              class="cs-color-current"
              :style="{ backgroundColor: draft }"
              aria-hidden="true"
            />
            <strong>{{ locale === 'ru' ? 'Цвет' : 'Colour' }}</strong>
            <NButton
              quaternary
              circle
              size="small"
              :aria-label="
                locale === 'ru' ? 'Закрыть палитру' : 'Close colour palette'
              "
              @click="close"
              ><UiIcon name="close"
            /></NButton>
          </header>
          <div class="cs-color-editor">
            <div
              class="cs-color-grid"
              role="listbox"
              :aria-label="
                locale === 'ru' ? 'Готовые оттенки' : 'Colour swatches'
              "
            >
              <button
                v-for="(color, index) in palette"
                :key="`${color.red}:${color.green}:${color.blue}`"
                class="cs-color-tile"
                :class="{ 'is-active': srgbToHex(color) === draft }"
                :data-color-palette-index="index"
                type="button"
                role="option"
                :aria-selected="srgbToHex(color) === draft"
                :tabindex="srgbToHex(color) === draft ? 0 : -1"
                :style="{ backgroundColor: srgbToHex(color) }"
                :aria-label="`${locale === 'ru' ? 'Выбрать' : 'Choose'} ${srgbToHex(color)}`"
                @click="choose(srgbToHex(color))"
                @keydown="gridKeydown($event, index)"
              />
            </div>
            <label class="cs-color-hue"
              ><span
                class="cs-color-current cs-color-current-small"
                :style="{ backgroundColor: draft }"
                aria-hidden="true" /><input
                type="range"
                min="0"
                max="360"
                :value="Math.round(hue || preservedHue)"
                :aria-label="locale === 'ru' ? 'Оттенок' : 'Hue'"
                :disabled="disabled"
                @pointerdown="hueDragging = true"
                @input="onHueInput"
                @change="onHueChange"
            /></label>
            <div class="cs-color-value-row">
              <label class="cs-color-hex" :class="{ 'is-invalid': hexError }"
                ><span>HEX</span
                ><input
                  ref="hexInput"
                  :value="draft"
                  maxlength="7"
                  spellcheck="false"
                  :aria-label="
                    locale === 'ru' ? 'HEX-код цвета' : 'HEX colour code'
                  "
                  :aria-invalid="Boolean(hexError)"
                  @change="applyHex"
                  @keydown.enter.prevent="applyHex"
              /></label>
              <NTooltip v-if="eyedropper"
                ><template #trigger
                  ><NButton
                    class="cs-color-eyedropper"
                    quaternary
                    :disabled="disabled"
                    :aria-label="
                      locale === 'ru'
                        ? 'Взять цвет со снимка'
                        : 'Sample colour from canvas'
                    "
                    @click="requestEyedropper"
                    ><UiIcon name="eyedropper" /></NButton></template
                >{{ locale === 'ru' ? 'Пипетка' : 'Eyedropper' }}</NTooltip
              >
            </div>
            <p v-if="hexError" class="cs-color-error" role="alert">
              {{
                locale === 'ru'
                  ? 'Введите HEX в формате #D14B7C'
                  : 'Enter HEX in the #D14B7C format'
              }}
            </p>
          </div>
          <section class="cs-color-section">
            <div class="cs-color-section-title">
              <span>{{ locale === 'ru' ? 'Недавние' : 'Recent' }}</span
              ><small>{{ recent.length }} / 2</small>
            </div>
            <div v-if="recent.length" class="cs-color-recent">
              <button
                v-for="(color, index) in recent"
                :key="srgbToHex(color)"
                type="button"
                class="cs-color-recent-item"
                :class="{ 'is-active': srgbToHex(color) === draft }"
                :aria-label="`${index === 0 ? (locale === 'ru' ? 'Последний' : 'Latest') : locale === 'ru' ? 'Предыдущий' : 'Previous'} ${locale === 'ru' ? 'цвет' : 'colour'} ${srgbToHex(color)}`"
                @click="choose(srgbToHex(color))"
              >
                <span
                  :style="{ backgroundColor: srgbToHex(color) }"
                /><strong>{{ srgbToHex(color) }}</strong>
              </button>
            </div>
            <p v-else class="cs-color-empty">
              {{
                locale === 'ru'
                  ? 'Пока нет выбранных цветов'
                  : 'No recent colours yet'
              }}
            </p>
          </section>
          <section class="cs-color-section">
            <div class="cs-color-section-title">
              <span
                ><UiIcon name="sparkles" />{{
                  locale === 'ru' ? 'Предлагаемые' : 'Suggested'
                }}</span
              >
            </div>
            <div class="cs-color-suggestions">
              <NTooltip v-for="suggestion in suggestions" :key="suggestion.id"
                ><template #trigger
                  ><button
                    class="cs-color-suggestion"
                    type="button"
                    :aria-label="`${suggestion.id}: ${srgbToHex(suggestion.color)}`"
                    @click="choose(srgbToHex(suggestion.color))"
                  >
                    <span
                      :style="{ backgroundColor: srgbToHex(suggestion.color) }"
                    /><strong>{{
                      suggestion.id === 'contrast'
                        ? locale === 'ru'
                          ? 'Контраст'
                          : 'Contrast'
                        : suggestion.id === 'complementary'
                          ? locale === 'ru'
                            ? 'Комплем.'
                            : 'Complement'
                          : locale === 'ru'
                            ? 'Аналог.'
                            : 'Analogous'
                    }}</strong>
                  </button></template
                >{{
                  suggestion.id === 'contrast'
                    ? `${locale === 'ru' ? 'Контраст' : 'Contrast'} ${suggestion.contrastRatio?.toFixed(1)} : 1`
                    : srgbToHex(suggestion.color)
                }}</NTooltip
              >
            </div>
          </section>
        </section>
      </NPopover>
    </div>
  </div>
</template>
