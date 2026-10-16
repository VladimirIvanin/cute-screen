import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openHarness,
  setEditorSelection,
} from './browser-v7-rich-text-test-kit'
import { exerciseCalloutLayout } from './callout-layout-scenarios'

describe('Measured callout labels', () => {
  it('creates outside labels through drag, wraps, reopens, resizes and undoes', async () => {
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await exerciseCalloutLayout('artifacts/browser-e2e')
  })
})

describe('Callout mixed font metrics', () => {
  it('centres a wrapped label with different span sizes on the label marker', async () => {
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await browser.setWindowSize(1440, 900)
    await $('button[aria-label="Callout"]').click()
    await waitForStableCanvas()
    await browser.action('pointer').move({ origin: 'viewport', x: 900, y: 500 }).down({ button: 'left' })
      .move({ origin: 'viewport', x: 700, y: 300, duration: 150 }).up({ button: 'left' }).perform()
    const editor = $('[aria-label="Callout editor"]')
    await expect(editor).toExist()
    await browser.keys('AA small text small text small text')
    await setEditorSelection(0, 2)
    await $('button[aria-label="Font size"]').click()
    await $('.cs-text-size-popover').$('button=48').click()
    await browser.keys('Escape')
    await $('button[aria-label="Label width"]').click()
    await setNumericInput($('.cs-callout-width-popover input'), '110')
    await $('.cs-callout-width-popover').$('button=Apply').click()
    const dimensions = await browser.execute(() => {
      const editor = document.querySelector<HTMLElement>('[aria-label="Callout editor"]')!
      const r = editor.getBoundingClientRect()
      return { center: r.top + r.height / 2, breaks: editor.querySelectorAll('[data-rich-text-soft-break]').length }
    })
    expect(dimensions.breaks).toBeGreaterThan(1)
    expect(dimensions.center).toBeCloseTo(300, 0)
    await editor.click()
    await browser.keys('Escape')
  })
})
