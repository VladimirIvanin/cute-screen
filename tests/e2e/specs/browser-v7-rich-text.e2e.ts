import { $, $$, browser, expect } from '@wdio/globals'

type HarnessSnapshot = {
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
    if (!document) throw new Error('v7 rich-text harness is not ready')
    return document
  })
}

async function versionToken(): Promise<number> {
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

async function openHarness(): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url('/?m05=1')
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
}

async function setEditorSelection(start: number, end = start): Promise<void> {
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

async function waitForEditorFocus(): Promise<void> {
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

async function setNativeColor(label: string, value: string): Promise<void> {
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

async function setNativeSelect(label: string, value: string): Promise<void> {
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

async function applyBackground(input: {
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

async function startTextAt(x: number, y: number) {
  await $('button[aria-label="Text"]').click()
  await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x, y })
  const editor = $('[contenteditable="true"][aria-label="Text editor"]')
  await expect(editor).toExist()
  return editor
}

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

  it('hands text to the canvas without a vertical jump or duplicate projection', async () => {
    await browser.setWindowSize(1280, 720)
    await openHarness()
    await browser.execute(async () => {
      await document.fonts.load('24px Roboto', 'Hg')
      await document.fonts.ready
    })
    const editor = await startTextAt(18, 18)
    await setNativeColor('Text color', '#00ff00')
    await waitForEditorFocus()
    await editor.addValue('Hg')

    const projectionGeometry = await browser.execute(() => {
      const editor = document.querySelector<HTMLDivElement>(
        '[contenteditable="true"][aria-label="Text editor"]',
      )
      const span = editor?.querySelector<HTMLElement>('[data-rich-text-span]')
      const paragraph = span?.closest<HTMLElement>('[data-rich-text-paragraph]')
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!editor || !span || !paragraph || !scene)
        throw new Error('Text projection geometry is unavailable')
      editor.style.caretColor = 'transparent'
      const marker = document.createElement('span')
      marker.style.display = 'inline-block'
      marker.style.width = '0'
      marker.style.height = '0'
      marker.style.padding = '0'
      marker.style.verticalAlign = 'baseline'
      paragraph.prepend(marker)
      const baseline = marker.getBoundingClientRect().top
      marker.remove()

      const style = getComputedStyle(span)
      const metricsCanvas = document.createElement('canvas')
      const context = metricsCanvas.getContext('2d')
      if (!context) throw new Error('Text metrics canvas is unavailable')
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const metrics = context.measureText(span.textContent ?? '')
      const ascent = metrics.actualBoundingBoxAscent
      const sceneRect = scene.getBoundingClientRect()
      const scale = sceneRect.width / scene.width
      return {
        inkTop: (baseline - ascent - sceneRect.top) / scale,
        originTop: (editor.getBoundingClientRect().top - sceneRect.top) / scale,
        baseline: (baseline - sceneRect.top) / scale,
        actualAscent: ascent / scale,
        fontAscent: metrics.fontBoundingBoxAscent / scale,
        fontDescent: metrics.fontBoundingBoxDescent / scale,
        fontSize: Number.parseFloat(style.fontSize) / scale,
        lineHeight: Number.parseFloat(style.lineHeight) / scale,
        scale,
      }
    })

    await browser.keys(['Control', 'Enter'])
    await expect($('[contenteditable="true"]')).not.toExist()
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    const committed = (await snapshot()).layers.at(-1)
    if (!committed) throw new Error('Committed text layer is missing')

    const greenInk = async (): Promise<{
      readonly count: number
      readonly top: number | null
    }> =>
      browser.execute(() => {
        const scene = document.querySelector<HTMLCanvasElement>(
          '.cs-canvas:not(.cs-canvas-overlay)',
        )
        const context = scene?.getContext('2d')
        if (!scene || !context) throw new Error('Scene pixels are unavailable')
        const pixels = context.getImageData(0, 0, scene.width, scene.height)
        let count = 0
        let top = Number.POSITIVE_INFINITY
        for (let y = 0; y < scene.height; y += 1) {
          for (let x = 0; x < scene.width; x += 1) {
            const offset = (y * scene.width + x) * 4
            const red = pixels.data[offset]!
            const green = pixels.data[offset + 1]!
            const blue = pixels.data[offset + 2]!
            const alpha = pixels.data[offset + 3]!
            if (
              green < 140 ||
              green <= red * 1.5 ||
              green <= blue * 1.5 ||
              alpha < 64
            )
              continue
            count += 1
            top = Math.min(top, y)
          }
        }
        return { count, top: Number.isFinite(top) ? top : null }
      })

    const committedInk = await greenInk()
    expect(committedInk.count).toBeGreaterThan(0)
    expect(committedInk.top).not.toBeNull()
    const verticalDelta = committedInk.top! - projectionGeometry.inkTop
    if (Math.abs(verticalDelta) > 1) {
      throw new Error(
        `Text ink moved ${verticalDelta.toFixed(3)} canvas px (${JSON.stringify({ projection: projectionGeometry, committedTop: committedInk.top, transform: committed.transform })})`,
      )
    }

    await browser.execute(({ translateX, translateY }) => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is unavailable')
      const rect = scene.getBoundingClientRect()
      const scale = rect.width / scene.width
      scene.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 7,
          clientX: rect.left + (translateX + 1) * scale,
          clientY: rect.top + (translateY + 1) * scale,
        }),
      )
    }, committed.transform)
    await expect(
      $('[contenteditable="true"][aria-label="Text editor"]'),
    ).toExist()
    await browser.waitUntil(async () => (await greenInk()).count === 0)
    await browser.keys('Escape')
    await expect($('[contenteditable="true"]')).not.toExist()
    await browser.waitUntil(async () => (await greenInk()).count > 0)
  })

  it('shows the shared toolbar for tools, selection and editing with responsive accessible overflow', async () => {
    await browser.setWindowSize(1024, 700)
    await openHarness()
    for (const [tool, title] of [
      ['Text', 'Text'],
      ['Callout', 'Callout'],
      ['Numbered marker', 'Numbered marker'],
    ] as const) {
      await $(`button[aria-label="${tool}"]`).click()
      await expect($('.cs-text-toolbar')).toHaveAttribute('aria-label', title)
    }

    await $('button[aria-label="Text"]').click()
    const editor = await startTextAt(12, 12)
    await editor.addValue('Selected text')
    await expect($('.cs-text-floating-toolbar')).toHaveAttribute(
      'aria-label',
      'Text',
    )
    await expect($('.cs-context-toolbar .cs-text-toolbar')).not.toExist()
    await browser.keys(['Control', 'Enter'])
    await expect($('.cs-text-floating-toolbar-host')).not.toExist()
    await $('button[aria-label="Show layers"]').click()
    await $('button[aria-label="Select"]').click()
    await $('.cs-layer-row .cs-layer-select').click()
    await expect($('.cs-text-toolbar')).toHaveAttribute('aria-label', 'Text')

    await browser.setWindowSize(640, 700)
    const layout = await browser.execute(() => {
      const toolbar = document.querySelector<HTMLElement>('.cs-text-toolbar')
      const overflow = document.querySelector<HTMLElement>(
        '.cs-text-overflow-trigger',
      )
      if (!toolbar || !overflow) throw new Error('Text toolbar is missing')
      const style = getComputedStyle(overflow)
      const children = [...toolbar.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      )
      const rows = new Set(
        children
          .filter((child) => getComputedStyle(child).display !== 'none')
          .map((child) => Math.round(child.getBoundingClientRect().top)),
      )
      return {
        overflowVisible: style.display !== 'none',
        rows: rows.size,
        toolbarScrolls: toolbar.scrollWidth > toolbar.clientWidth,
        documentScrolls:
          document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    expect(layout).toEqual({
      overflowVisible: true,
      rows: 1,
      toolbarScrolls: false,
      documentScrolls: false,
    })
    await $('button[aria-label="More text settings"]').click()
    await expect(
      $('[role="dialog"][aria-label="More text settings"]'),
    ).toExist()
    await browser.keys('Escape')
    await expect($('button[aria-label="More text settings"]')).toBeFocused()

    await $('button[aria-label="More actions"]').click()
    await $('button=RU').click()
    await expect(
      $('button[aria-label="Дополнительные настройки текста"]'),
    ).toExist()
    await $('button[aria-label="Размер шрифта"]').click()
    await browser.keys('Escape')
    await expect($('button[aria-label="Размер шрифта"]')).toBeFocused()
    const ruOverflow = $('button[aria-label="Дополнительные настройки текста"]')
    await ruOverflow.click()
    const ruOverflowDialog = $(
      '[role="dialog"][aria-label="Дополнительные настройки текста"]',
    )
    await ruOverflowDialog.$('button[aria-label="Фон"]').click()
    await browser.execute(() =>
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      ),
    )
    await expect(ruOverflow).toBeFocused()
  })

  it('keeps Callout bubble and Numbered badge semantics with disabled container controls', async () => {
    await browser.setWindowSize(1280, 720)
    await openHarness()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')

    await $('button[aria-label="Callout"]').click()
    await applyBackground({ color: '#ffcc66', padding: 10, radius: 14 })
    await browser
      .action('pointer')
      .move({ origin: scene, x: -24, y: -12, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 96, y: 48, duration: 80 })
      .up({ button: 'left' })
      .perform()
    const calloutEditor = $(
      '[contenteditable="true"][aria-label="Callout editor"]',
    )
    await calloutEditor.addValue('Bubble')
    await browser.keys(['Control', 'Enter'])
    let layer = (await snapshot()).layers.at(-1)
    expect(layer).toMatchObject({
      kind: 'callout',
      payload: { background: { padding: 10, radius: 14 } },
    })
    expect(layer?.payload).toHaveProperty('target')
    expect(layer?.payload).toHaveProperty('label')

    await $('button[aria-label="Numbered marker"]').click()
    await expect($('button[aria-label="Bullet list"]')).toBeDisabled()
    await $('button[aria-label="Background"]').click()
    await expect(
      $('.cs-text-background-popover').$('button=None'),
    ).toBeDisabled()
    const disabledNumbers = await $$(
      '.cs-text-background-popover input[type="number"]:disabled',
    )
    expect(disabledNumbers).toHaveLength(2)
    await browser.keys('Escape')
    await scene.click({ x: 42, y: 20 })
    await browser.waitUntil(async () => (await snapshot()).layers.length === 6)
    await $('button[aria-label="Show layers"]').click()
    await $('button[aria-label="Select"]').click()
    await $('.cs-layer-row .cs-layer-select').click()
    await applyBackground({ color: '#cc3344', padding: 0, radius: 0 })
    layer = (await snapshot()).layers.at(-1)
    expect(layer).toMatchObject({
      kind: 'numberedMarker',
      payload: {
        badge: {
          shape: 'circle',
          color: {
            red: 0.8,
            green: 0.2,
            blue: 0.26666666666666666,
            alpha: 1,
          },
        },
      },
    })
  })
})
