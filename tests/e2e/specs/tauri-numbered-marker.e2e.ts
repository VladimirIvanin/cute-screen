import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { Key } from 'webdriverio'
import { waitForStableCanvas } from '../canvas-ready'

async function configure() {
  const tool = $('button[aria-label="Numbered marker"]')
  await tool.click()
  await browser.keys([Key.Shift, Key.F10])
  await expect($('input[aria-label="Next number"]')).toBeDisplayed()
}
async function place() {
  await $('button[aria-label="Numbered marker"]').click()
  await browser.action('pointer').move({ origin: $('.cs-canvas:not(.cs-canvas-overlay)') })
    .down({ button: 'left' }).up({ button: 'left' }).perform()
}

describe('numbered marker through production Capture → Quick → Editor', () => {
  it('preserves the sequence across WebViews and undoes a number edit', async () => {
    await mkdir('artifacts/numbered-marker', { recursive: true })
    await browser.setWindowSize(1280, 800)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    await place()
    await configure()
    await expect($('input[aria-label="Next number"]')).toHaveValue('2')
    await browser.keys('Escape')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await configure()
    await expect($('input[aria-label="Next number"]')).toHaveValue('2')
    await browser.keys('Escape')
    await place()
    await $('button[aria-label="Select"]').click()
    await $('.cs-canvas:not(.cs-canvas-overlay)').click()
    const number = $('input[aria-label="Number"]')
    await expect(number).toHaveValue('2')
    await number.click()
    await browser.keys([Key.Control, 'a'])
    await browser.keys('7')
    await browser.keys('Enter')
    await expect(number).toHaveValue('7')
    await $('button[aria-label="Undo"]').click()
    await expect(number).toHaveValue('2')
    await $('button=Add label').click()
    const editor = $('[aria-label="Numbered marker editor"]')
    await expect(editor).toBeDisplayed()
    await browser.keys('Check settings')
    await browser.keys([Key.Control, Key.Enter])
    await expect(editor).not.toExist()
    await expect(number).toHaveValue('2')
    await expect($('button=Edit label')).toBeDisplayed()
    await browser.saveScreenshot(path.resolve('artifacts/numbered-marker/native-editor.png'))
    await $('button[aria-label="Undo"]').click()
    await expect($('button=Add label')).toBeDisplayed()
    await expect(number).toHaveValue('2')
  })
})
