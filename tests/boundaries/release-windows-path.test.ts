import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  expect,
  it,
} from 'vitest'

it.skipIf(process.platform !== 'win32')('compares 8.3 and full Windows installer paths by the same canonical form', () => {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `
    $ErrorActionPreference = 'Stop'
    . $env:RELEASE_PATH_HELPER
    $file = Join-Path $PSHOME 'powershell.exe'
    $short = (New-Object -ComObject Scripting.FileSystemObject).GetFile($file).ShortPath
    [PSCustomObject]@{
      full = (Get-ReleaseCanonicalPath -LiteralPath $file)
      short = (Get-ReleaseCanonicalPath -LiteralPath $short)
    } | ConvertTo-Json
  `], {
    env: { ...process.env, RELEASE_PATH_HELPER: path.resolve('scripts/release/windows-path.ps1') },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  })
  expect(result.status, result.stderr).toBe(0)
  const actual = JSON.parse(result.stdout) as { full: string; short: string }
  expect(actual.short.toLowerCase()).toBe(actual.full.toLowerCase())
}, 20_000)
