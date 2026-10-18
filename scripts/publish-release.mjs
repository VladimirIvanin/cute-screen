import { createHash } from 'node:crypto'
import { openAsBlob } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  hashFile,
  releasePlatforms,
  verifyReleaseAssets,
} from './release-assets.mjs'

async function responseHash(response) {
  if (!response.ok || !response.body) throw new Error(`Release asset download failed (HTTP ${response.status}).`)
  const hash = createHash('sha256')
  for await (const chunk of response.body) hash.update(chunk)
  return hash.digest('hex')
}

export function releaseDownloadNotes(
  repository,
  tag,
) {
  const lines = [
    '<!-- cute-screen-downloads:start -->',
    '## Downloads',
    '',
    '**UNSIGNED / UNOFFICIAL BUILD.** Windows SmartScreen and macOS Gatekeeper may show warnings.',
    'macOS: one universal DMG for Intel and Apple Silicon. Linux: Ubuntu 22.04 or newer; Wayland capabilities depend on desktop portals.',
    'CLI/package checks do not certify the complete install/capture/export workflow on every platform.',
    '',
  ]
  for (const [platform, extensions] of Object.entries(releasePlatforms)) {
    const links = extensions.map((extension) => {
      const name = `cute-screen-${tag.slice(1)}-${platform}.${extension}`
      return `[${extension}](https://github.com/${repository}/releases/download/${tag}/${name})`
    })
    lines.push(`- ${platform}: ${links.join(' · ')}`)
  }
  lines.push('', `[SHA-256 checksums](https://github.com/${repository}/releases/download/${tag}/SHA256SUMS) · Platform SBOMs and license reports are attached below.`, '<!-- cute-screen-downloads:end -->')
  return lines.join('\n')
}

/** Publish only a complete, verified set, retaining release notes and conflicting assets. */
export async function publishRelease({
  directory,
  repository,
  tag,
  sha,
  token,
  request = fetch,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository ?? '') || !token) {
    throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required.')
  }
  const names = await verifyReleaseAssets(directory, tag, sha)
  const api = `https://api.github.com/repos/${repository}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  async function json(
    url,
    method = 'GET',
    body,
    allowMissing = false,
  ) {
    const response = await request(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (allowMissing && response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub ${method} failed (HTTP ${response.status}).`)
    return response.json()
  }
  const commit = await json(`${api}/commits/${tag}`)
  if (commit.sha !== sha) throw new Error('Release tag moved after checks; refusing to publish.')
  let release = await json(`${api}/releases/tags/${tag}`, 'GET', undefined, true)
  // The tag endpoint returns published releases; drafts require listing with write access.
  if (!release) {
    for (let page = 1; ; page += 1) {
      const entries = await json(`${api}/releases?per_page=100&page=${page}`)
      release = entries.find((entry) => entry.tag_name === tag) ?? null
      if (release || entries.length < 100) break
    }
  }
  if (release?.immutable) throw new Error('Release is immutable; attach assets to a new version before publishing it.')
  const created = !release
  const autoPublishMarker = '<!-- cute-screen-release:auto-publish -->'
  const publishWhenReady = created || (release.body ?? '').includes(autoPublishMarker)
  if (!release) {
    release = await json(`${api}/releases`, 'POST', {
      tag_name: tag,
      target_commitish: sha,
      name: tag,
      draft: true,
      body: autoPublishMarker,
    })
  }
  const existing = []
  for (let page = 1; ; page += 1) {
    const entries = await json(`${api}/releases/${release.id}/assets?per_page=100&page=${page}`)
    existing.push(...entries)
    if (entries.length < 100) break
  }
  const assets = new Map(existing.map((entry) => [entry.name, entry]))
  const digests = new Map()
  // Preflight every conflict before making any upload or editing release notes.
  for (const name of names) {
    const digest = await hashFile(path.join(directory, name))
    digests.set(name, digest)
    const asset = assets.get(name)
    if (asset) {
      const remote = await responseHash(await request(`${api}/releases/assets/${asset.id}`, {
        headers: { ...headers, Accept: 'application/octet-stream' },
      }))
      if (remote !== digest) throw new Error(`Published asset differs: ${name}. Keep this release intact and use a new version.`)
    }
  }
  for (const name of names) {
    if (assets.has(name)) continue
    const body = await openAsBlob(path.join(directory, name))
    const url = new URL(release.upload_url.split('{')[0])
    url.searchParams.set('name', name)
    const response = await request(url.toString(), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body,
    })
    if (!response.ok) throw new Error(`Upload failed for ${name} (HTTP ${response.status}). Rerun the failed publish job.`)
    const asset = await response.json()
    const remote = await responseHash(await request(`${api}/releases/assets/${asset.id}`, {
      headers: { ...headers, Accept: 'application/octet-stream' },
    }))
    if (remote !== digests.get(name)) throw new Error(`Downloaded asset checksum mismatch: ${name}`)
  }
  // Preserve user-written notes and replace only our own generated section.
  const notes = (release.body ?? '')
    .replace(autoPublishMarker, '')
    .replace(/\n?<!-- cute-screen-downloads:start -->[^]*?<!-- cute-screen-downloads:end -->/u, '')
    .trimEnd()
  await json(`${api}/releases/${release.id}`, 'PATCH', {
    body: `${notes}${notes ? '\n\n' : ''}${releaseDownloadNotes(repository, tag)}`,
    ...(publishWhenReady ? { draft: false } : {}),
  })
  return release.html_url
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = await publishRelease({
    directory: path.resolve('artifacts/release-assets'),
    repository: process.env.GITHUB_REPOSITORY,
    tag: process.env.RELEASE_TAG,
    sha: process.env.RELEASE_SHA,
    token: process.env.GH_TOKEN,
  })
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises')
    const checksums = await readFile('artifacts/release-assets/SHA256SUMS', 'utf8')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `Published [release assets](${url}).\n\n\`\`\`text\n${checksums}\`\`\`\n`)
  }
  console.log(`Verified release assets: ${url}`)
}
