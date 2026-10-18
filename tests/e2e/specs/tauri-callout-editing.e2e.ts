import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { exerciseCalloutEditing } from '../callout-editing'
import { selectionDocument } from '../selection-interactions'
import { waitForStableCanvas } from '../canvas-ready'
import { writeFile } from 'node:fs/promises'

describe('callout through production capture and native persistence', () => {
  it('edits a callout in Quick and keeps it after the Editor handoff', async () => {
    await browser.setWindowSize(1440, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } }
      }
      await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'quick-capture' })
    })
    await browser.execute(() => {
      const state = window as typeof window & { __calloutCropInput?: unknown[] }
      state.__calloutCropInput = []
      for (const type of ['pointerdown', 'pointerup']) document.addEventListener(type, (event) => {
        const pointer = event as PointerEvent
        state.__calloutCropInput!.push({ type, x: pointer.clientX, y: pointer.clientY,
          trusted: event.isTrusted, target: (event.target as Element)?.className })
      }, true)
    })
    const canvas = $('.cs-canvas:not(.cs-canvas-overlay)')
    const size = await canvas.getSize()
    const origin = await canvas.getLocation()
    await browser.action('pointer')
      // The west handle stays clear of the native window's top resize border.
      .move({ origin: 'viewport', x: Math.round(origin.x + 1), y: Math.round(origin.y + size.height / 2) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(size.width * .12),
        y: 0, duration: 200 })
      .up({ button: 'left' }).perform()
    await writeFile('artifacts/tauri-e2e/callout-crop-input.json', JSON.stringify(await browser.execute(() =>
      (window as typeof window & { __calloutCropInput?: unknown[] }).__calloutCropInput), null, 2))
    await browser.waitUntil(async () => ((await selectionDocument()).crop?.x ?? 0) > 0)
    expect((await selectionDocument()).crop?.x).toBeGreaterThan(0)
    await exerciseCalloutEditing('artifacts/tauri-e2e', true)
    await expect($('.cs-callout-toolbar')).toBeDisplayed()
    const compact = await browser.execute(() => {
      const toolbar = document.querySelector<HTMLElement>('.cs-callout-toolbar')!
      const bounds = toolbar.getBoundingClientRect()
      const buttons = [...toolbar.querySelectorAll('button')].map((button) => button.getBoundingClientRect())
      return bounds.width < 420 && buttons.length === 5 &&
        buttons.every((button) => Math.abs(button.top - buttons[0]!.top) < 1)
    })
    expect(compact).toBe(true)
    await browser.saveScreenshot('artifacts/tauri-e2e/callout-compact-quick.png')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await browser.waitUntil(async () => (await selectionDocument()).layers.some((layer) => layer.kind === 'callout'))
    const callout = (await selectionDocument()).layers.find((layer) => layer.kind === 'callout')!
    expect(callout.payload).toMatchObject({ targetMarker: 'ring', labelMarker: 'none', frame: { kind: 'card' }, route: { path: 'orthogonal' } })
    await browser.saveScreenshot('artifacts/tauri-e2e/callout-editor-handoff.png')
  }).timeout(300_000)
})
