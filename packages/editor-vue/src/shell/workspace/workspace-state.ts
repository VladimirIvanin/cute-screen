import { ref, shallowRef } from 'vue'
import {
  defaultDrawingToolPreferences,
  DEFAULT_DRAWING_DEFAULTS,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  type CropPreset,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type {
  CanvasViewportExpose,
  TextFormattingPatch,
  TextToolDefaults,
} from '../canvas/contracts'
import type { PrecisionToolDefaults } from '../types'
import type { TextDraft } from '../tools/text-schema'

const DEFAULT_TEXT_TOOL: TextToolDefaults = {
  fontFamily: 'Roboto',
  fontSize: 24,
  weight: 400,
  italic: false,
  strikethrough: false,
  alignment: 'start',
  listKind: 'none',
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  background: null,
}

const DEFAULT_PRECISION_TOOLS: PrecisionToolDefaults = {
  censor: {
    region: 'rectangle',
    mode: 'pixelate',
    blockSize: 12,
    blurStrength: 12,
    solidColor: { red: 0, green: 0, blue: 0, alpha: 1 },
  },
  spotlight: {
    shape: 'rectangle',
    dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    dimOpacity: 0.65,
    feather: 'soft',
  },
  ruler: {
    unit: 'pixels',
    snap: true,
    snapAngleIncrementDegrees: 15,
    color: DEFAULT_RULER_COLOR,
    thickness: DEFAULT_RULER_THICKNESS,
    fontSize: DEFAULT_RULER_FONT_SIZE,
  },
  loupe: {
    zoom: 2,
    size: 120,
    shape: 'circle',
    borderColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    borderWidth: 3,
    shadow: true,
  },
}

export function createWorkspaceState() {
  return {
    canvasViewport: ref<CanvasViewportExpose>(),
    fallbackCopied: ref(false),
    fallbackVisible: ref(true),
    fallbackCopiedTimer: ref<number>(),
    drawingDefaults: ref<DrawingDefaults>(
      structuredClone(DEFAULT_DRAWING_DEFAULTS),
    ),
    textDefaults: shallowRef<TextToolDefaults>({ ...DEFAULT_TEXT_TOOL }),
    textFormatting: shallowRef<TextFormattingPatch>(),
    textDraft: ref<TextDraft>(),
    toolConfigure: ref<
      { readonly toolId: string; readonly anchor: HTMLElement } | undefined
    >(),
    toolConfigureLayout: ref<
      { readonly left: number; readonly top: number } | undefined
    >(),
    configureDefaultsTool: ref<'arrow'>(),
    markerShape: ref<'circle' | 'square' | 'diamond' | 'star'>('circle'),
    cropPreset: ref<CropPreset>('free'),
    precisionDefaults: shallowRef<PrecisionToolDefaults>(
      structuredClone(DEFAULT_PRECISION_TOOLS),
    ),
    contentImageImporting: ref(false),
    drawingPreferences: shallowRef<DrawingToolPreferencesV2>(
      defaultDrawingToolPreferences(),
    ),
    samplingControl: ref<string>(),
    eyedropperFeedback: ref<string>(),
    eyedropperColor: ref<string>(),
    toolError: ref<string>(),
    textureImages: ref<ReadonlyMap<string, HTMLImageElement>>(new Map()),
    activeDocument: ref<EditorDocumentV1>(),
  }
}
