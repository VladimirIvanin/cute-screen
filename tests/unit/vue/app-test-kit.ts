import { render } from '@testing-library/vue'
import App from '../../../apps/desktop/src/App.vue'
import { selectLayerFromPanel } from './layer-selection'
import {
  createEditorShellPinia,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'

export function renderApp() {
  return render(App, { global: { plugins: [createEditorShellPinia()] } })
}

export function arrowDocument(locked = false): EditorDocumentV1 {
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-0000000000aa',
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
        id: '019c1f62-058e-7000-8000-0000000000ab',
        kind: 'arrow',
        localBounds: { x: 0, y: 0, width: 60, height: 20 },
        transform: {
          translateX: 10,
          translateY: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 0.4,
        blendMode: 'screen',
        shadows: [],
        visible: true,
        locked,
        payload: {
          path: 'straight',
          start: { x: 0, y: 0 },
          end: { x: 60, y: 20 },
          startCap: 'none',
          endCap: 'solidArrow',
          stroke: {
            color: { red: 0.9, green: 0.2, blue: 0.3, alpha: 1 },
            width: 3,
            style: 'dotted',
            cap: 'round',
            join: 'round',
          },
        },
      },
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
}

export function arrowSession(
  document = arrowDocument(),
): DocumentSessionController {
  return new DocumentSessionController({
    document,
    revision: 1,
    bridge: {
      saveDocument: async () => 2,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
    correlationId: () => 'arrow-toolbar-test',
    debounceMs: 60_000,
  })
}

export function divergentArrowDocument(): EditorDocumentV1 {
  const document = arrowDocument()
  const arrow = document.layers[0]
  if (!arrow || arrow.kind !== 'arrow') throw new Error('expected arrow')
  return {
    ...document,
    layers: [
      {
        ...arrow,
        payload: {
          ...arrow.payload,
          path: 'quadratic',
          bend: { x: 30, y: -15 },
          startCap: 'lineArrow',
          endCap: 'diamond',
          stroke: {
            ...arrow.payload.stroke,
            color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
            width: 3,
            style: 'dotted',
          },
        },
      },
    ],
  }
}

export async function selectArrowLayer(view: ReturnType<typeof render>) {
  return selectLayerFromPanel(view)
}
