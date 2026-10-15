import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cacheDownloadedEdgeDriver } from '../../scripts/tauri-driver-cache.mjs'

describe('Windows native driver cache', () => {
  it('preserves a completed download for the next isolated WDIO process', async () => {
    const root = await mkdtemp(path.resolve('artifacts/driver-cache-contract-'))
    try {
      const downloads = path.join(root, 'runtime', 'msedgedriver')
      const completed = path.join(downloads, '155-0123456789abcdef')
      const incomplete = path.join(downloads, '155-fedcba9876543210')
      const cache = path.join(root, 'driver-cache')
      await mkdir(completed, { recursive: true })
      await mkdir(incomplete, { recursive: true })
      await writeFile(path.join(completed, 'msedgedriver.exe'), 'complete driver')
      await cacheDownloadedEdgeDriver(downloads, cache)
      expect(await readFile(path.join(cache, 'msedgedriver.exe'), 'utf8')).toBe('complete driver')
      await cacheDownloadedEdgeDriver(downloads, cache)
      expect(await readFile(path.join(cache, 'msedgedriver.exe'), 'utf8')).toBe('complete driver')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
