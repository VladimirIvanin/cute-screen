import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import {
  connectAgent,
  parseMcpConfiguration,
} from '../mcp-settings'
import { McpClient } from '../mcp-client'

// The runner reopens the same isolated appData after terminating the first process.
describe('MCP saved document after application restart', () => {
  it('restores annotations and crop through production startup and creates a new session token', async () => {
    const client = await connectAgent()
    try {
      const snapshot = await client.data('get_document')
      const document = snapshot.document as { id: string; crop: { width: number }; layers: unknown[] }
      expect(document.crop.width).toBe(3200)
      expect(JSON.stringify(document.layers)).toContain('MCP reviewed')
      expect(snapshot.canUndo).toBe(false)
      const preview = await client.call('get_preview', { documentId: document.id, expectedStateToken: snapshot.stateToken })
      expect(preview.isError).not.toBe(true)
      const image = await loadImage(Buffer.from(preview.content.find((item) => item.type === 'image')!.data!, 'base64'))
      expect(image.width).toBe(1536)
    } finally {
      await client.close()
    }
  })
  it('opens the same saved connection after restart and authenticates without issuing a new key', async () => {
    const retained = JSON.parse(await readFile(path.join(process.env.CUTE_SCREEN_WDIO_ARTIFACTS!, 'mcp-retained-connection.json'), 'utf8')) as { id: string; configHash: string }
    await browser.tauri.switchWindow('settings')
    const row = $(`[data-connection-id="${retained.id}"]`)
    await row.$('button[aria-label^="Open configuration "]').click()
    await expect($('.cs-agent-settings')).toHaveAttribute('aria-busy', 'false')
    const config = await $('#mcp-config').getValue()
    expect(createHash('sha256').update(config).digest('hex')).toBe(retained.configHash)
    const client = new McpClient(parseMcpConfiguration(config))
    try {
      await client.initialize()
      expect((await client.data('get_status')).ready).toBe(true)
      await row.$('button[aria-label^="Copy configuration "]').click()
      await expect($('.cs-agent-settings p[role="status"]')).toHaveText('Configuration copied')
      await $('button=Hide configuration').click()
      await browser.saveScreenshot(`${process.env.CUTE_SCREEN_WDIO_ARTIFACTS}/mcp-connection-reopen.png`)
    } finally {
      await client.close()
    }
  })
})
