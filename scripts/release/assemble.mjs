import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  packageNames,
  sha256,
  targets,
  validateManifest,
} from './contracts.mjs'
import {
  json,
  root,
  run,
  walk,
  writeJson,
} from './io.mjs'
import { checkVersions } from './versions.mjs'

const installReports = ['linux-x64', 'linux-arm64'].flatMap((id) => ['22.04', '24.04'].map((base) => `${id}-install-${base}.json`))

export async function verifyReleaseSet(directory) {
  const manifest = await json(path.join(directory, 'manifest.json'))
  const names = (await walk(directory)).map((file) => path.relative(directory, file))
  if (names.some((name) => name.includes(path.sep))) throw new Error('Release assets must have flat, unique names')
  const entries = await Promise.all(names.map(async (name) => [name, await readFile(path.join(directory, name))]))
  const files = new Map(entries)
  validateManifest(manifest, files)
  const sums = files.get('SHA256SUMS')?.toString('utf8').trim().split('\n')
  if (!sums) throw new Error('Missing SHA256SUMS')
  const checksummed = new Set()
  for (const line of sums) {
    const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9._-]+)$/u.exec(line)
    if (
      !match ||
      checksummed.has(match[2]) ||
      !files.has(match[2]) ||
      sha256(files.get(match[2])) !== match[1]
    ) {
      throw new Error(`Invalid release checksum: ${line}`)
    }
    checksummed.add(match[2])
  }
  if (checksummed.size !== files.size - 1 || checksummed.has('SHA256SUMS')) throw new Error('Incomplete checksum coverage')
  for (const required of ['sbom.cdx.json', 'licenses.json', 'README.txt', 'macos-intel-verification.json',
    ...targets.map(({ id }) => `${id}-verification.json`), ...installReports,
    'linux-x64-native-licenses.txt', 'linux-arm64-native-licenses.txt']) {
    if (!files.has(required)) throw new Error(`Missing release report: ${required}`)
  }
  return manifest
}

export async function assemble(incoming) {
  const version = await checkVersions()
  const commit = run('git', ['rev-parse', 'HEAD'])
  const output = path.join(root, 'artifacts/release-complete')
  const files = await walk(path.resolve(incoming))
  const names = [...packageNames(version), ...targets.map(({ id }) => `${id}-verification.json`),
    'macos-intel-verification.json', 'sbom.cdx.json', 'licenses.json', 'README.txt',
    'linux-x64-native-licenses.txt', 'linux-arm64-native-licenses.txt', ...installReports]
  await mkdir(output, { recursive: true })
  for (const name of names) {
    const candidates = files.filter((file) => path.basename(file) === name)
    if (candidates.length !== 1) throw new Error(`Missing or duplicate artifact: ${name}`)
    await copyFile(candidates[0], path.join(output, name))
  }
  const reports = []
  for (const name of names.filter((entry) => entry.endsWith('-verification.json') || installReports.includes(entry))) {
    const report = await json(path.join(output, name))
    if (report.version !== version || report.commit !== commit) throw new Error(`Verification report has wrong provenance: ${name}`)
    reports.push(report)
  }
  const packages = await Promise.all(packageNames(version).map(async (name) => {
    const bytes = await readFile(path.join(output, name))
    return { name, bytes: bytes.length, sha256: sha256(bytes) }
  }))
  await writeJson(path.join(output, 'manifest.json'), {
    schemaVersion: 1, version, commit, packages, verification: reports,
    qualityGate: { workflow: 'ci.yml', commit, result: process.env.RELEASE_QUALITY_RESULT },
    manualAcceptance: 'pending; see A14',
  })
  if (process.env.RELEASE_QUALITY_RESULT !== 'success') throw new Error('Same-SHA CI must succeed before assembly')
  const sums = []
  for (const file of await walk(output)) {
    if (path.basename(file) !== 'SHA256SUMS') sums.push(`${sha256(await readFile(file))}  ${path.basename(file)}`)
  }
  await writeFile(path.join(output, 'SHA256SUMS'), `${sums.sort().join('\n')}\n`)
  await verifyReleaseSet(output)
  console.log(`Complete release ${version}: seven verified installers and reports`)
}
