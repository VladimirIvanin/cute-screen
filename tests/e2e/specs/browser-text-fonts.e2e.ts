import {
  $,
  $$,
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
} from './browser-v7-rich-text-test-kit'

describe('curated text toolbar', () => {
  it('keeps all groups visible in both themes/locales at desktop and narrow widths', async () => {
    await openHarness()
    await $('button[aria-label="Text"]').click()
    for (const width of [1440, 1024, 640]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru']) {
        for (const theme of ['dark', 'light']) {
          const more = $('button[aria-label="More actions"], button[aria-label="Другие действия"]')
          await more.click()
          await $(`button=${locale.toUpperCase()}`).click()
          await more.click()
          const themeLabel = locale === 'ru'
            ? theme === 'dark' ? 'Тёмная' : 'Светлая'
            : theme === 'dark' ? 'Dark' : 'Light'
          await $(`button=${themeLabel}`).click()
          const geometry = await browser.execute(() => {
            const toolbar = document.querySelector<HTMLElement>('.cs-text-toolbar')!
            const groups = [...toolbar.querySelectorAll<HTMLElement>('.cs-text-control-group')]
            const rect = toolbar.getBoundingClientRect()
            return { visible: groups.every((group) => getComputedStyle(group).display !== 'none'),
              fits: rect.left >= 0 && rect.right <= window.innerWidth && toolbar.scrollWidth <= toolbar.clientWidth }
          })
          expect(geometry).toEqual({ visible: true, fits: true })
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/text-toolbar-${width}-${locale}-${theme}.png`))
        }
      }
    }
  })

  it('loads every font through its menu, preserves text and decodes the rendered PNG', async () => {
    await browser.setWindowSize(1440, 900)
    await openHarness()
    for (const family of TEXT_FONT_FAMILIES) {
      console.info('Text font roundtrip:', family)
      const editor = await startTextAt(18, 18)
      await browser.waitUntil(() => browser.execute(() =>
        document.activeElement?.getAttribute('contenteditable') === 'true'))
      await browser.keys('Текст Aa 123')
      await setEditorSelection(0, 'Текст Aa 123'.length)
      await setTextFont(family)
      await $('button[aria-label="Bold"]').click()
      await $('button[aria-label="Italic"]').click()
      await editor.click()
      await browser.keys(['Control', 'Enter'])
      await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
      const content = (await snapshot()).layers.at(-1)!.payload.content as {
        text: string
        spans: { fontFamily: string }[]
      }
      expect(content.text).toBe('Текст Aa 123')
      expect(content.spans.map((span) => span.fontFamily)).toEqual([family])
      const result = await browser.execute(async () => {
        const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No PNG')))
        })
        const decoded = await createImageBitmap(blob)
        const output = document.createElement('canvas')
        output.width = decoded.width
        output.height = decoded.height
        const context = output.getContext('2d')!
        context.drawImage(decoded, 0, 0)
        decoded.close()
        const expected = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        const actual = context.getImageData(0, 0, output.width, output.height).data
        return {
          width: output.width,
          height: output.height,
          equal: actual.every((value, index) => value === expected[index]),
        }
      })
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
      expect(result.equal).toBe(true)
      await browser.keys(['Control', 'z'])
      await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
    }
    await $('button[aria-label="Text"]').click()
    await $('button[aria-label="Font family"]').click()
    await expect($$('button[role="option"]')).toBeElementsArrayOfSize(12)
    await browser.keys('Home')
    await browser.keys('Enter')
    await expect($('button[aria-label="Font family"]')).toHaveText('Roboto')
    await $('button[aria-label="Font family"]').click()
    await browser.waitUntil(() => browser.execute(() =>
      document.getAnimations().every((animation) => animation.playState !== 'running')))
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/text-font-menu.png'))
  })
})
