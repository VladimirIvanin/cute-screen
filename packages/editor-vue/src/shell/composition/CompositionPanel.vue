<script setup lang="ts">
import {
  computed,
  provide,
  ref,
  useId,
  watch,
} from 'vue'
import {
  createComposition,
  type CompositionSettings,
  type CardBackground as Background,
  type CompositionStart,
} from '@cute-screen/editor-renderer'
import type { MaterialRecord } from '../../materials'
import { numericContextKey } from '../ui/numeric-preview'
import { UiIcon } from '../icon'
import CardLayout from './CardLayout.vue'
import CardBackground from './CardBackground.vue'
import CardShadow from './CardShadow.vue'
import CardFrame from './CardFrame.vue'
import CardBranding from './CardBranding.vue'
import CardNumber from './CardNumber.vue'
import CardSavedItems from './CardSavedItems.vue'
import CardSaveButton from './CardSaveButton.vue'
import CardFramePreview from './CardFramePreview.vue'

type Section = 'layout' | 'background' | 'shadow' | 'frame' | 'bands' | 'branding' | 'templates'
const props = defineProps<{ active?: boolean; applied?: boolean; value?: CompositionSettings | undefined; locale: 'ru' | 'en'; disabled: boolean; materials: readonly MaterialRecord[]; pending: boolean; loading?: boolean; error: string; canImport: boolean; canSave: boolean; editing: boolean; target: 'background' | 'header' | 'footer'; selectedBrand?: string | undefined }>()
const emit = defineEmits<{ change: [value: CompositionSettings]; preview: [value: CompositionSettings]; cancel: []; reset: []; close: []; layers: []; edit: [target: 'background' | 'header' | 'footer']; import: [kind: 'background' | 'logo', target?: 'background' | 'header' | 'footer']; save: [kind: 'preset' | 'gradient', title: string]; remove: [id: string]; apply: [record: MaterialRecord]; retry: []; selectBrand: [id: string] }>()
const section = ref<Section>('layout')
const body = ref<HTMLElement>()
const panelId = useId()
const text = (ru: string, en: string) => props.locale === 'ru' ? ru : en
const sections = computed(() => [
  { id: 'layout', label: text('Размер и поля', 'Size and padding'), icon: 'placement' },
  { id: 'background', label: text('Фон', 'Background'), icon: 'palette' },
  { id: 'shadow', label: text('Тень', 'Shadow'), icon: 'shadow' },
  { id: 'frame', label: text('Рамка', 'Frame'), icon: 'browser' },
  { id: 'bands', label: text('Полосы', 'Strips'), icon: 'textBackground' },
  { id: 'branding', label: text('Текст и логотип', 'Text and logo'), icon: 'text' },
] as const)
const current = computed(() => section.value === 'templates'
  ? { label: text('Мои шаблоны', 'My templates') }
  : sections.value.find((item) => item.id === section.value)!)
const starters = computed(() => [
  { kind: 'padding', label: text('С полями', 'With padding') },
  { kind: 'browser', label: text('Браузер', 'Browser') },
  { kind: 'phone', label: text('Телефон', 'Phone') },
].map((item) => ({ ...item, frame: createComposition(item.kind as CompositionStart).frame })))
const templates = computed(() => props.materials.filter((item) => item.kind === 'preset'))
const backgrounds = computed(() => props.materials.filter((item) => item.kind === 'gradient' || item.kind === 'background'))
const logos = computed(() => props.materials.filter((item) => item.kind === 'logo'))
provide(numericContextKey, () => `${props.active !== false}:${props.applied}:${props.disabled}:${props.selectedBrand}:${props.target}:${props.editing}:${section.value}`)
function finishPreview(): void {
  emit('cancel')
  if (props.editing) emit('edit', props.target)
}
function selectSection(next: Section): void {
  if (section.value === next) return
  finishPreview()
  section.value = next
  if (body.value) body.value.scrollTop = 0
}
watch(() => props.selectedBrand, (id) => {
  if (id) selectSection('branding')
}, { immediate: true })
function start(kind: CompositionStart): void {
  finishPreview()
  const next = createComposition(kind)
  if (kind === 'phone' && props.value?.frame.kind === 'phone') {
    emit('change', { ...next, frame: { ...next.frame, orientation: props.value.frame.orientation } })
  } else emit('change', next)
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
function apply(record: MaterialRecord): void {
  finishPreview()
  emit('apply', record)
}
function applyLogo(
  record: MaterialRecord,
  id: string,
): void {
  finishPreview()
  emit('selectBrand', id)
  emit('apply', record)
}
</script>
<template>
  <aside
    class="cs-composition-panel"
    :aria-label="text('Оформление', 'Appearance')"
    @keydown.esc.stop="editing ? emit('edit', target) : emit('close')"
  >
    <header>
      <strong>{{ text('Оформление', 'Appearance') }}</strong>
      <button type="button" @click="emit('layers')">{{ text('Слои', 'Layers') }}</button>
      <button
        type="button"
        class="cs-composition-close"
        :aria-label="text('Закрыть оформление', 'Close appearance')"
        @click="emit('close')"
      >
        <UiIcon name="close" />
      </button>
    </header>
    <div class="cs-composition-templates">
      <div class="cs-composition-template-heading">
        <strong>{{ text('Готовые шаблоны', 'Ready-made templates') }}</strong>
        <button
          type="button"
          :aria-current="section === 'templates' ? 'page' : undefined"
          :aria-controls="panelId"
          @click="selectSection('templates')"
        >
          {{ text('Мои шаблоны', 'My templates') }}
        </button>
      </div>
      <div
        class="cs-card-starters"
        role="group"
        :aria-label="text('Готовые шаблоны', 'Ready-made templates')"
      >
        <button
          v-for="item in starters"
          :key="item.kind"
          type="button"
          :data-composition-start="item.kind"
          :disabled="disabled || !value"
          :title="text('Применить оформление целиком', 'Apply complete appearance')"
          @click="start(item.kind as CompositionStart)"
        >
          <span class="cs-template-preview" aria-hidden="true"><CardFramePreview :frame="item.frame" /></span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
    <div class="cs-composition-workspace">
      <nav class="cs-composition-nav" :aria-label="text('Разделы оформления', 'Appearance sections')">
        <button
          v-for="item in sections"
          :key="item.id"
          type="button"
          class="cs-composition-tab"
          :data-composition-section="item.id"
          :aria-current="section === item.id ? 'page' : undefined"
          :aria-controls="panelId"
          @click="selectSection(item.id)"
        >
          <UiIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <section
        :id="panelId"
        class="cs-composition-inspector"
        :data-active-section="section"
        :aria-label="current.label"
      >
        <div ref="body" class="cs-composition-body">
          <p v-if="disabled && !value">{{ text('Откройте изображение для оформления.', 'Open an image to start.') }}</p>
          <p v-if="loading" role="status">{{ text('Загрузка сохранённого…', 'Loading saved items…') }}</p>
          <p v-if="pending" role="status">{{ text('Сохранение…', 'Saving…') }}</p>
          <p v-if="error" role="alert">{{ error }} <button type="button" @click="emit('retry')">{{ text('Повторить', 'Retry') }}</button></p>
          <template v-if="value">
            <CardLayout
              v-if="section === 'layout'"
              :value="value"
              :locale="locale"
              :disabled="disabled"
              @change="emit('change', $event)"
              @preview="emit('preview', $event)"
              @cancel="emit('cancel')"
            />
            <template v-else-if="section === 'background'">
              <CardBackground
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
              <section class="cs-composition-library" :aria-label="text('Мои фоны', 'My backgrounds')">
                <h3>{{ text('Мои фоны', 'My backgrounds') }}</h3>
                <CardSavedItems
                  :loading="loading"
                  kind="background"
                  :materials="backgrounds"
                  :locale="locale"
                  :disabled="disabled"
                  @apply="apply"
                  @remove="emit('remove', $event)"
                />
                <CardSaveButton
                  kind="gradient"
                  :locale="locale"
                  :disabled="disabled || !applied"
                  :pending="pending"
                  :error="error"
                  :can-save="canSave"
                  :active="active !== false"
                  @open="finishPreview"
                  @save="(kind, title) => emit('save', kind, title)"
                />
              </section>
            </template>
            <CardShadow
              v-else-if="section === 'shadow'"
              :value="value"
              :locale="locale"
              :disabled="disabled"
              @change="emit('change', $event)"
              @preview="emit('preview', $event)"
              @cancel="emit('cancel')"
            />
            <CardFrame
              v-else-if="section === 'frame'"
              :value="value.frame"
              :locale="locale"
              :disabled="disabled"
              @change="emit('change', { ...value, frame: $event })"
              @preview="emit('preview', { ...value, frame: $event })"
              @cancel="emit('cancel')"
            />
            <template v-else-if="section === 'bands'">
              <section
                v-for="band in ['header', 'footer'] as const"
                :key="band"
                class="cs-composition-band"
              >
                <h3 class="cs-composition-section-heading">{{ band === 'header' ? text('Верхняя полоса', 'Header strip') : text('Нижняя полоса', 'Footer strip') }}</h3>
                <CardNumber
                  :label="text('Высота полосы', 'Strip height')"
                  :value="value[band].height"
                  :min="0"
                  :max="8192"
                  :disabled="disabled"
                  @change="emit('change', { ...value, [band]: { ...value[band], height: $event } })"
                  @preview="emit('preview', { ...value, [band]: { ...value[band], height: $event } })"
                  @cancel="emit('cancel')"
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
              </section>
            </template>
            <CardBranding
              v-else-if="section === 'branding'"
              :value="value.branding"
              :locale="locale"
              :disabled="disabled"
              :can-import="canImport"
              :selected="selectedBrand"
              @change="emit('change', { ...value, branding: $event })"
              @preview="emit('preview', { ...value, branding: $event })"
              @cancel="emit('cancel')"
              @select="emit('selectBrand', $event)"
              @import="emit('import', 'logo')"
            >
              <template #logos="{ id }">
                <section class="cs-composition-library" :aria-label="text('Мои логотипы', 'My logos')">
                  <h4>{{ text('Мои логотипы', 'My logos') }}</h4>
                  <CardSavedItems
                    :loading="loading"
                    kind="logo"
                    :materials="logos"
                    :locale="locale"
                    :disabled="disabled"
                    @apply="applyLogo($event, id)"
                    @remove="emit('remove', $event)"
                  />
                </section>
              </template>
            </CardBranding>
          </template>
          <CardSavedItems
            v-if="section === 'templates'"
            :loading="loading"
            kind="preset"
            :materials="templates"
            :locale="locale"
            :disabled="disabled || !value"
            @remove="emit('remove', $event)"
            @apply="apply"
          />
        </div>
      </section>
    </div>
    <footer class="cs-composition-footer">
      <CardSaveButton
        kind="preset"
        :locale="locale"
        :disabled="disabled || !applied"
        :pending="pending"
        :error="error"
        :can-save="canSave"
        :active="active !== false"
        @open="finishPreview"
        @save="(kind, title) => emit('save', kind, title)"
      />
      <button
        type="button"
        data-composition-reset
        :disabled="disabled || !applied"
        :title="applied ? text('Вернуть оформление можно через отмену действия', 'Undo restores the appearance') : text('Оформление не применено', 'No appearance applied')"
        @click="emit('reset')"
      >
        {{ text('Убрать оформление', 'Remove appearance') }}
      </button>
    </footer>
  </aside>
</template>
