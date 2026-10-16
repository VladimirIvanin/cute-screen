import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { setNumericInput } from './numeric-input'
import { waitForStableCanvas } from './canvas-ready'

export async function waitForShapeAnimation(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => {
    const popup = document.querySelector('.cs-shape-popover')?.closest('.n-popover')
    if (
      popup &&
      (getComputedStyle(popup).opacity !== '1' ||
        popup.classList.contains('popover-transition-enter-from'))
    )
      return false
    return document.getAnimations().every((animation) =>
      animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')
  }))
}

export async function drawShape(): Promise<void> {
  await expect($('.cs-canvas-ready')).toExist()
  await $('button[aria-label="Shape"]').click()
  await waitForStableCanvas()
  const points = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width * 0.35),
      y: Math.round(rect.top + rect.height * 0.55),
      endX: Math.round(rect.left + rect.width * 0.65),
      endY: Math.round(rect.top + rect.height * 0.7),
    }
  })
  await browser.action('pointer')
    .move({ origin: 'viewport', x: points.x, y: points.y })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: points.endX, y: points.endY, duration: 160 })
    .up({ button: 'left' }).perform()
  await expect($('.cs-selection-floating-toolbar .cs-shape-toolbar')).toBeDisplayed()
}

export async function shapeDocument(): Promise<{
  layers: { kind: string; payload: Record<string, unknown>; opacity: number; blendMode: string }[]
}> {
  return browser.execute(() => {
    type Document = { layers: { kind: string; payload: Record<string, unknown>; opacity: number; blendMode: string }[] }
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { snapshot(): Document }
      __cuteScreenE2eQuick?: { snapshot(): Document }
      __cuteScreenE2eM08?: { snapshot(): { document: Document } }
    }
    const document = state.__cuteScreenE2eQuick?.snapshot()
      ?? state.__cuteScreenE2eM05?.snapshot() ?? state.__cuteScreenE2eM08?.snapshot()?.document
    if (!document) throw new Error('Shape document was not mounted')
    return document
  })
}

export async function verifyShapeToolbar(
  artifactDirectory: string,
  prefix: string,
): Promise<void> {
  await drawShape()
  const toolbar = $('.cs-selection-floating-toolbar .cs-shape-toolbar')
  expect(await toolbar.$$('[data-shape-control]').length).toBe(4)
  await toolbar.$('[data-shape-control="fill"]').click()
  await $('.cs-shape-fill-options').$('button=No fill').click()
  await browser.keys('Escape')
  await toolbar.$('[data-shape-control="stroke"]').click()
  await $('.cs-shape-popover').$('button[aria-label="8 px"]').click()
  await browser.keys('Escape')
  expect(await toolbar.$('[data-shape-control="stroke"]').getAttribute('aria-label')).toMatch(/Stroke: .* · 8 px/u)
  await expect(toolbar.$('[data-shape-control="stroke"]')).toBeFocused()
  await toolbar.$('[data-shape-control="geometry"]').click()
  expect(await $$('.cs-shape-grid button').length).toBe(31)
  await expect($('.cs-shape-popover input[aria-label="Star points"]')).not.toExist()
  const radius = $('.cs-shape-popover input[aria-label="Corner radius"]')
  await setNumericInput(radius, '12')
  await browser.keys('Enter')
  await browser.keys('Escape')
  await toolbar.$('[data-shape-control="fill"]').click()
  await waitForShapeAnimation()
  await $('.cs-shape-popover button[aria-label="Custom colour"]').click()
  const hex = $('.cs-shape-popover input[aria-label="HEX colour code"]')
  await waitForShapeAnimation()
  await hex.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('#336699')
  expect(await hex.getValue()).toBe('#336699')
  await browser.keys('Enter')
  await expect(toolbar.$('[data-shape-control="fill"]')).toHaveAttribute('aria-label', 'Fill: Colour')
  await browser.execute(() => {
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.shapeEscapeTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await browser.keys('Escape')
  expect(await $('html').getAttribute('data-shape-escape-trusted')).toBe('true')
  await expect($('.cs-shape-popover button[aria-label="Custom colour"]')).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-shape-popover')).not.toExist()
  await $('button[aria-label="Undo"]').click()
  await expect(toolbar.$('[data-shape-control="fill"]')).toHaveAttribute('aria-label', 'Fill: No fill')
  await $('button[aria-label="Redo"]').click()
  await expect(toolbar.$('[data-shape-control="fill"]')).toHaveAttribute('aria-label', 'Fill: Colour')
  await toolbar.$('[data-shape-control="appearance"]').click()
  await setNumericInput($('.cs-shape-popover input[aria-label="Opacity"]'), '75')
  await browser.keys('Enter')
  await $('.cs-shape-popover select').selectByAttribute('value', 'multiply')
  await browser.keys('Escape')
  await waitForShapeAnimation()
  await browser.saveScreenshot(path.resolve(artifactDirectory, `${prefix}-compact.png`))
  await toolbar.$('[data-shape-control="fill"]').click()
  await waitForShapeAnimation()
  const fits = await browser.execute(() => {
    const toolbar = document.querySelector('.cs-selection-floating-toolbar .cs-shape-toolbar')!.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('.cs-selection-floating-toolbar [data-shape-control]')].map((element) => element.getBoundingClientRect())
    const element = document.querySelector('.cs-shape-popover')!
    const menu = element.getBoundingClientRect()
    return {
      fits: [toolbar, menu].every((rect) =>
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight),
      aligned: Math.max(...buttons.map((rect) => rect.top)) - Math.min(...buttons.map((rect) => rect.top)) < 1,
      compact: toolbar.width < 340 && toolbar.height <= 40,
    }
  })
  expect(fits).toMatchObject({ fits: true, aligned: true, compact: true })
  await browser.saveScreenshot(path.resolve(artifactDirectory, `${prefix}-fill.png`))
  await $('.cs-shape-popover button[aria-label="Custom colour"]').click()
  await $('.cs-shape-popover button[aria-label="Sample colour from canvas"]').click()
  await expect($('.cs-shape-popover')).not.toExist()
  await browser.keys('Escape')
  await expect(toolbar).toBeDisplayed()
}

export async function verifyShapeDefaults(): Promise<void> {
  const before = await shapeDocument()
  await browser.execute(() => {
    document.addEventListener('contextmenu', (event) => {
      document.documentElement.dataset.shapeContextTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await $('button[aria-label="Shape"]').click({ button: 'right' })
  expect(await $('html').getAttribute('data-shape-context-trusted')).toBe('true')
  const defaults = $(':is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"]))')
  await expect(defaults).toBeDisplayed()
  await defaults.$('[data-shape-control="stroke"]').click()
  await waitForShapeAnimation()
  await expect($('.cs-selection-floating-toolbar')).not.toExist()
  const defaultsFit = await browser.execute(() => {
    const panel = document.querySelector('.cs-shape-popover')!.getBoundingClientRect()
    return panel.left >= 0 && panel.top >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight
  })
  expect(defaultsFit).toBe(true)
  await $('.cs-shape-popover').$('button[aria-label="2 px"]').click()
  await browser.keys('Escape')
  await expect($('.cs-shape-popover')).not.toExist()
  await expect(defaults).toBeDisplayed()
  expect(await shapeDocument()).toEqual(before)
  await drawShape()
  expect((await shapeDocument()).layers.at(-1)!.payload.stroke).toMatchObject({ width: 2 })
}

export async function verifyShapeCatalogue(
  artifactDirectory: string,
  prefix: string,
): Promise<void> {
  const geometry = $('.cs-selection-floating-toolbar [data-shape-control="geometry"]')
  await geometry.click()
  await expect($('.cs-shape-grid')).toBeDisplayed()
  await waitForShapeAnimation()
  const entries = await browser.execute(() => [...document.querySelectorAll<HTMLElement>('[data-shape-id]')]
    .map((element) => element.dataset.shapeId!))
  expect(entries.length).toBe(31)
  for (const id of entries) {
    if (await geometry.getAttribute('aria-expanded') !== 'true') await geometry.click()
    await expect($('.cs-shape-grid')).toBeDisplayed()
    await waitForShapeAnimation()
    await $(`[data-shape-id="${id}"]`).click()
    await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.payload.shape ===
      (id === 'roundedRectangle' ? 'rectangle' : id), { timeoutMsg: `Shape ${id} was not committed` })
    if (await geometry.getAttribute('aria-expanded') === 'true') await browser.keys('Escape')
    await expect(geometry).toHaveAttribute('aria-expanded', 'false')
    await waitForShapeAnimation()
  }
  await $('.cs-selection-floating-toolbar [data-shape-control="stroke"]').click()
  await $('.cs-shape-popover button[aria-label="Blue"]').click()
  await browser.keys('Escape')
  await geometry.click()
  await $('[data-shape-id="star"]').click()
  await waitForShapeAnimation()
  const evidence = await browser.execute(() => {
    const menu = document.querySelector<HTMLElement>('.cs-shape-popover')!
    const bounds = menu.getBoundingClientRect()
    const host = document.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
    const [left = 0, top = 0, width = 0, height = 0] = host.dataset.previewBounds!.split(',').map(Number)
    const cells = [...menu.querySelectorAll('.cs-shape-grid button')].map((element) => element.getBoundingClientRect())
    const icons = [...menu.querySelectorAll('.cs-shape-grid svg')].map((element) => element.getBoundingClientRect())
    const inputs = [...menu.querySelectorAll('input')].map((element) => element.getBoundingClientRect())
    return {
      overlap: Math.max(0, Math.min(bounds.right, left + width) - Math.max(bounds.left, left)) *
        Math.max(0, Math.min(bounds.bottom, top + height) - Math.max(bounds.top, top)),
      cells: cells.every((rect) => rect.width === 32 && rect.height === 32),
      icons: icons.every((rect) => rect.width === 20 && rect.height === 20),
      columns: cells.filter((rect) => Math.abs(rect.top - cells[0]!.top) < 1).length,
      compactParameters: inputs.length === 2 && inputs.every((rect) => rect.width <= 88 && rect.height <= 32) &&
        menu.querySelector('.cs-shape-dimensions')!.getBoundingClientRect().height <= 120,
      heading: Boolean(menu.querySelector('.cs-shape-popover-title')),
      fits: bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
    }
  })
  expect(evidence).toEqual({
    overlap: 0, cells: true, icons: true, columns: 7, compactParameters: true, heading: false, fits: true,
  })
  await browser.saveScreenshot(path.resolve(artifactDirectory, `${prefix}-catalogue.png`))
  await browser.keys('Escape')
  await $('button[aria-label="Undo"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.shape).toBe('cube')
  await $('button[aria-label="Redo"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.shape).toBe('star')
}
