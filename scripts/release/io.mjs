import { spawnSync } from 'node:child_process'
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sha256 } from './contracts.mjs'

export const root = fileURLToPath(new URL('../../', import.meta.url))

export function run(
  command,
  args,
  options = {},
) {
  if (command === 'pnpm' && process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args], options)
  }
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr || result.stdout}`)
  return (options.combinedOutput ? `${result.stdout}${result.stderr}` : result.stdout).trim()
}

export async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function writeJson(
  file,
  value,
) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(file))
    else if (entry.isFile()) files.push(file)
  }
  return files.sort()
}

export async function inventory(directory) {
  const files = await walk(directory)
  return Promise.all(files.map(async (file) => {
    const bytes = await readFile(file)
    return { path: path.relative(directory, file).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) }
  }))
}

export function main(action) {
  action().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
