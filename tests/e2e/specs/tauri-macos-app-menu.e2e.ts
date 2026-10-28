import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { waitForStableCanvas } from '../canvas-ready'
import { quickWindowVisibility } from '../quick-history'
import { selectionDocument } from '../selection-interactions'

interface MenuItem {
  id: string
  text: string
  enabled: boolean
}

interface AppMenuSnapshot {
  version: string
  settings: string
  editor: string
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
    expect(empty.settings).toBe('Settings…')
    expect(empty.editor).toBe('Open Editor')
    expect(empty.recentLabel).toBe('Recent Captures')
    expect(empty.recent).toEqual([
      { id: 'app-empty-history', text: 'No captures yet', enabled: false },
      { id: 'app-all-history', text: 'All History…', enabled: true },
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
    expect(populated.recent.at(-1)).toMatchObject({ id: 'app-all-history', enabled: true })

    await activateMenuItem('app-all-history')
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

    const artifactDirectory = process.env.CUTE_SCREEN_WDIO_ARTIFACTS!
    await browser.saveScreenshot(path.resolve(artifactDirectory, 'macos-app-menu-history.png'))
    await writeFile(path.resolve(artifactDirectory, 'macos-app-menu.json'), JSON.stringify({ empty, populated }, null, 2))
  })
})
