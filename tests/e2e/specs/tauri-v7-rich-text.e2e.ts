import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { setNumericInput } from '../numeric-input'

type HarnessSnapshot = {
  readonly schemaVersion: number
  readonly layers: readonly {
    readonly kind: string
    readonly payload: Record<string, unknown>
  }[]
}

async function snapshot(): Promise<HarnessSnapshot> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: {
          snapshot(): HarnessSnapshot | undefined
          versionToken(): number | undefined
        }
      }
    ).__cuteScreenE2eM05
    const document = harness?.snapshot()
    if (!document) throw new Error('WebView2 v7 harness is not ready')
    return document
  })
}

async function token(): Promise<number> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: {
          snapshot(): HarnessSnapshot | undefined
          versionToken(): number | undefined
        }
      }
    ).__cuteScreenE2eM05
    const value = harness?.versionToken()
    if (value === undefined) throw new Error('WebView2 history token is missing')
    return value
  })
}

describe('Document v7 rich text in a real Tauri webview', () => {
  it('mounts the compact toolbar and commits one portable edit command', async () => {
    await browser.setWindowSize(1024, 700)
    await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
    expect((await snapshot()).schemaVersion).toBe(7)
    expect(await token()).toBe(0)

    const textTool = $('button[aria-label="Text"]')
    await textTool.click()
    await expect($('.cs-text-toolbar')).toHaveAttribute('aria-label', 'Text')
    await expect($('.cs-text-toolbar')).toExist()
    const layout = await browser.execute(() => {
      const toolbar = document.querySelector<HTMLElement>('.cs-text-toolbar')
      if (!toolbar) throw new Error('Text toolbar is missing')
      return {
        scrolls: toolbar.scrollWidth > toolbar.clientWidth,
        documentScrolls: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    expect(layout).toEqual({ scrolls: false, documentScrolls: false })

    const point = await browser.execute(() => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { x: Math.round(rect.left + 36), y: Math.round(rect.top + 36) }
    })
    await browser.action('pointer').move({ origin: 'viewport', ...point })
      .down({ button: 'left' }).up({ button: 'left' }).perform()
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Привет WebView2')
    await browser.keys(['Control', 'a'])
    await $('button[aria-label="Bold"]').click()
    await browser.waitUntil(() =>
      browser.execute(() => document.activeElement?.getAttribute('contenteditable') === 'true'))
    await $('button[aria-label="Font family"]').click()
    await browser.waitUntil(async () => $('button[role="option"][aria-label="Lora"]').isEnabled())
    await expect($$('button[role="option"]')).toBeElementsArrayOfSize(20)
    await $('button[role="option"][aria-label="Lora"]').click()
    const openBackground = async () => $('button[aria-label="Background"]').click()
    await openBackground()
    const backgroundDialog = $('.cs-text-background-popover')
    await backgroundDialog.$('button[aria-label="Blue"]').click()
    await browser.waitUntil(() => browser.execute(() =>
      getComputedStyle(document.querySelector('.cs-text-editor')!).getPropertyValue('--text-background-color') === 'rgba(61, 173, 255, 1)'))
    expect(await token()).toBe(0)
    await backgroundDialog.$('button[aria-label="Custom colour"]').click()
    const paletteLayout = await browser.execute(() => {
      const dialog = document.querySelector<HTMLElement>('.cs-text-background-popover')
      const palette = dialog?.querySelector<HTMLElement>('.cs-color-popover')
      if (!dialog || !palette) throw new Error('Embedded colour palette is unavailable')
      const parent = dialog.getBoundingClientRect()
      const child = palette.getBoundingClientRect()
      const controls = [...palette.querySelectorAll<HTMLElement>('button, input')].map((element) => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      })
      return {
        child: { left: child.left, right: child.right },
        controls,
        parent: { left: parent.left, right: parent.right },
        scrolls: dialog.scrollWidth > dialog.clientWidth || palette.scrollWidth > palette.clientWidth,
      }
    })
    expect(paletteLayout.scrolls).toBe(false)
    expect(paletteLayout.child.left).toBeGreaterThanOrEqual(paletteLayout.parent.left)
    expect(paletteLayout.child.right).toBeLessThanOrEqual(paletteLayout.parent.right)
    expect(paletteLayout.controls.every((control) =>
      control.left >= paletteLayout.parent.left && control.right <= paletteLayout.parent.right)).toBe(true)
    const hex = backgroundDialog.$('input[aria-label="HEX colour code"]')
    await hex.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('#ff7556')
    await browser.keys('Enter')
    await browser.waitUntil(() => browser.execute(() =>
      getComputedStyle(document.querySelector('.cs-text-editor')!).getPropertyValue('--text-background-color') === 'rgba(255, 117, 86, 1)'))
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/text-background-palette-preview.png'))
    await setNumericInput($('.cs-text-background-popover input[aria-label="Padding"]'), '12')
    await setNumericInput($('.cs-text-background-popover input[aria-label="Radius"]'), '8')
    await browser.waitUntil(() => browser.execute(() => {
      const editor = document.querySelector('.cs-text-editor')!
      const background = getComputedStyle(editor, '::before')
      const scale = Number(document.querySelector('.cs-zoom-controls')?.getAttribute('data-zoom') ?? 100) / 100
      return Math.abs(Number.parseFloat(background.left) + 12 * scale) < 0.02 &&
        Math.abs(Number.parseFloat(background.borderRadius) - 8 * scale) < 0.02
    }))
    expect(await token()).toBe(0)
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/numeric-text-background-preview.png'))
    await $('.cs-text-background-popover').$('button=Cancel').click()
    await browser.waitUntil(() => browser.execute(() =>
      getComputedStyle(document.querySelector('.cs-text-editor')!, '::before').backgroundColor === 'rgba(0, 0, 0, 0)'))
    await openBackground()
    await expect($('.cs-text-background-popover input[aria-label="Padding"]')).toHaveValue('0')
    await setNumericInput($('.cs-text-background-popover input[aria-label="Padding"]'), '12')
    await setNumericInput($('.cs-text-background-popover input[aria-label="Radius"]'), '8')
    await $('.cs-text-background-popover').$('button=Apply').click()
    expect(await token()).toBe(0)
    await editor.click()
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect(await token()).toBe(1)
    const layer = (await snapshot()).layers.at(-1)
    expect(layer).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Привет WebView2' }, background: { padding: 12, radius: 8 } },
    })
    const spans = (layer?.payload.content as { spans: { fontFamily: string }[] }).spans
    expect(spans.every((span) => span.fontFamily === 'Lora')).toBe(true)
    expect(layer).not.toHaveProperty('opacity')
    expect(layer).not.toHaveProperty('blendMode')
    expect(layer).not.toHaveProperty('shadows')
    await expect(textTool).toHaveAttribute('aria-pressed', 'false')
  })
})
