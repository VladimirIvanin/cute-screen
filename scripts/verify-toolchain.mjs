import process from 'node:process'

const expectedNode = '22.23.1'
const expectedPnpm = '10.33.2'
const userAgent = process.env.npm_config_user_agent ?? ''
const pnpmVersion = userAgent.match(/pnpm\/([^\s]+)/)?.[1]
const errors = []

if (process.versions.node !== expectedNode) {
  errors.push(
    `Node ${expectedNode} is required; found ${process.versions.node}.`,
  )
}

if (pnpmVersion !== expectedPnpm) {
  errors.push(
    `pnpm ${expectedPnpm} is required; found ${pnpmVersion ?? 'an unknown package manager'}. Run corepack enable and corepack prepare pnpm@${expectedPnpm} --activate.`,
  )
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Toolchain verified: Node ${expectedNode}, pnpm ${expectedPnpm}.`)
}
