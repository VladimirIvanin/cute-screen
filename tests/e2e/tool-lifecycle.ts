import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'

export async function verifyToolLifecycle(
  output: string,
  prefix: string,
): Promise<void> {
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  await $('button[aria-label="Arrow"]').click({ button: 'right' })
  await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
  await browser.keys('p')
  await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('.cs-tool-defaults-toolbar')).not.toExist()
  await $('button[aria-label="Arrow"]').click({ button: 'right' })
  await $('button[aria-label="Stroke: 3 px"]').click()
  await $('.cs-arrow-toolbar-popover button[aria-label="6 px"]').click()
  await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('button[aria-label="Arrow"]')).toBeFocused()
  await browser.action('pointer').move({ origin: scene, x: -80, y: -50 }).down({ button: 'left' })
    .move({ origin: 'pointer', x: 75, y: 28, duration: 150 }).up({ button: 'left' }).perform()
  await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
  await browser.saveScreenshot(path.join(output, `${prefix}-selected.png`))
  const empty = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return {
      x: Math.round(Math.min(rect.right, innerWidth) - 24),
      y: Math.round(Math.min(rect.bottom, innerHeight - 100) - 24),
    }
  })
  await browser.action('pointer').move({ origin: 'viewport', ...empty }).down({ button: 'left' }).up({ button: 'left' }).perform()
  await expect($('.cs-selection-floating-toolbar')).not.toExist()
  await expect($('.cs-bottom-chrome-center > .cs-context-toolbar')).not.toExist()
  await browser.saveScreenshot(path.join(output, `${prefix}-deselected.png`))
}
