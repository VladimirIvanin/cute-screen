import { $, browser, expect } from '@wdio/globals'

export type HarnessSnapshot = {
  readonly schemaVersion: number
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
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
      const editor = document.querySelector<HTMLDivElement>(
        '[contenteditable="true"]',
      )
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
        if (!node || offset !== consumed)
          throw new Error(`Selection offset ${offset} is outside the editor`)
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
}

export async function waitForEditorFocus(): Promise<void> {
  await browser.execute(() => {
    const editor = document.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )
    if (!editor) throw new Error('Rich-text editor is missing')
    editor.focus()
  })
  await browser.waitUntil(() =>
    browser.execute(
      () => document.activeElement?.getAttribute('contenteditable') === 'true',
    ),
  )
}

export async function setNativeColor(
  label: string,
  value: string,
): Promise<void> {
  await browser.execute(
    ({ label, value }) => {
      const input = [
        ...document.querySelectorAll<HTMLInputElement>('input[type="color"]'),
      ].find((candidate) => candidate.getAttribute('aria-label') === label)
      if (!input) throw new Error(`Missing colour input: ${label}`)
      input.value = value
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { label, value },
  )
}

export async function setNativeSelect(
  label: string,
  value: string,
): Promise<void> {
  await browser.execute(
    ({ label, value }) => {
      const select = [
        ...document.querySelectorAll<HTMLSelectElement>('select'),
      ].find((candidate) => candidate.getAttribute('aria-label') === label)
      if (!select) throw new Error(`Missing select: ${label}`)
      select.focus()
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { label, value },
  )
}

export async function applyBackground(input: {
  readonly color: string
  readonly padding: number
  readonly radius: number
}): Promise<void> {
  await $('button[aria-label="Background"]').click()
  await browser.execute((draft) => {
    const root = document.querySelector<HTMLElement>(
      '.cs-text-background-popover',
    )
    const color = root?.querySelector<HTMLInputElement>('input[type="color"]')
    const numbers = root?.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    )
    if (!root || !color || !numbers || numbers.length !== 2)
      throw new Error('Text background controls are missing')
    color.value = draft.color
    color.dispatchEvent(new Event('input', { bubbles: true }))
    numbers[0]!.value = String(draft.padding)
    numbers[0]!.dispatchEvent(new Event('input', { bubbles: true }))
    numbers[1]!.value = String(draft.radius)
    numbers[1]!.dispatchEvent(new Event('input', { bubbles: true }))
  }, input)
  await $('.cs-text-background-popover').$('button=Apply').click()
}

export async function startTextAt(x: number, y: number) {
  await $('button[aria-label="Text"]').click()
  await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x, y })
  const editor = $('[contenteditable="true"][aria-label="Text editor"]')
  await expect(editor).toExist()
  return editor
}
