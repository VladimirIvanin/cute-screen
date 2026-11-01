import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import type {
  ArrowLayer,
  EditorDocumentV1,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'

async function currentDocument(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
    }
    return (state.__cuteScreenE2eQuick ?? state.__cuteScreenE2eM05)!.snapshot()
  })
}

/** Observe live pixels before pointerup; a saved document cannot prove a drag preview. */
export async function verifyTaperedInteractions(directory: string): Promise<void> {
  await $('.cs-selection-floating-toolbar [data-control="arrowPath"] button').click()
  await $('.cs-arrow-toolbar-popover button[aria-label="Elbow"]').click()
  await waitForStableCanvas()
  const samples: object[] = []
  for (const handle of ['start', 'end', 'elbow', 'rotate'] as const) {
    const doc = await currentDocument()
    const before = doc.layers.at(-1)! as ArrowLayer
    const points = await browser.execute(({ doc, layer, handle }) => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      const quick = Boolean(document.querySelector('.cs-quick-actions'))
      const output = quick ? { x: 0, y: 0, ...doc.canvas } : doc.crop ?? { x: 0, y: 0, ...doc.canvas }
      const sx = rect.width / output.width, sy = rect.height / output.height
      const p = layer.payload, b = layer.localBounds, t = layer.transform
      const local = handle === 'rotate' ? { x: b.x + b.width, y: b.y + b.height }
        : handle === 'elbow' ? p.elbow!.axis === 'x'
          ? { x: (p.start.x + p.end.x) / 2, y: (p.start.y + p.end.y) / 2 + p.elbow!.offset }
          : { x: (p.start.x + p.end.x) / 2 + p.elbow!.offset, y: (p.start.y + p.end.y) / 2 }
          : p[handle]
      const a = t.rotation * Math.PI / 180
      const world = { x: t.translateX + local.x * Math.cos(a) - local.y * Math.sin(a),
        y: t.translateY + local.x * Math.sin(a) + local.y * Math.cos(a) }
      const start = { x: Math.round(rect.left + (world.x - output.x) * sx),
        y: Math.round(rect.top + (world.y - output.y) * sy) }
      return { start, end: { x: start.x + (handle === 'rotate' ? -45 : 24), y: start.y + 28 } }
    }, { doc, layer: before, handle })
    await browser.action('pointer').move({ origin: 'viewport', ...points.start }).perform()
    if (handle === 'rotate') await expect($('.cs-canvas:not(.cs-canvas-overlay)')).toHaveElementClass('cs-canvas-rotate-cursor')
    await browser.action('pointer').move({ origin: 'viewport', ...points.start }).down({ button: 'left' })
      .move({ origin: 'viewport', ...points.end, duration: 450 }).perform(true)
    const live = await browser.execute(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
      const start = performance.now()
      const p = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let red = 0
      for (let i = 0; i < p.length; i += 4) if (
        p[i]! > 100 &&
        p[i + 1]! < 110 &&
        p[i + 2]! < 130 &&
        p[i + 3]! > 100
      ) red++
      return { red, readbackMs: performance.now() - start }
    })
    expect(live.red).toBeGreaterThan(100)
    expect((await currentDocument()).layers.at(-1)).toEqual(before)
    await browser.saveScreenshot(`${directory}/tapered-shadow-${handle}-live.png`)
    await browser.action('pointer').up({ button: 'left' }).perform()
    await browser.waitUntil(async () =>
      JSON.stringify((await currentDocument()).layers.at(-1)) !== JSON.stringify(before))
    const after = (await currentDocument()).layers.at(-1)
    await $('button[aria-label="Undo"]').click()
    expect((await currentDocument()).layers.at(-1)).toEqual(before)
    await browser.action('pointer').move({ origin: 'viewport', ...points.start }).down({ button: 'left' })
      .move({ origin: 'viewport', ...points.end, duration: 180 }).perform(true)
    await browser.keys('Escape')
    await browser.action('pointer').up({ button: 'left' }).perform()
    expect((await currentDocument()).layers.at(-1)).toEqual(before)
    await $('button[aria-label="Redo"]').click()
    expect((await currentDocument()).layers.at(-1)).toEqual(after)
    samples.push({ handle, ...live })
  }
  await writeFile(`${directory}/tapered-shadow-interactions.json`, JSON.stringify(samples, null, 2))
}
