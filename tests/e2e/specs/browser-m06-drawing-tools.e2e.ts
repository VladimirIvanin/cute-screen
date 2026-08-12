import { $, browser, expect } from '@wdio/globals'

type HarnessSnapshot = {
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
    readonly opacity: number
    readonly blendMode?: string
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

describe('M06 drawing tools in browser mode', () => {
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
    await chooseOption('Preset', 'Neon')
    const preset = $('[role="combobox"][aria-label="Preset"]')
    await expect(preset).toHaveText('Neon')
    await expect($('[role="combobox"][aria-label="Shadow"]')).toHaveText('Neon')
    await chooseOption('Fill', 'Radial')
    await expect(preset).toHaveText('Custom')
    await chooseOption('Outline', 'White')
    await chooseOption('Underline', 'On')
    await chooseOption('Spacing', '2px')
    await chooseOption('Background', 'Blue')
    await chooseOption('Shadow', 'Drop')
    await chooseOption('Line height', '1.5Г—')
    const opacity = $(
      '.cs-context-toolbar [role="slider"][aria-label="Opacity"]',
    )
    await opacity.click()
    for (let index = 0; index < 8; index += 1) await browser.keys('ArrowLeft')
    await chooseOption('Blend', 'Screen')
    await $('button=Save personal preset').click()
    await chooseOption('Preset', 'Plain')
    await expect($('[role="combobox"][aria-label="Fill"]')).toHaveText('Solid')
    await chooseOption('Preset', 'My preset')
    await expect($('[role="combobox"][aria-label="Fill"]')).toHaveText('Radial')
    await expect($('[role="combobox"][aria-label="Shadow"]')).toHaveText('Drop')
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
      fill: {
        kind: 'solid',
        color: { red: 0.55, green: 0.78, blue: 1, alpha: 1 },
      },
      padding: 6,
      radius: 4,
    })
    expect(created?.payload?.fill).toMatchObject({ kind: 'radialGradient' })
    expect(created?.payload?.outline).toMatchObject({
      stroke: {
        color: { red: 1, green: 1, blue: 1, alpha: 1 },
        width: 2,
      },
      position: 'center',
    })
    expect(created).toMatchObject({
      opacity: 0.6,
      blendMode: 'screen',
      shadows: [
        {
          color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
          offsetX: 2,
          offsetY: 3,
          blur: 3,
        },
      ],
    })
    const paragraphs = (
      created?.payload?.content as
        | { readonly paragraphs?: readonly { readonly lineHeight?: number }[] }
        | undefined
    )?.paragraphs
    expect(paragraphs?.[0]).toMatchObject({ lineHeight: 1.5 })
    const spans = (
      created?.payload?.content as
        | {
            readonly spans?: readonly {
              readonly underline?: boolean
              readonly letterSpacing?: number
            }[]
          }
        | undefined
    )?.spans
    expect(spans?.[0]).toMatchObject({ underline: true, letterSpacing: 2 })
    await expect(textTool).toHaveAttribute('aria-pressed', 'true')
  })

  it('allocates numbered markers independently from layer order and keeps the tool active', async () => {
    await openDrawingHarness()
    const markerTool = $('button[aria-label="Numbered marker"]')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await markerTool.click()
    await chooseOption('Shape', 'diamond')
    await scene.click({ x: 24, y: 24 })
    await scene.click({ x: 72, y: 48 })
    await browser.waitUntil(async () => (await snapshot()).layers.length === 6)
    const markers = (await snapshot()).layers.filter(
      (layer) => layer.kind === 'numberedMarker',
    )
    expect(markers.map((layer) => layer.payload?.sequence)).toEqual([1, 2])
    expect(markers[0]?.payload?.shape).toBe('diamond')
    await expect(markerTool).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates a multiline callout with a separate renderer tail through the same overlay flow', async () => {
    await openDrawingHarness()
    const calloutTool = $('button[aria-label="Callout"]')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await calloutTool.click()
    await scene.click({ x: 42, y: 36 })
    const editor = $('[contenteditable="true"][aria-label="Callout editor"]')
    await expect(editor).toExist()
    await editor.addValue('First\nsecond')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === 5)
    expect((await snapshot()).layers.at(-1)).toMatchObject({
      kind: 'callout',
      payload: { content: { text: 'First\nsecond' } },
    })
    await expect(calloutTool).toHaveAttribute('aria-pressed', 'true')
  })
})
