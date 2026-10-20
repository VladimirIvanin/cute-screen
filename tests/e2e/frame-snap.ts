import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { selectionDocument } from './selection-interactions'
import { waitForStableCanvas } from './canvas-ready'
import type { LayerNode } from '../../packages/editor-core/src'

export async function verifyFrameSnapping(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true })
  await waitForStableCanvas()
  const doc = await selectionDocument()
  const frame = doc.crop ?? { x: 0, y: 0, ...doc.canvas }
  const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const scale = rect.width / frame.width
  const client = (x: number, y: number) => ({ x: Math.round(rect.left + (x - frame.x) * scale),
    y: Math.round(rect.top + (y - frame.y) * scale) })
  const pointer = () => browser.action('pointer', { id: 'frame-snap-pointer' })
  const move = async (point: { x: number; y: number }) => pointer().move({ origin: 'viewport', ...point, duration: 120 }).perform(true)
  const down = async (point: { x: number; y: number }) => pointer().move({ origin: 'viewport', ...point }).down().perform(true)
  const up = async () => pointer().up().perform(true)
  const latest = async () => (await selectionDocument()).layers.at(-1)!
  const undo = async (layer: LayerNode) => {
    await browser.keys([Key.Control, 'z'])
    await browser.waitUntil(async () => JSON.stringify(await latest()) === JSON.stringify(layer))
  }
  const bounds = (layer: LayerNode) => ({ x: layer.transform.translateX + layer.localBounds!.x,
    y: layer.transform.translateY + layer.localBounds!.y,
    width: layer.localBounds!.width, height: layer.localBounds!.height })
  await browser.execute(() => {
    const state = window as typeof window & { __frameTrusted?: boolean[] }
    state.__frameTrusted = []
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.addEventListener('pointerdown', (event) => {
      state.__frameTrusted!.push(event.isTrusted)
    })
  })
  try {
    await $('.cs-toolrail [data-tool-id="shape"]').click()
    await down(client(frame.x + frame.width * .3, frame.y + frame.height * .35))
    await move(client(frame.x + frame.width * .55, frame.y + frame.height * .6))
    await up()
    await browser.waitUntil(async () => (await latest()).kind === 'shape' && (await latest()).id !== doc.layers.at(-1)?.id)
    await waitForStableCanvas()
    const original = await latest()
    const b = bounds(original)
    const center = client(b.x + b.width / 2, b.y + b.height / 2)
    const corner = { x: center.x + (frame.x - b.x) * scale, y: center.y + (frame.y - b.y) * scale }
    await down(center)
    await move({ x: Math.round(corner.x + 4), y: Math.round(corner.y + 4) })
    await move({ x: Math.round(corner.x + 11), y: Math.round(corner.y + 11) })
    expect(await latest()).toEqual(original)
    await browser.saveScreenshot(`${directory}/frame-move-held.png`)
    await up()
    const held = await latest()
    expect(bounds(held).x).toBeCloseTo(frame.x, 7)
    expect(bounds(held).y).toBeCloseTo(frame.y, 7)
    expect(held.payload).toEqual(original.payload)
    expect(held.localBounds).toEqual(original.localBounds)
    await undo(original)
    await browser.keys([Key.Control, Key.Shift, 'z'])
    await browser.waitUntil(async () => JSON.stringify(await latest()) === JSON.stringify(held))
    await undo(original)

    await down(client(b.x + b.width, b.y + b.height / 2))
    await move({ x: Math.round(rect.right - 4), y: client(b.x, b.y + b.height / 2).y })
    expect(await latest()).toEqual(original)
    await browser.saveScreenshot(`${directory}/frame-resize-preview.png`)
    await up()
    const resized = await latest()
    expect(bounds(resized).x + bounds(resized).width).toBeCloseTo(frame.x + frame.width, 7)
    expect(bounds(resized).x).toBeCloseTo(b.x, 7)
    expect(resized.payload).toEqual(original.payload)
    await undo(original)
    await browser.keys([Key.Control, Key.Shift, 'z'])
    await browser.waitUntil(async () => JSON.stringify(await latest()) === JSON.stringify(resized))
    await undo(original)

    await down(client(b.x + b.width, b.y + b.height / 2))
    await browser.action('key', { id: 'frame-snap-key' }).down(Key.Control).perform(true)
    await move({ x: Math.round(rect.right - 4), y: center.y })
    await up()
    await browser.action('key', { id: 'frame-snap-key' }).up(Key.Control).perform(true)
    const bypassed = await latest()
    expect((frame.x + frame.width - bounds(bypassed).x - bounds(bypassed).width) * scale).toBeCloseTo(4, 0)
    await undo(original)
    await down(center)
    await move({ x: Math.round(corner.x + 4), y: Math.round(corner.y + 4) })
    await browser.keys(Key.Escape)
    await up()
    expect(await latest()).toEqual(original)
    const trusted = await browser.execute(() => {
      return (window as typeof window & { __frameTrusted: boolean[] }).__frameTrusted
    })
    expect(trusted.length).toBeGreaterThan(3)
    expect(trusted.every(Boolean)).toBe(true)
    const evidence = { frame, scale, original, held, resized, bypassed, trusted }
    await writeFile(`${directory}/frame-snap.json`, JSON.stringify(evidence, null, 2))
  } finally {
    await browser.releaseActions()
  }
}
