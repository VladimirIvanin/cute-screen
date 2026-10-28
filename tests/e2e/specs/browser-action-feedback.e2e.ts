import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { notificationReadability } from '../notification-readability'
import { Key } from 'webdriverio'
import { setShellPreferences } from './browser-m06-test-kit'

describe('Action feedback leaves editor tools accessible', () => {
  it('keeps cancelled feedback compact with balanced vertical spacing', async function () {
    this.timeout(90000)
    await browser.setWindowSize(1024, 700)
    await browser.url('/?m05=1&captureCancelled=1')
    await expect($('.cs-canvas-ready')).toExist()
    await setShellPreferences('en', 'dark')
    await $('button=Capture').click()
    await expect($('.cs-action-feedback.is-cancelled')).toBeDisplayed()
    const geometry = await browser.execute(() => {
      const notice = document.querySelector<HTMLElement>('.cs-action-feedback.is-cancelled')!
      const box = notice.getBoundingClientRect()
      const message = notice.querySelector('.cs-action-feedback-message')!.getBoundingClientRect()
      const close = notice.querySelector('.cs-action-feedback-close')!.getBoundingClientRect()
      return {
        height: box.height,
        verticalImbalance: Math.abs((message.top - box.top) - (box.bottom - message.bottom)),
        centerDifference: Math.abs((message.top + message.bottom) / 2 - (close.top + close.bottom) / 2),
        hasActions: notice.querySelector('.cs-action-feedback-actions') !== null,
      }
    })
    expect(geometry.height).toBeLessThanOrEqual(54)
    expect(geometry.verticalImbalance).toBeLessThanOrEqual(1)
    expect(geometry.centerDifference).toBeLessThanOrEqual(1)
    expect(geometry.hasActions).toBe(false)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/notification-cancelled-compact.png'))
  })

  for (const locale of ['en', 'ru'] as const) {
    for (const width of [1600, 1024, 900]) {
      it(`keeps marker settings usable after capture denial: ${locale}, ${width}px`, async function () {
        this.timeout(90000)
        await browser.setWindowSize(width, 700)
        await browser.url('/?m05=1&captureDenied=1')
        await expect($('.cs-canvas-ready')).toExist()
        for (const theme of ['light', 'dark'] as const) {
          await setShellPreferences(locale, theme)
          const tool = $('[data-tool-id="numberedMarker"]')
          await tool.click()
          await $(locale === 'ru' ? 'button=Снимок' : 'button=Capture').click()
          const notice = $('.cs-action-feedback[role="alert"]')
          await expect(notice).toBeDisplayed()
          const readability = await notificationReadability()
          await writeFile(path.resolve(`artifacts/browser-e2e/notification-${theme}-${locale}-${width}.json`), JSON.stringify(readability, null, 2))
          expect(readability.backgroundAlpha).toBe(1)
          expect(readability.messageContrast).toBeGreaterThanOrEqual(4.5)
          expect(readability.buttonContrasts.length).toBeGreaterThan(0)
          expect(Math.min(...readability.buttonContrasts)).toBeGreaterThanOrEqual(4.5)
          expect(readability.fontSize).toBeGreaterThanOrEqual(14)
          expect(readability.lineHeight).toBeGreaterThanOrEqual(20)
          expect(readability.horizontalOverflow).toBe(false)
          await expect($('.cs-context-toolbar .cs-numbered-marker-toolbar')).toBeDisplayed()
          const layout = await browser.execute(() => {
            const notice = document.querySelector('.cs-action-feedback')!.getBoundingClientRect()
            const panels = ['.cs-topbar', '.cs-bottom-chrome', '.cs-tool-defaults-toolbar']
              .flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
              .map((element) => element.getBoundingClientRect())
              .filter((box) => box.width > 0 && box.height > 0)
            const overlaps = panels.some((box) => notice.left < box.right && box.left < notice.right
              && notice.top < box.bottom && box.top < notice.bottom)
            const fields = [...document.querySelectorAll<HTMLElement>('.cs-context-toolbar input, .cs-toolrail button[aria-pressed="true"]')]
              .filter((element) => !element.matches(':disabled') && element.getBoundingClientRect().width > 0)
            return {
              overlaps,
              within: notice.left >= 0 && notice.right <= innerWidth && notice.top >= 0 && notice.bottom <= innerHeight,
              fieldsReachable: fields.length > 0 && fields.every((element) => {
                const box = element.getBoundingClientRect()
                return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
              }),
            }
          })
          expect(layout).toEqual({ overlaps: false, within: true, fieldsReachable: true })
          const nextNumber = $('.cs-numbered-marker-toolbar input')
          await nextNumber.click()
          await nextNumber.setValue('7')
          await browser.keys(Key.Enter)
          await expect(nextNumber).toHaveValue('7')
          await expect(notice).toBeDisplayed()
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/action-feedback-${theme}-${locale}-${width}.png`))
          await notice.$('button.cs-action-feedback-close').click()
          await expect(notice).not.toExist()
          expect(await tool.isFocused()).toBe(true)
          await expect(tool).toHaveAttribute('aria-pressed', 'true')
        }
      })
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`keeps long diagnostics readable with accessible recovery controls: ${theme}`, async function () {
      this.timeout(90000)
      await browser.setWindowSize(900, 640)
      await browser.url('/?m05=1&captureError=long')
      await expect($('.cs-canvas-ready')).toExist()
      await setShellPreferences('en', theme)
      await $('button=Capture').click()
      const notice = $('.cs-action-feedback[role="alert"]')
      const message = notice.$('.cs-action-feedback-message')
      await expect(message).toHaveText(expect.stringContaining('End of diagnostic details.'))
      const readability = await notificationReadability()
      expect(readability.horizontalOverflow).toBe(false)
      expect(readability.messageContrast).toBeGreaterThanOrEqual(4.5)
      await message.click()
      expect(await message.isFocused()).toBe(true)
      await browser.keys(Key.End)
      await browser.waitUntil(() => browser.execute(() =>
        document.querySelector('.cs-action-feedback-message')!.scrollTop > 0))
      const reachable = await browser.execute(() => {
        const notice = document.querySelector<HTMLElement>('.cs-action-feedback')!
        return notice.scrollTop === 0 && [...notice.querySelectorAll('button')].every((button) => {
          const box = button.getBoundingClientRect()
          return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        })
      })
      expect(reachable).toBe(true)
      await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/notification-long-${theme}.png`))
      await notice.$('.cs-action-feedback-close').click()
      await expect(notice).not.toExist()
    })
  }
})
