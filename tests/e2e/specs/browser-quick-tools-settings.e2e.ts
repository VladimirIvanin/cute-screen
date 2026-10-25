import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { mkdir } from 'node:fs/promises'

async function dragTo(
  id: string,
  zone: string,
  cancel = false,
  beforeId?: string,
): Promise<void> {
  const source = await $(`[data-quick-tool="${id}"]`)
  const target = await $(beforeId ? `[data-quick-tool="${beforeId}"]` : `[data-quick-zone="${zone}"]`)
  await target.scrollIntoView()
  const point = await browser.execute((element, before) => {
    const bounds = element.getBoundingClientRect()
    return {
      x: Math.round(before ? bounds.left + 6 : bounds.left + bounds.width / 2),
      y: Math.round(bounds.bottom - 16),
    }
  }, target, Boolean(beforeId))
  await browser.action('pointer', { id: 'quick-tools-pointer' }).move({ origin: source }).down().move({ origin: 'viewport', x: point.x, y: point.y, duration: 500 }).perform(true)
  if (cancel) await browser.keys(Key.Escape)
  await browser.action('pointer', { id: 'quick-tools-pointer' }).up().perform()
}

describe('quick toolbar settings', () => {
  it('persists trusted drags, supports cancellation and keyboard, and fits both locales/themes', async () => {
    await browser.url('/?settings=general&settingsHarness=1')
    await browser.execute(() => localStorage.clear())
    await browser.url('/?settings=quick-tools&settingsHarness=1')
    const chrome = await browser.execute(() => ({ width: outerWidth - innerWidth, height: outerHeight - innerHeight }))
    await browser.setWindowSize(820 + chrome.width, 720 + chrome.height)
    await expect($('.cs-quick-tools-settings')).toBeDisplayed()
    await expect($('[data-quick-tool="select"]')).toBeDisabled()
    await expect($('[data-quick-tool="hand"]')).not.toExist()
    await expect($('[data-quick-tool="crop"]')).not.toExist()
    await dragTo('arrow', 'hidden')
    await expect($('[data-quick-zone="hidden"] [data-quick-tool="arrow"]')).toExist()
    await dragTo('line', 'hidden', true)
    await expect($('[data-quick-zone="active"] [data-quick-tool="line"]')).toExist()
    await browser.refresh()
    await expect($('[data-quick-zone="hidden"] [data-quick-tool="arrow"]')).toExist()
    await dragTo('arrow', 'active')
    await expect($('[data-quick-zone="active"] [data-quick-tool="arrow"]')).toExist()
    await dragTo('spotlight', 'active', false, 'line')
    const readOrder = async () => browser.execute(() => [...document.querySelectorAll<HTMLElement>(
      '[data-quick-zone="active"] [data-quick-tool]',
    )].map((element) => element.dataset.quickTool))
    expect((await readOrder()).slice(0, 3)).toEqual(['select', 'spotlight', 'line'])
    await browser.refresh()
    await expect($('.cs-quick-tools-settings')).toBeDisplayed()
    expect((await readOrder()).slice(0, 3)).toEqual(['select', 'spotlight', 'line'])
    await $('[data-quick-tool="line"]').click()
    await browser.keys(Key.Enter)
    await browser.keys([Key.Alt, Key.ArrowUp])
    expect((await readOrder()).at(-2)).toBe('line')
    await $('[data-quick-tool="arrow"]').click()
    await browser.keys(Key.Enter)
    await expect($('[data-quick-zone="active"] [data-quick-tool="arrow"]')).toExist()
    await browser.keys(Key.Space)
    await expect($('[data-quick-zone="hidden"] [data-quick-tool="arrow"]')).toExist()
    // All movable tools may be hidden; V is retained.
    for (const tool of await $$('[data-quick-zone="active"] button:not(:disabled)')) await tool.click()
    await expect($$('[data-quick-zone="active"] button')).toBeElementsArrayOfSize(1)
    await $('[data-quick-tool="arrow"]').click()
    await dragTo('ruler', 'hidden', false, 'line')
    const hiddenOrder = await browser.execute(() => [...document.querySelectorAll<HTMLElement>(
      '[data-quick-zone="hidden"] [data-quick-tool]',
    )].map((element) => element.dataset.quickTool))
    expect(hiddenOrder.slice(hiddenOrder.indexOf('ruler'), hiddenOrder.indexOf('ruler') + 2)).toEqual(['ruler', 'line'])
    await browser.action('pointer', { id: 'quick-tools-pointer' })
      .move({ origin: await $('[data-quick-tool="ruler"]') }).down()
      .move({ origin: await $('.cs-settings-sidebar'), duration: 300 }).up().perform()
    await expect($('[data-quick-zone="hidden"] [data-quick-tool="ruler"]')).toExist()
    await mkdir('artifacts/quick-tools-settings', { recursive: true })
    for (const locale of ['en', 'ru']) for (const theme of ['light', 'dark']) {
      await browser.execute((language, appearance) => {
        const key = 'cute-screen.ui-preferences.v1'
        const value = JSON.parse(localStorage.getItem(key)!)
        localStorage.setItem(key, JSON.stringify({ ...value, locale: language, theme: appearance, quickHiddenTools: ['arrow', 'loupe', 'eyedropper'] }))
      }, locale, theme)
      await browser.refresh()
      await expect($('.cs-quick-tools-settings')).toBeDisplayed()
      expect(await browser.execute(() => {
        const panel = document.querySelector('.cs-settings-scroll')!
        return panel.scrollWidth <= panel.clientWidth && document.documentElement.scrollWidth <= innerWidth
      })).toBe(true)
      await browser.saveScreenshot(`artifacts/quick-tools-settings/${locale}-${theme}.png`)
    }
    await browser.setWindowSize(620 + chrome.width, 520 + chrome.height)
    expect(await browser.execute(() => {
      const panel = document.querySelector('.cs-settings-scroll')!
      return panel.scrollWidth <= panel.clientWidth
    })).toBe(true)
  })
})
