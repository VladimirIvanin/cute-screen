import type { Ref } from 'vue'
import type {
  CensorLayer,
  EditorDocumentV1,
  LoupeLayer,
  RulerLayer,
  SpotlightLayer,
  SrgbColor,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type {
  ContextToolbarSchema,
  PrecisionToolDefaults,
  SupportedLocale,
} from '../types'

export type PrecisionLayer =
  CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer
export type PrecisionTool = PrecisionLayer['kind']

export interface PrecisionSchemaContext {
  readonly props: ResolvedEditorShellProps
  readonly state: { readonly locale: Ref<SupportedLocale> }
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly precisionDefaults: Ref<PrecisionToolDefaults>
  readonly translate: (key: Parameters<typeof import('../i18n').t>[1]) => string
}

export function hexColor(value: unknown): string {
  if (!value || typeof value !== 'object') return '#e5484d'
  const color = value as Record<string, unknown>
  const channel = (name: string) =>
    typeof color[name] === 'number'
      ? Math.round(Math.max(0, Math.min(1, color[name] as number)) * 255)
      : 0
  return `#${[channel('red'), channel('green'), channel('blue')]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')}`
}

function localizedText(
  context: PrecisionSchemaContext,
  english: string,
  russian: string,
): string {
  return context.state.locale.value === 'ru' ? russian : english
}

function selectedPrecisionLayer(
  context: PrecisionSchemaContext,
): PrecisionLayer | undefined {
  const { store, activeDocument } = context
  if (store.selectedLayerIds.length !== 1) return undefined
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === store.selectedLayerId,
  )
  return layer?.kind === 'censor' ||
    layer?.kind === 'spotlight' ||
    layer?.kind === 'ruler' ||
    layer?.kind === 'loupe'
    ? layer
    : undefined
}

function censorSchema(
  context: PrecisionSchemaContext,
  selected: PrecisionLayer | undefined,
): ContextToolbarSchema {
  const { props, activeDocument, precisionDefaults, translate } = context
  const defaults = precisionDefaults.value
  const precisionText = (english: string, russian: string) =>
    localizedText(context, english, russian)
  const layer = selected?.kind === 'censor' ? selected : undefined
  const controlsDisabled =
    props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
  const selectedEffect = layer?.payload.effect as
    | {
        readonly mode: 'pixelate' | 'blur' | 'solid'
        readonly blockSize?: number
        readonly strength?: number
        readonly color?: SrgbColor
      }
    | undefined
  const mode = selectedEffect?.mode ?? defaults.censor.mode
  const selectedSolidColor =
    selectedEffect?.mode === 'solid' && selectedEffect.color
      ? selectedEffect.color
      : defaults.censor.solidColor
  return {
    icon: 'privacy',
    title: translate('toolPrivacy'),
    hint: precisionText(
      'Drag to hide data manually',
      'Потяните, чтобы скрыть данные вручную',
    ),
    controls: [
      {
        kind: 'select',
        id: 'censorRegion',
        label: precisionText('Region', 'Область'),
        value: layer?.payload.region.kind ?? defaults.censor.region,
        disabled: controlsDisabled,
        options: [
          {
            value: 'rectangle',
            label: precisionText('Rectangle', 'Прямоугольник'),
          },
          {
            value: 'freeform',
            label: precisionText('Freeform', 'Произвольная'),
          },
        ],
      },
      {
        kind: 'select',
        id: 'censorMode',
        label: precisionText('Effect', 'Эффект'),
        value: mode,
        disabled: controlsDisabled,
        options: [
          {
            value: 'pixelate',
            label: precisionText('Pixelate', 'Пикселизация'),
          },
          { value: 'blur', label: precisionText('Blur', 'Размытие') },
          {
            value: 'solid',
            label: precisionText('Solid', 'Сплошной цвет'),
          },
        ],
      },
      ...(mode === 'pixelate'
        ? [
            {
              kind: 'range' as const,
              id: 'censorBlockSize',
              label: precisionText('Block size', 'Размер блока'),
              value:
                selectedEffect?.mode === 'pixelate'
                  ? (selectedEffect.blockSize ?? defaults.censor.blockSize)
                  : defaults.censor.blockSize,
              min: 2,
              max: 128,
              step: 1,
              disabled: controlsDisabled,
            },
          ]
        : mode === 'blur'
          ? [
              {
                kind: 'range' as const,
                id: 'censorBlurStrength',
                label: precisionText('Blur strength', 'Сила размытия'),
                value:
                  selectedEffect?.mode === 'blur'
                    ? (selectedEffect.strength ?? defaults.censor.blurStrength)
                    : defaults.censor.blurStrength,
                min: 0.5,
                max: 128,
                step: 0.5,
                disabled: controlsDisabled,
              },
            ]
          : [
              {
                kind: 'color' as const,
                id: 'censorSolidColor',
                label: precisionText('Solid color', 'Сплошной цвет'),
                value: hexColor(selectedSolidColor),
                disabled: controlsDisabled,
                eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
              },
            ]),
    ],
  }
}

function spotlightSchema(
  context: PrecisionSchemaContext,
  selected: PrecisionLayer | undefined,
): ContextToolbarSchema {
  const { props, activeDocument, precisionDefaults, translate } = context
  const defaults = precisionDefaults.value
  const precisionText = (english: string, russian: string) =>
    localizedText(context, english, russian)
  const layer = selected?.kind === 'spotlight' ? selected : undefined
  const controlsDisabled =
    props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
  return {
    icon: 'spotlight',
    title: translate('toolSpotlight'),
    hint: precisionText('Drag an aperture', 'Потяните область подсветки'),
    controls: [
      {
        kind: 'select',
        id: 'spotlightShape',
        label: precisionText('Shape', 'Форма'),
        value: layer?.payload.shape ?? defaults.spotlight.shape,
        disabled: controlsDisabled,
        options: [
          {
            value: 'rectangle',
            label: precisionText('Rectangle', 'Прямоугольник'),
          },
          { value: 'ellipse', label: precisionText('Ellipse', 'Эллипс') },
          { value: 'diamond', label: precisionText('Diamond', 'Ромб') },
        ],
      },
      {
        kind: 'color',
        id: 'spotlightDimColor',
        label: precisionText('Dim color', 'Цвет затемнения'),
        value: hexColor(layer?.payload.dimColor ?? defaults.spotlight.dimColor),
        disabled: controlsDisabled,
        eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
      },
      {
        kind: 'range',
        id: 'spotlightDimOpacity',
        label: precisionText('Dim opacity', 'Непрозрачность затемнения'),
        value:
          (layer?.payload.dimOpacity ?? defaults.spotlight.dimOpacity) * 100,
        min: 0,
        max: 100,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'spotlightFeather',
        label: precisionText('Feather', 'Растушёвка'),
        value: layer?.payload.feather ?? defaults.spotlight.feather ?? 'none',
        disabled: controlsDisabled,
        options: [
          { value: 'none', label: precisionText('None', 'Нет') },
          { value: 'soft', label: precisionText('Soft', 'Мягкая') },
          { value: 'strong', label: precisionText('Strong', 'Сильная') },
        ],
      },
    ],
  }
}

function rulerSchema(
  context: PrecisionSchemaContext,
  selected: PrecisionLayer | undefined,
): ContextToolbarSchema {
  const { props, activeDocument, precisionDefaults, translate } = context
  const defaults = precisionDefaults.value
  const precisionText = (english: string, russian: string) =>
    localizedText(context, english, russian)
  const layer = selected?.kind === 'ruler' ? selected : undefined
  const controlsDisabled =
    props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
  return {
    icon: 'ruler',
    title: translate('toolRuler'),
    hint: precisionText(
      'Hold Alt for angle guides',
      'Удерживайте Alt для угловых направляющих',
    ),
    controls: [
      {
        kind: 'color',
        id: 'rulerColor',
        label: precisionText('Colour', 'Цвет'),
        value: hexColor(layer?.payload.color ?? defaults.ruler.color),
        disabled: controlsDisabled,
        eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
      },
      {
        kind: 'range',
        id: 'rulerThickness',
        label: precisionText('Thickness', 'Толщина'),
        value: layer?.payload.thickness ?? defaults.ruler.thickness,
        min: 1,
        max: 12,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'range',
        id: 'rulerFontSize',
        label: precisionText('Label size', 'Размер подписи'),
        value: layer?.payload.fontSize ?? defaults.ruler.fontSize,
        min: 10,
        max: 48,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'rulerUnit',
        label: precisionText('Unit', 'Единицы'),
        value: layer?.payload.unit ?? defaults.ruler.unit,
        disabled: controlsDisabled,
        options: [
          { value: 'pixels', label: precisionText('Pixels', 'Пиксели') },
          { value: 'percent', label: precisionText('Percent', 'Проценты') },
        ],
      },
      {
        kind: 'select',
        id: 'rulerSnap',
        label: precisionText('Snapping', 'Привязка'),
        value: defaults.ruler.snap ? 'on' : 'off',
        disabled: controlsDisabled || Boolean(layer),
        options: [
          { value: 'on', label: precisionText('On', 'Вкл.') },
          { value: 'off', label: precisionText('Off', 'Выкл.') },
        ],
      },
      {
        kind: 'range',
        id: 'rulerAngle',
        label: precisionText('Angle step', 'Шаг угла'),
        value:
          layer?.payload.snapAngleIncrementDegrees ??
          defaults.ruler.snapAngleIncrementDegrees,
        min: 1,
        max: 90,
        step: 1,
        disabled: controlsDisabled,
      },
    ],
  }
}

function loupeSchema(
  context: PrecisionSchemaContext,
  selected: PrecisionLayer | undefined,
): ContextToolbarSchema {
  const { props, activeDocument, precisionDefaults, translate } = context
  const defaults = precisionDefaults.value
  const precisionText = (english: string, russian: string) =>
    localizedText(context, english, russian)
  const layer = selected?.kind === 'loupe' ? selected : undefined
  const controlsDisabled =
    props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
  return {
    icon: 'loupe',
    title: translate('toolLoupe'),
    hint: precisionText(
      'Drag from source to lens',
      'Потяните от источника к линзе',
    ),
    controls: [
      {
        kind: 'range',
        id: 'loupeZoom',
        label: precisionText('Zoom', 'Увеличение'),
        value: layer?.payload.zoom ?? defaults.loupe.zoom,
        min: 1,
        max: 16,
        step: 0.5,
        disabled: controlsDisabled,
      },
      {
        kind: 'range',
        id: 'loupeSize',
        label: precisionText('Size', 'Размер'),
        value: layer?.payload.lens.size ?? defaults.loupe.size,
        min: 16,
        max: 512,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'loupeShape',
        label: precisionText('Shape', 'Форма'),
        value: layer?.payload.lens.shape ?? defaults.loupe.shape,
        disabled: controlsDisabled,
        options: [
          { value: 'circle', label: precisionText('Circle', 'Круг') },
          {
            value: 'rectangle',
            label: precisionText('Rectangle', 'Прямоугольник'),
          },
        ],
      },
      {
        kind: 'color',
        id: 'loupeBorderColor',
        label: precisionText('Border color', 'Цвет рамки'),
        value: hexColor(
          layer?.payload.border.color ?? defaults.loupe.borderColor,
        ),
        disabled: controlsDisabled,
        eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
      },
      {
        kind: 'range',
        id: 'loupeBorderWidth',
        label: precisionText('Border width', 'Толщина рамки'),
        value: layer?.payload.border.width ?? defaults.loupe.borderWidth,
        min: 0,
        max: 64,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'loupeShadow',
        label: precisionText('Shadow', 'Тень'),
        value: (layer ? layer.payload.shadow !== null : defaults.loupe.shadow)
          ? 'on'
          : 'off',
        disabled: controlsDisabled,
        options: [
          { value: 'on', label: precisionText('On', 'Вкл.') },
          { value: 'off', label: precisionText('Off', 'Выкл.') },
        ],
      },
    ],
  }
}

function precisionToolSchema(
  context: PrecisionSchemaContext,
  tool: PrecisionTool,
  selected?: PrecisionLayer,
): ContextToolbarSchema {
  if (tool === 'censor') return censorSchema(context, selected)
  if (tool === 'spotlight') return spotlightSchema(context, selected)
  if (tool === 'ruler') return rulerSchema(context, selected)
  return loupeSchema(context, selected)
}

export function createPrecisionSchema(context: PrecisionSchemaContext) {
  return {
    hexColor,
    precisionText: (english: string, russian: string) =>
      localizedText(context, english, russian),
    precisionToolSchema: (tool: PrecisionTool, selected?: PrecisionLayer) =>
      precisionToolSchema(context, tool, selected),
    selectedPrecisionLayer: () => selectedPrecisionLayer(context),
  }
}
