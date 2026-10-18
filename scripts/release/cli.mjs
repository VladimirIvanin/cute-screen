import process from 'node:process'
import { main } from './io.mjs'
import {
  checkVersions,
  preflight,
  setVersion,
} from './versions.mjs'

main(async () => {
  const [command, value] = process.argv.slice(2)
  if (command === 'version') {
    await setVersion(value)
    console.log(`Version synchronized to ${value}; commit metadata before creating its tag.`)
  } else if (command === 'check') {
    console.log(await checkVersions(value))
  } else if (command === 'preflight') {
    await preflight()
  } else if (command === 'verify') {
    const { verifyPackage } = await import('./verify.mjs')
    await verifyPackage(value, process.argv[4])
  } else if (command === 'assemble') {
    const { assemble } = await import('./assemble.mjs')
    await assemble(value)
  } else if (command === 'mac-intel') {
    const { verifyMacIntel } = await import('./verify.mjs')
    await verifyMacIntel(value)
  } else if (command === 'publish') {
    const { publish } = await import('./publish.mjs')
    await publish(value)
  } else {
    throw new Error('Expected version <X.Y.Z>, check [tag], preflight, verify <platform> <bundle-dir>, assemble <dir>, or publish <dir>')
  }
})
