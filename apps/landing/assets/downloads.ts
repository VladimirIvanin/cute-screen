import './brand-eyes'

import { resolveDownload } from './download-platform'

export async function enhanceDownloads(): Promise<void> {
  const button = document.querySelector<HTMLAnchorElement>('[data-download-primary]')
  const note = document.querySelector<HTMLElement>('[data-download-note]')
  if (!button || !note) return
  const recommendation = await resolveDownload(navigator)
  if (!recommendation) return
  const { os, architecture } = recommendation
  const file = document.querySelector<HTMLAnchorElement>(`[data-download-file="${os}-${architecture}"]`)
  const icon = document.querySelector<HTMLImageElement>(`[data-os-icon="${os}"]`)
  if (!file || !icon) return
  const english = document.documentElement.lang === 'en'
  const name = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }[os]
  const image = icon.cloneNode(true) as HTMLImageElement
  image.removeAttribute('data-os-icon')
  image.width = 20
  image.height = 20
  button.replaceChildren(image, document.createTextNode(`${english ? 'Download for' : 'Скачать для'} ${name}`))
  button.href = file.href
  note.textContent = `DEB · ${architecture}`
  if (os === 'windows') note.textContent = `EXE · ${architecture}`
  if (os === 'macos') note.textContent = 'DMG · Intel + Apple Silicon'
  button.dataset.downloadReady = 'true'
}

void enhanceDownloads()
