import { describe, expect, it } from 'vitest'

import * as editorCore from './index'

describe('editor-core foundation boundary', () => {
  it('does not expose runtime product behavior during M00', () => {
    expect(Object.keys(editorCore)).toEqual([])
  })
})
