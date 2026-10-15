import {
  $,
  expect,
} from '@wdio/globals'

import {
  waitForHarnessMount,
} from '../m01-renderer-harness'

describe('M01 renderer and transport in a real Tauri webview', () => {
  before(async () => {
    await waitForHarnessMount()
  })

  it('reports a corrupted fixture as a typed failure', async () => {
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics [role="alert"]')).toHaveText('error')
  })
})
