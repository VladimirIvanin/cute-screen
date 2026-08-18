import { $, $$, browser, expect } from '@wdio/globals'
import path from 'node:path'

type HarnessSnapshot = {
  readonly canvas: { readonly width: number; readonly height: number }
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  } | null
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
    readonly opacity?: number
    readonly blendMode?: string
    readonly transform?: {
      readonly translateX: number
      readonly translateY: number
    }
    readonly payload?: Record<string, unknown>
  }[]
}

async function snapshot(): Promise<HarnessSnapshot> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: { snapshot(): HarnessSnapshot | undefined }
      }
    ).__cuteScreenE2eM05
    const document = harness?.snapshot()
    if (!document) throw new Error('M06 harness document is not ready')
    return document
  })
}

async function openDrawingHarness(): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url('/?m05=1')
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
}

async function chooseOption(
  controlName: string,
  optionName: string,
): Promise<void> {
  const control = $(`[role="combobox"][aria-label="${controlName}"]`)
  await browser.execute((name) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>('[role="combobox"]'),
    ].find((element) => element.getAttribute('aria-label') === name)
    if (!target) throw new Error(`Missing combobox: ${name}`)
    target.click()
  }, controlName)
  await browser.waitUntil(() =>
    browser.execute(
      (name) =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.cs-overlay-root [role="option"]',
          ),
        ].some((element) => {
          const text = element.textContent?.trim() ?? ''
          const numericName = name.replace(/[^0-9.]/g, '')
          return (
            text === name ||
            (numericName !== '' && text.startsWith(numericName))
          )
        }),
      optionName,
    ),
  )
  await browser.execute((name) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>(
        '.cs-overlay-root [role="option"]',
      ),
    ].find((element) => {
      const text = element.textContent?.trim() ?? ''
      const numericName = name.replace(/[^0-9.]/g, '')
      return (
        text === name || (numericName !== '' && text.startsWith(numericName))
      )
    })
    if (!target) throw new Error(`Missing select option: ${name}`)
    target.click()
  }, optionName)
  await control.waitForExist()
}

async function setShellPreferences(
  locale: 'en' | 'ru',
  theme: 'light' | 'dark',
): Promise<void> {
  const currentLocale = await browser.execute(
    () => document.documentElement.lang,
  )
  if (currentLocale !== locale) {
    await $(
      `button[aria-label="${currentLocale === 'ru' ? 'Другие действия' : 'More actions'}"]`,
    ).click()
    await $(`button=${locale === 'ru' ? 'RU' : 'EN'}`).click()
  }
  const currentTheme = await browser.execute(
    () => document.documentElement.dataset.theme,
  )
  if (currentTheme !== theme) {
    await $(
      `button[aria-label="${locale === 'ru' ? 'Другие действия' : 'More actions'}"]`,
    ).click()
    await $(
      `button=${
        locale === 'ru'
          ? theme === 'light'
            ? 'Светлая'
            : 'Тёмная'
          : theme === 'light'
            ? 'Light'
            : 'Dark'
      }`,
    ).click()
  }
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.documentElement.lang)) === locale &&
      (await browser.execute(() => document.documentElement.dataset.theme)) ===
        theme,
  )
}

async function chooseArrowPopover(
  control: 'arrowPath',
  option: 'Elbow',
): Promise<void> {
  await openArrowConfigurePopover()
  await $(
    `.cs-tool-configure-popover-host [data-control="${control}"] .cs-arrow-toolbar-trigger`,
  ).click()
  await $(`button=${option}`).click()
  await browser.execute(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
  })
}

async function arrowHandleViewportPoint(
  arrow: HarnessSnapshot['layers'][number],
): Promise<Readonly<{ x: number; y: number }>> {
  const harnessDocument = await snapshot()
  const outputBounds = harnessDocument.crop ?? {
    x: 0,
    y: 0,
    width: harnessDocument.canvas.width,
    height: harnessDocument.canvas.height,
  }
  const payload = arrow.payload
  const start = payload?.start as { x: number; y: number }
  const end = payload?.end as { x: number; y: number }
  const transform = arrow.transform as
    { translateX: number; translateY: number } | undefined
  const elbow = payload?.elbow as { axis: 'x' | 'y'; offset: number }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const local =
    elbow.axis === 'x'
      ? { x: midpoint.x, y: midpoint.y + elbow.offset }
      : { x: midpoint.x + elbow.offset, y: midpoint.y }
  return browser.execute(
    ({ x, y, translateX, translateY, outputX, outputY }) => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is missing')
      const bounds = scene.getBoundingClientRect()
      return {
        x: Math.round(
          bounds.left +
            ((translateX + x - outputX) / scene.width) * bounds.width,
        ),
        y: Math.round(
          bounds.top +
            ((translateY + y - outputY) / scene.height) * bounds.height,
        ),
      }
    },
    {
      x: local.x,
      y: local.y,
      translateX: transform?.translateX ?? 0,
      translateY: transform?.translateY ?? 0,
      outputX: outputBounds.x,
      outputY: outputBounds.y,
    },
  )
}

async function openArrowConfigurePopover(): Promise<void> {
  await browser.execute(() => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Arrow"], button[aria-label="Стрелка"]',
    )
    if (!button) throw new Error('Arrow tool button is missing')
    button.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
  })
  await expect($('.cs-tool-configure-popover-host')).toExist()
}

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
    await chooseArrowPopover('arrowPath', 'Elbow')
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

  it('creates shape, pencil and marker layers through real pointer gestures', async () => {
    await openDrawingHarness()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const draw = async (label: string, y: number): Promise<void> => {
      const before = (await snapshot()).layers.length
      await $(`button[aria-label="${label}"]`).click()
      await browser
        .action('pointer')
        .move({ origin: scene, x: 12, y, duration: 0 })
        .down({ button: 'left' })
        .move({ origin: 'pointer', x: 55, y: 16, duration: 50 })
        .move({ origin: 'pointer', x: 8, y: 6, duration: 50 })
        .up({ button: 'left' })
        .perform()
      await browser.waitUntil(
        async () => (await snapshot()).layers.length === before + 1,
      )
    }

    await draw('Shape', 12)
    await draw('Pencil', 48)
    await draw('Marker', 82)

    expect(
      (await snapshot()).layers.slice(-3).map((layer) => layer.kind),
    ).toEqual(['shape', 'pencil', 'marker'])
  })

  it('persists a gradient fill through the contextual tool defaults', async () => {
    await openDrawingHarness()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await $('button[aria-label="Shape"]').click()
    await chooseOption('Fill', 'Linear gradient')
    await browser
      .action('pointer')
      .move({ origin: scene, x: 20, y: 20, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 60, y: 30, duration: 50 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)

    const created = (await snapshot()).layers.at(-1)
    expect(created?.payload?.fill).toMatchObject({ kind: 'linearGradient' })
  })

  it('commits multiline direct text once and preserves the tool', async () => {
    await openDrawingHarness()
    const textTool = $('button[aria-label="Text"]')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await textTool.click()
    await expect($('.cs-text-toolbar')).toHaveAttribute('aria-label', 'Text')
    await $('select[aria-label="Font family"]').selectByVisibleText('Georgia')
    await $('button[aria-label="Font size"]').click()
    await $('button=32').click()
    await $('button[aria-label="Bold"]').click()
    await browser.execute(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Text color"]',
      )
      if (!input) throw new Error('Text color input is missing')
      input.value = '#336699'
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await $('button[aria-label="Background"]').click()
    await browser.execute(() => {
      const color = document.querySelector<HTMLInputElement>(
        'input[aria-label="Background Text color"]',
      )
      const inputs = [
        ...document.querySelectorAll<HTMLInputElement>(
          '.cs-text-background-popover input[type="number"]',
        ),
      ]
      if (!color || inputs.length !== 2)
        throw new Error('Text background controls are missing')
      color.value = '#fff2a8'
      color.dispatchEvent(new Event('input', { bubbles: true }))
      inputs[0]!.value = '6'
      inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }))
      inputs[1]!.value = '4'
      inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await $('.cs-text-background-popover').$('button=Apply').click()
    await scene.click({ x: 24, y: 24 })
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Привет\nworld')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    const created = (await snapshot()).layers.at(-1)
    expect(created).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Привет\nworld' } },
    })
    expect(created?.payload?.background).toMatchObject({
      padding: 6,
      radius: 4,
    })
    const background = created?.payload?.background as {
      readonly color: {
        readonly red: number
        readonly green: number
        readonly blue: number
        readonly alpha: number
      }
    }
    expect(background.color.red).toBeCloseTo(1)
    expect(background.color.green).toBeCloseTo(242 / 255)
    expect(background.color.blue).toBeCloseTo(168 / 255)
    expect(background.color.alpha).toBeCloseTo(1)
    const spans = (
      created?.payload?.content as
        | {
            readonly spans?: readonly {
              readonly fontFamily?: string
              readonly fontSize?: number
              readonly weight?: number
              readonly color?: Record<string, number>
            }[]
          }
        | undefined
    )?.spans
    expect(spans?.[0]).toMatchObject({
      fontFamily: 'Georgia',
      fontSize: 32,
      weight: 700,
      color: {
        red: 0.2,
        green: 0.4,
        blue: 0.6,
        alpha: 1,
      },
    })
    expect(created).not.toHaveProperty('opacity')
    expect(created).not.toHaveProperty('blendMode')
    expect(created).not.toHaveProperty('shadows')
    await expect(textTool).toHaveAttribute('aria-pressed', 'true')
  })

  it('allocates numbered markers independently from layer order and keeps the tool active', async () => {
    await openDrawingHarness()
    const markerTool = $('button[aria-label="Numbered marker"]')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await markerTool.click()
    await scene.click({ x: 24, y: 24 })
    await scene.click({ x: 72, y: 48 })
    await browser.waitUntil(async () => (await snapshot()).layers.length === 6)
    const markers = (await snapshot()).layers.filter(
      (layer) => layer.kind === 'numberedMarker',
    )
    expect(markers.map((layer) => layer.payload?.sequence)).toEqual([1, 2])
    expect(markers[0]?.payload?.badge).toMatchObject({ shape: 'circle' })
    await expect(markerTool).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates a multiline callout through drag target→label and preserves the active tool', async () => {
    await openDrawingHarness()
    const calloutTool = $('button[aria-label="Callout"]')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await calloutTool.click()
    await browser
      .action('pointer')
      .move({ origin: scene, x: -52, y: -18, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 104, y: 36, duration: 80 })
      .up({ button: 'left' })
      .perform()
    const editor = $('[contenteditable="true"][aria-label="Callout editor"]')
    await expect(editor).toExist()
    await editor.addValue('First\nsecond')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect((await snapshot()).layers.at(-1)).toMatchObject({
      kind: 'callout',
      payload: {
        content: { text: 'First\nsecond' },
        targetMarker: 'circle',
        labelMarker: 'circle',
      },
    })
    await expect(calloutTool).toHaveAttribute('aria-pressed', 'true')
  })
})
