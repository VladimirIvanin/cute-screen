import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function windowsSubsystem(binary) {
  if (binary.length < 64 || binary.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Not a Windows PE executable')
  }
  const header = binary.readUInt32LE(0x3c)
  const optional = header + 24
  if (optional + 70 > binary.length || binary.readUInt32LE(header) !== 0x4550) {
    throw new Error('Invalid PE header')
  }
  const magic = binary.readUInt16LE(optional)
  if (magic !== 0x10b && magic !== 0x20b) throw new Error('Invalid PE optional header')
  return binary.readUInt16LE(optional + 68)
}

export async function checkWindowsExecutable(executable) {
  const subsystem = windowsSubsystem(await readFile(executable))
  if (subsystem !== 2) throw new Error(`Expected Windows GUI subsystem 2, received ${subsystem}`)
  const probe = spawnSync(executable, ['--startup-check'], { windowsHide: true, timeout: 15_000 })
  if (probe.error) throw probe.error
  if (probe.status !== 0) throw new Error(`Windows startup check exited with ${probe.status}`)
  return { subsystem, startupExitCode: probe.status }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/check-windows-executable.mjs <release.exe>')
  console.log(JSON.stringify(await checkWindowsExecutable(path.resolve(process.argv[2]))))
}
