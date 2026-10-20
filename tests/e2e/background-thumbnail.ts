import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'

export async function verifyBackgroundThumbnail(
  width: number,
  height: number,
  directory: string,
): Promise<void> {
  const preview = $('.cs-card-image-source canvas[role="img"]')
  await expect(preview).toBeDisplayed()
  await expect($('.cs-card-image-info > span')).toHaveText(`${width} × ${height} · PNG`)
  await expect($('.cs-card-image-info button')).toBeEnabled()
  await browser.waitUntil(() => browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-card-image-source canvas')!
    return canvas.getContext('2d')!.getImageData(80, 60, 1, 1).data[3]! > 0
  }))
  const measured = await browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-card-image-source canvas')!
    const context = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const panel = document.querySelector('.cs-composition-body')!
    return { width: rect.width, height: rect.height,
      centerAlpha: context.getImageData(80, 60, 1, 1).data[3]!,
      leftAlpha: context.getImageData(4, 60, 1, 1).data[3]!,
      overflow: panel.scrollWidth > panel.clientWidth }
  })
  expect(measured.width).toBe(80)
  expect(measured.height).toBe(60)
  expect(measured.overflow).toBe(false)
  if (width === height) {
    expect(measured.centerAlpha).toBeGreaterThanOrEqual(62)
    expect(measured.centerAlpha).toBeLessThanOrEqual(66)
    expect(measured.leftAlpha).toBe(0)
  } else {
    expect(measured.centerAlpha).toBe(255)
    expect(measured.leftAlpha).toBe(255)
  }
  await writeFile(`${directory}/background-thumbnail-${width}.json`, JSON.stringify(measured, null, 2))
  await browser.saveScreenshot(`${directory}/background-thumbnail-${width}.png`)
}
