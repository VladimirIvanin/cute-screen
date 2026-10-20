const generallyAllowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Unicode-3.0',
  'Zlib',
])

// Keep asset-license exceptions version-specific so dependency upgrades fail
// closed until their bundled files and license metadata are audited again.
const packageSpecificLicenses = new Map([
  ['@fontsource/press-start-2p@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/rubik-dirt@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/rubik-glitch@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/unbounded@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/russo-one@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/ruslan-display@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/underdog@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/roboto@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/manrope@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/rubik@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/comfortaa@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/oswald@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/pt-serif@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/lora@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/jetbrains-mono@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/pt-mono@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/caveat@5.3.0', new Set(['OFL-1.1'])],
  ['@fontsource/marck-script@5.3.0', new Set(['OFL-1.1'])],
])

export function isAllowedProductionLicense(
  packageKey,
  license,
) {
  return generallyAllowedLicenses.has(license) || packageSpecificLicenses.get(packageKey)?.has(license) === true
}
