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
    await expect($('.cs-context-toolbar')).toHaveText(
      expect.stringContaining('Drag to create an arrow'),
    )
    await expect($('nav[aria-label="Series frames"]')).toExist()
    await expect($('.cs-layer-row.is-selected')).toExist()
    await expect($('button=Export')).toBeEnabled()
    await $('button[aria-label="Zoom in"]').click()
    await expect($('.cs-zoom-value')).toHaveText('110%')
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
    await expect($('section[aria-label="Настройки инструмента"]')).toHaveText(
      expect.stringContaining('Потяните, чтобы нарисовать стрелку'),
    )

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
