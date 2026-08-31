import { $, browser, expect } from '@wdio/globals'
import {
  snapshot,
  openDrawingHarness,
  chooseOption,
} from './browser-m06-test-kit'

describe('M06 drawing tools in browser mode', () => {
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
