import { spawnSync } from 'node:child_process'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import fg from 'fast-glob'
import { checkWindowsExecutable } from './check-windows-executable.mjs'

const root = path.resolve(process.argv[2] ?? process.cwd())
const forbidden = [
  'tauri-plugin-wdio',
  'tauri-plugin-wdio-webdriver',
  'cute-screen:fake-platform',
  'cute-screen:test-harness',
]

function capture(
  command,
  args,
) {
  const executable = command === 'pnpm' ? process.execPath : command
  const commandArgs = command === 'pnpm' ? [process.env.npm_execpath, ...args] : args
  if (command === 'pnpm' && !process.env.npm_execpath) {
    throw new Error('Run the release boundary through pnpm verify:release-boundary.')
  }
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} exited with ${result.status}`)
  }
  return result.stdout
}

const minimumMacosSdk = 14
let macosSdk = null
if (process.platform === 'darwin') {
  macosSdk = capture('xcrun', [
    '--sdk',
    process.env.SDKROOT || 'macosx',
    '--show-sdk-version',
  ]).trim()
  if (Number.parseInt(macosSdk, 10) < minimumMacosSdk) {
    console.error(
      `macOS SDK ${macosSdk} is below ${minimumMacosSdk}: release builds would compile out the system window picker and SCScreenshotManager (ADR-109). Select Xcode 15+ via DEVELOPER_DIR or xcode-select.`,
    )
    process.exit(1)
  }
}

const tree = capture('cargo', [
  'tree',
  '--package',
  'cute-screen-desktop',
  '--no-default-features',
  '--edges',
  'normal',
])
const graphViolations = forbidden.filter((entry) => tree.includes(entry))

capture('pnpm', ['build'])
capture('cargo', ['build', '--release', '--package', 'cute-screen-desktop', '--no-default-features'])

const executable = path.join(
  root,
  'target',
  'release',
  process.platform === 'win32' ? 'cute-screen.exe' : 'cute-screen',
)
const windowsExecutable = process.platform === 'win32' ? await checkWindowsExecutable(executable) : null
const binary = await readFile(executable)
const binaryViolations = forbidden.filter((entry) => binary.includes(Buffer.from(entry)))
const config = await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')
const configViolations = forbidden.filter((entry) => config.includes(entry))
const frontendFiles = await fg('apps/desktop/dist/**/*', {
  cwd: root,
  onlyFiles: true,
})
const frontendViolations = []
for (const file of frontendFiles) {
  const content = await readFile(path.join(root, file))
  for (const marker of forbidden) {
    if (content.includes(Buffer.from(marker))) {
      frontendViolations.push(`${file}: ${marker}`)
    }
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  executable: path.relative(root, executable),
  macosSdk,
  windowsExecutable,
  graphViolations,
  binaryViolations,
  configViolations,
  frontendViolations,
}
const reportDirectory = path.join(root, 'artifacts')
await mkdir(reportDirectory, { recursive: true })
await writeFile(path.join(reportDirectory, 'release-boundary.json'), `${JSON.stringify(report, null, 2)}\n`)

const violations = [...graphViolations, ...binaryViolations, ...configViolations, ...frontendViolations]
if (violations.length > 0) {
  console.error(`Release boundary contains test-only markers: ${[...new Set(violations)].join(', ')}`)
  process.exitCode = 1
} else {
  console.log('Release boundary verified: fake-platform and WebDriver are absent.')
}
