import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  readFile,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  CommandManager,
  createDocumentRenderScene,
  createDrawingLayer,
  type ImageLayer,
} from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  type Canvas2DLike,
} from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import { SceneDocumentController } from '../../../packages/editor-vue/src/shell/canvas/scene-document-controller'
import { CanvasGeometryController } from '../../../packages/editor-vue/src/shell/canvas/geometry-controller'
import type { CanvasGesture } from '../../../packages/editor-vue/src/shell/canvas/workspace-state'
import type { CanvasViewportProps } from '../../../packages/editor-vue/src/shell/canvas/contracts'

describe('image gesture decoded pixels', () => {
  it.each(['base', 'content'] as const)('renders %s in scene order with reflected scale, radius and border on a 4K composition', async (role) => {
    const source = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
    const image: ImageLayer = {
      ...documentFixture.layers[0] as ImageLayer,
      locked: false, opacity: .8,
      localBounds: { x: 0, y: 0, width: 3840, height: 2160 },
      transform: { translateX: 3200, translateY: 350, rotation: 0, scaleX: -.65, scaleY: .65 },
      payload: { ...(documentFixture.layers[0] as ImageLayer).payload, role,
        intrinsicWidth: 3840, intrinsicHeight: 2160,
        crop: null, mask: null, radius: 80, border: { color: { red: 1, green: 0, blue: .5, alpha: 1 }, width: 12,
          style: 'solid', cap: 'round', join: 'round' } },
    }
    const top = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000099', tool: 'shape',
      start: { x: 1500, y: 700 }, end: { x: 2600, y: 1400 } })!
    const document = { ...documentFixture, canvas: { width: 3840, height: 2160 }, layers: [image, top] }
    const manager = new CommandManager(document)
    let gesture: CanvasGesture
    const props: CanvasViewportProps = { document, canvas: document.canvas, t: (key) => key,
      documentState: { kind: 'ready', title: 'Image', dimensions: '3840 × 2160' } }
    const geometry = new CanvasGeometryController({ props, gesture: () => gesture })
    const controller = new SceneDocumentController({ props, gesture: () => gesture,
      previewLayer: () => geometry.gesturePreviewLayer(), moveLoupeSource: (layer) => layer })
    const canvas = createCanvas(3840, 2160)
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await renderer.initialize({ scene: canvas as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'image-gesture' })
    await renderer.createImageResource({ id: image.payload.blobHash, width: 3840, height: 2160,
      source: source as unknown as HTMLImageElement })
    const hash = () => createHash('sha256').update(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).digest('hex')
    const render = () => {
      renderer.setScene(createDocumentRenderScene(controller.documentForScene()!))
      renderer.render(['scene'])
      return hash()
    }
    try {
      const initial = render()
      const states: NonNullable<CanvasGesture>[] = [
        { kind: 'move', id: image.id, start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, guides: [], guidesVisible: false },
        { kind: 'move', id: image.id, start: { x: 0, y: 0 }, current: { x: 180, y: -120 }, guides: [], guidesVisible: false },
        { kind: 'resize', id: image.id, handle: 'se', start: { x: 704, y: 1754 }, current: { x: 1000, y: 1550 },
          initial: image.transform, freeResize: false, centerResize: false },
        { kind: 'rotate', id: image.id, center: { x: 1952, y: 1052 }, startAngle: 0, currentAngle: 33, initial: image.transform },
      ]
      for (const state of states) {
        gesture = state
        const preview = geometry.gesturePreviewLayer()!
        expect(geometry.gesturePreviewNodes()).toEqual([])
        const held = render()
        const projected = controller.documentForScene()!
        expect(projected.layers.map((layer) => layer.id)).toEqual([image.id, top.id])
        if (state === states[0]) expect(held).toBe(initial)
        else expect(held).not.toBe(initial)
        manager.execute({ type: 'updateLayer', before: image, after: preview })
        renderer.setScene(createDocumentRenderScene(manager.snapshot.document))
        renderer.render(['scene'])
        expect(hash()).toBe(held)
        const exported = await renderer.exportPng()
        const decoded = await loadImage(exported)
        const output = createCanvas(decoded.width, decoded.height)
        output.getContext('2d').drawImage(decoded, 0, 0)
        expect(createHash('sha256').update(output.getContext('2d').getImageData(0, 0, decoded.width, decoded.height).data).digest('hex')).toBe(held)
        if (state.kind === 'rotate') {
          await mkdir('artifacts/image-settings', { recursive: true })
          await writeFile(`artifacts/image-settings/${role}-rotate-decoded.png`, exported)
        }
        manager.undo()
        expect(manager.snapshot.document).toEqual(document)
        manager.redo()
        expect(manager.snapshot.document.layers[0]).toEqual(preview)
        manager.undo()
        gesture = undefined
        expect(render()).toBe(initial)
      }
    } finally {
      renderer.dispose()
    }
  }, 60_000)
})
