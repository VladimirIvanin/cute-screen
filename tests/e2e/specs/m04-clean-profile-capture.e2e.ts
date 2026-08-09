import { $, expect } from '@wdio/globals'

describe('M04 clean-profile capture', () => {
  it('creates and mounts the first persisted document through the production request flow', async () => {
    await expect($('h1')).toHaveText('Capture your first screen')

    await $('button[aria-label="Capture"]').click()

    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await expect($('nav[aria-label="Series frames"]')).toBeDisplayed()
  })
})
