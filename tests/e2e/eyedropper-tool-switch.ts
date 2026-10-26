import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyEyedropperToolSwitch(
  label: 'main' | 'quick-capture',
  screenshot: string,
): Promise<void> {
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  for (const [index, method] of (['click', 'keyboard', 'configure'] as const).entries()) {
    await browser.execute(async (windowLabel) => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<void> } }
      }).__TAURI__.core
      await core.invoke('plugin:window|set_focus', { label: windowLabel })
    }, label)
    const arrow = $('button[aria-label="Arrow"]')
    await arrow.click({ button: 'right' })
    await $(':is(.cs-tool-configure-popover-host, .cs-tool-defaults-toolbar:not([aria-hidden="true"])) [data-control="color"] button').click()
    await waitForShapeAnimation()
    await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
    await $('.cs-color-popover button[aria-label="Sample colour from canvas"]').waitForDisplayed()
    await $('.cs-color-popover button[aria-label="Sample colour from canvas"]').click()
    await expect(scene).toHaveElementClass('cs-canvas-eyedropper-cursor')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    const chosen = method === 'configure' ? $('button[aria-label="Shape"]') : arrow
    if (method === 'click') await arrow.click()
    else if (method === 'configure') await chosen.click({ button: 'right' })
    else await browser.keys('a')
    await expect(scene).not.toHaveElementClass('cs-canvas-eyedropper-cursor')
    if (await $('.cs-tool-configure-popover-host').isExisting()) await browser.keys('Escape')
    await expect(chosen).toHaveAttribute('aria-pressed', 'true')
    await waitForStableCanvas()
    const beforeCount = (await shapeDocument()).layers.length
    const point = await browser.execute((index) => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2 - 60),
        y: Math.round(rect.top + rect.height * (.25 + index * .25)) }
    }, index)
    await browser.action('pointer')
      .move({ origin: 'viewport', ...point })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 120, y: 50, duration: 150 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await shapeDocument()).layers.length === beforeCount + 1,
      { timeoutMsg: `The ${method} tool action did not create a new layer` })
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await $('.cs-selection-floating-toolbar').waitForDisplayed()
  }
  await browser.saveScreenshot(path.resolve(screenshot))
}
