export type DownloadOS = 'windows' | 'macos' | 'linux'
export type DownloadArchitecture = 'x64' | 'arm64' | 'unsupported'

export interface DownloadNavigator {
  userAgent: string
  maxTouchPoints: number
  userAgentData?: {
    platform: string
    mobile?: boolean
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>
  }
}

export function detectDownloadOS(source: DownloadNavigator): DownloadOS | null {
  const ua = source.userAgent
  const data = source.userAgentData
  const iPadDesktop = /Macintosh/iu.test(ua) && source.maxTouchPoints > 1
  if (
    data?.mobile ||
    /Android|iPhone|iPad|iPod|CrOS|Windows Phone/iu.test(ua) ||
    /Android|iOS|Chrome OS/iu.test(data?.platform ?? '') ||
    iPadDesktop
  ) return null
  const platform = data?.platform
  if (platform) {
    if (platform === 'Windows') return 'windows'
    if (platform === 'macOS') return 'macos'
    return platform === 'Linux' ? 'linux' : null
  }
  if (/Windows NT/iu.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/iu.test(ua)) return 'macos'
  if (/Linux/iu.test(ua)) return 'linux'
  return null
}

export function detectDownloadArchitecture(hints: { architecture?: string; bitness?: string }): DownloadArchitecture {
  if (hints.bitness === '32') return 'unsupported'
  if (hints.architecture === 'arm' && hints.bitness === '64') return 'arm64'
  return 'x64'
}

export async function resolveDownload(source: DownloadNavigator): Promise<{
  os: DownloadOS
  architecture: 'x64' | 'arm64' | 'universal'
} | null> {
  const os = detectDownloadOS(source)
  if (!os) return null
  if (os === 'macos') return { os, architecture: 'universal' }
  const legacy32 = /\b(?:i[3-6]86|armv[5-8]l)\b/iu.test(source.userAgent) && !/WOW64|Win64/iu.test(source.userAgent)
  let architecture: DownloadArchitecture = legacy32 ? 'unsupported' : 'x64'
  if (source.userAgentData?.getHighEntropyValues) {
    try {
      const hints = await source.userAgentData.getHighEntropyValues(['architecture', 'bitness'])
      if (hints.bitness) architecture = detectDownloadArchitecture(hints)
    } catch (error) {
      // Denied/unsupported hints retain the UA result or the explicit x64 default.
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        console.warn('Download architecture hints unavailable; retaining the fallback.', error)
      }
    }
  }
  return architecture === 'unsupported' ? null : { os, architecture }
}
