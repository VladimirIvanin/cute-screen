import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const artifactDir = path.join(root, 'artifacts', 'reference-perf')
const executable = path.join(root, 'target', 'debug', 'cute-screen')

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed`)
}

function output(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

async function preflight() {
  const failures = []
  if (process.platform !== 'linux')
    throw new Error('Reference runner must be Linux')
  if (process.env.XDG_SESSION_TYPE !== 'x11' || !process.env.DISPLAY) {
    throw new Error('Reference runner requires an interactive X11 session')
  }
  const osRelease = await readFile('/etc/os-release', 'utf8')
  if (!osRelease.includes('VERSION_ID="24.04"')) {
    throw new Error('Reference runner must use Ubuntu 24.04')
  }
  if (!output('lscpu', []).includes('11th Gen Intel(R) Core(TM) i7-11700K')) {
    throw new Error('Reference runner CPU fingerprint does not match i7-11700K')
  }
  const gpu = output('nvidia-smi', [
    '--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,pstate',
    '--format=csv,noheader,nounits',
  ])
  const [name, driver, temperature, utilization, pstate] = gpu
    .split(',')
    .map((value) => value.trim())
  if (name !== 'NVIDIA GeForce RTX 2070 SUPER' || driver !== '595.84') {
    failures.push(`GPU fingerprint does not match: ${gpu}`)
  }
  if (Number(temperature) > 65 || Number(utilization) > 5 || pstate === 'P0') {
    failures.push(`GPU is not idle/stable: ${gpu}`)
  }
  const governor = (
    await readFile(
      '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
      'utf8',
    )
  ).trim()
  if (governor !== 'performance') {
    failures.push(`CPU governor must be performance, got ${governor}`)
  }
  const webkit = output('pkg-config', ['--modversion', 'webkit2gtk-4.1'])
  if (webkit !== '2.52.3')
    failures.push(`WebKitGTK must be 2.52.3, got ${webkit}`)
  if (failures.length > 0) {
    throw new Error(
      `Reference runner preflight failed:\n- ${failures.join('\n- ')}`,
    )
  }
  return { os: 'Ubuntu 24.04', gpu, governor, webkit, host: os.hostname() }
}

function isolatedAppDataEnvironment(directory) {
  return {
    CUTE_SCREEN_E2E_APP_DATA: directory,
    XDG_CACHE_HOME: path.join(directory, 'cache'),
    XDG_CONFIG_HOME: path.join(directory, 'config'),
    XDG_DATA_HOME: path.join(directory, 'data'),
    XDG_STATE_HOME: path.join(directory, 'state'),
  }
}

const fingerprint = await preflight()
await mkdir(artifactDir, { recursive: true })
command(
  'pnpm',
  [
    'tauri',
    'build',
    '--debug',
    '--no-bundle',
    '--features',
    'fake-platform,test-harness',
    '--config',
    'src-tauri/tauri.test.conf.json',
  ],
  {
    env: { VITE_TEST_HARNESS: 'true', VITE_M01_HARNESS: 'true' },
  },
)

const reports = []
try {
  for (let pass = 1; pass <= 3; pass += 1) {
    const appData = await mkdtemp(
      path.join(os.tmpdir(), `cute-screen-reference-${pass}-`),
    )
    try {
      command(
        'pnpm',
        [
          'exec',
          'wdio',
          'run',
          'tests/e2e/wdio.tauri.conf.ts',
          '--spec',
          'tests/e2e/specs/tauri-reference-perf.e2e.ts',
        ],
        {
          env: {
            ...isolatedAppDataEnvironment(appData),
            CUTE_SCREEN_WDIO_APP_BINARY: executable,
            CUTE_SCREEN_WDIO_ARTIFACTS: artifactDir,
            CUTE_SCREEN_E2E_SCENARIO: `reference-perf-${pass}`,
            CUTE_SCREEN_E2E_HARNESS_QUERY: '?m05perf=1',
            CUTE_SCREEN_REFERENCE_PASS: String(pass),
          },
        },
      )
      reports.push(
        JSON.parse(
          await readFile(path.join(artifactDir, `run-${pass}.json`), 'utf8'),
        ),
      )
    } finally {
      await rm(appData, { recursive: true, force: true })
    }
  }
} finally {
  await writeFile(
    path.join(artifactDir, 'reference-summary.json'),
    `${JSON.stringify({ fingerprint, commit: process.env.GITHUB_SHA ?? 'local', reports }, null, 2)}\n`,
  )
}

if (reports.length !== 3 || reports.some((report) => report.gpuP95 > 16.7)) {
  throw new Error(
    'Reference performance gate did not produce three passing GPU reports',
  )
}
