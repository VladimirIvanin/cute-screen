import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'
import { verifyPaletteDismissal } from './palette-dismissal'

async function sceneChecksum(): Promise<number> {
  return browser.execute(() => {
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const pixels = scene.getContext('2d')!.getImageData(0, 0, scene.width, scene.height).data
    let hash = 2166136261
    for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
    return hash >>> 0
  })
}

export async function verifyCreationCursors(
  directory: string,
  prefix: string,
): Promise<void> {
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  for (const label of ['Pencil', 'Highlighter', 'Numbered marker']) {
    await $(`button[aria-label="${label}"]`).click()
    await expect(scene).toHaveStyle({ cursor: 'crosshair' })
    await browser.action('pointer').move({ origin: scene }).perform()
    await expect(scene).toHaveStyle({ cursor: 'crosshair' })
    await browser.action('pointer').move({ origin: scene }).down({ button: 'middle' }).perform(true)
    await expect(scene).toHaveStyle({ cursor: 'grabbing' })
    await browser.action('pointer').up({ button: 'middle' }).perform()
    await expect(scene).toHaveStyle({ cursor: 'crosshair' })
  }
  await browser.saveScreenshot(path.resolve(directory, `${prefix}-numbered-marker-cursor.png`))
  if (!(await $('.cs-quick-actions').isExisting())) {
    await $('button[aria-label="Hand"]').click()
    await expect(scene).toHaveStyle({ cursor: 'grab' })
  }
  await $('button[aria-label="Select"]').click()
  await browser.action('pointer').move({ origin: scene, x: 1, y: 1 }).perform()
  expect((await scene.getCSSProperty('cursor')).value).not.toBe('crosshair')
}

export async function verifyHighlighter(
  directory: string,
  prefix: string,
  requireAutomatic = false,
): Promise<void> {
  await verifyCreationCursors(directory, prefix)
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  await $('button[aria-label="Highlighter"]').click()
  await expect($('button[aria-label="Highlighter"] .cs-icon-marker')).toExist()
  const toolbar = $('.cs-highlighter-toolbar')
  await expect(toolbar).toBeDisplayed()
  await browser.waitUntil(async () => !(await toolbar.getText()).includes('analysing'))
  await toolbar.$('button[aria-label="Effect"]').click()
  if (requireAutomatic) await expect($('.cs-highlighter-hint')).not.toExist()
  await $('.cs-highlighter-mode[aria-label="Illuminate"]').click()
  await toolbar.$('button[aria-label="Colour"]').click()
  await waitForShapeAnimation()
  await expect($('.cs-simple-color-panel input')).not.toExist()
  await verifyPaletteDismissal(directory, `${prefix}-preset`, () =>
    $('.cs-simple-color-panel button[aria-label="Green"]').click())
  await expect(toolbar.$('button[aria-label="Colour"]')).toBeFocused()
  await toolbar.$('button[aria-label="Colour"]').click()
  await waitForShapeAnimation()
  await verifyPaletteDismissal(directory, `${prefix}-escape`, () => browser.keys('Escape'))
  await expect(toolbar.$('button[aria-label="Colour"]')).toBeFocused()
  await toolbar.$('button[aria-label="Colour"]').click()
  await waitForShapeAnimation()
  await verifyPaletteDismissal(directory, `${prefix}-outside`, () => toolbar.$('button[aria-label="Width"]').click())
  await browser.keys('Escape')
  await waitForStableCanvas()
  const initial = (await shapeDocument()).layers.length
  const points = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width * 0.35),
      y: Math.round(rect.top + rect.height * 0.55),
      endX: Math.round(rect.left + rect.width * 0.65),
    }
  })
  await browser.action('pointer').move({ origin: 'viewport', x: points.x, y: points.y }).down({ button: 'left' }).move({ origin: 'viewport', x: points.endX, y: points.y, duration: 160 }).perform(true)
  await expect(scene).toHaveStyle({ cursor: 'crosshair' })
  const preview = await sceneChecksum()
  await browser.action('pointer').up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 1)
  await waitForStableCanvas()
  await expect(scene).toHaveStyle({ cursor: 'crosshair' })
  expect(await sceneChecksum()).toBe(preview)
  await writeFile(path.resolve(directory, `${prefix}-document.json`), JSON.stringify(await shapeDocument(), null, 2))
  expect((await shapeDocument()).layers.at(-1)).toMatchObject({ kind: 'marker', blendMode: 'screen', opacity: 0.35, payload: { highlighterMode: 'illuminate', width: 18 } })
  await expect($('button[aria-label="Highlighter"]')).toHaveAttribute('aria-pressed', 'true')
  await $('button[aria-label="Undo"]').click()
  expect((await shapeDocument()).layers).toHaveLength(initial)
  await $('button[aria-label="Redo"]').click()
  expect((await shapeDocument()).layers).toHaveLength(initial + 1)
  // Native context-menu input edits creation defaults while preserving the document.
  await browser.execute(() => {
    document.addEventListener('contextmenu', (event) => {
      document.documentElement.dataset.highlighterContextTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await $('button[aria-label="Highlighter"]').click({ button: 'right' })
  expect(await $('html').getAttribute('data-highlighter-context-trusted')).toBe('true')
  const configure = $('.cs-tool-configure-popover-host')
  await expect(configure).toBeDisplayed()
  await configure.$('button[aria-label="Colour"]').click()
  await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
  await waitForShapeAnimation()
  const hex = $('input[aria-label="HEX colour code"]')
  await hex.setValue('#336699')
  await verifyPaletteDismissal(directory, `${prefix}-custom`, () => browser.keys('Enter'))
  await configure.$('button[aria-label="Effect"]').click()
  await $('.cs-highlighter-mode[aria-label="Auto"]').click()
  await configure.$('button[aria-label="Effect"]').click()
  await waitForShapeAnimation()
  const fits = await browser.execute(() => [...document.querySelectorAll('.cs-highlighter-popover')].every((element) => {
    const rect = element.getBoundingClientRect()
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
  }))
  expect(fits).toBe(true)
  await browser.saveScreenshot(path.resolve(directory, `${prefix}-modes.png`))
  await browser.execute(() => {
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.highlighterEscapeTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await browser.keys('Escape')
  expect(await $('html').getAttribute('data-highlighter-escape-trusted')).toBe('true')
  await expect(configure).toBeDisplayed()
  await browser.keys('Escape')
  await expect(configure).not.toExist()
  expect((await shapeDocument()).layers).toHaveLength(initial + 1)
}
