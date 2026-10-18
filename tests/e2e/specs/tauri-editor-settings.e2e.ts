import { Key } from 'webdriverio'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setEditorPreferences } from '../editor-settings'

async function expectSettingsTheme(theme: 'dark' | 'light'): Promise<void> {
  await expect($('html')).toHaveAttribute('data-theme', theme)
  await expect($('.cs-settings-footer button')).toExist()
  const colors = await browser.execute(() => {
    const surface = getComputedStyle(document.querySelector('.cs-settings')!)
    return {
      surface: surface.backgroundColor,
      text: surface.color,
      sidebar: getComputedStyle(document.querySelector('.cs-settings-sidebar')!).backgroundColor,
      footer: getComputedStyle(document.querySelector('.cs-settings-footer')!).backgroundColor,
      button: getComputedStyle(document.querySelector('.cs-settings-footer button')!).backgroundColor,
      colorScheme: getComputedStyle(document.querySelector('.cs-settings-scroll')!).colorScheme,
    }
  })
  expect(colors).toEqual(theme === 'dark' ? {
    surface: 'rgb(29, 30, 34)',
    text: 'rgb(244, 240, 244)',
    sidebar: 'rgb(37, 38, 43)',
    footer: 'rgb(37, 38, 43)',
    button: 'rgb(37, 38, 43)',
    colorScheme: 'dark',
  } : {
    surface: 'rgb(244, 244, 246)',
    text: 'rgb(39, 36, 42)',
    sidebar: 'rgb(255, 255, 255)',
    footer: 'rgb(255, 255, 255)',
    button: 'rgb(255, 255, 255)',
    colorScheme: 'normal',
  })
}

describe('editor settings in the native WebView', () => {
  it('opens and reactivates singleton Settings from the editor dropdown', async () => {
    await expect($('.cs-editor-shell')).toExist()
    const mainWindowHandle = await browser.getWindowHandle()
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
    await $('button[aria-label="Настройки приложения"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await expectSettingsTheme('dark')
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/settings-general-dark.png`)
    await $('.cs-settings-sidebar nav button:last-child').click()
    await expect($('.cs-shortcut-list')).toExist()
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/editor-settings-native-window.png`)
    await browser.tauri.switchWindow('main')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await setEditorPreferences('ru', 'light')
    await browser.tauri.switchWindow('settings')
    await expectSettingsTheme('light')
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/settings-shortcuts-live-light.png`)
    await browser.tauri.switchWindow('main')
    await setEditorPreferences('ru', 'dark')
    await trigger.click()
    await $('button[aria-label="Настройки приложения"]').click()
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:last-child')).toHaveAttribute('aria-current', 'page')
    await expectSettingsTheme('dark')
    expect((await browser.tauri.listWindows()).filter((label) => label === 'settings')).toHaveLength(1)
    await $('.cs-settings-footer button').click()
    await browser.switchToWindow(mainWindowHandle)
    await trigger.click()
    await $('button[aria-label="Настройки приложения"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await expectSettingsTheme('dark')
    await $('.cs-settings-footer button').click()
    await browser.switchToWindow(mainWindowHandle)
  })

  it('keeps cleanup confirmation and cancellation after a production capture', async () => {
    await browser.tauri.switchWindow('main')
    await setEditorPreferences('en', 'dark')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(() => browser.execute(async () => {
      const state = window as typeof window & {
        __TAURI__: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } }
      }
      return state.__TAURI__.core.invoke<boolean>('plugin:window|is_visible', { label: 'quick-capture' })
    }), { timeout: 45000 })
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.waitUntil(() => browser.execute(async () => !(await window.__cuteScreenE2eWindow?.isVisible())))
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toBeDisplayed()
    await $('.cs-history-trigger').click()
    await expect($('.cs-history-capture')).toBeDisplayed()
    await expect($('.cs-history-clear')).toHaveText('Clear history')
    await $('.cs-history-clear').click()
    await expect($('[role="alertdialog"]')).toBeDisplayed()
    await expect($('[role="alertdialog"]').$('button=Clear history')).toBeDisabled()
    await expect($('.cs-history-cancel')).toBeFocused()
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/history-labels-confirm-native.png`)
    await browser.keys(Key.Escape)
    await expect($('[role="alertdialog"]')).not.toExist()
    await expect($('.cs-history-clear')).toBeFocused()
    await expect($('.cs-history-capture')).toBeDisplayed()
    await $('.cs-history-close').click()
    await expect($('.cs-history-trigger')).toBeFocused()
  })
})
