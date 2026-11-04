<script setup lang="ts">
import type { CompositionSettings } from '@cute-screen/editor-renderer'
import CardNumber from './CardNumber.vue'
import CardInsets from './CardInsets.vue'
import CardScreenshotStyle from './CardScreenshotStyle.vue'
import CardCanvasSize from './CardCanvasSize.vue'
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
</script>
<template>
  <fieldset class="cs-card-layout" :disabled="disabled">
    <slot name="background" />
    <div class="cs-card-layout-group">
      <CardCanvasSize
        :value="value.layout"
        :locale="locale"
        :disabled="disabled"
        @change="emit('change', { ...value, layout: $event })"
        @preview="emit('preview', { ...value, layout: $event })"
        @cancel="emit('cancel')"
      />
      <CardInsets
        :value="value.layout.insets"
        :locale="locale"
        :disabled="disabled"
        @change="layout('insets', $event)"
        @preview="layout('insets', $event, true)"
        @cancel="emit('cancel')"
      />
    </div>
    <div class="cs-card-layout-group">
      <CardScreenshotStyle
        :value="value"
        :locale="locale"
        :disabled="disabled"
        @change="emit('change', $event)"
        @preview="emit('preview', $event)"
        @cancel="emit('cancel')"
      />
      <section class="cs-card-position-group">
        <h3 class="cs-composition-section-heading">{{ text('Положение снимка', 'Screenshot position') }}</h3>
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
      </section>
    </div>
  </fieldset>
</template>
