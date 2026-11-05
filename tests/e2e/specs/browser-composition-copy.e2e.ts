import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'

describe('appearance while copying', () => {
  it('keeps controls, section and scroll stable without disabled flashes', async () => {
    await browser.setWindowSize(1280, 800)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    await $('[data-composition-start="browser"]').click()
    await $('[data-composition-section="background"]').click()
    await browser.execute(() => {
      const panel = document.querySelector<HTMLElement>('.cs-composition-panel')!
      const body = panel.querySelector<HTMLElement>('.cs-composition-body')!
      body.scrollTop = 120
      const scroll = body.scrollTop
      const nodes = [...panel.querySelectorAll('input, button, select')]
      const changes: string[] = []
      let busy = false
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.target === panel && record.attributeName === 'aria-busy') {
            busy ||= panel.getAttribute('aria-busy') === 'true'
          } else if (record.type === 'childList' || record.attributeName === 'disabled') changes.push(record.type)
        }
      })
      observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-busy'] })
      ;
      (window as typeof window & { appearanceCopyResult: () => unknown }).appearanceCopyResult = () => {
        observer.disconnect()
        return { busy, changes, sameNodes: nodes.every((node, index) => panel.querySelectorAll('input, button, select')[index] === node),
          sameScroll: scroll === body.scrollTop, section: panel.querySelector('[data-active-section]')?.getAttribute('data-active-section'),
          inert: panel.inert }
      }
    })
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-composition-panel')).toHaveAttribute('aria-busy', 'false')
    const result = await browser.execute(() => {
      return (window as typeof window & { appearanceCopyResult: () => unknown }).appearanceCopyResult()
    })
    expect(result).toEqual({ busy: true, changes: [], sameNodes: true, sameScroll: true, section: 'background', inert: false })
    await browser.saveScreenshot('artifacts/browser-e2e/appearance-after-copy.png')
  })
})
