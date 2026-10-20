import { readFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('hand-drawn annotations after native relaunch', () => {
  it('restores the seed, version and appearance of both annotations', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const layers = (await shapeDocument()).layers
    const previous = JSON.parse(await readFile('artifacts/tauri-e2e/hand-drawn-document.json', 'utf8')) as { layers: { id: string; payload: Record<string, unknown> }[] }
    for (const saved of previous.layers.filter((layer) => layer.payload.sketchSeed)) {
      expect(layers.find((layer) => layer.id === saved.id)?.payload).toEqual(saved.payload)
    }

    const shape = layers.find((layer) => layer.kind === 'shape' && layer.payload.shape === 'circling')!
    const arrow = layers.find((layer) => layer.kind === 'arrow' && layer.payload.appearance === 'handDrawn')!
    expect(layers.some((layer) => layer.payload.shape === 'rectangularCircling')).toBe(true)
    expect(shape.payload).toMatchObject({ fill: { kind: 'none' }, sketchVersion: 1 })
    expect(arrow.payload.sketchVersion).toBe(1)
    expect(Number(shape.payload.sketchSeed)).toBeGreaterThan(0)
    expect(Number(arrow.payload.sketchSeed)).toBeGreaterThan(0)
    await $('button[aria-label="Arrow"]').click()
    await $('.cs-tool-defaults-toolbar [data-control="stroke"] .cs-arrow-toolbar-trigger').click()
    await expect($('.cs-arrow-toolbar-popover').$('button=Hand-drawn')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/hand-drawn-reopened.png')
  }).timeout(120000)
})
