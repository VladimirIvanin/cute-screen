import { readFile } from 'node:fs/promises'
import path from 'node:path'

import fg from 'fast-glob'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface ArchitectureConfig {
  readonly budgets: {
    readonly productionLines: number
    readonly testLines: number
    readonly functionLines: number
    readonly complexity: number
    readonly depth: number
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
  readonly temporaryStructureExceptions?: readonly {
    readonly path: string
    readonly maxFunctionLines: number
    readonly maxComplexity: number
    readonly maxDepth: number
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
  return /(?:(?:test-kit|test|spec)\.ts|\.e2e\.ts)$/u.test(filename)
}

interface FunctionMetric {
  readonly line: number
  readonly lines: number
  readonly complexity: number
  readonly depth: number
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

function controlFlowDepth(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isConditionalExpression(node)
  )
}

function addsComplexity(node: ts.Node): boolean {
  if (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  ) {
    return true
  }
  if (ts.isCaseClause(node)) return true
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  )
}

function functionMetrics(
  source: string,
  filename: string,
): readonly FunctionMetric[] {
  const file = ts.createSourceFile(
    filename,
    implementationSource(source),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const metrics: FunctionMetric[] = []
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node) && node.body) {
      let complexity = 1
      let maximumDepth = 0
      const visitBody = (child: ts.Node, depth: number): void => {
        if (child !== node && isFunctionLike(child)) return
        if (addsComplexity(child)) complexity += 1
        const nextDepth = controlFlowDepth(child) ? depth + 1 : depth
        maximumDepth = Math.max(maximumDepth, nextDepth)
        ts.forEachChild(child, (nested) => visitBody(nested, nextDepth))
      }
      visitBody(node.body, 0)
      const start = file.getLineAndCharacterOfPosition(node.getStart(file)).line
      const end = file.getLineAndCharacterOfPosition(node.end).line
      metrics.push({
        line: start + 1,
        lines: end - start + 1,
        complexity,
        depth: maximumDepth,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return metrics
}

function packageRoot(filename: string): string | undefined {
  return ['editor-core', 'editor-renderer', 'editor-vue']
    .map((name) => `packages/${name}`)
    .find((root) => filename.startsWith(`${root}/`))
}

function resolveLocalImport(
  filename: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const candidate = path.posix.normalize(
    path.posix.join(path.posix.dirname(filename), specifier),
  )
  return [
    candidate,
    `${candidate}.ts`,
    `${candidate}.vue`,
    `${candidate}/index.ts`,
  ].find((entry) => files.has(entry))
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

  it('does not route package-internal imports through the package root', async () => {
    const files = new Set(await fg(sourcePatterns))
    const violations: string[] = []
    for (const filename of files) {
      const root = packageRoot(filename)
      if (!root || filename === `${root}/src/index.ts`) continue
      const packageName = `@cute-screen/${path.posix.basename(root)}`
      const source = await readFile(filename, 'utf8')
      for (const specifier of importSpecifiers(source, filename)) {
        const resolved = resolveLocalImport(filename, specifier, files)
        if (specifier === packageName || resolved === `${root}/src/index.ts`) {
          violations.push(`${filename}: ${specifier}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps local TypeScript module dependencies acyclic', async () => {
    const productionFiles = new Set(
      (await fg(sourcePatterns)).filter((filename) => !isTestFile(filename)),
    )
    const graph = new Map<string, readonly string[]>()
    for (const filename of productionFiles) {
      const source = await readFile(filename, 'utf8')
      graph.set(
        filename,
        importSpecifiers(source, filename).flatMap((specifier) => {
          const resolved = resolveLocalImport(
            filename,
            specifier,
            productionFiles,
          )
          return resolved === undefined ? [] : [resolved]
        }),
      )
    }
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const cycles: string[] = []
    const visit = (filename: string, stack: readonly string[]): void => {
      if (visiting.has(filename)) {
        const start = stack.indexOf(filename)
        cycles.push([...stack.slice(start), filename].join(' -> '))
        return
      }
      if (visited.has(filename)) return
      visiting.add(filename)
      for (const dependency of graph.get(filename) ?? []) {
        visit(dependency, [...stack, filename])
      }
      visiting.delete(filename)
      visited.add(filename)
    }
    for (const filename of productionFiles) visit(filename, [])
    expect([...new Set(cycles)]).toEqual([])
  })

  it('ratchets function size, complexity and control-flow depth', async () => {
    const config = JSON.parse(
      await readFile('config/typescript-architecture.json', 'utf8'),
    ) as ArchitectureConfig
    const exceptions = new Map(
      (config.temporaryStructureExceptions ?? []).map((entry) => [
        entry.path,
        entry,
      ]),
    )
    const violations: string[] = []
    const files = await fg(sourcePatterns)
    for (const filename of files) {
      if (
        isTestFile(filename) ||
        filename.includes('/generated/') ||
        filename.endsWith('.d.ts')
      ) {
        continue
      }
      const exception = exceptions.get(filename)
      const limits = {
        lines: exception?.maxFunctionLines ?? config.budgets.functionLines,
        complexity: exception?.maxComplexity ?? config.budgets.complexity,
        depth: exception?.maxDepth ?? config.budgets.depth,
      }
      const source = await readFile(filename, 'utf8')
      for (const metric of functionMetrics(source, filename)) {
        if (
          metric.lines > limits.lines ||
          metric.complexity > limits.complexity ||
          metric.depth > limits.depth
        ) {
          violations.push(
            `${filename}:${metric.line} lines=${metric.lines}/${limits.lines} ` +
              `complexity=${metric.complexity}/${limits.complexity} ` +
              `depth=${metric.depth}/${limits.depth}`,
          )
        }
      }
    }
    for (const entry of config.temporaryStructureExceptions ?? []) {
      expect(entry.reason.trim(), `${entry.path} reason`).not.toBe('')
      expect(entry.removeBy.trim(), `${entry.path} removal phase`).not.toBe('')
    }
    expect(violations).toEqual([])
  })

  it('keeps the architecture config rooted in the repository', () => {
    expect(path.isAbsolute('config/typescript-architecture.json')).toBe(false)
  })
})
