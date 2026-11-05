import {
  describe,
  expect,
  it,
} from 'vitest'
import { inspectImageHeader } from '../../../apps/landing/demo/image-header'

function png(
  width: number,
  height: number,
) {
  const bytes = new ArrayBuffer(24)
  const view = new DataView(bytes)
  view.setUint32(0, 0x89504e47)
  view.setUint32(4, 0x0d0a1a0a)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}
describe('demo allocation boundary', () => {
  it('allows 4K and 12 MP before decode', () => {
    expect(inspectImageHeader(png(3840, 2160)).width).toBe(3840)
    expect(inspectImageHeader(png(4000, 3000)).height).toBe(3000)
  })
  it('rejects oversized decoded surfaces before image decoding', () => {
    expect(() => inspectImageHeader(png(8193, 1))).toThrow('Maximum image')
    expect(() => inspectImageHeader(png(5000, 4000))).toThrow('Maximum image')
  })
  it('rejects unsupported and truncated headers', () => {
    expect(() => inspectImageHeader(new ArrayBuffer(4))).toThrow()
  })
})
