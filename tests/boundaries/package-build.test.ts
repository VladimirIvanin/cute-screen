import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  expect,
  it,
} from 'vitest'
import { cleanPackageOutputs } from '../../scripts/clean-package-outputs.mjs'

it('removes obsolete file modules that shadow current directory modules before rebuilding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cute-screen-package-build-'))
  try {
    for (const name of ['editor-core', 'editor-renderer']) {
      const output = path.join(root, 'packages', name, 'dist')
      await mkdir(path.join(output, 'document', 'scene'), { recursive: true })
      await writeFile(path.join(output, 'document', 'scene.js'), 'throw new Error("obsolete single aperture")')
      await writeFile(path.join(output, 'document', 'scene', 'index.js'), 'export const current = true')
    }
    await cleanPackageOutputs(root)
    for (const name of ['editor-core', 'editor-renderer']) {
      await expect(access(path.join(root, 'packages', name, 'dist'))).rejects.toThrow()
    }
    // A second clean and a first build from a clean checkout are both valid.
    await cleanPackageOutputs(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('forces TypeScript emission after cleaning and resolves the current sources in desktop Vite', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> }
  expect(manifest.scripts['build:packages']).toMatch(/^node scripts\/clean-package-outputs.mjs && vue-tsc -b --force /)
  const vite = await readFile('apps/desktop/vite.config.ts', 'utf8')
  for (const name of ['editor-core', 'editor-renderer']) {
    expect(vite).toContain(`'@cute-screen/${name}': fileURLToPath(`)
    expect(vite).toContain(`../../packages/${name}/src/index.ts`)
  }
})
