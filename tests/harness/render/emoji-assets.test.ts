import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  describe,
  it,
  expect,
} from 'vitest'
import {
  EMOJI_CATALOG,
  EMOJI_CATEGORIES,
  QUICK_EMOJI_IDS,
  NOTO_EMOJI_COMMIT,
  createPlacedEmoji,
  emojiResourceId,
  createDocumentRenderScene,
  searchEmoji,
  emojiAssetId,
  resizeLayerGeometry,
  transformPoint,
  transformToMatrix,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import {
  baseDocument,
  IDS,
} from '../../../packages/editor-core/src/precision-tools.test-kit'

const assets = new URL('../../../packages/editor-vue/src/emoji/assets/', import.meta.url)
describe('licensed Noto artwork through the renderer', () => {
  it('checks provenance and decodes visible artwork for all 100 assets', async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', assets), 'utf8')) as { commit: string; files: Record<string, string> }
    expect(manifest.commit).toBe(NOTO_EMOJI_COMMIT)
    expect(EMOJI_CATALOG).toHaveLength(100)
    expect(new Set(EMOJI_CATALOG.map((entry) => entry.id)).size).toBe(100)
    for (const category of EMOJI_CATEGORIES) {
      expect(EMOJI_CATALOG.filter((entry) => entry.category === category.id)).toHaveLength(20)
    }
    expect(QUICK_EMOJI_IDS).toContain('1f525')
    expect(QUICK_EMOJI_IDS).toContain('26a1')
    expect(QUICK_EMOJI_IDS as readonly string[]).not.toContain('1f41b')
    for (const entry of EMOJI_CATALOG) {
      const name = `emoji_u${entry.id}.svg`
      const bytes = await readFile(new URL(name, assets))
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(manifest.files[name])
      const decoded = await loadImage(bytes)
      const canvas = createCanvas(32, 32)
      canvas.getContext('2d').drawImage(decoded, 0, 0, 32, 32)
      const pixels = canvas.getContext('2d').getImageData(0, 0, 32, 32).data
      expect(pixels.some((alpha, index) => index % 4 === 3 && alpha > 100), name).toBe(true)
    }
    expect(searchEmoji('огонек')[0]?.id).toBe('1f525')
    expect(searchEmoji('lightning')[0]?.id).toBe('26a1')
    expect(emojiAssetId('⚠️')).toBe(emojiAssetId('⚠'))
  })
  it('exports and decodes the same rotated emoji pixels at a non-origin crop', async () => {
    const layer = createPlacedEmoji(IDS.censor, '1f525', { x: 120, y: 120 }, 64, { x: 80, y: 80, width: 160, height: 100 })
    const document = {
      ...baseDocument(), crop: { x: 80, y: 80, width: 160, height: 100 },
      layers: [{ ...layer, transform: { ...layer.transform, rotation: 12 } }],
    }
    const canvas = createCanvas(1, 1)
    const renderer = new Canvas2DRenderer({ exportCanvas: (width, height) => createCanvas(width, height) as unknown as import('../../../packages/editor-renderer/src/backends/canvas2d/contracts').Canvas2DLike })
    try {
      await renderer.initialize({ scene: canvas as unknown as HTMLCanvasElement, overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'emoji-export' })
      const image = await loadImage(await readFile(new URL('emoji_u1f525.svg', assets)))
      await renderer.createImageResource({
        id: emojiResourceId(layer.payload.asset), width: image.width, height: image.height,
        source: image as unknown as HTMLImageElement,
      })
      renderer.setScene(createDocumentRenderScene(document))
      renderer.render(['scene'])
      const exported = await loadImage(await renderer.exportPng())
      expect([exported.width, exported.height]).toEqual([160, 100])
      const result = createCanvas(160, 100)
      result.getContext('2d').drawImage(exported, 0, 0)
      expect([...result.getContext('2d').getImageData(0, 0, 160, 100).data]).toEqual([...canvas.getContext('2d').getImageData(0, 0, 160, 100).data])
    } finally {
      renderer.dispose()
    }
  })
})

describe('resized emoji pixels', () => {
  for (const handle of ['sw', 'nw', 'ne', 'se'] as const) {
    it(`paints and exports offset bounds after ${handle} resize with rotation/flip`, async () => {
      const placed = createPlacedEmoji(IDS.censor, '1f525', { x: 350, y: 250 }, 64, { x: 0, y: 0, width: 800, height: 600 })
      const before = { ...placed, transform: { ...placed.transform, rotation: 27, scaleX: -1 } }
      const after = resizeLayerGeometry(before, handle, transformPoint(transformToMatrix(before.transform), {
        x: handle.includes('w') ? -32 : 96, y: handle.includes('n') ? -32 : 96,
      }), { preserveAspect: true })
      const canvas = createCanvas(1, 1)
      const renderer = new Canvas2DRenderer({ exportCanvas: (width, height) => createCanvas(width, height) as unknown as import('../../../packages/editor-renderer/src/backends/canvas2d/contracts').Canvas2DLike })
      try {
        await renderer.initialize({ scene: canvas as unknown as HTMLCanvasElement, overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'emoji-corner-export' })
        const image = await loadImage(await readFile(new URL('emoji_u1f525.svg', assets)))
        await renderer.createImageResource({
          id: emojiResourceId(before.payload.asset),
          width: image.width,
          height: image.height,
          source: image as unknown as HTMLImageElement })
        renderer.setScene(createDocumentRenderScene({ ...baseDocument(), layers: [after] }))
        renderer.render(['scene'])
        const expected = createCanvas(800, 600)
        const context = expected.getContext('2d')
        context.translate(before.transform.translateX, before.transform.translateY)
        context.rotate(27 * Math.PI / 180)
        context.scale(-1, 1)
        context.drawImage(image, handle.includes('w') ? -32 : 0, handle.includes('n') ? -32 : 0, 96, 96)
        const reference = expected.getContext('2d').getImageData(0, 0, 800, 600).data
        const pixels = canvas.getContext('2d').getImageData(0, 0, 800, 600).data
        // Equivalent matrix compositions can differ by one antialiasing level.
        const difference = pixels.reduce((sum, value, index) => sum + Math.abs(value - reference[index]!), 0)
        expect(difference / pixels.length).toBeLessThan(0.01)
        const exported = await loadImage(await renderer.exportPng())
        expect([exported.width, exported.height]).toEqual([800, 600])
        const decoded = createCanvas(800, 600)
        decoded.getContext('2d').drawImage(exported, 0, 0)
        const decodedPixels = decoded.getContext('2d').getImageData(0, 0, 800, 600).data
        expect(Buffer.from(decodedPixels).equals(Buffer.from(pixels))).toBe(true)
      } finally {
        renderer.dispose()
      }
    })
  }
})
