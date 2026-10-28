import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeTrayLabels } from '../tray-labels'
import { nativeImageIngress } from '../image-ingress'
import { selectionDocument } from '../selection-interactions'
import { waitForStableCanvas } from '../canvas-ready'
import { quickWindowVisibility } from '../quick-history'

async function activateTrayLabel(
  label: string,
  occurrence?: number,
): Promise<void> {
  const execute = promisify(execFile)
  const { stdout } = await execute('pgrep', ['-f', `^${process.env.CUTE_SCREEN_WDIO_APP_BINARY}( |$)`])
  await execute('/usr/bin/python3', [
    'tests/e2e/native-settings-tray.py', stdout.trim(), label,
    ...(occurrence === undefined ? [] : [String(occurrence)]),
  ])
}

async function activateMenu(id: string): Promise<void> {
  await browser.execute(async (id) => {
    type Native = { __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } } }
    await (window as unknown as Native).__TAURI__.core.invoke('test_app_menu_activate', { id })
  }, id)
}

async function waitForDocument(previousId?: string): Promise<string> {
  await browser.waitUntil(async () => {
    try {
      return (await selectionDocument()).id !== previousId
    } catch (error) {
      if (String(error).includes('document')) return false
      throw error
    }
  }, { timeout: 60000, timeoutMsg: 'Menu action did not mount its document' })
  await waitForStableCanvas()
  return (await selectionDocument()).id
}

async function captureInEditor(previousId?: string): Promise<string> {
  await $('button[aria-label="Capture"]').click()
  await browser.waitUntil(async () => (await quickWindowVisibility()).quick, { timeout: 45000 })
  await browser.tauri.switchWindow('quick-capture')
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
  await $('.cs-quick-actions button:first-child').click()
  await browser.waitUntil(async () => !(await quickWindowVisibility()).quick)
  await browser.tauri.switchWindow('main')
  return waitForDocument(previousId)
}

describe('Linux tray file and history menu', () => {
  it('opens images and recent documents, refreshes after deletion and limits the recent list', async function () {
    if (process.platform !== 'linux') return
    this.timeout(300000)
    await expect($('.cs-editor-shell')).toExist()
    const empty = await nativeTrayLabels()
    expect(empty.appMenuInstalled).toBe(false)
    expect(empty.items.find((item) => item.id === 'app-version')).toMatchObject({
      enabled: false, text: expect.stringMatching(/^Version \d+\.\d+\.\d+$/),
    })
    expect(empty.menuIds).toEqual([
      'app-version', 'capture-area', 'capture-screen', 'capture-window',
      'capture-active-window', 'capture-repeat', 'show-editor',
      'app-open-image', 'app-history', 'app-recent', 'settings', 'quit',
    ])
    expect(empty.recentLabel).toBe('Recent Captures')
    expect(empty.recent).toEqual([{ id: 'app-empty-history', text: 'No captures yet', enabled: false }])

    const first = await captureInEditor()
    await browser.waitUntil(async () => (await nativeTrayLabels()).recent[0]?.id.startsWith('app-capture:'))
    const firstMenuId = (await nativeTrayLabels()).recent[0]!.id
    const second = await captureInEditor(first)
    await browser.waitUntil(async () => (await nativeTrayLabels()).recent.length === 2)
    await activateTrayLabel('History…')
    await expect($('.cs-history-popover')).toBeDisplayed()
    await expect(browser.$$('.cs-history-capture')).toBeElementsArrayOfSize(2)
    await $('.cs-history-close').click()
    const recent = (await nativeTrayLabels()).recent
    const targetIndex = recent.findIndex((item) => item.id === firstMenuId)
    const target = recent[targetIndex]!
    const occurrence = recent.slice(0, targetIndex).filter((item) => item.text === target.text).length
    await browser.execute(() => {
      type Native = {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<unknown> } }
        __menuRefresh?: Promise<boolean>
      }
      const state = window as unknown as Native
      state.__menuRefresh = Promise.all(Array.from({ length: 40 }, () => state.__TAURI__.core.invoke(
        'history_command', { request: { kind: 'maintain' } },
      ))).then(() => true)
    })
    await activateTrayLabel(target.text, occurrence)
    const refreshed = await browser.execute(async () => {
      const state = window as unknown as { __menuRefresh?: Promise<boolean> }
      return state.__menuRefresh
    })
    expect(refreshed).toBe(true)
    await browser.waitUntil(async () => (await selectionDocument()).id === first)

    await nativeImageIngress('cancel')
    await activateTrayLabel('Open Image…')
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('cancel'))
    expect((await selectionDocument()).id).toBe(first)
    await nativeImageIngress('picker', 'corrupted.png')
    await activateTrayLabel('Open Image…')
    await expect($('.cs-action-feedback')).toHaveAttribute('role', 'alert')
    expect((await selectionDocument()).id).toBe(first)

    let current = first
    let currentMenuId = (await nativeTrayLabels()).recent[0]!.id
    for (let index = 0; index < 4; index += 1) {
      await nativeImageIngress('picker')
      await activateTrayLabel('Open Image…')
      current = await waitForDocument(current)
      await browser.waitUntil(async () => (await nativeTrayLabels()).recent[0]?.id !== currentMenuId)
      currentMenuId = (await nativeTrayLabels()).recent[0]!.id
    }
    await browser.waitUntil(async () => (await nativeTrayLabels()).recent.length === 5)
    const populated = await nativeTrayLabels()
    expect(populated.recent[0]?.id).toBe(currentMenuId)
    expect(populated.recent.every((item) => item.enabled && /\d+×\d+/.test(item.text))).toBe(true)
    expect(populated.recent.slice(0, 4).every((item) => /3840×2160/.test(item.text))).toBe(true)
    expect(populated.recent.some((item) => item.id === firstMenuId)).toBe(false)

    await activateTrayLabel('History…')
    await expect(browser.$$('.cs-history-capture')).toBeElementsArrayOfSize(6)
    await $('[data-history-index="1"] + .cs-history-delete').click()
    await $('button=Delete').click()
    const deleted = populated.recent[1]!.id
    await browser.waitUntil(async () => !(await nativeTrayLabels()).recent.some((item) => item.id === deleted))
    const stale = await activateMenu(deleted).then(() => 'opened', (error: unknown) => String(error))
    expect(stale).toContain('menu item is unavailable')
    expect((await selectionDocument()).id).toBe(current)
    await $('.cs-history-close').click()
    await browser.saveScreenshot(path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'linux-tray-editor.png'))
    await writeFile(path.resolve(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'linux-tray-menu.json'), JSON.stringify({
      empty, populated, afterDeletion: await nativeTrayLabels(), first, second,
    }, null, 2))
  })
})
