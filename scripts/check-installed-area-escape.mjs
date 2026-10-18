import {
  spawn,
  execFile,
} from 'node:child_process'
import { promisify } from 'node:util'
import {
  readFile,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const execute = promisify(execFile)
const binary = process.env.CUTE_SCREEN_AREA_ESCAPE_BINARY ?? '/usr/bin/cute-screen'
const output = path.resolve('artifacts/installed-area-escape.json')
const evidence = { binary, sha256: createHash('sha256').update(await readFile(binary)).digest('hex'), attempts: [] }
if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE !== 'x11') {
  throw new Error('Installed Area Escape smoke requires an interactive X11 session')
}

async function poll(
  operation,
  message,
  timeout = 5000,
) {
  const deadline = Date.now() + timeout
  do {
    const result = await operation()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 50))
  } while (Date.now() < deadline)
  throw new Error(message)
}

async function visibleWindow(title) {
  try {
    const { stdout } = await execute('xdotool', ['search', '--all', '--onlyvisible', '--name', title])
    const matches = stdout.trim().split('\n').filter(Boolean)
    const clients = await Promise.all(matches.map(async (id) => {
      const properties = (await execute('xprop', ['-id', id, 'WM_CLASS'])).stdout
      return properties.includes('WM_CLASS(STRING)') && !properties.includes('mutter-x11-frames') ? id : undefined
    }))
    const windows = clients.filter(Boolean)
    if (windows.length > 1) throw new Error(`Multiple matching windows: ${title}`)
    return windows[0]
  } catch (cause) {
    if (cause.code === 1) return undefined
    throw cause
  }
}

const activeWindow = async () => (await execute('xdotool', ['getactivewindow'])).stdout.trim()
const fixture = spawn('xmessage', ['-title', 'Cute Screen focus regression', '-buttons', 'Close:0',
  '-geometry', '320x100+80+80', '-timeout', '120', 'Area Escape native focus regression'], { stdio: 'ignore' })
try {
  const external = await poll(() => visibleWindow('^Cute Screen focus regression$'), 'Focus fixture did not map')
  for (const dragging of [false, true, false]) {
    await execute('xdotool', ['windowactivate', '--sync', external])
    const before = await activeWindow()
    if (before !== external) throw new Error('External focus fixture did not activate')
    const capture = spawn(binary, ['capture', '--mode', 'area', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    capture.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    capture.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    let exitCode
    capture.on('exit', (code) => {
      exitCode = code
    })
    let quick
    const attempt = { dragging, before }
    evidence.attempts.push(attempt)
    try {
      quick = await poll(() => visibleWindow('^Cute Screen Quick Capture$'), 'Installed Quick did not map', 15000)
      attempt.quick = quick
      const properties = (await execute('xprop', ['-id', quick, '_NET_WM_PID'])).stdout
      const pid = properties.match(/= (\d+)/)?.[1]
      if (!pid) throw new Error('Quick does not identify its resident process')
      attempt.pid = Number(pid)
      attempt.processSha256 = createHash('sha256').update(await readFile(`/proc/${pid}/exe`)).digest('hex')
      if (attempt.processSha256 !== evidence.sha256) throw new Error('Resident binary differs from the file; restart Cute Screen')
      await poll(async () => {
        attempt.active = await activeWindow()
        return attempt.active === quick
      }, 'Visible Area selector did not acquire native keyboard focus')
      if (dragging) await execute('xdotool', ['mousemove', '--sync', '200', '200', 'mousedown', '1',
        'sleep', '0.1', 'mousemove', '--sync', '700', '500', 'sleep', '0.1'])
      await execute('xdotool', ['key', 'Escape'])
      await poll(() => exitCode !== undefined, 'Escape did not complete the native capture', 10000)
      attempt.exitCode = exitCode
      attempt.outcome = JSON.parse(stdout.trim())
      if (attempt.outcome.outcome !== 'cancelled') throw new Error(`Expected cancelled: ${stdout} ${stderr}`)
      await poll(async () => !(await visibleWindow('^Cute Screen Quick Capture$')), 'Cancelled Quick remained visible')
    } catch (cause) {
      attempt.error = cause.message
      throw cause
    } finally {
      if (dragging) await execute('xdotool', ['mouseup', '1'])
      // Cleanup is deliberately after all assertions; it cannot satisfy focus.
      if (quick && await visibleWindow('^Cute Screen Quick Capture$')) {
        await execute('xdotool', ['windowactivate', '--sync', quick])
        await execute('xdotool', ['key', 'Escape'])
      }
    }
  }
} finally {
  fixture.kill()
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`)
  console.info(output)
}
