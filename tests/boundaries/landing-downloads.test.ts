import { readFile } from 'node:fs/promises'

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  detectDownloadOS,
  resolveDownload,
} from '../../apps/landing/assets/download-platform'
import type { DownloadNavigator } from '../../apps/landing/assets/download-platform'
import { downloadsHTML } from '../../apps/landing/downloads-html'
import {
  createLandingCatalog,
  fetchLandingCatalog,
  readLandingCatalog,
  selectLandingCatalog,
} from '../../scripts/landing-release.mjs'

const snapshotPath = 'apps/landing/assets/release.json'
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))

function release(tag = snapshot.tag) {
  const catalog = JSON.parse(JSON.stringify(snapshot).replaceAll(snapshot.tag.slice(1), tag.slice(1)))
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      ...catalog.files.map((file: { name: string; url: string }) => ({ name: file.name, browser_download_url: file.url, size: 100, state: 'uploaded' })),
      { name: 'SHA256SUMS', browser_download_url: catalog.checksumsUrl, size: 100, state: 'uploaded' },
    ],
  }
}

function navigatorSource(
  platform: string,
  architecture = 'x86',
  bitness = '64',
): DownloadNavigator {
  return {
    userAgent: 'Mozilla/5.0',
    maxTouchPoints: 0,
    userAgentData: { platform, getHighEntropyValues: async () => ({ architecture, bitness }) },
  }
}

describe('landing download recommendation', () => {
  it.each([
    ['Windows', 'x86', '64', { os: 'windows', architecture: 'x64' }],
    ['Windows', 'arm', '64', { os: 'windows', architecture: 'arm64' }],
    ['Linux', 'x86', '64', { os: 'linux', architecture: 'x64' }],
    ['Linux', 'arm', '64', { os: 'linux', architecture: 'arm64' }],
    ['Windows', 'x86', '32', null],
    ['Linux', 'arm', '32', null],
    ['Linux', '', '', { os: 'linux', architecture: 'x64' }],
    ['macOS', 'arm', '64', { os: 'macos', architecture: 'universal' }],
  ])('selects %s / %s / %s', async (os, architecture, bitness, expected) => {
    expect(await resolveDownload(navigatorSource(os, architecture, bitness))).toEqual(expected)
  })

  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'linux'],
    ['Mozilla/5.0 (Linux; Android 16)', null],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', null],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', null],
    ['Mozilla/5.0 (X11; CrOS x86_64)', null],
    ['Mozilla/5.0 (Windows Phone; Android)', null],
    ['unknown', null],
  ])('uses safe UA fallback for %s', (userAgent, expected) => {
    expect(detectDownloadOS({ userAgent, maxTouchPoints: 0 })).toBe(expected)
  })

  it('excludes iPad desktop UA and mobile hints before desktop classification', () => {
    expect(detectDownloadOS({ userAgent: 'Macintosh; Intel Mac OS X', maxTouchPoints: 5 })).toBeNull()
    const source = navigatorSource('Linux')
    source.userAgentData!.mobile = true
    expect(detectDownloadOS(source)).toBeNull()
    expect(detectDownloadOS(navigatorSource('Chrome OS'))).toBeNull()
    expect(detectDownloadOS(navigatorSource('Android'))).toBeNull()
    expect(detectDownloadOS(navigatorSource('iOS'))).toBeNull()
    expect(detectDownloadOS(navigatorSource('unknown'))).toBeNull()
  })

  it('only requests architecture/bitness and retains x64 when hints are denied or missing', async () => {
    const source = navigatorSource('Windows')
    const getHints = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    source.userAgentData!.getHighEntropyValues = getHints
    expect(await resolveDownload(source)).toEqual({ os: 'windows', architecture: 'x64' })
    expect(getHints).toHaveBeenCalledWith(['architecture', 'bitness'])
    expect(await resolveDownload({ userAgent: 'Linux x86_64', maxTouchPoints: 0 })).toEqual({ os: 'linux', architecture: 'x64' })
    expect(await resolveDownload({ userAgent: 'Linux i686', maxTouchPoints: 0 })).toBeNull()
    expect(await resolveDownload({ userAgent: 'Linux armv7l', maxTouchPoints: 0 })).toBeNull()
    expect(await resolveDownload({ userAgent: 'unknown', maxTouchPoints: 0 })).toBeNull()
  })

  it('handles unexpected hint failures and does not request CPU hints on macOS', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const source = navigatorSource('Linux')
      source.userAgentData!.getHighEntropyValues = async () => {
        throw new Error('Unavailable')
      }
      expect(await resolveDownload(source)).toEqual({ os: 'linux', architecture: 'x64' })
      expect(warn).toHaveBeenCalledOnce()
      const getHints = vi.fn()
      source.userAgentData = { platform: 'macOS', getHighEntropyValues: getHints }
      expect(await resolveDownload(source)).toEqual({ os: 'macos', architecture: 'universal' })
      expect(getHints).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps an explicitly 32-bit UA unsupported when hints are absent or denied', async () => {
    const source = navigatorSource('Linux')
    source.userAgent = 'Mozilla/5.0 (X11; Linux i686)'
    source.userAgentData!.getHighEntropyValues = async () => ({})
    expect(await resolveDownload(source)).toBeNull()
    source.userAgentData!.getHighEntropyValues = async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    }
    expect(await resolveDownload(source)).toBeNull()
  })
})

describe('landing release catalog', () => {
  it('validates the offline release snapshot and renders all seven links in both locales', async () => {
    expect(await readLandingCatalog(snapshotPath)).toEqual(snapshot)
    expect(createLandingCatalog(release())).toEqual(snapshot)
    expect(snapshot.files).toHaveLength(7)
    for (const english of [false, true]) {
      const html = downloadsHTML(snapshot, english)
      for (const file of snapshot.files) expect(html).toContain(`href="${file.url}"`)
      expect(html.match(/class="download-column"/gu)).toHaveLength(3)
      expect(html).toContain('Intel')
      expect(html).toContain('SHA-256')
      expect(html).toContain('AppImage · ARM64')
      expect(html.indexOf('DEB · x64')).toBeLessThan(html.indexOf('AppImage · x64'))
    }
  })

  it('orders numeric SemVer and skips draft, prerelease and incomplete newer releases', () => {
    const draft = { ...release('v9.0.0'), draft: true }
    const prerelease = { ...release('v8.0.0'), prerelease: true }
    const incomplete = release('v7.0.0')
    incomplete.assets.pop()
    expect(selectLandingCatalog([release(), release('v0.1.9'), release('v0.1.10'), draft, prerelease, incomplete]).tag).toBe('v0.1.10')
    expect(selectLandingCatalog([release('v1.9.9'), release('v2.0.0'), release('v1.10.0')]).tag).toBe('v2.0.0')
    expect(() => selectLandingCatalog([draft, incomplete])).toThrow('No complete stable release')
    expect(createLandingCatalog(release('v01.1.5'))).toBeNull()
  })

  it('rejects empty, unfinished, duplicated and foreign download assets', () => {
    for (const patch of [{ size: 0 }, { state: 'new' }, { browser_download_url: 'https://example.com/package.exe' }]) {
      const candidate = release()
      Object.assign(candidate.assets[0]!, patch)
      expect(createLandingCatalog(candidate)).toBeNull()
    }
    const candidate = release()
    candidate.assets.push(candidate.assets[0]!)
    expect(createLandingCatalog(candidate)).toBeNull()
  })

  it('paginates API results and stops publication on API failures', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json(Array.from({ length: 100 }, () => ({ ...release(), draft: true }))))
      .mockResolvedValueOnce(Response.json([release('v0.1.10')]))
    expect((await fetchLandingCatalog({ request })).tag).toBe('v0.1.10')
    expect(request.mock.calls[1]![0]).toContain('page=2')
    await expect(fetchLandingCatalog({ request: async () => new Response('', { status: 403 }) })).rejects.toThrow('HTTP 403')
    await expect(fetchLandingCatalog({ request: async () => Response.json({ error: 'bad' }) })).rejects.toThrow('Invalid GitHub')
    await expect(fetchLandingCatalog({ request: async () => {
      throw new Error('offline')
    } })).rejects.toThrow('offline')
  })
})
