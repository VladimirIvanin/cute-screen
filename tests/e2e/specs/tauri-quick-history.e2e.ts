import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { selectionDocument } from '../selection-interactions'
import { waitForStableCanvas } from '../canvas-ready'
import {
  quickWindowVisibility,
  verifyQuickHistoryDocument,
} from '../quick-history'

describe('Quick capture save to history', () => {
  it('saves a non-origin crop with ink and uncommitted text, then exits without showing Editor', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('[data-quick-action="history"]')).toBeEnabled()
    await expect($('[data-quick-action="history"]')).toBeDisplayed()
    await browser.waitUntil(async () => (await quickWindowVisibility()).quick)
    await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } }
      }
      await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'quick-capture' })
    })
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    expect((await selectionDocument()).canvas).toEqual({ width: 3840, height: 2160 })
    const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + 1), y: Math.round(rect.top + 1) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .2), y: Math.round(rect.top + rect.height * .2), duration: 180 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => ((await selectionDocument()).crop?.x ?? 0) > 0,
      { timeoutMsg: 'Native crop gesture did not move the left edge' })
    const crop = (await selectionDocument()).crop!
    expect(crop.x).toBeGreaterThan(0)
    expect(crop.y).toBeGreaterThan(0)
    await writeFile('artifacts/tauri-e2e/quick-history-crop.json', JSON.stringify({
      x: Math.round(crop.x),
      y: Math.round(crop.y),
      width: Math.round(crop.x + crop.width) - Math.round(crop.x),
      height: Math.round(crop.y + crop.height) - Math.round(crop.y),
    }))
    const point = { x: Math.round(rect.left + rect.width * .35), y: Math.round(rect.top + rect.height * .4) }
    await $('button[aria-label="Pencil"]').click()
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await waitForStableCanvas()
    await browser.action('pointer').move({ origin: 'viewport', ...point }).down({ button: 'left' })
      .move({ origin: 'pointer', x: 75, y: 30, duration: 150 })
      .move({ origin: 'pointer', x: 75, y: 30, duration: 150 }).up({ button: 'left' }).perform()
    await writeFile('artifacts/tauri-e2e/quick-history-draft.json', JSON.stringify(await selectionDocument(), null, 2))
    await browser.waitUntil(async () => (await selectionDocument()).layers.some((layer) => layer.kind === 'pencil'),
      { timeoutMsg: 'Native pencil gesture did not create a stroke' })
    await $('button[aria-label="Text"]').click()
    await browser.action('pointer').move({ origin: 'viewport', x: point.x, y: point.y + 120 })
      .down({ button: 'left' }).up({ button: 'left' }).perform()
    await $('[contenteditable="true"][aria-label="Text editor"]').addValue('History note')
    const geometry = await browser.execute(() => {
      const nav = document.querySelector('.cs-quick-actions')!.getBoundingClientRect()
      return { width: nav.width, buttons: [...document.querySelectorAll('.cs-quick-actions button')].map((button) => {
        const box = button.getBoundingClientRect()
        return { width: box.width, height: box.height, name: button.getAttribute('aria-label'), svg: Boolean(button.querySelector('svg')) }
      }) }
    })
    expect(geometry.width).toBe(46)
    expect(geometry.buttons).toHaveLength(5)
    for (const button of geometry.buttons) expect(button).toMatchObject({ width: 36, height: 36, svg: true })
    await browser.saveScreenshot('artifacts/tauri-e2e/quick-history-before.png')
    await $('.cs-quick-actions').saveScreenshot('artifacts/tauri-e2e/quick-actions-compact.png')
    await $('[data-quick-action="history"]').click()
    await browser.waitUntil(async () => !(await quickWindowVisibility()).quick)
    expect(await quickWindowVisibility()).toEqual({ main: false, quick: false })
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable) throw new Error('Missing isolated application binary')
    await promisify(execFile)(executable, ['show'])
    await browser.tauri.switchWindow('main')
    await verifyQuickHistoryDocument()
    await browser.saveScreenshot('artifacts/tauri-e2e/quick-history-opened.png')
  }).timeout(180000)
})
