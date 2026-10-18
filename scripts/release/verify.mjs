import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import {
  assertArchitecture,
  checkGlibc,
  forbidden,
  targets,
  validateResources,
} from './contracts.mjs'
import {
  inventory,
  json,
  root,
  run,
  walk,
  writeJson,
} from './io.mjs'
import { checkVersions } from './versions.mjs'
import { nativeLicenses } from './native-licenses.mjs'

export async function inspectExecutable(
  executable,
  launch,
  id,
  version,
  frontend,
) {
  const bytes = await readFile(executable)
  const architecture = assertArchitecture(bytes, id)
  for (const marker of forbidden) {
    if (bytes.includes(Buffer.from(marker))) throw new Error(`Test-only marker in packaged executable: ${marker}`)
  }
  const info = JSON.parse(launch(['--release-info']))
  validateResources(info, version, frontend)
  const reportedVersion = launch(['--version'])
  if (reportedVersion !== `cute-screen ${version}`) throw new Error(`Incorrect CLI version: ${reportedVersion}`)
  const help = launch(['--help'])
  if (!help.includes('Usage: cute-screen') || !help.includes('capture')) throw new Error('Packaged CLI help is incomplete')
  return { architecture, info, cliVersion: reportedVersion, help: 'passed' }
}

async function linuxPackage(
  file,
  extension,
  temporary,
  id,
  version,
  frontend,
) {
  let directory
  let executable
  let launch
  if (extension === 'deb') {
    const expected = id === 'linux-x64' ? 'amd64' : 'arm64'
    const fields = run('dpkg-deb', ['--field', file, 'Package', 'Version', 'Architecture'])
    for (const value of ['Package: cute-screen', `Version: ${version}`, `Architecture: ${expected}`]) {
      if (!fields.split(/\r?\n/u).includes(value)) throw new Error(`Incorrect DEB metadata: ${value}`)
    }
    directory = path.join(temporary, 'deb')
    run('dpkg-deb', ['--extract', file, directory])
    executable = path.join(directory, 'usr/bin/cute-screen')
    launch = (args) => run(executable, args)
  } else {
    run(file, ['--appimage-extract'], { cwd: temporary, maxBuffer: 16 * 1024 * 1024 })
    directory = path.join(temporary, 'squashfs-root')
    executable = path.join(directory, 'usr/bin/cute-screen')
    launch = (args) => run(file, args, {
      env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' },
      maxBuffer: 16 * 1024 * 1024,
    })
  }
  const report = await inspectExecutable(executable, launch, id, version, frontend)
  report.glibc = []
  report.gtkHooks = []
  for (const entry of await walk(directory)) {
    const bytes = await readFile(entry)
    if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      assertArchitecture(bytes, id)
      const requirements = run('readelf', ['--version-info', entry], { maxBuffer: 16 * 1024 * 1024 })
      report.glibc.push({ path: path.relative(directory, entry), required: checkGlibc(requirements) })
    }
    if (
      (entry.endsWith('.sh') ||
        path.basename(entry) === 'AppRun') &&
        bytes.includes(Buffer.from('GDK_BACKEND'))
    ) {
      report.gtkHooks.push({ path: path.relative(directory, entry), lines: bytes.toString('utf8')
        .split('\n').filter((line) => line.includes('GDK_BACKEND')) })
    }
  }
  report.wayland = 'manual acceptance pending; inspect gtkHooks, X11 success is not Wayland evidence'
  report.packagedFiles = await inventory(directory)
  return report
}

async function macPackage(
  file,
  temporary,
  id,
  version,
  frontend,
) {
  const mount = path.join(temporary, 'mounted')
  await mkdir(mount)
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, file])
  try {
    const apps = (await walk(mount)).filter((entry) => entry.endsWith('.app/Contents/MacOS/cute-screen'))
    if (apps.length !== 1) throw new Error('DMG must contain exactly one Cute Screen app')
    const executable = apps[0]
    const app = executable.slice(0, -'/Contents/MacOS/cute-screen'.length)
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
    const signature = run('codesign', ['--display', '--verbose=4', app], { combinedOutput: true })
    if (!signature.includes('Signature=adhoc')) throw new Error('Expected an ad-hoc signature')
    const minimum = run('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', path.join(app, 'Contents/Info.plist')])
    if (minimum !== '12.0') throw new Error(`DMG minimum macOS differs from 12.0: ${minimum}`)
    const headers = run('otool', ['-arch', 'all', '-l', executable])
    const minima = [...headers.matchAll(/(?:minos|version) (\d+\.\d+(?:\.\d+)?)/gu)].map((match) => match[1])
    // LC_BUILD_VERSION uses minos; LC_VERSION_MIN_MACOSX uses version.
    if (!headers.includes('minos 12.0') && !headers.includes('version 12.0')) throw new Error('Mach-O lacks macOS 12.0 deployment target')
    for (const match of headers.matchAll(/minos (\d+\.\d+(?:\.\d+)?)/gu)) {
      if (!/^12\.0(?:\.0)?$/u.test(match[1])) throw new Error(`Mach-O slice minimum differs from 12.0: ${match[1]}`)
    }
    return { ...await inspectExecutable(executable, (args) => run(executable, args), id, version, frontend),
      codesign: 'verified ad-hoc', signature, minimum, minima, hostArchitecture: process.arch,
      packagedFiles: await inventory(app) }
  } finally {
    run('hdiutil', ['detach', mount])
  }
}

async function windowsPackage(
  file,
  temporary,
  id,
  version,
  frontend,
) {
  const install = path.join(temporary, 'installed')
  // Start-Process receives literal script parameters; /D must be the final NSIS argument.
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(root, 'scripts/release/windows-install.ps1'), '-Installer', file, '-Directory', install], { timeout: 240_000 })
  try {
    const executable = path.join(install, 'cute-screen.exe')
    return { ...await inspectExecutable(executable, (args) => run(executable, args), id, version, frontend),
      packagedFiles: await inventory(install), install: 'silent current-user install passed' }
  } finally {
    const uninstall = path.join(install, 'uninstall.exe')
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'scripts/release/windows-install.ps1'), '-Installer', uninstall, '-Directory', install, '-Uninstall'], { timeout: 120_000 })
  }
}

export async function verifyPackage(
  id,
  bundleDirectory,
) {
  const target = targets.find((entry) => entry.id === id)
  if (!target) throw new Error(`Unknown target: ${id}`)
  const version = await checkVersions()
  const frontend = await inventory(path.join(root, 'apps/desktop/dist'))
  const output = path.join(root, 'artifacts/release', id)
  await mkdir(output, { recursive: true })
  const files = await walk(path.resolve(bundleDirectory))
  const report = { id, target: target.target, version, commit: run('git', ['rev-parse', 'HEAD']),
    host: { platform: process.platform, arch: process.arch, os: run(process.platform === 'win32' ? 'cmd.exe' : 'uname',
      process.platform === 'win32' ? ['/d', '/c', 'ver'] : ['-a']) },
    tools: { node: process.version, pnpm: run('pnpm', ['--version']), rust: run('rustc', ['--version']) },
    checks: {}, manualAcceptance: 'pending' }
  const tree = run('cargo', ['tree', '--locked', '--package', 'cute-screen-desktop', '--edges', 'normal',
    '--target', target.target === 'universal-apple-darwin' ? 'aarch64-apple-darwin' : target.target,
    '--features', 'custom-protocol'], { maxBuffer: 16 * 1024 * 1024 })
  if (forbidden.some((entry) => tree.includes(entry))) throw new Error('Production dependency graph contains test-only components')
  for (const extension of target.extensions) {
    const candidates = files.filter((file) => file.endsWith(`.${extension}`))
    if (candidates.length !== 1) throw new Error(`Expected one ${extension} in ${bundleDirectory}, found ${candidates.length}`)
    const temporary = await mkdtemp(path.join(tmpdir(), 'cute-screen-release-'))
    try {
      const file = candidates[0]
      if (id.startsWith('linux-')) report.checks[extension] = await linuxPackage(file, extension, temporary, id, version, frontend)
      else if (id.startsWith('macos-')) report.checks[extension] = await macPackage(file, temporary, id, version, frontend)
      else report.checks[extension] = await windowsPackage(file, temporary, id, version, frontend)
      await copyFile(file, path.join(output, `cute-screen-${version}-${id}.${extension}`))
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  await writeJson(path.join(output, `${id}-verification.json`), report)
  if (id.startsWith('linux-')) await nativeLicenses(report, output)
  // Keep the exact frontend hashes for verification of this DMG on the Intel runner.
  await writeJson(path.join(output, 'frontend-inventory.json'), frontend)
  console.log(`Packaged ${id} verified; physical OS acceptance remains pending.`)
}

export async function verifyMacIntel(directory) {
  const version = await checkVersions()
  const source = path.resolve(directory)
  const frontend = await json(path.join(source, 'frontend-inventory.json'))
  const temporary = await mkdtemp(path.join(tmpdir(), 'cute-screen-release-'))
  try {
    if (process.arch !== 'x64') throw new Error('Intel verification must run on native x64 macOS')
    const report = await macPackage(path.join(source, `cute-screen-${version}-macos-universal.dmg`),
      temporary, 'macos-universal', version, frontend)
    await writeJson(path.join(root, 'artifacts/release/macos-intel-verification.json'), {
      id: 'macos-intel', version, commit: run('git', ['rev-parse', 'HEAD']), checks: report,
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
