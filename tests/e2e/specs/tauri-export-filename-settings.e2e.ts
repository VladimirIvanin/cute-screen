import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  copyFile,
  mkdir,
} from 'node:fs/promises'
import path from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import { nativeImageIngress } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'

async function openSettings(): Promise<void> {
  await $('button[aria-label="Settings"], button[aria-label="Настройки"]').click()
  await $('button[aria-label="Application settings…"], button[aria-label="Настройки приложения…"]').click()
  await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('settings'))
  await browser.tauri.switchWindow('settings')
  await $('#settings-language').selectByAttribute('value', 'en')
  await $('.cs-export-filename input').waitForEnabled()
  await $('.cs-export-filename').scrollIntoView()
}

describe('persisted PNG filename settings', () => {
  it('validates, cancels, saves, reopens and exports with the configured filename', async function () {
    this.timeout(180000)
    await browser.setWindowSize(1024, 700)
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image…"]').click()
    await $('button[aria-label="Export"]').waitForEnabled()
    await waitForStableCanvas()
    await openSettings()
    const input = $('.cs-export-filename input')
    await expect(input).toHaveValue('{date}_{time}_Скриншот')
    await input.setValue('{date} {time}')
    await expect($('.cs-export-filename [role="alert"]')).toHaveText('Replace spaces with hyphens or underscores.')
    await expect($('button=Save filename format')).toBeDisabled()
    await $('button=Cancel').click()
    await expect(input).toHaveValue('{date}_{time}_Скриншот')
    await input.setValue('{date}_{time}_Работа')
    await expect($('.cs-export-filename-preview')).toHaveText(expect.stringMatching(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_Работа\.png$/u))
    await $('button=Save filename format').click()
    await expect($('.cs-export-filename')).toHaveText(expect.stringContaining('Filename format saved'))
    const evidence = path.resolve('artifacts/tauri-e2e/export-filename-settings')
    await mkdir(evidence, { recursive: true })
    await browser.saveScreenshot(path.join(evidence, 'settings-en.png'))
    await $('#settings-language').selectByAttribute('value', 'ru')
    await expect($('.cs-export-filename label')).toHaveText('Шаблон имени')
    await browser.saveScreenshot(path.join(evidence, 'settings-ru.png'))
    await $('.cs-settings-footer button').click()
    await browser.tauri.switchWindow('main')
    await openSettings()
    await expect($('.cs-export-filename input')).toHaveValue('{date}_{time}_Работа')
    await $('button=Use default').click()
    await $('button=Cancel').click()
    await expect($('.cs-export-filename input')).toHaveValue('{date}_{time}_Работа')
    await $('.cs-settings-footer button').click()
    await browser.tauri.switchWindow('main')
    const output = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
      return (window as unknown as Native).__TAURI__.core.invoke<string>('test_result_export_named')
    })
    expect(path.basename(output)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_Работа\.png$/u)
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
    const decoded = await loadImage(output)
    expect([decoded.width, decoded.height]).toEqual([3840, 2160])
    await copyFile(output, path.join(evidence, path.basename(output)))
  })
})
