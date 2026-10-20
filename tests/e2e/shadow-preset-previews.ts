import {
  browser,
  expect,
} from '@wdio/globals'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  readFile,
  writeFile,
} from 'node:fs/promises'

export async function verifyShadowPresetPreviews(path: string): Promise<void> {
  const geometry = await browser.execute(() => ({
    width: innerWidth,
    samples: [...document.querySelectorAll<HTMLElement>('.cs-card-shadow-presets button')].map((button) => {
      const card = button.querySelector('.cs-card-shadow-sample')!.getBoundingClientRect()
      const floor = button.querySelector('.cs-card-shadow-preview')!.getBoundingClientRect()
      return { x: card.left + card.width / 2, y: card.bottom + 4,
        width: card.width, height: card.height,
        floorWidth: floor.width, floorHeight: floor.height,
        cardInside: card.left >= floor.left && card.right <= floor.right && card.top >= floor.top }
    }),
  }))
  expect(geometry.samples).toHaveLength(4)
  expect(geometry.samples.every((sample) =>
    sample.cardInside && sample.width === 32 && sample.height === 22)).toBe(true)
  const screenshot = `${path}.png`
  await browser.saveScreenshot(screenshot)
  const image = await loadImage(await readFile(screenshot))
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const scale = image.width / geometry.width
  const luminances = geometry.samples.map((sample) => {
    const pixel = context.getImageData(Math.round(sample.x * scale), Math.round(sample.y * scale), 1, 1).data
    return (pixel[0]! + pixel[1]! + pixel[2]!) / 3
  })
  expect(luminances[0]! - luminances[1]!).toBeGreaterThan(8)
  expect(luminances[1]! - luminances[2]!).toBeGreaterThan(8)
  expect(luminances[2]! - luminances[3]!).toBeGreaterThan(8)
  await writeFile(`${path}.json`, JSON.stringify({ ...geometry, luminances }, null, 2))
}
