import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const cache = process.env.CUTE_SCREEN_QUALITY_TOOLS_ROOT ?? path.join(homedir(), '.cache/cute-screen-ci/quality-tools')
const suffix = process.platform === 'win32' ? '.exe' : ''
const tools = Object.entries(manifest.qualityTools).map(([name, version]) => ({
  name,
  version,
  directory: path.join(cache, name, version),
  binary: path.join(cache, name, version, 'bin', `${name}${suffix}`),
}))

function run(
  command,
  args,
  capture = false,
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: {
        ...process.env,
        HK_FILE: path.join(root, 'hk.pkl'),
        PATH: [...tools.map((tool) => path.join(tool.directory, 'bin')), process.env.PATH ?? ''].join(path.delimiter),
      },
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let output = ''
    if (capture) {
      child.stdout.on('data', (data) => {
        output += data
      })
      child.stderr.on('data', (data) => {
        output += data
      })
    }
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} interrupted by ${signal}`))
      } else {
        resolve({ code, output })
      }
    })
  })
}

async function verify(tool) {
  const result = await run(tool.binary, ['--version'], true)
  const version = result.output.match(/\b\d+\.\d+\.\d+\b/u)?.[0]
  if (result.code !== 0 || version !== tool.version) {
    throw new Error(`${tool.name}: expected ${tool.version}, found ${result.output.trim() || 'no version'}.`)
  }
}

async function install() {
  for (const tool of tools) {
    try {
      await verify(tool)
      console.log(`${tool.name} ${tool.version}: cached`)
      continue
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const result = await run('cargo', [
      'install', tool.name, '--version', `=${tool.version}`, '--locked',
      '--root', tool.directory, '--target-dir', path.join(root, 'target'),
    ])
    if (result.code !== 0) throw new Error(`Installing ${tool.name} failed (${result.code}).`)
    await verify(tool)
  }
}

try {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'install') {
    await install()
  } else if (command === 'verify') {
    for (const tool of tools) await verify(tool)
    console.log('Pinned quality tools verified.')
  } else if (command === 'hk' || command === 'machete') {
    const tool = tools.find((candidate) => candidate.name === (command === 'hk' ? 'hk' : 'cargo-machete'))
    await verify(tool)
    const result = await run(tool.binary, args)
    process.exitCode = result.code
  } else {
    throw new Error('Usage: quality-tools.mjs install | verify | hk <args> | machete')
  }
} catch (error) {
  console.error(`${error.message}\nRun pnpm tools:install to install the pinned quality tools.`)
  process.exitCode = 1
}
