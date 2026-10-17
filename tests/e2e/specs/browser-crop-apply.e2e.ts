import { setEditorPreferences } from '../editor-settings'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { expectCommittedCrop } from '../crop-result'
import {
  chooseOption,
  m08Snapshot,
  m08VersionToken,
  openM08,
  setLocale,
} from './browser-m08-test-kit'

async function cropSnapshot() {
  return (await m08Snapshot()).document.crop
}

async function focusCropAction(shortcut: 'Enter' | 'Escape'): Promise<void> {
  for (let step = 0; step < 32; step += 1) {
    await browser.keys('Tab')
    if (await browser.execute((key) => document.activeElement?.getAttribute('aria-keyshortcuts') === key, shortcut)) return
  }
  throw new Error(`Crop action is not keyboard reachable: ${shortcut}`)
}

describe('Crop confirmation and toolbar', () => {
  it('activates the focused Cancel button with Enter without applying the draft', async () => {
    await openM08()
    const version = await m08VersionToken()
    await $('button[aria-label="Crop"]').click()
    await chooseOption('Preset', '16:9')
    await focusCropAction('Escape')
    await browser.keys('Enter')
    await expectCommittedCrop(400, 300)
    expect(await cropSnapshot()).toBeNull()
    expect(await m08VersionToken()).toBe(version)
  })

  it('shows Apply immediately, cancels only the draft and supports reset/undo/redo', async () => {
    await browser.setWindowSize(1213, 724)
    await openM08()
    const original = (await m08Snapshot()).document
    const version = await m08VersionToken()
    await $('button[aria-label="Crop"]').click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await $('button=Apply').click()
    await expectCommittedCrop(300, 300)
    const committed = { x: 60, y: 0, width: 300, height: 300 }
    expect(await cropSnapshot()).toEqual(committed)
    expect(await m08VersionToken()).toBe(version + 1)
    expect((await m08Snapshot()).document.layers).toEqual(original.layers)

    await $('button[aria-label="Crop"]').click()
    await chooseOption('Preset', '16:9')
    await $('button=Cancel').click()
    await expectCommittedCrop(300, 300)
    expect(await cropSnapshot()).toEqual(committed)
    expect(await m08VersionToken()).toBe(version + 1)

    await $('button[aria-label="Crop"]').click()
    await $('button=Reset').click()
    expect(await cropSnapshot()).toEqual(committed)
    await browser.keys('Escape')
    await expectCommittedCrop(300, 300)
    expect(await cropSnapshot()).toEqual(committed)

    await $('button[aria-label="Crop"]').click()
    await $('button=Reset').click()
    await chooseOption('Preset', '16:9')
    await browser.keys('Enter')
    await expectCommittedCrop(400, 225)
    const wide = await cropSnapshot()
    expect(wide?.width).toBe(400)
    expect(wide?.height).toBe(225)
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await cropSnapshot())?.x === 60)
    await expectCommittedCrop(300, 300)
    expect(await cropSnapshot()).toEqual(committed)
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () => (await cropSnapshot())?.width === 400)
    await expectCommittedCrop(400, 225)
    expect(await cropSnapshot()).toEqual(wide)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/crop-applied.png'))
  })

  it('aligns RU/EN controls in both themes at the reported and minimum desktop sizes', async function () {
    this.timeout(60_000)
    for (const size of [{ width: 1213, height: 724 }, { width: 1024, height: 700 }]) {
      await browser.setWindowSize(size.width, size.height)
      await openM08()
      for (const locale of ['en', 'ru'] as const) {
        await setLocale(locale)
        for (const theme of ['light', 'dark'] as const) {
          await setEditorPreferences(locale, theme)
          await $(`button[aria-label="${locale === 'ru' ? 'Обрезка' : 'Crop'}"]`).click()
          const layout = await browser.execute(() => {
            const toolbar = document.querySelector<HTMLElement>('.cs-context-toolbar--crop')!
            const rail = document.querySelector<HTMLElement>('.cs-toolrail')!
            const controls = [...toolbar.querySelectorAll<HTMLElement>('.cs-crop-button, .n-base-selection')]
            const bounds = toolbar.getBoundingClientRect()
            const rects = controls.map((control) => control.getBoundingClientRect())
            return {
              heights: rects.map((rect) => rect.height),
              centers: rects.map((rect) => rect.y + rect.height / 2),
              fits:
                bounds.left >= 0 &&
                bounds.right <= innerWidth &&
                bounds.top >= 0 &&
                bounds.bottom <= rail.getBoundingClientRect().top,
              controlsFit: rects.every((rect) => rect.left >= bounds.left && rect.right <= bounds.right),
              primaryLast: toolbar.querySelector('.cs-crop-actions')?.lastElementChild?.getAttribute('aria-keyshortcuts'),
            }
          })
          expect(layout.fits).toBe(true)
          expect(layout.controlsFit).toBe(true)
          expect(layout.heights).toEqual([32, 32, 32, 32])
          expect(Math.max(...layout.centers) - Math.min(...layout.centers)).toBeLessThanOrEqual(1)
          expect(layout.primaryLast).toBe('Enter')
          // Keyboard focus must remain visible on the commit action.
          await $(`button=${locale === 'ru' ? 'Отмена' : 'Cancel'}`).click()
          await $(`button[aria-label="${locale === 'ru' ? 'Обрезка' : 'Crop'}"]`).click()
          await focusCropAction('Enter')
          expect(await browser.execute(() => document.activeElement?.matches(':focus-visible') &&
            document.activeElement.getAttribute('aria-keyshortcuts') === 'Enter')).toBe(true)
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/crop-toolbar-${size.width}-${locale}-${theme}.png`))
        }
      }
    }
  })
})
