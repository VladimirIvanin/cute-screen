import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from './canvas-ready'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { setNumericInput } from './numeric-input'

export interface GradientSnapshot {
  canvas: { width: number
    height: number }
  crop: { x: number
    y: number
    width: number
    height: number } | null
  layers: {
    id: string
    kind: string
    locked: boolean
    opacity: number
    transform: { translateX: number
      translateY: number
      rotation: number }
    localBounds: { width: number
      height: number }
    payload: { annotationTool?: string
      fill?: { kind: string
        start: { x: number
          y: number }
        end: { x: number
          y: number }
        stops: unknown[] } } }[]
}
export async function gradientDocument(): Promise<GradientSnapshot> {
  return await shapeDocument() as unknown as GradientSnapshot
}
async function canvasRect() {
  await waitForStableCanvas()
  return browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
}
async function tool(id: string): Promise<void> {
  await $(`.cs-toolrail [data-tool-id="${id}"]`).click()
  await browser.action('pointer').move({ origin: 'viewport', x: 5, y: 5 }).perform()
}
async function drag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(start.x), y: Math.round(start.y) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(end.x), y: Math.round(end.y), duration: 180 })
    .up({ button: 'left' }).perform()
}
export async function verifyGradient(directory: string): Promise<void> {
  await tool('gradient')
  const rect = await canvasRect()
  await drag(
    { x: rect.left + rect.width * .15, y: rect.top + rect.height * .42 },
    { x: rect.left + rect.width * .82, y: rect.top + rect.height * .87 },
  )
  const toolbar = $('.cs-selection-floating-toolbar .cs-gradient-toolbar')
  await expect(toolbar).toBeDisplayed()
  const initial = (await gradientDocument()).layers.at(-1)!
  expect(initial.payload).toMatchObject({ annotationTool: 'gradient', fill: { kind: 'linearGradient', start: { x: .5, y: 1 }, end: { x: .5, y: 0 } } })
  await toolbar.$('button[aria-label="Placement"]').click()
  await $('[data-gradient-placement="gradientFitWidth"]').click()
  await browser.keys('Escape')
  const document = await gradientDocument(), full = document.layers.at(-1)!
  const frame = document.crop ?? { x: 0, y: 0, ...document.canvas }
  expect(full.transform.translateX).toBe(frame.x)
  expect(full.localBounds.width).toBe(frame.width)
  await toolbar.$('button=Transition').click()
  const currentRect = await canvasRect()
  const x = currentRect.left + currentRect.width * .5
  const y = currentRect.top + (full.transform.translateY - frame.y) / frame.height * currentRect.height
  const before = JSON.stringify(full.payload.fill)
  await drag({ x, y }, { x: x + 35, y: y + 30 })
  await browser.waitUntil(async () => JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) !== before)
  const adjusted = (await gradientDocument()).layers.at(-1)!
  expect(adjusted.localBounds).toEqual(full.localBounds)
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) === before)
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () =>
    JSON.stringify((await gradientDocument()).layers.at(-1)!.payload.fill) === JSON.stringify(adjusted.payload.fill))
  await toolbar.$('button[aria-label="Gradient settings"]').click()
  await waitForShapeAnimation()
  await $('button[aria-label="Add gradient stop"]').click()
  await browser.waitUntil(async () => (await gradientDocument()).layers.at(-1)!.payload.fill!.stops.length === 3)
  const opacity = $('input[aria-label="Stop opacity"]')
  await setNumericInput(opacity, '40')
  await browser.keys('Enter')
  await browser.keys('Escape')
  await $('.cs-gradient-popover').waitForExist({ reverse: true })
  await toolbar.$('button=Size').click()
  await browser.saveScreenshot(`${directory}/gradient.png`)
  await tool('text')
  const textRect = await canvasRect()
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(textRect.left + textRect.width * .3), y: Math.round(textRect.top + textRect.height * .8) }).down({ button: 'left' }).up({ button: 'left' }).perform()
  await $('.cs-text-editor').waitForDisplayed()
  await $('[data-text-control="color"] button').click()
  await $('button[aria-label="White"]').click()
  await $('[data-text-control="size"]').click()
  const fontSize = Math.min(144, Math.max(18, Math.round(28 * frame.width / textRect.width)))
  await setNumericInput($('input[aria-label="Font size value"]'), String(fontSize))
  await browser.keys('Enter')
  await browser.keys('Escape')
  await $('.cs-text-editor').click()
  await browser.keys('Gradient backdrop')
  await browser.keys(['Control', 'Enter'])
  await browser.waitUntil(async () => (await gradientDocument()).layers.some((layer) => layer.kind === 'text' && (layer.payload as unknown as { content?: { text: string } }).content?.text === 'Gradient backdrop'))
  await browser.saveScreenshot(`${directory}/gradient-text.png`)
  await writeFile(`${directory}/gradient-document.json`, JSON.stringify(await gradientDocument(), null, 2))
}
