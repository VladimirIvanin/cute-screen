import { $, $$, browser, expect } from '@wdio/globals'
import path from 'node:path'

async function openArrowConfigurePopover(): Promise<void> {
  await browser.execute(() => {
    const button = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Arrow"], button[aria-label="Стрелка"]',
    )
    if (!button) throw new Error('Arrow tool button is missing')
    button.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
  })
  await expect($('.cs-tool-configure-popover-host')).toExist()
}

async function closeArrowConfigurePopover(): Promise<void> {
  await browser.execute(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
  })
  await expect($('.cs-tool-configure-popover-host')).not.toExist()
}

type ArrowSnapshot = {
  readonly layers: readonly {
    readonly id: string
    readonly kind: string
    readonly transform?: {
      readonly translateX: number
      readonly translateY: number
    }
    readonly payload?: Record<string, unknown>
  }[]
}

async function snapshot(): Promise<ArrowSnapshot> {
  return browser.execute(() => {
    const harness = (
      window as typeof window & {
        __cuteScreenE2eM05?: { snapshot(): ArrowSnapshot | undefined }
      }
    ).__cuteScreenE2eM05
    const document = harness?.snapshot()
    if (!document) throw new Error('Arrow WebView2 harness is not ready')
    return document
  })
}

async function setPreferences(
  locale: 'en' | 'ru',
  theme: 'light' | 'dark',
): Promise<void> {
  const currentLocale = await browser.execute(
    () => document.documentElement.lang,
  )
  if (currentLocale !== locale) {
    await $(
      `button[aria-label="${currentLocale === 'ru' ? 'Другие действия' : 'More actions'}"]`,
    ).click()
    await $(`button=${locale === 'ru' ? 'RU' : 'EN'}`).click()
  }
  if (
    (await browser.execute(() => document.documentElement.dataset.theme)) !==
    theme
  ) {
    await $(
      `button[aria-label="${locale === 'ru' ? 'Другие действия' : 'More actions'}"]`,
    ).click()
    const label =
      locale === 'ru'
        ? theme === 'light'
          ? 'Светлая'
          : 'Тёмная'
        : theme === 'light'
          ? 'Light'
          : 'Dark'
    await $(`button=${label}`).click()
  }
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => document.documentElement.lang)) === locale &&
      (await browser.execute(() => document.documentElement.dataset.theme)) ===
        theme,
  )
}

async function elbowHandlePoint(
  arrow: ArrowSnapshot['layers'][number],
): Promise<Readonly<{ x: number; y: number }>> {
  const start = arrow.payload?.start as { x: number; y: number }
  const end = arrow.payload?.end as { x: number; y: number }
  const elbow = arrow.payload?.elbow as { axis: 'x' | 'y'; offset: number }
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const local =
    elbow.axis === 'x'
      ? { x: midpoint.x, y: midpoint.y + elbow.offset }
      : { x: midpoint.x + elbow.offset, y: midpoint.y }
  return browser.execute(
    ({ x, y, translateX, translateY }) => {
      const scene = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas:not(.cs-canvas-overlay)',
      )
      if (!scene) throw new Error('Scene canvas is missing')
      const bounds = scene.getBoundingClientRect()
      return {
        x: Math.round(
          bounds.left + ((translateX + x) / scene.width) * bounds.width,
        ),
        y: Math.round(
          bounds.top + ((translateY + y) / scene.height) * bounds.height,
        ),
      }
    },
    {
      x: local.x,
      y: local.y,
      translateX: arrow.transform?.translateX ?? 0,
      translateY: arrow.transform?.translateY ?? 0,
    },
  )
}

describe('Arrow toolbar and engine in a real Tauri WebView2', () => {
  it('keeps five controls visible across sizes/locales/themes and edits one elbow command', async () => {
    await browser.waitUntil(async () => (await snapshot()).layers.length === 4)
    const sizes = [
      { width: 1600, height: 1000 },
      { width: 1280, height: 720 },
      { width: 1024, height: 700 },
    ] as const
    const preferences = [
      { locale: 'en', theme: 'light' },
      { locale: 'en', theme: 'dark' },
      { locale: 'ru', theme: 'light' },
      { locale: 'ru', theme: 'dark' },
    ] as const

    for (const size of sizes) {
      await browser.setWindowSize(size.width, size.height)
      for (const preference of preferences) {
        await setPreferences(preference.locale, preference.theme)
        const arrowLabel = preference.locale === 'ru' ? 'Стрелка' : 'Arrow'
        await $(`button[aria-label="${arrowLabel}"]`).click()
        await openArrowConfigurePopover()
        const layout = await browser.execute(() => {
          const toolbar = document.querySelector<HTMLElement>(
            '.cs-tool-configure-popover-host',
          )
          const controls = toolbar?.querySelector<HTMLElement>(
            '.cs-arrow-formatting-toolbar',
          )
          if (!toolbar || !controls) throw new Error('Arrow toolbar is missing')
          const bounds = toolbar.getBoundingClientRect()
          return {
            controlIds: [
              ...controls.querySelectorAll<HTMLElement>('[data-control]'),
            ].map((control) => control.dataset.control),
            observableCount: controls.querySelectorAll(
              '.cs-arrow-toolbar-trigger, .cs-color-more--compact',
            ).length,
            controlsFit: controls.scrollWidth <= controls.clientWidth,
            toolbarFits:
              bounds.left >= 0 &&
              bounds.right <= window.innerWidth &&
              bounds.top >= 0 &&
              bounds.bottom <= window.innerHeight,
            documentFits:
              document.documentElement.scrollWidth <= window.innerWidth,
          }
        })
        expect(layout).toEqual({
          controlIds: ['color', 'stroke', 'startCap', 'arrowPath', 'endCap'],
          observableCount: 5,
          controlsFit: true,
          toolbarFits: true,
          documentFits: true,
        })
        await closeArrowConfigurePopover()
        await browser.saveScreenshot(
          path.resolve(
            `artifacts/tauri-e2e/arrow-toolbar-${size.width}x${size.height}-${preference.locale}-${preference.theme}.png`,
          ),
        )
      }
    }

    await browser.setWindowSize(1280, 720)
    await setPreferences('en', 'light')
    await $('button[aria-label="Show layers"]').click()
    const arrowTool = $('button[aria-label="Arrow"]')
    await arrowTool.click()
    await openArrowConfigurePopover()
    await $(
      '.cs-tool-configure-popover-host [data-control="arrowPath"] .cs-arrow-toolbar-trigger',
    ).click()
    await $('button=Elbow').click()
    await closeArrowConfigurePopover()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const beforeCount = (await snapshot()).layers.length
    await browser
      .action('pointer')
      .move({ origin: scene, x: -52, y: -18, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 104, y: 36, duration: 80 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(
      async () => (await snapshot()).layers.length === beforeCount + 1,
    )
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true')
    expect(await $$('.cs-layer-row.is-selected').length).toBe(0)

    const arrow = (await snapshot()).layers.at(-1)!
    const originalOffset = (arrow.payload?.elbow as { offset: number }).offset
    await $('button[aria-label="Select"]').click()
    const handle = await elbowHandlePoint(arrow)
    await browser
      .action('pointer')
      .move({ origin: 'viewport', x: handle.x, y: handle.y, duration: 0 })
      .down({ button: 'left' })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(
      async () => (await $$('.cs-layer-row.is-selected').length) === 1,
    )
    await browser
      .action('pointer')
      .move({ origin: 'viewport', x: handle.x, y: handle.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 22, y: 0, duration: 80 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(async () => {
      const current = (await snapshot()).layers.at(-1)
      return (
        (current?.payload?.elbow as { offset?: number } | undefined)?.offset !==
        originalOffset
      )
    })
    const draggedOffset = (
      (await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number }
    ).offset

    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(
      async () =>
        ((await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number })
          .offset === originalOffset,
    )
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(
      async () =>
        ((await snapshot()).layers.at(-1)?.payload?.elbow as { offset: number })
          .offset === draggedOffset,
    )
  })
})
