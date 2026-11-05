<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import NumericControl from '../ui/NumericControl.vue'
import { UiIcon } from '../icon'

type Insets = CompositionSettings['layout']['insets']
type Side = 'top' | 'right' | 'bottom' | 'left'
const props = defineProps<{ value: Insets; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: Insets]; preview: [value: Insets]; cancel: [] }>()
const selected = ref<Side>('top')
const transient = shallowRef<Insets>()
const number = ref<HTMLElement>()
const shown = computed(() => transient.value ?? props.value)
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const sides = computed(() => [
  { id: 'top', label: text('Сверху', 'Top') },
  { id: 'left', label: text('Слева', 'Left') },
  { id: 'right', label: text('Справа', 'Right') },
  { id: 'bottom', label: text('Снизу', 'Bottom') },
] as const)
const unit = computed(() => props.value.unit === 'px' ? 'px' : '%')
const label = computed(() => props.value.linked ? text('Все стороны', 'All sides')
  : sides.value.find((side) => side.id === selected.value)!.label)
watch(() => props.value, () => {
  transient.value = undefined
})
function cancel(): void {
  transient.value = undefined
  emit('cancel')
}
function edit(
  value: number,
  preview = false,
): void {
  const current = props.value
  const updated = { ...current, ...(current.linked ? { top: value, right: value, bottom: value, left: value }
    : { [selected.value]: value }) }
  transient.value = preview ? updated : undefined
  if (preview) emit('preview', updated)
  else emit('change', updated)
}
async function choose(side: Side): Promise<void> {
  cancel()
  selected.value = side
  await nextTick()
  const input = number.value?.querySelector('input')
  input?.focus()
  input?.select()
}
function link(): void {
  cancel()
  const current = props.value
  const linked = !current.linked
  emit('change', { ...current, linked,
    ...(linked ? { right: current.top, bottom: current.top, left: current.top } : {}) })
}
function changeUnit(unit: Insets['unit']): void {
  if (unit === props.value.unit) return
  cancel()
  emit('change', { ...props.value, unit })
}
</script>
<template>
  <section
    class="cs-card-insets"
    :class="{ 'is-linked': value.linked }"
    :aria-label="text('Поля вокруг снимка', 'Screenshot padding')"
  >
    <div class="cs-card-row-heading">
      <span>{{ text('Поля', 'Padding') }}</span>
      <div
        class="cs-card-inset-units"
        role="group"
        :aria-label="text('Единицы полей', 'Inset units')"
      >
        <button
          v-for="option in ['percent', 'px'] as const"
          :key="option"
          type="button"
          :disabled="disabled"
          :aria-pressed="value.unit === option"
          :title="option === 'percent' ? text('% от короткой стороны снимка', '% of the screenshot’s shorter side') : text('Пиксели', 'Pixels')"
          @click="changeUnit(option)"
        >
          {{ option === 'percent' ? '%' : 'px' }}
        </button>
      </div>
    </div>
    <div
      class="cs-inset-diagram"
      role="group"
      :aria-label="text('Выбор стороны поля', 'Choose padding side')"
    >
      <button
        v-for="side in sides"
        :key="side.id"
        type="button"
        class="cs-inset-side"
        :data-inset-side="side.id"
        :disabled="disabled"
        :aria-pressed="value.linked || selected === side.id"
        :aria-label="`${side.label}: ${shown[side.id]} ${unit}`"
        :title="side.label"
        @click="choose(side.id)"
      >
        <strong>{{ shown[side.id] }}</strong>
      </button>
      <div class="cs-inset-center">
        <span
          v-for="side in sides"
          :key="side.id"
          class="cs-inset-band"
          aria-hidden="true"
          :data-side="side.id"
          :class="{ 'is-active': value.linked || selected === side.id }"
        />
        <button
          class="cs-inset-link"
          data-inset-link
          type="button"
          :aria-pressed="value.linked"
          :aria-label="text('Одинаковые со всех сторон', 'Equal padding on all sides')"
          :disabled="disabled"
          :title="value.linked
            ? text('Настроить каждую сторону отдельно', 'Adjust each side separately')
            : text('Сделать поля одинаковыми со всех сторон', 'Use equal padding on all sides')"
          @click="link"
        >
          <UiIcon :name="value.linked ? 'link' : 'unlink'" />
        </button>
      </div>
    </div>
    <div ref="number">
      <NumericControl
        :key="value.linked ? 'all' : selected"
        class="cs-card-linked-inset"
        :label="label"
        :value="value[value.linked ? 'top' : selected]"
        :min="0"
        :max="value.unit === 'px' ? 8192 : 200"
        :step="1"
        :unit="unit"
        :slider="true"
        :locale="locale"
        :disabled="disabled"
        @commit="edit"
        @preview="edit($event, true)"
        @cancel="cancel"
      />
    </div>
  </section>
</template>
