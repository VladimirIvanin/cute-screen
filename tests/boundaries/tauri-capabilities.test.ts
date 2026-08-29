import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

interface TauriCapability {
  readonly windows?: readonly string[]
  readonly permissions?: readonly (string | { readonly identifier?: string })[]
}

describe('production Tauri capability boundary', () => {
  it('keeps quick-capture lifecycle authority behind native commands', async () => {
    const root = process.cwd()
    const [configSource, capabilitySource, defaultCapabilitySource] =
      await Promise.all([
        readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
        readFile(
          path.join(root, 'src-tauri/capabilities/quick-capture.json'),
          'utf8',
        ),
        readFile(
          path.join(root, 'src-tauri/capabilities/default.json'),
          'utf8',
        ),
      ])
    const config = JSON.parse(configSource) as {
      readonly app?: {
        readonly security?: { readonly capabilities?: readonly string[] }
      }
    }
    const capability = JSON.parse(capabilitySource) as TauriCapability
    const defaultCapability = JSON.parse(
      defaultCapabilitySource,
    ) as TauriCapability
    const permissionIdentifiers = capability.permissions?.map((permission) =>
      typeof permission === 'string' ? permission : permission.identifier,
    )

    expect(config.app?.security?.capabilities).toContain('quick-capture')
    expect(capability.windows).toContain('quick-capture')
    expect(permissionIdentifiers).toContain(
      'notification:allow-is-permission-granted',
    )
    expect(permissionIdentifiers).not.toContain('notification:default')
    expect(permissionIdentifiers).not.toContain('notification:allow-notify')
    expect(permissionIdentifiers).not.toContain(
      'notification:allow-request-permission',
    )
    expect(permissionIdentifiers).not.toContain('core:window:allow-close')
    expect(defaultCapability.windows).not.toContain('quick-capture')
  })
})
