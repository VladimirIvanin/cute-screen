import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

describe('isolated Windows window capture', () => {
  it('cancels, retries and mounts decoded pixels hidden behind another window', async () => {
    if (process.platform !== 'win32' || process.env.CUTE_SCREEN_E2E_FAKE_CAPTURE) {
      throw new Error('Requires physical Windows capture without fake pixels')
    }
    await browser.setTimeout({ script: 45_000 })
    const artifacts = path.resolve('artifacts/tauri-e2e')
    const control = path.join(artifacts, 'window-capture-control.txt')
    const fixture = spawn('powershell.exe', [
      '-NoProfile', '-STA', '-File', path.resolve('tests/e2e/fixtures/windows-window-capture.ps1'),
      '-ControlPath', control, '-ArtifactsPath', artifacts,
      '-AppExecutable', process.env.CUTE_SCREEN_WDIO_APP_BINARY!,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    fixture.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Window fixture did not start: ${stderr}`)), 15_000)
        fixture.stdout.on('data', (data: Buffer) => {
          if (!data.toString().includes('window-capture-fixture-ready')) return
          clearTimeout(timeout)
          resolve()
        })
        fixture.on('error', reject)
        fixture.on('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`Window fixture exited ${code}: ${stderr}`))
        })
      })
      const evidence = []
      for (const mode of ['cancel', 'capture', 'keyboard', 'ru-capture']) {
        if (mode === 'ru-capture') {
          await browser.execute(async () => {
            const invoke = (window as typeof window & {
              __TAURI__: { core: { invoke(name: string, args: unknown): Promise<unknown> } }
            }).__TAURI__.core.invoke
            await invoke('settings_put', {
              correlationId: crypto.randomUUID(), key: 'cute-screen.ui-preferences.v1', schemaVersion: 1,
              valueJson: JSON.stringify({ schemaVersion: 1, locale: 'ru', theme: 'light' }),
            })
          })
        }
        await browser.execute(async () => {
          const invoke = (window as typeof window & {
            __TAURI__: { core: { invoke(name: string, args: unknown): Promise<unknown> } }
          }).__TAURI__.core.invoke
          await invoke('plugin:window|set_focus', { label: 'main' })
        })
        await writeFile(control, mode)
        const outcome = await browser.execute(async () => {
          const invoke = (window as typeof window & {
            __TAURI__: { core: { invoke<T>(name: string, args: unknown): Promise<T> } }
          }).__TAURI__.core.invoke
          return invoke<{ outcome: string }>('capture_request', { request: {
            correlationId: crypto.randomUUID(), action: 'window', delayMs: 0,
            cursor: false, invocationSource: 'ui',
          } })
        })
        expect(outcome.outcome).toBe(mode === 'cancel' ? 'cancelled' : 'captured')
        if (mode === 'cancel') continue
        await expect($('.cs-canvas:not(.cs-canvas-overlay)')).toExist()
        await expect($('button[aria-label="Copy"], button[aria-label="Копировать"]')).toBeEnabled()
        const decoded = await browser.execute(async () => {
          const invoke = (window as typeof window & {
            __TAURI__: { core: { invoke<T>(name: string, args: unknown): Promise<T> } }
          }).__TAURI__.core.invoke
          const opened = await invoke<{ imageToken: string }>('repository_open_last', { correlationId: 'window-decode' })
          const bytes = await invoke<ArrayBuffer>('read_image_bytes', { token: opened.imageToken, correlationId: 'window-decode' })
          const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
          try {
            const image = new Image()
            image.src = url
            await image.decode()
            const canvas = document.createElement('canvas')
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const context = canvas.getContext('2d')!
            context.drawImage(image, 0, 0)
            return {
              width: image.naturalWidth, height: image.naturalHeight,
              samples: [[0.15, 0.2], [0.5, 0.5], [0.65, 0.6]].map(([x, y]) =>
                [...context.getImageData(Math.floor(canvas.width * x!), Math.floor(canvas.height * y!), 1, 1).data]),
            }
          } finally {
            URL.revokeObjectURL(url)
          }
        })
        expect(decoded.width).toBeGreaterThanOrEqual(1000)
        expect(decoded.height).toBeGreaterThanOrEqual(700)
        expect(decoded.samples).toEqual(Array.from({ length: 3 }, () => [37, 71, 105, 255]))
        evidence.push({ mode, outcome, decoded })
        await browser.saveScreenshot(path.join(artifacts, `window-editor-${mode}.png`))
      }
      await writeFile(path.join(artifacts, 'window-capture-decoded.json'), JSON.stringify({
        platform: process.platform, evidence,
      }, null, 2))
    } finally {
      fixture.kill()
    }
  })
})
