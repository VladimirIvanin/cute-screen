import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import path from 'node:path'
import { waitForStableCanvas } from '../canvas-ready'
import { nativeImageIngress } from '../image-ingress'
import { quickWindowVisibility } from '../quick-history'
import { selectionDocument } from '../selection-interactions'

interface MenuItem {
  id: string
  text: string
  enabled: boolean
}

interface AppMenuSnapshot {
  topLevel: string[]
  fileItems: string[]
  version: string
  settings: string
  editor: string
  fileLabel: string
  openImage: string
  export: { text: string; enabled: boolean }
  history: string
  recentLabel: string
  recent: MenuItem[]
  quit: string
}

async function appMenu(): Promise<AppMenuSnapshot> {
  return browser.execute(async () => {
    type Native = { __TAURI__: { core: { invoke<T>(command: string): Promise<T> } } }
    return (window as unknown as Native).__TAURI__.core.invoke<AppMenuSnapshot>('test_app_menu_snapshot')
  })
}

async function activateMenuItem(id: string): Promise<void> {
  await browser.execute(async (menuId) => {
    type Native = { __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } } }
    await (window as unknown as Native).__TAURI__.core.invoke('test_app_menu_activate', { id: menuId })
  }, id)
}

async function captureInEditor(previousId?: string): Promise<string> {
  await $('button[aria-label="Capture"]').click()
  await browser.waitUntil(async () => (await quickWindowVisibility()).quick)
  await browser.tauri.switchWindow('quick-capture')
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
  await $('.cs-quick-actions button:first-child').click()
  await browser.waitUntil(async () => !(await quickWindowVisibility()).quick)
  await browser.tauri.switchWindow('main')
  await browser.waitUntil(async () => {
    try {
      const id = (await selectionDocument()).id
      return Boolean(id && id !== previousId)
    } catch {
      return false
    }
  }, { timeout: 60000, timeoutMsg: 'Editor did not mount the captured document' })
  await waitForStableCanvas()
  return (await selectionDocument()).id
}

describe('macOS application menu', () => {
  it('lists recent captures, opens history and keeps the native menu current', async function () {
    if (process.platform !== 'darwin') return
    this.timeout(180000)
    await expect($('.cs-editor-shell')).toExist()
    const empty = await appMenu()
    expect(empty.version).toMatch(/^Version \d+\.\d+\.\d+/)
    expect(empty.topLevel).toEqual(['Cute Screen', 'File'])
    expect(empty.fileItems).toEqual(['app-open-image', 'app-export', 'app-history', 'app-recent'])
    expect(empty.settings).toBe('Settings…')
    expect(empty.editor).toBe('Open Editor')
    expect(empty.fileLabel).toBe('File')
    expect(empty.openImage).toBe('Open Image…')
    expect(empty.export).toEqual({ text: 'Export PNG…', enabled: false })
    expect(empty.history).toBe('History…')
    expect(empty.recentLabel).toBe('Recent Captures')
    expect(empty.recent).toEqual([
      { id: 'app-empty-history', text: 'No captures yet', enabled: false },
    ])
    expect(empty.quit).toBe('Quit')

    const firstId = await captureInEditor()
    await browser.waitUntil(async () => (await appMenu()).recent.some((item) => item.id.startsWith('app-capture:')), {
      timeout: 60000,
      timeoutMsg: 'Native menu did not refresh after capture',
    })
    const secondId = await captureInEditor(firstId)
    expect(secondId).not.toBe(firstId)
    await browser.waitUntil(async () => (await appMenu()).recent.filter((item) => item.id.startsWith('app-capture:')).length === 2)
    const populated = await appMenu()
    const captures = populated.recent.filter((item) => item.id.startsWith('app-capture:'))
    expect(captures).toHaveLength(2)
    expect(captures[0]).toMatchObject({ enabled: true })
    expect(captures[0]!.text).toMatch(/\d+×\d+/)
    expect(populated.export.enabled).toBe(true)

    await activateMenuItem('app-history')
    await expect($('.cs-history-popover')).toBeDisplayed()
    await expect(browser.$$('.cs-history-capture')).toBeElementsArrayOfSize(2)
    await $('.cs-history-close').click()
    await activateMenuItem(captures[1]!.id)
    await browser.waitUntil(async () => {
      try {
        return (await selectionDocument()).id === firstId
      } catch {
        return false
      }
    }, {
      timeoutMsg: 'Older menu item did not open its document',
    })

    await nativeImageIngress('picker')
    await activateMenuItem('app-open-image')
    await browser.waitUntil(async () => (await selectionDocument()).id !== firstId, {
      timeoutMsg: 'File menu Open Image did not mount the selected image',
    })
    await waitForStableCanvas()
    const output = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } } }
      return (window as unknown as Native).__TAURI__.core.invoke<string>('test_result_export', { cancel: false })
    })
    await activateMenuItem('app-export')
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
    const decoded = await loadImage(await readFile(output))
    expect([decoded.width, decoded.height]).toEqual([3840, 2160])

    const artifactDirectory = process.env.CUTE_SCREEN_WDIO_ARTIFACTS!
    await browser.saveScreenshot(path.resolve(artifactDirectory, 'macos-app-menu-history.png'))
    await writeFile(path.resolve(artifactDirectory, 'macos-app-menu.json'), JSON.stringify({ empty, populated }, null, 2))
  })
})
