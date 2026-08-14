import { $, browser, expect } from '@wdio/globals'

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
    if (value === undefined)
      throw new Error('WebView2 history token is missing')
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
        documentScrolls:
          document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    expect(layout).toEqual({ scrolls: false, documentScrolls: false })

    await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x: 18, y: 18 })
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Привет WebView2')
    await $('button[aria-label="Bold"]').click()
    await browser.waitUntil(() =>
      browser.execute(
        () =>
          document.activeElement?.getAttribute('contenteditable') === 'true',
      ),
    )
    expect(await token()).toBe(0)
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect(await token()).toBe(1)
    const layer = (await snapshot()).layers.at(-1)
    expect(layer).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Привет WebView2' } },
    })
    expect(layer).not.toHaveProperty('opacity')
    expect(layer).not.toHaveProperty('blendMode')
    expect(layer).not.toHaveProperty('shadows')
    await expect(textTool).toHaveAttribute('aria-pressed', 'true')
  })
})
