import { readFile } from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface ArchitectureConfig {
  readonly budgets: {
    readonly productionLines: number
    readonly testLines: number
  }
  readonly temporaryLineExceptions: readonly {
    readonly path: string
    readonly max: number
    readonly removeBy: string
    readonly reason: string
  }[]
  readonly temporaryTauriImports: readonly {
    readonly path: string
    readonly removeBy: string
    readonly reason: string
  }[]
}

const sourcePatterns: string[] = [
  'apps/desktop/src/**/*.{ts,vue}',
  'packages/*/src/**/*.{ts,vue}',
  'tests/**/*.ts',
]

function implementationSource(source: string): string {
  const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/u)
  return match?.[1] ?? source
}

function importSpecifiers(source: string, filename: string): readonly string[] {
  const file = ts.createSourceFile(
    filename,
    implementationSource(source),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const specifiers: string[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const dynamicSpecifier = node.arguments[0]
      if (dynamicSpecifier && ts.isStringLiteral(dynamicSpecifier)) {
        specifiers.push(dynamicSpecifier.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return specifiers
}

function countedLines(source: string): number {
  let inBlockComment = false
  let count = 0
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false
      continue
    }
    if (!line) continue
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true
      continue
    }
    if (line.startsWith('//') || line.startsWith('*')) continue
    count += 1
  }
  return count
}

function isTestFile(filename: string): boolean {
  return /(?:(?:test|spec)\.ts|\.e2e\.ts)$/u.test(filename)
}

describe('TypeScript architecture', () => {
  it('keeps package dependencies pointing toward editor-core', async () => {
    const files = await fg(sourcePatterns)
    const violations: string[] = []
    for (const filename of files) {
      const source = await readFile(filename, 'utf8')
      for (const specifier of importSpecifiers(source, filename)) {
        if (
          filename.startsWith('packages/editor-core/') &&
          /^(?:vue|@tauri-apps|@cute-screen\/editor-(?:renderer|vue))/u.test(
            specifier,
          )
        ) {
          violations.push(`${filename}: ${specifier}`)
        }
        if (
          filename.startsWith('packages/editor-renderer/') &&
          /^(?:vue|@tauri-apps|@cute-screen\/editor-vue)/u.test(specifier)
        ) {
          violations.push(`${filename}: ${specifier}`)
        }
        if (
          filename.startsWith('packages/editor-vue/') &&
          /^(?:@tauri-apps|@cute-screen\/desktop)/u.test(specifier)
        ) {
          violations.push(`${filename}: ${specifier}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('allows Tauri imports only through the desktop platform facade', async () => {
    const config = JSON.parse(
      await readFile('config/typescript-architecture.json', 'utf8'),
    ) as ArchitectureConfig
    const temporaryImports = new Set(
      config.temporaryTauriImports.map((entry) => entry.path),
    )
    const files = await fg('apps/desktop/src/**/*.{ts,vue}')
    const violations: string[] = []
    for (const filename of files) {
      const source = await readFile(filename, 'utf8')
      const importsTauri = importSpecifiers(source, filename).some((value) =>
        value.startsWith('@tauri-apps/'),
      )
      const isCurrentFacade = filename === 'apps/desktop/src/desktop-bridge.ts'
      const isTargetFacade = filename.startsWith(
        'apps/desktop/src/platform/tauri/',
      )
      if (
        importsTauri &&
        !isCurrentFacade &&
        !isTargetFacade &&
        !temporaryImports.has(filename)
      ) {
        violations.push(filename)
      }
    }
    for (const entry of config.temporaryTauriImports) {
      expect(entry.reason.trim(), `${entry.path} reason`).not.toBe('')
      expect(entry.removeBy.trim(), `${entry.path} removal phase`).not.toBe('')
    }
    expect(violations).toEqual([])
  })

  it('ratchets implementation and test file sizes', async () => {
    const config = JSON.parse(
      await readFile('config/typescript-architecture.json', 'utf8'),
    ) as ArchitectureConfig
    const exceptions = new Map(
      config.temporaryLineExceptions.map((entry) => [entry.path, entry]),
    )
    const files = await fg(sourcePatterns)
    const violations: string[] = []
    for (const filename of files) {
      if (
        filename.includes('/generated/') ||
        filename.endsWith('.d.ts') ||
        filename.endsWith('canvaskit-wasm-shim.d.ts')
      ) {
        continue
      }
      const count = countedLines(await readFile(filename, 'utf8'))
      const budget = isTestFile(filename)
        ? config.budgets.testLines
        : config.budgets.productionLines
      const exception = exceptions.get(filename)
      const limit = exception?.max ?? budget
      if (count > limit) violations.push(`${filename}: ${count} > ${limit}`)
    }
    for (const entry of config.temporaryLineExceptions) {
      expect(entry.reason.trim(), `${entry.path} reason`).not.toBe('')
      expect(entry.removeBy.trim(), `${entry.path} removal phase`).not.toBe('')
    }
    expect(violations).toEqual([])
  })

  it('keeps the architecture config rooted in the repository', () => {
    expect(path.isAbsolute('config/typescript-architecture.json')).toBe(false)
  })
})
