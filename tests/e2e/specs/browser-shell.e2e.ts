import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { Key } from 'webdriverio'
import { setShellPreferences } from './browser-m06-test-kit'
import {
  dragCanvas,
  m08Snapshot,
  openM08,
} from './browser-m08-test-kit'

describe('M02 editor shell in browser mode', () => {
  async function openShell(fixture: 'empty' | 'error' | 'loading' | 'ready'): Promise<void> {
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url(`/?m02=${fixture}`)
    await expect($('.cs-editor-shell')).toExist()
  }

  it('keeps the primary flow visible in the populated 1600 px shell', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await expect($('button[aria-label="Arrow"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-toolrail--horizontal')).toExist()
    await expect($('.cs-context-toolbar')).not.toExist()
    await $('button[aria-label="Highlighter"]').click()
    await expect($('.cs-context-toolbar .cs-highlighter-toolbar')).toExist()
    await expect($('.cs-context-toolbar .cs-context-copy')).not.toExist()
    await expect($('nav[aria-label="Series frames"]')).toExist()
    await expect($('.cs-layer-row.is-selected')).toExist()
    await expect($('button=Export')).toBeEnabled()
    expect(
      await browser.execute(() => {
        const context = document.querySelector('.cs-context-toolbar')
        const zoom = document.querySelector('.cs-zoom-controls')
        const rail = document.querySelector('.cs-toolrail')
        if (!(context instanceof HTMLElement) || !(zoom instanceof HTMLElement))
          throw new Error('Missing bottom workbench controls')
        if (!(rail instanceof HTMLElement)) throw new Error('Missing bottom tool rail')
        const contextBounds = context.getBoundingClientRect()
        const zoomBounds = zoom.getBoundingClientRect()
        const railBounds = rail.getBoundingClientRect()
        return (
          (contextBounds.right <= zoomBounds.left ||
            zoomBounds.right <= contextBounds.left ||
            contextBounds.bottom <= zoomBounds.top ||
            zoomBounds.bottom <= contextBounds.top) &&
            contextBounds.bottom <= railBounds.top + 1
        )
      }),
    ).toBe(true)
    await $('button[aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '110')
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m02-ready-1600x1000.png'))
  })

  it('keeps capture, copy and export reachable without overflow at 1024 px', async () => {
    await browser.setWindowSize(1024, 700)
    await openShell('ready')

    expect(await browser.execute(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(
      await browser.execute(() => {
        const app = document.querySelector('#app')
        const provider = document.querySelector('.n-config-provider')
        const workbench = document.querySelector('.cs-workbench')
        const rail = document.querySelector('.cs-toolrail')
        const zoom = document.querySelector('.cs-zoom-controls')
        const film = document.querySelector('.cs-filmstrip')
        if (
          !(app instanceof HTMLElement) ||
          !(provider instanceof HTMLElement) ||
          !(workbench instanceof HTMLElement)
        ) {
          throw new Error('Missing app, config provider or workbench')
        }
        if (!(rail instanceof HTMLElement) || !(zoom instanceof HTMLElement)) {
          throw new Error('Missing bottom chrome')
        }
        const overlap = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
        const within = (box: DOMRect) =>
          box.left >= -1 && box.right <= window.innerWidth + 1 && box.top >= -1 && box.bottom <= window.innerHeight + 1
        const appBox = app.getBoundingClientRect()
        const providerBox = provider.getBoundingClientRect()
        const workbenchBox = workbench.getBoundingClientRect()
        const railBox = rail.getBoundingClientRect()
        const zoomBox = zoom.getBoundingClientRect()
        const filmBox = film instanceof HTMLElement ? film.getBoundingClientRect() : null
        return {
          providerFillsApp: providerBox.height > 0 && Math.abs(providerBox.height - appBox.height) <= 1,
          workbenchWithinApp: workbenchBox.height <= appBox.height + 1,
          railWithin: within(railBox),
          zoomWithin: within(zoomBox),
          filmWithin: filmBox ? within(filmBox) : true,
          railZoomOverlap: overlap(railBox, zoomBox),
          railFilmOverlap: filmBox ? overlap(railBox, filmBox) : false,
          filmZoomOverlap: filmBox ? overlap(filmBox, zoomBox) : false,
        }
      }),
    ).toEqual({
      providerFillsApp: true,
      workbenchWithinApp: true,
      railWithin: true,
      zoomWithin: true,
      filmWithin: true,
      railZoomOverlap: false,
      railFilmOverlap: false,
      filmZoomOverlap: false,
    })
    await expect($('button[aria-label="Capture"]')).toBeEnabled()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m02-ready-1024x700.png'))
  })

  it('keeps the CLI fallback snackbar out of the zoomed workbench layout', async () => {
    await browser.setWindowSize(1024, 700)
    await browser.url('/?m04fallback=1')
    await expect($('.cs-capture-fallback')).toExist()

    const before = await browser.execute(() => {
      const fallback = document.querySelector('.cs-capture-fallback')
      const workbench = document.querySelector('.cs-workbench')
      if (!(fallback instanceof HTMLElement) || !(workbench instanceof HTMLElement)) {
        throw new Error('Missing fallback snackbar or workbench')
      }
      const bounds = workbench.getBoundingClientRect()
      return {
        fallbackPosition: getComputedStyle(fallback).position,
        workbench: { top: bounds.top, height: bounds.height },
      }
    })

    expect(before.fallbackPosition).toBe('fixed')
    expect(before.workbench.top).toBeCloseTo(0, 0)
    await $('button[aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '110')

    const after = await browser.execute(() => {
      const workbench = document.querySelector('.cs-workbench')
      if (!(workbench instanceof HTMLElement)) throw new Error('Missing workbench')
      const bounds = workbench.getBoundingClientRect()
      return { top: bounds.top, height: bounds.height }
    })

    expect(after).toEqual(before.workbench)
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m04-fallback-snackbar-1024x700.png'))
  })

  it('switches locale and theme live with localized accessible names', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await $('button[aria-label="Settings"]').click()
    await $('.cs-settings-choices label:has(input[value="ru"])').click()
    expect(await browser.execute(() => document.documentElement.lang)).toBe('ru')
    await expect($('[role="dialog"][aria-label="Настройки"]')).toBeDisplayed()
    await browser.keys(Key.Escape)
    await expect($('aside[aria-label="Инструменты"]')).toExist()
    await $('button[aria-label="Стрелка"]').click()
    await expect($('section[aria-label="Настройки инструмента"] .cs-context-copy')).not.toExist()

    await $('button[aria-label="Настройки"]').click()
    await $('.cs-settings-choices label:has(input[value="dark"])').click()
    expect(await browser.execute(() => document.documentElement.dataset.theme)).toBe('dark')
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m02-ready-ru-dark.png'))
  })

  it('renders the light theme at desktop scale', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await $('button[aria-label="Settings"]').click()
    await $('.cs-settings-choices label:has(input[value="light"])').click()
    expect(await browser.execute(() => document.documentElement.dataset.theme)).toBe('light')
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m02-ready-light-1600x1000.png'))
  })

  it('places the overflow menu through the overlay without a second absolute offset', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    const trigger = $('button[aria-label="Settings"]')
    await trigger.click()
    await expect($('.cs-settings-popover')).toExist()
    await expect($('button[aria-label="Application settings…"]')).toBeDisabled()

    const placement = await browser.execute(() => {
      const menu = document.querySelector('.cs-settings-popover')
      const trigger = document.querySelector('button[aria-label="Settings"]')
      if (!(menu instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
        throw new Error('Missing overflow menu or trigger')
      }
      const menuBounds = menu.getBoundingClientRect()
      const triggerBounds = trigger.getBoundingClientRect()
      return {
        position: getComputedStyle(menu).position,
        menuTop: menuBounds.top,
        triggerBottom: triggerBounds.bottom,
      }
    })

    expect(placement.position).toBe('static')
    expect(placement.menuTop).toBeGreaterThanOrEqual(placement.triggerBottom)
  })

  it('fits localized menu labels and hides the trigger tooltip while open', async () => {
    await openShell('ready')
    for (const width of [1024, 1600]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['ru', 'en'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          await setShellPreferences(locale, theme)
          const label = locale === 'ru' ? 'Настройки' : 'Settings'
          const trigger = $(`button[aria-label="${label}"]`)
          await trigger.moveTo()
          await browser.waitUntil(async () => (await $('.n-tooltip').isDisplayed()))
          await trigger.click()
          await expect(trigger).toHaveAttribute('aria-expanded', 'true')
          await browser.waitUntil(async () => !(await $('.n-tooltip').isDisplayed()))

          const geometry = await browser.execute((name) => {
            const menu = document.querySelector('.cs-settings-popover')!
            const bounds = menu.getBoundingClientRect()
            const trigger = document.querySelector(`button[aria-label="${name}"]`)!
            return {
              fitsViewport:
                bounds.left >= 0 &&
                bounds.right <= innerWidth &&
                bounds.top >= 0 &&
                bounds.bottom <= innerHeight,
              nativeTooltip: trigger.hasAttribute('title'),
              primaryIconsVisible: [...document.querySelectorAll('.cs-top-actions .cs-button-quiet svg')].every((icon) => {
                const rect = icon.getBoundingClientRect()
                return rect.width > 0 && rect.height > 0
              }),
              labelsFit: [...menu.querySelectorAll('button, label')].every((button) => {
                const content = button.querySelector('.n-button__content, span')!
                const range = document.createRange()
                range.selectNodeContents(content)
                const text = range.getBoundingClientRect()
                const item = button.getBoundingClientRect()
                return (
                  text.left >= item.left &&
                  text.right <= item.right &&
                  text.top >= item.top &&
                  text.bottom <= item.bottom
                )
              }),
            }
          }, label)
          expect(geometry).toEqual({
            fitsViewport: true,
            nativeTooltip: false,
            labelsFit: true,
            primaryIconsVisible: true,
          })
          await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `topbar-menu-${width}-${locale}-${theme}.png`))
          await trigger.click()
          await expect(trigger).toHaveAttribute('aria-expanded', 'false')
        }
      }
    }
  }).timeout(120000)

  it('opens from Enter and Space, navigates choices with Tab and closes outside or with Escape', async () => {
    await browser.setWindowSize(1024, 700)
    await openShell('empty')
    const trigger = $('button[aria-label="Settings"]')
    await browser.keys(Key.Tab)
    await expect($('button[aria-label="Capture"]')).toBeFocused()
    for (let step = 0; step < 6 && !(await trigger.isFocused()); step += 1) await browser.keys(Key.Tab)
    await expect(trigger).toBeFocused()
    await browser.keys(Key.Enter)
    await expect($('.cs-settings-popover input[value="system"]')).toBeFocused()
    await browser.keys(Key.Tab)
    await expect($('.cs-settings-popover input[value="en"]')).toBeFocused()
    await browser.keys(Key.Escape)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await browser.keys(Key.Space)
    await expect($('.cs-settings-popover')).toBeDisplayed()
    await $('.cs-brand').click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect($('.cs-settings-popover')).not.toBeDisplayed()
  })

  it('persists preferences across reload and scrolls the settings panel in a short viewport', async () => {
    await openShell('empty')
    await setShellPreferences('ru', 'dark')
    await browser.refresh()
    await expect($('button[aria-label="Настройки"]')).toExist()
    expect(await browser.execute(() => document.documentElement.dataset.theme)).toBe('dark')
    await browser.setWindowSize(1024, 350)
    await $('button[aria-label="Настройки"]').click()
    const layout = await browser.execute(() => {
      const panel = document.querySelector<HTMLElement>('.cs-settings-popover')!
      const rect = panel.getBoundingClientRect()
      return { fits: rect.top >= 0 && rect.bottom <= innerHeight, scrolls: panel.scrollHeight > panel.clientHeight }
    })
    expect(layout).toEqual({ fits: true, scrolls: true })
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/settings-short-viewport.png'))
    await browser.keys(Key.Escape)
  })

  it('keeps image actions from settings undoable in a mounted document', async () => {
    await browser.setWindowSize(1024, 700)
    await openM08()
    await setShellPreferences('en', 'light')
    await $('button[aria-label="Arrow"]').click()
    await dragCanvas({ x: 80, y: 80 }, { x: 200, y: 120 }, 'settings-arrow')
    const before = await m08Snapshot()
    await $('button[aria-label="Settings"]').click()
    await $('button=Flip horizontally').click()
    await expect($('.cs-settings-popover')).not.toBeDisplayed()
    const flipped = await m08Snapshot()
    expect(flipped.document.layers).not.toEqual(before.document.layers)
    await $('button[aria-label="Undo"]').click()
    expect((await m08Snapshot()).document.layers).toEqual(before.document.layers)
    await $('button[aria-label="Redo"]').click()
    expect((await m08Snapshot()).document.layers).toEqual(flipped.document.layers)
  })

  it('renders loading and recoverable error states, and reaches capture first by keyboard', async () => {
    await browser.setWindowSize(1024, 700)
    await openShell('loading')
    await expect($('[role="status"]')).toHaveText('Preparing editor…')

    await openShell('error')
    await expect($('[role="alert"] h1')).toHaveText('The document could not be loaded.')
    await expect($('button=Retry')).toBeEnabled()

    await openShell('empty')
    await browser.keys(['Tab'])
    expect(await browser.execute(() => document.activeElement?.getAttribute('aria-label'))).toBe('Capture')
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/m02-empty-focus-1024x700.png'))
  })
})
