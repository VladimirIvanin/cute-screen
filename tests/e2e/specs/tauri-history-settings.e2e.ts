import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { setEditorPreferences } from '../editor-settings'

async function openStorage(): Promise<void> {
  await browser.tauri.switchWindow('main')
  const trigger = $('.cs-history-trigger')
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  const storage = $('.cs-history-popover footer button')
  await expect(storage).toBeEnabled()
  await storage.click()
  await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
  await browser.tauri.switchWindow('settings')
  await expect($('.cs-history-settings')).toBeDisplayed()
  await expect($('.cs-history-settings')).toHaveAttribute('aria-busy', 'false')
  await expect($('.cs-history-settings select')).toBeEnabled()
  await expect($('.cs-history-settings dl')).toBeDisplayed()
  expect((await browser.tauri.listWindows()).filter((label) => label === 'settings')).toHaveLength(1)
  await expectNotificationStateReadable()
}

async function expectNotificationStateReadable(): Promise<void> {
  const outcome = await browser.execute(async () => {
    type Native = { __TAURI__: { core: { invoke(command: string): Promise<unknown> } } }
    try {
      await (window as unknown as Native).__TAURI__.core.invoke('plugin:notification|is_permission_granted')
      return 'resolved'
    } catch (error) {
      return String(error)
    }
  })
  expect(outcome).toBe('resolved')
}

async function closeSettings(): Promise<void> {
  await $('.cs-settings-footer button').click()
  await browser.tauri.switchWindow('main')
  await browser.waitUntil(async () => !(await browser.tauri.listWindows()).includes('settings'))
  await expect($('.cs-editor-shell')).toBeDisplayed()
}

describe('storage settings from history in the native WebView', () => {
  it('loads, reactivates and closes Settings without blocking the window event loop', async () => {
    await expect($('.cs-editor-shell')).toBeDisplayed()
    await browser.setWindowSize(1024, 700)
    await setEditorPreferences('ru', 'dark')
    await $('.cs-history-trigger').click()
    await expect($('.cs-history-popover')).toHaveAttribute('aria-busy', 'false')
    await expect($('.cs-history-clear')).toHaveText('Очистить')
    await expect($('.cs-history-popover footer button')).toHaveText('Хранение')
    const closeSize = await $('.cs-history-close').getSize()
    const iconSize = await $('.cs-history-close svg').getSize()
    expect(closeSize).toEqual({ width: 32, height: 32 })
    expect(iconSize).toEqual({ width: 18, height: 18 })
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/history-labels-native.png`)
    await $('.cs-history-close').click()
    await expect($('.cs-history-popover')).not.toBeDisplayed()
    await expect($('.cs-history-trigger')).toBeFocused()
    await openStorage()
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/history-settings-native.png`)
    await $('.cs-settings-sidebar nav button:first-child').click()
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await openStorage()
    await closeSettings()
    await openStorage()
    await closeSettings()
    if (await $('.cs-history-trigger').getAttribute('aria-expanded') !== 'true') await $('.cs-history-trigger').click()
    await expect($('.cs-history-popover')).toHaveAttribute('aria-busy', 'false')
    await browser.keys(Key.Escape)
    await expect($('.cs-history-popover')).not.toBeDisplayed()
    await expect($('.cs-history-trigger')).toBeFocused()
  })
})
