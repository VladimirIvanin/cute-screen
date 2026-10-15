import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  format,
  resolveConfig,
} from 'prettier'

const target = process.argv[2]
if (!target) throw new Error('Expected the temporary IPC bindings file')
// Generated IPC is owned by its generator, outside the source formatter ignore list.
const options = await resolveConfig(path.resolve('.prettierrc.json'))
await writeFile(target, await format(await readFile(target, 'utf8'), { ...options, parser: 'typescript' }))
