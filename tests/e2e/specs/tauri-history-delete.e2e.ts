import { waitForHistoryDocument } from '../history-soak'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'

describe('history cleanup through the real webview', () => {
  it('previews shared bytes, deletes the active capture and clears the last protected capture explicitly', async () => {
    await waitForHistoryDocument()
    await $('.cs-history-trigger').click()
    await expect($('[data-history-index="0"]')).toBeDisplayed()
    await $('.cs-history-clear').click()
    await expect($('[role="alertdialog"]')).toHaveText(expect.stringContaining('Captures and annotations to delete: 0.'))
    await expect($('[role="alertdialog"]').$('button=Clear history')).toBeDisabled()
    await expect($('.cs-history-cancel')).toBeFocused()
    await $('.cs-history-cancel').click()
    await expect($$('.cs-history-card')).toBeElementsArrayOfSize(2)
    await $('[data-history-index="1"] ~ .cs-history-protect').click()
    await expect($('[data-history-index="1"] ~ .cs-history-protect')).toHaveAttribute('aria-pressed', 'false')
    await $('.cs-history-clear').click()
    await expect($('[role="alertdialog"]')).toHaveText(expect.stringContaining('Captures and annotations to delete: 1.'))
    await $('.cs-history-cancel').click()
    await $('[data-history-index="1"] ~ .cs-history-protect').click()
    await expect($('[data-history-index="1"] ~ .cs-history-protect')).toHaveAttribute('aria-pressed', 'true')
    await $('[data-history-index="0"] + .cs-history-delete').click()
    await expect($('button=Delete')).toBeDisplayed()
    await $('button=Cancel').click()
    await $('[data-history-index="0"] + .cs-history-delete').click()
    await $('button=Delete').click()
    await browser.waitUntil(async () => await browser.$$('.cs-history-capture').length === 1)
    await $('[data-history-index="0"] + .cs-history-delete').click()
    await $('button=Delete').click()
    await expect($('h1')).toHaveText('Capture your first screen')
    await expect($('.cs-history-scroll')).toHaveText('Take a capture to see it here')
    await expect($('button[aria-label="Capture"]')).toBeEnabled()
  })
})
