import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { focusMainTauriWindow } from '../e2e/main-window'

interface PackageManifest {
  scripts?: Record<string, string>
}

describe('Tauri build boundary', () => {
  it('builds frontendDist before compiling the custom protocol feature', async () => {
    const root = process.cwd()
    const manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as PackageManifest
    const config = JSON.parse(
      await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    ) as { build?: { frontendDist?: string } }

    expect(config.build?.frontendDist).toBe('../apps/desktop/dist')
    expect(manifest.scripts?.['build:frontend']).toBe(
      'vite build --config apps/desktop/vite.config.ts',
    )

    const rustCheckSteps = manifest.scripts?.['check:rust']?.split(' && ') ?? []
    const frontendBuildIndex = rustCheckSteps.indexOf('pnpm build:frontend')
    const customProtocolCompileIndex = rustCheckSteps.findIndex((step) =>
      step.includes('cargo clippy --workspace --lib --bins --all-features'),
    )

    expect(frontendBuildIndex).toBeGreaterThanOrEqual(0)
    expect(customProtocolCompileIndex).toBeGreaterThan(frontendBuildIndex)
  })

  it('selects the editor WebView before a real-Tauri scenario starts', async () => {
    const selectedLabels: string[] = []
    const configSource = await readFile(
      path.join(process.cwd(), 'tests', 'e2e', 'wdio.tauri.conf.ts'),
      'utf8',
    )

    await focusMainTauriWindow({
      switchToWindow: async (label) => {
        selectedLabels.push(label)
      },
    })

    expect(selectedLabels).toEqual(['main'])
    expect(configSource).toContain('await focusMainTauriWindow(browser)')
  })

  it('resolves an E2E harness query before evaluating the desktop app module', async () => {
    const mainSource = await readFile(
      path.join(process.cwd(), 'apps', 'desktop', 'src', 'main.ts'),
      'utf8',
    )

    expect(mainSource).not.toContain("import App from './App.vue'")
    expect(mainSource).toContain("(await import('./App.vue')).default")
  })
})
