import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { readFile } from 'node:fs/promises'
import { waitForStableCanvas } from '../canvas-ready'
import { waitForShapeAnimation } from '../shape-toolbar'

const url = 'https://github.com/googlefonts/noto-emoji'
const dispatchLog = process.env.CUTE_SCREEN_E2E_BROWSER_DISPATCH_LOG

async function dispatches(): Promise<string[]> {
  return (await readFile(dispatchLog!, 'utf8')).trim().split('\n').filter(Boolean)
}

async function verifyAttribution(prefix: string): Promise<void> {
  await browser.execute(async (label) => {
    type Native = { __TAURI__: { core: { invoke(command: string, args: unknown): Promise<unknown> } } }
    await (window as unknown as Native).__TAURI__.core.invoke('plugin:window|set_focus', { label })
  }, prefix === 'editor' ? 'main' : 'quick-capture')
  await browser.waitUntil(() => browser.execute(() => document.hasFocus()))
  await $('button[data-tool-id="emoji"]').click()
  const palette = $('.cs-emoji-toolbar button[aria-haspopup="dialog"]:last-of-type')
  await palette.waitForEnabled()
  await palette.click()
  await waitForShapeAnimation()
  const link = $('.cs-emoji-attribution a')
  await link.waitForDisplayed()
  await expect(link).toHaveAttribute('href', url)
  await browser.execute(() => {
    const link = document.querySelector<HTMLElement>('.cs-emoji-attribution a')!
    link.addEventListener('click', (event) => {
      link.dataset.clickTrusted = String(event.isTrusted)
    })
    link.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') link.dataset.enterTrusted = String(event.isTrusted)
    })
  })
  const count = (await dispatches()).length
  await link.click()
  await expect(link).toHaveAttribute('data-click-trusted', 'true')
  await browser.waitUntil(async () => (await dispatches()).length === count + 1)
  await expect(link).toBeFocused()
  await browser.keys('Enter')
  await browser.waitUntil(async () => (await dispatches()).length === count + 2)
  expect((await dispatches()).slice(count)).toEqual([url, url])
  await expect(link).toHaveAttribute('data-click-trusted', 'true')
  await expect(link).toHaveAttribute('data-enter-trusted', 'true')
  await expect(link).toBeDisplayed()
  await browser.saveScreenshot(`artifacts/tauri-e2e/${prefix}-noto-link.png`)
  await browser.keys('Escape')
}

describe('emoji attribution OS browser dispatch', () => {
  it('opens from Quick and Editor with pointer and keyboard and rejects other URLs', async function () {
    // The runner records the Linux OS opener boundary; no frontend or IPC mocks.
    if (!dispatchLog) this.skip()
    this.timeout(120000)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await $('[data-quick-action="editor"]').waitForEnabled()
    await $('button[data-tool-id="select"]').click()
    await waitForStableCanvas()
    const rect = await browser.execute(() =>
      document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + 5), y: Math.round(rect.top + 5) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .5),
        y: Math.round(rect.top + rect.height * .5), duration: 180 })
      .up({ button: 'left' }).perform()
    await verifyAttribution('quick')
    await $('[data-quick-action="editor"]').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyAttribution('editor')
    const count = (await dispatches()).length
    const rejected = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke(command: string, args: unknown): Promise<unknown> } } }
      const invoke = (window as unknown as Native).__TAURI__.core.invoke
      const results = await Promise.allSettled([
        invoke('plugin:opener|open_url', { url: 'https://example.com' }),
        invoke('plugin:opener|open_url', { url: 'file:///etc/passwd' }),
        invoke('plugin:opener|open_url', { url: 'https://github.com/googlefonts/noto-emoji/extra' }),
      ])
      return results.map((result) => result.status)
    })
    expect(rejected).toEqual(['rejected', 'rejected', 'rejected'])
    expect((await dispatches()).length).toBe(count)
  })
})
