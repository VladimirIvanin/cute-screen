import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { verifyPaletteDismissal } from './palette-dismissal'
import { waitForShapeAnimation } from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

function readArrowMenuLayout() {
  return browser.execute(() => {
    const host = document.querySelector('.cs-selection-floating-toolbar')!
    const buttons = [...host.querySelectorAll<HTMLElement>('.cs-arrow-toolbar-trigger, .cs-simple-color-trigger')]
    const centers = buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
    const panel = host.querySelector('.cs-context-toolbar')!.getBoundingClientRect()
    const top = Math.min(...buttons.map((button) => button.getBoundingClientRect().top)) - panel.top
    const bottom = panel.bottom - Math.max(...buttons.map((button) => button.getBoundingClientRect().bottom))
    const separator = host.querySelector<HTMLElement>('.cs-ui-separator')!
    const separatorRect = separator.getBoundingClientRect()
    const swatch = host.querySelector('.cs-simple-color-current')!.getBoundingClientRect()
    const options = [...document.querySelectorAll('.cs-arrow-toolbar-popover[aria-label="Head"] button')]
    const bounds = document.querySelector('.cs-arrow-toolbar-popover[aria-label="Head"]')!.getBoundingClientRect()
    const protectedBounds = (host as HTMLElement).dataset.previewBounds!.split(',').map(Number)
    const [objectLeft = 0, objectTop = 0, objectWidth = 0, objectHeight = 0] = protectedBounds
    const overlay = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
    const rect = overlay.getBoundingClientRect()
    return {
      aligned: Math.max(...centers) - Math.min(...centers) < 1,
      insets: { top, bottom, panelHeight: panel.height },
      symmetric: Math.abs(top - bottom) <= 1,
      separator: separatorRect.height === swatch.height &&
        getComputedStyle(separator).borderRadius === '0px' &&
        Math.abs(separatorRect.top + separatorRect.height / 2 - swatch.top - swatch.height / 2) <= 0.5,
      icons: options.length === 6 && options.every((button) => button.querySelector('svg') && !button.textContent?.trim()),
      fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
      previewVisible: bounds.right <= objectLeft || bounds.left >= objectLeft + objectWidth ||
        bounds.bottom <= objectTop || bounds.top >= objectTop + objectHeight,
      backing: Math.abs(overlay.width - rect.width * devicePixelRatio) <= 1 &&
        Math.abs(overlay.height - rect.height * devicePixelRatio) <= 1,
    }
  })
}

/** Observe production selection after a real creation gesture, without seeding it. */
export async function verifyArrowSelectionMenu(artifactDirectory: string): Promise<void> {
  await expect($('.cs-canvas-ready')).toExist()
  await $('button[aria-label="Arrow"]').click()
  await waitForStableCanvas()
  const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
  await browser.action('pointer')
    .move({ origin: scene, x: -90, y: -60 })
    .down({ button: 'left' })
    .move({ origin: 'pointer', x: 170, y: 65, duration: 100 })
    .up({ button: 'left' })
    .perform()
  await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
  const toolbar = $('.cs-selection-floating-toolbar')
  await toolbar.waitForDisplayed()
  const colour = toolbar.$('.cs-simple-color-trigger')
  await colour.click()
  await waitForShapeAnimation()
  await verifyPaletteDismissal(artifactDirectory, 'arrow-preset', () =>
    $('.cs-simple-color-panel .cs-simple-color-swatch[aria-pressed="false"]:not(.cs-simple-color-custom)').click())
  await expect(colour).toBeFocused()
  await $('button[aria-label="Undo"]').click()
  await colour.click()
  await waitForShapeAnimation()
  await verifyPaletteDismissal(artifactDirectory, 'arrow-escape', () => browser.keys('Escape'))
  await expect(colour).toBeFocused()
  await toolbar.$('[data-control="endCap"] button').click()
  const menu = $('.cs-arrow-toolbar-popover[aria-label="Head"]')
  await menu.waitForDisplayed()
  await browser.waitUntil(() => browser.execute(() => document.getAnimations().every((animation) =>
    animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')))
  const geometry = await browser.execute(() => [...document.querySelectorAll<HTMLElement>(
    '.cs-selection-floating-toolbar .cs-context-toolbar, .cs-selection-floating-toolbar .cs-arrow-formatting-toolbar, ' +
    '.cs-selection-floating-toolbar .cs-arrow-toolbar-control',
  )].map((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      className: element.className,
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      padding: style.padding,
      border: style.borderWidth,
      lineHeight: style.lineHeight,
      display: style.display,
      children: element.innerHTML.slice(0, 500),
    }
  }))
  await writeFile(path.resolve(artifactDirectory, 'arrow-toolbar-geometry.json'), JSON.stringify(geometry, null, 2))
  const layout = await readArrowMenuLayout()
  expect(layout.insets.top).toBeCloseTo(5, 0)
  expect(layout.insets.bottom).toBeCloseTo(5, 0)
  expect(layout).toMatchObject({
    aligned: true,
    insets: { panelHeight: 42 },
    symmetric: true,
    separator: true,
    icons: true,
    fits: true,
    previewVisible: true,
    backing: true,
  })
  await browser.saveScreenshot(path.resolve(artifactDirectory, 'arrow-selection-menu.png'))
  // A real keyboard Escape closes only the nested panel and restores its trigger.
  await browser.execute(() => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.documentElement.dataset.arrowMenuTrustedEscape = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await browser.keys('Escape')
  await expect(menu).not.toExist()
  await expect(toolbar).toBeDisplayed()
  await expect(toolbar.$('[data-control="endCap"] button')).toBeFocused()
  expect(await browser.execute(() => document.documentElement.dataset.arrowMenuTrustedEscape)).toBe('true')
  await toolbar.$('[data-control="endCap"] button').click()
  await $('.cs-arrow-toolbar-popover button[aria-label="Circle"]').click()
  await expect(toolbar.$('[data-control="endCap"] button')).toHaveAttribute('aria-label', 'Head: Circle')
  await $('button[aria-label="Undo"]').click()
  await expect(toolbar.$('[data-control="endCap"] button')).toHaveAttribute('aria-label', 'Head: Solid arrow')
  // Rotation zones are at the non-resize corners of arrow local bounds.
  const corner = await browser.execute(() => {
    type Layer = {
      localBounds: { x: number; y: number; width: number; height: number }
      transform: { translateX: number; translateY: number }
    }
    type Snapshot = {
      canvas: { width: number; height: number }
      crop: { x: number; y: number; width: number; height: number } | null
      layers: Layer[]
    }
    const harness = (window as typeof window & {
      __cuteScreenE2eM05: { snapshot(): Snapshot }
    }).__cuteScreenE2eM05
    const doc = harness.snapshot()
    const layer = doc.layers.at(-1)!
    const canvas = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!
    const bounds = canvas.getBoundingClientRect()
    const width = doc.crop?.width ?? doc.canvas.width
    const height = doc.crop?.height ?? doc.canvas.height
    return {
      x: Math.round(bounds.left +
        (layer.transform.translateX + layer.localBounds.x - (doc.crop?.x ?? 0)) * bounds.width / width),
      y: Math.round(bounds.top +
        (layer.transform.translateY + layer.localBounds.y - (doc.crop?.y ?? 0)) * bounds.height / height),
    }
  })
  await browser.action('pointer').move({ origin: 'viewport', ...corner }).perform()
  await expect(scene).toHaveElementClass('cs-canvas-rotate-cursor')
  const cursor = await scene.getCSSProperty('cursor')
  expect(decodeURIComponent(String(cursor.value)).toLowerCase()).toContain('m4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5')
}
