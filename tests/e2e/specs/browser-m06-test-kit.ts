import { setEditorPreferences } from '../editor-settings'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'

export type HarnessSnapshot = {
  readonly canvas: { readonly width: number; readonly height: number }
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  } | null
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
    readonly opacity?: number
    readonly blendMode?: string
    readonly transform?: {
      readonly translateX: number
      readonly translateY: number
    }
    readonly payload?: Record<string, unknown>
  }[]
}

export async function snapshot(): Promise<HarnessSnapshot> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: { snapshot(): HarnessSnapshot | undefined }
      }
    ).__cuteScreenE2eM05
    const document = harness?.snapshot()
    if (!document) throw new Error('M06 harness document is not ready')
    return document
  })
}

export async function openDrawingHarness(
  viewportFixture = false,
  imageIngress = false,
): Promise<void> {
  await browser.url('/')
  await browser.execute(() => window.localStorage.clear())
  await browser.url(`/?m05=1${viewportFixture ? '&m05viewport=1' : ''}${imageIngress ? '&imageIngress=1' : ''}`)
  await expect($('.cs-canvas-ready')).toExist()
  await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
  await waitForStableCanvas()
}

export async function chooseOption(
  controlName: string,
  optionName: string,
): Promise<void> {
  await browser.execute((name) => {
    if (document.querySelector(`[role="combobox"][aria-label="${name}"]`)) return
    for (const toolbar of document.querySelectorAll('.cs-context-toolbar')) {
      const more = [...toolbar.querySelectorAll('button')].find((button) => ['More', 'Ещё'].includes(button.textContent?.trim() ?? ''))
      more?.click()
    }
  }, controlName)
  const control = $(`[role="combobox"][aria-label="${controlName}"]`)
  await browser.execute((name) => {
    const target = [...document.querySelectorAll<HTMLElement>('[role="combobox"]')].find(
      (element) => element.getAttribute('aria-label') === name,
    )
    if (!target) throw new Error(`Missing combobox: ${name}`)
    target.click()
  }, controlName)
  await browser.waitUntil(() =>
    browser.execute(
      (name) =>
        [...document.querySelectorAll<HTMLElement>('.cs-overlay-root [role="option"]')].some((element) => {
          const text = element.textContent?.trim() ?? ''
          const numericName = name.replace(/[^0-9.]/g, '')
          return text === name || (numericName !== '' && text.startsWith(numericName))
        }),
      optionName,
    ))
  await browser.execute((name) => {
    const target = [...document.querySelectorAll<HTMLElement>('.cs-overlay-root [role="option"]')].find((element) => {
      const text = element.textContent?.trim() ?? ''
      const numericName = name.replace(/[^0-9.]/g, '')
      return text === name || (numericName !== '' && text.startsWith(numericName))
    })
    if (!target) throw new Error(`Missing select option: ${name}`)
    target.click()
  }, optionName)
  await control.waitForExist()
}

export async function setShellPreferences(
  locale: 'en' | 'ru',
  theme: 'light' | 'dark',
): Promise<void> {
  await setEditorPreferences(locale, theme)
  await browser.waitUntil(() => browser.execute(() => document.getAnimations().every((animation) =>
    animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')))
}

export async function arrowHandleViewportPoint(
  arrow: HarnessSnapshot['layers'][number],
): Promise<Readonly<{ x: number; y: number }>> {
  const harnessDocument = await snapshot()
  const outputBounds = harnessDocument.crop ?? {
    x: 0,
    y: 0,
    width: harnessDocument.canvas.width,
    height: harnessDocument.canvas.height,
  }
  const payload = arrow.payload
  const start = payload?.start as { x: number; y: number }
  const end = payload?.end as { x: number; y: number }
  const transform = arrow.transform as { translateX: number; translateY: number } | undefined
  const elbow = payload?.elbow as { axis: 'x' | 'y'; offset: number }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const local =
    elbow.axis === 'x'
      ? { x: midpoint.x, y: midpoint.y + elbow.offset }
      : { x: midpoint.x + elbow.offset, y: midpoint.y }
  return browser.execute(
    ({ x, y, translateX, translateY, outputX, outputY, outputWidth, outputHeight }) => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
      if (!scene) throw new Error('Scene canvas is missing')
      const bounds = scene.getBoundingClientRect()
      return {
        x: Math.round(bounds.left + ((translateX + x - outputX) / outputWidth) * bounds.width),
        y: Math.round(bounds.top + ((translateY + y - outputY) / outputHeight) * bounds.height),
      }
    },
    {
      x: local.x,
      y: local.y,
      translateX: transform?.translateX ?? 0,
      translateY: transform?.translateY ?? 0,
      outputX: outputBounds.x,
      outputY: outputBounds.y,
      outputWidth: outputBounds.width,
      outputHeight: outputBounds.height,
    },
  )
}
