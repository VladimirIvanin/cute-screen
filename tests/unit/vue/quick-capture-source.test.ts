import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { webcrypto } from 'node:crypto'
import { shallowRef } from 'vue'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorDocumentFromImage,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import {
  QuickCaptureCommitController,
  type QuickCaptureCommitPorts,
} from '../../../apps/desktop/src/quick-capture-commit-controller'
import { arrowDocument } from './app-test-kit'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Quick immutable source versus rendered output', () => {
  it.each(['editor', 'copied', 'saved'] as const)('persists clean crop pixels for %s and keeps output ink separate', async (completion) => {
    vi.stubGlobal('crypto', webcrypto)
    const frozen = createCanvas(100, 100)
    const frozenContext = frozen.getContext('2d')
    frozenContext.fillStyle = '#7f7f7f'
    frozenContext.fillRect(0, 0, 100, 100)
    const scene = createCanvas(100, 100)
    scene.getContext('2d').drawImage(frozen, 0, 0)
    scene.getContext('2d').fillStyle = '#f00'
    scene.getContext('2d').fillRect(30, 30, 10, 10)
    const document = createEditorDocumentFromImage({
      id: arrowDocument().id,
      baseLayerId: '019c1f62-058e-7000-8000-0000000000ac',
      source: { ...arrowDocument().source, provenance: 'capture' },
      timestamp: '2026-10-15T00:00:00.000Z',
    })
    const commit = vi.fn().mockResolvedValue({ outcome: 'captured' })
    const crop = { x: 20, y: 20, width: 60, height: 60 }
    const ports = {
      draft: shallowRef({ draftId: 'draft', width: 100, height: 100 }),
      session: shallowRef({ snapshot: { core: { document: {
        ...document, crop, layers: [...document.layers, arrowDocument().layers[0]!],
      } } } }),
      hosts: shallowRef({ scene }),
      sourceImage: shallowRef(frozen),
      currentCrop: shallowRef(crop),
      materialized: shallowRef(false),
      selectionPending: shallowRef(false),
      coordinator: { commit },
    } as unknown as QuickCaptureCommitPorts
    vi.spyOn(window.document, 'createElement').mockImplementation(() => {
      const canvas = createCanvas(1, 1)
      Object.assign(canvas, {
        toBlob: (callback: (blob: Blob) => void) => {
          const bytes = Uint8Array.from(canvas.toBuffer('image/png'))
          callback({ arrayBuffer: async () => bytes.buffer } as Blob)
        },
      })
      return canvas as unknown as HTMLCanvasElement
    })
    const controller = new QuickCaptureCommitController(ports)
    const outputPng = await controller.resultPng(crop)
    await controller.commit(completion, crop)
    const [, sourcePng, json, recordedCompletion] = commit.mock.calls[0]!
    expect(recordedCompletion).toBe(completion)
    const materialized = JSON.parse(json as string) as EditorDocumentV1
    expect(materialized.layers.map((layer) => layer.id)).toEqual([
      document.layers[0]!.id,
      arrowDocument().layers[0]!.id,
    ])
    expect(materialized.canvas).toEqual({ width: 60, height: 60 })
    const decodedSource = await loadImage(Buffer.from(sourcePng as Uint8Array))
    const decodedOutput = await loadImage(Buffer.from(outputPng))
    const decoded = createCanvas(60, 60)
    decoded.getContext('2d').drawImage(decodedSource, 0, 0)
    expect([...decoded.getContext('2d').getImageData(15, 15, 1, 1).data]).toEqual([127, 127, 127, 255])
    decoded.getContext('2d').drawImage(decodedOutput, 0, 0)
    expect([...decoded.getContext('2d').getImageData(15, 15, 1, 1).data]).toEqual([255, 0, 0, 255])
    expect(ports.materialized.value).toBe(true)
  })
})
