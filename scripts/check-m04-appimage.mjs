import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const bundleDirectory = path.join(
  root,
  'target',
  'release',
  'bundle',
  'appimage',
)
const artifacts = existsSync(bundleDirectory)
  ? readdirSync(bundleDirectory)
      .filter((entry) => entry.endsWith('.AppImage'))
      .map((entry) => path.join(bundleDirectory, entry))
  : []

if (artifacts.length !== 1) {
  throw new Error(
    `expected exactly one AppImage artifact in ${bundleDirectory}, found ${artifacts.length}`,
  )
}

const [artifact] = artifacts
const help = execFileSync(artifact, ['--help'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30_000,
})
for (const expected of ['Usage: cute-screen', 'capture']) {
  if (!help.includes(expected)) {
    throw new Error(`AppImage CLI help is missing ${expected}`)
  }
}

console.log(`M04 AppImage artifact verified: ${path.relative(root, artifact)}`)
