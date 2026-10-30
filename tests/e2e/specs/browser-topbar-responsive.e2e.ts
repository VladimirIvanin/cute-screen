import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { Key } from 'webdriverio'
import { setEditorPreferences } from '../editor-settings'

async function topbarGeometry() {
  return browser.execute(() => {
    const header = document.querySelector<HTMLElement>('.cs-topbar')!
    const visible = (element: Element) => element.getBoundingClientRect().width > 0
    const groups = [...header.children].filter(visible)
    const buttons = [...header.querySelectorAll('button')].filter(visible)
    const within = (
      element: Element,
      parent: DOMRect,
    ) => {
      const box = element.getBoundingClientRect()
      return (
        box.left >= parent.left - 1 &&
        box.right <= parent.right + 1 &&
        box.top >= parent.top - 1 &&
        box.bottom <= parent.bottom + 1
      )
    }
    const nonOverlapping = (elements: Element[]) => elements.every((element, index) => {
      const a = element.getBoundingClientRect()
      return elements.slice(index + 1).every((other) => {
        const b = other.getBoundingClientRect()
        return (
          a.right <= b.left + 1 ||
          b.right <= a.left + 1 ||
          a.bottom <= b.top + 1 ||
          b.bottom <= a.top + 1
        )
      })
    })
    return {
      groupsFit: groups.every((element) => within(element, header.getBoundingClientRect())),
      groupsDoNotOverlap: nonOverlapping(groups),
      buttonsDoNotOverlap: nonOverlapping(buttons),
      contentsFit: buttons.every((button) => [...button.querySelectorAll('svg, .n-button__content > span')]
        .filter(visible).every((content) => within(content, button.getBoundingClientRect()))),
      insideWindow: header.getBoundingClientRect().left >= 0 && header.getBoundingClientRect().right <= innerWidth,
      singleRow: header.offsetHeight <= 44,
      adjacentChromeBelow: [...document.querySelectorAll('.cs-layers-panel, .cs-layers-peek, .cs-composition-panel, .cs-action-feedback')]
        .filter(visible).every((element) => {
          return element.getBoundingClientRect().top >= header.getBoundingClientRect().bottom + 8
        }),
    }
  })
}

describe('responsive editor topbar', () => {
  for (const locale of ['ru', 'en'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      it(`keeps groups and button contents separate while resizing in ${locale}/${theme}`, async () => {
        await browser.setWindowSize(1600, 900)
        await browser.url('/')
        await browser.execute(() => window.localStorage.clear())
        await browser.url('/?m02=ready')
        await expect($('.cs-editor-shell')).toExist()
        await setEditorPreferences(locale, theme)
        for (const width of [1600, 1440, 1280, 1200, 1100, 1024, 900, 760, 640, 480, 360, 1600]) {
          await browser.setWindowSize(width, 900)
          expect(await topbarGeometry()).toEqual({
            groupsFit: true,
            groupsDoNotOverlap: true,
            buttonsDoNotOverlap: true,
            contentsFit: true,
            insideWindow: true,
            singleRow: true,
            adjacentChromeBelow: true,
          })
          for (const name of locale === 'ru'
            ? ['Отменить', 'Повторить', 'Снимок', 'Копировать', 'Экспорт']
            : ['Undo', 'Redo', 'Capture', 'Copy', 'Export']) {
            await expect($(`.cs-topbar button[aria-label="${name}"]`)).toBeDisplayed()
          }
          if ([1600, 1280, 1024, 640, 360].includes(width)) {
            await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `topbar-${width}-${locale}-${theme}.png`))
          }
        }
        await browser.setWindowSize(1024, 700)
        const settings = $('.cs-top-actions button[aria-haspopup="dialog"]')
        await settings.click()
        await expect($('.cs-settings-popover')).toBeDisplayed()
        await expect($('.cs-agent-connect')).not.toBeDisplayed()
        await expect($('.cs-settings-popover .cs-agent-overflow')).toBeDisplayed()
        await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `topbar-agent-settings-${locale}-${theme}.png`))
        await browser.keys(Key.Escape)
        await expect(settings).toBeFocused()
      }).timeout(120000)
    }
  }

  it('wraps enlarged labels without crushing the brand or history', async () => {
    await browser.setWindowSize(1280, 800)
    await browser.url('/?m02=ready')
    await setEditorPreferences('ru', 'dark')
    await browser.execute(() => {
      const style = document.createElement('style')
      style.id = 'topbar-text-scale'
      style.textContent = '.cs-topbar .n-button { font-size: 24px; } .cs-brand { font-size: 24px; }'
      document.head.append(style)
    })
    try {
      for (const width of [1600, 1280, 1024, 640, 360]) {
        await browser.setWindowSize(width, 800)
        await browser.waitUntil(async () => (await topbarGeometry()).adjacentChromeBelow)
        expect(await topbarGeometry()).toMatchObject({
          groupsFit: true,
          groupsDoNotOverlap: true,
          buttonsDoNotOverlap: true,
          contentsFit: true,
          insideWindow: true,
          adjacentChromeBelow: true,
        })
        await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `topbar-large-text-${width}.png`))
      }
    } finally {
      await browser.execute(() => document.getElementById('topbar-text-scale')?.remove())
    }
  })
})
