import { $, browser, expect } from '@wdio/globals'
import {
  baseId,
  m08Snapshot,
  m08VersionToken,
  recentColourHex,
  openM08,
  chooseOption,
  drawPrecisionTool,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('keeps locked precision controls unfocusable and history/default neutral, then commits one update after unlock', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()
    await drawPrecisionTool('Hide data', 'censor', 0)
    const created = (await m08Snapshot()).document.layers.at(-1)
    if (!created || created.kind !== 'censor') {
      throw new Error('expected censor')
    }
    const row = $(`[data-layer-id="${created.id}"]`)
    await row.$('.cs-layer-select').click()
    await row.$('button[aria-label="Lock layer"]').click()
    await browser.waitUntil(
      async () => (await m08Snapshot()).document.layers.at(-1)?.locked === true,
    )

    const effect = $('[role="combobox"][aria-label="Effect"]')
    const blockSize = $('[role="slider"][aria-label="Block size"]')
    await expect(effect).toHaveAttribute('aria-disabled', 'true')
    await expect(blockSize).toHaveAttribute('aria-disabled', 'true')
    const before = await m08Snapshot()
    const versionBefore = await m08VersionToken()
    const disabledFocusState = await browser.execute(() => {
      const target = [
        ...document.querySelectorAll<HTMLElement>('[role="combobox"]'),
      ].find((element) => element.getAttribute('aria-label') === 'Effect')
      if (!target) throw new Error('Effect control is missing')
      target.focus()
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
        }),
      )
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      )
      target.click()
      return {
        focused: document.activeElement === target,
        tabIndex: target.getAttribute('tabindex'),
      }
    })
    expect(disabledFocusState.tabIndex).toBe('-1')
    expect(await m08VersionToken()).toBe(versionBefore)
    expect((await m08Snapshot()).document).toEqual(before.document)
    expect(await recentColourHex()).toBeUndefined()

    await $(`[data-layer-id="${baseId}"] .cs-layer-select`).click()
    await expect(effect).toHaveText('Pixelate')
    await row.$('.cs-layer-select').click()
    await row.$('button[aria-label="Unlock layer"]').click()
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.locked === false,
    )
    const versionAfterUnlock = await m08VersionToken()
    await chooseOption('Effect', 'Blur')
    await browser.waitUntil(
      async () =>
        (await m08Snapshot()).document.layers.at(-1)?.payload.effect &&
        (
          (await m08Snapshot()).document.layers.at(-1)?.payload.effect as {
            mode?: string
          }
        ).mode === 'blur',
    )
    expect(await m08VersionToken()).toBe(versionAfterUnlock + 1)
  })
})
