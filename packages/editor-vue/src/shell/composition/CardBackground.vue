<script setup lang="ts">
import { computed } from 'vue'
import type { CardBackground } from '@cute-screen/editor-renderer'
import { UiIcon } from '../icon'
import CardColor from './CardColor.vue'
import CardNumber from './CardNumber.vue'
import CardGradient from './CardGradient.vue'
import CardImagePreview from './CardImagePreview.vue'
const props = defineProps<{ value: CardBackground; locale: 'ru' | 'en'; disabled: boolean; editing: boolean; canImport: boolean }>()
const emit = defineEmits<{
  change: [value: CardBackground]
  preview: [value: CardBackground]
  cancel: []
  edit: []
  import: []
}>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const fills = computed(() => ({
  transparent: text('Прозрачный', 'Transparent'),
  solid: text('Цвет', 'Color'),
  linear: text('Линейный', 'Linear'),
  radial: text('Радиальный', 'Radial'),
  freeform: text('Свободный', 'Freeform'),
  image: text('Картинка', 'Image'),
  blurred: text('Размытый снимок', 'Blurred content'),
}))
</script>
<template>
  <fieldset :disabled="disabled">
    <div class="cs-card-fill-heading">
      <span>{{ text('Заливка', 'Fill') }}</span><span>{{ fills[value.kind] }}</span>
    </div>
    <div
      class="cs-card-fill-types"
      role="group"
      :aria-label="text('Заливка', 'Fill')"
    >
      <button
        v-for="(label, kind) in fills"
        :key="kind"
        type="button"
        :data-card-fill="kind"
        :aria-label="label"
        :title="label"
        :aria-pressed="value.kind === kind"
        @click="value.kind !== kind && emit('change', { ...value, kind })"
      >
        <span
          class="cs-card-fill-icon"
          :class="`is-${kind}`"
          aria-hidden="true"
        >
          <UiIcon v-if="kind === 'image' || kind === 'blurred'" name="image" />
        </span>
      </button>
    </div>
    <CardColor
      v-if="value.kind === 'solid'"
      :value="value.color"
      :locale="locale"
      :disabled="disabled"
      :label="text('Цвет фона', 'Background color')"
      :opacity-label="text('Непрозрачность фона %', 'Background opacity %')"
      compact
      @change="emit('change', { ...value, color: $event })"
      @preview="emit('preview', { ...value, color: $event })"
      @cancel="emit('cancel')"
    />
    <CardGradient
      v-if="['linear', 'radial', 'freeform'].includes(value.kind)"
      :value="value"
      :locale="locale"
      :disabled="disabled"
      :editing="editing"
      @change="emit('change', $event)"
      @preview="emit('preview', $event)"
      @cancel="emit('cancel')"
      @edit="emit('edit')"
    />
    <template v-if="value.kind === 'image' || value.kind === 'blurred'">
      <div v-if="value.kind === 'image' && value.image" class="cs-card-image-source">
        <CardImagePreview :image="value.image" :locale="locale" />
        <div class="cs-card-image-info">
          <span>{{ value.image.width }} × {{ value.image.height }} · {{ value.image.format.toUpperCase() }}</span>
          <button
            type="button"
            :disabled="!canImport"
            @click="emit('import')"
          >
            {{ text('Заменить картинку', 'Replace image') }}
          </button>
        </div>
      </div>
      <button
        v-else-if="value.kind === 'image'"
        type="button"
        :disabled="!canImport"
        @click="emit('import')"
      >
        {{ text('Загрузить картинку', 'Import image') }}
      </button>
      <p v-if="value.kind === 'image' && !value.image">{{ text('Выберите фон из материалов или загрузите картинку', 'Choose a material or import an image') }}</p>
      <label>{{ text('Размещение фона', 'Background fit') }}<select :value="value.fit" @change="emit('change', { ...value, fit: ($event.target as HTMLSelectElement).value as 'cover' | 'contain' })"><option value="cover">{{ text('Заполнить', 'Cover') }}</option><option value="contain">{{ text('Вписать', 'Contain') }}</option></select></label>
      <CardNumber
        :label="text('Масштаб фона %', 'Background scale %')"
        :value="Math.round(value.scale * 100)"
        :min="1"
        :max="1600"
        @change="emit('change', { ...value, scale: $event / 100 })"
        @preview="emit('preview', { ...value, scale: $event / 100 })"
        @cancel="emit('cancel')"
      />
      <CardNumber
        v-for="axis in ['x', 'y'] as const"
        :key="axis"
        :label="`${text('Фон', 'Background')} ${axis.toUpperCase()}`"
        :value="value.offset[axis]"
        @change="emit('change', { ...value, offset: { ...value.offset, [axis]: $event } })"
        @preview="emit('preview', { ...value, offset: { ...value.offset, [axis]: $event } })"
        @cancel="emit('cancel')"
      />
      <CardNumber
        v-if="value.kind === 'blurred'"
        :label="text('Размытие', 'Blur')"
        :value="value.blur"
        :min="0"
        :max="128"
        @change="emit('change', { ...value, blur: $event })"
        @preview="emit('preview', { ...value, blur: $event })"
        @cancel="emit('cancel')"
      />
    </template>
  </fieldset>
</template>
