import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import {
  openDrawingHarness,
  snapshot,
} from './browser-m06-test-kit'

async function drawArrow(): Promise<void> {
  await browser
    .action('pointer')
    .move({ origin: $('.cs-canvas:not(.cs-canvas-overlay)'), x: -80, y: -50 })
    .down({ button: 'left' })
    .move({ origin: 'pointer', x: 75, y: 28, duration: 80 })
    .up({ button: 'left' })
    .perform()
}

describe('physical editor shortcuts', () => {
  it('undoes, redoes, and duplicates a created annotation through browser keyboard input', async () => {
    await openDrawingHarness()
    const initialLayerCount = (await snapshot()).layers.length
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await $('button[aria-label="Arrow"]').click()
    await drawArrow()
    expect((await snapshot()).layers).toHaveLength(initialLayerCount + 1)

    await browser.keys([Key.Control, 'z'])
    expect((await snapshot()).layers).toHaveLength(initialLayerCount)
    await browser.keys([Key.Control, Key.Shift, 'z'])
    expect((await snapshot()).layers).toHaveLength(initialLayerCount + 1)
    await scene.click({ x: -45, y: -36 })
    await browser.keys([Key.Control, 'd'])
    expect((await snapshot()).layers).toHaveLength(initialLayerCount + 2)
  })
})
