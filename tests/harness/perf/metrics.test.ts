import { describe, expect, it } from 'vitest'

import { percentile } from './metrics'

describe('performance metrics harness self-test', () => {
  it('calculates deterministic p95 without claiming a product budget', () => {
    expect(percentile([10, 30, 20, 40, 50], 0.95)).toBe(50)
    expect(percentile([30, 10, 20], 0.5)).toBe(20)
  })
})
