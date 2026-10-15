import {
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

describe('highlighter background work on production-size screenshots', () => {
  it('analyses 4K and 8K terminal screenshots once, outside the UI thread', async () => {
    await browser.url('/?m02=empty')
    const sourceUrl = '/@fs/' + path.resolve('packages/editor-vue/src/shell/workspace/highlighter-background.ts').replaceAll('\\', '/')
    const reports = await browser.execute(async (moduleUrl) => {
      // Exercise the production controller and its real bundled Worker; source generation precedes timing.
      const { HighlighterBackgroundController } = await import(/* @vite-ignore */ moduleUrl)
      type Report = {
        width: number
        height: number
        elapsed: number
        frames: number
        longTasks: number
        durations: number[]
      }
      const reports: Report[] = []
      for (const [width, height] of [[3840, 2160], [7680, 4320]]) {
        const canvas = document.createElement('canvas')
        canvas.width = width!
        canvas.height = height!
        const context = canvas.getContext('2d')!
        context.fillStyle = '#17191c'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.font = '24px monospace'
        context.fillStyle = '#eeeeee'
        for (let y = 48; y < canvas.height; y += 40) {
          context.fillText(`${y.toString(16)}  const capture = await screen.capture({ display: 1, cursor: true }) // immutable original`, 48, y)
        }
        context.fillStyle = '#f4f4f6'
        context.fillRect(canvas.width * 0.85, 0, canvas.width * 0.15, canvas.height)
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)))
        canvas.width = 0
        canvas.height = 0
        const url = URL.createObjectURL(blob)
        const image = new Image()
        image.src = url
        await image.decode()
        const tasks: PerformanceEntry[] = []
        const observer = new PerformanceObserver((list) => tasks.push(...list.getEntries()))
        observer.observe({ type: 'longtask', buffered: false })
        let frames = 0
        let running = true
        const tick = () => {
          frames += 1
          if (running) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        const start = performance.now()
        let notifications = 0
        let controller: InstanceType<typeof HighlighterBackgroundController>
        await new Promise<void>((resolve, reject) => {
          controller = new HighlighterBackgroundController((state: { status: string; effect: string }) => {
            notifications += 1
            if (state.status !== 'ready' || state.effect !== 'illuminate') reject(new Error(JSON.stringify(state)))
            else resolve()
          })
          controller.start(image)
          controller.start(image)
        })
        const elapsed = performance.now() - start
        controller!.start(image)
        await new Promise((resolve) => setTimeout(resolve, 30))
        running = false
        observer.disconnect()
        controller!.dispose()
        URL.revokeObjectURL(url)
        canvas.width = 0
        canvas.height = 0
        if (notifications !== 1) throw new Error(`Expected one analysis, received ${notifications}`)
        reports.push({
          width: width!,
          height: height!,
          elapsed,
          frames,
          longTasks: tasks.filter((task) => task.startTime >= start).length,
          durations: tasks.filter((task) => task.startTime >= start).map((task) => task.duration),
        })
      }
      return reports
    }, sourceUrl)
    await writeFile(path.resolve('artifacts/highlighter/background-performance.json'), JSON.stringify(reports, null, 2))
    for (const report of reports) {
      expect(report.frames).toBeGreaterThan(0)
      expect(report.longTasks).toBe(0)
    }
  })
})
