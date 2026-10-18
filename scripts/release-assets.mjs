import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const releasePlatforms = {
  'linux-x64': ['deb', 'AppImage'],
  'linux-arm64': ['deb', 'AppImage'],
  'windows-x64': ['exe'],
  'windows-arm64': ['exe'],
  'macos-universal': ['dmg'],
}

export async function validateReleaseVersion(
  root,
  tag,
) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(tag)) {
    throw new Error('Release tag must be vMAJOR.MINOR.PATCH without leading zeros or suffixes.')
  }
  const version = tag.slice(1)
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const tauri = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  const cargo = await readFile(path.join(root, 'Cargo.toml'), 'utf8')
  const workspace = cargo.match(/\[workspace\.package\]([^]*?)(?=\n\[|$)/u)?.[1]
  const cargoVersion = workspace?.match(/^version\s*=\s*"([^"]+)"/mu)?.[1]
  const versions = { package: manifest.version, tauri: tauri.version, cargo: cargoVersion }
  for (const [name, embedded] of Object.entries(versions)) {
    if (embedded !== version) {
      throw new Error(`${name} version ${embedded} does not match release ${tag}.`)
    }
  }
  return version
}

export async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function component(
  ecosystem,
  name,
  version,
  license,
) {
  const purl = `pkg:${ecosystem}/${name.replace('@', '%40')}@${version}`
  return {
    type: 'library',
    'bom-ref': purl,
    name,
    version,
    purl,
    licenses: license ? [{ expression: license }] : [{ license: { name: 'UNKNOWN' } }],
  }
}

async function dependencyReports(root) {
  const cargo = JSON.parse(await readFile(path.join(root, 'artifacts/release-metadata/cargo.json'), 'utf8'))
  const npm = JSON.parse(await readFile(path.join(root, 'artifacts/release-metadata/npm.json'), 'utf8'))
  if (!cargo.packages?.length || !Object.keys(npm).length) {
    throw new Error('Cargo and npm dependency inventories must not be empty.')
  }
  const components = new Map()
  for (const entry of cargo.packages) {
    const item = component('cargo', entry.name, entry.version, entry.license)
    components.set(item['bom-ref'], item)
  }
  for (const [license, packages] of Object.entries(npm)) {
    for (const entry of packages) {
      for (const version of entry.versions) {
        const item = component('npm', entry.name, version, entry.license ?? license)
        components.set(item['bom-ref'], item)
      }
    }
  }
  // Vendored artwork is outside both package managers.
  const emoji = JSON.parse(await readFile(path.join(root, 'packages/editor-vue/src/emoji/assets/manifest.json'), 'utf8'))
  const artwork = {
    type: 'data',
    'bom-ref': `noto-emoji-${emoji.commit}`,
    name: 'Noto Emoji bundled SVG subset',
    version: emoji.commit,
    licenses: [{ expression: emoji.license }],
  }
  components.set(artwork['bom-ref'], artwork)
  const sorted = [...components.values()].sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref']))
  const fonts = await readFile(path.join(root, 'apps/desktop/public/font-licenses.txt'), 'utf8')
  const notice = await readFile(path.join(root, 'packages/editor-vue/src/emoji/assets/NOTICE'), 'utf8')
  const report = sorted.map((entry) => `${entry.name}@${entry.version}\t${entry.licenses[0].expression ?? 'UNKNOWN'}`).join('\n')
  return {
    components: sorted,
    licenses: `Dependency inventory (includes Cargo build dependencies and all resolved targets).\n${report}\n\nBundled font notices:\n${fonts}\n\nNoto Emoji notice:\n${notice}\n`,
  }
}

export async function prepareReleaseAssets(
  root,
  tag,
  platform,
  sha,
) {
  const version = await validateReleaseVersion(root, tag)
  const extensions = releasePlatforms[platform]
  if (!extensions || !/^[a-f\d]{40}$/u.test(sha)) {
    throw new Error('Unknown release platform or invalid source commit.')
  }
  const output = path.join(root, 'artifacts/release-assets')
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length) {
    throw new Error('Release output directory must be empty; stale files cannot be published.')
  }
  const prefix = `cute-screen-${version}-${platform}`
  const bundle = platform === 'macos-universal'
    ? 'target/universal-apple-darwin/release/bundle'
    : 'target/release/bundle'
  const files = []
  for (const extension of extensions) {
    const directory = path.join(root, bundle, { deb: 'deb', AppImage: 'appimage', exe: 'nsis', dmg: 'dmg' }[extension])
    const candidates = (await readdir(directory)).filter((name) => name.endsWith(`.${extension}`))
    if (candidates.length !== 1 || !candidates[0].includes(version)) {
      throw new Error(`Expected exactly one ${tag} ${extension} package in ${directory}.`)
    }
    const name = `${prefix}.${extension}`
    await copyFile(path.join(directory, candidates[0]), path.join(output, name))
    files.push(name)
  }
  const reports = await dependencyReports(root)
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: 'Cute Screen',
        version,
        properties: [
          { name: 'cute-screen:source-commit', value: sha },
          { name: 'cute-screen:platform', value: platform },
          { name: 'cute-screen:inventory-scope', value: 'npm production packages, Cargo resolved packages including build dependencies, bundled Noto Emoji; OS libraries excluded' },
        ],
      },
    },
    components: reports.components,
  }
  const sbomName = `${prefix}.cdx.json`
  const licenseName = `${prefix}.licenses.txt`
  await writeFile(path.join(output, sbomName), `${JSON.stringify(sbom, null, 2)}\n`)
  await writeFile(path.join(output, licenseName), reports.licenses)
  files.push(sbomName, licenseName)
  const entries = []
  for (const name of files.sort()) {
    const file = path.join(output, name)
    const size = (await stat(file)).size
    if (size === 0) throw new Error(`Empty release asset: ${name}`)
    entries.push({ name, size, sha256: await hashFile(file) })
  }
  await writeFile(path.join(output, `${prefix}.manifest.json`), `${JSON.stringify({ tag, sha, platform, files: entries }, null, 2)}\n`)
}

/** Validate all five platform manifests before granting the publisher any files. */
export async function verifyReleaseAssets(
  directory,
  tag,
  sha,
) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(tag) || !/^[a-f\d]{40}$/u.test(sha)) {
    throw new Error('Invalid release tag or commit.')
  }
  const names = await readdir(directory)
  const expected = []
  for (const [platform, extensions] of Object.entries(releasePlatforms)) {
    const prefix = `cute-screen-${tag.slice(1)}-${platform}`
    const manifestName = `${prefix}.manifest.json`
    const manifest = JSON.parse(await readFile(path.join(directory, manifestName), 'utf8'))
    const required = [...extensions.map((extension) => `${prefix}.${extension}`), `${prefix}.cdx.json`, `${prefix}.licenses.txt`].sort()
    if (
      manifest.tag !== tag ||
      manifest.sha !== sha ||
      manifest.platform !== platform ||
      JSON.stringify(manifest.files.map((entry) => entry.name).sort()) !== JSON.stringify(required)
    ) {
      throw new Error(`Incomplete or mismatched platform manifest: ${platform}`)
    }
    for (const entry of manifest.files) {
      const file = path.join(directory, entry.name)
      if (
        entry.size <= 0 ||
        (await stat(file)).size !== entry.size ||
        await hashFile(file) !== entry.sha256
      ) {
        throw new Error(`Release asset checksum/size mismatch: ${entry.name}`)
      }
    }
    expected.push(...required, manifestName)
  }
  // SHA256SUMS may exist after a previous local validation; it is regenerated.
  if (names.some((name) => name !== 'SHA256SUMS' && !expected.includes(name))) {
    throw new Error('Unexpected files in release asset directory.')
  }
  const checksums = []
  for (const name of expected.sort()) {
    checksums.push(`${await hashFile(path.join(directory, name))}  ${name}`)
  }
  await writeFile(path.join(directory, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
  return [...expected, 'SHA256SUMS']
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'version') await validateReleaseVersion(...args)
  else if (command === 'package') await prepareReleaseAssets(...args)
  else throw new Error('Usage: release-assets.mjs version <root> <tag> | package <root> <tag> <platform> <sha>')
}
