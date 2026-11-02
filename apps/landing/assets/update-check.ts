import {
  compare,
  valid,
} from 'semver'
import type { DownloadOS } from './download-platform'

export interface UpdateContext {
  version: string
  os: DownloadOS
  architecture?: 'x64' | 'arm64'
}

export function parseUpdateContext(search: string): UpdateContext | null | undefined {
  const params = new URLSearchParams(search)
  if (!['version', 'os', 'arch'].some((key) => params.has(key))) return undefined
  if (/%(?![a-f0-9]{2})/iu.test(search)) return null
  const versions = params.getAll('version')
  const systems = params.getAll('os')
  const architectures = params.getAll('arch')
  if (
    versions.length !== 1 ||
    systems.length !== 1 ||
    architectures.length > 1
  ) return null
  const version = versions[0]!
  const os = systems[0]!
  const architecture = architectures[0]
  if (
    version.length > 128 ||
    !valid(version) ||
    !/^[0-9]/u.test(version) ||
    version.trim() !== version
  ) return null
  if (
    os !== 'windows' &&
    os !== 'macos' &&
    os !== 'linux'
  ) return null
  if (
    architecture !== undefined &&
    architecture !== 'x64' &&
    architecture !== 'arm64'
  ) return null
  return { version, os, ...(architecture ? { architecture } : {}) }
}

export function showUpdateResult(): UpdateContext | null | undefined {
  const result = document.querySelector<HTMLElement>('[data-update-result]')
  const context = parseUpdateContext(location.search)
  if (!result || context === undefined) return context
  const message = result.querySelector<HTMLElement>('[data-update-message]')
  const link = result.querySelector<HTMLAnchorElement>('a')
  if (!message || !link) return context
  const english = document.documentElement.lang === 'en'
  const release = result.dataset.release
  result.hidden = false
  if (
    !context ||
    !release ||
    valid(release) !== release
  ) {
    message.textContent = english ? 'Could not check your version.' : 'Не удалось проверить версию.'
    return null
  }
  const order = compare(context.version, release)
  let status: string
  if (order < 0) status = english ? 'An update is available' : 'Доступна новая версия'
  else if (order === 0) status = english ? 'You have the latest version' : 'Установлена последняя версия'
  else status = english ? 'Your version is newer than the published release' : 'Установленная версия новее опубликованной'
  message.textContent = `${status}. ${context.version} → ${release}`
  link.href = `#download-${context.os}`
  link.textContent = english ? 'Downloads for ' + context.os : 'Загрузки для ' + context.os
  const locale = document.querySelector<HTMLAnchorElement>('.locale-switch')
  if (locale) {
    locale.search = new URLSearchParams({
      version: context.version,
      os: context.os,
      ...(context.architecture ? { arch: context.architecture } : {}),
    }).toString()
  }
  return context
}
