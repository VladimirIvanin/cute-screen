<script setup lang="ts">
import { ref } from 'vue'
import {
  createComposition,
  type CompositionSettings,
  type CardBackground as Background,
  type CompositionStart,
} from '@cute-screen/editor-renderer'
import type { MaterialRecord } from '../../materials'
import CardLayout from './CardLayout.vue'
import CardBackground from './CardBackground.vue'
import CardFrame from './CardFrame.vue'
import CardBranding from './CardBranding.vue'
import CardNumber from './CardNumber.vue'
const props = defineProps<{ value?: CompositionSettings | undefined; locale: 'ru' | 'en'; disabled: boolean; materials: readonly MaterialRecord[]; pending: boolean; error: string; canImport: boolean; canSave: boolean; editing: boolean; target: 'background' | 'header' | 'footer'; selectedBrand?: string | undefined }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: []; close: []; layers: []; edit: [target: 'background' | 'header' | 'footer']; import: [kind: 'background' | 'logo', target?: 'background' | 'header' | 'footer']; save: [kind: 'preset' | 'gradient', title: string]; remove: [id: string]; apply: [record: MaterialRecord]; retry: []; selectBrand: [id: string] }>()
const title = ref(''), removeId = ref<string>()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
function start(kind: CompositionStart): void {
  emit('change', createComposition(kind))
}
function background(
  target: 'background' | 'header' | 'footer',
  fill: Background,
  preview = false,
): void {
  if (!props.value) return
  const value = target === 'background' ? { ...props.value, background: fill } : { ...props.value, [target]: { ...props.value[target], fill } }
  if (preview) emit('preview', value)
  else emit('change', value)
}
</script>
<template>
  <aside
    class="cs-composition-panel"
    :aria-label="text('Оформление', 'Appearance')"
    @keydown.esc.stop="editing ? emit('edit', target) : emit('close')"
  >
    <header>
      <strong>{{ text('Оформление', 'Appearance') }}</strong><button type="button" @click="emit('layers')">{{ text('Слои', 'Layers') }}</button><button
        type="button"
        :aria-label="text('Закрыть оформление', 'Close appearance')"
        @click="emit('close')"
      >
        ×
      </button>
    </header>
    <div class="cs-composition-body">
      <p v-if="disabled && !value">{{ text('Откройте изображение для оформления.', 'Open an image to start.') }}</p>
      <p v-if="pending" role="status">{{ text('Сохранение материала…', 'Saving material…') }}</p>
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="emit('retry')">{{ text('Повторить', 'Retry') }}</button></p>
      <details open>
        <summary>{{ text('Пресеты', 'Presets') }}</summary>
        <div class="cs-card-buttons">
          <button
            v-for="(label, kind) in { padding: text('Поля вокруг', 'Padding'), browser: text('Браузер', 'Browser'), phone: text('Телефон', 'Phone') }"
            :key="kind"
            type="button"
            :disabled="disabled"
            @click="start(kind)"
          >
            {{ label }}
          </button>
        </div>
        <template v-if="value">
          <label>{{ text('Название пресета', 'Preset name') }}<input
            class="cs-card-input"
            v-model="title"
            :disabled="disabled"
            maxlength="128"
          /></label>
          <div class="cs-card-buttons">
            <button
              type="button"
              :disabled="disabled || !canSave || !title.trim()"
              @click="emit('save', 'preset', title)"
            >
              {{ text('Сохранить стиль', 'Save style') }}
            </button><button
              type="button"
              :disabled="disabled || !canSave || !title.trim()"
              @click="emit('save', 'gradient', title)"
            >
              {{ text('Сохранить фон', 'Save background') }}
            </button>
          </div>
        </template>
        <p v-if="!canSave">{{ text('Постоянные материалы доступны в приложении.', 'Permanent materials are available in the desktop app.') }}</p>
        <p v-if="!materials.length">{{ text('Ваши фоны и пресеты появятся здесь.', 'Your backgrounds and presets appear here.') }}</p>
        <p v-else>{{ text('Материалы не удаляются при очистке истории.', 'Materials survive history cleanup.') }} {{ text('Записей:', 'Items:') }} {{ materials.length }}</p>
        <div
          v-for="item in materials"
          :key="item.id"
          class="cs-card-material"
        >
          <button
            type="button"
            :disabled="disabled"
            @click="emit('apply', item)"
          >
            {{ item.title }} · {{ ({ preset: text('Стиль', 'Style'), gradient: text('Фон', 'Background'), background: text('Картинка', 'Image'), logo: text('Логотип', 'Logo') })[item.kind] }}
          </button><button
            type="button"
            :disabled="disabled"
            :aria-label="`${text('Удалить материал', 'Remove material')} ${item.title}`"
            @click="removeId = item.id"
          >
            ×
          </button>
        </div>
        <div
          v-if="removeId"
          role="group"
          :aria-label="text('Удаление материала', 'Remove material')"
        >
          <p>{{ text('Убрать из материалов? Документы сохранят свои ресурсы.', 'Remove from materials? Documents keep their resources.') }}</p><button type="button" @click="emit('remove', removeId!); removeId = undefined">{{ text('Удалить', 'Remove') }}</button><button type="button" @click="removeId = undefined">{{ text('Отмена', 'Cancel') }}</button>
        </div>
      </details>
      <template v-if="value">
        <details open>
          <summary>{{ text('Макет', 'Layout') }}</summary><CardLayout
            :value="value"
            :locale="locale"
            :disabled="disabled"
            @change="emit('change', $event)"
            @preview="emit('preview', $event)"
            @cancel="emit('cancel')"
          />
        </details>
        <details open>
          <summary>{{ text('Фон', 'Background') }}</summary><CardBackground
            :value="value.background"
            :locale="locale"
            :disabled="disabled"
            :can-import="canImport"
            :editing="editing && target === 'background'"
            @change="background('background', $event)"
            @preview="background('background', $event, true)"
            @cancel="emit('cancel')"
            @edit="emit('edit', 'background')"
            @import="emit('import', 'background')"
          />
        </details>
        <details v-for="band in ['header', 'footer'] as const" :key="band">
          <summary>{{ band === 'header' ? text('Верхняя полоса', 'Header strip') : text('Нижняя полоса', 'Footer strip') }}</summary>
          <CardNumber
            :label="text('Высота полосы', 'Strip height')"
            :value="value[band].height"
            :min="0"
            :max="8192"
            :disabled="disabled"
            @change="emit('change', { ...value, [band]: { ...value[band], height: $event } })"
          />
          <CardBackground
            :value="value[band].fill"
            :locale="locale"
            :disabled="disabled"
            :can-import="canImport"
            :editing="editing && target === band"
            @change="background(band, $event)"
            @preview="background(band, $event, true)"
            @cancel="emit('cancel')"
            @edit="emit('edit', band)"
            @import="emit('import', 'background', band)"
          />
        </details>
        <details>
          <summary>{{ text('Рамка', 'Frame') }}</summary><CardFrame
            :value="value.frame"
            :locale="locale"
            :disabled="disabled"
            @change="emit('change', { ...value, frame: $event })"
          />
        </details>
        <details>
          <summary>{{ text('Подписи', 'Signatures') }}</summary><CardBranding
            :value="value.branding"
            :locale="locale"
            :disabled="disabled"
            :can-import="canImport"
            :selected="selectedBrand"
            @change="emit('change', { ...value, branding: $event })"
            @select="emit('selectBrand', $event)"
            @import="emit('import', 'logo')"
          />
        </details>
      </template>
    </div>
  </aside>
</template>
