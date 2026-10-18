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

const output = path.resolve('artifacts/landing-e2e', process.env.CUTE_SCREEN_LANDING_NO_JS === '1' ? 'no-js' : 'js')
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
    await expect($('.hero-action .all-downloads')).toHaveText(/^All downloads\s*↓$/u)
    await $('.locale-switch').click()
    await expect($('html')).toHaveAttribute('lang', 'ru')
    await expect($('.hero-action .all-downloads')).toHaveAttribute('href', '#downloads')
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
    expect(image).toEqual({ clip: 'inset(0px round 12px)', width: 598, height: 41 })
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

  it('renders seven direct downloads, OS icons and responsive columns without requiring JavaScript', async () => {
    const catalog = JSON.parse(await readFile('apps/landing/assets/release.json', 'utf8'))
    for (const locale of ['ru', 'en'] as const) {
      for (const width of [375, 760, 768, 1024, 1440]) {
        await openPage(locale, width)
        await expect($('#downloads-title')).toHaveText(locale === 'ru'
          ? 'Готов к работе на вашем компьютере.'
          : 'Ready for your desktop.')
        const result = await browser.execute(() => {
          const columns = [...document.querySelectorAll('.download-column')]
          return {
            links: [...document.querySelectorAll<HTMLAnchorElement>('.download-column li a')].map((link) => link.href).sort(),
            icons: columns.every((column) => {
              const img = column.querySelector('img')!
              return img.complete && img.naturalWidth > 0 && img.alt === ''
            }),
            columns: new Set(columns.map((column) => Math.round(column.getBoundingClientRect().left))).size,
            overflow: document.documentElement.scrollWidth > innerWidth,
            beforeFooter: Boolean(document.querySelector('#downloads')!.compareDocumentPosition(document.querySelector('footer')!) & Node.DOCUMENT_POSITION_FOLLOWING),
          }
        })
        expect(result).toEqual({
          links: catalog.files.map((file: { url: string }) => file.url).sort(),
          icons: true,
          columns: width > 760 ? 3 : 1,
          overflow: false,
          beforeFooter: true,
        })
        await expect($('.download-meta a')).toHaveAttribute('href', catalog.releaseUrl)
        await expect($('.download-meta a:nth-child(2)')).toHaveAttribute('href', catalog.checksumsUrl)
        await $('.all-downloads').click()
        expect(await browser.execute(() => location.hash)).toBe('#downloads')
        // Keyboard navigation must reach an actual download with a visible focus ring.
        await browser.keys('Tab')
        await browser.waitUntil(async () => browser.execute(() => Boolean(document.activeElement?.closest('.download-column'))))
        expect(await browser.execute(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
        await $('#downloads').scrollIntoView()
        await browser.saveScreenshot(path.join(output, `downloads-${locale}-${width}.png`))
      }
    }
  }).timeout(120000)

  it('selects the production hero link from navigator hints and falls back safely', async function () {
    if (process.env.CUTE_SCREEN_LANDING_NO_JS === '1') this.skip()
    const cases = [
      { platform: 'Windows', architecture: 'x86', bitness: '64', file: 'windows-x64.exe' },
      { platform: 'Windows', architecture: 'arm', bitness: '64', file: 'windows-arm64.exe' },
      { platform: 'Linux', architecture: 'arm', bitness: '64', file: 'linux-arm64.deb' },
      { platform: 'macOS', architecture: '', bitness: '', file: 'macos-universal.dmg' },
      { platform: 'Linux', architecture: '', bitness: '', file: 'linux-x64.deb' },
      { platform: 'Windows', architecture: '', bitness: '', denied: true, file: 'windows-x64.exe' },
      { platform: '', architecture: '', bitness: '', noHints: true, ua: 'Mozilla/5.0 (X11; Linux x86_64)', file: 'linux-x64.deb' },
      { platform: '', architecture: '', bitness: '', noHints: true, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', file: 'macos-universal.dmg' },
      { platform: 'Linux', architecture: 'x86', bitness: '32', file: '' },
      { platform: 'Linux', architecture: '', bitness: '', denied: true, ua: 'Linux i686', file: '' },
      { platform: 'Android', architecture: 'arm', bitness: '64', file: '' },
      { platform: 'macOS', architecture: '', bitness: '', touch: 5, ua: 'Macintosh; Intel Mac OS X', file: '' },
      { platform: '', architecture: '', bitness: '', ua: 'unknown', file: '' },
    ]
    for (const locale of ['ru', 'en'] as const) {
      for (const entry of cases) {
        const init = await browser.addInitScript((value) => {
          Object.defineProperty(navigator, 'userAgent', { configurable: true, value: value.ua ?? 'Mozilla/5.0' })
          Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: value.touch ?? 0 })
          Object.defineProperty(navigator, 'userAgentData', {
            configurable: true,
            value: value.noHints ? undefined : {
              platform: value.platform,
              getHighEntropyValues: async () => {
                if (value.denied) throw new DOMException('Denied', 'NotAllowedError')
                return { architecture: value.architecture, bitness: value.bitness }
              },
            },
          })
        }, entry)
        try {
          await openPage(locale, 1440)
          const button = $('[data-download-primary]')
          if (entry.file) {
            await expect(button).toHaveAttribute('data-download-ready', 'true')
            await expect(button).toHaveAttribute('href', expect.stringContaining(entry.file))
            await expect(button).toHaveText(expect.stringContaining(locale === 'ru' ? 'Скачать для' : 'Download for'))
            expect(await button.$('img').isDisplayed()).toBe(true)
            await expect($('[data-download-note]')).toHaveText(expect.stringContaining(entry.file.includes('universal') ? 'Intel + Apple Silicon' : entry.file.includes('arm64') ? 'arm64' : 'x64'))
          } else {
            await expect(button).toHaveAttribute('href', '#downloads')
          }
        } finally {
          await init.remove()
        }
      }
    }
  }).timeout(120000)
})
