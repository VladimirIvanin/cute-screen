import { browser } from '@wdio/globals'

/** Observe layout only: initial fit/tool chrome must settle before native coordinates are calculated. */
export async function waitForStableCanvas(): Promise<void> {
  let previousBounds = ''
  let stableSamples = 0
  await browser.waitUntil(async () => {
    const bounds = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
      return scene ? JSON.stringify({ rect: scene.getBoundingClientRect().toJSON(), width: scene.width, height: scene.height }) : ''
    })
    stableSamples = bounds && bounds === previousBounds ? stableSamples + 1 : 0
    previousBounds = bounds
    return stableSamples >= 2
  }, { interval: 50, timeoutMsg: 'Canvas fit did not settle before native pointer input' })
}
