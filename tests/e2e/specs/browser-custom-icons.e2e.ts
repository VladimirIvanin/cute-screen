import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openM08 } from './browser-m08-test-kit'
import { setShellPreferences } from './browser-m06-test-kit'

const evidence = path.resolve('artifacts/custom-icons', process.env.CUTE_SCREEN_ICON_EVIDENCE ?? 'after')

describe('custom icons beside Tabler', () => {
  before(async () => {
    await mkdir(evidence, { recursive: true })
  })

  it('renders the actual UiIcon in both themes and at DPR 1/2', async () => {
    await browser.url('/icons-preview.html')
    await expect($('.icon-workbench')).toBeDisplayed()
    for (const dpr of [1, 2]) {
      await browser.setViewport({ width: 1280, height: 1400, devicePixelRatio: dpr })
      await browser.execute(() => window.scrollTo(0, 0))
      expect(await browser.execute(() => devicePixelRatio)).toBe(dpr)
      await browser.saveScreenshot(path.join(evidence, `gallery-dpr-${dpr}.png`))
      await $('.loupe-preview').saveScreenshot(path.join(evidence, `loupe-dpr-${dpr}.png`))
      await $('.censor-proposals').saveScreenshot(path.join(evidence, `censor-options-dpr-${dpr}.png`))
      await $('.icon-row[data-icon-name="callout"]').scrollIntoView({ block: 'start' })
      await browser.saveScreenshot(path.join(evidence, `callout-family-dpr-${dpr}.png`))
      await $('.icon-row[data-icon-name="gradient"]').scrollIntoView({ block: 'center' })
      await browser.saveScreenshot(path.join(evidence, `gradient-family-dpr-${dpr}.png`))
    }
    await browser.setViewport({ width: 1280, height: 800, devicePixelRatio: 1 })
    const geometry = await browser.execute(() => [...document.querySelectorAll('.icon-row[data-icon-name]')].map((row) => ({
      name: row.getAttribute('data-icon-name'),
      theme: row.closest('[data-theme]')?.getAttribute('data-theme'),
      sizes: [...row.querySelectorAll('svg')].map((svg) => svg.getBoundingClientRect().width),
      colours: [...row.querySelectorAll('svg')].map((svg) => getComputedStyle(svg).stroke),
    })))
    for (const row of geometry) {
      expect(row.sizes).toEqual([16, 18, 20, 24, 32])
      expect(row.colours.every((colour) => colour === row.colours[0])).toBe(true)
    }
    expect(geometry.find((row) => row.theme === 'light')?.colours[0])
      .not.toBe(geometry.find((row) => row.theme === 'dark')?.colours[0])
    await writeFile(path.join(evidence, 'gallery.json'), JSON.stringify(geometry, null, 2))
    const rasters = await browser.execute(async () => {
      const results = []
      for (const name of [
        'marker', 'pencil', 'eyedropper', 'spotlight', 'privacy', 'loupe', 'callout', 'gradient',
      ]) {
        for (const size of [16, 18, 20, 24, 32]) {
          for (const dpr of [1, 2]) {
            const source = document.querySelector(
              `.icon-theme[data-theme="light"] [data-icon-name="${name}"] [data-size="${size}"] svg, ` +
              `.icon-theme[data-theme="light"] [data-censor-candidate="${name}"] svg`,
            )
            if (!source) throw new Error(`Missing actual UiIcon: ${name}/${size}`)
            const svg = source.cloneNode(true) as SVGSVGElement
            // Expand the viewport to reveal ink outside the intended 24-unit box.
            const extent = Math.round(size * dpr * 32 / 24)
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
            svg.setAttribute('viewBox', '-4 -4 32 32')
            svg.setAttribute('width', String(extent))
            svg.setAttribute('height', String(extent))
            svg.removeAttribute('style')
            svg.style.color = '#000'
            const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
            try {
              const image = new Image()
              image.src = url
              await image.decode()
              const canvas = document.createElement('canvas')
              canvas.width = extent
              canvas.height = extent
              const context = canvas.getContext('2d')!
              context.drawImage(image, 0, 0)
              const pixels = context.getImageData(0, 0, extent, extent).data
              let mass = 0
              let escaped = 0
              for (let y = 0; y < extent; y += 1) {
                for (let x = 0; x < extent; x += 1) {
                  const alpha = pixels[(y * extent + x) * 4 + 3]!
                  mass += alpha / 255
                  if (
                    x + 0.5 < extent / 8 ||
                    x + 0.5 > extent * 7 / 8 ||
                    y + 0.5 < extent / 8 ||
                    y + 0.5 > extent * 7 / 8
                  ) escaped += alpha
                }
              }
              results.push({ name, size, dpr, mass, escaped })
            } finally {
              URL.revokeObjectURL(url)
            }
          }
        }
      }
      return results
    })
    for (const raster of rasters) {
      expect(raster.mass).toBeGreaterThan(5)
      expect(raster).toEqual(expect.objectContaining({ escaped: 0 }))
    }
    await writeFile(path.join(evidence, 'raster-checks.json'), JSON.stringify(rasters, null, 2))
    await $('button[aria-label="light marker rest"]').click()
    await browser.keys('Tab')
    await expect($('button[aria-label="light marker hover"]')).toBeFocused()
    await expect($('button[aria-label="light marker disabled"]')).toBeDisabled()
    await $('button[aria-label="light loupe rest"]').click()
    await browser.keys('Tab')
    await expect($('button[aria-label="light loupe hover"]')).toBeFocused()
    await expect($('button[aria-label="light loupe disabled"]')).toBeDisabled()
    await browser.saveScreenshot(path.join(evidence, 'loupe-keyboard-focus.png'))
    await $('button[aria-label="light callout rest"]').click()
    await browser.keys('Tab')
    await expect($('button[aria-label="light callout hover"]')).toBeFocused()
    await expect($('button[aria-label="light callout disabled"]')).toBeDisabled()
    await browser.saveScreenshot(path.join(evidence, 'callout-keyboard-focus.png'))
  })

  it('keeps the rail readable in RU/EN, light/dark and disabled states', async () => {
    await browser.setWindowSize(1024, 750)
    await browser.url('/')
    await browser.execute(() => localStorage.clear())
    await browser.url('/')
    await expect($('button[aria-label="Eyedropper"]')).toBeDisabled()
    await expect($('button[aria-label="Spotlight"]')).toBeDisabled()
    await expect($('button[aria-label="Hide data"]')).toBeDisabled()
    await expect($('button[aria-label="Loupe"]')).toBeDisabled()
    await expect($('button[aria-label="Callout"]')).toBeDisabled()
    await browser.saveScreenshot(path.join(evidence, 'empty-disabled.png'))
    await openM08()
    for (const locale of ['en', 'ru'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        const label = locale === 'ru' ? 'Выделитель' : 'Highlighter'
        await $(`button[aria-label="${label}"]`).click()
        await expect($(`button[aria-label="${label}"]`)).toHaveAttribute('aria-pressed', 'true')
        const spotlight = $(`button[aria-label="${locale === 'ru' ? 'Фонарь' : 'Spotlight'}"]`)
        await spotlight.click()
        await expect(spotlight).toHaveAttribute('aria-pressed', 'true')
        await expect(spotlight.$('svg')).toHaveElementClass('cs-icon-spotlight')
        const censor = $(`button[aria-label="${locale === 'ru' ? 'Скрыть данные' : 'Hide data'}"]`)
        await censor.click()
        await expect(censor).toHaveAttribute('aria-pressed', 'true')
        await expect(censor.$('svg')).toHaveElementClass('cs-icon-privacy')
        await browser.keys('z')
        const loupe = $(`button[aria-label="${locale === 'ru' ? 'Лупа' : 'Loupe'}"]`)
        await expect(loupe).toHaveAttribute('aria-pressed', 'true')
        await expect(loupe.$('svg')).toHaveElementClass('cs-icon-loupe')
        await browser.keys('o')
        const callout = $(`button[aria-label="${locale === 'ru' ? 'Выноска' : 'Callout'}"]`)
        await expect(callout).toHaveAttribute('aria-pressed', 'true')
        await expect(callout.$('svg')).toHaveElementClass('cs-icon-callout')
        await browser.saveScreenshot(path.join(evidence, `editor-${locale}-${theme}.png`))
      }
    }
  })
})
