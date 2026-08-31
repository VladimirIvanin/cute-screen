import { render } from '@testing-library/vue'
import { vi } from 'vitest'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import type { TextToolDefaults } from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'

export const TEXT_TOOLBAR_SCHEMA = {
  text: {
    kind: 'text' as const,
    color: '#101010',
    fontFamily: 'Roboto',
    fonts: ['Roboto', 'Arial'],
    fontSize: 24,
    bold: false,
    italic: false,
    strikethrough: false,
    listKind: 'none' as const,
    alignment: 'start' as const,
    background: null,
    disabled: [] as const,
  },
  title: 'Text',
}

export const document: EditorDocumentV1 = {
  schemaVersion: 7,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [
    {
      id: 'shape',
      kind: 'shape',
      localBounds: { x: 0, y: 0, width: 20, height: 20 },
      transform: {
        translateX: 10,
        translateY: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {},
    },
  ],
  presentation: {
    beautify: { enabled: false },
    watermark: { enabled: false },
  },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

export const ARROW_TOOLBAR_SCHEMA = {
  controls: [
    {
      kind: 'arrowStroke' as const,
      id: 'stroke' as const,
      label: 'Stroke',
      width: 2,
      style: 'solid' as const,
      solidLabel: 'Solid',
      dashedLabel: 'Dashed',
      dottedLabel: 'Dotted',
    },
  ],
  title: 'Arrow',
}

export function mountViewport(
  activeTool?: string,
  viewportDocument: EditorDocumentV1 = document,
  selectedLayerId = 'shape',
  textDefaults?: TextToolDefaults,
  sampling = false,
  textToolbarSchema?: typeof TEXT_TOOLBAR_SCHEMA,
  arrowToolbarSchema?: typeof ARROW_TOOLBAR_SCHEMA,
  quickFrameMode = false,
  quickSelectionMode = false,
) {
  const rendered = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'Test', dimensions: '100 × 100' },
      canvas: viewportDocument.canvas,
      document: viewportDocument,
      selectedLayerId,
      activeTool,
      sampling,
      quickFrameMode,
      quickSelectionMode,
      ...(textDefaults === undefined ? {} : { textDefaults }),
      ...(textToolbarSchema === undefined ? {} : { textToolbarSchema }),
      ...(arrowToolbarSchema === undefined ? {} : { arrowToolbarSchema }),
      zoom: 100,
      fitMode: true,
      t: (key) => key,
    },
  })
  const scene = rendered.getByLabelText('sceneCanvas') as HTMLCanvasElement
  Object.defineProperty(scene, 'width', {
    configurable: true,
    value: 100,
    writable: true,
  })
  Object.defineProperty(scene, 'height', {
    configurable: true,
    value: 100,
    writable: true,
  })
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  })
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => false)
  return { ...rendered, scene }
}
