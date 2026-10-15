import { readFile } from 'node:fs/promises'
import { ESLint } from 'eslint'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'

const formatter = new ESLint({ overrideConfigFile: 'eslint.format.config.js', fix: true })

beforeAll(async () => {
  await formatter.calculateConfigForFile('formatting-example.ts')
}, 20_000)

async function formatted(
  source: string,
  filePath = 'formatting-example.ts',
): Promise<string> {
  const [result] = await formatter.lintText(source, { filePath })
  expect(result?.messages).toEqual([])
  return result?.output ?? source
}

describe('source formatting contract', () => {
  it('keeps the screenshot import and typed function declaration readable at width 120', async () => {
    const source = [
      "import { DocumentSessionController, type EditorDocumentV1 } from '@cute-screen/editor-vue'",
      'export async function mountM05HarnessDocument(config: AppHarnessConfig, ports: M05HarnessPorts): Promise<void> {}',
      '',
    ].join('\n')
    const result = await formatted(source)
    expect(result).toContain('import {\n  DocumentSessionController,\n  type EditorDocumentV1,\n}')
    expect(result).toContain('mountM05HarnessDocument(\n  config: AppHarnessConfig,\n  ports: M05HarnessPorts,\n)')
    expect(await formatted(result)).toBe(result)
  })

  it('preserves deliberate object and array wrapping while keeping short calls and callbacks compact', async () => {
    const source = [
      'const point = {\n  x: 1,\n  y: 2,\n}',
      'const values = [\n  1,\n  2,\n]',
      'const callback = (left, right) => sum(left, right)',
      '',
    ].join('\n')
    expect(await formatted(source)).toBe(source)
  })

  it('preserves comments, generics, destructuring and rest parameters when wrapping declarations', async () => {
    const source = 'function combine<T>({ value }: { value: T }, /* keep */ ...items: T[]): T[] { return [value, ...items] }\n'
    const result = await formatted(source)
    expect(result).toContain('combine<T>(\n')
    expect(result).toContain('/* keep */')
    expect(result).toContain('...items: T[]\n')
    expect(await formatted(result)).toBe(result)
  })

  it('formats Vue script and template together without collapsing wrapped attributes on a second save', async () => {
    const source = '<script setup lang="ts">\nimport { ref, watch } from "vue"\nfunction update(a: number, b: number) { return a + b }\n</script>\n<template>\n  <button type="button" :disabled="false" @click="update(1, 2)">Run</button>\n</template>\n'
    const result = await formatted(source, 'FormattingExample.vue')
    expect(result).toContain("import {\n  ref,\n  watch,\n} from 'vue'")
    expect(result).toContain('<button\n')
    expect(result).toContain('update(\n  a: number,\n  b: number,\n)')
    expect(await formatted(result, 'FormattingExample.vue')).toBe(result)
  })

  it('rejects multiple statements on a line and overlong code instead of silently accepting compact output', async () => {
    const lint = new ESLint({ overrideConfigFile: 'eslint.format.config.js' })
    const source = `first(); second();\nconst value = ${'veryLongIdentifier + '.repeat(8)}tail\n`
    const [result] = await lint.lintText(source, { filePath: 'formatting-example.ts' })
    const rules = result?.messages.map((message) => message.ruleId)
    expect(rules).toContain('@stylistic/max-statements-per-line')
    expect(rules).toContain('@stylistic/max-len')
    expect(await formatted('function run() { first(); second(); return true }\n')).toContain(
      '  first()\n  second()\n  return true\n',
    )
  })

  it('assigns source formatting to ESLint in commands and editor settings', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8'))
    expect(manifest.scripts.format).toContain('eslint . --config eslint.format.config.js --fix')
    expect(manifest.scripts['format:check']).toContain('eslint . --config eslint.format.config.js')
    const settings = JSON.parse(await readFile('.vscode/settings.json', 'utf8'))
    expect(settings['[javascript][typescript][vue]']['editor.defaultFormatter']).toBe('dbaeumer.vscode-eslint')
    expect(settings['[javascript][typescript][vue]']['editor.formatOnSave']).toBe(true)
  })

  it('wraps the multi-clause guard and named tuple signature from the second screenshot', async () => {
    const source = 'function normalizeAxis(start: number, length: number, limit: number): readonly [start: number, length: number] {\n  if (!Number.isFinite(start) || !Number.isFinite(length) || !Number.isInteger(limit) || length <= 0 || limit <= 0) {\n    throw new RangeError("quick capture selection is invalid")\n  }\n}\n'
    const result = await formatted(source)
    expect(result).toContain('normalizeAxis(\n  start: number,\n  length: number,\n  limit: number,\n)')
    expect(result).toContain('if (\n    !Number.isFinite(start) ||\n    !Number.isFinite(length) ||\n')
    expect(result).toContain('    limit <= 0\n  ) {')
    expect(await formatted(result)).toBe(result)
  })

  it('wraps interface inheritance without changing base order', async () => {
    const source = 'export interface DesktopBridge extends ImageTransportBridge, TextureFillBridge, ContentImageBridge, ClipboardBridge, SystemFontCatalogBridge {}\n'
    const result = await formatted(source)
    expect(result).toContain('extends\n    ImageTransportBridge,\n    TextureFillBridge,\n')
    expect(result).toContain('    ClipboardBridge,\n    SystemFontCatalogBridge {')
    expect(await formatted(result)).toBe(result)
  })
})
