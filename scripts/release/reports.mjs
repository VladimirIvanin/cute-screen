import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  json,
  main,
  root,
  run,
  writeJson,
} from './io.mjs'
import { checkVersions } from './versions.mjs'

main(async () => {
  const version = await checkVersions()
  const directory = path.join(root, 'artifacts/release/reports')
  await writeJson(path.join(directory, 'licenses.json'), {
    version,
    commit: run('git', ['rev-parse', 'HEAD']),
    npm: JSON.parse(run('pnpm', ['licenses', 'list', '--prod', '--json'], { maxBuffer: 32 * 1024 * 1024 })),
    cargo: JSON.parse(run('cargo', ['metadata', '--locked', '--format-version', '1'], { maxBuffer: 32 * 1024 * 1024 }))
      .packages.map(({ name, version, license, source }) => ({ name, version, license, source })),
    assets: await readFile(path.join(root, 'apps/desktop/public/font-licenses.txt'), 'utf8'),
    scope: 'Source dependency inventory; platform packagedFiles and native copyright reports describe bundled runtime files.',
  })
  run('pnpm', ['--dir', 'tools/release-sbom', 'exec', 'cdxgen', '-t', 'js', '-t', 'rust', '-r',
    '--no-install-deps', '--fail-on-error', '--spec-version', '1.6', '-o', path.join(directory, 'sbom.cdx.json'), root],
  { timeout: 300_000, maxBuffer: 32 * 1024 * 1024 })
  const bom = await json(path.join(directory, 'sbom.cdx.json'))
  if (bom.bomFormat !== 'CycloneDX' || !bom.components?.length) throw new Error('SBOM is empty or invalid')
  for (const ecosystem of ['pkg:npm/', 'pkg:cargo/']) {
    if (!bom.components.some((component) => component.purl?.startsWith(ecosystem))) {
      throw new Error(`SBOM is missing ${ecosystem} dependencies`)
    }
  }
  // Deterministic metadata makes identical-SHA retries comparable; no false binary reproducibility claim.
  const commit = run('git', ['rev-parse', 'HEAD'])
  const uuid = `${commit.slice(0, 8)}-${commit.slice(8, 12)}-5${commit.slice(13, 16)}-8${commit.slice(17, 20)}-${commit.slice(20, 32)}`
  bom.serialNumber = `urn:uuid:${uuid}`
  bom.metadata.timestamp = run('git', ['show', '-s', '--format=%cI', 'HEAD'])
  await writeJson(path.join(directory, 'sbom.cdx.json'), bom)
  await writeFile(path.join(directory, 'README.txt'), [
    `Cute Screen ${version} — UNSIGNED / UNOFFICIAL BUILD`,
    `Commit: ${commit}`,
    'macOS: ad-hoc signature only, no Developer ID/notarization. Use Privacy & Security > Open Anyway if allowed.',
    'Windows: unsigned. SmartScreen may warn; Smart App Control or managed policy can block execution.',
    'Missing WebView2 requires network access to install Evergreen WebView2.',
    'Linux: Ubuntu 22.04/glibc 2.35 baseline. AppImage FUSE and GNOME/KDE Wayland portal acceptance is separate.',
    'A tag and successful packaging do not prove physical capture, native permissions, or acceptance on every OS.',
    'Publish this draft manually only after A14 acceptance; do not publish while a release workflow is running.',
    'See docs/BUILD_RELEASE.md for checksums, installation, upgrade and uninstall checks.',
    '',
  ].join('\n'))
  console.log(`Release reports ready with Node ${process.version}`)
})
