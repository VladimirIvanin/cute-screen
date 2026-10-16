import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  configureArrowWithPointer,
  verifyToolLifecycle,
} from '../tool-lifecycle'
import { waitForStableCanvas } from '../canvas-ready'

const output = path.resolve('artifacts/tool-lifecycle')
const executeFile = promisify(execFile)

async function configureArrowWithSystemPointer(): Promise<void> {
  if (process.env.CUTE_SCREEN_E2E_CONTEXT_INPUT !== 'x11') {
    await configureArrowWithPointer()
    return
  }
  const point = await browser.execute(() => {
    const rect = document.querySelector('button[aria-label="Arrow"]')!.getBoundingClientRect()
    return {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    }
  })
  await browser.execute(async () => {
    const state = window as typeof window & {
      __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<void> } }
    }
    await state.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'main' })
  })
  await $('button[aria-label="Arrow"]').click()
  await browser.waitUntil(() => browser.execute(() => document.hasFocus()))
  const { stdout } = await executeFile('xdotool', ['getactivewindow'], { timeout: 5000 })
  await executeFile('xdotool', [
    'mousemove',
    '--window',
    stdout.trim(),
    String(point.x),
    String(point.y),
    'click',
    '3',
  ], { timeout: 5000 })
}
async function keyboardConfigure(surface: string): Promise<void> {
  const arrow = $('button[aria-label="Arrow"]')
  await arrow.waitForEnabled()
  await browser.waitUntil(() => browser.execute(() => document.hasFocus()), {
    timeoutMsg: `${surface} WebView did not receive native focus`,
  })
  await arrow.click()
  await expect(arrow).toHaveAttribute('aria-pressed', 'true')
  await arrow.click()
  await expect(arrow).toBeFocused()
  await browser.execute(() => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F10' && event.shiftKey) {
        document.documentElement.dataset.lifecycleKeyTrusted = String(event.isTrusted)
      }
    }, { capture: true })
  })
  await browser.keys([Key.Shift, Key.F10])
  const settings = surface === 'quick' ? '.cs-tool-configure-popover-host' : '.cs-tool-defaults-toolbar'
  await expect($(settings)).toBeDisplayed()
  expect(await $('html').getAttribute('data-lifecycle-key-trusted')).toBe('true')
  if (surface === 'quick') {
    await browser.keys('Escape')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await expect(arrow).toBeFocused()
  } else {
    expect(await browser.execute(() =>
      Boolean(document.activeElement?.closest('.cs-tool-defaults-toolbar')))).toBe(true)
    await arrow.click()
  }
  await browser.keys([Key.Shift, Key.F10])
  await expect($(settings)).toBeDisplayed()
  await browser.keys('p')
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
  await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-tool-defaults-toolbar')).toExist()
  await browser.saveScreenshot(path.join(output, `native-${surface}-keyboard.png`))
}
describe('tool lifecycle through production Capture → Quick → Editor', () => {
  afterEach(async () => {
    const input = await browser.execute(() => ({
      events: JSON.parse(document.documentElement.dataset.lifecycleEvents ?? '[]') as unknown,
      focus: document.hasFocus(),
      visibility: document.visibilityState,
      tools: [...document.querySelectorAll('.cs-toolrail button')].map((button) => ({
        label: button.getAttribute('aria-label'),
        pressed: button.getAttribute('aria-pressed'),
        disabled: button.hasAttribute('disabled'),
      })),
    }))
    await writeFile(path.join(output, 'native-input.json'), JSON.stringify(input, null, 2))
  })
  it('uses the keyboard configure and transition contract in both real WebViews', async function () {
    this.timeout(120000)
    await mkdir(output, { recursive: true })
    await browser.setWindowSize(1280, 800)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await keyboardConfigure('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await keyboardConfigure('editor')
  })
  it('creates and dismisses a selection with native context-menu and pointer input', async () => {
    await browser.execute(() => {
      const events: unknown[] = []
      for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'contextmenu']) {
        document.addEventListener(type, (event) => {
          const mouse = event as MouseEvent
          events.push({
            type,
            button: mouse.button,
            trusted: event.isTrusted,
            target: (event.target as Element)?.closest('button')?.getAttribute('aria-label'),
          })
          document.documentElement.dataset.lifecycleEvents = JSON.stringify(events)
        }, { capture: true })
      }
      document.addEventListener('contextmenu', (event) => {
        document.documentElement.dataset.lifecycleContextTrusted = String(event.isTrusted)
      }, { once: true, capture: true })
      document.addEventListener('pointerdown', (event) => {
        if (event.target instanceof HTMLCanvasElement) {
          document.documentElement.dataset.lifecyclePointerTrusted = String(event.isTrusted)
        }
      }, { capture: true })
    })
    await verifyToolLifecycle(output, 'native-editor', configureArrowWithSystemPointer)
    expect(await $('html').getAttribute('data-lifecycle-context-trusted')).toBe('true')
    expect(await $('html').getAttribute('data-lifecycle-pointer-trusted')).toBe('true')
  })
})
