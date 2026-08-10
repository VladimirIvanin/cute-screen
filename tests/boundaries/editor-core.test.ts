import { readFile } from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

const restrictedImports = [
  /^vue(?:\/|$)/u,
  /^@tauri-apps(?:\/|$)/u,
  /^@cute-screen\/editor-renderer$/u,
  /^@cute-screen\/editor-vue$/u,
]

describe('editor-core dependency boundary', () => {
  it('has no DOM TypeScript library and imports no upper layer', async () => {
    const root = process.cwd()
    const config = JSON.parse(
      await readFile(
        path.join(root, 'packages/editor-core/tsconfig.json'),
        'utf8',
      ),
    )
    expect(config.compilerOptions.lib).toEqual(['ES2023'])

    const sources = await fg('packages/editor-core/src/**/*.ts', { cwd: root })
    const violations = []

    for (const source of sources) {
      const code = await readFile(path.join(root, source), 'utf8')
      const specifiers = code.matchAll(
        /(?:from\s+|import\s*\()['"]([^'"]+)['"]/gu,
      )
      for (const match of specifiers) {
        const specifier = match[1] ?? ''
        if (restrictedImports.some((pattern) => pattern.test(specifier))) {
          violations.push(`${source}: ${specifier}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps internal package dependencies pointing toward core', async () => {
    const root = process.cwd()
    const expectedInternalDependencies = new Map([
      ['packages/editor-core/package.json', []],
      ['packages/editor-renderer/package.json', ['@cute-screen/editor-core']],
      ['packages/editor-vue/package.json', ['@cute-screen/editor-renderer']],
      ['apps/desktop/package.json', ['@cute-screen/editor-vue']],
    ])

    for (const [manifestPath, expected] of expectedInternalDependencies) {
      const manifest = JSON.parse(
        await readFile(path.join(root, manifestPath), 'utf8'),
      )
      const dependencies = Object.keys(manifest.dependencies ?? {}).filter(
        (dependency) => dependency.startsWith('@cute-screen/'),
      )

      expect(dependencies, manifestPath).toEqual(expected)
    }
  })
})

describe('M05 icon-system boundary', () => {
  it('keeps Lucide imports and SVG markup behind the typed UiIcon adapter', async () => {
    const root = process.cwd()
    const sources = await fg('packages/editor-vue/src/**/*.ts', { cwd: root })
    const violations: string[] = []
    for (const source of sources) {
      const code = await readFile(path.join(root, source), 'utf8')
      if (
        source !== 'packages/editor-vue/src/shell/icon.ts' &&
        code.includes("from '@lucide/vue'")
      ) {
        violations.push(`${source}: direct Lucide import`)
      }
      if (source.includes('/shell/components/') && /<svg(?:\s|>)/u.test(code)) {
        violations.push(`${source}: inline SVG`)
      }
    }
    expect(violations).toEqual([])
  })

  it('maps every declared semantic IconName in the central adapter', async () => {
    const root = process.cwd()
    const [types, icon] = await Promise.all([
      readFile(
        path.join(root, 'packages/editor-vue/src/shell/types.ts'),
        'utf8',
      ),
      readFile(
        path.join(root, 'packages/editor-vue/src/shell/icon.ts'),
        'utf8',
      ),
    ])
    const iconType = types.match(
      /export type IconName =([\s\S]*?)\n\nexport const/u,
    )?.[1]
    if (!iconType) throw new Error('IconName declaration is missing')
    const names = [...iconType.matchAll(/\| '([A-Za-z]+)'/gu)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const name of names) {
      expect(icon).toContain(`${name}:`)
    }
  })
})
