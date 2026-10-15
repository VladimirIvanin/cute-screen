import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyEyedropperToolSwitch(
  label: 'main' | 'quick-capture',
  screenshot: string,
): Promise<void> {
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  for (const method of ['click', 'keyboard', 'configure'] as const) {
    await browser.execute(async (windowLabel) => {
      const core = (window as typeof window & {
        __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<void> } }
      }).__TAURI__.core
      await core.invoke('plugin:window|set_focus', { label: windowLabel })
    }, label)
    const arrow = $('button[aria-label="Arrow"]')
    await arrow.click({ button: 'right' })
    await $('.cs-tool-configure-popover-host [data-control="color"] button').click()
    await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
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
    await browser.action('pointer')
      .move({ origin: scene, x: -60, y: -35 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 120, y: 50, duration: 150 })
      .up({ button: 'left' }).perform()
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await $('.cs-selection-floating-toolbar').waitForDisplayed()
  }
  await browser.saveScreenshot(path.resolve(screenshot))
}
