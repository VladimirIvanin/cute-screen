import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'

async function frame() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eQuick?: { snapshot(): {
      canvas: { width: number; height: number }
      crop: { x: number; y: number; width: number; height: number } | null
      layers: readonly unknown[]
    } | undefined } }
    const document = state.__cuteScreenE2eQuick?.snapshot()
    if (!document?.crop) throw new Error('Quick capture frame missing')
    const sceneElement = window.document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!
    const scene = sceneElement.getBoundingClientRect()
    return {
      ...document,
      crop: document.crop,
      scene: { x: scene.x, y: scene.y, width: scene.width, height: scene.height },
    }
  })
}
async function chromeGeometry() {
  return browser.execute(() => {
    const tools = document.querySelector('.cs-quick-toolrail-group')!.getBoundingClientRect()
    const rail = document.querySelector('.cs-toolrail')!.getBoundingClientRect()
    const settings = document.querySelector<HTMLElement>('.cs-quick-defaults')
    const visible = Boolean(settings?.checkVisibility({ visibilityProperty: true }))
    const box = settings?.getBoundingClientRect()
    return {
      tools: {
        x: Math.round(tools.x),
        y: Math.round(tools.y),
        width: Math.round(tools.width),
        height: Math.round(tools.height),
      },
      rail: {
        x: Math.round(rail.x),
        y: Math.round(rail.y),
        width: Math.round(rail.width),
        height: Math.round(rail.height),
      },
      settings: visible && box ? {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      } : undefined,
    }
  })
}

describe('Quick settings keep the drawing area free', () => {
  it('keeps the tool bar still and opens settings toward the frame', async function () {
    this.timeout(120000)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-quick-defaults')).toBeDisplayed()
    const pencil = await chromeGeometry()
    const captured = await frame()
    const cropTop = captured.scene.y + captured.crop.y * captured.scene.height / captured.canvas.height
    const cropBottom = cropTop + captured.crop.height * captured.scene.height / captured.canvas.height
    expect(pencil.settings).toBeDefined()
    const settings = pencil.settings!
    const barBelow = pencil.rail.y >= cropBottom - 1
    if (barBelow) expect(settings.y + settings.height).toBeLessThanOrEqual(pencil.rail.y + 1)
    else expect(settings.y).toBeGreaterThanOrEqual(pencil.rail.y + pencil.rail.height - 1)
    expect(settings.y < cropBottom && settings.y + settings.height > cropTop).toBe(true)
    for (const label of ['Arrow', 'Shape', 'Text']) {
      await $(`button[aria-label="${label}"]`).click()
      expect((await chromeGeometry()).rail).toEqual(pencil.rail)
    }
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-outside.png')
    await $('button[aria-label="Pencil"]').click()
    expect((await chromeGeometry()).rail).toEqual(pencil.rail)
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-manual.png')
    const before = await frame()
    const stroke = await browser.execute(() => {
      const obstacles = [...document.querySelectorAll<HTMLElement>(
        '.cs-quick-defaults, .cs-quick-toolrail-group, .cs-quick-actions',
      )].filter((element) => element.checkVisibility({ visibilityProperty: true }))
        .map((element) => element.getBoundingClientRect())
      const scene = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      for (const ratio of [.62, .5, .75, .38]) {
        const x = Math.round(scene.left + scene.width * .35)
        const y = Math.round(scene.top + scene.height * ratio)
        const blocked = obstacles.some((obstacle) =>
          (x >= obstacle.left && x <= obstacle.right && y >= obstacle.top && y <= obstacle.bottom) ||
          (x + 100 >= obstacle.left && x + 100 <= obstacle.right &&
            y + 50 >= obstacle.top && y + 50 <= obstacle.bottom))
        if (!blocked) return { x, y }
      }
      return {
        x: Math.round(scene.left + scene.width * .35),
        y: Math.round(scene.top + scene.height * .62),
      }
    })
    await browser.action('pointer')
      .move({ origin: 'viewport', ...stroke })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 100, y: 50, duration: 200 })
      .up({ button: 'left' }).perform()
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await browser.waitUntil(async () => (await frame()).layers.length === before.layers.length + 1)
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-quick-first-stroke.png')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await $('[aria-label="Scene canvas"]').waitForDisplayed()
    await browser.waitUntil(() => browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
      if (!scene || scene.width === 0) return false
      const pixel = scene.getContext('2d')?.getImageData(
        Math.floor(scene.width / 2),
        Math.floor(scene.height / 2),
        1,
        1,
      ).data
      return pixel?.[3] === 255
    }))
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
    await browser.saveScreenshot('artifacts/tauri-e2e/creation-settings-editor.png')
  })
})
