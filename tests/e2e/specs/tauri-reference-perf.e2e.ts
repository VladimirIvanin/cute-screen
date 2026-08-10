import { browser, expect } from '@wdio/globals'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

type ReferenceReport = {
  readonly backend: string
  readonly renderer: string
  readonly gpuP95: number
  readonly pointerOverlayP95: number
  readonly idleFrameCount: number
  readonly measurements: number
  readonly warmups: number
}

type ReferenceWindow = Window & {
  __cuteScreenReferencePerf?: { run(): Promise<ReferenceReport> }
}

describe('M05 designated reference performance gate', () => {
  it('measures the real Tauri CanvasKit GPU path', async () => {
    await browser.setWindowSize(1600, 1000)
    await browser.waitUntil(
      async () =>
        browser.execute(
          () =>
            (window as ReferenceWindow).__cuteScreenReferencePerf !== undefined,
        ),
      {
        timeout: 30_000,
        timeoutMsg: 'Reference performance harness did not mount',
      },
    )
    const report = (await browser.execute(async () => {
      const harness = (window as ReferenceWindow).__cuteScreenReferencePerf
      if (!harness)
        throw new Error('Reference performance harness is unavailable')
      return harness.run()
    })) as ReferenceReport
    const output = path.resolve(
      process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/reference-perf',
      `run-${process.env.CUTE_SCREEN_REFERENCE_PASS ?? 'unknown'}.json`,
    )
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
    await browser.saveScreenshot(output.replace(/\.json$/, '.png'))

    expect(report.backend).toBe('canvaskit')
    expect(report.renderer).not.toMatch(/swiftshader|llvmpipe|software/i)
    expect(report.warmups).toBe(30)
    expect(report.measurements).toBe(120)
    expect(report.gpuP95).toBeLessThanOrEqual(16.7)
    expect(report.pointerOverlayP95).toBeLessThanOrEqual(50)
    expect(report.idleFrameCount).toBe(0)
  })
})
