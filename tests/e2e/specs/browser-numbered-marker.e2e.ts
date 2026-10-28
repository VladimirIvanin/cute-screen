import { waitForStableCanvas } from '../canvas-ready'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  snapshot,
  setShellPreferences,
} from './browser-m06-test-kit'
const output = path.resolve('artifacts/numbered-marker')
const tool = () => $('button[aria-label="Numbered marker"]')
const scene = () => $('.cs-canvas:not(.cs-canvas-overlay)')
async function openMarkerHarness() {
  await openDrawingHarness()
  await browser.url('/?m05=1&m05viewport=1')
  await expect($('.cs-canvas-ready')).toExist()
  await waitForStableCanvas()
}
async function defaults() {
  await tool().click({ button: 'right' })
  await expect($('input[aria-label="Next number"]')).toBeDisplayed()
}
async function number(
  value: string,
  label = 'Next number',
) {
  const input = $(`input[aria-label="${label}"]`)
  await input.click()
  await browser.keys(['Control', 'a'])
  await browser.keys(value)
  await browser.keys('Enter')
}
async function selectMarkerAt(
  x: number,
  y: number,
) {
  await $('button[aria-label="Select"]').click()
  await scene().click({ x, y })
  await expect($('.cs-selection-floating-toolbar .cs-numbered-marker-toolbar')).toBeDisplayed()
}

describe('numbered marker UX', () => {
  before(async () => {
    await mkdir(output, { recursive: true })
  })
  it('selects all numbered markers from the object menu and recolours them together', async () => {
    await browser.setWindowSize(1280, 800)
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
    await waitForStableCanvas()
    await tool().click()
    await scene().click({ x: -150, y: -140 })
    await scene().click({ x: 100, y: 100 })
    await browser.waitUntil(async () => (await snapshot()).layers.filter((layer) => layer.kind === 'numberedMarker').length === 2)
    const before = await snapshot()
    await $('button[aria-label="Select"]').click()
    await scene().click({ button: 'right', x: -150, y: -140 })
    await $('button=Select all of this tool').click()
    await expect($('.cs-selection-floating-toolbar .cs-numbered-marker-toolbar')).toBeDisplayed()
    expect(await snapshot()).toEqual(before)
    await $('.cs-selection-floating-toolbar button[aria-label="Badge color"]').click()
    await $('button[aria-label="Red"]').click()
    const changed = await snapshot()
    const markers = changed.layers.filter((layer) => layer.kind === 'numberedMarker')
    expect(markers).toHaveLength(2)
    for (const marker of markers) expect(marker.payload).toMatchObject({ badge: { color: { red: 1 } } })
    await $('button[aria-label="Undo"]').click()
    expect(await snapshot()).toEqual(before)
    await $('button[aria-label="Redo"]').click()
    expect(await snapshot()).toEqual(changed)
  })
  it('places a manual number once, continues max+1 and edits a selected number with undo', async () => {
    await browser.setWindowSize(1280, 800)
    await openMarkerHarness()
    await defaults()
    await number('10')
    await $('button[aria-label="Diamond"]').click()
    await tool().click()
    const beforeCancel = await snapshot()
    await browser.action('pointer').move({ origin: scene(), x: -150, y: -140 }).down({ button: 'left' }).perform(true)
    await browser.keys('Escape')
    await browser.action('pointer').up({ button: 'left' }).perform()
    expect(await snapshot()).toEqual(beforeCancel)
    await scene().click({ x: -150, y: -140 })
    await scene().click({ x: 100, y: 100 })
    await browser.waitUntil(async () => (await snapshot()).layers.filter((l) => l.kind === 'numberedMarker').length === 2)
    expect((await snapshot()).layers.filter((l) => l.kind === 'numberedMarker').map((l) => l.payload?.sequence)).toEqual([10, 11])
    await expect(tool()).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-selection-floating-toolbar')).not.toExist()
    await selectMarkerAt(-150, -140)
    await number('100', 'Number')
    expect((await snapshot()).layers.filter((l) => l.kind === 'numberedMarker')[0]?.payload).toMatchObject({ sequence: 100, label: { text: '100' }, badge: { shape: 'diamond' } })
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot()).layers.filter((l) => l.kind === 'numberedMarker')[0]?.payload?.sequence).toBe(10)
    await $('button[aria-label="Redo"]').click()
    await browser.saveScreenshot(path.join(output, 'selected-number.png'))
    await $('button=Add label').click()
    const editor = $('[aria-label="Numbered marker editor"]')
    await expect(editor).toBeDisplayed()
    await editor.click()
    await browser.keys(['Control', 'a'])
    await browser.keys('Шаг\nдалее')
    await browser.saveScreenshot(path.join(output, 'inline-label.png'))
    await browser.keys(['Control', 'Enter'])
    await expect(editor).not.toExist()
    await browser.saveScreenshot(path.join(output, 'external-caption.png'))
    await expect($('input[aria-label="Number"]')).toHaveValue('100')
    await $('button=Remove label').click()
    expect((await snapshot()).layers.filter((l) => l.kind === 'numberedMarker')[0]?.payload?.label).toMatchObject({ text: '100' })
  })
  it('offers a nonblocking duplicate warning and keeps nested formatting keyboard accessible', async () => {
    await openMarkerHarness()
    await tool().click()
    await scene().click({ x: -150, y: -100 })
    await defaults()
    await number('1')
    await expect($('small=This number is already used')).toBeDisplayed()
    await $('button=More').click()
    await $('button[aria-label="Font family"]').click()
    const option = $('[role="option"][aria-label="Lora"]')
    await expect(option).toBeEnabled()
    await option.click()
    await browser.keys('Escape')
    await expect($('button=More')).toBeFocused()
    await browser.keys('Escape')
    await expect($('#cs-tool-defaults')).not.toExist()
    await expect(tool()).toBeFocused()
  })
  it('previews without history at 50/100/200%, hides for pan and settings, and restores after pointer movement', async () => {
    await openMarkerHarness()
    await tool().click()
    const before = await snapshot()
    const ink = () => browser.execute(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      return pixels.some((value, index) => index % 4 === 3 && value > 0)
    })
    for (const zoom of [50, 100, 200]) {
      await $('button[aria-label="Reset zoom"]').click()
      for (let step = 100; step !== zoom; step += zoom < 100 ? -10 : 10) {
        await $(`button[aria-label="${zoom < 100 ? 'Zoom out' : 'Zoom in'}"]`).click()
      }
      await waitForStableCanvas()
      await browser.action('pointer').move({ origin: scene() }).perform()
      await browser.waitUntil(ink)
      await browser.saveScreenshot(path.join(output, `preview-${zoom}.png`))
      expect(await snapshot()).toEqual(before)
      await browser.action('key').down(' ').perform(true)
      await browser.waitUntil(async () => !await ink())
      await browser.action('key').up(' ').perform()
      await browser.action('pointer').move({ origin: scene(), x: 3 }).perform()
      await browser.waitUntil(ink)
      await defaults()
      await browser.waitUntil(async () => !await ink())
      await browser.keys('Escape')
    }
    await browser.saveScreenshot(path.join(output, 'preview-zoom.png'))
  })
  it('uses the current badge colour and shape as the cursor after closing settings', async () => {
    await openMarkerHarness()
    await $('button[aria-label="Reset zoom"]').click()
    const preview = () => browser.execute(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      let blue = 0
      let red = 0
      let left = canvas.width
      let right = 0
      let top = canvas.height
      let bottom = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3]! < 20) continue
        count++
        if (Math.abs(pixels[i]! - 61) < 4 && Math.abs(pixels[i + 2]! - 255) < 4) blue++
        if (Math.abs(pixels[i]! - 255) < 4 && Math.abs(pixels[i + 2]! - 86) < 4) red++
        const x = i / 4 % canvas.width
        const y = Math.floor(i / 4 / canvas.width)
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
      return { blue, red, occupancy: count / ((right - left + 1) * (bottom - top + 1)) }
    })
    await defaults()
    await $('button[aria-label="Square"]').click()
    await $('button[aria-label="Badge color"]').click()
    await $('button[aria-label="Blue"]').click()
    await browser.keys('Escape')
    await browser.action('pointer').move({ origin: scene() }).perform()
    await expect(scene()).toHaveStyle({ cursor: 'none' })
    await browser.waitUntil(async () => (await preview()).blue > 100)
    expect((await preview()).occupancy).toBeGreaterThan(0.9)
    await defaults()
    await $('button[aria-label="Diamond"]').click()
    await $('button[aria-label="Badge color"]').click()
    await $('button[aria-label="Red"]').click()
    await browser.keys('Escape')
    await browser.action('pointer').move({ origin: scene() }).perform()
    await browser.waitUntil(async () => (await preview()).red > 100)
    expect((await preview()).blue).toBe(0)
    expect((await preview()).occupancy).toBeLessThan(0.65)
    await browser.saveScreenshot(path.join(output, 'preview-current-style.png'))
    await scene().click()
    expect((await snapshot()).layers.findLast((layer) => layer.kind === 'numberedMarker')?.payload).toMatchObject({
      badge: { shape: 'diamond', color: { red: 1, green: 117 / 255, blue: 86 / 255 } },
    })
  })
  it('keeps a caption beside its badge and moves both as one object', async () => {
    await browser.setWindowSize(1280, 800)
    await openMarkerHarness()
    await $('button[aria-label="Reset zoom"]').click()
    await waitForStableCanvas()
    await defaults()
    await number('7')
    await $('button[aria-label="Circle"]').click()
    await $('button[aria-label="Font size"]').click()
    await $('button[aria-label="32 px"]').click()
    await browser.keys('Escape')
    await $('button[aria-label="Badge color"]').click()
    await $('button[aria-label="Blue"]').click()
    await $('button[aria-label="Label color"]').click()
    await $('[role="dialog"][aria-label="Label color"] button[aria-label="White"]').click()
    await browser.keys('Escape')
    const badgePoint = { origin: 'viewport' as const, x: 470, y: 340 }
    await browser.action('pointer').move(badgePoint).down({ button: 'left' }).up({ button: 'left' }).perform()
    await $('button[aria-label="Select"]').click()
    await browser.action('pointer').move(badgePoint).down({ button: 'left' }).up({ button: 'left' }).perform()
    expect((await snapshot()).layers.findLast((layer) => layer.kind === 'numberedMarker')?.payload).toMatchObject({
      badge: { color: { red: 61 / 255, green: 173 / 255, blue: 1 } },
      label: { spans: [{ color: { red: 1, green: 1, blue: 1 } }] },
    })
    await $('button=Add label').click()
    const editor = $('[aria-label="Numbered marker editor"]')
    await expect(editor).toBeDisplayed()
    await browser.keys('Проверьте настройки\nи подтвердите шаг')
    await browser.keys(['Control', 'Enter'])
    await expect(editor).not.toExist()
    const before = await snapshot()
    const marker = before.layers.findLast((layer) => layer.kind === 'numberedMarker')!
    expect(marker.payload).toMatchObject({ sequence: 7, label: { text: '7\nПроверьте настройки\nи подтвердите шаг' } })
    await browser.saveScreenshot(path.join(output, 'caption-beside-number.png'))
    await $('button[aria-label="Select"]').click()
    // Start on the caption, away from the badge: the shared hit geometry must include it.
    await browser.action('pointer').move({ origin: 'viewport', x: 590, y: 340 }).down({ button: 'left' })
      .move({ origin: 'viewport', x: 650, y: 390, duration: 150 }).up({ button: 'left' }).perform()
    const moved = (await snapshot()).layers.find((layer) => layer.id === marker.id)!
    expect(moved.transform?.translateX).toBeCloseTo(marker.transform!.translateX + 60)
    expect(moved.transform?.translateY).toBeCloseTo(marker.transform!.translateY + 50)
    expect(moved.payload).toEqual(marker.payload)
    await $('button[aria-label="Undo"]').click()
    expect(await snapshot()).toEqual(before)
  })
  it('keeps controls visible across locale, theme and window sizes', async () => {
    await openMarkerHarness()
    for (const locale of ['en', 'ru'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        for (const width of [640, 1024, 1440]) {
          await browser.setWindowSize(width, 800)
          const button = $(`button[aria-label="${locale === 'ru' ? 'Номерная метка' : 'Numbered marker'}"]`)
          await button.click({ button: 'right' })
          const toolbar = $('#cs-tool-defaults .cs-numbered-marker-toolbar')
          await expect(toolbar).toBeDisplayed()
          const layout = await browser.execute(() => {
            const panel = document.querySelector<HTMLElement>('#cs-tool-defaults')!
            const rect = panel.getBoundingClientRect()
            return {
              overflow: panel.scrollWidth > panel.clientWidth,
              left: rect.left, right: rect.right, width: innerWidth,
            }
          })
          expect(layout.overflow).toBe(false)
          expect(layout.left).toBeGreaterThanOrEqual(0)
          expect(layout.right).toBeLessThanOrEqual(layout.width)
          await browser.saveScreenshot(path.join(output, `${locale}-${theme}-${width}.png`))
          await browser.keys('Escape')
        }
      }
    }
  })
})
