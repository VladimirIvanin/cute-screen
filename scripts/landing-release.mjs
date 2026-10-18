import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { releasePlatforms } from './release-assets.mjs'

const repository = 'VladimirIvanin/cute-screen'
const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

export function createLandingCatalog(release) {
  if (
    !tagPattern.test(release.tag_name) ||
    release.draft ||
    release.prerelease
  ) return null
  const tag = release.tag_name
  const base = `https://github.com/${repository}/releases/download/${tag}/`
  const required = Object.entries(releasePlatforms).flatMap(([platform, extensions]) =>
    extensions.map((extension) => ({ platform, extension, name: `cute-screen-${tag.slice(1)}-${platform}.${extension}` })),
  )
  const names = [...required.map((file) => file.name), 'SHA256SUMS']
  for (const name of names) {
    const matches = release.assets.filter((asset) => asset.name === name)
    if (
      matches.length !== 1 ||
      matches[0].size <= 0 ||
      matches[0].state !== 'uploaded' ||
      matches[0].browser_download_url !== `${base}${name}`
    ) return null
  }
  return {
    tag,
    releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`,
    checksumsUrl: `${base}SHA256SUMS`,
    files: required.map((file) => ({ ...file, url: `${base}${file.name}` })),
  }
}

export function selectLandingCatalog(releases) {
  const catalogs = releases.map(createLandingCatalog).filter(Boolean)
  catalogs.sort((left, right) => {
    const a = left.tag.slice(1).split('.').map(BigInt)
    const b = right.tag.slice(1).split('.').map(BigInt)
    for (let index = 0; index < 3; index++) {
      if (a[index] !== b[index]) return a[index] > b[index] ? -1 : 1
    }
    return 0
  })
  if (!catalogs.length) throw new Error('No complete stable release is available for the landing.')
  return catalogs[0]
}

export async function fetchLandingCatalog({ token, request = fetch } = {}) {
  const releases = []
  for (let page = 1; ; page++) {
    const response = await request(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Landing release lookup failed (HTTP ${response.status}).`)
    const entries = await response.json()
    if (!Array.isArray(entries)) throw new Error('Invalid GitHub release response.')
    releases.push(...entries)
    if (entries.length < 100) break
  }
  return selectLandingCatalog(releases)
}

export async function readLandingCatalog(file) {
  const catalog = JSON.parse(await readFile(file, 'utf8'))
  // Validate the offline snapshot and CI input with the same completeness rules.
  const validated = createLandingCatalog({
    tag_name: catalog.tag,
    assets: [
      ...catalog.files.map((file) => ({ name: file.name, browser_download_url: file.url, state: 'uploaded', size: 1 })),
      { name: 'SHA256SUMS', browser_download_url: catalog.checksumsUrl, state: 'uploaded', size: 1 },
    ],
  })
  if (!validated || validated.releaseUrl !== catalog.releaseUrl) throw new Error('Invalid landing release catalog.')
  return validated
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2]
  if (!output) throw new Error('Usage: landing-release.mjs <output.json>')
  const catalog = await fetchLandingCatalog({ token: process.env.GH_TOKEN })
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(`Landing downloads: ${catalog.tag} (${catalog.files.length} installers)`)
}
