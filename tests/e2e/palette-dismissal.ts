import {
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Start observing before real input, including the first leave frame. */
export async function verifyPaletteDismissal(
  directory: string,
  prefix: string,
  action: () => Promise<unknown>,
): Promise<void> {
  if (prefix.endsWith('-preset')) {
    const layout = await browser.execute(() => {
      const panel = document.querySelector<HTMLElement>('.cs-simple-color-panel:not(.is-embedded)')!
      const dots = [...panel.querySelectorAll<HTMLElement>('.cs-simple-color-grid .cs-simple-color-dot')]
        .map((dot) => dot.getBoundingClientRect())
      const rows = dots.reduce<Record<string, number>>((counts, rect) => {
        const row = String(Math.round(rect.top))
        counts[row] = (counts[row] ?? 0) + 1
        return counts
      }, {})
      const gaps = dots.slice(1).flatMap((rect, index) =>
        Math.abs(rect.top - dots[index]!.top) < 1 ? [rect.left - dots[index]!.right] : [])
      const custom = panel.querySelector('.cs-simple-color-custom .cs-simple-color-dot')!.getBoundingClientRect()
      const bounds = panel.getBoundingClientRect()
      return {
        rows: Object.values(rows),
        minimumGap: Math.min(...gaps),
        customGap: custom.left - Math.max(...dots.map((rect) => rect.right)),
        fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
      }
    })
    expect(layout.rows).toEqual(prefix.startsWith('arrow') ? [10, 10] : [8])
    expect(layout.minimumGap).toBeGreaterThanOrEqual(8)
    expect(layout.customGap).toBeGreaterThanOrEqual(12)
    expect(layout.fits).toBe(true)
    await writeFile(path.resolve(directory, `${prefix}-palette-layout.json`), JSON.stringify(layout, null, 2))
    await browser.saveScreenshot(path.resolve(directory, `${prefix}-palette-open.png`))
  }
  await browser.execute(() => {
    const panel = document.querySelector<HTMLElement>('.cs-simple-color-panel:not(.is-embedded)')!
    if (!panel) throw new Error('Open colour palette is missing')
    const initial = panel.getBoundingClientRect()
    const state = window as typeof window & {
      __paletteDismissal?: Promise<{
        initial: { left: number; top: number }
        frames: { left: number; top: number }[]
        closed: boolean
      }>
    }
    state.__paletteDismissal = new Promise((resolve) => {
      const frames: { left: number; top: number }[] = []
      const start = performance.now()
      // Object methods avoid the transpiler's external __name helper when
      // tauri-service serializes this callback into a different WebView.
      const sampler = {
        tick(): void {
          const rect = panel.getBoundingClientRect()
          const closed = !panel.isConnected || !panel.getClientRects().length
          if (!closed) frames.push({ left: rect.left, top: rect.top })
          if (closed || performance.now() - start > 1500) {
            resolve({ initial: { left: initial.left, top: initial.top }, frames, closed })
            return
          }
          requestAnimationFrame(() => sampler.tick())
        },
      }
      sampler.tick()
    })
  })
  await action()
  const result = await browser.execute(async () => {
    const state = window as typeof window & {
      __paletteDismissal?: Promise<{
        initial: { left: number; top: number }
        frames: { left: number; top: number }[]
        closed: boolean
      }>
    }
    return state.__paletteDismissal!
  })
  await writeFile(path.resolve(directory, `${prefix}-palette-dismissal.json`), JSON.stringify(result, null, 2))
  expect(result.closed).toBe(true)
  expect(result.frames.length).toBeGreaterThan(1)
  // Naive UI scales the panel slightly around its transform origin while fading.
  // A coordinate reset would instead move it hundreds of pixels to the viewport origin.
  expect(Math.max(...result.frames.map((frame) => Math.hypot(
    frame.left - result.initial.left,
    frame.top - result.initial.top,
  )))).toBeLessThan(32)
}
