import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { setShellPreferences } from './browser-m06-test-kit'

describe('compact recent history', () => {
  it('virtualizes 1000 captures and keeps history out of the permanent work surface', async () => {
    await browser.setWindowSize(1024, 700)
    await browser.url('/?historyHarness=1')
    const trigger = $('.cs-history-trigger')
    const before = await $('.cs-toolrail').getLocation()
    await trigger.click()
    await expect($('[role="dialog"][aria-label="Capture history"]')).toBeDisplayed()
    await expect($('.cs-history-capture img')).toBeDisplayed()
    expect(await $$('.cs-history-card').length).toBeLessThanOrEqual(10)
    const rect = await $('.cs-history-popover').getSize()
    expect(rect.width).toBeLessThanOrEqual(360)
    expect(rect.height).toBeLessThanOrEqual(460)
    expect(await $('.cs-toolrail').getLocation()).toEqual(before)
    await $('[data-history-id="capture-1"]').click()
    await trigger.click()
    await expect($('[data-history-id="capture-1"]')).toHaveAttribute('aria-current', 'true')
    await $('[data-history-id="capture-1"]').click({ button: 'left' })
    await trigger.click()
    await $('[data-history-id="capture-0"]').click()
    await trigger.click()
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/history-light-1024.png'))
    await browser.keys('Escape')
    await expect(trigger).toBeFocused()
  })
  it('deletes directly with confirmation and clears all pages only after confirmation', async () => {
    await browser.setWindowSize(1024, 700)
    await browser.url('/?historyHarness=1&locale=ru')
    await $('.cs-history-trigger').click()
    await expect($('.cs-history-capture img')).toBeDisplayed()
    const layout = await browser.execute(() => {
      const cards = [...document.querySelectorAll('.cs-history-card')].map((card) => card.getBoundingClientRect())
      return { first: cards[0]!.top, second: cards[1]!.top, third: cards[2]!.top, preview: document.querySelector('.cs-history-capture img')!.getBoundingClientRect().width }
    })
    expect(layout.first).toBe(layout.second)
    expect(layout.third).toBeGreaterThan(layout.first)
    expect(layout.preview).toBeGreaterThan(130)
    await browser.execute(() => document.querySelector('.cs-history-scroll')!.scrollTo(0, 279))
    await browser.waitUntil(() => browser.execute(() => {
      const viewport = document.querySelector('.cs-history-scroll')!.getBoundingClientRect()
      const cards = [...document.querySelectorAll('.cs-history-card')].map((card) => card.getBoundingClientRect())
      return Math.min(...cards.map((card) => card.top)) <= viewport.top &&
        Math.max(...cards.map((card) => card.bottom)) >= viewport.bottom
    }))
    await browser.execute(() => document.querySelector('.cs-history-scroll')!.scrollTo(0, 0))
    await expect($('[data-history-index="0"]')).toBeDisplayed()
    await $('[data-history-index="0"]').click({ button: 'left' })
    await $('.cs-history-trigger').click()
    await browser.keys('ArrowDown')
    await expect($('[data-history-index="2"]')).toBeFocused()
    for (const index of [0, 1, 4, 5]) {
      await $(`[data-history-index="${index}"] + .cs-history-delete`).click()
      await expect($('[role="alertdialog"]')).toBeDisplayed()
      await expect($('.cs-history-cancel')).toBeFocused()
      await browser.keys('Escape')
      await expect($(`[data-history-index="${index}"] + .cs-history-delete`)).toBeFocused()
      await expect($(`[data-history-index="${index}"]`)).toExist()
    }
    expect(await $$('.cs-history-more, .cs-history-card-menu').length).toBe(0)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/history-direct-delete.png'))
    await $('[data-history-index="2"] + .cs-history-delete').moveTo()
    await $('[data-history-index="2"] ~ .cs-history-protect').click()
    await expect($('[data-history-index="2"] ~ .cs-history-protect')).toHaveAttribute('aria-pressed', 'true')
    await $('.cs-history-clear').click()
    await expect($('[role="alertdialog"]')).toHaveText(expect.stringContaining('997'))
    await expect($('.cs-history-cancel')).toBeFocused()
    await browser.keys('Escape')
    await expect($('.cs-history-clear')).toBeFocused()
    await expect($('[data-history-index="2"]')).toExist()
    await $('.cs-history-clear').click()
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/history-clear-confirm-ru.png'))
    await $('button=Очистить историю').click()
    await expect($('.cs-history-notice')).toHaveText('Удалено снимков: 997')
    await expect($$('.cs-history-card')).toBeElementsArrayOfSize(3)
    await $('.cs-history-clear').click()
    await expect($('[role="alertdialog"]')).toHaveText(expect.stringContaining('0'))
    await expect($('button=Очистить историю')).toBeDisabled()
    await $('.cs-history-cancel').click()
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/history-cleared-ru.png'))
  })
  it('shows translated storage limits and requires review before legacy cleanup', async () => {
    await browser.url('/?historyHarness=1&historySettings=1&locale=ru')
    await expect($('h2')).toHaveText('История и хранение')
    const selects = await $$('select')
    expect(await selects[0]!.getValue()).toBe('7')
    expect(await selects[1]!.getValue()).toBe('512')
    expect(await selects[2]!.getValue()).toBe('200')
    await $('button=Применить к старым снимкам…').click()
    await expect($('.cs-history-confirm')).toBeDisplayed()
    await $('button=Отмена').click()
    await expect($('.cs-history-confirm')).not.toExist()
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/history-storage-ru.png'))
  })
  it('keeps the popover bounded in both themes and locales at desktop sizes', async () => {
    const cases = [
      { width: 1600, height: 1000, locale: 'en', theme: 'dark' },
      { width: 1280, height: 720, locale: 'en', theme: 'light' },
      { width: 1024, height: 700, locale: 'ru', theme: 'dark' },
    ] as const
    for (const scenario of cases) {
      await browser.setWindowSize(scenario.width, scenario.height)
      await browser.url(`/?historyHarness=1&locale=${scenario.locale}`)
      await setShellPreferences(scenario.locale, scenario.theme)
      await $('.cs-history-trigger').click()
      await expect($('.cs-history-capture img')).toBeDisplayed()
      const bounds = await browser.execute(() => {
        const rect = document.querySelector('.cs-history-popover')!.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      })
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(scenario.width)
      expect(bounds.width).toBeLessThanOrEqual(360)
      expect(bounds.height).toBeLessThanOrEqual(460)
      const file = `history-${scenario.theme}-${scenario.locale}-${scenario.width}.png`
      await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', file))
      await browser.keys('Escape')
      await expect($('.cs-history-trigger')).toBeFocused()
    }
  })

})
