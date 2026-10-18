import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import {
  shapeDocument,
  waitForShapeAnimation,
} from './shape-toolbar'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyEmoji(
  directory: string,
  prefix: string,
): Promise<void> {
  const initial = (await shapeDocument()).layers.length
  await browser.execute(() => {
    window.addEventListener('keydown', (event) => {
      document.documentElement.dataset.emojiKeyTrusted = String(event.isTrusted)
    }, { once: true })
    document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.addEventListener('pointerdown', (event) => {
      document.documentElement.dataset.emojiPointerTrusted = String(event.isTrusted)
    }, { once: true })
  })
  await $('button[data-tool-id="emoji"]').click()
  const toolbar = $('.cs-tool-defaults-toolbar .cs-emoji-toolbar')
  if (!await toolbar.isDisplayed()) {
    await $('.cs-quick-settings-button').click()
  }
  const row = $('.cs-emoji-toolbar')
  await row.$('button[data-emoji-id="1f525"]').waitForEnabled()
  expect(await row.$$('.cs-emoji-quick button').length).toBe(13)
  await row.$('button[data-emoji-id="1f525"]').click()
  await row.$('button[data-emoji-id="1f525"]').waitForEnabled()
  const geometry = await browser.execute(() => {
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const rect = scene.getBoundingClientRect()
    const viewport = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
    return { x: Math.round(Math.max(rect.left, viewport.left) + Math.min(rect.width, viewport.width) * .55),
      y: Math.round(Math.max(rect.top, viewport.top) + Math.min(rect.height, viewport.height) * .45) }
  })
  if (await $('.cs-tool-configure-popover-host').isExisting()) await browser.keys('Escape')
  await browser.action('pointer').move({ origin: 'viewport', ...geometry }).perform()
  await expect($('.cs-emoji-ghost')).toBeDisplayed()
  await browser.action('pointer').move({ origin: 'viewport', ...geometry }).down({ button: 'left' }).up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await shapeDocument()).layers.length === initial + 1)
  expect((await shapeDocument()).layers.at(-1)?.payload).toMatchObject({ grapheme: '🔥', asset: { collection: 'notoEmoji', version: 'noto-2d-v1', assetId: '1f525' } })
  await expect($('button[data-tool-id="select"]')).toHaveAttribute('aria-pressed', 'true')
  const selection = $('.cs-selection-floating-toolbar .cs-emoji-toolbar')
  await selection.waitForDisplayed()
  await selection.$('button[data-emoji-id="26a1"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.payload.grapheme === '⚡')
  await waitForStableCanvas()
  await browser.saveScreenshot(`${directory}/${prefix}-selected.png`)
  await $('button[aria-label="Undo"], button[aria-label="Отменить"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.payload.grapheme === '🔥')
  await $('button[aria-label="Redo"], button[aria-label="Повторить"]').click()
  await browser.waitUntil(async () => (await shapeDocument()).layers.at(-1)?.payload.grapheme === '⚡')
  await $('button[data-tool-id="emoji"]').click()
  const trigger = $('.cs-emoji-toolbar button[aria-haspopup="dialog"]:last-of-type')
  if (!await trigger.isDisplayed()) await $('.cs-quick-settings-button').click()
  await $('.cs-emoji-toolbar button[aria-label="All emoji"], .cs-emoji-toolbar button[aria-label="Все эмоджи"]').click()
  const palette = $('[role="dialog"].cs-emoji-popover')
  await palette.waitForDisplayed()
  await waitForShapeAnimation()
  await browser.execute(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('.cs-emoji-grid img')]
    if (images.length !== 100) throw new Error(`Expected 100 emoji, received ${images.length}`)
    await Promise.all(images.map((image) => image.decode()))
    if (images.some((image) => !image.naturalWidth || image.src.startsWith('data:'))) throw new Error('Emoji must decode from bundled file URLs')
  })
  const search = palette.$('input[type="search"]')
  const readPaletteRect = () => browser.execute(() => {
    const rect = document.querySelector('.cs-emoji-popover')!.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  const paletteRect = await readPaletteRect()
  const expectStablePalette = async (): Promise<void> => {
    const rect = await readPaletteRect()
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(rect[key] - paletteRect[key])).toBeLessThanOrEqual(1)
    }
  }
  await palette.$('button=Work').isExisting().then(async (english) => {
    await palette.$(english ? 'button=Work' : 'button=Работа').click()
  })
  expect(await $$('.cs-emoji-grid button').length).toBe(20)
  await expectStablePalette()
  await browser.saveScreenshot(`${directory}/${prefix}-work.png`)
  await palette.$('button=All').isExisting().then(async (english) => {
    await palette.$(english ? 'button=All' : 'button=Все').click()
  })
  await search.setValue('молния')
  expect(await $$('.cs-emoji-grid button').length).toBe(1)
  await expectStablePalette()
  await search.setValue('lightning')
  expect(await $$('.cs-emoji-grid button').length).toBe(1)
  await expectStablePalette()
  await search.setValue('zzzz')
  expect(await $$('.cs-emoji-grid button').length).toBe(0)
  await expectStablePalette()
  await browser.saveScreenshot(`${directory}/${prefix}-empty.png`)
  await search.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('Backspace')
  await browser.waitUntil(async () => (await $$('.cs-emoji-grid button').length) === 100)
  await browser.saveScreenshot(`${directory}/${prefix}-palette.png`)
  await browser.keys('Escape')
  await expect($('.cs-emoji-toolbar button[aria-label="All emoji"], .cs-emoji-toolbar button[aria-label="Все эмоджи"]')).toBeFocused()
  await browser.keys('Escape')
  await expect($('button[data-tool-id="select"]')).toHaveAttribute('aria-pressed', 'true')
  expect((await shapeDocument()).layers.length).toBe(initial + 1)
  await expect($('html')).toHaveAttribute('data-emoji-key-trusted', 'true')
  await expect($('html')).toHaveAttribute('data-emoji-pointer-trusted', 'true')
}
