import { spawnSync } from 'node:child_process'
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  describe,
  expect,
  it,
} from 'vitest'

describe('Tauri E2E build failure boundary', () => {
  it.each(['fixtures', 'build'])('refuses to launch an old binary after %s fails', async (failure) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'cute-screen-runner-contract-'))
    const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const log = path.join(directory, 'calls.txt')
    const script = process.platform === 'win32'
      ? `@echo off\necho %*>>"%CUTE_SCREEN_RUNNER_LOG%"\n${failure === 'build' ? 'if "%~1"=="fixtures:generate:m01" exit /b 0\n' : ''}exit /b 42\n`
      : `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CUTE_SCREEN_RUNNER_LOG"\n${failure === 'build' ? '[ "$1" = "fixtures:generate:m01" ] && exit 0\n' : ''}exit 42\n`
    try {
      await writeFile(path.join(directory, command), script, { mode: 0o700 })
      const result = spawnSync(process.execPath, [path.resolve('scripts/run-tauri-e2e.mjs')], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${directory}${path.delimiter}${process.env.PATH ?? ''}`,
          CUTE_SCREEN_RUNNER_LOG: log,
          CUTE_SCREEN_E2E_SCENARIOS: 'quick-chrome',
        },
        encoding: 'utf8',
        timeout: 15_000,
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(failure === 'build' ? 'refusing to test a stale' : 'fixture generation failed')
      const calls = (await readFile(log, 'utf8')).trim().split(/\r?\n/u)
      expect(calls).toHaveLength(failure === 'build' ? 2 : 1)
      expect(calls[0]).toBe('fixtures:generate:m01')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
