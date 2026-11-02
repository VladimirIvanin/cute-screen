import {
  describe,
  expect,
  it,
} from 'vitest'
import { parseUpdateContext } from '../../apps/landing/assets/update-check'

describe('update query validation', () => {
  it('accepts supported platforms and semver metadata', () => {
    expect(parseUpdateContext('?version=1.2.3-beta.1%2Bbuild&os=windows&arch=arm64')).toEqual({ version: '1.2.3-beta.1+build', os: 'windows', architecture: 'arm64' })
    expect(parseUpdateContext('')).toBeUndefined()
  })
  it.each(['?version=1.2.3&os=windows&os=linux', '?version=1.2.3&os=evil', '?version=%3Cscript%3E&os=linux', '?version=1.2.3&os=linux&arch=x86', '?version=%ZZ&os=linux', '?version=' + '9'.repeat(129) + '&os=linux'])('rejects %s', (query) => {
    expect(parseUpdateContext(query)).toBeNull()
  })
})
