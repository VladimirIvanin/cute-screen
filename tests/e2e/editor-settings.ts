import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

/** Operates the production dropdown; preferences stay open until explicitly dismissed. */
export async function setEditorPreferences(
  locale: 'en' | 'ru',
  theme?: 'light' | 'dark',
): Promise<void> {
  const currentLocale = await browser.execute(() => document.documentElement.lang)
  const currentTheme = await browser.execute(() => document.documentElement.dataset.theme)
  if (
    currentLocale === locale &&
    (!theme ||
      currentTheme === theme)
  ) return
  const trigger = $('.cs-top-actions button[aria-haspopup="dialog"]')
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await $(`.cs-settings-choices label:has(input[value="${locale}"])`).click()
  if (theme) await $(`.cs-settings-choices label:has(input[value="${theme}"])`).click()
  await browser.waitUntil(async () => (
    (await browser.execute(() => document.documentElement.lang)) === locale &&
    (!theme || (await browser.execute(() => document.documentElement.dataset.theme)) === theme)
  ))
  await browser.keys(Key.Escape)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect($('.cs-settings-popover')).not.toBeDisplayed()
}
