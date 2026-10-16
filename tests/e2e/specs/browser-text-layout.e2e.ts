import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { TEXT_FONT_FAMILIES } from '../../../packages/editor-vue/src/text-fonts'
import {
  openHarness,
  snapshot,
  startTextAt,
  setTextFont,
  setEditorSelection,
  waitForEditorFocus,
} from './browser-v7-rich-text-test-kit'

const longWord = 'ывфывыфвыфвывы' + 'в'.repeat(170)

async function dimensions() {
  return browser.execute(() => {
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!
    if (!editor) throw new Error('The text draft closed unexpectedly while typing')
    const scale = Number.parseFloat(editor.style.fontSize) / 24
    const rect = editor.getBoundingClientRect()
    return {
      width: rect.width / scale,
      height: rect.height / scale,
      overflow: editor.scrollWidth > editor.clientWidth + 1,
      breaks: editor.querySelectorAll('[data-rich-text-soft-break]').length,
    }
  })
}

async function commit() {
  await browser.keys(['Control', 'Enter'])
  await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
}

function content(layer: Awaited<ReturnType<typeof snapshot>>['layers'][number]) {
  return layer.payload.content as { text: string; wrap: string; fixedWidth?: number }
}

describe('measured text sizing and wrapping', () => {
  it('grows a compact input to its cap, soft-wraps unbroken Cyrillic and preserves undo/reopen', async () => {
    await browser.setWindowSize(1440, 900)
    await openHarness()
    await $('.cs-zoom-value').click()
    const editor = await startTextAt(18, 18)
    await waitForEditorFocus()
    expect((await dimensions()).width).toBeCloseTo(24, 0)
    await waitForEditorFocus()
    await browser.keys(longWord)
    const edited = await dimensions()
    const toolbar = await browser.execute(() => {
      const rect = document.querySelector<HTMLElement>('.cs-text-floating-toolbar-host')!.getBoundingClientRect()
      return { width: rect.width, height: rect.height, fits: rect.left >= 0 && rect.right <= window.innerWidth &&
        rect.top >= 0 && rect.bottom <= window.innerHeight }
    })
    expect(toolbar.width).toBeGreaterThan(400)
    expect(toolbar.height).toBeLessThan(100)
    expect(toolbar.fits).toBe(true)
    expect(edited.width).toBeCloseTo(480, 0)
    expect(edited.height).toBeGreaterThan(30)
    expect(edited.overflow).toBe(false)
    expect(edited.breaks).toBeGreaterThan(1)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/text-long-word.png'))
    await commit()
    const layer = (await snapshot()).layers.at(-1)!
    expect(content(layer)).toEqual(expect.objectContaining({ text: longWord, wrap: 'fixedWidth', fixedWidth: 480 }))
    expect(layer.localBounds.height).toBeCloseTo(edited.height, 0)
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
    await browser.keys(['Control', 'Shift', 'z'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    await $('button[aria-label="Text"]').click()
    const target = await browser.execute((layer) => {
      const canvas = document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const rect = canvas.getBoundingClientRect()
      const zoom = Number(document.querySelector<HTMLElement>('.cs-zoom-controls')!.dataset.zoom) / 100
      return { x: rect.left + (layer.transform.translateX + layer.localBounds.x - 20 + 8) * zoom,
        y: rect.top + (layer.transform.translateY + layer.localBounds.y - 15 + 12) * zoom }
    }, layer)
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(target.x), y: Math.round(target.y) })
      .down({ button: 'left' }).up({ button: 'left' }).perform()
    await expect(editor).toExist()
    expect(await editor.getText()).toContain('ывфывыфвыфвывы')
    expect((await dimensions()).height).toBeCloseTo(edited.height, 0)
    await browser.keys('Escape')
  })

  it('uses the actual face width for every bundled font and remeasures selected styling', async () => {
    await openHarness()
    await $('.cs-zoom-value').click()
    const sample = 'AV Текст Ширина'
    const editor = await startTextAt(18, 18)
    await browser.keys(sample)
    await setEditorSelection(0, sample.length)
    for (const family of TEXT_FONT_FAMILIES) {
      await setTextFont(family)
      const measured = await browser.execute(() => {
        const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!
        const span = editor.querySelector('span')!
        const style = getComputedStyle(span)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        return {
          expected: context.measureText(editor.textContent!).width, actual: editor.getBoundingClientRect().width,
        }
      })
      expect(Math.abs(measured.expected - measured.actual)).toBeLessThan(0.1)
    }
    await editor.click()
    await commit()
    const before = (await snapshot()).layers.at(-1)!
    await setTextFont('Oswald')
    const after = (await snapshot()).layers.at(-1)!
    expect(after.localBounds.width).toBeLessThan(before.localBounds.width)
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () =>
      (await snapshot()).layers.at(-1)!.localBounds.width === before.localBounds.width)
  })

  it('keeps the full background palette and numeric controls inside the popup', async () => {
    await openHarness()
    await $('.cs-zoom-value').click()
    await $('button[aria-label="Text"]').click()
    for (const width of [640, 1024, 1440]) {
      await browser.setWindowSize(width, 800)
      await $('button[aria-label="Background"]').click()
      const panel = $('.cs-text-background-popover')
      await expect(panel).toBeDisplayed()
      await browser.waitUntil(() => browser.execute(() =>
        document.getAnimations().every((animation) => animation.playState !== 'running')))
      const overflow = await browser.execute(() => {
        const panel = document.querySelector<HTMLElement>('.cs-text-background-popover')!
        return [...panel.querySelectorAll<HTMLElement>('*'), panel].filter((element) =>
          getComputedStyle(element).overflowX === 'auto' || element === panel)
          .some((element) => element.scrollWidth > element.clientWidth + 1)
      })
      expect(overflow).toBe(false)
      await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/text-background-fit-${width}.png`))
      await panel.$('button=Cancel').click()
    }
  })

  it('stretches capped text beyond its initial width and undoes measured reflow on a large canvas', async () => {
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    const editor = await startTextAt(18, 18)
    await waitForEditorFocus()
    await browser.keys(longWord)
    await commit()
    const before = (await snapshot()).layers.at(-1)!
    expect(before.localBounds.width).toBe(480)
    await $('button[aria-label="Select"]').click()
    const handle = await browser.execute((layer) => {
      const rect = document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      const scale = Number(document.querySelector<HTMLElement>('.cs-zoom-controls')!.dataset.zoom) / 100
      return { x: rect.left + (layer.transform.translateX + layer.localBounds.width) * scale,
        y: rect.top + (layer.transform.translateY + layer.localBounds.height / 2) * scale, scale }
    }, before)
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(handle.x), y: Math.round(handle.y) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(handle.x + 240 * handle.scale), y: Math.round(handle.y), duration: 180 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await snapshot()).layers.at(-1)!.localBounds.width > 600)
    const after = (await snapshot()).layers.at(-1)!
    expect(after.localBounds.height).toBeLessThan(before.localBounds.height)
    expect(content(after).text).toBe(longWord)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/text-manual-width.png'))
    await browser.keys(['Control', 'z'])
    await browser.waitUntil(async () => (await snapshot()).layers.at(-1)!.localBounds.width === 480)
    expect((await snapshot()).layers.at(-1)!.localBounds).toEqual(before.localBounds)
    await $('button[aria-label="Text"]').click()
    await expect(editor).not.toExist()
  })

})
