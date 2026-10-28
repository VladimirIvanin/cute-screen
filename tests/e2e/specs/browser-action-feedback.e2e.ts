import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { Key } from 'webdriverio'
import { setShellPreferences } from './browser-m06-test-kit'

describe('Action feedback leaves editor tools accessible', () => {
  for (const locale of ['en', 'ru'] as const) {
    for (const width of [1600, 1024, 900]) {
      it(`keeps marker settings usable after capture denial: ${locale}, ${width}px`, async function () {
        this.timeout(90000)
        await browser.setWindowSize(width, 700)
        await browser.url('/?m05=1&captureDenied=1')
        await expect($('.cs-canvas-ready')).toExist()
        await setShellPreferences(locale, 'dark')
        const tool = $('[data-tool-id="numberedMarker"]')
        await tool.click()
        await $(locale === 'ru' ? 'button=Снимок' : 'button=Capture').click()
        const notice = $('.cs-action-feedback[role="alert"]')
        await expect(notice).toBeDisplayed()
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
        await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/action-feedback-${locale}-${width}.png`))
        await notice.$('button.cs-action-feedback-close').click()
        await expect(notice).not.toExist()
        expect(await tool.isFocused()).toBe(true)
        await expect(tool).toHaveAttribute('aria-pressed', 'true')
      })
    }
  }
})
