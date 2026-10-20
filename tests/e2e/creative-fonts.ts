import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import {
  copyFile,
  readFile,
} from 'node:fs/promises'
import {
  $,
  expect,
} from '@wdio/globals'
import { TEXT_FONT_FAMILIES } from '../../packages/editor-vue/src/text-fonts'
import {
  cardDocument,
  cardNative,
} from './publication-card'
import { waitForStableCanvas } from './canvas-ready'

export const CREATIVE_FONT_FAMILIES = TEXT_FONT_FAMILIES.slice(12)
export const CREATIVE_FONT_TEXT = 'Ёжик и съёмка Aa 123 — Широкий заголовок'

export async function verifyCreativeFontLayers(): Promise<void> {
  const document = await cardDocument()
  const layers = document.layers.filter((layer) => layer.kind === 'text')
  expect(layers).toHaveLength(8)
  for (const [index, layer] of layers.entries()) {
    if (layer.kind !== 'text') throw new Error('Expected a text layer')
    expect(layer.payload.content.text).toBe(CREATIVE_FONT_TEXT)
    expect(layer.payload.content.spans.every((span) => span.fontFamily === CREATIVE_FONT_FAMILIES[index] &&
      span.fontSize === 48 &&
      span.weight === 700 &&
      span.italic)).toBe(true)
    expect(layer.localBounds.height).toBeGreaterThan(48)
    expect(layer.localBounds.width).toBeLessThanOrEqual(480)
  }
}

/** Decode full-size Save As pixels and prove every font adds ink independently of preview DPI. */
export async function verifyCreativeFontExport(prefix: string): Promise<string> {
  await waitForStableCanvas()
  const output = await cardNative<string>('test_result_export', { cancel: false })
  await $('button[aria-label="Export"]').click()
  await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
  const image = await loadImage(await readFile(output))
  expect([image.width, image.height]).toEqual([3840, 2160])
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const hash = createHash('sha256').update(context.getImageData(0, 0, image.width, image.height).data).digest('hex')
  const original = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
  const source = createCanvas(original.width, original.height).getContext('2d')
  source.drawImage(original, 0, 0)
  for (const layer of (await cardDocument()).layers.filter((layer) => layer.kind === 'text')) {
    const x = Math.max(0, Math.floor(layer.transform.translateX + layer.localBounds.x))
    const y = Math.max(0, Math.floor(layer.transform.translateY + layer.localBounds.y))
    const width = Math.min(image.width - x, Math.ceil(layer.localBounds.width))
    const height = Math.min(image.height - y, Math.ceil(layer.localBounds.height))
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    const actual = context.getImageData(x, y, width, height).data
    const baseline = source.getImageData(x, y, width, height).data
    const changed = actual.reduce((count, value, index) => count + Number(value !== baseline[index]), 0)
    expect(changed).toBeGreaterThan(80)
  }
  await copyFile(output, `artifacts/tauri-e2e/${prefix}.png`)
  return hash
}
