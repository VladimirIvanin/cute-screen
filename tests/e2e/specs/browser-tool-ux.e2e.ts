import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
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
