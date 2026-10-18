import { browser } from '@wdio/globals'
import { verifyQuickHistoryDocument } from '../quick-history'

describe('Quick history after restart', () => {
  it('reopens editable ink and text and decodes the saved result', async () => {
    await verifyQuickHistoryDocument()
    await browser.saveScreenshot('artifacts/tauri-e2e/quick-history-reopened.png')
  })
})
