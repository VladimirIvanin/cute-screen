import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  describe,
  expect,
  it,
} from 'vitest'

interface TauriCapability {
  readonly windows?: readonly string[]
  readonly permissions?: readonly (string | { readonly identifier?: string })[]
}

describe('production Tauri capability boundary', () => {
  it('allows the emoji attribution URL only in editor windows and the native harness', async () => {
    const root = process.cwd()
    const capability = JSON.parse(await readFile(path.join(root, 'src-tauri/capabilities/emoji-attribution.json'), 'utf8'))
    expect(capability.windows).toEqual(['main', 'quick-capture'])
    expect(capability.permissions).toEqual([{
      identifier: 'opener:allow-open-url',
      allow: [{ url: 'https://github.com/googlefonts/noto-emoji' }],
    }])
    for (const file of ['tauri.conf.json', 'tauri.test.conf.json']) {
      const config = JSON.parse(await readFile(path.join(root, 'src-tauri', file), 'utf8'))
      expect(config.app.security.capabilities).toContain('emoji-attribution')
    }
  })

  it('keeps quick-capture lifecycle authority behind native commands', async () => {
    const root = process.cwd()
    const [configSource, capabilitySource, defaultCapabilitySource] = await Promise.all([
      readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
      readFile(path.join(root, 'src-tauri/capabilities/quick-capture.json'), 'utf8'),
      readFile(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'),
    ])
    const config = JSON.parse(configSource) as {
      readonly app?: {
        readonly security?: { readonly capabilities?: readonly string[] }
      }
    }
    const capability = JSON.parse(capabilitySource) as TauriCapability
    const defaultCapability = JSON.parse(defaultCapabilitySource) as TauriCapability
    const permissionIdentifiers = capability.permissions?.map((permission) =>
      typeof permission === 'string' ? permission : permission.identifier)

    expect(config.app?.security?.capabilities).toContain('quick-capture')
    expect(capability.windows).toContain('quick-capture')
    expect(permissionIdentifiers).toContain('notification:allow-is-permission-granted')
    expect(permissionIdentifiers).not.toContain('notification:default')
    expect(permissionIdentifiers).not.toContain('notification:allow-notify')
    expect(permissionIdentifiers).not.toContain('notification:allow-request-permission')
    expect(permissionIdentifiers).not.toContain('core:window:allow-close')
    expect(defaultCapability.windows).not.toContain('quick-capture')
  })

  it('lets every webview read notification state for the plugin init script', async () => {
    const root = process.cwd()
    const names = ['default', 'quick-capture', 'settings']
    const capabilities = await Promise.all(names.map(async (name) => JSON.parse(
      await readFile(path.join(root, `src-tauri/capabilities/${name}.json`), 'utf8'),
    ) as TauriCapability))
    const identifiers = (capability: TauriCapability) => capability.permissions?.map((permission) =>
      typeof permission === 'string' ? permission : permission.identifier) ?? []
    const readsState = (capability: TauriCapability) => identifiers(capability).some((identifier) =>
      identifier === 'notification:default' || identifier === 'notification:allow-is-permission-granted')

    for (const window of ['main', 'quick-capture', 'settings']) {
      const capability = capabilities.find((candidate) => candidate.windows?.includes(window))
      expect(capability, window).toBeDefined()
      expect(capability && readsState(capability), window).toBe(true)
    }
    const settings = identifiers(capabilities[2] as TauriCapability)
    expect(settings).not.toContain('notification:default')
    expect(settings).not.toContain('notification:allow-notify')
    expect(settings).not.toContain('notification:allow-request-permission')
  })
})
