import { $, browser, expect } from '@wdio/globals'

describe('M04 clean-profile capture', () => {
  it('creates and mounts the first persisted document through the production request flow', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')

    await $('button[aria-label="Capture"]').click()

    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await expect($('nav[aria-label="Series frames"]')).toBeDisplayed()
    const scene = $('[aria-label="Scene canvas"]')
    await expect(scene).toExist()
    expect(
      await browser.execute(() => {
        const canvas = document.querySelector(
          '[aria-label="Scene canvas"]',
        ) as HTMLCanvasElement | null
        return canvas ? [canvas.width, canvas.height] : undefined
      }),
    ).toEqual([400, 300])

    const zoomBefore = await $('.cs-zoom-controls').getAttribute('data-zoom')
    await browser.setWindowSize(1600, 1000)
    await browser.waitUntil(
      async () =>
        (await $('.cs-zoom-controls').getAttribute('data-zoom')) !== zoomBefore,
    )
  })
})
