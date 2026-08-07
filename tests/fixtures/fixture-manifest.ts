import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'

export interface FixtureEntry {
  readonly id: string
  readonly file: string
  readonly sha256: string
  readonly dimensions: Readonly<{ width: number; height: number }>
  readonly format: string
  readonly expectedDecode: 'success' | 'failure'
  readonly source: string
  readonly license: string
  readonly acquisition: string
  readonly harnessOnly?: boolean
}

export interface FixtureManifest {
  readonly schemaVersion: 1
  readonly fixtures: readonly FixtureEntry[]
}

export class FixtureValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FixtureValidationError'
  }
}

export async function loadFixtureManifest(
  manifestPath: string,
  schemaPath: string,
): Promise<FixtureManifest> {
  const [manifestSource, schemaSource] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
  ])
  const manifest: unknown = JSON.parse(manifestSource)
  const schema: object = JSON.parse(schemaSource)
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
    schema,
  )

  if (!validate(manifest)) {
    throw new FixtureValidationError(
      `Invalid fixture manifest: ${validate.errors
        ?.map(
          (error) =>
            `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
        )
        .join('; ')}`,
    )
  }

  return manifest as FixtureManifest
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyFixture(
  fixture: FixtureEntry,
  fixtureRoot: string,
): Promise<string> {
  const fixturePath = path.resolve(fixtureRoot, fixture.file)
  let actualHash: string

  try {
    actualHash = await sha256File(fixturePath)
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new FixtureValidationError(
        `Missing fixture ${fixture.id}; expected SHA-256 ${fixture.sha256}. ${fixture.acquisition}`,
      )
    }
    throw error
  }

  if (actualHash !== fixture.sha256) {
    throw new FixtureValidationError(
      `Fixture ${fixture.id} has SHA-256 ${actualHash}; expected ${fixture.sha256}. ${fixture.acquisition}`,
    )
  }

  return fixturePath
}
