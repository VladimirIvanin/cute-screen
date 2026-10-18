import {
  mkdir,
  readFile,
  readdir,
} from 'node:fs/promises'
import path from 'node:path'

import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyBrandEyes } from '../brand-eyes'

const output = path.resolve('artifacts/landing-e2e')
const expectedTools = [
  'arrow', 'line', 'shape', 'pencil', 'marker', 'text', 'numberedMarker', 'callout',
  'privacy', 'spotlight', 'loupe', 'ruler', 'eyedropper', 'crop', 'image', 'emoji', 'select', 'hand',
]

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

  it('shows the demo screenshot and all eighteen project tools in both locales at exact viewport widths', async () => {
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
            tools: tools.map((tool) => tool.getAttribute('data-tool')),
            iconsLoaded: tools.every((tool) => {
              const icon = tool.querySelector('img')
              if (
                !(icon instanceof HTMLImageElement) ||
                !icon.complete ||
                !icon.naturalWidth
              ) return false
              const filename = new URL(icon.src).pathname.split('/').at(-1)!
              const name = tool.getAttribute('data-tool')
              return filename === `${name}.svg` || (filename.startsWith(`${name}-`) && filename.endsWith('.svg'))
            }),
            descriptionsPresent: tools.every((tool) => Boolean(tool.querySelector('p')?.textContent?.trim())),
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
          tools: expectedTools,
          iconsLoaded: true,
          descriptionsPresent: true,
          scripts: 1,
        })
        await expect($('[data-tool="emoji"] h3')).toHaveText(locale === 'ru' ? 'Эмодзи' : 'Emoji')
        await expect($('[data-tool="emoji"] p')).toHaveText(expect.stringContaining('100'))
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

  it('hides the hero screenshot and clips the captured tool rail corners on mobile', async () => {
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
    expect(image).toEqual({ clip: 'inset(0px round 16px)', width: 665, height: 46 })
  })

  it('animates the inline brand in RU/EN using a small independent bundle', async function () {
    if (process.env.CUTE_SCREEN_LANDING_NO_JS === '1') this.skip()
    const assets = 'apps/landing/dist/assets'
    const scripts = (await readdir(assets)).filter((file) => file.endsWith('.js'))
    expect(scripts).toHaveLength(1)
    const source = await readFile(path.join(assets, scripts[0]!), 'utf8')
    expect(source.length).toBeLessThan(12_000)
    expect(source).not.toMatch(/__TAURI__|__VUE__|createApp|EditorCommand/u)
    for (const locale of ['ru', 'en'] as const) {
      await openPage(locale, 1440)
      await verifyBrandEyes('.brand', path.join(output, `brand-${locale}.png`))
      expect(await $('.brand svg').getSize('width')).toBe(36)
      await $('.brand').click()
      await expect($('html')).toHaveAttribute('lang', 'ru')
    }
  })

  it('keeps the inline logo and navigation working without JavaScript', async function () {
    if (process.env.CUTE_SCREEN_LANDING_NO_JS !== '1') this.skip()
    await openPage('en', 375)
    await expect($('.brand svg')).toBeDisplayed()
    expect(await $('.brand svg').getSize('width')).toBe(31)
    await $('.brand').moveTo()
    await browser.pause(650)
    expect(await $('[data-brand-eyes]').getAttribute('transform')).toBeNull()
    await browser.keys('Tab')
    await expect($('.skip-link')).toBeFocused()
    await browser.keys('Tab')
    await expect($('.brand')).toBeFocused()
    await browser.keys('Enter')
    await expect($('html')).toHaveAttribute('lang', 'ru')
    await $('.locale-switch').click()
    await expect($('html')).toHaveAttribute('lang', 'en')
    await browser.setViewport({ width: 1440, height: 950, devicePixelRatio: 1 })
    await $('nav a[href="#features"]').click()
    expect(await browser.execute(() => location.hash)).toBe('#features')
  }).timeout(120000)
})
