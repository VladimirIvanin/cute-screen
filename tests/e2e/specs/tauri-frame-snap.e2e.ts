import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyFrameSnapping } from '../frame-snap'
import { waitForStableCanvas } from '../canvas-ready'
import { selectionDocument } from '../selection-interactions'
import { writeFile } from 'node:fs/promises'
import { nativeImageIngress } from '../image-ingress'

async function verifyQuickFrame(): Promise<void> {
  const initial = await selectionDocument()
  const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  const scale = rect.width / initial.canvas.width
  const pointer = () => browser.action('pointer', { id: 'quick-frame-snap' })
  let last = { x: 0, y: 0 }
  const move = async (x: number, y: number) => {
    last = { x: Math.round(x), y: Math.round(y) }
    await pointer().move({ origin: 'viewport', ...last, duration: 120 }).perform(true)
  }
  const drag = async (fromX: number, fromY: number, toX: number, toY: number) => {
    await pointer().move({ origin: 'viewport', x: Math.round(fromX), y: Math.round(fromY) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(toX), y: Math.round(toY), duration: 120 })
      .up({ button: 'left' }).perform()
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await waitForStableCanvas()
  }
  await drag(rect.left + 2, rect.top + 2, rect.left + rect.width * .18, rect.top + rect.height * .18)
  const crop = (await selectionDocument()).crop!
  expect(crop.x).toBeGreaterThan(0)
  expect(crop.y).toBeGreaterThan(0)
  const start = { x: rect.left + crop.x * scale + 1,
    y: rect.top + (crop.y + crop.height * .25) * scale }
  const target = { x: start.x - crop.x * scale, y: start.y - crop.y * scale }
  await pointer().move({ origin: 'viewport', x: Math.round(start.x), y: Math.round(start.y) })
    .down({ button: 'left' }).perform(true)
  await move(target.x + 4, target.y + 4)
  await move(target.x + 11, target.y + 11)
  expect((await selectionDocument()).crop).toEqual(crop)
  await browser.saveScreenshot('artifacts/tauri-e2e/quick-frame-move-held.png')
  await pointer().move({ origin: 'viewport', ...last }).up({ button: 'left' }).perform()
  const moved = (await selectionDocument()).crop!
  expect(moved.x).toBe(0)
  expect(moved.y).toBe(0)
  expect(moved.width).toBe(crop.width)
  expect(moved.height).toBe(crop.height)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => JSON.stringify((await selectionDocument()).crop) === JSON.stringify(crop))
  await drag(rect.left + crop.x * scale, rect.top + crop.y * scale, rect.left + 4, rect.top + 4)
  const resized = (await selectionDocument()).crop ?? { x: 0, y: 0, ...initial.canvas }
  expect(resized.x).toBe(0)
  expect(resized.y).toBe(0)
  expect(resized.width).toBe(initial.canvas.width)
  expect(resized.height).toBe(initial.canvas.height)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => JSON.stringify((await selectionDocument()).crop) === JSON.stringify(crop))
  await writeFile('artifacts/tauri-e2e/quick-frame-snap.json', JSON.stringify({ crop, moved, resized, rect, scale }, null, 2))
}

describe('frame magnet in native Editor', () => {
  it('uses production Capture → Quick → Editor and trusted move/resize', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await verifyQuickFrame()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyFrameSnapping('artifacts/frame-snap/native-crop')
    await nativeImageIngress('picker', 'ui-4k.png')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await selectionDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    await verifyFrameSnapping('artifacts/frame-snap/native-4k')
  }).timeout(180000)
})
