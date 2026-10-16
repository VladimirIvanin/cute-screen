import { waitForStableCanvas } from './canvas-ready'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

export async function verifyCropCursors(
  crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): Promise<void> {
  await waitForStableCanvas()
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  const { x, y, width, height } = crop
  const points = [
    [x, y, 'nwse-resize'],
    [x + width / 2, y, 'ns-resize'],
    [x + width, y, 'nesw-resize'],
    [x + width, y + height / 2, 'ew-resize'],
    [x + width, y + height, 'nwse-resize'],
    [x + width / 2, y + height, 'ns-resize'],
    [x, y + height, 'nesw-resize'],
    [x, y + height / 2, 'ew-resize'],
    [x + width / 2, y + height / 2, 'move'],
  ] as const
  for (const [canvasX, canvasY, cursor] of points) {
    const client = await browser.execute(({ canvasX, canvasY }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const rect = canvas.getBoundingClientRect()
      const state = window as typeof window & {
        __cuteScreenE2eM08?: { snapshot(): { document: { canvas: { width: number; height: number } } } | undefined }
      }
      const dimensions = state.__cuteScreenE2eM08?.snapshot()?.document.canvas
      if (!dimensions) throw new Error('Crop document dimensions are unavailable')
      // Dense preview backing dimensions include zoom/DPR and are not document pixels.
      const x = rect.left + canvasX / dimensions.width * rect.width
      const y = rect.top + canvasY / dimensions.height * rect.height
      return {
        x: Math.round(Math.max(rect.left + 2, Math.min(rect.right - 2, x))),
        y: Math.round(Math.max(rect.top + 2, Math.min(rect.bottom - 2, y))),
      }
    }, { canvasX, canvasY })
    await browser.action('pointer').move({ origin: 'viewport', ...client }).perform()
    await expect(scene).toHaveStyle({ cursor })
  }
}
