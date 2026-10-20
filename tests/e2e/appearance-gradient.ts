import {
  $,
  browser,
  expect,
} from '@wdio/globals'

export async function verifyAppearanceGradientDrag(
  stops: () => Promise<readonly { position: number }[]>,
): Promise<void> {
  const track = $('.cs-composition-panel .cs-gradient-track')
  await track.scrollIntoView({ block: 'center' })
  const rectangles = await browser.execute(() => {
    const track = document.querySelector('.cs-composition-panel .cs-gradient-track')!
    const last = track.querySelector('[data-gradient-stop="1"]')!
    return { track: track.getBoundingClientRect().toJSON(), last: last.getBoundingClientRect().toJSON(),
      position: getComputedStyle(last).position }
  })
  expect(rectangles.position).toBe('absolute')
  expect(Math.abs(rectangles.last.x + rectangles.last.width / 2 - rectangles.track.right)).toBeLessThan(1)
  const marker = $('.cs-composition-panel [data-gradient-stop="0"]')
  const start = await marker.getLocation(), size = await marker.getSize()
  const x = Math.round(rectangles.track.x + rectangles.track.width * 0.4)
  const y = Math.round(start.y + size.height / 2)
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(start.x + size.width / 2), y })
    .down({ button: 'left' }).move({ origin: 'viewport', x, y, duration: 400 }).perform(true)
  try {
    await expect(marker).toHaveAttribute('aria-valuenow', '40')
    expect((await stops())[0]!.position).toBe(0)
    await browser.action('pointer').up({ button: 'left' }).perform(true)
  } finally {
    await browser.releaseActions()
  }
  await browser.waitUntil(async () => (await stops())[0]!.position === 0.4)
  expect(await stops()).toHaveLength(2)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await stops())[0]!.position === 0)
  expect(await stops()).toHaveLength(2)
}
