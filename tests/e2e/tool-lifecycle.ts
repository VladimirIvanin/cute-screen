import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'

export async function configureArrowWithPointer(): Promise<void> {
  await browser.action('pointer')
    .move({ origin: $('button[aria-label="Arrow"]') })
    .down({ button: 'right' })
    .pause(50)
    .up({ button: 'right' })
    .perform()
}

export async function verifyToolLifecycle(
  output: string,
  prefix: string,
  configureArrow: () => Promise<void> = configureArrowWithPointer,
): Promise<void> {
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  await configureArrow()
  await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
  await browser.keys('p')
  await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
  await configureArrow()
  await $('button[aria-label="Stroke: 8 px"]').click()
  await $('.cs-arrow-toolbar-popover button[aria-label="6 px"]').click()
  await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
  await browser.keys('Escape')
  await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('.cs-tool-defaults-toolbar button[aria-label^="Stroke:"]')).toBeFocused()
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
