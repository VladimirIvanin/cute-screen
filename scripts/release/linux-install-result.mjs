import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { validateResources } from './contracts.mjs'
import {
  json,
  main,
  root,
  run,
  writeJson,
} from './io.mjs'
import { checkVersions } from './versions.mjs'

main(async () => {
  const [id, base, incoming] = process.argv.slice(2)
  if (!['linux-x64', 'linux-arm64'].includes(id) || !['22.04', '24.04'].includes(base)) throw new Error('Invalid Linux install target')
  const version = await checkVersions()
  const directory = path.join(root, 'artifacts/clean-install')
  const read = async (file) => (await readFile(path.join(directory, file), 'utf8')).trim()
  const info = await json(path.join(directory, 'release-info.json'))
  validateResources(info, version, await json(path.join(incoming, 'frontend-inventory.json')))
  const architecture = await read('architecture.txt')
  if (architecture !== (id === 'linux-x64' ? 'x86_64' : 'aarch64')) throw new Error('Clean install did not run natively')
  if (await read('version.txt') !== `cute-screen ${version}` || await read('package-version.txt') !== version) {
    throw new Error('Clean install version mismatch')
  }
  if (!(await read('help.txt')).includes('capture')) throw new Error('Installed CLI help is incomplete')
  await writeJson(path.join(directory, `${id}-install-${base}.json`), {
    id, base, version, commit: run('git', ['rev-parse', 'HEAD']), architecture,
    declaredDependenciesInstall: 'passed', cli: 'passed', resources: info,
    desktopAndWaylandAcceptance: 'pending',
  })
})
