import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot())
}
describe('logo previews and compact library', () => {
  it('previews saved logos before applying, keeps logo controls above text and preserves delete/undo', async () => {
    await browser.setWindowSize(1024, 768)
    await browser.url('/')
    await browser.execute(() => localStorage.clear())
    await browser.url('/?m05=1&m05viewport=1&logoLibrary=1')
    await expect($('.cs-canvas-ready')).toExist()
    await $('button[aria-label="Appearance"]').click()
    await $('[data-composition-section="branding"]').click()
    await $('button=Add signature').click()
    const before = await snapshot()
    const library = $('.cs-logo-library')
    await browser.waitUntil(async () => await library.$$('[data-preview-state="ready"]').length === 3)
    expect(await snapshot()).toEqual(before)
    const pixels = await browser.execute(() => [...document.querySelectorAll<HTMLCanvasElement>('.cs-logo-library canvas')]
      .map((canvas) => [...canvas.getContext('2d')!.getImageData(48, 48, 1, 1).data]))
    expect(new Set(pixels.map((rgba) => rgba.join(','))).size).toBe(3)
    await library.$('button[aria-label="Blue mark"]').click()
    await expect($('.cs-brand-logo-current [data-preview-state="ready"]')).toExist()
    const applied = await snapshot()
    expect(applied.presentation.composition!.branding[0]!.image).not.toBeNull()
    const handle = $('.cs-card-brand-handle')
    await expect(handle).toBeDisplayed()
    await handle.dragAndDrop({ x: 24, y: 12 })
    await browser.waitUntil(async () => {
      const moved = (await snapshot()).presentation.composition!.branding[0]!.offset
      return moved.x !== applied.presentation.composition!.branding[0]!.offset.x
    })
    const moved = await snapshot()
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot()).presentation.composition).toEqual(applied.presentation.composition)
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot()).presentation.composition).toEqual(moved.presentation.composition)
    await $('button[aria-label="Undo"]').click()
    await $('button[aria-label="Undo"]').click()
    await expect($('.cs-brand-logo-current .cs-logo-preview')).not.toExist()
    await $('button[aria-label="Redo"]').click()
    await expect($('.cs-brand-logo-current [data-preview-state="ready"]')).toExist()
    const remove = library.$('button[aria-label="Remove saved item Blue mark"]')
    await remove.click()
    await library.$('button=Cancel').click()
    await expect(remove).toBeFocused()
    await remove.click()
    await library.$('button=Remove').click()
    await expect(library.$('button[aria-label="Blue mark"]')).not.toExist()
    expect((await snapshot()).presentation.composition).toEqual(applied.presentation.composition)
    await setNumericInput($('.cs-brand-logo-controls input'), '320')
    await browser.keys('Tab')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      const decoration = await browser.execute(() => {
        const handle = document.querySelector<HTMLElement>('.cs-card-brand-handle')!
        const style = getComputedStyle(handle)
        return { border: style.borderWidth, shadow: style.boxShadow, background: style.backgroundColor }
      })
      expect(decoration).toEqual({ border: '0px', shadow: 'none', background: 'rgba(0, 0, 0, 0)' })
      await browser.execute(() => {
        document.querySelector('.cs-composition-body')!.scrollTop = 0
      })
      const geometry = await browser.execute(() => {
        const logo = document.querySelector('.cs-brand-logo')!.getBoundingClientRect()
        const text = document.querySelector('.cs-brand-text')!.getBoundingClientRect()
        const library = document.querySelector('.cs-logo-library')!
        const body = document.querySelector('.cs-composition-body')!.getBoundingClientRect()
        const previewsClear = [...library.querySelectorAll('.cs-card-material')].every((item) => {
          const preview = item.querySelector('.cs-logo-preview')!.getBoundingClientRect()
          const remove = item.querySelector('button:last-child')!.getBoundingClientRect()
          return preview.right <= remove.left
        })
        return { logoAboveText: logo.bottom <= text.top, compact: library.getBoundingClientRect().height < 100,
          overflow: library.scrollWidth > library.clientWidth,
          visible: library.getBoundingClientRect().bottom <= body.bottom, previewsClear }
      })
      expect(geometry).toEqual({
        logoAboveText: true,
        compact: true,
        overflow: false,
        visible: true,
        previewsClear: true,
      })
      await browser.saveScreenshot(`artifacts/browser-e2e/logos-${locale}-${theme}.png`)
    }
    await handle.execute((element) => (element as HTMLElement).focus())
    await browser.keys('Tab')
    await browser.keys(['Shift', 'Tab'])
    await expect(handle).toBeFocused()
    expect(await handle.execute((element) => {
      const style = getComputedStyle(element)
      return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    })).toBe(true)
  }).timeout(120000)
})
