import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'
import {
  packageNames,
  sha256,
  targets,
} from '../../scripts/release/contracts.mjs'
import { publish } from '../../scripts/release/publish.mjs'

const commit = 'a'.repeat(40)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function withReleaseFixture(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'cute-screen-publish-tests-'))
  if (!directory.startsWith(path.join(tmpdir(), 'cute-screen-publish-tests-'))) throw new Error('Unexpected fixture path')
  try {
    const names = [...packageNames('1.2.3'), ...targets.map(({ id }) => `${id}-verification.json`),
      ...['linux-x64', 'linux-arm64'].flatMap((id) => ['22.04', '24.04'].map((base) => `${id}-install-${base}.json`)),
      'macos-intel-verification.json', 'sbom.cdx.json', 'licenses.json', 'README.txt',
      'linux-x64-native-licenses.txt', 'linux-arm64-native-licenses.txt']
    for (const name of names) await writeFile(path.join(directory, name), '{}')
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1, version: '1.2.3', commit,
      packages: packageNames('1.2.3').map((name) => ({ name, bytes: 2, sha256: sha256(Buffer.from('{}')) })),
      qualityGate: { commit, result: 'success' },
    }))
    const sums = []
    for (const name of [...names, 'manifest.json']) {
      sums.push(`${sha256(await readFile(path.join(directory, name)))}  ${name}`)
    }
    await writeFile(path.join(directory, 'SHA256SUMS'), `${sums.join('\n')}\n`)
    for (const [key, value] of Object.entries({ GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'v1.2.3', GITHUB_SHA: commit, GITHUB_REPOSITORY: 'fixture/cute-screen',
      GH_TOKEN: 'unit-test-only', GITHUB_API_URL: 'https://api.example.test' })) vi.stubEnv(key, value)
    await action(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

it('does not send any mutation when the tag already has a published Release', async () => {
  await withReleaseFixture(async (directory) => {
    const methods: string[] = []
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      methods.push(options.method ?? 'GET')
      return Response.json(url.includes('/commits/') ? { sha: commit } : { id: 1, draft: false })
    })
    await expect(publish(directory)).rejects.toThrow('Published Release is immutable')
    expect(methods).toEqual(['GET', 'GET'])
  })
})

it('rechecks the draft before each upload and stops if it was published during a retry', async () => {
  await withReleaseFixture(async (directory) => {
    let draft = true
    const mutations: boolean[] = []
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      if (url.includes('/commits/')) return Response.json({ sha: commit })
      if (options.method === 'POST') {
        mutations.push(draft)
        draft = false
        return Response.json({ id: 2 })
      }
      return Response.json({ id: 1, draft, tag_name: 'v1.2.3', body: `<!-- cute-screen-commit:${commit} -->`,
        assets: [], upload_url: 'https://uploads.example.test/releases/1/assets{?name,label}' })
    })
    await expect(publish(directory)).rejects.toThrow('Published Release is immutable')
    expect(mutations).toEqual([true])
  })
})
