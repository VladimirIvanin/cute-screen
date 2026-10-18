import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { nativeImageIngress } from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'
import { setEditorPreferences } from '../editor-settings'

describe('landing tool rail from the production editor', () => {
  it('opens an image and captures all eighteen tools without transient UI', async () => {
    await browser.setWindowSize(1600, 1000)
    await setEditorPreferences('en', 'dark')
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await $('button[aria-label="Export"]').waitForEnabled()
    await waitForStableCanvas()
    await browser.keys('v')
    await $('.cs-topbar').moveTo()
    await browser.waitUntil(async () => !await $('[role="tooltip"]').isDisplayed())
    const rail = $('.cs-toolrail')
    const tools = await rail.$$('[data-tool-id]').map((tool) => tool.getAttribute('data-tool-id'))
    expect(tools).toEqual([
      'select', 'hand', 'crop', 'arrow', 'line', 'shape', 'pencil', 'marker', 'text',
      'numberedMarker', 'callout', 'image', 'emoji', 'eyedropper', 'censor', 'spotlight', 'ruler', 'loupe',
    ])
    await expect(rail.$('[data-tool-id="select"]')).toHaveAttribute('aria-pressed', 'true')
    const output = path.resolve('artifacts/landing-refresh')
    await mkdir(output, { recursive: true })
    await browser.saveScreenshot(path.join(output, 'editor-toolrail.png'))
    const filename = path.join(output, 'toolrail.png')
    await rail.saveScreenshot(filename)
    const decoded = await loadImage(filename)
    expect(decoded.width).toBeGreaterThan(595)
    expect(decoded.height).toBeGreaterThan(0)
    console.info(`Landing tool rail: ${decoded.width}x${decoded.height}; WebView ${browser.capabilities.browserVersion}`)
  }).timeout(120000)
})
