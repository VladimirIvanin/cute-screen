<script setup lang="ts">
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
import CardShadow from './CardShadow.vue'
import NumericControl from '../ui/NumericControl.vue'
const props = defineProps<{ value: CompositionSettings; locale: 'ru' | 'en'; disabled: boolean }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function layout(
  key: string,
  value: unknown,
  preview = false,
): void {
  const next = { ...props.value, layout: { ...props.value.layout, [key]: value } }
  if (preview) emit('preview', next)
  else emit('change', next)
}
function inset(
  side: string,
  value: number,
  preview = false,
): void {
  const current = props.value.layout.insets
  const sides = current.linked ? { top: value, right: value, bottom: value, left: value } : { [side]: value }
  layout('insets', { ...current, ...sides }, preview)
}
function linkInsets(): void {
  const current = props.value.layout.insets
  const linked = !current.linked
  layout('insets', { ...current, linked,
    ...(linked ? { right: current.top, bottom: current.top, left: current.top } : {}) })
}
function ratio(value: string): void {
  const [a, b] = value.split(':').map(Number)
  layout('height', Math.round(props.value.layout.width * b! / a!))
}
</script>
<template>
  <fieldset class="cs-card-layout" :disabled="disabled">
    <slot name="background" />
    <div class="cs-card-layout-group">
      <label>{{ text('Размер холста', 'Canvas size') }}<select :value="value.layout.mode" @change="layout('mode', ($event.target as HTMLSelectElement).value)"><option value="auto">{{ text('По содержимому', 'Fit content') }}</option><option value="fixed">{{ text('Заданный размер', 'Fixed size') }}</option></select></label>
      <template v-if="value.layout.mode === 'fixed'">
        <div class="cs-card-field-pair">
          <CardNumber
            v-for="key in ['width', 'height'] as const"
            :key="key"
            :label="key === 'width' ? text('Ширина', 'Width') : text('Высота', 'Height')"
            :value="value.layout[key]"
            :min="1"
            :max="32768"
            @change="layout(key, $event)"
            @preview="layout(key, $event, true)"
            @cancel="emit('cancel')"
          />
        </div>
        <label>{{ text('Пропорции', 'Aspect ratio') }}<select value="" @change="ratio(($event.target as HTMLSelectElement).value)"><option value="" disabled>{{ text('Выбрать', 'Choose') }}</option><option v-for="r in ['1:1', '4:5', '9:16', '16:9', '1.91:1']" :key="r">{{ r }}</option></select></label>
      </template>
      <div class="cs-card-row-heading">
        <span>{{ text('Поля вокруг снимка', 'Screenshot padding') }}</span>
        <div class="cs-card-inset-actions">
          <div
            class="cs-card-inset-units"
            role="group"
            :aria-label="text('Единицы полей', 'Inset units')"
          >
            <button
              v-for="unit in ['percent', 'px'] as const"
              :key="unit"
              type="button"
              :aria-pressed="value.layout.insets.unit === unit"
              @click="layout('insets', { ...value.layout.insets, unit })"
            >
              {{ unit === 'percent' ? '%' : 'px' }}
            </button>
          </div>
          <button
            type="button"
            :aria-label="text('Связать поля', 'Link insets')"
            :title="text('Одинаковые поля со всех сторон', 'Equal padding on all sides')"
            :aria-pressed="value.layout.insets.linked"
            @click="linkInsets"
          >
            {{ text('Все', 'All') }}
          </button>
        </div>
      </div>
      <NumericControl
        v-if="value.layout.insets.linked"
        class="cs-card-linked-inset"
        :label="text('Все стороны', 'All sides')"
        :value="value.layout.insets.top"
        :min="0"
        :max="value.layout.insets.unit === 'px' ? 8192 : 200"
        :step="1"
        :unit="value.layout.insets.unit === 'px' ? 'px' : '%'"
        :slider="true"
        :locale="locale"
        :disabled="disabled"
        @commit="inset('top', $event)"
        @preview="inset('top', $event, true)"
        @cancel="emit('cancel')"
      />
      <div v-else class="cs-card-field-pair">
        <CardNumber
          v-for="(label, side) in { top: text('Сверху', 'Top'), right: text('Справа', 'Right'), bottom: text('Снизу', 'Bottom'), left: text('Слева', 'Left') }"
          :key="side"
          :label="label"
          :value="value.layout.insets[side]"
          :min="0"
          :max="value.layout.insets.unit === 'px' ? 8192 : 200"
          @change="inset(side, $event)"
          @preview="inset(side, $event, true)"
          @cancel="emit('cancel')"
        />
      </div>
    </div>
    <div class="cs-card-layout-group">
      <div class="cs-card-field-pair">
        <CardNumber
          :label="text('Масштаб %', 'Scale %')"
          :value="Math.round(value.layout.scale * 100)"
          :min="1"
          :max="1600"
          @change="layout('scale', $event / 100)"
          @preview="layout('scale', $event / 100, true)"
          @cancel="emit('cancel')"
        />
        <CardNumber
          :label="text('Скругление', 'Corners')"
          :value="value.radius"
          :min="0"
          :max="4096"
          @change="emit('change', { ...value, radius: $event })"
          @preview="emit('preview', { ...value, radius: $event })"
          @cancel="emit('cancel')"
        />
      </div>
      <details class="cs-card-position-details">
        <summary>{{ text('Положение снимка', 'Screenshot position') }}</summary>
        <div class="cs-card-position">
          <div
            class="cs-card-alignment"
            role="group"
            :aria-label="text('Выравнивание', 'Alignment')"
          >
            <button
              v-for="n in 9"
              :key="n"
              type="button"
              :aria-label="`${[text('Сверху', 'Top'), text('По центру', 'Center'), text('Снизу', 'Bottom')][Math.floor((n - 1) / 3)]} · ${[text('Слева', 'Left'), text('По центру', 'Center'), text('Справа', 'Right')][(n - 1) % 3]}`"
              :aria-pressed="
                value.layout.alignment.x === (n - 1) % 3 / 2 &&
                  value.layout.alignment.y === Math.floor((n - 1) / 3) / 2
              "
              @click="layout('alignment', { x: (n - 1) % 3 / 2, y: Math.floor((n - 1) / 3) / 2 })"
            >
              <span aria-hidden="true">•</span>
            </button>
          </div>
          <div>
            <CardNumber
              v-for="axis in ['x', 'y'] as const"
              :key="axis"
              :label="`${text('Смещение', 'Offset')} ${axis.toUpperCase()}`"
              :value="value.layout.offset[axis]"
              @change="layout('offset', { ...value.layout.offset, [axis]: $event })"
              @preview="layout('offset', { ...value.layout.offset, [axis]: $event }, true)"
              @cancel="emit('cancel')"
            />
          </div>
        </div>
      </details>
    </div>
    <CardShadow
      :value="value"
      :locale="locale"
      :disabled="disabled"
      @change="emit('change', $event)"
      @preview="emit('preview', $event)"
      @cancel="emit('cancel')"
    />
  </fieldset>
</template>
