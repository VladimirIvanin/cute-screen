<script setup lang="ts">
import { computed } from 'vue'
import {
  resolveBrandingYear,
  type CardBranding,
  type CardColor as Color,
} from '@cute-screen/editor-renderer'
import { TEXT_FONT_FAMILIES } from '../../text-fonts'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import { parseHexColor } from '../tools/effects/color'
import CardNumber from './CardNumber.vue'

const props = defineProps<{ value: CardBranding; locale: 'ru' | 'en'; disabled: boolean; canImport: boolean }>()
const emit = defineEmits<{ change: [value: CardBranding]; preview: [value: CardBranding]; cancel: []; import: [] }>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function patch<K extends keyof CardBranding>(
  key: K,
  value: CardBranding[K],
  preview = false,
): void {
  if (preview) emit('preview', { ...props.value, [key]: value })
  else emit('change', { ...props.value, [key]: value })
}
function changeText(template: string): void {
  emit('change', resolveBrandingYear({ ...props.value, template }, new Date().getFullYear()))
}
function hex(color: Color): string {
  return '#' + [color.red, color.green, color.blue].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')
}
function color(
  key: 'color' | 'backplate',
  value: string,
): void {
  const parsed = parseHexColor(value)
  if (parsed) patch(key, { ...parsed, alpha: props.value[key]?.alpha ?? 1 })
}
const anchors = computed(() => {
  const x = [text('слева', 'left'), text('по центру', 'center'), text('справа', 'right')]
  const y = [text('Сверху', 'Top'), text('Посередине', 'Middle'), text('Снизу', 'Bottom')]
  return Array.from({ length: 9 }, (_, index) => `${y[Math.floor(index / 3)]}, ${x[index % 3]}`)
})
</script>
<template>
  <div class="cs-brand-editor">
    <label class="cs-brand-text"><span>{{ text('Текст подписи', 'Signature text') }}</span><textarea
      rows="2"
      maxlength="16384"
      :placeholder="text('© Ваш канал или источник', '© Your channel or source')"
      :value="value.template"
      @change="changeText(($event.target as HTMLTextAreaElement).value)"
    /></label>
    <div class="cs-brand-year">
      <span>{{ text('{year} — текущий год', '{year} — current year') }}</span><button
        v-if="value.template.includes('{year}')"
        type="button"
        @click="changeText(value.template)"
      >
        {{ text('Обновить год', 'Refresh year') }}
      </button>
    </div>
    <div class="cs-brand-font-row">
      <label class="cs-brand-font">{{ text('Шрифт', 'Font') }}<select :value="value.fontFamily" @change="patch('fontFamily', ($event.target as HTMLSelectElement).value)"><option v-for="font in TEXT_FONT_FAMILIES" :key="font">{{ font }}</option></select></label>
      <CardNumber
        :label="text('Размер', 'Size')"
        :value="value.fontSize"
        :min="6"
        :max="512"
        @change="patch('fontSize', $event)"
        @preview="patch('fontSize', $event, true)"
        @cancel="emit('cancel')"
      />
    </div>
    <div
      class="cs-brand-colour"
      role="group"
      :aria-label="text('Цвет текста', 'Text color')"
    >
      <span>{{ text('Цвет текста', 'Text color') }}</span><SimpleColorPicker
        :model-value="hex(value.color)"
        v-bind="{ ariaLabel: text('Цвет текста', 'Text color') }"
        :locale="locale"
        :disabled="disabled"
        :eyedropper="false"
        embedded
        compact
        @commit="color('color', $event)"
      />
    </div>
    <div
      class="cs-brand-text-align"
      role="group"
      :aria-label="text('Выравнивание текста', 'Text alignment')"
    >
      <button
        v-for="item in [{ value: 'start', icon: 'alignLeft', ru: 'Слева', en: 'Left' }, { value: 'center', icon: 'alignCenter', ru: 'По центру', en: 'Center' }, { value: 'end', icon: 'alignRight', ru: 'Справа', en: 'Right' }] as const"
        :key="item.value"
        type="button"
        :aria-label="text(item.ru, item.en)"
        :title="text(item.ru, item.en)"
        :aria-pressed="value.textAlignment === item.value"
        @click="patch('textAlignment', item.value)"
      >
        <UiIcon :name="item.icon" />
      </button>
    </div>
    <section class="cs-brand-group" :aria-label="text('Размещение подписи', 'Signature placement')">
      <h4>{{ text('Размещение', 'Placement') }}</h4>
      <label>{{ text('Область', 'Region') }}<select :value="value.region" @change="patch('region', ($event.target as HTMLSelectElement).value as CardBranding['region'])"><option
        v-for="(label, region) in { content: text('На снимке', 'On screenshot'), card: text('На карточке', 'On card'), header: text('Верхняя полоса', 'Header'), footer: text('Нижняя полоса', 'Footer') }"
        :key="region"
        :value="region"
      >{{ label }}</option></select></label>
      <div class="cs-brand-position">
        <div
          class="cs-card-alignment"
          role="group"
          :aria-label="text('Привязка подписи', 'Signature anchor')"
        >
          <button
            v-for="n in 9"
            :key="n"
            type="button"
            :aria-label="`${text('Привязка подписи', 'Signature anchor')} ${n}`"
            :title="anchors[n - 1]"
            :aria-pressed="value.alignment.x === (n - 1) % 3 / 2 && value.alignment.y === Math.floor((n - 1) / 3) / 2"
            @click="patch('alignment', { x: (n - 1) % 3 / 2, y: Math.floor((n - 1) / 3) / 2 })"
          >
            •
          </button>
        </div>
        <div>
          <CardNumber
            v-for="axis in ['x', 'y'] as const"
            :key="axis"
            :label="axis.toUpperCase()"
            :value="value.offset[axis]"
            @change="patch('offset', { ...value.offset, [axis]: $event })"
            @preview="patch('offset', { ...value.offset, [axis]: $event }, true)"
            @cancel="emit('cancel')"
          /><CardNumber
            :label="text('Отступ', 'Inset')"
            :value="value.padding"
            :min="0"
            :max="4096"
            @change="patch('padding', $event)"
            @preview="patch('padding', $event, true)"
            @cancel="emit('cancel')"
          />
        </div>
      </div>
    </section>
    <section class="cs-brand-group" :aria-label="text('Видимость подписи', 'Signature visibility')">
      <h4>{{ text('Видимость', 'Visibility') }}</h4>
      <CardNumber
        :label="text('Подпись %', 'Signature %')"
        :value="Math.round(value.opacity * 100)"
        :min="0"
        :max="100"
        @change="patch('opacity', $event / 100)"
        @preview="patch('opacity', $event / 100, true)"
        @cancel="emit('cancel')"
      />
      <CardNumber
        :label="text('Текст %', 'Text %')"
        :value="Math.round(value.color.alpha * 100)"
        :min="0"
        :max="100"
        @change="patch('color', { ...value.color, alpha: $event / 100 })"
        @preview="patch('color', { ...value.color, alpha: $event / 100 }, true)"
        @cancel="emit('cancel')"
      />
      <label class="cs-brand-backplate-toggle"><input
        type="checkbox"
        :checked="Boolean(value.backplate)"
        @change="patch('backplate', ($event.target as HTMLInputElement).checked ? { red: 0, green: 0, blue: 0, alpha: 0.65 } : null)"
      />{{ text('Контрастная подложка', 'Contrast backplate') }}</label>
      <template v-if="value.backplate">
        <div class="cs-brand-backplate-colour">
          <span>{{ text('Цвет подложки', 'Backplate color') }}</span><SimpleColorPicker
            :model-value="hex(value.backplate)"
            v-bind="{ ariaLabel: text('Цвет подложки', 'Backplate color') }"
            :locale="locale"
            :disabled="disabled"
            :eyedropper="false"
            compact
            @commit="color('backplate', $event)"
          />
        </div>
        <CardNumber
          :label="text('Подложка %', 'Backplate %')"
          :value="Math.round(value.backplate.alpha * 100)"
          :min="0"
          :max="100"
          @change="patch('backplate', { ...value.backplate!, alpha: $event / 100 })"
          @preview="patch('backplate', { ...value.backplate!, alpha: $event / 100 }, true)"
          @cancel="emit('cancel')"
        />
      </template>
    </section>
    <section class="cs-brand-group" :aria-label="text('Логотип подписи', 'Signature logo')">
      <h4>{{ text('Логотип', 'Logo') }}</h4>
      <button
        type="button"
        :disabled="disabled || !canImport"
        @click="emit('import')"
      >
        <UiIcon name="image" />{{ value.image ? text('Заменить логотип', 'Replace logo') : text('Загрузить логотип', 'Import logo') }}
      </button>
      <template v-if="value.image">
        <CardNumber
          :label="text('Размер логотипа', 'Logo size')"
          :value="value.imageSize"
          :min="1"
          :max="4096"
          @change="patch('imageSize', $event)"
          @preview="patch('imageSize', $event, true)"
          @cancel="emit('cancel')"
        /><button type="button" @click="patch('image', null)">{{ text('Убрать логотип', 'Remove logo') }}</button>
      </template>
    </section>
  </div>
</template>
