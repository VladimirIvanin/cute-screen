import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { russianTrayLabels } from '../tray-labels'

export interface TrayLabels {
  items: { id: string; text: string; enabled: boolean }[]
  startup: string[]
}

export async function nativeTrayLabels(): Promise<TrayLabels> {
  return browser.execute(async () => {
    type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
    return (window as unknown as Native).__TAURI__.core.invoke<TrayLabels>('test_tray_labels')
  })
}

describe('native tray follows the Settings language', () => {
  it('switches all native menu labels RU/EN, synchronizes the editor and persists Russian', async () => {
    await expect($('.cs-editor-shell')).toExist()
    await $('button[aria-label="Settings"]').click()
    await $('button[aria-label="Application settings"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    const russian = russianTrayLabels
    const evidence: TrayLabels[] = []
    for (const locale of ['ru', 'en', 'ru']) {
      await $('#settings-language').selectByAttribute('value', locale)
      await browser.waitUntil(async () => {
        const labels = await nativeTrayLabels()
        return labels.items.find((item) => item.id === 'quit')?.text === (locale === 'ru' ? 'Выход' : 'Quit')
      })
      const labels = await nativeTrayLabels()
      expect(labels.items).toHaveLength(russian.length)
      if (locale === 'ru') labels.items.forEach((item, index) => expect(item.text.split('    ')[0]).toBe(russian[index]))
      else {
        expect(labels.items[0]?.text).toContain('Capture Area')
        expect(labels.items.at(-2)?.text).toBe('Settings…')
      }
      evidence.push(labels)
    }
    await $('.cs-settings-sidebar nav button:last-child').click()
    await expect($('.cs-shortcut-list')).toBeDisplayed()
    const actions = await browser.execute(() => [...document.querySelectorAll('.cs-shortcut-list [data-action]')]
      .map((row) => row.getAttribute('data-action')))
    expect(actions).toEqual(process.platform === 'darwin'
      ? ['capture-area', 'capture-screen', 'show-editor']
      : ['capture-area', 'capture-screen', 'capture-window', 'capture-active-window', 'capture-repeat', 'show-editor'])
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/tray-locale-settings-ru.png`)
    await $('.cs-settings-footer button').click()
    await browser.tauri.switchWindow('main')
    await expect($('button[aria-label="Настройки"]')).toExist()
    await $('button[aria-label="Настройки"]').click()
    await $('button[aria-label="Настройки приложения"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
    await browser.tauri.switchWindow('settings')
    await expect($('#settings-language')).toHaveValue('ru')
    await writeFile(path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'tray-locale.json'), JSON.stringify(evidence, null, 2))
  })
})
