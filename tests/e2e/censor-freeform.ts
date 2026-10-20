import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { blurDocument } from './blur-optimization'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyFreeformCensor(directory: string): Promise<void> {
  const results = []
  for (const [index, label] of ['Solid fill', 'Blur', 'Pixelate'].entries()) {
    await $('[data-tool-id="censor"]').click()
    await $('.cs-censor-region').click()
    await $('.cs-censor-region-choice*=Freeform outline').click()
    await $(`.cs-censor-effect[aria-label="${label}"]`).click()
    await waitForStableCanvas()
    const before = await blurDocument()
    const rect = await browser.execute(() =>
      document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    // Crossed lobes, then explicit return to the start. Signed area is zero.
    const points = [[.2, .25], [.45, .4], [.2, .4], [.45, .25], [.2, .25]] as const
    const at = (point: readonly [number, number]) => ({
      x: Math.round(rect.left + rect.width * (point[0] + index * .1)),
      y: Math.round(rect.top + rect.height * (point[1] + index * .12)),
    })
    await browser.execute(() => {
      document.addEventListener('pointerdown', (event) => {
        document.documentElement.dataset.freeformTrusted = String(event.isTrusted)
      }, { once: true, capture: true })
    })
    const action = browser.action('pointer').move({ origin: 'viewport', ...at(points[0]) }).down({ button: 'left' })
    for (const point of points.slice(1)) action.move({ origin: 'viewport', ...at(point), duration: 100 })
    await action.up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await blurDocument()).layers.length === before.layers.length + 1)
    await waitForStableCanvas()
    const after = await blurDocument()
    const layer = after.layers.at(-1)!
    expect(layer.kind).toBe('censor')
    if (layer.kind !== 'censor') throw new Error('Expected a committed censor')
    expect(layer.payload.region.kind).toBe('freeform')
    expect(layer.payload.effect.mode).toBe(['solid', 'blur', 'pixelate'][index])
    expect(await $('html').getAttribute('data-freeform-trusted')).toBe('true')
    expect(await $('body').getText()).not.toContain('must be a simple polygon')
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await blurDocument()).layers.length === before.layers.length)
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () => JSON.stringify((await blurDocument()).layers) === JSON.stringify(after.layers))
    results.push({ label, layer })
  }
  await writeFile(`${directory}/freeform.json`, JSON.stringify(results, null, 2))
  await browser.saveScreenshot(`${directory}/freeform.png`)
}
