import {
  copyFile,
  mkdir,
  readdir,
  stat,
} from 'node:fs/promises'
import path from 'node:path'

async function modified(file) {
  try {
    return (await stat(file)).mtimeMs
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

/** WDIO validates the cached executable against WebView2 before starting it. */
export async function cacheDownloadedEdgeDriver(
  downloads,
  cache,
) {
  let entries
  try {
    entries = await readdir(downloads, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  let newest
  let newestTime = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+-[a-f0-9]{16}$/u.test(entry.name)) continue
    const candidate = path.join(downloads, entry.name, 'msedgedriver.exe')
    const time = await modified(candidate)
    if (time > newestTime) {
      newest = candidate
      newestTime = time
    }
  }
  if (!newest) return
  const target = path.join(cache, 'msedgedriver.exe')
  if (await modified(target) >= newestTime) return
  await mkdir(cache, { recursive: true })
  await copyFile(newest, target)
}
