import { $, expect } from '@wdio/globals'

describe('foundation shell in a real Tauri webview', () => {
  it('boots, completes typed Rust IPC, and lets the runner close cleanly', async () => {
    await expect($('h1')).toHaveText('Cute Screen workspace is ready')
    await $('button=Check desktop bridge').click()
    await expect($('[role="status"]')).toHaveText(
      'Desktop bridge ready · protocol 1',
    )
  })
})
