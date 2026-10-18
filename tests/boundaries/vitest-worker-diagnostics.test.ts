import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  afterEach,
  expect,
  it,
} from 'vitest'

const exec = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function runWorker(body: string) {
  const artifacts = path.join(process.cwd(), 'artifacts')
  await mkdir(artifacts, { recursive: true })
  const root = await mkdtemp(path.join(artifacts, 'vitest-worker-exit-'))
  roots.push(root)
  await writeFile(path.join(root, 'vitest.config.mjs'), `export default {
    test: { name: 'worker-diagnostic-probe', include: ['probe.test.mjs'], pool: 'forks', maxWorkers: 1 },
  }`)
  await writeFile(path.join(root, 'probe.test.mjs'), `import { expect, it } from 'vitest'
    it('worker probe', () => { ${body} })`)
  const result = await exec(process.execPath, [
    path.join(process.cwd(), 'node_modules/vitest/vitest.mjs'),
    'run',
    '--root', root,
    '--config', path.join(root, 'vitest.config.mjs'),
    '--no-color',
  ], { timeout: 10_000 }).then(
    ({ stdout, stderr }) => ({ code: 0, output: `${stdout}\n${stderr}` }),
    (error: Error & { code?: number; stdout?: string; stderr?: string }) => ({
      code: error.code,
      output: `${error.stdout ?? ''}\n${error.stderr ?? ''}`,
    }),
  )
  return result
}

it('reports the assigned file and exit code without turning a crashed worker into a pass', async () => {
  // Bypass Vitest's process.exit assertion guard, as a native runtime exit would.
  const result = await runWorker('process.reallyExit(23)')
  expect(result.code).toBe(1)
  expect(result.output).toContain('Worker exited unexpectedly')
  expect(result.output).toContain('code: 23')
  expect(result.output).toContain('signal: none')
  expect(result.output).toContain('project: worker-diagnostic-probe')
  expect(result.output).toContain('probe.test.mjs')
})

it.runIf(process.platform !== 'win32')('reports SIGKILL from a real worker process', async () => {
  const result = await runWorker("process.kill(process.pid, 'SIGKILL')")
  expect(result.code).toBe(1)
  expect(result.output).toContain('Worker exited unexpectedly')
  expect(result.output).toContain('code: none')
  expect(result.output).toContain('signal: SIGKILL')
  expect(result.output).toContain('project: worker-diagnostic-probe')
  expect(result.output).toContain('probe.test.mjs')
})

it('preserves normal passing tests and ordinary assertion failures', async () => {
  const passed = await runWorker('expect(1).toBe(1)')
  expect(passed.code).toBe(0)
  expect(passed.output).not.toContain('Worker exited unexpectedly')
  const failed = await runWorker('expect(1).toBe(2)')
  expect(failed.code).toBe(1)
  expect(failed.output).toContain('expected 1 to be 2')
  expect(failed.output).not.toContain('Worker exited unexpectedly')
})
