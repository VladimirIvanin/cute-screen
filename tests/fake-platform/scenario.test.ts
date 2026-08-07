import { readFile } from 'node:fs/promises'
import path from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

describe('FakePlatformScenario shared JSON contract', () => {
  it('accepts the deterministic default and rejects unknown fields', async () => {
    const root = process.cwd()
    const [schemaSource, scenarioSource] = await Promise.all([
      readFile(
        path.join(root, 'tests/fake-platform/scenario.schema.json'),
        'utf8',
      ),
      readFile(path.join(root, 'tests/fake-platform/default.json'), 'utf8'),
    ])
    const schema: object = JSON.parse(schemaSource)
    const scenario: Record<string, unknown> = JSON.parse(scenarioSource)
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    )

    expect(validate(scenario), JSON.stringify(validate.errors)).toBe(true)
    expect(validate({ ...scenario, unexpected: true })).toBe(false)
  })
})
