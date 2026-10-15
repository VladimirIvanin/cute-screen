import {
  execFile,
  spawn,
} from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

const executeFile = promisify(execFile)

describe('Windows physical capture excludes the editor', () => {
  it('reads the uncovered desktop without editor pixels after hide, cancel and retry', async () => {
    if (process.platform !== 'win32') throw new Error('Requires an interactive Windows desktop')
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable) throw new Error('Missing test-harness binary')
    if (process.env.CUTE_SCREEN_E2E_FAKE_CAPTURE) throw new Error('Physical capture cannot use fake pixels')
    const background = spawn('powershell.exe', [
      '-NoProfile', '-STA', '-File', path.resolve('tests/e2e/fixtures/windows-capture-background.ps1'),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const evidence = []
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Desktop fixture did not start')), 10_000)
        background.stdout.on('data', (data: Buffer) => {
          if (!data.toString().includes('capture-background-ready')) return
          clearTimeout(timeout)
          resolve()
        })
        background.on('error', reject)
        background.on('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`Desktop fixture exited: ${code}`))
        })
      })
      await browser.setWindowSize(1024, 700)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await executeFile(executable, ['show'])
        await browser.tauri.switchWindow('main')
        await expect($('button[aria-label="Capture"]')).toBeEnabled()
        const samples = await browser.execute(() => {
          const marker = document.createElement('div')
          marker.id = 'capture-exclusion-marker'
          marker.style.cssText = 'position:fixed;left:120px;top:160px;width:600px;height:300px;background:#fa16cc;z-index:9999'
          document.getElementById(marker.id)?.remove()
          document.body.append(marker)
          const top = window.screenY + window.outerHeight - window.innerHeight
          return [200, 350, 600].flatMap((x) => [200, 300, 400].map((y) => ({ x: window.screenX + x, y: top + y })))
        })
        await browser.saveScreenshot(path.resolve(`artifacts/tauri-e2e/windows-capture-before-${attempt}.png`))
        await $('button[aria-label="Capture"]').click()
        await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
        await browser.tauri.switchWindow('quick-capture')
        await expect($('.cs-quick-capture')).toHaveAttribute('class', expect.stringContaining('is-selecting'))
        await expect($('.cs-quick-capture')).toHaveAttribute('class', expect.stringContaining('is-layout-ready'))
        await browser.waitUntil(() => browser.execute(() => !!document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')))
        const pixels = await browser.execute((points) => {
          const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
          const context = canvas?.getContext('2d')
          if (!canvas || !context) throw new Error('Missing production scene canvas')
          const rect = canvas.getBoundingClientRect()
          return points.map((point) => {
            const x = Math.floor((point.x - window.screenX - rect.left) * canvas.width / rect.width)
            const y = Math.floor((point.y - window.screenY - rect.top) * canvas.height / rect.height)
            return [...context.getImageData(x, y, 1, 1).data]
          })
        }, samples)
        evidence.push({ attempt, samples, pixels })
        await writeFile(path.resolve('artifacts/tauri-e2e/windows-capture-exclusion-pixels.json'), JSON.stringify(evidence, null, 2))
        await browser.saveScreenshot(path.resolve(`artifacts/tauri-e2e/windows-capture-after-${attempt}.png`))
        for (const pixel of pixels) expect(pixel).toEqual([37, 71, 105, 255])
        await $('.cs-canvas-overlay').click()
        await browser.keys('Escape')
        await expect($('.cs-quick-capture.is-layout-ready')).not.toExist()
        await browser.tauri.switchWindow('main')
        await expect($('button[aria-label="Capture"]')).toBeEnabled()
        await browser.execute(() => document.getElementById('capture-exclusion-marker')?.remove())
      }
    } finally {
      background.kill()
    }
  })
})
