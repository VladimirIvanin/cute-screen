import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { readFileSync } from 'node:fs'

const execute = promisify(execFile)
const appVersion = (JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as { version: string }).version

async function openSettings(): Promise<void> {
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing harness executable')
  await execute(executable, ['settings', '--section', 'shortcuts'])
  await browser.tauri.switchWindow('settings')
  await $('.cs-settings-sidebar nav button:first-child').waitForEnabled()
  await $('.cs-settings-sidebar nav button:first-child').click()
  await $('select[aria-label="Language / Язык"]').waitForDisplayed()
  await $('select[aria-label="Language / Язык"]').selectByAttribute('value', 'en')
  await $('.cs-settings-sidebar nav button:last-child').click()
  await expect($('.cs-shortcut-list')).toExist()
  await expect($('.cs-settings-version')).toHaveText(`Version ${appVersion}`)
}

describe('native shortcut settings and resident activation', () => {
  it('opens a singleton settings window through CLI and assigns through the real recorder', async () => {
    await openSettings()
    await browser.setWindowSize(820, 720)
    await expect($('[data-action="show-editor"]')).toExist()
    await $('[data-edit="show-editor"]').click()
    await expect($('.cs-record-shortcut')).toHaveAttribute('class', expect.stringContaining('is-recording'))
    await browser.keys(Key.Escape)
    await expect($('[data-edit="show-editor"]')).toBeFocused()
    await $('[data-edit="show-editor"]').click()
    await expect($('.cs-record-shortcut')).toHaveAttribute('class', expect.stringContaining('is-recording'))
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/settings-native-recording.png`)
    await browser.keys([Key.Control, Key.Alt, Key.Shift, '9'])
    await expect($('p=Available in registration check')).toBeDisplayed()
    await $('button=Save').click()
    await expect($('[data-action="show-editor"] kbd')).toHaveText('Ctrl+Alt+Shift+9')
    await openSettings()
    await expect($('[data-action="show-editor"] kbd')).toHaveText('Ctrl+Alt+Shift+9')
    await browser.execute(() => {
      document.querySelector('.cs-settings')?.scrollTo(0, 0)
    })
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/activation-settings-native.png`)
  })

  it('opens General through the only native tray settings item and preserves its section on another CLI call', async function () {
    if (process.platform !== 'linux') {
      this.skip()
      return
    }
    await $('.cs-settings-footer button').click()
    await browser.tauri.switchWindow('main')
    const { stdout } = await execute('pgrep', ['-f', `^${process.env.CUTE_SCREEN_WDIO_APP_BINARY}( |$)`])
    const { stdout: menu } = await execute('/usr/bin/python3', ['tests/e2e/native-settings-tray.py', stdout.trim()])
    const entries = JSON.parse(menu) as { label: string }[]
    expect(entries.filter((entry) => ['Settings…', 'Настройки…'].includes(entry.label))).toHaveLength(1)
    expect(entries.some((entry) => entry.label.includes('Assign keyboard shortcuts'))).toBe(false)
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    await execute(process.env.CUTE_SCREEN_WDIO_APP_BINARY!, ['settings', '--section', 'shortcuts'])
    await browser.tauri.switchWindow('settings')
    await expect($('.cs-settings-sidebar nav button:first-child')).toHaveAttribute('aria-current', 'page')
    expect((await browser.tauri.listWindows()).filter((label) => label === 'settings')).toHaveLength(1)
    await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/settings-native-general.png`)
  })

  it('restores the hidden editor after a physical X11 global shortcut', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE === 'wayland') {
      this.skip()
      return
    }
    await $('.cs-settings-footer button').click()
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
