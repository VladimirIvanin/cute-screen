// Build the console companion with the same target/profile before Tauri packages it.
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
function run(
  command,
  arguments_,
) {
  const result = spawnSync(command, arguments_, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (args[0] === 'build' || args[0] === 'dev') {
  const hostOutput = spawnSync('rustc', ['-vV'], { encoding: 'utf8' })
  if (hostOutput.status !== 0) throw new Error('Cannot resolve Rust host')
  const host = hostOutput.stdout.match(/^host: (.+)$/m)?.[1]
  if (!host) throw new Error('Missing Rust host triple')
  const explicit = args.find((arg) => arg.startsWith('--target='))?.slice(9) ?? (args.includes('--target') ? args[args.indexOf('--target') + 1] : undefined)
  const target = explicit ?? host
  const debug = args[0] === 'dev' || args.includes('--debug')
  const profile = debug ? 'debug' : 'release'
  const targets = target === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target]
  const outputRoot = path.resolve(root, process.env.CARGO_TARGET_DIR ?? 'target')
  const paths = []
  mkdirSync(path.join(root, 'src-tauri/binaries'), { recursive: true })
  for (const triple of targets) {
    const cargoArgs = ['build', '-p', 'cute-screen-mcp']
    if (!debug) cargoArgs.push('--release')
    if (explicit || target === 'universal-apple-darwin') cargoArgs.push('--target', triple)
    if (args.includes('--locked')) cargoArgs.push('--locked')
    run('cargo', cargoArgs)
    paths.push(path.join(outputRoot, explicit ? triple : '', profile, triple.includes('windows') ? 'cute-screen-mcp.exe' : 'cute-screen-mcp'))
    // Each architecture's tauri-build needs its own externalBin before lipo.
    if (target === 'universal-apple-darwin') {
      copyFileSync(paths.at(-1), path.join(root, 'src-tauri/binaries', `cute-screen-mcp-${triple}`))
    }
  }
  mkdirSync(path.join(root, 'src-tauri/binaries'), { recursive: true })
  const destination = path.join(root, 'src-tauri/binaries', `cute-screen-mcp-${target}${target.includes('windows') ? '.exe' : ''}`)
  if (target === 'universal-apple-darwin') run('lipo', ['-create', ...paths, '-output', destination])
  else copyFileSync(paths[0], destination)

}
const configArgs = args[0] === 'build' || args[0] === 'dev' ? ['--config', path.join(root, 'src-tauri/tauri.mcp.conf.json')] : []
const separator = args.indexOf('--')
const forwarded = separator === -1
  ? [...args, ...configArgs]
  : [...args.slice(0, separator), ...configArgs, ...args.slice(separator)]
run(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...forwarded])
