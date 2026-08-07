import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FixtureValidationError,
  loadFixtureManifest,
  verifyFixture,
} from './fixture-manifest'

const fixtureRoot = path.resolve(process.cwd(), 'tests/fixtures')
const manifestPath = path.join(fixtureRoot, 'manifest.json')
const schemaPath = path.join(fixtureRoot, 'manifest.schema.json')

describe('fixture manifest harness', () => {
  it('validates the schema and SHA-256 before returning a fixture path', async () => {
    const manifest = await loadFixtureManifest(manifestPath, schemaPath)
    const fixture = manifest.fixtures[0]

    expect(fixture).toBeDefined()
    await expect(verifyFixture(fixture!, fixtureRoot)).resolves.toBe(
      path.join(fixtureRoot, 'harness/red-1x1.ppm'),
    )
  })

  it('reports ID, expected hash, and acquisition instructions when missing', async () => {
    const manifest = await loadFixtureManifest(manifestPath, schemaPath)
    const fixture = manifest.fixtures[0]!
    const missing = { ...fixture, file: 'large/not-downloaded.ppm' }

    await expect(verifyFixture(missing, fixtureRoot)).rejects.toEqual(
      expect.objectContaining<Partial<FixtureValidationError>>({
        message: expect.stringMatching(
          new RegExp(
            `${fixture.id}.*${fixture.sha256}.*Included in the repository`,
            'u',
          ),
        ),
      }),
    )
  })
})
