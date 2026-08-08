import { $, expect } from '@wdio/globals'

import {
  expectStartupBackend,
  waitForHarnessMount,
} from '../m01-renderer-harness'

describe('M01 EXIF transport in a real Tauri webview', () => {
  before(async () => {
    await waitForHarnessMount()
    await expectStartupBackend()
  })

  it('decodes the EXIF-orientation fixture from the scoped asset', async () => {
    await $('button=Verify image transport').click()
    expect(
      await $('.diagnostic-shell').getAttribute('data-primary-diagnostic'),
    ).toBe('none')
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('asset · 64×32 · rgba(24,38,52,255)'),
    )
  })
})
