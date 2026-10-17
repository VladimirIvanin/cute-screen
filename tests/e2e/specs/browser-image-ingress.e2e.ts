import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { imageDocument } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'
import { setShellPreferences } from './browser-m06-test-kit'

async function choose(
  format: 'png' | 'jpeg' | 'webp' | 'svg',
  width: number,
  height: number,
) {
  await browser.execute(async (format, width, height) => {
    type Harness = { __cuteScreenE2eImages: {
      choose(format: string, width: number, height: number): Promise<void>
    } }
    const state = window as unknown as Harness
    await state.__cuteScreenE2eImages.choose(format, width, height)
  }, format, width, height)
}

describe('immediate image insertion', () => {
  before(async () => {
    await browser.setWindowSize(1024, 800)
    await browser.url('/?m05=1&m05viewport=1&imageIngress=1')
    await $('button[data-tool-id="image"]').waitForEnabled()
    await waitForStableCanvas()
  })
  it('decodes PNG/JPEG/WebP/SVG, fits and selects them in both locales and themes', async () => {
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      for (const format of ['png', 'jpeg', 'webp', 'svg'] as const) {
        const before = (await imageDocument()).layers.length
        await choose(format, 3840, 2160)
        await $('button[data-tool-id="image"]').click()
        await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
        await waitForStableCanvas()
        const image = (await imageDocument()).layers.at(-1)!
        expect(image.payload.intrinsicWidth).toBe(3840)
        expect(image.transform.scaleX).toBeLessThan(1)
        await expect($('button[data-tool-id="select"]')).toHaveAttribute('aria-pressed', 'true')
        await browser.keys(['Control', 'z'])
        await browser.waitUntil(async () => (await imageDocument()).layers.length === before)
        await browser.keys(['Control', 'Shift', 'z'])
        await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
      }
      await browser.saveScreenshot(`artifacts/browser-e2e/image-insert-${locale}-${theme}.png`)
    }
  })
  it('pastes a small transparent image without enlarging it', async () => {
    const before = (await imageDocument()).layers.length
    await choose('png', 16, 12)
    await browser.keys(['Control', 'v'])
    await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
    expect((await imageDocument()).layers.at(-1)!.transform.scaleX).toBe(1)
  })
  it('places a drop inside a non-origin crop after zoom and pan; ignores panels and multiple files', async () => {
    await browser.execute(() => {
      (window as unknown as { __cuteScreenE2eImages: { crop(): void } }).__cuteScreenE2eImages.crop()
    })
    const zoom = $('button[aria-label="Zoom in"], button[aria-label="Увеличить"]')
    await zoom.click()
    await zoom.click()
    await waitForStableCanvas()
    await browser.execute(() => {
      document.querySelector('.cs-canvas-scroll')!.scrollTo(200, 100)
    })
    await choose('webp', 3840, 2160)
    const before = (await imageDocument()).layers.length
    await browser.execute(() => {
      const rect = document.querySelector('.cs-toolrail')!.getBoundingClientRect()
      const state = window as unknown as { __cuteScreenE2eImages: { drop(x: number, y: number, count: number): void } }
      state.__cuteScreenE2eImages.drop(rect.left + 10, rect.top + 10, 1)
    })
    expect((await imageDocument()).layers).toHaveLength(before)
    await browser.execute(() => {
      const rect = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
      const state = window as unknown as { __cuteScreenE2eImages: { drop(x: number, y: number, count: number): void } }
      state.__cuteScreenE2eImages.drop(rect.left + 100, rect.top + 100, 2)
    })
    await expect($('.cs-tool-error[role="alert"]')).toExist()
    expect((await imageDocument()).layers).toHaveLength(before)
    await browser.execute(() => {
      const rect = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
      const state = window as unknown as { __cuteScreenE2eImages: { drop(x: number, y: number, count: number): void } }
      state.__cuteScreenE2eImages.drop(rect.left + 100, rect.top + 100, 1)
    })
    await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
    const image = (await imageDocument()).layers.at(-1)!
    expect(image.transform.translateX).toBeGreaterThanOrEqual(300)
    expect(image.transform.translateY).toBeGreaterThanOrEqual(200)
    expect(image.transform.translateX + 3840 * image.transform.scaleX).toBeLessThanOrEqual(2100)
    expect(image.transform.translateY + 2160 * image.transform.scaleY).toBeLessThanOrEqual(1200)
    await browser.saveScreenshot('artifacts/browser-e2e/image-drop-crop.png')
  })
})
