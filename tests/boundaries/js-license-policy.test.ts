import { describe, expect, it } from 'vitest'

import { isAllowedProductionLicense } from '../../scripts/js-license-policy.mjs'

describe('JavaScript production license policy', () => {
  it('allows the audited Roboto font package under OFL-1.1', () => {
    expect(
      isAllowedProductionLicense('@fontsource/roboto@5.3.0', 'OFL-1.1'),
    ).toBe(true)
  })

  it('does not extend the OFL exception to other packages or versions', () => {
    expect(
      isAllowedProductionLicense('@fontsource/roboto@5.3.1', 'OFL-1.1'),
    ).toBe(false)
    expect(isAllowedProductionLicense('other-font@1.0.0', 'OFL-1.1')).toBe(
      false,
    )
  })

  it('continues to allow generally approved permissive licenses', () => {
    expect(isAllowedProductionLicense('example@1.0.0', 'MIT')).toBe(true)
  })
})
