import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { LinuxCaptureMethods } from '../../../apps/desktop/src/generated/desktop-ipc'

type NativeWindow = Window & { __TAURI__: { core: { invoke<T>(command: string, args?: unknown): Promise<T> } } }
type QuickSnapshot = { id: string; crop: unknown; canvas: { width: number; height: number } }
type WarmupSample = { document: string | null; ready: boolean; overlay: string }
type ProbeWindow = Window & {
  __cuteScreenE2eQuick?: { snapshot(): QuickSnapshot | undefined; warmups(): WarmupSample[] }
}

async function showMain(): Promise<void> {
  await browser.tauri.switchWindow('main')
  await browser.execute(async () => {
    const native = window as unknown as NativeWindow
    await native.__TAURI__.core.invoke('plugin:window|show', { label: 'main' })
    await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'main' })
  })
}

describe('Wayland single-shot capture on a real GNOME desktop', () => {
  it('captures twice without a streaming session and resets the previous Area frame', async () => {
    expect(process.env.XDG_SESSION_TYPE).toBe('wayland')
    const methods = await browser.execute(async () => {
      const native = window as unknown as NativeWindow
      const before = await native.__TAURI__.core.invoke<LinuxCaptureMethods>('capture_methods')
      await native.__TAURI__.core.invoke('capture_set_method', { method: 'gnomeScreenshot' })
      return before
    })
    expect(methods.resolved).toBe('gnomeScreenshot')
    const evidence = []
    for (let attempt = 0; attempt < 2; attempt++) {
      await showMain()
      await expect($('button[aria-label="Capture"]')).toBeEnabled()
      await $('button[aria-label="Capture"]').click()
      await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
      await browser.tauri.switchWindow('quick-capture')
      await expect($('.cs-quick-capture.is-selecting.is-layout-ready')).toBeDisplayed()
      const initial = await browser.execute(() => {
        const state = window as typeof window & { __cuteScreenE2eQuick?: { snapshot(): QuickSnapshot } }
        const document = state.__cuteScreenE2eQuick!.snapshot()
        return { id: document.id, crop: document.crop, canvas: document.canvas }
      })
      expect(initial.crop).toBeNull()
      expect(initial.canvas.width).toBeGreaterThanOrEqual(1280)
      if (attempt === 1) {
        const warmup = await browser.execute(() => (window as unknown as ProbeWindow).__cuteScreenE2eQuick?.warmups())
        expect(warmup).toHaveLength(2)
        expect(warmup!.at(-1)!.document).toBeNull()
        expect(warmup!.at(-1)!.ready).toBe(false)
        expect(warmup!.at(-1)!.overlay).not.toBe('visible')
        await writeFile('artifacts/tauri-e2e/wayland-warmup.json', JSON.stringify(warmup, null, 2))
      }
      await browser.saveScreenshot(`artifacts/tauri-e2e/wayland-area-${attempt + 1}-initial.png`)
      // The embedded driver cannot drag a pointer into a native Wayland surface.
      // Use production DOM handlers; this is not evidence for OS pointer injection.
      await browser.execute(() => {
        const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
        const rect = scene.getBoundingClientRect()
        const capture = scene.setPointerCapture
        scene.setPointerCapture = () => undefined
        try {
          const start = { clientX: rect.left + rect.width * 0.15, clientY: rect.top + rect.height * 0.2 }
          const end = { clientX: rect.left + rect.width * 0.6, clientY: rect.top + rect.height * 0.65 }
          const common = { pointerId: 17, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true }
          scene.dispatchEvent(new PointerEvent('pointerdown', { ...common, ...start, buttons: 1 }))
          scene.dispatchEvent(new PointerEvent('pointermove', { ...common, ...end, buttons: 1 }))
          scene.dispatchEvent(new PointerEvent('pointerup', { ...common, ...end, buttons: 0 }))
        } finally {
          scene.setPointerCapture = capture
        }
      })
      await expect($('.cs-quick-actions')).toBeDisplayed()
      await browser.saveScreenshot(`artifacts/tauri-e2e/wayland-area-${attempt + 1}-selected.png`)
      evidence.push(initial)
      if (attempt === 0) {
        await $('button[aria-label="Save to history and close"]').click()
      } else {
        await $('button[aria-label="Close"]').click()
      }
      await browser.waitUntil(async () => browser.execute(async () => {
        const native = window as unknown as { __TAURI__: { core: { invoke(command: string): Promise<unknown> } } }
        return (await native.__TAURI__.core.invoke('quick_capture_get_active')) === null
      }))
    }
    expect(evidence[0]!.id).not.toBe(evidence[1]!.id)
    await showMain()
    const decoded = await browser.execute(async () => {
      const native = window as unknown as NativeWindow
      const history = await native.__TAURI__.core.invoke<{ page: { items: Array<{ captureId: string }> } }>(
        'history_command', { request: { kind: 'list', cursor: null } },
      )
      const opened = await native.__TAURI__.core.invoke<{ document: { imageToken: string } }>(
        'history_command', { request: { kind: 'open', captureId: history.page.items[0]!.captureId } },
      )
      const record = opened.document
      const bytes = await native.__TAURI__.core.invoke<ArrayBuffer>('read_image_bytes', {
        token: record.imageToken, correlationId: 'wayland-decode',
      })
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const result = {
        width: image.width,
        height: image.height,
        opaque: pixels.every((value, index) => index % 4 !== 3 || value === 255),
      }
      image.close()
      return result
    })
    expect(decoded.width).toBeGreaterThan(0)
    expect(decoded.height).toBeGreaterThan(0)
    expect(decoded.opaque).toBe(true)
    await writeFile('artifacts/tauri-e2e/wayland-single-shot.json', JSON.stringify({ methods, evidence, decoded }, null, 2))
  })
})
