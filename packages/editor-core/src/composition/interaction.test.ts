import {
  describe,
  expect,
  it,
} from 'vitest'
import { createComposition } from './defaults'
import { resolveCompositionLayout } from './layout'
import { compositionInteractionSpace } from './interaction'
import { documentFixture } from '../document/scene/test-kit'

describe('automatic publication card ownership', () => {
  it('uses the visible screenshot for creation and the surrounding card for external starts', () => {
    const document = { ...documentFixture, presentation: { ...documentFixture.presentation, composition: createComposition('browser') } }
    const layout = resolveCompositionLayout(document)
    expect(compositionInteractionSpace(document, { x: layout.content.x + 10, y: layout.content.y + 10 })).toBe('content')
    expect(compositionInteractionSpace(document, { x: 0, y: 0 })).toBe('card')
    expect(compositionInteractionSpace(document, { x: layout.frame.x + 10, y: layout.frame.y + 10 })).toBe('card')
    expect(compositionInteractionSpace(documentFixture, { x: 0, y: 0 })).toBe('content')
  })
  it('retains an existing selected object or handle even across the screenshot boundary', () => {
    const document = { ...documentFixture,
      presentation: { ...documentFixture.presentation, composition: createComposition() } }
    const layout = resolveCompositionLayout(document)
    const point = { x: layout.content.x + 20, y: layout.content.y + 20 }
    expect(compositionInteractionSpace(document, point, { selecting: true, preserveSelection: true, currentSpace: 'card' })).toBe('card')
    expect(compositionInteractionSpace(document, { x: 0, y: 0 }, { selecting: true, preserveSelection: true, currentSpace: 'content' })).toBe('content')
  })
})
