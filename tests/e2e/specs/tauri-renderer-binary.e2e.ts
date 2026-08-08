import { $, expect } from '@wdio/globals'

import {
  expectStartupBackend,
  waitForHarnessMount,
} from '../m01-renderer-harness'

describe('M01 renderer and transport in a real Tauri webview', () => {
  before(async () => {
    await waitForHarnessMount()
    await expectStartupBackend()
  })

  it('uses binary IPC when the asset URL is denied', async () => {
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('binary · 64×64 · rgba(24,38,52,255)'),
    )
  })
})
