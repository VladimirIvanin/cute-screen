import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  m08Snapshot,
  m08VersionToken,
  openM08,
  chooseOption,
  canvasPoint,
  dragCanvas,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('maps new precision and text gestures through an applied non-origin crop', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()

    const cropTool = $('button[aria-label="Crop"]')
    await cropTool.click()
    await chooseOption('Preset', '1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.crop?.x === 60,
    )
    expect((await m08Snapshot()).document.crop).toEqual({
      x: 60,
      y: 0,
      width: 300,
      height: 300,
    })
    await $('button[aria-label="Select"]').click()
    const croppedSurface = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      const surface = document.querySelector<HTMLElement>('.cs-canvas-surface')
      if (!scene || !surface)
        throw new Error('Cropped canvas surface is missing')
      const bounds = surface.getBoundingClientRect()
      return {
        intrinsicWidth: scene.width,
        intrinsicHeight: scene.height,
        cssWidth: bounds.width,
        cssHeight: bounds.height,
      }
    })
    expect(croppedSurface.intrinsicWidth).toBe(300)
    expect(croppedSurface.intrinsicHeight).toBe(300)
    expect(croppedSurface.cssWidth / croppedSurface.cssHeight).toBeCloseTo(1, 4)

    await $('button[aria-label="Hide data"]').click()
    const censorGesture = await dragCanvas(
      { x: 30, y: 30 },
      { x: 120, y: 100 },
      'm08-cropped-censor',
    )
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.kind === 'censor',
    )
    const censor = (await m08Snapshot()).document.layers.at(-1)!
    expect(censor.payload).toMatchObject({ region: { kind: 'rectangle' } })
    expect(censor.transform.translateX).toBeCloseTo(
      60 + censorGesture.start.canvasX,
      5,
    )
    expect(censor.transform.translateY).toBeCloseTo(
      censorGesture.start.canvasY,
      5,
    )
    expect(censor.localBounds.width).toBeCloseTo(
      censorGesture.end.canvasX - censorGesture.start.canvasX,
      5,
    )
    expect(censor.localBounds.height).toBeCloseTo(
      censorGesture.end.canvasY - censorGesture.start.canvasY,
      5,
    )

    await $('button[aria-label="Ruler"]').click()
    const rulerGesture = await dragCanvas(
      { x: 10, y: 200 },
      { x: 210, y: 200 },
      'm08-cropped-ruler',
    )
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.kind === 'ruler',
    )
    const ruler = (await m08Snapshot()).document.layers.at(-1)!
    const rulerStart = ruler.payload.start as {
      readonly x: number
      readonly y: number
    }
    const rulerEnd = ruler.payload.end as {
      readonly x: number
      readonly y: number
    }
    expect(ruler.transform.translateX + rulerStart.x).toBeCloseTo(
      60 + rulerGesture.start.canvasX,
      5,
    )
    expect(ruler.transform.translateY + rulerStart.y).toBeCloseTo(
      rulerGesture.start.canvasY,
      5,
    )
    expect(ruler.transform.translateX + rulerEnd.x).toBeCloseTo(
      60 + rulerGesture.end.canvasX,
      5,
    )
    expect(ruler.transform.translateY + rulerEnd.y).toBeCloseTo(
      rulerGesture.end.canvasY,
      5,
    )

    await $('button[aria-label="Eyedropper"]').click()
    const sample = await canvasPoint(20, 20)
    await browser
      .action('pointer', { id: 'm08-cropped-eyedropper' })
      .move({ origin: 'viewport', x: sample.x, y: sample.y, duration: 0 })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await expect($('.cs-eyedropper-feedback')).toHaveText(
      'Colour selected: #273D5A',
    )

    await $('button[aria-label="Text"]').click()
    const textGesture = await dragCanvas(
      { x: 150, y: 120 },
      { x: 230, y: 120 },
      'm08-cropped-text',
    )
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await expect(editor).toExist()
    await editor.addValue('Cropped')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.layers.at(-1)?.kind === 'text',
    )
    const createdText = (await m08Snapshot()).document.layers.at(-1)!
    expect(createdText.transform.translateX).toBeCloseTo(
      60 + textGesture.start.canvasX,
      5,
    )
    expect(createdText.transform.translateY).toBeCloseTo(
      textGesture.start.canvasY,
      5,
    )

    await $('button[aria-label="Show layers"]').click()
    await $('button[aria-label="Select"]').click()
    await $(`[data-layer-id="${createdText.id}"] .cs-layer-select`).click()
    const textContentBefore = createdText.payload.content as {
      readonly spans: readonly unknown[]
    }
    const resizeStart = {
      x:
        createdText.transform.translateX +
        createdText.localBounds.x +
        createdText.localBounds.width -
        60,
      y:
        createdText.transform.translateY +
        createdText.localBounds.y +
        createdText.localBounds.height / 2,
    }
    const versionBeforeResize = await m08VersionToken()
    await dragCanvas(
      resizeStart,
      { x: resizeStart.x - 40, y: resizeStart.y },
      'm08-cropped-text-width-resize',
    )
    await browser.waitUntil(
      async () => (await m08VersionToken()) === versionBeforeResize + 1,
    )
    const resizedText = (await m08Snapshot()).document.layers.find(
      (candidate) => candidate.id === createdText.id,
    )!
    const resizedContent = resizedText.payload.content as {
      readonly wrap: string
      readonly fixedWidth: number
      readonly spans: readonly unknown[]
    }
    expect(resizedContent.wrap).toBe('fixedWidth')
    expect(resizedContent.fixedWidth).toBeLessThan(
      createdText.localBounds.width,
    )
    expect(resizedContent.spans).toEqual(textContentBefore.spans)
    expect(resizedText.localBounds.height).toBeGreaterThan(
      createdText.localBounds.height,
    )
    expect(resizedText.transform.scaleX).toBe(1)
    expect(resizedText.transform.scaleY).toBe(1)
  })
})
