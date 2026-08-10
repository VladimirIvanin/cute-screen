import {
  parseEditorDocument,
  type BlendMode,
  type FontReference,
  type JsonObject,
  type ShadowStyle,
  type SrgbColor,
  type TextBackground,
  type TextLayer,
} from '@cute-screen/editor-renderer'

export const TEXT_STYLE_PRESETS_STORAGE_KEY =
  'cute-screen.text-style-presets.v1'

export interface TextStylePresetValues {
  readonly font: FontReference
  readonly fontSize: number
  readonly weight: FontReference['weight']
  readonly italic: boolean
  readonly underline: boolean
  readonly letterSpacing: number
  readonly alignment: 'start' | 'center' | 'end' | 'justify'
  readonly lineHeight: number
  readonly color: SrgbColor
  readonly fill: TextLayer['payload']['fill']
  readonly outline: TextLayer['payload']['outline']
  readonly background: TextBackground | null
  readonly opacity: number
  readonly blendMode: BlendMode
  readonly shadows: readonly ShadowStyle[]
}

export interface UserTextStylePreset {
  readonly id: 'personal'
  readonly label: 'My preset'
  readonly values: TextStylePresetValues
}

export interface TextStylePresetsStorage {
  load(): UserTextStylePreset | undefined
  save(values: TextStylePresetValues): void
}

function normalize(values: unknown): TextStylePresetValues | undefined {
  if (!values || typeof values !== 'object') return undefined
  const source = values as Record<string, unknown>
  try {
    const parsed = parseEditorDocument({
      schemaVersion: 4,
      id: '019c1f62-058e-7000-8000-0000000000aa',
      source: {
        blobHash: 'a'.repeat(64),
        format: 'png',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        orientationApplied: true,
        provenance: 'fileOpen',
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      canvas: { width: 1, height: 1 },
      crop: null,
      layers: [
        {
          id: '019c1f62-058e-7000-8000-0000000000ab',
          kind: 'text',
          transform: {
            translateX: 0,
            translateY: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          localBounds: { x: 0, y: 0, width: 1, height: 1 },
          opacity: source.opacity,
          visible: true,
          locked: false,
          blendMode: source.blendMode,
          shadows: source.shadows,
          payload: {
            content: {
              text: 'Preset',
              wrap: 'autoSize',
              spans: [
                {
                  start: 0,
                  end: 6,
                  fontSize: source.fontSize,
                  weight: source.weight,
                  italic: source.italic,
                  underline: source.underline,
                  letterSpacing: source.letterSpacing,
                },
              ],
              paragraphs: [
                {
                  start: 0,
                  end: 6,
                  alignment: source.alignment,
                  lineHeight: source.lineHeight,
                },
              ],
            },
            font: source.font,
            fill: source.fill,
            outline: source.outline,
            background: source.background,
          },
        },
      ],
      presentation: {
        beautify: { enabled: false },
        watermark: { enabled: false },
      },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    } as JsonObject)
    if (parsed.kind !== 'editable') return undefined
    const layer = parsed.document.layers[0]
    if (!layer || layer.kind !== 'text') return undefined
    const span = layer.payload.content.spans[0]
    const paragraph = layer.payload.content.paragraphs[0]
    if (!span || !paragraph) return undefined
    return Object.freeze({
      font: layer.payload.font,
      fontSize: span.fontSize ?? 16,
      weight: span.weight ?? layer.payload.font.weight,
      italic: span.italic ?? false,
      underline: span.underline ?? false,
      letterSpacing: span.letterSpacing ?? 0,
      alignment: paragraph.alignment,
      lineHeight: paragraph.lineHeight ?? 1.25,
      color:
        layer.payload.fill.kind === 'solid'
          ? layer.payload.fill.color
          : { red: 0, green: 0, blue: 0, alpha: 1 },
      fill: layer.payload.fill,
      outline: layer.payload.outline,
      background: layer.payload.background,
      opacity: layer.opacity,
      blendMode: layer.blendMode ?? 'normal',
      shadows: layer.shadows ?? [],
    })
  } catch (error) {
    void error
    return undefined
  }
}

export function createBrowserTextStylePresetsStorage(
  storage: Storage | undefined,
): TextStylePresetsStorage {
  return {
    load: () => {
      if (!storage) return undefined
      try {
        const raw = storage.getItem(TEXT_STYLE_PRESETS_STORAGE_KEY)
        if (!raw) return undefined
        const parsed: unknown = JSON.parse(raw)
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          (parsed as { schemaVersion?: unknown }).schemaVersion !== 1
        ) {
          return undefined
        }
        const values = normalize((parsed as { values?: unknown }).values)
        return values
          ? Object.freeze({ id: 'personal', label: 'My preset', values })
          : undefined
      } catch (error) {
        void error
        return undefined
      }
    },
    save: (values) => {
      if (!storage) return
      const normalized = normalize(values)
      if (!normalized) return
      try {
        storage.setItem(
          TEXT_STYLE_PRESETS_STORAGE_KEY,
          JSON.stringify({ schemaVersion: 1, values: normalized }),
        )
      } catch (error) {
        void error
      }
    },
  }
}
