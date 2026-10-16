import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  browser,
  expect,
} from '@wdio/globals'

describe('persisted resident shortcut', () => {
  it('registers the previous shortcut before settings are opened', async function () {
    if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE === 'wayland') {
      this.skip()
      return
    }
    await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
    })
    await promisify(execFile)('xdotool', ['key', '--clearmodifiers', 'ctrl+alt+shift+9'])
    await browser.waitUntil(async () => {
      return (await browser.execute(() => window.__cuteScreenE2eWindow?.isVisible())) === true
    })
    expect(await browser.execute(() => window.__cuteScreenE2eWindow?.isVisible())).toBe(true)
  })
})
