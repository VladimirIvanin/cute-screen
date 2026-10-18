import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  assertArchitecture,
  assertDraftUpdate,
  checkGlibc,
  checkMacMinimum,
  packageNames,
  sha256,
  stableVersion,
  validateManifest,
  validateResources,
  validateVersions,
} from '../../scripts/release/contracts.mjs'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  checkVersions,
  setVersion,
} from '../../scripts/release/versions.mjs'

describe('release inputs and final artifact contracts', () => {
  it('synchronizes the actual workspace metadata and pinned Cargo lock without bumping dependencies', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'cute-screen-version-'))
    try {
      for (const folder of ['apps', 'packages', 'src-tauri', 'crates/cute-screen-storage']) {
        await mkdir(path.join(directory, folder), { recursive: true })
      }
      for (const file of ['package.json', 'Cargo.toml', 'Cargo.lock', 'src-tauri/Cargo.toml',
        'src-tauri/tauri.conf.json', 'crates/cute-screen-storage/Cargo.toml',
        'apps/desktop/package.json', 'packages/editor-core/package.json', 'packages/editor-renderer/package.json',
        'packages/editor-vue/package.json']) {
        await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
        await cp(file, path.join(directory, file))
      }
      const before = await readFile(path.join(directory, 'Cargo.lock'), 'utf8')
      await setVersion('1.2.3', directory)
      expect(await checkVersions('v1.2.3', directory)).toBe('1.2.3')
      const after = await readFile(path.join(directory, 'Cargo.lock'), 'utf8')
      expect(after.replace(/(name = "cute-screen-(?:desktop|storage)"\r?\nversion = ")1.2.3/gu, '$10.0.0')).toBe(before)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('rejects prerelease, shell input, leading zeroes and installer overflow', () => {
    for (const value of ['v1.2.3', '1.2.3-rc.1', '01.2.3', '65536.0.0', '1.2.3\n', '$(echo x)']) {
      expect(() => stableVersion(value)).toThrow()
    }
    expect(stableVersion('0.0.0')).toBe('0.0.0')
    expect(() => validateVersions({ 'package.json': '1.2.3', Cargo: '1.2.4' })).toThrow('mismatch')
    expect(() => validateVersions({ 'package.json': '1.2.3' }, 'v1.2.4')).toThrow('mismatch')
  })

  it('reads the installed PE rather than the NSIS wrapper architecture', () => {
    const bytes = Buffer.alloc(128)
    bytes.write('MZ')
    bytes.writeUInt32LE(64, 60)
    bytes.write('PE\0\0', 64)
    bytes.writeUInt16LE(0xaa64, 68)
    expect(assertArchitecture(bytes, 'windows-arm64')).toEqual(['arm64'])
    expect(() => assertArchitecture(bytes, 'windows-x64')).toThrow('Wrong architecture')
    bytes.writeUInt32LE(1000, 60)
    expect(() => assertArchitecture(bytes, 'windows-arm64')).toThrow('PE header')
  })

  it('requires both universal slices and caps glibc at the Linux baseline', () => {
    const bytes = Buffer.alloc(64)
    bytes.writeUInt32BE(0xcafebabe)
    bytes.writeUInt32BE(2, 4)
    bytes.writeUInt32BE(0x1000007, 8)
    bytes.writeUInt32BE(0x100000c, 28)
    expect(assertArchitecture(bytes, 'macos-universal')).toEqual(['arm64', 'x64'])
    bytes.writeUInt32BE(1, 4)
    expect(() => assertArchitecture(bytes, 'macos-universal')).toThrow('Wrong architecture')
    expect(checkGlibc('Name: GLIBC_2.17\nName: GLIBC_2.35')).toEqual(['2.17', '2.35'])
    expect(() => checkGlibc('Name: GLIBC_2.36')).toThrow('baseline')
    expect(() => checkGlibc('Name: GLIBC_ABI_DT_RELR')).toThrow('ABI')
  })

  it('checks both modern and legacy Mach-O deployment commands, ignoring dylib version numbers', () => {
    const headers = 'cmd LC_BUILD_VERSION\ncmdsize 32\nplatform 1\nminos 12.0\nsdk 15.5\n'
      + 'cmd LC_LOAD_DYLIB\ncurrent version 999.0\n'
      + 'cmd LC_VERSION_MIN_MACOSX\ncmdsize 16\nversion 12.0\nsdk 15.5\n'
    expect(checkMacMinimum(headers)).toEqual(['12.0', '12.0'])
    expect(() => checkMacMinimum(headers.replace('version 12.0', 'version 13.0'))).toThrow('Every universal slice')
    expect(() => checkMacMinimum('cmd LC_BUILD_VERSION\nminos 12.0')).toThrow('Every universal slice')
  })

  it('rejects missing or altered embedded resources and test-feature builds', () => {
    const assets = ['index.html', 'assets/app.js', 'assets/skia.wasm', 'assets/font.woff2', 'font-licenses.txt']
      .map((path) => ({ path, bytes: 4, sha256: sha256(Buffer.from('data')) }))
    const info = { version: '1.2.3', appVersion: '1.2.3', customProtocol: true, fakePlatform: false,
      testHarness: false, platformSmoke: false, assets }
    expect(() => validateResources(info, '1.2.3', assets)).not.toThrow()
    expect(() => validateResources({ ...info, assets: assets.slice(0, 3) }, '1.2.3', assets)).toThrow('Missing')
    expect(() => validateResources({ ...info, testHarness: true }, '1.2.3', assets)).toThrow('production')
    const corrupted = assets.map((asset) => asset.path.endsWith('.woff2') ? { ...asset, sha256: 'corrupt' } : asset)
    expect(() => validateResources(info, '1.2.3', corrupted)).toThrow('differs')
  })

  it('requires all seven actual installer bytes and rejects corruption', () => {
    const files = new Map(packageNames('1.2.3').map((name) => [name, Buffer.from(name)]))
    const manifest = { version: '1.2.3', commit: 'a'.repeat(40), packages: [...files].map(([name, bytes]) => (
      { name, bytes: bytes.length, sha256: sha256(bytes) }
    )) }
    expect(() => validateManifest(manifest, files)).not.toThrow()
    expect(() => validateManifest({ ...manifest, packages: manifest.packages.slice(1) }, files)).toThrow('Incomplete')
    const first = manifest.packages.at(0)
    if (!first) throw new Error('Empty release test fixture')
    files.set(first.name, Buffer.from('corrupt'))
    expect(() => validateManifest(manifest, files)).toThrow('Checksum')
  })

  it('never overwrites published assets or an unrelated draft', () => {
    const commit = 'a'.repeat(40)
    expect(() => assertDraftUpdate(null, 'v1.2.3', commit)).not.toThrow()
    expect(() => assertDraftUpdate({ draft: false }, 'v1.2.3', commit)).toThrow('immutable')
    expect(() => assertDraftUpdate({ draft: true, tag_name: 'v1.2.3', body: 'unrelated' }, 'v1.2.3', commit))
      .toThrow('different')
    expect(() => assertDraftUpdate({ draft: true, tag_name: 'v1.2.3',
      body: `<!-- cute-screen-commit:${commit} -->` }, 'v1.2.3', commit)).not.toThrow()
  })
})
