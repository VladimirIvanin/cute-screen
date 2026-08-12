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
  ['@fontsource/roboto@5.3.0', new Set(['OFL-1.1'])],
])

export function isAllowedProductionLicense(packageKey, license) {
  return (
    generallyAllowedLicenses.has(license) ||
    packageSpecificLicenses.get(packageKey)?.has(license) === true
  )
}
