import type { LandingCatalog } from '../../scripts/landing-release.mjs'

export function downloadsHTML(
  catalog: LandingCatalog,
  english: boolean,
): string {
  const assetBase = english ? '../assets/os/' : 'assets/os/'
  const columns = [
    {
      os: 'windows',
      name: 'Windows',
      note: english
        ? 'Unsigned installer. SmartScreen may show a warning.'
        : 'Установщик без подписи. SmartScreen может показать предупреждение.',
    },
    {
      os: 'macos',
      name: 'macOS',
      note: english
        ? 'Intel and Apple Silicon. Unsigned; Gatekeeper may show a warning.'
        : 'Intel и Apple Silicon. Без подписи; Gatekeeper может показать предупреждение.',
    },
    {
      os: 'linux',
      name: 'Linux',
      note: english
        ? 'Ubuntu 22.04+. Wayland capture depends on desktop portals.'
        : 'Ubuntu 22.04+. Захват в Wayland зависит от системных portals.',
    },
  ].map(({ os, name, note }) => {
    const files = catalog.files.filter((file) => file.platform.startsWith(`${os}-`))
    // DEB first, then AppImage; keep x64 before ARM64 within each format.
    if (os === 'linux') files.sort((a, b) => Number(a.extension !== 'deb') - Number(b.extension !== 'deb'))
    const links = files.map((file) => {
      const architecture = file.platform.slice(os.length + 1)
      const primary = file.extension !== 'AppImage' ? `data-download-file="${file.platform}"` : ''
      const format = file.extension === 'AppImage' ? 'AppImage' : file.extension.toUpperCase()
      const label = architecture === 'universal'
        ? 'Universal DMG'
        : `${format} · ${architecture === 'arm64' ? 'ARM64' : 'x64'}`
      return `<li><a ${primary} href="${file.url}"><span>${label}</span><span aria-hidden="true">↓</span></a></li>`
    }).join('\n')
    return `<article class="download-column" aria-labelledby="download-${os}">
      <h3 id="download-${os}"><img data-os-icon="${os}" src="${assetBase}${os}.svg" width="28" height="28" alt="" />${name}</h3>
      <ul>${links}</ul><p>${note}</p>
    </article>`
  }).join('\n')
  return `<section id="downloads" class="downloads container" aria-labelledby="downloads-title">
    <div class="section-heading">
      <p class="eyebrow">${english ? 'DOWNLOAD' : 'СКАЧАТЬ'} · ${catalog.tag}</p>
      <h2 id="downloads-title">${english ? 'Ready for your desktop.' : 'Готов к работе на вашем компьютере.'}</h2>
      <p>${english ? 'Choose your operating system and installer.' : 'Выберите операционную систему и установщик.'}</p>
    </div>
    <div class="downloads-grid">${columns}</div>
    <div class="download-meta"><a href="${catalog.releaseUrl}">${english ? 'Release notes' : 'Описание релиза'} ↗</a>
      <a href="${catalog.checksumsUrl}">${english ? 'SHA-256 checksums' : 'Контрольные суммы SHA-256'} ↓</a>
      <span>${english ? 'Unofficial builds without a digital signature.' : 'Неофициальные сборки без цифровой подписи.'}</span>
    </div>
  </section>`
}
