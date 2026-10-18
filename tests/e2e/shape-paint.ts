import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import {
  drawShape,
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { setNumericInput } from './numeric-input'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyShapePaint(prefix: string): Promise<void> {
  await drawShape()
  const toolbar = $('.cs-selection-floating-toolbar .cs-shape-toolbar')
  await toolbar.$('[data-shape-control="fill"]').click()
  expect(await $$('.cs-shape-fill-options button').length).toBe(3)
  await $('.cs-shape-fill-options [data-fill-kind="none"]').click()
  await $('.cs-shape-fill-options [data-fill-kind="linearGradient"]').click()
  await waitForShapeAnimation()
  await $('.cs-gradient-track').click()
  expect(await $$('[data-gradient-stop]').length).toBe(3)
  await $('.cs-shape-gradient-editor button[aria-label="Violet"]').click()
  await setNumericInput($('input[aria-label="Stop opacity"]'), '55')
  await browser.keys('Enter')
  await setNumericInput($('input[aria-label="Stop position"]'), '35')
  await browser.keys('Enter')
  await setNumericInput($('input[aria-label="Angle"]'), '90')
  await browser.keys('Enter')
  await $('button[aria-label="Reverse gradient colours"]').click()
  const paint = (await shapeDocument()).layers.at(-1)!.payload.fill as {
    start: { x: number; y: number }
    end: { x: number; y: number }
    stops: { position: number; color: { alpha: number } }[]
  }
  expect(paint).toMatchObject({ kind: 'linearGradient', start: { y: 0 }, end: { y: 1 } })
  expect(paint.start.x).toBeCloseTo(0.5, 12)
  expect(paint.end.x).toBeCloseTo(0.5, 12)
  expect(paint.stops).toHaveLength(3)
  expect(paint.stops[1]).toMatchObject({ position: 0.65, color: { alpha: 0.55 } })
  await waitForStableCanvas()
  await browser.saveScreenshot(`${prefix}-gradient.png`)
  await browser.keys('Escape')
  await toolbar.$('[data-shape-control="stroke"]').click()
  await $('[data-stroke-style="dashed"]').click()
  await $('[data-stroke-style="dotted"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.stroke).toMatchObject({ style: 'dotted' })
  await browser.saveScreenshot(`${prefix}-stroke.png`)
  await browser.keys('Escape')
  await $('button[aria-label="Undo"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.stroke).toMatchObject({ style: 'dashed' })
  await $('button[aria-label="Redo"]').click()
  expect((await shapeDocument()).layers.at(-1)!.payload.stroke).toMatchObject({ style: 'dotted' })
  expect((await shapeDocument()).layers.at(-1)!.payload.fill).toEqual(paint)
}
