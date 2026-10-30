import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { setShellPreferences } from './browser-m06-test-kit'
import { writeFile } from 'node:fs/promises'

type SaveWindow = Window & { __cuteScreenE2eM05Save?: { complete(): void; fail(message: string): void } }

async function layout() {
  return browser.execute(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const notice = document.querySelector('.cs-save-status')?.getBoundingClientRect()
    const feedback = document.querySelector('.cs-action-feedback')?.getBoundingClientRect()
    return { header: box('.cs-topbar'), canvas: box('.cs-canvas:not(.cs-canvas-overlay)'),
      dock: box('.cs-composition-panel'), viewport: box('.cs-viewport'),
      noticeWidth: notice?.width ?? 0,
      overlap: Boolean(notice && feedback && notice.left < feedback.right && notice.right > feedback.left
        && notice.top < feedback.bottom && notice.bottom > feedback.top) }
  })
}

describe('save notices leave the editor in place', () => {
  for (const locale of ['en', 'ru'] as const) for (const width of [1600, 1024] as const) for (const theme of ['dark', 'light'] as const) {
    it(`keeps saving, recovery and action feedback compact in ${locale}/${theme} at ${width}px`, async () => {
      await browser.setWindowSize(width, 900)
      await browser.url('/?m05=1&m05viewport=1&m05DeferredSave=1&captureCancelled=1')
      await expect($('.cs-canvas-ready')).toExist()
      await setShellPreferences(locale, theme)
      await $(locale === 'ru' ? 'button[aria-label="Оформление"]' : 'button[aria-label="Appearance"]').click()
      await $('[data-tool-id="arrow"]').click()
      const before = await layout()
      const x = Math.round(before.canvas.x + before.canvas.width * 0.4)
      const y = Math.round(before.canvas.y + before.canvas.height * 0.4)
      await browser.action('pointer').move({ origin: 'viewport', x, y }).down({ button: 'left' })
        .move({ origin: 'viewport', x: x + 80, y: y + 50, duration: 150 }).up({ button: 'left' }).perform()
      await expect($('.cs-save-status[data-state="dirty"]')).toBeDisplayed()
      const dirty = await layout()
      expect(dirty.header).toEqual(before.header)
      expect(dirty.dock).toEqual(before.dock)
      expect(dirty.canvas).toEqual(before.canvas)
      expect(dirty.noticeWidth).toBeLessThan(300)
      if (
        locale === 'ru' &&
        theme === 'dark' &&
        width === 1600
      ) {
        await browser.saveScreenshot('artifacts/browser-e2e/save-notices-dirty.png')
      }
      await expect($('.cs-save-status[data-state="saving"]')).toBeDisplayed()
      const saving = await layout()
      expect(saving.header).toEqual(before.header)
      expect(saving.dock).toEqual(before.dock)
      expect(saving.canvas).toEqual(before.canvas)
      expect(saving.noticeWidth).toBeLessThanOrEqual(480)
      await $(locale === 'ru' ? 'button[aria-label="Снимок"]' : 'button[aria-label="Capture"]').click()
      await expect($('.cs-action-feedback.is-cancelled')).toBeDisplayed()
      expect((await layout()).overlap).toBe(false)
      await browser.execute(() => (window as SaveWindow).__cuteScreenE2eM05Save!.fail('Save failed: ' + 'diagnostic-path/'.repeat(30)))
      await expect($('.cs-save-status[data-state="error"]')).toBeDisplayed()
      const failed = await layout()
      expect(failed.header).toEqual(before.header)
      expect(failed.dock).toEqual(before.dock)
      expect(failed.canvas).toEqual(before.canvas)
      expect(failed.noticeWidth).toBeLessThanOrEqual(480)
      expect(failed.overlap).toBe(false)
      await browser.saveScreenshot(`artifacts/browser-e2e/save-notices-${locale}-${theme}-${width}.png`)
      await $('.cs-save-status').$(locale === 'ru' ? 'button=Повторить' : 'button=Retry').click()
      await expect($('.cs-save-status[data-state="saving"]')).toBeDisplayed()
      await browser.execute(() => (window as SaveWindow).__cuteScreenE2eM05Save!.complete())
      await expect($('.cs-save-status')).not.toExist()
      const saved = await layout()
      for (const state of [dirty, saving, failed, saved]) {
        expect(state.header).toEqual(before.header)
        expect(state.canvas).toEqual(before.canvas)
        expect(state.dock).toEqual(before.dock)
        expect(state.viewport).toEqual(before.viewport)
      }
      await writeFile(`artifacts/browser-e2e/save-notices-${locale}-${theme}-${width}.json`,
        JSON.stringify({ before, dirty, saving, failed, saved }, null, 2))
    }).timeout(90000)
  }
})
