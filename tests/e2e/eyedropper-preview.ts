import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'

export async function verifyEyedropperPreviewActivation(artifacts: string): Promise<void> {
  const tool = $('button[aria-label="Eyedropper"]')
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  const loupe = $('.cs-eyedropper-loupe')
  await tool.click()
  await expect(scene).toHaveElementClass('cs-canvas-eyedropper-cursor')
  await expect(loupe).not.toBeDisplayed()
  await browser.saveScreenshot(path.resolve(artifacts, 'eyedropper-before-canvas.png'))
  await scene.moveTo()
  await expect(loupe).toBeDisplayed()
  await browser.saveScreenshot(path.resolve(artifacts, 'eyedropper-on-canvas.png'))
  await tool.moveTo()
  await expect(loupe).not.toBeDisplayed()
  await scene.moveTo()
  await expect(loupe).toBeDisplayed()
  await $('button[aria-label="Select"]').click()
  await tool.click()
  await expect(loupe).not.toBeDisplayed()
  await browser.keys('ArrowRight')
  await expect(loupe).toBeDisplayed()
}
