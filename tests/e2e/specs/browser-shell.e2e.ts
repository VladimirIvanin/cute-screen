import { $, browser, expect } from '@wdio/globals'
import path from 'node:path'

describe('M02 editor shell in browser mode', () => {
  async function openShell(
    fixture: 'empty' | 'error' | 'loading' | 'ready',
  ): Promise<void> {
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url(`/?m02=${fixture}`)
    await expect($('.cs-editor-shell')).toExist()
  }

  it('keeps the primary flow visible in the populated 1600 px shell', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await expect($('button[aria-label="Arrow"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect($('.cs-toolrail--horizontal')).toExist()
    await expect($('.cs-context-toolbar')).not.toExist()
    await $('button[aria-label="Marker"]').click()
    await expect($('.cs-context-toolbar .cs-context-icon')).toExist()
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
        if (!(rail instanceof HTMLElement))
          throw new Error('Missing bottom tool rail')
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
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m02-ready-1600x1000.png'),
    )
  })

  it('keeps capture, copy and export reachable without horizontal overflow at 1024 px', async () => {
    await browser.setWindowSize(1024, 700)
    await openShell('ready')

    expect(
      await browser.execute(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await expect($('button[aria-label="Capture"]')).toBeEnabled()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m02-ready-1024x700.png'),
    )
  })

  it('keeps the CLI fallback snackbar out of the zoomed workbench layout', async () => {
    await browser.setWindowSize(1024, 700)
    await browser.url('/?m04fallback=1')
    await expect($('.cs-capture-fallback')).toExist()

    const before = await browser.execute(() => {
      const fallback = document.querySelector('.cs-capture-fallback')
      const workbench = document.querySelector('.cs-workbench')
      if (
        !(fallback instanceof HTMLElement) ||
        !(workbench instanceof HTMLElement)
      ) {
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
      if (!(workbench instanceof HTMLElement))
        throw new Error('Missing workbench')
      const bounds = workbench.getBoundingClientRect()
      return { top: bounds.top, height: bounds.height }
    })

    expect(after).toEqual(before.workbench)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m04-fallback-snackbar-1024x700.png'),
    )
  })

  it('switches locale and theme live with localized accessible names', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await $('button[aria-label="More actions"]').click()
    await $('button=RU').click()
    expect(await browser.execute(() => document.documentElement.lang)).toBe(
      'ru',
    )
    await expect($('aside[aria-label="Инструменты"]')).toExist()
    await $('button[aria-label="Стрелка"]').click()
    await expect(
      $('section[aria-label="Настройки инструмента"] .cs-context-copy'),
    ).not.toExist()

    await $('button[aria-label="Другие действия"]').click()
    await $('button=Тёмная').click()
    expect(
      await browser.execute(() => document.documentElement.dataset.theme),
    ).toBe('dark')
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m02-ready-ru-dark.png'),
    )
  })

  it('renders the light theme at desktop scale', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    await $('button[aria-label="More actions"]').click()
    await $('button=Light').click()
    expect(
      await browser.execute(() => document.documentElement.dataset.theme),
    ).toBe('light')
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m02-ready-light-1600x1000.png'),
    )
  })

  it('places the overflow menu through the overlay without a second absolute offset', async () => {
    await browser.setWindowSize(1600, 1000)
    await openShell('ready')

    const trigger = $('button[aria-label="More actions"]')
    await trigger.click()
    await expect($('.cs-menu')).toExist()

    const placement = await browser.execute(() => {
      const menu = document.querySelector('.cs-menu')
      const trigger = document.querySelector(
        'button[aria-label="More actions"]',
      )
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

  it('renders loading and recoverable error states, and reaches capture first by keyboard', async () => {
    await browser.setWindowSize(1024, 700)
    await openShell('loading')
    await expect($('[role="status"]')).toHaveText('Preparing editor…')

    await openShell('error')
    await expect($('[role="alert"] h1')).toHaveText(
      'The document could not be loaded.',
    )
    await expect($('button=Retry')).toBeEnabled()

    await openShell('empty')
    await browser.keys(['Tab'])
    expect(
      await browser.execute(() =>
        document.activeElement?.getAttribute('aria-label'),
      ),
    ).toBe('Capture')
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m02-empty-focus-1024x700.png'),
    )
  })
})
