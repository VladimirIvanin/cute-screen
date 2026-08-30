import { readFile } from 'node:fs/promises'

import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  CaptureOutcomeV2 as CompatibilityCaptureOutcomeV2,
  QuickCaptureDraftV1 as CompatibilityQuickCaptureDraftV1,
} from '@cute-screen/editor-vue'
import type {
  CaptureOutcomeV2 as GeneratedCaptureOutcomeV2,
  QuickCaptureDraftV1 as GeneratedQuickCaptureDraftV1,
} from '../../apps/desktop/src/generated/desktop-ipc'

describe('public TypeScript compatibility', () => {
  it('keeps generated capture DTOs assignable to the editor-vue API', () => {
    expectTypeOf<GeneratedCaptureOutcomeV2>().toExtend<CompatibilityCaptureOutcomeV2>()
    expectTypeOf<CompatibilityCaptureOutcomeV2>().toExtend<GeneratedCaptureOutcomeV2>()
    expectTypeOf<GeneratedQuickCaptureDraftV1>().toExtend<CompatibilityQuickCaptureDraftV1>()
    expectTypeOf<CompatibilityQuickCaptureDraftV1>().toExtend<GeneratedQuickCaptureDraftV1>()
  })

  it('keeps the three package root entrypoints and shell CSS export', async () => {
    const manifests = await Promise.all(
      [
        'packages/editor-core/package.json',
        'packages/editor-renderer/package.json',
        'packages/editor-vue/package.json',
      ].map(
        async (filename) =>
          JSON.parse(await readFile(filename, 'utf8')) as {
            readonly exports?: Record<string, unknown>
          },
      ),
    )
    expect(manifests[0]?.exports).toHaveProperty('.')
    expect(manifests[1]?.exports).toHaveProperty('.')
    expect(manifests[2]?.exports).toHaveProperty('.')
    expect(manifests[2]?.exports).toHaveProperty('./shell.css')
  })
})
