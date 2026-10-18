import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import {
  copyFile,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { selectionDocument } from './selection-interactions'
import { waitForStableCanvas } from './canvas-ready'

export async function quickWindowVisibility(): Promise<{ main: boolean; quick: boolean }> {
  return browser.execute(async () => {
    const native = window as unknown as {
      __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } }
    }
    return {
      main: await native.__TAURI__.core.invoke<boolean>('plugin:window|is_visible', { label: 'main' }),
      quick: await native.__TAURI__.core.invoke<boolean>('plugin:window|is_visible', { label: 'quick-capture' }),
    }
  })
}

export async function verifyQuickHistoryDocument(): Promise<void> {
  await waitForStableCanvas()
  const document = await selectionDocument()
  expect(document.layers.some((layer) => layer.kind === 'pencil')).toBe(true)
  expect(document.layers.some((layer) => layer.kind === 'text' && layer.payload.content.text === 'History note')).toBe(true)
  await $('.cs-history-trigger').click()
  await expect(browser.$$('.cs-history-capture')).toBeElementsArrayOfSize(1)
  await $('.cs-history-capture').click()
  await waitForStableCanvas()
  const original = await browser.execute(async () => {
    const native = window as unknown as {
      __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } }
    }
    const record = await native.__TAURI__.core.invoke<{ imageToken: string }>('repository_open_last', {
      correlationId: 'quick-history-original',
    })
    const bytes = await native.__TAURI__.core.invoke<ArrayBuffer>('read_image_bytes', {
      token: record.imageToken, correlationId: 'quick-history-original',
    })
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = window.document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const hash = await crypto.subtle.digest('SHA-256', pixels)
    const result = {
      width: image.width, height: image.height,
      sha256: [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join(''),
    }
    image.close()
    return result
  })
  const crop = JSON.parse(await readFile('artifacts/tauri-e2e/quick-history-crop.json', 'utf8')) as {
    x: number
    y: number
    width: number
    height: number
  }
  const fixture = await loadImage('tests/fixtures/generated/ui-4k.png')
  const clean = createCanvas(crop.width, crop.height)
  clean.getContext('2d').drawImage(fixture, -crop.x, -crop.y)
  const cleanPixels = clean.getContext('2d').getImageData(0, 0, crop.width, crop.height).data
  expect(original.width).toBe(document.canvas.width)
  expect(original.height).toBe(document.canvas.height)
  expect(original.sha256).toBe(createHash('sha256').update(cleanPixels).digest('hex'))
  const output = await browser.execute(async () => {
    const native = window as unknown as {
      __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } }
    }
    return native.__TAURI__.core.invoke<string>('test_result_export', { cancel: false })
  })
  await $('button[aria-label="Export"]').click()
  await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
  const exported = await loadImage(await readFile(output))
  expect([exported.width, exported.height]).toEqual([crop.width, crop.height])
  const rendered = createCanvas(exported.width, exported.height)
  rendered.getContext('2d').drawImage(exported, 0, 0)
  const pixels = rendered.getContext('2d').getImageData(0, 0, exported.width, exported.height).data
  let ink = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] !== cleanPixels[i] ||
      pixels[i + 1] !== cleanPixels[i + 1] ||
      pixels[i + 2] !== cleanPixels[i + 2]
    ) ink++
  }
  expect(ink).toBeGreaterThan(100)
  await copyFile(output, 'artifacts/tauri-e2e/quick-history-export.png')
  await writeFile('artifacts/tauri-e2e/quick-history-decoded.json', JSON.stringify({ original, ink }, null, 2))
}
