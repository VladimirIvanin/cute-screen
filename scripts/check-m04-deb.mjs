import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const bundleDirectory = path.join(root, 'target', 'release', 'bundle', 'deb')
const packages = existsSync(bundleDirectory)
  ? readdirSync(bundleDirectory)
      .filter((entry) => entry.endsWith('.deb'))
      .map((entry) => path.join(bundleDirectory, entry))
  : []

if (packages.length !== 1) {
  throw new Error(
    `expected exactly one deb artifact in ${bundleDirectory}, found ${packages.length}`,
  )
}

const [artifact] = packages
const info = execFileSync('dpkg-deb', ['--info', artifact], {
  cwd: root,
  encoding: 'utf8',
})
const contents = execFileSync('dpkg-deb', ['--contents', artifact], {
  cwd: root,
  encoding: 'utf8',
})
const architecture = execFileSync('dpkg', ['--print-architecture'], {
  cwd: root,
  encoding: 'utf8',
}).trim()

for (const expected of [
  'Package: cute-screen',
  `Architecture: ${architecture}`,
]) {
  if (!info.includes(expected)) {
    throw new Error(`deb control metadata is missing ${expected}`)
  }
}
if (!contents.includes('usr/bin/cute-screen')) {
  throw new Error('deb artifact does not contain the cute-screen executable')
}
if (!contents.includes('usr/share/applications/')) {
  throw new Error('deb artifact does not contain a desktop entry')
}
for (const forbidden of ['m01-platform-smoke', 'm04-platform-smoke']) {
  if (contents.includes(forbidden)) {
    throw new Error(
      `test-only executable leaked into deb artifact: ${forbidden}`,
    )
  }
}

console.log(`M04 deb artifact verified: ${path.relative(root, artifact)}`)
