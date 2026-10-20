import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import {
  lineDocument,
  lineDrag,
  lineOrigin,
} from './line'
import { chooseHandDrawn } from './hand-drawn'
import type {
  ArrowLayer,
  EditorDocumentV1,
} from '../../packages/editor-core/src'

function lineAt(
  document: EditorDocumentV1,
  index: number,
): ArrowLayer {
  const layer = document.layers[index]
  if (layer?.kind !== 'arrow' || layer.payload.annotationTool !== 'line')
    throw new Error('Expected a standalone line')
  return layer
}

export async function verifyHandDrawnLine(directory: string): Promise<void> {
  await $('.cs-toolrail [data-tool-id="line"]').click()
  await chooseHandDrawn('Hand-drawn', true)
  const before = (await lineDocument()).layers.length
  const origin = await lineOrigin()
  await lineDrag(origin.x, origin.y, 160, 35)
  await lineDrag(origin.x, origin.y + 70, 200, 25)
  let document = await lineDocument()
  const first = lineAt(document, before)
  const second = lineAt(document, before + 1)
  expect(first.payload).toMatchObject({ annotationTool: 'line', appearance: 'handDrawn',
    startCap: 'none', endCap: 'none', sketchVersion: 1 })
  expect(first.payload.sketchSeed).not.toBe(second.payload.sketchSeed)
  await expect($('.cs-toolrail [data-tool-id="line"]')).toHaveAttribute('aria-pressed', 'true')
  await browser.keys('v')
  await browser.action('pointer').move({ origin: 'viewport', x: origin.x + 1, y: origin.y + 1 })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
  await $('.cs-selection-floating-toolbar').waitForDisplayed()
  await chooseHandDrawn('Clean')
  expect(lineAt(await lineDocument(), before).payload).toMatchObject({ appearance: 'clean',
    sketchSeed: first.payload.sketchSeed })
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => lineAt(await lineDocument(), before).payload.appearance === 'handDrawn')
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () => lineAt(await lineDocument(), before).payload.appearance === 'clean')
  await chooseHandDrawn('Hand-drawn')
  document = await lineDocument()
  expect(lineAt(document, before).payload.sketchSeed).toBe(first.payload.sketchSeed)
  await writeFile(`${directory}/hand-drawn-line-document.json`, JSON.stringify(document, null, 2))
  await browser.saveScreenshot(`${directory}/hand-drawn-line.png`)
}
