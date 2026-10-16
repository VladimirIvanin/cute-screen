import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'

const execute = promisify(execFile)

async function openSettings(): Promise<void> {
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing harness executable')
  await execute(executable, ['settings', '--section', 'shortcuts'])
  await browser.tauri.switchWindow('settings')
  await $('select[aria-label="Language / Язык"]').selectByAttribute('value', 'en')
  await expect($('.cs-shortcut-list')).toExist()
}

describe('native shortcut settings and resident activation', () => {
  it('opens a singleton settings window through CLI and assigns through the real recorder', async () => {
    await openSettings()
    await browser.setWindowSize(820, 720)
    await expect($('[data-action="show-editor"]')).toExist()
    await $('button[aria-label="Change: Open editor"]').click()
    await $('.cs-record-shortcut').click()
    await browser.keys([Key.Control, Key.Alt, Key.Shift, '9'])
    await expect($('p=Available in registration check')).toBeDisplayed()
    await $('button=Assign').click()
    await expect($('[data-action="show-editor"] kbd')).toHaveText('Ctrl+Alt+Shift+9')
    await openSettings()
    await expect($('[data-action="show-editor"] kbd')).toHaveText('Ctrl+Alt+Shift+9')
    await browser.execute(() => {
      document.querySelector('.cs-settings')?.scrollTo(0, 0)
    })
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/activation-settings-native.png`)
  })

  it('restores the hidden editor after a physical X11 global shortcut', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE === 'wayland') {
      this.skip()
      return
    }
    await $('button=Done').click()
    await browser.tauri.switchWindow('main')
    await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
    })
    expect(await browser.execute(() => window.__cuteScreenE2eWindow?.isVisible())).toBe(false)
    await execute('xdotool', ['key', '--clearmodifiers', 'ctrl+alt+shift+9'])
    await browser.waitUntil(async () => {
      return (await browser.execute(() => window.__cuteScreenE2eWindow?.isVisible())) === true
    })
    await expect($('.cs-editor-shell')).toExist()
  })
})
