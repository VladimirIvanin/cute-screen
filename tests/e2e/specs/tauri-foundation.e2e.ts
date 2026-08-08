import { $, expect } from '@wdio/globals'

describe('foundation shell in a real Tauri webview', () => {
  it('boots the empty editor and completes the test capture action', async () => {
    await expect($('h1')).toHaveText('Capture your first screen')
    await expect($('button=Copy')).toBeDisabled()
    await expect($('button=Export')).toBeDisabled()
    await $('button=Capture').click()
    await expect($('[role="status"]')).toHaveText('capture completed')
  })
})
