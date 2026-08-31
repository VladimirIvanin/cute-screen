import { $, $$, browser, expect } from '@wdio/globals'
import {
  snapshot,
  openHarness,
  waitForEditorFocus,
  setNativeColor,
  applyBackground,
  startTextAt,
} from './browser-v7-rich-text-test-kit'

describe('Document v7 rich text in browser mode', () => {
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
