import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  afterEach,
  expect,
  it,
} from 'vitest'
import {
  hashFile,
  prepareReleaseAssets,
  releasePlatforms,
  validateReleaseVersion,
  verifyReleaseAssets,
} from '../../scripts/release-assets.mjs'
import { publishRelease } from '../../scripts/publish-release.mjs'

const roots: string[] = []
const sha = 'a'.repeat(40)
const tag = 'v0.1.0'

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cute-screen-release-'))
  roots.push(root)
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ version: '0.1.0' }),
    'src-tauri/tauri.conf.json': JSON.stringify({ version: '0.1.0' }),
    'Cargo.toml': '[workspace.package]\nversion = "0.1.0"\n[workspace.lints]\n',
    'artifacts/release-metadata/cargo.json': JSON.stringify({ packages: [{ name: 'serde', version: '1.0.0', license: 'MIT OR Apache-2.0' }] }),
    'artifacts/release-metadata/npm.json': JSON.stringify({ MIT: [{ name: '@vue/runtime-core', versions: ['3.5.42'] }] }),
    'apps/desktop/public/font-licenses.txt': 'Bundled font license text',
    'packages/editor-vue/src/emoji/assets/manifest.json': JSON.stringify({ commit: sha, license: 'Apache-2.0' }),
    'packages/editor-vue/src/emoji/assets/NOTICE': 'Noto Emoji attribution',
  }
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), content)
  }
  return root
}

async function completeAssets() {
  const merged = await mkdtemp(path.join(tmpdir(), 'cute-screen-release-merged-'))
  roots.push(merged)
  for (const [platform, extensions] of Object.entries(releasePlatforms)) {
    const root = await fixture()
    for (const extension of extensions) {
      const base = platform === 'macos-universal' ? 'target/universal-apple-darwin/release/bundle' : 'target/release/bundle'
      const directory = path.join(root, base, { deb: 'deb', AppImage: 'appimage', exe: 'nsis', dmg: 'dmg' }[extension]!)
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, `Cute Screen_0.1.0_${platform}.${extension}`), `package bytes: ${platform} ${extension}`)
    }
    await prepareReleaseAssets(root, tag, platform, sha)
    const staged = path.join(root, 'artifacts/release-assets')
    for (const name of await readdir(staged)) {
      await writeFile(path.join(merged, name), await readFile(path.join(staged, name)))
    }
  }
  return merged
}

it('requires a strict version tag and matching package, Tauri and Cargo versions', async () => {
  const root = await fixture()
  expect(await validateReleaseVersion(root, tag)).toBe('0.1.0')
  for (const invalid of ['v01.1.0', '0.1.0', 'v0.1.0-rc.1', 'v0.1.0\n', 'refs/tags/v0.1.0']) {
    await expect(validateReleaseVersion(root, invalid)).rejects.toThrow('Release tag')
  }
  for (const file of ['package.json', 'src-tauri/tauri.conf.json', 'Cargo.toml']) {
    const source = await readFile(path.join(root, file), 'utf8')
    await writeFile(path.join(root, file), source.replace('0.1.0', '0.2.0'))
    await expect(validateReleaseVersion(root, tag)).rejects.toThrow('does not match')
    await writeFile(path.join(root, file), source)
  }
})

it('stages five platforms, one universal DMG, inventories, and reproducible checksums', async () => {
  const directory = await completeAssets()
  const files = await verifyReleaseAssets(directory, tag, sha)
  expect(files.filter((name) => name.endsWith('.dmg'))).toEqual(['cute-screen-0.1.0-macos-universal.dmg'])
  expect(files.filter((name) => name.endsWith('.exe'))).toHaveLength(2)
  expect(files.filter((name) => name.endsWith('.deb'))).toHaveLength(2)
  expect(files.filter((name) => name.endsWith('.AppImage'))).toHaveLength(2)
  const checksums = await readFile(path.join(directory, 'SHA256SUMS'), 'utf8')
  for (const name of files.filter((entry) => entry !== 'SHA256SUMS')) {
    expect(checksums).toContain(`${await hashFile(path.join(directory, name))}  ${name}\n`)
  }
  await verifyReleaseAssets(directory, tag, sha)
  expect(await readFile(path.join(directory, 'SHA256SUMS'), 'utf8')).toBe(checksums)
  const sbom = JSON.parse(await readFile(path.join(directory, 'cute-screen-0.1.0-macos-universal.cdx.json'), 'utf8'))
  expect(sbom.bomFormat).toBe('CycloneDX')
  expect(sbom.components.map((entry: { name: string }) => entry.name)).toEqual(expect.arrayContaining(['serde', '@vue/runtime-core', 'Noto Emoji bundled SVG subset']))
})

it('blocks missing platforms, mismatched commits, corrupt packages and unexpected files', async () => {
  const directory = await completeAssets()
  await expect(verifyReleaseAssets(directory, tag, 'b'.repeat(40))).rejects.toThrow('mismatched')
  const file = path.join(directory, 'cute-screen-0.1.0-linux-x64.deb')
  const original = await readFile(file)
  await writeFile(file, 'corrupted package')
  await expect(verifyReleaseAssets(directory, tag, sha)).rejects.toThrow('checksum/size mismatch')
  await writeFile(file, original)
  await writeFile(path.join(directory, 'unexpected.exe'), 'unverified')
  await expect(verifyReleaseAssets(directory, tag, sha)).rejects.toThrow('Unexpected files')
  await rm(path.join(directory, 'unexpected.exe'))
  await rm(path.join(directory, 'cute-screen-0.1.0-windows-arm64.manifest.json'))
  await expect(verifyReleaseAssets(directory, tag, sha)).rejects.toThrow('ENOENT')
})

it('rejects unknown platforms, stale output, wrong-version bundles and empty inventories', async () => {
  const root = await fixture()
  await expect(prepareReleaseAssets(root, tag, 'linux-other', sha)).rejects.toThrow('Unknown release platform')
  await expect(prepareReleaseAssets(root, tag, 'linux-x64', 'not-a-sha')).rejects.toThrow('invalid source commit')
  const output = path.join(root, 'artifacts/release-assets')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'stale.deb'), 'stale')
  await expect(prepareReleaseAssets(root, tag, 'linux-x64', sha)).rejects.toThrow('must be empty')
  await rm(output, { recursive: true })
  const directory = path.join(root, 'target/release/bundle/nsis')
  await mkdir(directory, { recursive: true })
  const bundle = path.join(directory, 'Cute Screen_0.2.0_x64.exe')
  await writeFile(bundle, 'wrong version')
  await expect(prepareReleaseAssets(root, tag, 'windows-x64', sha)).rejects.toThrow('Expected exactly one')
  await rm(bundle)
  await writeFile(path.join(directory, 'Cute Screen_0.1.0_x64.exe'), 'installer bytes')
  await writeFile(path.join(root, 'artifacts/release-metadata/npm.json'), '{}')
  await expect(prepareReleaseAssets(root, tag, 'windows-x64', sha)).rejects.toThrow('must not be empty')
  await expect(verifyReleaseAssets(output, 'v0.1.0-rc.1', sha)).rejects.toThrow('Invalid release tag')
})

it('requires repository identity and credentials before contacting GitHub', async () => {
  const github = githubStub()
  await expect(publishRelease({ directory: '/unused', repository: 'test/repo', tag, sha, token: '', request: github.request })).rejects.toThrow('GH_TOKEN')
  expect(github.calls).toEqual([])
})

it('keeps the macOS app bundle and passes the Mach-O path before lipo -verify_arch in release.yml', async () => {
  const workflow = await readFile(
    path.join(process.cwd(), '.github', 'workflows', 'release.yml'),
    'utf8',
  )

  expect(workflow).toContain(
    'pnpm build:macos:signed --target universal-apple-darwin --bundles app,dmg -- --locked',
  )
  expect(workflow).toContain(
    'lipo "target/universal-apple-darwin/release/bundle/macos/Cute Screen.app/Contents/MacOS/cute-screen" -verify_arch x86_64 arm64',
  )
  expect(workflow).not.toMatch(/lipo\s+-verify_arch\b/u)
})

function githubStub({
  exists = true,
  conflict = false,
  moved = false,
  failUpload = false,
  corruptDownload = false,
  immutable = false,
  draft = false,
  autoPublish = false,
  apiFailure = false,
} = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const remote = new Map<number, Uint8Array>()
  const assets: Array<{ id: number; name: string }> = []
  if (conflict) {
    assets.push({ id: 1, name: 'cute-screen-0.1.0-linux-x64.deb' })
    remote.set(1, new TextEncoder().encode('different published bytes'))
  }
  const request: typeof fetch = async (input, options) => {
    const url = String(input)
    const method = options?.method ?? 'GET'
    calls.push({ url, method, body: options?.body })
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (apiFailure) return json({}, 403)
    if (url.includes('/commits/')) return json({ sha: moved ? 'b'.repeat(40) : sha })
    if (url.includes('/releases?')) {
      return json(draft ? [{
        id: 10,
        tag_name: tag,
        draft: true,
        body: autoPublish ? '<!-- cute-screen-release:auto-publish -->' : 'My unpublished notes.',
        upload_url: 'https://uploads.github.com/test/release{?name}',
        html_url: 'https://github.com/test/release',
      }] : [])
    }
    if (url.includes('/releases/tags/')) return exists ? json({ id: 10, body: 'User release notes.', immutable, upload_url: 'https://uploads.github.com/test/release{?name}', html_url: 'https://github.com/test/release' }) : json({}, 404)
    if (url.endsWith('/releases') && method === 'POST') return json({ id: 10, body: '', upload_url: 'https://uploads.github.com/test/release{?name}', html_url: 'https://github.com/test/release' })
    if (url.includes('/assets?')) return json(assets)
    if (url.includes('/releases/assets/')) {
      const id = Number(url.split('/').at(-1))
      return new Response(corruptDownload ? 'corrupted download' : remote.get(id) as BodyInit)
    }
    if (url.startsWith('https://uploads.github.com/')) {
      if (failUpload) return json({}, 503)
      const name = new URL(url).searchParams.get('name')!
      const id = remote.size + 1
      remote.set(id, new Uint8Array(await (options?.body as Blob).arrayBuffer()))
      assets.push({ id, name })
      return json({ id })
    }
    if (method === 'PATCH') return json({})
    throw new Error(`Unexpected GitHub request: ${method} ${url}`)
  }
  return { request, calls }
}

it('attaches verified assets, preserves notes and safely skips identical files on rerun', async () => {
  const directory = await completeAssets()
  const github = githubStub()
  const options = { directory, repository: 'test/repo', tag, sha, token: 'test-token', request: github.request }
  await publishRelease(options)
  const patch = github.calls.find((call) => call.method === 'PATCH')!
  const body = JSON.parse(patch.body as string)
  expect(body.body).toContain('User release notes.')
  expect(body.body).toContain('macos-universal.dmg')
  expect(body.body).toContain('UNOFFICIAL BUILD')
  expect(body).not.toHaveProperty('draft')
  const uploads = github.calls.filter((call) => call.url.startsWith('https://uploads.github.com/')).length
  expect(uploads).toBeGreaterThan(7)
  await publishRelease(options)
  expect(github.calls.filter((call) => call.url.startsWith('https://uploads.github.com/'))).toHaveLength(uploads)
})

it('creates a missing release as a draft and publishes only after downloaded checksums match', async () => {
  const directory = await completeAssets()
  const github = githubStub({ exists: false })
  await publishRelease({ directory, repository: 'test/repo', tag, sha, token: 'test-token', request: github.request })
  expect(JSON.parse(github.calls.find((call) => call.method === 'POST')!.body as string).draft).toBe(true)
  expect(JSON.parse(github.calls.at(-1)!.body as string).draft).toBe(false)
})

it.each([false, true])('resumes a draft and only auto-publishes workflow-owned drafts: %s', async (autoPublish) => {
  const directory = await completeAssets()
  const github = githubStub({ exists: false, draft: true, autoPublish })
  await publishRelease({ directory, repository: 'test/repo', tag, sha, token: 'test-token', request: github.request })
  expect(github.calls.some((call) => call.url.endsWith('/releases') && call.method === 'POST')).toBe(false)
  const patch = JSON.parse(github.calls.at(-1)!.body as string)
  expect(patch.draft).toBe(autoPublish ? false : undefined)
  expect(patch.body).not.toContain('cute-screen-release:auto-publish')
  if (!autoPublish) expect(patch.body).toContain('My unpublished notes.')
})

it.each([
  [{ conflict: true }, 'Published asset differs'],
  [{ moved: true }, 'tag moved'],
  [{ immutable: true }, 'immutable'],
  [{ apiFailure: true }, 'HTTP 403'],
  [{ exists: false, failUpload: true }, 'Upload failed'],
  [{ exists: false, corruptDownload: true }, 'Downloaded asset checksum mismatch'],
] as const)('stops publication on %o', async (settings, message) => {
  const directory = await completeAssets()
  const github = githubStub(settings)
  await expect(publishRelease({ directory, repository: 'test/repo', tag, sha, token: 'test-token', request: github.request })).rejects.toThrow(message)
  expect(github.calls.some((call) => call.method === 'PATCH')).toBe(false)
})
