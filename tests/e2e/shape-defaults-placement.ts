import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'

export async function verifyShapeDefaultsPlacement(
  directory: string,
  prefix: string,
): Promise<void> {
  await $('button[aria-label="Callout"]').click()
  const points = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width * 0.08),
      y: Math.round(rect.top + rect.height * 0.85),
      endX: Math.round(rect.left + rect.width * 0.58),
      endY: Math.round(rect.top + rect.height * 0.25),
    }
  })
  await browser.action('pointer')
    .move({ origin: 'viewport', x: points.x, y: points.y })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: points.endX, y: points.endY, duration: 160 })
    .up({ button: 'left' }).perform()
  const editor = $('[contenteditable="true"][aria-label="Callout editor"]')
  await editor.addValue('Selected callout')
  await browser.keys(['Control', 'Enter'])
  await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
  const before = await shapeDocument()
  await browser.execute(() => {
    document.addEventListener('contextmenu', (event) => {
      document.documentElement.dataset.shapeDefaultsTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await $('button[aria-label="Shape"]').click({ button: 'right' })
  expect(await $('html').getAttribute('data-shape-defaults-trusted')).toBe('true')
  const defaults = $(':is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"]))')
  await expect(defaults).toBeDisplayed()
  for (const [index, menu] of ['appearance', 'stroke', 'appearance'].entries()) {
    await defaults.$(`[data-shape-control="${menu}"]`).click()
    await waitForShapeAnimation()
    const result = await browser.execute((menu) => {
      const trigger = document.querySelector(`:is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"])) [data-shape-control="${menu}"]`)!.getBoundingClientRect()
      const panel = document.querySelector('.cs-shape-popover')!.getBoundingClientRect()
      const parent = document.querySelector(':is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"]))')!.getBoundingClientRect()
      const bounds = document.querySelector<HTMLElement>('[data-preview-bounds]')?.dataset.previewBounds
      return {
        trigger: { left: trigger.left, top: trigger.top, right: trigger.right, bottom: trigger.bottom },
        panel: { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom },
        parent: { left: parent.left, top: parent.top, right: parent.right, bottom: parent.bottom },
        bounds,
        distance: Math.hypot(Math.max(0, trigger.left - panel.right, panel.left - trigger.right),
          Math.max(0, trigger.top - panel.bottom, panel.top - trigger.bottom)),
      }
    }, menu)
    await writeFile(path.resolve(directory, `${prefix}-${index}-${menu}-placement.json`), JSON.stringify(result, null, 2))
    await browser.saveScreenshot(path.resolve(directory, `${prefix}-${index}-${menu}-placement.png`))
    expect(result.distance).toBeLessThanOrEqual(24)
    expect(result.panel.left).toBeGreaterThanOrEqual(0)
    expect(result.panel.top).toBeGreaterThanOrEqual(0)
  }
  await browser.keys('Escape')
  await expect(defaults.$('[data-shape-control="appearance"]')).toBeFocused()
  await expect(defaults).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-selection-floating-toolbar')).not.toExist()
  await expect($('.cs-selection-preview-host')).not.toHaveAttribute('data-preview-bounds')
  expect(await shapeDocument()).toEqual(before)
}
