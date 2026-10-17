import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

async function resizeViewport(
  width: number,
  height: number,
): Promise<void> {
  const chrome = await browser.execute(() => ({ width: outerWidth - innerWidth, height: outerHeight - innerHeight }))
  await browser.setWindowSize(width + chrome.width, height + chrome.height)
}

async function chooseLanguage(locale: string): Promise<void> {
  await $('.cs-settings-sidebar nav button:first-child').click()
  await $('select[aria-label="Language / Язык"]').selectByAttribute('value', locale)
  await $('.cs-settings-sidebar nav button:last-child').click()
  await expect($('.cs-shortcut-list')).toBeDisplayed()
}

async function beginRecording(action: string): Promise<void> {
  await $(`[data-edit="${action}"]`).click()
  await expect($('.cs-record-shortcut')).toHaveAttribute('class', expect.stringContaining('is-recording'))
}

async function assertFit(): Promise<void> {
  expect(await browser.execute(() => {
    const panel = document.querySelector('.cs-settings-scroll')!
    return document.documentElement.scrollWidth <= innerWidth && panel.scrollWidth <= panel.clientWidth
  })).toBe(true)
}

describe('activation settings browser UI', () => {
  it('loads consent, records with one click, handles conflict and removes through the ellipsis', async () => {
    await browser.url('/?settings=shortcuts&settingsHarness=1&firstRun=1')
    await resizeViewport(820, 720)
    await expect($('input[type="checkbox"]')).toBeSelected()
    await $('input[type="checkbox"]').click()
    await $('.cs-settings-scroll .cs-settings-primary').click()
    await chooseLanguage('en')
    await beginRecording('capture-area')
    await browser.keys([Key.Control, Key.Shift, '2'])
    await expect($('p=Available in registration check')).toBeDisplayed()
    await browser.saveScreenshot('artifacts/browser-e2e/settings-candidate.png')
    await $('button=Save').click()
    await expect($('[data-action="capture-area"] kbd')).toHaveText('Ctrl+Shift+2')
    await beginRecording('capture-area')
    await browser.keys([Key.Control, Key.Shift, '3'])
    await expect($('button=Save')).toBeDisabled()
    await $('button=Cancel').click()
    await expect($('[data-action="capture-area"] kbd')).toHaveText('Ctrl+Shift+2')
    const more = $('button[aria-label="Actions: Capture area"]')
    await more.click()
    await browser.saveScreenshot('artifacts/browser-e2e/settings-actions.png')
    await browser.keys(Key.ArrowDown)
    await expect($('[role="menuitem"]=Remove shortcut')).toBeFocused()
    await browser.keys(Key.Escape)
    await expect(more).toBeFocused()
    await more.click()
    await browser.keys(Key.Tab)
    await expect($('[data-edit="capture-screen"]')).toBeFocused()
    await more.click()
    await $('[role="menuitem"]=Remove shortcut').click()
    await expect($('[data-action="capture-area"] [data-status="unassigned"]')).toExist()
    await assertFit()
    await browser.saveScreenshot('artifacts/browser-e2e/activation-settings.png')
  })

  it('keeps navigation and inline recording visible in both languages, sizes and themes', async () => {
    await browser.url('/?settings=general&settingsHarness=1')
    for (const locale of ['ru', 'en']) {
      for (const theme of ['light', 'dark']) {
        await chooseLanguage(locale)
        await browser.execute((value) => {
          document.documentElement.dataset.theme = value
        }, theme)
        for (const [width, height] of [[820, 720], [620, 520]]) {
          await resizeViewport(width!, height!)
          await beginRecording('capture-window')
          await expect($('.cs-settings-sidebar nav')).toBeDisplayed()
          await assertFit()
          expect(await browser.execute(() => {
            const editor = document.querySelector('.cs-shortcut-inline-editor')!.getBoundingClientRect()
            const panel = document.querySelector('.cs-settings-scroll')!.getBoundingClientRect()
            return editor.top >= panel.top && editor.bottom <= panel.bottom
          })).toBe(true)
          await browser.saveScreenshot(`artifacts/browser-e2e/settings-inline-${locale}-${theme}-${width}.png`)
          await browser.keys(Key.Escape)
          await expect($('[data-edit="capture-window"]')).toBeFocused()
        }
      }
    }
    await $('.cs-settings-sidebar nav button:first-child').click()
    await expect($('h2=General')).toBeDisplayed()
    await expect($('select[aria-label="Language / Язык"]')).toBeDisplayed()
    await browser.saveScreenshot('artifacts/browser-e2e/settings-general.png')
  })
})
