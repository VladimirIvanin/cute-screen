import {
  spawn,
  spawnSync,
} from 'node:child_process'
import {
  randomBytes,
  X509Certificate,
} from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  homedir,
  tmpdir,
} from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function security(args) {
  const result = spawnSync('/usr/bin/security', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`security ${args[0]} failed: ${result.stderr.trim()}`)
  return result.stdout
}

try {
  if (process.platform !== 'darwin') throw new Error('A signed macOS build requires macOS.')
  const directory = process.env.CUTE_SCREEN_SIGNING_DIR
    ?? path.join(homedir(), 'Library', 'Application Support', 'Cute Screen Signing')
  const certificate = new X509Certificate(readFileSync(path.join(root, 'src-tauri/signing/vladimir-ivanin.pem')))
  const archive = process.env.APPLE_CERTIFICATE
    ? Buffer.from(process.env.APPLE_CERTIFICATE, 'base64')
    : readFileSync(path.join(directory, 'vladimir-ivanin.p12'))
  const password = process.env.APPLE_CERTIFICATE_PASSWORD
    ?? readFileSync(path.join(directory, 'pkcs12.pass'), 'utf8').trim()
  if (!password) throw new Error('The signing certificate password is empty.')
  const originalKeychains = security(['list-keychains', '-d', 'user'])
    .split('\n').map((line) => line.trim().replace(/^"|"$/gu, '')).filter(Boolean)
  const temporary = mkdtempSync(path.join(tmpdir(), 'cute-screen-signing-'))
  const keychain = path.join(temporary, 'build.keychain-db')
  const keychainPassword = randomBytes(32).toString('hex')
  let created = false
  let listed = false
  try {
    const archivePath = path.join(temporary, 'identity.p12')
    writeFileSync(archivePath, archive, { mode: 0o600 })
    security(['create-keychain', '-p', keychainPassword, keychain])
    created = true
    security(['unlock-keychain', '-p', keychainPassword, keychain])
    security(['set-keychain-settings', '-t', '7200', '-u', keychain])
    security(['import', archivePath, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign'])
    security(['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', keychainPassword, keychain])
    security(['list-keychains', '-d', 'user', '-s', ...originalKeychains, keychain])
    listed = true
    const identity = certificate.fingerprint.replaceAll(':', '')
    const identities = security(['find-identity', '-p', 'codesigning', keychain])
    if (!identities.includes(identity)) throw new Error('The private archive does not match the public signing certificate.')
    const env = { ...process.env, APPLE_SIGNING_IDENTITY: identity }
    // Tauri's automatic PKCS#12 import resolves Apple team identities only.
    // Import explicitly and let codesign use the pinned self-signed identity.
    delete env.APPLE_CERTIFICATE
    delete env.APPLE_CERTIFICATE_PASSWORD
    const child = spawn(process.execPath, [
      path.join(root, 'scripts/tauri.mjs'),
      'build',
      ...process.argv.slice(2),
    ], { cwd: root, stdio: 'inherit', env })
    const interrupt = () => child.kill('SIGTERM')
    process.on('SIGINT', interrupt)
    process.on('SIGTERM', interrupt)
    try {
      process.exitCode = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code) => resolve(code ?? 1))
      })
    } finally {
      process.off('SIGINT', interrupt)
      process.off('SIGTERM', interrupt)
    }
  } finally {
    try {
      if (listed) security(['list-keychains', '-d', 'user', '-s', ...originalKeychains])
    } finally {
      try {
        if (created) security(['delete-keychain', keychain])
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
