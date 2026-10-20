import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

async function selectTool(tool: 'Shape' | 'Arrow'): Promise<void> {
  await $(`button[aria-label="${tool}"]`).click()
  await browser.action('pointer').move({ origin: 'viewport', x: 10, y: 10 }).perform()
  await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll('.n-tooltip')].every((item) =>
    Number(getComputedStyle(item).opacity) === 0 || item.getBoundingClientRect().width === 0)))
}

async function key(action: 'undo' | 'redo'): Promise<void> {
  await browser.keys(action === 'undo' ? ['Control', 'z'] : ['Control', 'Shift', 'z'])
}

export async function drawingDefaultsHost(): Promise<string> {
  const inline = '.cs-tool-defaults-toolbar:not([aria-hidden="true"])'
  if (await $(inline).isDisplayed()) return inline
  const popup = '.cs-tool-configure-popover-host'
  if (!(await $(popup).isDisplayed())) await $('.cs-quick-settings-button').click()
  await $(popup).waitForDisplayed()
  return popup
}

async function closeDefaultsPopup(): Promise<void> {
  const popup = $('.cs-tool-configure-popover-host')
  if (!(await popup.isDisplayed())) return
  await browser.keys('Escape')
  await popup.waitForExist({ reverse: true })
}

async function draw(
  tool: 'Shape' | 'Arrow',
  row: number,
): Promise<void> {
  await selectTool(tool)
  await waitForStableCanvas()
  const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  await browser.execute(() => {
    const state = window as typeof window & { __handDrawnEvents?: unknown[] }
    state.__handDrawnEvents = []
    for (const type of ['pointerdown', 'pointermove', 'pointerup'])
      document.addEventListener(type, (event) => {
        const pointer = event as PointerEvent
        state.__handDrawnEvents!.push({ type, x: pointer.clientX, y: pointer.clientY,
          target: (pointer.target as Element).className, trusted: pointer.isTrusted })
      }, { capture: true, once: true })
  })
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * 0.2), y: Math.round(rect.top + rect.height * row) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * 0.65), y: Math.round(rect.top + rect.height * (row + 0.18)), duration: 250 })
    .up({ button: 'left' }).perform()
  try {
    await expect($('.cs-selection-floating-toolbar')).toExist()
  } catch (cause) {
    const diagnostics = await browser.execute(() => {
      const state = window as typeof window & {
        __handDrawnEvents?: unknown[]
        __cuteScreenE2eQuick?: { snapshot(): unknown }
      }
      return { events: state.__handDrawnEvents, quick: state.__cuteScreenE2eQuick?.snapshot(),
        text: document.body.innerText, canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON() }
    })
    throw new Error(`Drawing did not select: ${JSON.stringify({ rect, row, diagnostics })}`, { cause })
  }
}

export async function chooseHandDrawn(
  value: 'Clean' | 'Hand-drawn',
  defaults = false,
): Promise<void> {
  const host = defaults ? await drawingDefaultsHost() : '.cs-selection-floating-toolbar'
  await $(`${host} [data-control="stroke"] .cs-arrow-toolbar-trigger`).click()
  await $('.cs-arrow-toolbar-popover').waitForDisplayed()
  const option = $('.cs-arrow-toolbar-popover').$(`button=${value}`)
  await option.click()
  await expect($('.cs-arrow-toolbar-popover')).not.toExist()
  if (defaults) await closeDefaultsPopup()
}

export async function verifyHandDrawn(directory: string): Promise<void> {
  await selectTool('Shape')
  const rectangleHost = await drawingDefaultsHost()
  await $(`${rectangleHost} [data-shape-control="geometry"]`).click()
  await waitForShapeAnimation()
  await $('[data-shape-id="rectangularCircling"]').click()
  await $('.cs-shape-popover').waitForDisplayed({ reverse: true })
  await closeDefaultsPopup()
  await draw('Shape', 0.16)
  expect((await shapeDocument()).layers.at(-1)!.payload).toMatchObject({ shape: 'rectangularCircling', fill: { kind: 'none' }, sketchVersion: 1 })
  await selectTool('Shape')
  const ovalHost = await drawingDefaultsHost()
  await $(`${ovalHost} [data-shape-control="geometry"]`).click()
  await waitForShapeAnimation()
  await $('[data-shape-id="circling"]').click()
  await $('.cs-shape-popover').waitForDisplayed({ reverse: true })
  await closeDefaultsPopup()
  await draw('Shape', 0.4)
  const shape = (await shapeDocument()).layers.at(-1)!
  expect(shape.payload).toMatchObject({ shape: 'circling', fill: { kind: 'none' }, sketchVersion: 1 })
  expect(Number(shape.payload.sketchSeed)).toBeGreaterThan(0)
  await expect($('.cs-selection-floating-toolbar [data-shape-control="fill"]')).toBeDisabled()
  await selectTool('Arrow')
  await chooseHandDrawn('Hand-drawn', true)
  await draw('Arrow', 0.65)
  const arrow = (await shapeDocument()).layers.at(-1)!
  expect(arrow.payload).toMatchObject({ appearance: 'handDrawn', sketchVersion: 1 })
  await chooseHandDrawn('Clean')
  expect((await shapeDocument()).layers.at(-1)!.payload).toMatchObject({ appearance: 'clean', sketchSeed: arrow.payload.sketchSeed })
  await key('undo')
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.payload.appearance === 'handDrawn')
  await key('redo')
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)!.payload.appearance === 'clean')
  await chooseHandDrawn('Hand-drawn')
  expect((await shapeDocument()).layers.at(-1)!.payload.sketchSeed).toBe(arrow.payload.sketchSeed)
  await browser.saveScreenshot(`${directory}/hand-drawn.png`)
  await writeFile(`${directory}/hand-drawn-document.json`, JSON.stringify(await shapeDocument(), null, 2))
}
