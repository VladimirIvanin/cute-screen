import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

export type HarnessSnapshot = {
  readonly schemaVersion: number
  readonly crop: { readonly x: number; readonly y: number } | null
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
    readonly localBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
    readonly transform: {
      readonly translateX: number
      readonly translateY: number
    }
    readonly payload: Record<string, unknown>
  }[]
}

export async function snapshot(): Promise<HarnessSnapshot> {
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
    if (!document) throw new Error('v7 rich-text harness is not ready')
    return document
  })
}

export async function versionToken(): Promise<number> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: {
          snapshot(): HarnessSnapshot | undefined
          versionToken(): number | undefined
        }
      }
    ).__cuteScreenE2eM05
    const token = harness?.versionToken()
    if (token === undefined) throw new Error('history token is unavailable')
    return token
  })
}

export async function openHarness(): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url('/?m05=1')
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
}

export async function setEditorSelection(
  start: number,
  end = start,
): Promise<void> {
  await browser.execute(
    ({ start, end }) => {
      const editor = document.querySelector<HTMLDivElement>('[contenteditable="true"]')
      if (!editor) throw new Error('Rich-text editor is missing')
      const textNodes: Text[] = []
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
      const locate = (offset: number): { node: Text; offset: number } => {
        let consumed = 0
        for (const node of textNodes) {
          const length = node.data.length
          if (offset <= consumed + length) {
            return { node, offset: offset - consumed }
          }
          consumed += length
        }
        const node = textNodes.at(-1)
        if (!node || offset !== consumed) throw new Error(`Selection offset ${offset} is outside the editor`)
        return { node, offset: node.data.length }
      }
      const anchor = locate(start)
      const focus = locate(end)
      const range = document.createRange()
      range.setStart(anchor.node, anchor.offset)
      range.setEnd(focus.node, focus.offset)
      const selection = window.getSelection()
      if (!selection) throw new Error('DOM selection is unavailable')
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      document.dispatchEvent(new Event('selectionchange'))
    },
    { start, end },
  )
  await browser.execute(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

export async function waitForEditorFocus(): Promise<void> {
  await browser.execute(() => {
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')
    if (!editor) throw new Error('Rich-text editor is missing')
    editor.focus()
  })
  await browser.waitUntil(() =>
    browser.execute(() => document.activeElement?.getAttribute('contenteditable') === 'true'))
}

export async function setTextColor(
  label: string,
  value: string,
): Promise<void> {
  await $(`button[aria-label="${label}"]`).click()
  await $('button[aria-label="Custom colour"]').click()
  const input = $('.cs-color-hex input')
  await setNumericInput(input, value)
  await browser.keys('Enter')
}

export async function setTextFont(family: string): Promise<void> {
  await $('button[aria-label="Font family"]').click()
  const option = $(`button[role="option"][aria-label="${family}"]`)
  await browser.waitUntil(async () => option.isEnabled())
  await option.click()
}

export async function setTextAlignment(value: 'start' | 'center' | 'end'): Promise<void> {
  const label = { start: 'Align left', center: 'Align center', end: 'Align right' }[value]
  await $(`button[aria-label="${label}"]`).click()
}

export async function applyBackground(input: {
  readonly color: string
  readonly padding: number
  readonly radius: number
}): Promise<void> {
  await $('button[aria-label="Background"]').click()
  const panel = $('.cs-text-background-popover')
  await panel.$('button[aria-label="Custom colour"]').click()
  await setNumericInput(panel.$('input[aria-label="HEX colour code"]'), input.color)
  await browser.keys('Enter')
  const numbers = await panel.$$('input[role="spinbutton"]')
  if (await numbers[0]!.isEnabled()) await setNumericInput(numbers[0]!, String(input.padding))
  if (await numbers[1]!.isEnabled()) await setNumericInput(numbers[1]!, String(input.radius))
  await panel.$('button=Apply').click()
}

export async function startTextAt(
  x: number,
  y: number,
) {
  await $('button[aria-label="Text"]').click()
  await waitForStableCanvas()
  await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x, y })
  const editor = $('[contenteditable="true"][aria-label="Text editor"]')
  await expect(editor).toExist()
  return editor
}
