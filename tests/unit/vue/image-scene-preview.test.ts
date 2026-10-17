import {
  describe,
  expect,
  it,
} from 'vitest'
import type { ImageLayer } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  SceneDocumentController,
  requiresScenePreview,
} from '../../../packages/editor-vue/src/shell/canvas/scene-document-controller'
import type { CanvasGesture } from '../../../packages/editor-vue/src/shell/canvas/workspace-state'
import { CanvasGeometryController } from '../../../packages/editor-vue/src/shell/canvas/geometry-controller'

describe('ordered image gesture preview', () => {
  it('keeps the exact fractional transform for a click before dragging starts', () => {
    const image = { ...documentFixture.layers[0] as ImageLayer,
      transform: { ...(documentFixture.layers[0] as ImageLayer).transform, translateX: .1, translateY: .2 } }
    const point = { x: 100.2, y: 90.3 }
    const geometry = new CanvasGeometryController({ props: {
      document: { ...documentFixture, layers: [image] }, t: (key) => key,
      documentState: { kind: 'ready', title: 'Image', dimensions: '800 × 600' },
    }, gesture: () => ({ kind: 'move', id: image.id, start: point, current: point,
      dragging: false, guides: [], guidesVisible: false }) })
    expect(geometry.previewTransform(image)).toBe(image.transform)
  })
  it('does not resize at pointerdown when grabbing inside the handle hit area', () => {
    const image = { ...documentFixture.layers[0] as ImageLayer, locked: false }
    const gesture: CanvasGesture = { kind: 'resize', id: image.id, handle: 'ne',
      start: { x: 651.7, y: 16.2 }, current: { x: 651.7, y: 16.2 }, initial: image.transform,
      freeResize: false, centerResize: false }
    const geometry = new CanvasGeometryController({ props: {
      document: { ...documentFixture, layers: [image] }, t: (key) => key,
      documentState: { kind: 'ready', title: 'Image', dimensions: '800 × 600' },
    }, gesture: () => gesture })
    expect(geometry.gesturePreviewLayer()?.transform).toEqual(image.transform)
  })
  it.each(['base', 'content'] as const)('keeps a %s image in its original scene slot from pointerdown through cancel', (role) => {
    const image: ImageLayer = { ...documentFixture.layers[0] as ImageLayer, locked: false,
      payload: { ...(documentFixture.layers[0] as ImageLayer).payload, role } }
    const above = { ...image, id: 'above', opacity: 0.5 }
    const document = { ...documentFixture, layers: [image, above] }
    let gesture: CanvasGesture = { kind: 'move', id: image.id, start: { x: 0, y: 0 },
      current: { x: 0, y: 0 }, guides: [], guidesVisible: false, dragging: false }
    let preview: ImageLayer | undefined = image
    const controller = new SceneDocumentController({
      props: { document, t: (key) => key, documentState: { kind: 'ready', title: 'Image', dimensions: '800 × 600' } }, gesture: () => gesture, previewLayer: () => preview,
      moveLoupeSource: (layer) => layer,
    })
    expect(requiresScenePreview(image)).toBe(true)
    expect(controller.documentForScene()?.layers).toEqual([image, above])
    for (const kind of ['move', 'resize', 'rotate'] as const) {
      const transform = { ...image.transform, translateX: 40, rotation: kind === 'rotate' ? 37 : 0,
        scaleX: kind === 'resize' ? 0.6 : 1 }
      preview = { ...image, transform }
      gesture = kind === 'move'
        ? { kind, id: image.id, start: { x: 0, y: 0 }, current: { x: 28, y: 0 }, guides: [], guidesVisible: false }
        : kind === 'resize'
          ? { kind, id: image.id, handle: 'se', start: { x: 0, y: 0 }, current: { x: 30, y: 30 },
              initial: image.transform, freeResize: false, centerResize: false }
          : { kind, id: image.id, center: { x: 320, y: 240 },
              startAngle: 0, currentAngle: 37, initial: image.transform }
      expect(controller.documentForScene()?.layers).toEqual([preview, above])
      expect(document.layers).toEqual([image, above])
    }
    gesture = undefined
    preview = undefined
    expect(controller.documentForScene()).toBe(document)
  })
})
