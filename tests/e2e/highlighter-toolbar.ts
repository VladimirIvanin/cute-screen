import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'
import { verifyPaletteDismissal } from './palette-dismissal'
import { verifyToolbarSeparators } from './toolbar-separators'

export const highlighterToolbarSelector = '.cs-highlighter-toolbar:not([aria-hidden="true"] *)'

export async function verifyCollapsedHighlighterEffects(
  directory: string,
  prefix: string,
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  await browser.execute(() => {
    document.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.highlighterSampleTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  if (await $('.cs-quick-settings-button').isDisplayed() && !(await $(highlighterToolbarSelector).isDisplayed())) {
    await $('.cs-quick-settings-button').click()
  }
  const trigger = $(highlighterToolbarSelector).$('button[aria-label="' + (locale === 'ru' ? 'Режим' : 'Effect') + '"]')
  const modes = [
    ['highlight', locale === 'ru' ? 'Выделить' : 'Highlight', locale === 'ru' ? 'Темнее' : 'Darker'],
    ['illuminate', locale === 'ru' ? 'Подсветить' : 'Illuminate', locale === 'ru' ? 'Светлее' : 'Lighter'],
    ['veil', locale === 'ru' ? 'Окрасить' : 'Tint', locale === 'ru' ? 'Окрасить' : 'Tint'],
  ] as const
  for (const [effect, option, label] of modes) {
    await trigger.click()
    await $('.cs-highlighter-mode[aria-label="' + option + '"]').click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger).toHaveText(expect.stringContaining(label))
    const sample = trigger.$('.cs-highlighter-sample')
    await expect(sample).toHaveAttribute('aria-hidden', 'true')
    expect(await sample.getSize()).toEqual({ width: 36, height: 24 })
    expect((await trigger.getSize()).height).toBe(36)
    await waitForShapeAnimation()
    const png = await sample.saveScreenshot(path.resolve(directory, `${prefix}-${effect}-sample.png`))
    const decoded = await loadImage(png)
    const canvas = createCanvas(decoded.width, decoded.height)
    const context = canvas.getContext('2d')
    context.drawImage(decoded, 0, 0)
    const original = context.getImageData(Math.round(decoded.width / 36), Math.floor(decoded.height / 2), 1, 1).data
    const stroke = context.getImageData(Math.round(decoded.width * 5 / 36), Math.floor(decoded.height / 2), 1, 1).data
    const brightness = (pixel: Uint8ClampedArray) => pixel[0]! + pixel[1]! + pixel[2]!
    if (effect === 'highlight') expect(brightness(stroke)).toBeLessThan(brightness(original))
    if (effect === 'illuminate') expect(brightness(stroke)).toBeGreaterThan(brightness(original))
    const fits = await browser.execute(() => {
      const toolbar = [...document.querySelectorAll('.cs-highlighter-toolbar')].find((element) => !element.closest('[aria-hidden="true"]'))!
      const rect = toolbar.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
        && [...toolbar.querySelectorAll('button')].every((button) => button.scrollWidth <= button.clientWidth)
    })
    expect(fits).toBe(true)
    await browser.saveScreenshot(path.resolve(directory, `${prefix}-${effect}-collapsed.png`))
  }
  await trigger.click()
  const auto = $('.cs-highlighter-mode[aria-label="' + (locale === 'ru' ? 'Авто' : 'Auto') + '"]')
  const autoEffect = ((await auto.$('.cs-highlighter-sample').getAttribute('class')) ?? '').match(/is-(highlight|illuminate|veil)/u)?.[1]
  await auto.click()
  await expect(trigger).toHaveText(expect.stringContaining(locale === 'ru' ? 'Авто ·' : 'Auto ·'))
  await expect(trigger.$('.cs-highlighter-sample')).toHaveElementClass(`is-${autoEffect}`)
  await expect($('html')).toHaveAttribute('data-highlighter-sample-trusted', 'true')
}

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
    await expect(scene).toHaveStyle({ cursor: label === 'Numbered marker' ? 'none' : 'crosshair' })
    await browser.action('pointer').move({ origin: scene }).perform()
    await expect(scene).toHaveStyle({ cursor: label === 'Numbered marker' ? 'none' : 'crosshair' })
    await browser.action('pointer').move({ origin: scene }).down({ button: 'middle' }).perform(true)
    await expect(scene).toHaveStyle({ cursor: 'grabbing' })
    await browser.action('pointer').up({ button: 'middle' }).perform()
    await expect(scene).toHaveStyle({ cursor: label === 'Numbered marker' ? 'none' : 'crosshair' })
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
  if (await $('.cs-quick-settings-button').isDisplayed() && !(await $(highlighterToolbarSelector).isDisplayed())) {
    await $('.cs-quick-settings-button').click()
  }
  const toolbar = $(highlighterToolbarSelector)
  await expect(toolbar).toBeDisplayed()
  await verifyToolbarSeparators(highlighterToolbarSelector, 2)
  await browser.waitUntil(async () => !(await toolbar.getText()).includes('analysing'))
  await verifyCollapsedHighlighterEffects(directory, prefix)
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
  await browser.action('pointer', { id: 'highlighter-stroke' }).move({ origin: 'viewport', x: points.x, y: points.y }).down({ button: 'left' }).move({ origin: 'viewport', x: points.endX, y: points.y, duration: 160 }).perform(true)
  await expect(scene).toHaveStyle({ cursor: 'crosshair' })
  // Native input may finish before the queued preview RAF under build/test load.
  await browser.executeAsync((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
  await scene.saveScreenshot(path.resolve(directory, `${prefix}-stroke-preview.png`))
  const preview = await sceneChecksum()
  // Reuse the held source: a new pointer starts at (0, 0) with no pressed buttons.
  await browser.action('pointer', { id: 'highlighter-stroke' }).up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 1)
  await waitForStableCanvas()
  await expect(scene).toHaveStyle({ cursor: 'crosshair' })
  await scene.saveScreenshot(path.resolve(directory, `${prefix}-stroke-committed.png`))
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
  const configure = $(':is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"]))')
  await expect(configure).toBeDisplayed()
  await verifyToolbarSeparators('.cs-highlighter-toolbar', 2)
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
  expect((await shapeDocument()).layers).toHaveLength(initial + 1)
}
