import path from 'node:path'

import { $, browser, expect } from '@wdio/globals'

async function viewportLayout() {
  return browser.execute(() => {
    const required = <ElementType extends HTMLElement>(
      selector: string,
    ): ElementType => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing viewport element: ${selector}`)
      }
      return element as ElementType
    }
    const bounds = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
      }
    }
    const scroll = required<HTMLDivElement>('.cs-canvas-scroll')
    const style = window.getComputedStyle(scroll)
    const inset = (value: string): number => Number.parseFloat(value) || 0
    const scene = required<HTMLCanvasElement>(
      '.cs-canvas:not(.cs-canvas-overlay)',
    )
    const zoomText = required<HTMLButtonElement>('.cs-zoom-value').textContent
    return {
      windowHeight: window.innerHeight,
      zoom: Number.parseInt(zoomText ?? '', 10),
      expectedFitZoom: Math.round(
        Math.min(
          (scroll.clientWidth -
            inset(style.paddingLeft) -
            inset(style.paddingRight)) /
            scene.width,
          (scroll.clientHeight -
            inset(style.paddingTop) -
            inset(style.paddingBottom)) /
            scene.height,
        ) * 100,
      ),
      canvasWidth: scene.width,
      canvasHeight: scene.height,
      shell: bounds(required('.cs-editor-shell')),
      viewport: bounds(required('.cs-viewport')),
      surface: bounds(required('.cs-canvas-surface')),
      zoomControls: bounds(required('.cs-zoom-controls')),
    }
  })
}

describe('M05 viewport in a real Tauri webview', () => {
  it('keeps Fit and custom zoom inside the bounded editor shell', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('.cs-canvas-ready')).toExist()
    // Window creation can precede the native resize notification. Reapply the
    // explicit Fit action so this test observes the user-visible fit contract.
    await $('button[aria-label="Fit canvas"]').click()
    await browser.waitUntil(async () => {
      const layout = await viewportLayout()
      return (
        layout.canvasWidth === 2560 && layout.zoom === layout.expectedFitZoom
      )
    })

    const fit = await viewportLayout()
    expect(fit.surface.width).toBeCloseTo((fit.canvasWidth * fit.zoom) / 100, 0)
    expect(fit.surface.height).toBeCloseTo(
      (fit.canvasHeight * fit.zoom) / 100,
      0,
    )
    expect(fit.shell.bottom).toBeLessThanOrEqual(fit.windowHeight + 1)
    expect(fit.zoomControls.bottom).toBeLessThanOrEqual(fit.viewport.bottom + 1)
    await browser.saveScreenshot(
      path.resolve(
        process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e',
        'm05-viewport-fit-webview.png',
      ),
    )

    await $('.cs-zoom-value').click()
    await expect($('.cs-zoom-value')).toHaveText('100%')
    const actualSize = await viewportLayout()
    expect(actualSize.surface.width).toBeCloseTo(actualSize.canvasWidth, 0)
    expect(actualSize.surface.height).toBeCloseTo(actualSize.canvasHeight, 0)
    expect(actualSize.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(actualSize.zoomControls.bottom).toBeLessThanOrEqual(
      actualSize.viewport.bottom + 1,
    )

    await $('button[aria-label="Fit canvas"]').click()
    await expect($('.cs-zoom-value')).toHaveText(`${fit.zoom}%`)
    const refit = await viewportLayout()
    expect(refit.surface.width).toBeCloseTo(
      (refit.canvasWidth * refit.zoom) / 100,
      0,
    )
    expect(refit.surface.height).toBeCloseTo(
      (refit.canvasHeight * refit.zoom) / 100,
      0,
    )
    expect(refit.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(refit.zoomControls.bottom).toBeLessThanOrEqual(
      refit.viewport.bottom + 1,
    )
  })
})
