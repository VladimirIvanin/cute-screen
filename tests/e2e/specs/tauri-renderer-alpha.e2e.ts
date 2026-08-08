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

  it('decodes a scoped alpha fixture into the active renderer', async () => {
    await $('button=Verify image transport').click()
    expect(
      await $('.diagnostic-shell').getAttribute('data-primary-diagnostic'),
    ).toBe('none')
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('asset · 64×64'),
    )
  })
})
