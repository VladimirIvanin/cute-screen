import { $, browser, expect } from '@wdio/globals'
import {
  snapshot,
  versionToken,
  openHarness,
  setEditorSelection,
  waitForEditorFocus,
  setNativeColor,
  setNativeSelect,
  applyBackground,
  startTextAt,
} from './browser-v7-rich-text-test-kit'

describe('Document v7 rich text in browser mode', () => {
  it('applies range/caret formatting without clobber and commits one command', async () => {
    await browser.setWindowSize(1280, 720)
    await openHarness()
    expect(await versionToken()).toBe(0)
    const editor = await startTextAt(18, 18)
    await editor.addValue('Alpha Beta')

    await setEditorSelection(0, 5)
    await $('button[aria-label="Bold"]').click()
    await waitForEditorFocus()
    await setNativeColor('Text color', '#336699')
    await waitForEditorFocus()

    await setEditorSelection(6, 10)
    await $('button[aria-label="Italic"]').click()
    await waitForEditorFocus()

    await setEditorSelection(0, 10)
    await expect($('button[aria-label="Bold: mixed"]')).toHaveAttribute(
      'aria-pressed',
      'mixed',
    )
    await expect($('button[aria-label="Italic: mixed"]')).toHaveAttribute(
      'aria-pressed',
      'mixed',
    )
    await setNativeSelect('Font family', 'Georgia')
    await waitForEditorFocus()
    await $('button[data-text-control="size"]').click()
    await $('.cs-text-size-popover').$('button=32').click()
    await waitForEditorFocus()
    await $('button[data-text-control="size"]').click()
    const sizePopover = $('.cs-text-size-popover')
    const sizeInput = sizePopover.$('input[type="number"]')
    const applySize = sizePopover.$('button=Apply')
    await sizeInput.setValue('257')
    await expect(applySize).toBeDisabled()
    await sizeInput.setValue('37')
    await expect(applySize).toBeEnabled()
    await applySize.click()
    await waitForEditorFocus()
    await setNativeSelect('Text alignment', 'center')
    await waitForEditorFocus()
    await applyBackground({ color: '#fff2a8', padding: 6, radius: 4 })
    await waitForEditorFocus()

    await setEditorSelection(10)
    await $('button[aria-label="Strikethrough"]').click()
    await waitForEditorFocus()
    await browser.keys('!')
    expect(await versionToken()).toBe(0)
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect(await versionToken()).toBe(1)

    const layer = (await snapshot()).layers.at(-1)
    expect(layer?.kind).toBe('text')
    const content = layer?.payload.content as {
      readonly text: string
      readonly spans: readonly {
        readonly start: number
        readonly end: number
        readonly fontFamily: string
        readonly fontSize: number
        readonly color: { readonly red: number; readonly green: number }
        readonly weight: number
        readonly italic: boolean
        readonly strikethrough: boolean
      }[]
      readonly paragraphs: readonly {
        readonly alignment: string
        readonly listKind: string
      }[]
    }
    expect(content.text).toBe('Alpha Beta!')
    expect(content.spans.every((span) => span.fontFamily === 'Georgia')).toBe(
      true,
    )
    expect(content.spans.every((span) => span.fontSize === 37)).toBe(true)
    expect(
      content.spans.some(
        (span) =>
          span.start === 0 &&
          span.end >= 5 &&
          span.weight === 700 &&
          Math.abs(span.color.red - 0.2) < 0.0001 &&
          Math.abs(span.color.green - 0.4) < 0.0001,
      ),
    ).toBe(true)
    expect(
      content.spans.some(
        (span) => span.start <= 6 && span.end >= 10 && span.italic,
      ),
    ).toBe(true)
    expect(
      content.spans.some((span) => span.end === 11 && span.strikethrough),
    ).toBe(true)
    expect(content.paragraphs).toEqual([
      expect.objectContaining({ alignment: 'center', listKind: 'none' }),
    ])
    expect(layer?.payload.background).toMatchObject({
      padding: 6,
      radius: 4,
    })
    expect(layer).not.toHaveProperty('opacity')
    expect(layer).not.toHaveProperty('blendMode')
    expect(layer).not.toHaveProperty('shadows')
    expect((await snapshot()).schemaVersion).toBe(7)
  })

  it('handles bullet keys, IME, plain-text paste and Escape rollback in a real DOM', async () => {
    await browser.setWindowSize(1280, 720)
    await openHarness()
    const editor = await startTextAt(24, 24)
    await editor.addValue('Item')
    await setEditorSelection(0, 4)
    await $('button[aria-label="Bullet list"]').click()
    await waitForEditorFocus()
    await setEditorSelection(4)
    await browser.keys('Enter')
    let lists = await browser.execute(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[contenteditable="true"] [data-rich-text-paragraph]',
        ),
      ].map((paragraph) => paragraph.dataset.listKind),
    )
    expect(lists).toEqual(['bullet', 'bullet'])
    await browser.keys('Enter')
    lists = await browser.execute(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[contenteditable="true"] [data-rich-text-paragraph]',
        ),
      ].map((paragraph) => paragraph.dataset.listKind),
    )
    expect(lists).toEqual(['bullet', 'none'])
    await browser.keys('Backspace')
    lists = await browser.execute(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[contenteditable="true"] [data-rich-text-paragraph]',
        ),
      ].map((paragraph) => paragraph.dataset.listKind),
    )
    expect(lists).toEqual(['bullet'])

    await setEditorSelection(0, 4)
    await browser.execute(() => {
      const editor = document.querySelector<HTMLDivElement>(
        '[contenteditable="true"]',
      )
      if (!editor) throw new Error('Rich-text editor is missing')
      const data = new DataTransfer()
      data.setData('text/plain', '<plain>')
      data.setData('text/html', '<b>HTML must not survive</b>')
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      )
    })
    await setEditorSelection(7)
    await browser.execute(() => {
      const editor = document.querySelector<HTMLDivElement>(
        '[contenteditable="true"]',
      )
      const text = editor?.querySelector<HTMLElement>(
        '[data-rich-text-span]',
      )?.firstChild
      if (!editor || !(text instanceof Text))
        throw new Error('Rich-text projection is missing')
      editor.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
      )
      text.data += 'Ж'
      const selection = window.getSelection()
      const range = document.createRange()
      range.setStart(text, text.data.length)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: 'Ж',
          isComposing: true,
        }),
      )
      editor.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: 'Ж' }),
      )
    })
    expect(await versionToken()).toBe(0)
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect(await versionToken()).toBe(1)
    const committed = (await snapshot()).layers.at(-1)
    expect((committed?.payload.content as { readonly text: string }).text).toBe(
      '<plain>Ж',
    )
    expect(JSON.stringify(committed)).not.toContain('HTML must not survive')

    const beforeRollback = JSON.stringify(committed)
    await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x: 24, y: 24 })
    const reopened = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(reopened).toExist()
    await reopened.addValue(' changed')
    await browser.keys('Escape')
    await expect($('[contenteditable="true"]')).not.toExist()
    expect(await versionToken()).toBe(1)
    expect(JSON.stringify((await snapshot()).layers.at(-1))).toBe(
      beforeRollback,
    )
  })
})
