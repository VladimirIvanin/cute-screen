import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { Key } from 'webdriverio'
import { verifyArrowSelectionMenu } from '../arrow-selection-menu'
import {
  openDrawingHarness,
  snapshot,
  setShellPreferences,
} from './browser-m06-test-kit'

async function draw(
  x = -80,
  y = -50,
): Promise<void> {
  await browser
    .action('pointer')
    .move({ origin: $('.cs-canvas:not(.cs-canvas-overlay)'), x, y })
    .down({ button: 'left' })
    .move({ origin: 'pointer', x: 75, y: 28, duration: 80 })
    .up({ button: 'left' })
    .perform()
}
describe('consistent tool UX with native browser input', () => {
  it('aligns the arrow icon menu and draws selection chrome at display resolution', async () => {
    await browser.setWindowSize(1280, 800)
    await openDrawingHarness()
    await verifyArrowSelectionMenu('artifacts/browser-e2e')
  })
  it('pastes a copied style into a multi-selection as one undoable edit', async () => {
    await openDrawingHarness()
    await $('button[aria-label="Arrow"]').click()
    await draw()
    await $('.cs-selection-floating-toolbar button[aria-label="Stroke: 3 px"]').click()
    await $('.cs-arrow-toolbar-popover').$('button=10 px').click()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await scene.click({ x: -42, y: -36 })
    await browser.keys([Key.Control, Key.Alt, 'c'])
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await $('.cs-tool-configure-popover-host button[aria-label="Stroke: 10 px"]').click()
    await $('.cs-arrow-toolbar-popover').$('button=2 px').click()
    await browser.keys('Escape')
    await draw(-100, 35)
    const second = (await snapshot()).layers.at(-1)!
    await $('button[aria-label="Arrow"]').click()
    await draw(40, 35)
    const third = (await snapshot()).layers.at(-1)!
    await $('button[aria-label="Show layers"]').click()
    await $(`[data-layer-id="${second.id}"] .cs-layer-select`).click()
    await browser.action('key').down(Key.Control).perform(true)
    await $(`[data-layer-id="${third.id}"] .cs-layer-select`).click()
    await browser.action('key').up(Key.Control).perform()
    await expect($(`[data-layer-id="${second.id}"]`)).toHaveElementClass('is-selected')
    await expect($(`[data-layer-id="${third.id}"]`)).toHaveElementClass('is-selected')
    await scene.click({ x: -62, y: 49, button: 'right' })
    await $('.cs-canvas-context-menu').$('button=Paste style').click()
    const styled = (await snapshot()).layers.filter((layer) => [second.id, third.id].includes(layer.id))
    expect(styled.map((layer) => (layer.payload?.stroke as { width: number }).width)).toEqual([10, 10])
    await $('button[aria-label="Undo"]').click()
    const restored = (await snapshot()).layers.filter((layer) => [second.id, third.id].includes(layer.id))
    expect(restored.map((layer) => (layer.payload?.stroke as { width: number }).width)).toEqual([2, 2])
  })
  it('configures with right click, creates once, edits nearby and remembers defaults after reload', async () => {
    await openDrawingHarness()
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
    await $('button[aria-label="Stroke: 3 px"]').click()
    await $('.cs-arrow-toolbar-popover').$('button=6 px').click()
    await browser.keys('Escape')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await draw()
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
    expect((await snapshot()).layers.at(-1)).toMatchObject({
      kind: 'arrow',
      payload: { stroke: { width: 6 } },
    })
    await $('.cs-selection-floating-toolbar button[aria-label="Stroke: 6 px"]').click()
    await $('.cs-arrow-toolbar-popover').$('button=10 px').click()
    await browser.keys('a')
    await draw(-100, 35)
    expect((await snapshot()).layers.at(-1)).toMatchObject({
      payload: { stroke: { width: 10 } },
    })
    await browser.refresh()
    await expect($('.cs-canvas-ready')).toExist()
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await expect($('.cs-tool-configure-popover-host button[aria-label="Stroke: 10 px"]')).toExist()
  })
  it('keeps repeated tools active and opens a real canvas context menu', async () => {
    await openDrawingHarness()
    await $('button[aria-label="Pencil"]').click()
    await draw()
    await draw(-70, 20)
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    expect((await snapshot()).layers.slice(-2).map((layer) => layer.kind)).toEqual(['pencil', 'pencil'])
    await $('.cs-canvas:not(.cs-canvas-overlay)').click({ button: 'right' })
    await expect($('.cs-canvas-context-menu')).toBeDisplayed()
    await browser.keys('Escape')
    await expect($('.cs-canvas-context-menu')).not.toExist()
  })
  it('keeps selection formatting within the viewport across language/theme combinations', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await $('button[aria-label="Shape"]').click()
    await draw()
    for (const locale of ['en', 'ru'] as const)
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
        const bounds = await browser.execute(() => {
          const rect = document.querySelector('.cs-selection-floating-toolbar')!.getBoundingClientRect()
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
          }
        })
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.top).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(bounds.width)
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.height)
        await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/tool-ux-1024-${locale}-${theme}.png`))
      }
  })
})
