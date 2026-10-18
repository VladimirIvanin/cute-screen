import { render } from '@testing-library/vue'
import { vi } from 'vitest'
import CanvasViewport, { type TextToolDefaults } from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import type {
  EditorDocument,
  ImageLayer,
  LayerNode,
} from '@cute-screen/editor-renderer'
const TEXT_DEFAULTS: TextToolDefaults = Object.freeze({
  calloutStyle: null,
  fontFamily: 'Roboto',
  fontSize: 24,
  weight: 400,
  italic: false,
  strikethrough: false,
  alignment: 'start',
  listKind: 'none',
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  background: null,
})

function editorDocument(layer?: LayerNode): EditorDocument {
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000000',
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 240,
      height: 160,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 240, height: 160 },
    crop: null,
    layers: layer ? [layer] : [],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
}

export function mount(
  layer?: LayerNode,
  activeTool = 'select',
  renderPersistedScene = false,
) {
  const imageLayer: ImageLayer = {
    id: '019c1f62-058e-7000-8000-000000000001',
    kind: 'image',
    localBounds: { x: 0, y: 0, width: 240, height: 160 },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    blendMode: 'normal',
    shadows: [],
    visible: true,
    locked: true,
    payload: {
      blobHash: 'a'.repeat(64),
      intrinsicWidth: 240,
      intrinsicHeight: 160,
      format: 'png',
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
      role: 'base',
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
  }
  const document = editorDocument(layer)
  const renderDocument = renderPersistedScene
    ? { ...document, layers: layer ? [imageLayer, layer] : [imageLayer] }
    : document
  const image = new Image()
  if (renderPersistedScene) {
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 240 },
      naturalHeight: { configurable: true, value: 160 },
    })
    image.src = 'data:image/png;base64,'
  }
  const rendered = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'Text', dimensions: '240 × 160' },
      canvas: renderDocument.canvas,
      document: renderDocument,
      ...(renderPersistedScene ? { image, imageLayer } : {}),
      activeTool,
      textDefaults: TEXT_DEFAULTS,
      zoom: 100,
      fitMode: true,
      t: (key) => key,
    },
  })
  const scene = rendered.getByLabelText('sceneCanvas') as HTMLCanvasElement
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    top: 0,
    right: 240,
    bottom: 160,
    left: 0,
    toJSON: () => ({}),
  })
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => false)
  return { ...rendered, scene }
}
