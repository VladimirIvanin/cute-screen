export function inspectImageHeader(bytes: ArrayBuffer): { format: 'png' | 'jpeg' | 'webp'; width: number; height: number } {
  const data = new DataView(bytes)
  const text = (offset: number, size: number) => String.fromCharCode(...new Uint8Array(bytes, offset, size))
  let format: 'png' | 'jpeg' | 'webp'
  let width = 0
  let height = 0
  if (
    data.byteLength >= 24 &&
    data.getUint32(0) === 0x89504e47 &&
    data.getUint32(4) === 0x0d0a1a0a
  ) {
    format = 'png'
    width = data.getUint32(16)
    height = data.getUint32(20)
    for (let offset = 8; offset + 12 <= data.byteLength;) {
      const size = data.getUint32(offset)
      if (text(offset + 4, 4) === 'acTL') throw new Error('Animated images are not supported')
      offset += size + 12
    }
  } else if (data.byteLength >= 4 && data.getUint16(0) === 0xffd8) {
    format = 'jpeg'
    for (let offset = 2; offset + 4 <= data.byteLength;) {
      if (data.getUint8(offset++) !== 0xff) throw new Error('Invalid JPEG')
      while (offset < data.byteLength && data.getUint8(offset) === 0xff) offset++
      const marker = data.getUint8(offset++)
      if (marker === 0xda || marker === 0xd9) break
      const size = data.getUint16(offset)
      if (size < 2 || offset + size > data.byteLength) throw new Error('Invalid JPEG')
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = data.getUint16(offset + 3)
        width = data.getUint16(offset + 5)
        break
      }
      offset += size
    }
  } else if (
    data.byteLength >= 30 &&
    text(0, 4) === 'RIFF' &&
    text(8, 4) === 'WEBP'
  ) {
    format = 'webp'
    const kind = text(12, 4)
    if (kind === 'VP8X') {
      if (data.getUint8(20) & 2) throw new Error('Animated images are not supported')
      width = 1 + data.getUint8(24) + (data.getUint8(25) << 8) + (data.getUint8(26) << 16)
      height = 1 + data.getUint8(27) + (data.getUint8(28) << 8) + (data.getUint8(29) << 16)
    } else if (kind === 'VP8L') {
      const bits = data.getUint32(21, true)
      width = 1 + (bits & 0x3fff)
      height = 1 + ((bits >>> 14) & 0x3fff)
    } else if (kind === 'VP8 ') {
      width = data.getUint16(26, true) & 0x3fff
      height = data.getUint16(28, true) & 0x3fff
    }
  } else throw new Error('Choose a PNG, JPEG or WebP image')
  if (!width || !height) throw new Error('Invalid image dimensions')
  if (
    width > 8192 ||
    height > 8192 ||
    width * height > 16_000_000
  ) throw new Error('Maximum image: 16 megapixels, 8192 px per side')
  return { format, width, height }
}
