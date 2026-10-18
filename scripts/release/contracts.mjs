import { createHash } from 'node:crypto'

export const targets = [
  { id: 'linux-x64', target: 'x86_64-unknown-linux-gnu', extensions: ['deb', 'AppImage'] },
  { id: 'linux-arm64', target: 'aarch64-unknown-linux-gnu', extensions: ['deb', 'AppImage'] },
  { id: 'windows-x64', target: 'x86_64-pc-windows-msvc', extensions: ['exe'] },
  { id: 'windows-arm64', target: 'aarch64-pc-windows-msvc', extensions: ['exe'] },
  { id: 'macos-universal', target: 'universal-apple-darwin', extensions: ['dmg'] },
]

export const forbidden = [
  'tauri-plugin-wdio',
  'tauri-plugin-wdio-webdriver',
  'cute-screen:fake-platform',
  'cute-screen:test-harness',
  'desktop-ipc-codegen',
]

export function assertNoDevelopmentBinaries(files) {
  for (const file of files) {
    if (/(?:^|[/\\])(?:desktop-ipc-codegen|m01-platform-smoke|m04-platform-smoke)(?:\.exe)?$/u.test(file.path)) {
      throw new Error(`Development executable leaked into package: ${file.path}`)
    }
  }
}

export function stableVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)
    || version.split('.').some((part) => Number(part) > 65535)) {
    throw new Error(`Invalid stable installer version: ${version}`)
  }
  return version
}

export function validateVersions(
  entries,
  tag = '',
) {
  const version = stableVersion(entries['package.json'])
  for (const [file, actual] of Object.entries(entries)) {
    if (actual !== version) throw new Error(`Version mismatch: ${file}: ${actual} != ${version}`)
  }
  if (tag && tag !== `v${version}`) throw new Error(`Tag/version mismatch: ${tag} != v${version}`)
  return version
}

export function packageNames(version) {
  stableVersion(version)
  return targets.flatMap(({ id, extensions }) => extensions.map((extension) => `cute-screen-${version}-${id}.${extension}`))
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function architectures(bytes) {
  if (bytes.length < 64) throw new Error('Truncated executable')
  if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    if (bytes[4] !== 2 || bytes[5] !== 1) throw new Error('Expected little-endian ELF64')
    return [{ 62: 'x64', 183: 'arm64' }[bytes.readUInt16LE(18)] ?? 'unknown']
  }
  if (bytes.toString('ascii', 0, 2) === 'MZ') {
    const offset = bytes.readUInt32LE(60)
    if (offset + 6 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') {
      throw new Error('Invalid PE header')
    }
    return [{ 0x8664: 'x64', 0xaa64: 'arm64' }[bytes.readUInt16LE(offset + 4)] ?? 'unknown']
  }
  const magic = bytes.readUInt32BE(0)
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = bytes.readUInt32BE(4)
    const stride = magic === 0xcafebabf ? 32 : 20
    if (count > 16 || 8 + count * stride > bytes.length) throw new Error('Invalid universal Mach-O header')
    return Array.from({ length: count }, (_, index) => (
      { 0x1000007: 'x64', 0x100000c: 'arm64' }[bytes.readUInt32BE(8 + index * stride)] ?? 'unknown'
    )).sort()
  }
  throw new Error('Unknown executable format')
}

export function assertArchitecture(
  bytes,
  id,
) {
  const actual = architectures(bytes)
  const expected = id === 'macos-universal' ? ['arm64', 'x64'] : [id.split('-').at(-1)]
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Wrong architecture for ${id}: ${actual.join(', ')}`)
  }
  return actual
}

export function checkGlibc(output) {
  const versions = [...output.matchAll(/Name: GLIBC_(\d+)\.(\d+)/gu)].map((match) => [Number(match[1]), Number(match[2])])
  for (const [major, minor] of versions) {
    if (
      major > 2 ||
      (major === 2 &&
        minor > 35)
    ) throw new Error(`Requires GLIBC_${major}.${minor}; baseline is 2.35`)
  }
  if (/Name: GLIBC_ABI_/u.test(output)) throw new Error('Unsupported GLIBC ABI requirement')
  return versions.map((parts) => parts.join('.'))
}

export function checkMacMinimum(output) {
  const minima = [...output.matchAll(
    /cmd (?:LC_BUILD_VERSION|LC_VERSION_MIN_MACOSX)[\s\S]*?\n\s*(?:minos|version) (\d+\.\d+(?:\.\d+)?)/gu,
  )].map((match) => match[1])
  if (minima.length !== 2 || minima.some((minimum) => !/^12\.0(?:\.0)?$/u.test(minimum))) {
    throw new Error(`Every universal slice must target macOS 12.0: ${minima.join(', ')}`)
  }
  return minima
}

export function validateResources(
  info,
  version,
  frontend,
) {
  if (info.version !== version || info.appVersion !== version) throw new Error('Embedded version mismatch')
  if (
    !info.customProtocol ||
    info.fakePlatform ||
    info.testHarness ||
    info.ipcCodegen ||
    info.platformSmoke
  ) {
    throw new Error('Packaged binary is not a production build')
  }
  const names = info.assets.map((asset) => asset.path.replace(/^\//u, ''))
  for (const requirement of [/^index\.html$/u, /\.js$/u, /\.wasm$/u, /\.woff2$/u, /^font-licenses\.txt$/u]) {
    if (!names.some((name) => requirement.test(name))) throw new Error(`Missing embedded resource: ${requirement}`)
  }
  for (const expected of frontend) {
    const actual = info.assets.find((asset) => asset.path.replace(/^\//u, '') === expected.path)
    // Tauri rewrites HTML for CSP/nonces; other emitted resources must be byte-identical.
    if (
      !actual ||
      (!expected.path.endsWith('.html')
      &&
        (actual.sha256 !== expected.sha256 ||
          actual.bytes !== expected.bytes))
    ) {
      throw new Error(`Embedded resource differs from frontend: ${expected.path}`)
    }
  }
}

export function validateManifest(
  manifest,
  files,
) {
  const expected = packageNames(manifest.version)
  if (!/^[a-f0-9]{40}$/u.test(manifest.commit)) throw new Error('Invalid commit SHA')
  if (manifest.packages.length !== expected.length) throw new Error('Incomplete package manifest')
  for (const name of expected) {
    const entries = manifest.packages.filter((entry) => entry.name === name)
    if (entries.length !== 1 || !files.has(name)) throw new Error(`Missing or duplicate package: ${name}`)
    const bytes = files.get(name)
    if (bytes.length !== entries[0].bytes || sha256(bytes) !== entries[0].sha256) {
      throw new Error(`Checksum mismatch: ${name}`)
    }
  }
}

export function assertDraftUpdate(
  release,
  tag,
  commit,
) {
  if (!release) return
  if (!release.draft) throw new Error('Published Release is immutable')
  if (release.tag_name !== tag || !release.body?.includes(`<!-- cute-screen-commit:${commit} -->`)) {
    throw new Error('Draft belongs to a different tag or commit')
  }
}
