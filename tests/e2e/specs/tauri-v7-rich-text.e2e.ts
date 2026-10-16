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

    await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x: 18, y: 18 })
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Привет WebView2')
    await $('button[aria-label="Bold"]').click()
    await browser.waitUntil(() =>
      browser.execute(() => document.activeElement?.getAttribute('contenteditable') === 'true'))
    const openBackground = async () => {
      const trigger = $('button[aria-label="Background"]')
      if (await trigger.isDisplayed()) await trigger.click()
      else {
        await $('button[aria-label="More text settings"]').click()
        await $('.cs-text-overflow-popover').$('button=Background').click()
      }
    }
    await openBackground()
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
    expect(layer).not.toHaveProperty('opacity')
    expect(layer).not.toHaveProperty('blendMode')
    expect(layer).not.toHaveProperty('shadows')
    await expect(textTool).toHaveAttribute('aria-pressed', 'false')
  })
})
