import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

describe('macOS shows only available capture actions', () => {
  it('filters native tray and shortcut settings in a real webview', async () => {
    if (process.platform !== 'darwin') return

    await expect($('.cs-editor-shell')).toExist()
    const tray = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
      type TrayLabels = { items: { id: string; text: string; enabled: boolean }[]; startup: string[] }
      return (window as unknown as Native).__TAURI__.core.invoke<TrayLabels>('test_tray_labels')
    })
    expect(tray.items.map((item) => item.id)).toEqual([
      'capture-area',
      'capture-screen',
      'show-editor',
      'settings',
      'quit',
    ])

    await $('button[aria-label="Settings"]').click()
    await $('button[aria-label="Application settings"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await $('.cs-settings-sidebar nav button:last-child').click()
    await expect($('.cs-shortcut-list')).toBeDisplayed()
    const actions = await browser.execute(() => [...document.querySelectorAll('.cs-shortcut-list [data-action]')]
      .map((row) => row.getAttribute('data-action')))
    expect(actions).toEqual(['capture-area', 'capture-screen', 'show-editor'])

    const artifactDirectory = process.env.CUTE_SCREEN_WDIO_ARTIFACTS!
    await browser.saveScreenshot(path.resolve(artifactDirectory, 'macos-available-actions.png'))
    await writeFile(path.resolve(artifactDirectory, 'macos-available-actions.json'), JSON.stringify({ tray, actions }, null, 2))
  })
})
