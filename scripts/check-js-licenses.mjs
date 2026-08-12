import process from 'node:process'

import { init } from 'license-checker-rseidelsohn'

import { isAllowedProductionLicense } from './js-license-policy.mjs'

const packages = await new Promise((resolve, reject) => {
  init(
    { start: process.cwd(), production: true, excludePrivatePackages: true },
    (error, result) => {
      if (error) reject(error)
      else resolve(result)
    },
  )
})
const violations = []

for (const [name, metadata] of Object.entries(packages)) {
  const expression = String(metadata.licenses ?? '')
  const identifiers = expression
    .replace(/[()]/gu, '')
    .split(/\s+(?:AND|OR)\s+/u)
    .map((license) => license.trim())
    .filter(Boolean)

  if (
    identifiers.length === 0 ||
    identifiers.some((license) => !isAllowedProductionLicense(name, license))
  ) {
    violations.push(`${name}: ${expression || 'UNKNOWN'}`)
  }
}

if (violations.length > 0) {
  console.error(
    `Non-allowlisted production licenses:\n${violations.join('\n')}`,
  )
  process.exitCode = 1
} else {
  console.log(
    `Validated permissive licenses for ${Object.keys(packages).length} production packages.`,
  )
}
