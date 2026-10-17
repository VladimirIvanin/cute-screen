import { Key } from 'webdriverio'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setEditorPreferences } from '../editor-settings'

describe('editor settings in the native WebView', () => {
  it('opens and reactivates singleton Settings from the editor dropdown', async () => {
    await expect($('.cs-editor-shell')).toExist()
    await browser.setWindowSize(1024, 700)
    await setEditorPreferences('ru', 'dark')
    await expect($('button[aria-label="Снимок окна"]')).not.toExist()
    const trigger = $('button[aria-label="Настройки"]')
    await trigger.click()
    await browser.keys(Key.Escape)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await browser.execute(() => {
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') document.documentElement.dataset.settingsKeyTrusted = String(event.isTrusted)
      }, { once: true })
    })
    await browser.keys(Key.Enter)
    await expect($('.cs-settings-popover')).toBeDisplayed()
    expect(await browser.execute(() => document.documentElement.dataset.settingsKeyTrusted)).toBe('true')
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/editor-settings-ru-dark.png`)
    await $('button[aria-label="Настройки приложения…"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await $('.cs-settings-sidebar nav button:last-child').click()
    await expect($('.cs-shortcut-list')).toExist()
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/editor-settings-native-window.png`)
    await browser.tauri.switchWindow('main')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await $('button[aria-label="Настройки приложения…"]').click()
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:last-child')).toHaveAttribute('aria-current', 'page')
    expect((await browser.tauri.listWindows()).filter((label) => label === 'settings')).toHaveLength(1)
    await $('.cs-settings-footer button').click()
    await browser.tauri.switchWindow('main')
    await trigger.click()
    await $('button[aria-label="Настройки приложения…"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await $('.cs-settings-footer button').click()
  })
})
