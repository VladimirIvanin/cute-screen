import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import {
  historySoak,
  waitForHistoryDocument,
} from '../history-soak'
import { rulerDocument } from '../ruler-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

async function capture(): Promise<void> {
  await $('button[aria-label="Capture"]').click()
  // Selecting a prewarmed WebDriver window maps it. Observe the production
  // presentation first, otherwise the test can click Editor before 4K decode.
  await browser.waitUntil(() => browser.execute(async () => {
    const state = window as typeof window & {
      __TAURI__: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } }
    }
    return state.__TAURI__.core.invoke<boolean>('plugin:window|is_visible', { label: 'quick-capture' })
  }), { timeout: 45000 })
  await browser.tauri.switchWindow('quick-capture')
  await browser.waitUntil(() => browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eQuick?: { snapshot(): unknown } }
    return Boolean(state.__cuteScreenE2eQuick?.snapshot())
  }), { timeout: 45000, timeoutMsg: 'Quick Capture did not decode the production 4K frame' })
  await waitForStableCanvas()
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
  await $('.cs-quick-actions button:first-child').click()
  await browser.waitUntil(() => browser.execute(async () => !(await window.__cuteScreenE2eWindow?.isVisible())), {
    timeout: 60000, timeoutMsg: 'Production Editor handoff did not hide Quick Capture',
  })
  await browser.tauri.switchWindow('main')
  await waitForHistoryDocument()
  await waitForStableCanvas()
}

describe('history through production capture and real storage', () => {
  it('switches editable captures, creates native thumbnails and persists the selected older capture', async function () {
    this.timeout(300000)
    await browser.setWindowSize(1280, 900)
    await capture()
    const first = await rulerDocument()
    expect([first.source.width, first.source.height]).toEqual([3840, 2160])
    await $('button[aria-label="Numbered marker"]').click()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    if (process.platform === 'linux') {
      const execute = promisify(execFile)
      const focused = (await execute('xdotool', ['getactivewindow'])).stdout.trim()
      const point = await browser.execute(() => {
        const scene = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
        const view = document.querySelector('.cs-viewport')!.getBoundingClientRect()
        const x = Math.round(Math.max(scene.left, view.left) + 60)
        const y = Math.round(Math.max(scene.top, view.top) + 60)
        return { x, y }
      })
      await execute('xdotool', ['mousemove', '--sync', '--window', focused, String(point.x), String(point.y), 'click', '1'])
    } else await scene.click({ x: 40, y: 40 })
    await browser.waitUntil(async () => (await rulerDocument()).layers.some((layer) => layer.kind === 'numberedMarker'))
    await $('button[aria-label="Crop"]').click()
    await $('[role="combobox"][aria-label="Preset"]').click()
    await browser.waitUntil(() => browser.execute(() => [...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.trim() === '1:1')))
    await browser.execute(() => {
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.trim() === '1:1')
      if (!option) throw new Error('Missing square crop preset')
      option.click()
    })
    await $('button=Apply').click()
    await browser.waitUntil(async () => (await rulerDocument()).crop?.width === 2160)
    await $('.cs-zoom-value').click()
    await $('.cs-zoom-controls [aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '110')
    await browser.execute(() => {
      const viewport = document.querySelector<HTMLElement>('.cs-viewport')!
      viewport.scrollLeft = 93
      viewport.scrollTop = 71
    })
    const scrollBefore = await browser.execute(() => {
      const viewport = document.querySelector('.cs-viewport')!
      return { x: viewport.scrollLeft, y: viewport.scrollTop }
    })
    await capture()
    const second = await rulerDocument()
    expect(second.id).not.toBe(first.id)
    await $('.cs-history-trigger').click()
    await expect($('.cs-history-popover')).toBeDisplayed()
    await browser.waitUntil(async () => await browser.$$('.cs-history-capture img').length >= 2, {
      timeout: 30000, timeoutMsg: 'Saved-result thumbnails did not pass binary native transport',
    })
    const cards = await browser.$$('.cs-history-capture')
    expect(cards.length).toBe(2)
    await cards[1]!.click()
    await browser.waitUntil(async () => (await rulerDocument()).id === first.id)
    expect((await rulerDocument()).layers.some((layer) => layer.kind === 'numberedMarker')).toBe(true)
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '110')
    expect((await rulerDocument()).crop).toMatchObject({ width: 2160, height: 2160 })
    expect(await browser.execute(() => {
      const viewport = document.querySelector('.cs-viewport')!
      return { x: viewport.scrollLeft, y: viewport.scrollTop }
    })).toEqual(scrollBefore)
    await $('.cs-history-trigger').click()
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/history-native.png'))
    const older = $('.cs-history-capture[aria-current="true"]')
    await expect(older).toBeDisplayed()
    await $('[data-history-index="1"] ~ .cs-history-protect').click()
    if (process.platform === 'linux') await promisify(execFile)('xdotool', ['key', '--clearmodifiers', 'Escape'])
    else await browser.keys('Escape')
    await browser.waitUntil(() => browser.execute(() => document.activeElement === document.querySelector('.cs-history-trigger')), {
      timeoutMsg: 'Native Escape did not restore focus to the history trigger',
    })
    await historySoak([second.id, first.id])
  })
})
