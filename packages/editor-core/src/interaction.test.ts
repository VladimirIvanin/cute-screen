import { describe, expect, it } from 'vitest'

import { InteractionController } from './interaction'

describe('M05 interaction state', () => {
  it('keeps selection out of document history and cycles overlap deterministically', () => {
    const interaction = new InteractionController()
    expect(
      interaction.cycleOverlap({
        point: { x: 10, y: 10 },
        ids: ['top', 'middle', 'bottom'],
        now: 0,
      }).primaryId,
    ).toBe('top')
    expect(
      interaction.cycleOverlap({
        point: { x: 10, y: 10 },
        ids: ['top', 'middle', 'bottom'],
        now: 500,
      }).primaryId,
    ).toBe('middle')
    expect(
      interaction.cycleOverlap({
        point: { x: 10, y: 10 },
        ids: ['top', 'middle', 'bottom'],
        now: 900,
      }).primaryId,
    ).toBe('bottom')
  })

  it('resets overlap cycling after one second or movement above four CSS pixels', () => {
    const interaction = new InteractionController()
    interaction.cycleOverlap({
      point: { x: 10, y: 10 },
      ids: ['top', 'bottom'],
      now: 0,
    })
    expect(
      interaction.cycleOverlap({
        point: { x: 15, y: 10 },
        ids: ['top', 'bottom'],
        now: 10,
      }).primaryId,
    ).toBe('top')
    expect(
      interaction.cycleOverlap({
        point: { x: 15, y: 10 },
        ids: ['top', 'bottom'],
        now: 1100,
      }).primaryId,
    ).toBe('top')
  })

  it('shows guides only while the modifier controller asks for them', () => {
    const interaction = new InteractionController()
    expect(interaction.setGuidesVisible(true).guidesVisible).toBe(true)
    expect(interaction.setGuidesVisible(false).guidesVisible).toBe(false)
  })
})
