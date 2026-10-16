<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import { NPopover } from 'naive-ui'
import {
  resolveFreehandGeometry,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import type {
  ContextToolbarSchema,
  ContextControl,
} from '../types'
import { UiIcon } from '../icon'
import SimpleColorPicker from '../ui/SimpleColorPicker.vue'
import NumericControl from '../ui/NumericControl.vue'
import { usePreviewPopover } from '../ui/use-preview-popover'
const props = defineProps<{
  schema: ContextToolbarSchema
  locale: 'en' | 'ru'
  recentColors: readonly SrgbColor[]
}>()
const emit = defineEmits<{
  change: [
        id: string,
        value: string,
  ]
  action: [
        id: string,
  ]
  eyedropper: [
        id: string,
  ]
}>()
const open = ref<string>()
const panel = ref<HTMLElement>()
const triggers = new Map<string, HTMLButtonElement>()
const picker = ref<InstanceType<typeof SimpleColorPicker>>()
const text = (en: string, ru: string) => props.locale === 'ru' ? ru : en
const settings = computed(() => props.schema.toolSettings!)
const kind = computed(() => settings.value.kind)
const control = (id: string) => props.schema.controls.find((item) => item.id === id)
const value = (id: string) => {
  const item = control(id)
  return item && 'value' in item ? String(item.value) : ''
}
const mixed = (id: string) => Boolean(control(id)?.mixed)
const blocked = computed(() => Boolean(props.schema.disabled || props.schema.controls.some((item) => item.kind === 'color' && item.disabled)))
const colorId = computed(() => kind.value === 'ruler' ? 'rulerColor' : 'color')
const position = usePreviewPopover(
  () => open.value ? triggers.get(open.value) : undefined,
  () => open.value ? panel.value : undefined,
)
const names = computed<Record<string, string>>(() => ({
  brush: text('Brush and width', 'Кисть и толщина'),
  appearance: text('Opacity and blending', 'Непрозрачность и наложение'),
  smoothing: text('Correction', 'Коррекция'),
  shape: text('Aperture shape', 'Форма области'),
  dim: text('Dimming', 'Затемнение'),
  feather: text('Edge softness', 'Мягкость краёв'),
  regions: text('Apertures', 'Области'),
  stroke: text('Thickness', 'Толщина'),
  label: text('Label and units', 'Подпись и единицы'),
  measure: text('Measurement and snapping', 'Измерение и привязка'),
}))
const menus = computed(() => kind.value === 'pencil' ? ['brush', 'appearance', 'smoothing'] : kind.value === 'spotlight' ? ['shape', 'dim', 'feather', 'regions'] : ['stroke', 'label', 'measure'])
const labels = computed<Record<string, string>>(() => ({
  width: text('Width', 'Толщина'),
  layerOpacity: text('Opacity', 'Непрозрачность'),
  smoothing: names.value.smoothing!,
  rulerThickness: text('Thickness', 'Толщина'),
  rulerFontSize: text('Label size', 'Размер подписи'),
  rulerAngle: text('Angle step', 'Шаг угла'),
  spotlightDimOpacity: text('Dimming', 'Затемнение'),
}))
const numericIds = (menu: string) => ({
  brush: ['width'],
  appearance: ['layerOpacity'],
  smoothing: ['smoothing'],
  stroke: ['rulerThickness'],
  label: ['rulerFontSize'],
  measure: ['rulerAngle'],
  dim: ['spotlightDimOpacity'],
})[menu] ?? []
function numeric(id: string): Extract<ContextControl, {
  kind: 'range'
}> | undefined {
  const item = control(id)
  return item?.kind === 'range' ? item : undefined
}
const presets = (id: string) => ({
  width: [1, 3, 6, 12],
  layerOpacity: [25, 50, 75, 100],
  smoothing: [0, 25, 50, 75],
  rulerThickness: [1, 2, 4, 6],
  rulerFontSize: [12, 16, 24, 32],
  rulerAngle: [15, 30, 45, 90],
  spotlightDimOpacity: [35, 50, 65, 80],
})[id] ?? []
const unit = (id: string) => ['width', 'rulerThickness', 'rulerFontSize'].includes(id) ? 'px' : id === 'rulerAngle' ? '°' : '%'
const brushes = computed(() => [
  {
    id: 'pen', name: text('Exact pen', 'Точное перо'), hint: text('Follows your hand exactly', 'Точно повторяет движение'),
  },
  {
    id: 'stabilized', name: text('Autocorrection', 'Автокоррекция'), hint: text('Steadies lines and curves', 'Убирает дрожание руки'),
  },
  {
    id: 'brush', name: text('Expressive brush', 'Экспрессивная кисть'), hint: text('Pressure or simulated pressure', 'Переменная толщина'),
  },
])
const shapes = computed(() => [
  {
    id: 'rectangle', name: text('Rectangle', 'Прямоугольник'),
  },
  {
    id: 'ellipse', name: text('Ellipse', 'Эллипс'),
  },
  {
    id: 'diamond', name: text('Diamond', 'Ромб'),
  },
])
const feathers = computed(() => [
  {
    id: 'none', name: text('Sharp', 'Чётко'),
  },
  {
    id: 'soft', name: text('Soft', 'Мягко'),
  },
  {
    id: 'strong', name: text('Strong', 'Сильно'),
  },
])
const blends = computed(() => [
  ['normal', text('Normal', 'Обычный')],
  ['multiply', text('Multiply', 'Умножение')],
  ['screen', text('Screen', 'Экран')],
  ['overlay', text('Overlay', 'Перекрытие')],
  ['darken', text('Darken', 'Темнее')],
  ['lighten', text('Lighten', 'Светлее')],
  ['softLight', text('Soft light', 'Мягкий свет')],
  ['hardLight', text('Hard light', 'Жёсткий свет')],
])
function summary(menu: string): string {
  const display = (id: string, suffix = '') => mixed(id) ? '—' : `${value(id)}${suffix}`
  if (menu === 'brush')
    return `${mixed('brush') ? '—' : brushes.value.find((item) => item.id === value('brush'))?.name ?? text('Legacy pencil', 'Карандаш (старый)')} · ${display('width', ' px')}`
  if (menu === 'appearance')
    return display('layerOpacity', '%')
  if (menu === 'smoothing')
    return display('smoothing', '%')
  if (menu === 'shape')
    return mixed('spotlightShape') ? '—' : shapes.value.find((item) => item.id === value('spotlightShape'))?.name ?? ''
  if (menu === 'dim')
    return display('spotlightDimOpacity', '%')
  if (menu === 'feather')
    return mixed('spotlightFeather') ? '—' : feathers.value.find((item) => item.id === value('spotlightFeather'))?.name ?? ''
  if (menu === 'regions')
    return `${text('Apertures', 'Области')} ${settings.value.apertures?.length ?? ''}`
  if (menu === 'stroke')
    return display('rulerThickness', ' px')
  if (menu === 'label')
    return `Aa ${display('rulerFontSize')} · ${mixed('rulerUnit') ? '—' : value('rulerUnit') === 'percent' ? '%' : 'px'}`
  return settings.value.measurement?.length ?? 'Alt'
}
function show(
  menu: string,
  shown: boolean,
  restoreFocus = true,
): void {
  if (
    shown &&
    blocked.value &&
    menu !== 'measure'
  )
    return
  if (!shown && open.value !== menu)
    return
  if (shown)
    picker.value?.close()
  open.value = shown ? menu : undefined
  void nextTick(() => {
    if (shown)
      panel.value?.querySelector<HTMLElement>('[aria-pressed="true"], input:not(:disabled), button:not(:disabled)')?.focus({
        preventScroll: true,
      })
    else if (restoreFocus)
      triggers.get(menu)?.focus({
        preventScroll: true,
      })
  })
}
function change(
  id: string,
  next: string,
): void {
  if (!blocked.value)
    emit('change', id, next)
}
function choose(
  id: string,
  next: string,
): void {
  change(id, next)
  if (open.value)
    show(open.value, false)
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value)
    return
  event.preventDefault()
  event.stopPropagation()
  show(open.value, false)
}
function brushPreview(brush: string) {
  const geometry = resolveFreehandGeometry({
    brush, width: 3.5, strokeVersion: 2, pressureMode: 'pen',
    smoothing: brush === 'brush' ? .35 : .65,
    points: Array.from({ length: 45 }, (_, index) => ({
      x: 3 + index * .75, y: 12 + Math.sin(index / 6) * 5 + (index % 2 ? 1.8 : -1.8),
      pressure: .15 + .85 * Math.sin(index / 44 * Math.PI),
    })),
  }, true)
  return {
    points: (geometry.outline.length ? geometry.outline : geometry.points).map((point) => `${point.x},${point.y}`).join(' '),
    filled: geometry.outline.length > 0, width: geometry.width,
  }
}
const brushPreviews = computed(() => Object.fromEntries(
  brushes.value.map((brush) => [brush.id, brushPreview(brush.id)]),
))
const correctionHint = computed(() => text(
  'Exact pen follows the pointer without correction.',
  'Точное перо повторяет курсор без коррекции.',
))
watch([() => props.schema.icon, () => settings.value.activeApertureId], () => {
  open.value = undefined
})
</script>

<template>
  <div class="cs-tool-formatting-toolbar" :data-tool-settings="kind">
    <SimpleColorPicker
      v-if="kind !== 'spotlight'"
      ref="picker"
      :model-value="value(colorId)"
      :ariaLabel="text('Colour', 'Цвет')"
      :mixed="mixed(colorId)"
      :disabled="blocked"
      :locale="locale"
      :recent-colors="recentColors"
      palette="drawing"
      :eyedropper="Boolean(control(colorId)?.kind === 'color' && (control(colorId) as { eyedropper?: boolean }).eyedropper)"
      @opened="open = undefined"
      @commit="change(colorId, $event)"
      @eyedropper="emit('eyedropper', colorId)"
    />
    <NPopover
      v-for="menu in menus"
      :key="menu"
      :show="open === menu"
      trigger="manual"
      placement="top-start"
      :x="position?.left ?? 0"
      :y="position?.top ?? 0"
      overlap
      :flip="false"
      :show-arrow="false"
      raw
      to=".cs-overlay-root"
      @update:show="show(menu, $event, false)"
      @clickoutside="show(menu, false, false)"
    >
      <div
        v-if="open === menu"
        :ref="element => { panel = element as HTMLElement | undefined }"
        class="cs-tool-settings-popover"
        role="dialog"
        :aria-label="names[menu]"
        @keydown="keydown"
        @pointerdown.stop
      >
        <div v-if="menu === 'brush'" class="cs-tool-settings-choices cs-brush-choices">
          <button
            v-for="brush in brushes"
            :key="brush.id"
            type="button"
            :disabled="blocked"
            :aria-label="brush.name"
            :title="brush.hint"
            :aria-pressed="!mixed('brush') && value('brush') === brush.id"
            @click="change('brush', brush.id)"
          >
            <svg viewBox="0 0 40 24" aria-hidden="true">
              <polygon
                v-if="brushPreviews[brush.id]?.filled"
                :points="brushPreviews[brush.id]?.points"
                fill="currentColor"
              />
              <polyline
                v-else
                :points="brushPreviews[brush.id]?.points"
                :stroke-width="brushPreviews[brush.id]?.width"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>{{ brush.name }}</span>
            <small>{{ brush.hint }}</small>
          </button>
        </div>
        <div v-if="menu === 'shape'" class="cs-tool-settings-choices">
          <button
            v-for="shape in shapes"
            :key="shape.id"
            type="button"
            :disabled="blocked"
            :aria-label="shape.name"
            :aria-pressed="!mixed('spotlightShape') && value('spotlightShape') === shape.id"
            @click="choose('spotlightShape', shape.id)"
          >
            <svg viewBox="0 0 32 24" aria-hidden="true"><rect
              v-if="shape.id === 'rectangle'"
              x="3"
              y="4"
              width="26"
              height="16"
            /><ellipse
              v-else-if="shape.id === 'ellipse'"
              cx="16"
              cy="12"
              rx="13"
              ry="8"
            /><path v-else d="M16 2L30 12L16 22L2 12Z"/></svg>
            {{ shape.name }}
          </button>
        </div>
        <SimpleColorPicker
          v-if="menu === 'dim'"
          :model-value="value('spotlightDimColor')"
          :ariaLabel="text('Dim colour', 'Цвет затемнения')"
          :mixed="mixed('spotlightDimColor')"
          :disabled="blocked"
          :locale="locale"
          :recent-colors="recentColors"
          palette="drawing"
          @commit="change('spotlightDimColor', $event)"
          @eyedropper="emit('eyedropper', 'spotlightDimColor')"
        />
        <template v-if="menu === 'measure'">
          <div v-if="settings.measurement" class="cs-tool-measurement">
            <output>{{ settings.measurement.length }} · {{ settings.measurement.angle }}</output><button
              type="button"
              data-settings-action="rulerCopyLength"
              @click="emit('action', 'rulerCopyLength')"
            >
              {{ text('Copy length', 'Скопировать длину') }}
            </button><button
              type="button"
              data-settings-action="rulerCopyAngle"
              @click="emit('action', 'rulerCopyAngle')"
            >
              {{ text('Copy angle', 'Скопировать угол') }}
            </button>
          </div>
          <small>{{ text('Hold Alt to snap while drawing or moving an endpoint. Changing the step keeps the current measurement.', 'Alt — привязка при рисовании и перемещении конца. Изменение шага сохраняет текущее измерение.') }}</small>
        </template>
        <small v-if="menu === 'smoothing' && numeric('smoothing')?.disabled && value('brush') === 'pen'">{{ correctionHint }}</small>
        <NumericControl
          v-for="id in numericIds(menu)"
          :key="id"
          :label="labels[id] ?? id"
          :value="numeric(id)?.value ?? 0"
          :min="numeric(id)?.min ?? 0"
          :max="numeric(id)?.max ?? 100"
          :step="numeric(id)?.step ?? 1"
          :unit="unit(id)"
          :presets="presets(id)"
          :control-id="id"
          :mixed="mixed(id)"
          :disabled="blocked || numeric(id)?.disabled"
          :locale="locale"
          slider
          stepper
          @commit="change(id, String($event))"
        >
          <template v-if="id === 'smoothing'" #preset="preset">{{ ({ 0: text('None', 'Нет'), 25: text('Low', 'Слабое'), 50: text('Medium', 'Среднее'), 75: text('Strong', 'Сильное') } as Record<number, string>)[preset.value] }}</template>
        </NumericControl>
        <label v-if="menu === 'appearance'" class="cs-tool-settings-select">{{ text('Blending', 'Наложение') }}<select
          :value="mixed('blendMode') ? '' : value('blendMode')"
          :disabled="blocked"
          :aria-label="text('Blending', 'Наложение')"
          @change="change('blendMode', ($event.target as HTMLSelectElement).value)"
        ><option
          v-if="mixed('blendMode')"
          value=""
          disabled
        >—</option><option
          v-for="blend in blends"
          :key="blend[0]"
          :value="blend[0]"
        >{{ blend[1] }}</option></select></label>
        <div v-if="menu === 'feather'" class="cs-tool-settings-choices">
          <button
            v-for="(feather, index) in feathers"
            :key="feather.id"
            type="button"
            :disabled="blocked"
            :aria-pressed="!mixed('spotlightFeather') && value('spotlightFeather') === feather.id"
            @click="choose('spotlightFeather', feather.id)"
          >
            <span class="cs-softness-preview" :style="{ boxShadow: `0 0 ${index * 6}px ${index * 2}px currentColor` }"/>{{ feather.name }}
          </button>
        </div>
        <div v-if="menu === 'regions'" class="cs-tool-settings-regions">
          <template v-if="settings.apertures">
            <button
              v-for="(aperture, index) in settings.apertures"
              :key="aperture.id"
              :data-aperture-id="aperture.id"
              type="button"
              :disabled="blocked"
              :aria-pressed="settings.editing && settings.activeApertureId === aperture.id"
              @click="emit('action', `spotlightEdit:${aperture.id}`); show(menu, false)"
            >
              {{ text('Aperture', 'Область') }} {{ index + 1 }} · {{ shapes.find(item => item.id === aperture.shape)?.name }}
            </button>
            <button
              type="button"
              :disabled="blocked || settings.apertures.length >= 64"
              data-settings-action="spotlightAdd"
              @click="emit('action', 'spotlightAdd'); show(menu, false)"
            >
              {{ text('Add aperture', 'Добавить область') }}
            </button>
            <button
              v-if="settings.editing && !settings.adding"
              type="button"
              :disabled="blocked"
              @click="emit('action', 'spotlightRemove')"
            >
              {{ text('Remove aperture', 'Удалить область') }}
            </button>
            <button
              v-if="settings.editing"
              type="button"
              @click="emit('action', 'spotlightExit')"
            >
              {{ text('Finish editing', 'Завершить редактирование') }}
            </button>
          </template>
          <p v-else>{{ text('Draw or select one spotlight to edit its apertures.', 'Нарисуйте или выберите один фонарь для редактирования областей.') }}</p>
          <small>{{ text('Double-click an aperture to edit it. Escape exits.', 'Двойной клик редактирует область. Escape завершает.') }}</small>
        </div>
        <template v-if="menu === 'label'">
          <div class="cs-tool-settings-choices">
            <button
              v-for="item in ['pixels', 'percent']"
              :key="item"
              type="button"
              :disabled="blocked"
              :aria-label="item === 'pixels' ? text('Pixels', 'Пиксели') : text('Percent', 'Проценты')"
              :aria-pressed="!mixed('rulerUnit') && value('rulerUnit') === item"
              @click="change('rulerUnit', item)"
            >
              {{ item === 'pixels' ? 'px' : '%' }}
            </button>
          </div>
          <small>{{ text('Percent is relative to the diagonal of the entire canvas.', 'Проценты — от диагонали всего холста.') }}</small>
        </template>
      </div>
    </NPopover>
    <button
      v-for="menu in menus"
      :key="`trigger:${menu}`"
      :ref="element => { if (element) triggers.set(menu, element as HTMLButtonElement) }"
      type="button"
      class="cs-tool-settings-trigger"
      :disabled="blocked && menu !== 'measure' || menu === 'shape' && !control('spotlightShape') || menu === 'smoothing' && numeric('smoothing')?.disabled"
      :aria-label="names[menu]"
      :title="menu === 'smoothing' && value('brush') === 'pen' ? correctionHint : names[menu]"
      :aria-expanded="open === menu"
      aria-haspopup="dialog"
      @click="show(menu, open !== menu)"
    >
      <span>{{ summary(menu) }}</span><UiIcon name="chevronDown"/>
    </button>
  </div>
</template>
