import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  assertDraftUpdate,
  sha256,
} from './contracts.mjs'
import { verifyReleaseSet } from './assemble.mjs'
import { walk } from './io.mjs'

export async function publish(directory) {
  if (process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF_TYPE !== 'tag') {
    throw new Error('Only a tag push may create a draft Release')
  }
  const manifest = await verifyReleaseSet(directory)
  const tag = `v${manifest.version}`
  if (process.env.GITHUB_SHA !== manifest.commit || process.env.GITHUB_REF_NAME !== tag) throw new Error('Release event provenance mismatch')
  if (manifest.qualityGate?.result !== 'success' || manifest.qualityGate.commit !== manifest.commit) throw new Error('Missing quality gate')
  const repository = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository)) throw new Error('Invalid repository')
  const token = process.env.GH_TOKEN
  if (!token) throw new Error('GH_TOKEN is required only for the publish job')
  const base = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}`
  async function api(
    method,
    url,
    body,
    binary = false,
  ) {
    const response = await fetch(url, { method, headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': binary ? 'application/octet-stream' : 'application/json',
    }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000) })
    if (method === 'GET' && response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status}); draft remains unpublished`)
    return response.status === 204 ? null : response.json()
  }
  const tagged = await api('GET', `${base}/commits/${encodeURIComponent(tag)}`)
  if (tagged?.sha !== manifest.commit) throw new Error('Tag moved after build')
  let release = await api('GET', `${base}/releases/tags/${encodeURIComponent(tag)}`)
  assertDraftUpdate(release, tag, manifest.commit)
  if (!release) {
    const notes = await readFile(path.join(directory, 'README.txt'), 'utf8')
    release = await api('POST', `${base}/releases`, {
      tag_name: tag, target_commitish: manifest.commit, name: `Cute Screen ${tag} — unofficial build`,
      draft: true, prerelease: false,
      body: `<!-- cute-screen-commit:${manifest.commit} -->\n\n${notes}\n\nCommit: ${manifest.commit}\n\nManual acceptance: pending.`,
    })
  }
  for (const file of await walk(directory)) {
    // Re-read before every mutation, including retries; never turn a published release back into a draft.
    release = await api('GET', `${base}/releases/${release.id}`)
    assertDraftUpdate(release, tag, manifest.commit)
    const name = path.basename(file)
    const bytes = await readFile(file)
    const existing = release.assets.find((asset) => asset.name === name)
    if (existing) {
      if (existing.digest === `sha256:${sha256(bytes)}` && existing.size === bytes.length) continue
      // Leave conflicting bytes untouched, even in a draft. A human can remove an incomplete draft and retry.
      throw new Error(`Existing draft asset differs: ${name}; refusing to overwrite`)
    }
    const upload = new URL(release.upload_url.replace(/\{.*$/u, ''))
    upload.searchParams.set('name', name)
    await api('POST', upload.href, bytes, true)
  }
  release = await api('GET', `${base}/releases/${release.id}`)
  assertDraftUpdate(release, tag, manifest.commit)
  console.log(`Draft ready for manual acceptance: ${release.html_url}`)
}
