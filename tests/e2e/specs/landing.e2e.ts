import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import {
  $,
  browser,
  expect,
} from '@wdio/globals'

const output = path.resolve('artifacts/landing-e2e')

async function openPage(
  locale: 'ru' | 'en',
  width: number,
): Promise<void> {
  await browser.setViewport({ width, height: 950, devicePixelRatio: 1 })
  await browser.url(locale === 'ru' ? '/cute-screen/' : '/cute-screen/en/')
  await browser.waitUntil(async () => browser.execute(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  ))
}

describe('static landing production preview', () => {
  before(async () => {
    await mkdir(output, { recursive: true })
  })

  it('shows the supplied screenshot and all project icons in both locales at exact viewport widths', async () => {
    for (const locale of ['ru', 'en'] as const) {
      for (const width of [375, 760, 768, 1024, 1440]) {
        await openPage(locale, width)
        await expect($('html')).toHaveAttribute('lang', locale)
        const layout = await browser.execute(() => {
          const demoElement = document.querySelector('.demo')!
          const demo = demoElement.getBoundingClientRect()
          const frame = document.querySelector('.demo-frame')!
          const screenshot = document.querySelector('.hero-screenshot')! as HTMLImageElement
          const tools = [...document.querySelectorAll('.tool')]
          return {
            viewport: innerWidth,
            overflow: document.documentElement.scrollWidth > innerWidth,
            demoVisible: getComputedStyle(demoElement).display !== 'none',
            demoFits: demo.width === 0 || (demo.left >= 0 && demo.right <= innerWidth),
            screenshotSize: [screenshot.naturalWidth, screenshot.naturalHeight],
            imageScrollable: frame.scrollWidth > frame.clientWidth,
            brandedMain: document.querySelector('main')!.innerText.includes('Cute Screen'),
            tools: tools.length,
            iconsLoaded: tools.every((tool) => {
              const icon = tool.querySelector('img')
              return icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0
            }),
            scripts: document.scripts.length,
          }
        })
        expect(layout).toEqual({
          viewport: width,
          overflow: false,
          demoVisible: width > 760,
          demoFits: true,
          screenshotSize: [1919, 943],
          imageScrollable: width > 760 && width <= 1050,
          brandedMain: false,
          tools: 16,
          iconsLoaded: true,
          scripts: 0,
        })
        await browser.saveScreenshot(path.join(output, `hero-shot-${locale}-${width}.png`), { fullPage: true })
      }
    }
  }).timeout(120000)

  it('uses real keyboard navigation, a visible focus ring and working language and feature links', async () => {
    await openPage('ru', 1440)
    await browser.keys('Tab')
    expect(await browser.execute(() => document.activeElement?.className)).toBe('skip-link')
    expect(await browser.execute(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
    await browser.keys('Enter')
    expect(await browser.execute(() => location.hash)).toBe('#features')
    await $('.locale-switch').click()
    await expect($('html')).toHaveAttribute('lang', 'en')
    await expect($('.hero-action .button')).toHaveText(/^View on GitHub\s*↗$/u)
    await $('.locale-switch').click()
    await expect($('html')).toHaveAttribute('lang', 'ru')
    await expect($('.hero-action .button')).toHaveAttribute('href', 'https://github.com/VladimirIvanin/cute-screen')
    expect(await browser.execute(() =>
      document.querySelectorAll('.demo a, .demo button, .demo img[tabindex]').length,
    )).toBe(0)
  })

  it('hides the hero screenshot and clips the supplied tool rail corners on mobile', async () => {
    await openPage('ru', 375)
    expect(await $('.demo').isDisplayed()).toBe(false)
    const toolbar = $('.toolbar-scroll')
    await toolbar.scrollIntoView()
    await toolbar.click()
    await browser.keys('ArrowRight')
    await browser.waitUntil(async () => browser.execute(() => document.querySelector('.toolbar-scroll')!.scrollLeft > 0))
    const image = await browser.execute(() => {
      const cutout = document.querySelector('.toolbar-cutout')!
      const img = cutout.querySelector('img')!
      return {
        clip: getComputedStyle(cutout).clipPath,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
    })
    expect(image).toEqual({ clip: 'inset(0px round 16px)', width: 595, height: 46 })
  })
})
