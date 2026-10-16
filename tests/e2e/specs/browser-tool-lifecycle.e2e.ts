import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  snapshot,
} from './browser-m06-test-kit'
import { verifyToolLifecycle } from '../tool-lifecycle'

const output = path.resolve('artifacts/tool-lifecycle')
describe('tool and transient panel lifecycle', () => {
  before(async () => {
    await mkdir(output, { recursive: true })
  })
  it('dismisses selection and defaults with native pointer and keyboard input', async () => {
    await browser.setWindowSize(1280, 800)
    await openDrawingHarness()
    await verifyToolLifecycle(output, 'browser')
  })
  it('clears selection on the surrounding background and commits text before switching', async () => {
    await openDrawingHarness()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await $('button[aria-label="Shape"]').click()
    await browser.action('pointer').move({ origin: scene, x: -80, y: -50 }).down({ button: 'left' })
      .move({ origin: 'pointer', x: 75, y: 28, duration: 150 }).up({ button: 'left' }).perform()
    await expect($('.cs-selection-floating-toolbar')).toBeDisplayed()
    const before = await snapshot()
    await browser.action('pointer').move({ origin: $('.cs-canvas-scroll'), x: 280, y: -220 }).down({ button: 'left' }).up({ button: 'left' }).perform()
    await expect($('.cs-selection-floating-toolbar')).not.toExist()
    expect(await snapshot()).toEqual(before)
    await $('button[aria-label="Text"]').click()
    await scene.click({ x: -150, y: 90 })
    await expect($('.cs-text-editor')).toBeDisplayed()
    await browser.keys('Lifecycle text')
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-text-editor')).not.toExist()
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-selection-floating-toolbar')).not.toExist()
    expect((await snapshot()).layers.at(-1)).toMatchObject({ kind: 'text', payload: { content: { text: 'Lifecycle text' } } })
    await browser.saveScreenshot(path.join(output, 'browser-text-switch.png'))
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot()).layers).toHaveLength(before.layers.length)
  })
})
