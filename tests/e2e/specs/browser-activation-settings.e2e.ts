import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

describe('activation settings browser UI', () => {
  it('loads setup, asks for startup consent, records and removes a shortcut', async () => {
    await browser.url('/?settings=shortcuts&settingsHarness=1&firstRun=1')
    await browser.setWindowSize(820, 720)
    await $('select[aria-label="Language / Язык"]').selectByAttribute('value', 'en')
    await expect($('input[type="checkbox"]')).toBeSelected()
    await $('input[type="checkbox"]').click()
    await $('button=Continue').click()
    await expect($('.cs-shortcut-list')).toBeDisplayed()
    await expect($('[data-action="capture-area"] [data-status="unassigned"]')).toExist()
    await $('button[aria-label="Change: Capture area"]').click()
    await $('button=Press a shortcut').click()
    await browser.keys([Key.Control, Key.Shift, '2'])
    await expect($('p=Available in registration check')).toBeDisplayed()
    await $('button=Assign').click()
    await expect($('[data-action="capture-area"] kbd')).toHaveText('Ctrl+Shift+2')
    await $('button[aria-label="Change: Capture area"]').click()
    await $('.cs-record-shortcut').click()
    await browser.keys([Key.Control, Key.Shift, '3'])
    await expect($('button=Assign')).toBeDisabled()
    await $('button=Cancel').click()
    await expect($('[data-action="capture-area"] kbd')).toHaveText('Ctrl+Shift+2')
    await $('button[aria-label="Remove: Capture area"]').click()
    await expect($('[data-action="capture-area"] [data-status="unassigned"]')).toExist()
    expect(await browser.execute(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await browser.execute(() => {
      document.querySelector('.cs-settings')?.scrollTo(0, 0)
    })
    await browser.saveScreenshot('artifacts/browser-e2e/activation-settings.png')
  })
})
