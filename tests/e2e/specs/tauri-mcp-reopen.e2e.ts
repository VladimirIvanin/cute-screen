import { expect } from '@wdio/globals'
import { loadImage } from '@napi-rs/canvas'
import { connectAgent } from '../mcp-settings'

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
})
