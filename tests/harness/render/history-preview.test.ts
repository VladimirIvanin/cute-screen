import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createCensorLayer,
  createEditorDocumentFromImage,
} from '@cute-screen/editor-core'
import { renderHistoryThumbnail } from '../../../packages/editor-vue/src/history/thumbnail-render'

afterEach(() => vi.unstubAllGlobals())
describe('saved-result history previews', () => {
  it('renders a production-sized original through crop and censorship and decodes the resulting PNG', async () => {
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(
        width: number,
        height: number,
      ) {
        return createCanvas(width, height)
      }
    })
    const original = createCanvas(3840, 2160)
    const context = original.getContext('2d')
    context.fillStyle = '#dd0000'
    context.fillRect(0, 0, 3840, 2160)
    context.fillStyle = '#1266cc'
    context.fillRect(512, 256, 2048, 1024)
    const source = await loadImage(original.toBuffer('image/png'))
    const base = createEditorDocumentFromImage({ id: crypto.randomUUID(), baseLayerId: crypto.randomUUID(), timestamp: '2026-10-17T00:00:00.000Z', source: {
      blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', width: 3840, height: 2160,
      orientationApplied: true, provenance: 'capture', color: { colorSpace: 'srgb', hasIccProfile: false },
    } })
    const censor = createCensorLayer({
      id: crypto.randomUUID(),
      region: { kind: 'rectangle', bounds: { x: 1024, y: 512, width: 512, height: 512 } },
      effect: { mode: 'solid', color: { red: 0, green: 0, blue: 0, alpha: 1 } },
    })
    const saved = { ...base, crop: { x: 512, y: 256, width: 2048, height: 1024 }, layers: [...base.layers, censor] }
    const result = createCanvas(1, 1)
    const images = new Map([[base.source.blobHash, source as unknown as ImageBitmap]])
    const canvas = result as unknown as HTMLCanvasElement
    const overlay = createCanvas(1, 1) as unknown as HTMLCanvasElement
    await renderHistoryThumbnail(saved, images, canvas, overlay)
    const decoded = await loadImage(result.toBuffer('image/png'))
    expect([decoded.width, decoded.height]).toEqual([256, 128])
    const probe = createCanvas(256, 128)
    probe.getContext('2d').drawImage(decoded, 0, 0)
    expect([...probe.getContext('2d').getImageData(96, 64, 1, 1).data]).toEqual([0, 0, 0, 255])
    expect([...probe.getContext('2d').getImageData(10, 10, 1, 1).data]).toEqual([18, 102, 204, 255])
  })
})
