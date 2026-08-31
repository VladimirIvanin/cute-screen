import { $, $$, browser, expect } from '@wdio/globals'
import path from 'node:path'
import {
  chooseArrowConfigureOption,
  openArrowConfigurePopover,
} from '../arrow-toolbar'
import {
  snapshot,
  openDrawingHarness,
  setShellPreferences,
  arrowHandleViewportPoint,
} from './browser-m06-test-kit'

describe('M06 drawing tools in browser mode', () => {
  it('shows all five arrow controls without toolbar overflow across the supported UI matrix', async () => {
    const sizes = [
      { width: 1600, height: 1000 },
      { width: 1280, height: 720 },
      { width: 1024, height: 700 },
    ] as const
    const preferences = [
      { locale: 'en', theme: 'light' },
      { locale: 'en', theme: 'dark' },
      { locale: 'ru', theme: 'light' },
      { locale: 'ru', theme: 'dark' },
    ] as const

    for (const size of sizes) {
      await browser.setWindowSize(size.width, size.height)
      await openDrawingHarness()
      await $('button[aria-label="Arrow"]').click()
      for (const preference of preferences) {
        await setShellPreferences(preference.locale, preference.theme)
        await openArrowConfigurePopover()
        const layout = await browser.execute(() => {
          const toolbar = document.querySelector<HTMLElement>(
            '.cs-tool-configure-popover-host',
          )
          const controls = toolbar?.querySelector<HTMLElement>(
            '.cs-arrow-formatting-toolbar',
          )
          if (!toolbar || !controls) throw new Error('Arrow toolbar is missing')
          const bounds = toolbar.getBoundingClientRect()
          const controlIds = [
            ...controls.querySelectorAll<HTMLElement>('[data-control]'),
          ].map((control) => control.dataset.control)
          const observable = [
            ...controls.querySelectorAll<HTMLElement>(
              '.cs-arrow-toolbar-trigger, .cs-color-more--compact',
            ),
          ].filter((control) => {
            const rect = control.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          return {
            controlIds,
            observableCount: observable.length,
            observableLabels: observable.map((control) =>
              control.getAttribute('aria-label'),
            ),
            controlsClientWidth: controls.clientWidth,
            controlsScrollWidth: controls.scrollWidth,
            controlsFit: controls.scrollWidth <= controls.clientWidth,
            toolbarFits:
              bounds.left >= 0 &&
              bounds.right <= window.innerWidth &&
              bounds.top >= 0 &&
              bounds.bottom <= window.innerHeight,
            documentFits:
              document.documentElement.scrollWidth <= window.innerWidth,
          }
        })
        expect({ size, preference, ...layout }).toEqual({
          size,
          preference,
          controlIds: ['color', 'stroke', 'startCap', 'arrowPath', 'endCap'],
          observableCount: 5,
          observableLabels:
            preference.locale === 'ru'
              ? [
                  'Цвет: #E5484D',
                  'Линия: 3 px',
                  'Хвост: Нет',
                  'Геометрия: Прямая',
                  'Наконечник: Заполненная стрелка',
                ]
              : [
                  'Color: #E5484D',
                  'Stroke: 3 px',
                  'Tail: None',
                  'Geometry: Straight',
                  'Head: Solid arrow',
                ],
          controlsClientWidth: layout.controlsClientWidth,
          controlsScrollWidth: layout.controlsClientWidth,
          controlsFit: true,
          toolbarFits: true,
          documentFits: true,
        })
        await browser.saveScreenshot(
          path.resolve(
            `artifacts/browser-e2e/arrow-toolbar-${size.width}x${size.height}-${preference.locale}-${preference.theme}.png`,
          ),
        )
        await browser.execute(() => {
          document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
          )
        })
      }
    }
  })

  it('decodes an EXIF-rotated JPEG with the display dimensions published by native import', async () => {
    await browser.url('/')
    const dimensions = await browser.execute(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 3
      canvas.height = 2
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas2D is unavailable')
      context.fillStyle = '#123456'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const raw = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('JPEG encode failed')),
          'image/jpeg',
        )
      })
      const encoded = new Uint8Array(await raw.arrayBuffer())
      const exif = new Uint8Array([
        0x45,
        0x78,
        0x69,
        0x66,
        0,
        0, // EXIF marker
        0x4d,
        0x4d,
        0,
        42,
        0,
        0,
        0,
        8, // TIFF header and IFD offset
        0,
        1, // one IFD entry
        1,
        0x12,
        0,
        3,
        0,
        0,
        0,
        1,
        0,
        6,
        0,
        0, // Rotate90
        0,
        0,
        0,
        0, // no next IFD
      ])
      const oriented = new Uint8Array(encoded.length + exif.length + 4)
      oriented.set(encoded.subarray(0, 2))
      oriented.set([0xff, 0xe1, 0, exif.length + 2], 2)
      oriented.set(exif, 6)
      oriented.set(encoded.subarray(2), exif.length + 6)
      const url = URL.createObjectURL(
        new Blob([oriented], { type: 'image/jpeg' }),
      )
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      } finally {
        URL.revokeObjectURL(url)
      }
    })

    expect(dimensions).toEqual({ width: 2, height: 3 })
  })

  it('commits two arrow gestures without changing the active tool and cancels a draft', async () => {
    await openDrawingHarness()
    const arrowTool = $('button[aria-label="Arrow"]')
    await arrowTool.click()
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')

    await browser
      .action('pointer')
      .move({ origin: scene, x: 12, y: 12, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 68, y: 12, duration: 50 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)

    await browser
      .action('pointer')
      .move({ origin: scene, x: 12, y: 40, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 68, y: 0, duration: 50 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => (await snapshot()).layers.length === 6)
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true')

    await browser
      .action('pointer')
      .move({ origin: scene, x: 12, y: 70, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 68, y: 0, duration: 50 })
      .cancel()
      .perform()
    expect((await snapshot()).layers).toHaveLength(6)
  })

  it('keeps a new elbow unselected, drags its middle segment once, and restores it through undo/redo', async () => {
    await browser.setWindowSize(1280, 720)
    await openDrawingHarness()
    await $('button[aria-label="Show layers"]').click()
    const arrowTool = $('button[aria-label="Arrow"]')
    await arrowTool.click()
    await openArrowConfigurePopover()
    await chooseArrowConfigureOption('arrowPath', 'Elbow')
    await browser.execute(() => {
      document.body.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      )
    })
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const beforeCount = (await snapshot()).layers.length
    await browser
      .action('pointer')
      .move({ origin: scene, x: -52, y: -18, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 104, y: 36, duration: 80 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(
      async () => (await snapshot()).layers.length === beforeCount + 1,
    )
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true')
    expect(await $$('.cs-layer-row.is-selected').length).toBe(0)

    const created = (await snapshot()).layers.at(-1)!
    expect(created.payload?.path).toBe('elbow')
    const originalOffset = (created.payload?.elbow as { offset: number }).offset
    await $('button[aria-label="Select"]').click()
    const handle = await arrowHandleViewportPoint(created)
    await browser
      .action('pointer')
      .move({ origin: 'viewport', x: handle.x, y: handle.y, duration: 0 })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(
      async () => (await $$('.cs-layer-row.is-selected').length) === 1,
    )
    await browser
      .action('pointer')
      .move({ origin: 'viewport', x: handle.x, y: handle.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 22, y: 0, duration: 80 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => {
      const arrow = (await snapshot()).layers.at(-1)
      return (
        (arrow?.payload?.elbow as { offset?: number } | undefined)?.offset !==
        originalOffset
      )
    })
    const draggedOffset = (
      (await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number }
    ).offset

    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(
      async () =>
        ((await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number })
          .offset === originalOffset,
    )
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(
      async () =>
        ((await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number })
          .offset === draggedOffset,
    )
  })
})
