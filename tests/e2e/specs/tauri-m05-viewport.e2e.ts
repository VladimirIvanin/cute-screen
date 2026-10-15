import path from 'node:path'

import {
  $,
  browser,
  expect,
} from '@wdio/globals'

async function viewportLayout() {
  return browser.execute(() => {
    const scroll = document.querySelector<HTMLDivElement>('.cs-canvas-scroll')
    const shell = document.querySelector<HTMLElement>('.cs-editor-shell')
    const viewport = document.querySelector<HTMLElement>('.cs-viewport')
    const surface = document.querySelector<HTMLElement>('.cs-canvas-surface')
    const zoomControls = document.querySelector<HTMLElement>('.cs-zoom-controls')
    if (
      !scroll ||
      !shell ||
      !viewport ||
      !surface ||
      !zoomControls
    ) throw new Error('Viewport did not mount')
    const style = window.getComputedStyle(scroll)
    const snapshot = (window as typeof window & {
      __cuteScreenE2eM05?: {
        snapshot(): {
          canvas: { width: number; height: number }
          crop?: { width: number; height: number } | null
        } | undefined
      }
    }).__cuteScreenE2eM05?.snapshot()
    if (!snapshot) throw new Error('Viewport document did not mount')
    const output = snapshot.crop ?? snapshot.canvas
    const zoomText = zoomControls.getAttribute('data-zoom')
    return {
      windowHeight: window.innerHeight,
      zoom: Number.parseInt(zoomText ?? '', 10),
      expectedFitZoom: Math.round(
        Math.min(
          (scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / output.width,
          (scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / output.height,
        ) * 100,
      ),
      canvasWidth: output.width,
      canvasHeight: output.height,
      shell: shell.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number },
      viewport: viewport.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number },
      surface: surface.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number },
      zoomControls: zoomControls.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number },
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
    try {
      await browser.waitUntil(async () => {
        const layout = await viewportLayout()
        return layout.canvasWidth === 2560 && layout.zoom === layout.expectedFitZoom
      })
    } catch (cause) {
      throw new Error(`Viewport Fit did not settle: ${JSON.stringify(await viewportLayout())}`, { cause })
    }

    const fit = await viewportLayout()
    const sourcePixel = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
      return scene ? [...scene.getContext('2d')!.getImageData(1280, 720, 1, 1).data] : []
    })
    expect(sourcePixel).toEqual([39, 61, 90, 255])
    expect(fit.surface.width).toBeCloseTo((fit.canvasWidth * fit.zoom) / 100, 0)
    expect(fit.surface.height).toBeCloseTo((fit.canvasHeight * fit.zoom) / 100, 0)
    expect(fit.shell.bottom).toBeLessThanOrEqual(fit.windowHeight + 1)
    expect(fit.zoomControls.bottom).toBeLessThanOrEqual(fit.viewport.bottom + 1)
    await browser.saveScreenshot(
      path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e', 'm05-viewport-fit-webview.png'),
    )

    await $('.cs-zoom-value').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '100')
    const actualSize = await viewportLayout()
    expect(actualSize.surface.width).toBeCloseTo(actualSize.canvasWidth, 0)
    expect(actualSize.surface.height).toBeCloseTo(actualSize.canvasHeight, 0)
    expect(actualSize.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(actualSize.zoomControls.bottom).toBeLessThanOrEqual(actualSize.viewport.bottom + 1)

    await $('button[aria-label="Fit canvas"]').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', String(fit.zoom))
    const refit = await viewportLayout()
    expect(refit.surface.width).toBeCloseTo((refit.canvasWidth * refit.zoom) / 100, 0)
    expect(refit.surface.height).toBeCloseTo((refit.canvasHeight * refit.zoom) / 100, 0)
    expect(refit.viewport.height).toBeCloseTo(fit.viewport.height, 0)
    expect(refit.zoomControls.bottom).toBeLessThanOrEqual(refit.viewport.bottom + 1)
  })
})
