import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  afterEach,
  expect,
  it,
} from 'vitest'
import { browserProfileHooks } from '../e2e/browser-profile'
import { directoryBytes } from '../../scripts/workspace-storage.mjs'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cute-screen-storage-test-'))
  roots.push(root)
  return root
}

it('releases only its own Chrome profile and preserves another worker and failure evidence', async () => {
  const root = await fixture()
  const first = browserProfileHooks(root)
  const second = browserProfileHooks(root)
  const capabilities = { 'goog:chromeOptions': { args: ['--headless=new'] } }
  await first.beforeSession({}, capabilities)
  await second.beforeSession({}, { 'goog:chromeOptions': { args: [] } })
  await writeFile(path.join(root, 'failure.png'), 'evidence')
  expect(capabilities['goog:chromeOptions'].args[0]).toBe('--headless=new')
  expect((await readdir(root)).filter((name) => name.startsWith('chrome-profile-'))).toHaveLength(2)
  await first.afterSession()
  await first.afterSession()
  expect((await readdir(root)).filter((name) => name.startsWith('chrome-profile-'))).toHaveLength(1)
  expect(await readFile(path.join(root, 'failure.png'), 'utf8')).toBe('evidence')
  await second.afterSession()
  expect(await readdir(root)).toEqual(['failure.png'])
})

it('refuses an external Chrome profile without changing or deleting it', async () => {
  const root = await fixture()
  const hooks = browserProfileHooks(root)
  await expect(hooks.beforeSession({}, {
    'goog:chromeOptions': { args: [`--user-data-dir=${root}`] },
  })).rejects.toThrow('owned temporary')
  await hooks.afterSession()
  expect(await readdir(root)).toEqual([])
})

it('does not follow junctions when reporting disk usage', async () => {
  const root = await fixture()
  const external = await fixture()
  await writeFile(path.join(root, 'local'), '123')
  await writeFile(path.join(external, 'external'), '123456789')
  await symlink(external, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(await directoryBytes(root)).toBe(3)
})
