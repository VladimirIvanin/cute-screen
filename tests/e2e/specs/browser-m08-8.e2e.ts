import path from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  readHarnessClipboard,
  recentColourHex,
  openM08,
  setLocale,
  canvasPoint,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('samples a known scene pixel at zoom, excludes overlay, updates recent, and exposes cancel/error states', async () => {
    await browser.setWindowSize(1280, 800)
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url('/')
    await expect($('button[aria-label="Eyedropper"]')).toBeDisabled()

    for (const alpha of [0, 128] as const) {
      await openM08({ alpha })
      await $('button[aria-label="Eyedropper"]').click()
      await expect($('.cs-eyedropper-loupe')).toBeDisplayed()
      await expect($('.cs-eyedropper-loupe')).toHaveAttribute(
        'data-state',
        'unavailable',
      )
      await browser.keys('Enter')
      await expect($('.cs-eyedropper-feedback')).toHaveText(
        'There is no opaque colour at this point',
      )
      await expect($('.cs-eyedropper-swatch')).not.toExist()
      expect(await readHarnessClipboard()).toBeUndefined()
      expect(await recentColourHex()).toBeUndefined()
    }

    await openM08({ alpha: 255 })
    await $('button[aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-controls')).not.toHaveAttribute('data-zoom', '100')
    await $('button[aria-label="Eyedropper"]').click()
    await expect($('.cs-eyedropper-loupe')).toBeDisplayed()
    await expect($('.cs-eyedropper-loupe')).toHaveText(
      expect.stringContaining('#273D5A'),
    )
    await expect($('.cs-eyedropper-loupe canvas')).toHaveAttribute('width', '9')
    await expect($('.cs-eyedropper-loupe canvas')).toHaveAttribute(
      'height',
      '9',
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m08-eyedropper-live-loupe-en.png'),
    )
    await expect($('.cs-eyedropper-loupe-target')).toBeDisplayed()
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A',
    )
    await expect($('[aria-label="Colour swatch #273D5A"]')).toExist()
    expect(await readHarnessClipboard()).toBe('#273D5A')
    expect(await recentColourHex()).toBe('#273D5A')

    await $('button[aria-label="Select"]').click()
    await $('button[aria-label="Eyedropper"]').click()
    const samplePoint = await canvasPoint(20, 250)
    await browser
      .action('pointer', { id: 'm08-eyedropper-cancel' })
      .move({
        origin: 'viewport',
        x: samplePoint.x,
        y: samplePoint.y,
        duration: 0,
      })
      .down({ button: 'right' })
      .up({ button: 'right' })
      .perform()
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour sampling cancelled',
    )
    await $('button[aria-label="Select"]').click()
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Escape')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour sampling cancelled',
    )

    await openM08({ notReady: true })
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Scene textures are still loading; try again when the canvas is ready',
    )

    await openM08({ clipboardError: true })
    await $('button[aria-label="Eyedropper"]').click()
    await browser.keys('Enter')
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A. HEX could not be copied.',
    )
    await expect($('[aria-label="Colour swatch #273D5A"]')).toExist()
    expect(await recentColourHex()).toBe('#273D5A')

    await browser.setWindowSize(1024, 700)
    await openM08({ alpha: 255 })
    await setLocale('ru')
    await $('button[aria-label="Пипетка"]').click()
    await expect($('.cs-eyedropper-loupe')).toHaveText(
      expect.stringContaining('Нажмите, чтобы выбрать'),
    )
    await browser.saveScreenshot(
      path.resolve(
        'artifacts/browser-e2e/m08-eyedropper-live-loupe-1024-ru.png',
      ),
    )
  })
})
