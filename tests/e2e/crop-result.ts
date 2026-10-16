import {
  $,
  browser,
  expect,
} from '@wdio/globals'

/** Assert the visible result before any follow-up click can hide a crop-mode bug. */
export async function expectCommittedCrop(
  width: number,
  height: number,
): Promise<void> {
  await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
  await expect($('.cs-context-toolbar--crop')).not.toExist()
  await browser.waitUntil(() => browser.execute((ratio) => {
    const surface = document.querySelector<HTMLElement>('.cs-canvas-surface')
    const overlay = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')
    if (!surface || !overlay) return false
    const bounds = surface.getBoundingClientRect()
    const data = overlay.getContext('2d')?.getImageData(0, 0, overlay.width, overlay.height).data
    if (!data || Math.abs(bounds.width / bounds.height - ratio) > 0.001) return false
    // CropController's full-canvas shade must disappear, including with annotations present.
    for (let index = 0; index < data.length; index += 4) {
      if (
        Math.abs(data[index]! - 8) <= 1 &&
        Math.abs(data[index + 1]! - 12) <= 1 &&
        Math.abs(data[index + 2]! - 18) <= 1 &&
        data[index + 3] === 148
      ) return false
    }
    return true
  }, width / height), { timeoutMsg: 'Applied crop is not visible or its dimming overlay remains' })
}
