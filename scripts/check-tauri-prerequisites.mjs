import { spawnSync } from 'node:child_process'
import process from 'node:process'

const documentation = 'https://v2.tauri.app/start/prerequisites/'

function commandWorks(command, args) {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0
}

const missing = []

if (process.platform === 'linux') {
  if (!commandWorks('pkg-config', ['--version'])) {
    missing.push('pkg-config')
  } else {
    for (const dependency of [
      'gtk+-3.0',
      'webkit2gtk-4.1',
      'javascriptcoregtk-4.1',
      'libsoup-3.0',
    ]) {
      if (!commandWorks('pkg-config', ['--exists', dependency]))
        missing.push(dependency)
    }
  }
} else if (process.platform === 'darwin') {
  if (!commandWorks('xcode-select', ['-p']))
    missing.push('Xcode Command Line Tools')
} else if (process.platform === 'win32') {
  if (!process.env.ProgramFiles) missing.push('Windows development environment')
}

if (missing.length > 0) {
  console.error(
    `Missing Tauri system dependencies: ${missing.join(', ')}. Follow ${documentation}`,
  )
  process.exitCode = 1
} else {
  console.log(`Tauri prerequisites detected for ${process.platform}.`)
}
