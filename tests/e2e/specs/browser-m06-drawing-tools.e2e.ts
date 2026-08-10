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

describe('M06 drawing tools in browser mode', () => {
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
    await $('select[aria-label="Fill"]').selectByAttribute(
      'value',
      'linearGradient',
    )
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
})
