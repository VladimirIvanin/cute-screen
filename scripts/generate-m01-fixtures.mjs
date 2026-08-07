import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { format } from 'prettier'

const root = process.cwd()
const fixtureRoot = path.join(root, 'tests', 'fixtures')
const generatedRoot = path.join(fixtureRoot, 'generated')
const generator = {
  command: 'pnpm fixtures:generate:m01',
  version: 2,
}

const crcTable = Array.from({ length: 256 }, (_, initial) => {
  let value = initial
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function iccProfile() {
  const profile = Buffer.alloc(132)
  profile.writeUInt32BE(profile.length, 0)
  profile.writeUInt32BE(0x04300000, 8)
  profile.write('mntr', 12, 'ascii')
  profile.write('RGB ', 16, 'ascii')
  profile.write('XYZ ', 20, 'ascii')
  profile.writeUInt16BE(2026, 24)
  profile.writeUInt16BE(8, 26)
  profile.writeUInt16BE(7, 28)
  profile.write('acsp', 36, 'ascii')
  profile.write('APPL', 40, 'ascii')
  profile.writeUInt32BE(0x0000f6d6, 68)
  profile.writeUInt32BE(0x00010000, 72)
  profile.writeUInt32BE(0x0000d32d, 76)
  profile.write('cute', 80, 'ascii')
  profile.writeUInt32BE(0, 128)
  return profile
}

function exifOrientation() {
  const exif = Buffer.alloc(26)
  exif.write('II', 0, 'ascii')
  exif.writeUInt16LE(42, 2)
  exif.writeUInt32LE(8, 4)
  exif.writeUInt16LE(1, 8)
  exif.writeUInt16LE(0x0112, 10)
  exif.writeUInt16LE(3, 12)
  exif.writeUInt32LE(1, 14)
  exif.writeUInt16LE(6, 18)
  exif.writeUInt32LE(0, 22)
  return exif
}

function createPng(width, height, options = {}) {
  const rowLength = 1 + width * 4
  const raw = Buffer.allocUnsafe(rowLength * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowLength
    raw[rowOffset] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4
      const panel = (Math.floor(x / 160) + Math.floor(y / 120)) % 5
      raw[offset] = (24 + panel * 37 + (x % 29)) & 0xff
      raw[offset + 1] = (38 + panel * 23 + (y % 31)) & 0xff
      raw[offset + 2] = (52 + panel * 17 + ((x + y) % 19)) & 0xff
      raw[offset + 3] = options.alpha ? (x + y) % 256 : 255
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const chunks = [chunk('IHDR', header)]
  if (options.icc) {
    chunks.push(
      chunk(
        'iCCP',
        Buffer.concat([
          Buffer.from('Cute Screen sRGB\0\0', 'ascii'),
          deflateSync(iccProfile(), { level: 9 }),
        ]),
      ),
    )
  }
  if (options.exif) chunks.push(chunk('eXIf', exifOrientation()))
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })))
  chunks.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks,
  ])
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function generatedImage({
  id,
  file,
  width,
  height,
  expectedDecode,
  options,
  nodeCount,
}) {
  const valid = createPng(width, height, options)
  const bytes =
    expectedDecode === 'failure' ? Buffer.from(valid.subarray(0, 40)) : valid
  if (expectedDecode === 'failure') bytes[0] = 0
  await writeFile(path.join(fixtureRoot, file), bytes)
  return {
    id,
    kind: 'image',
    file,
    sha256: sha256(bytes),
    dimensions: { width, height },
    format: 'png',
    expectedDecode,
    pixelProbes:
      expectedDecode === 'success'
        ? [
            {
              x: 0,
              y: 0,
              rgba: [24, 38, 52, options?.alpha ? 0 : 255],
              tolerance: 2,
            },
          ]
        : [],
    ...(nodeCount ? { nodeCount } : {}),
    metadata: {
      alpha: Boolean(options?.alpha),
      icc: Boolean(options?.icc),
      exifOrientation: options?.exif ? 6 : 1,
    },
    source: 'Deterministically generated in-repository for M01',
    license: 'CC0-1.0',
    acquisition: generator.command,
    generator,
  }
}

await mkdir(generatedRoot, { recursive: true })

const monitorFile = 'generated/mixed-dpi-horizontal.json'
const monitorBytes = Buffer.from(
  `${JSON.stringify(
    {
      monitors: [
        {
          id: 'left-2x',
          logicalBounds: { x: -1280, y: 0, width: 1280, height: 720 },
          physicalBounds: { x: -2560, y: 0, width: 2560, height: 1440 },
          scaleFactor: 2,
        },
        {
          id: 'primary-1x',
          logicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
          physicalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
          scaleFactor: 1,
        },
      ],
    },
    null,
    2,
  )}\n`,
)
await writeFile(path.join(fixtureRoot, monitorFile), monitorBytes)

const fixtures = [
  {
    id: 'harness-red-1x1',
    kind: 'image',
    file: 'harness/red-1x1.ppm',
    sha256: 'c940efc28573af63c6ebbfeb23e69ded35c645b0dca6c4553d62aa1977912614',
    dimensions: { width: 1, height: 1 },
    format: 'ppm',
    expectedDecode: 'success',
    pixelProbes: [{ x: 0, y: 0, rgba: [255, 0, 0, 255], tolerance: 0 }],
    metadata: { alpha: false, icc: false, exifOrientation: 1 },
    source: 'Created in-repository for M00 harness validation',
    license: 'CC0-1.0',
    acquisition:
      'Included in the repository at tests/fixtures/harness/red-1x1.ppm',
    harnessOnly: true,
  },
  await generatedImage({
    id: 'm01-ui-4k',
    file: 'generated/ui-4k.png',
    width: 3840,
    height: 2160,
    expectedDecode: 'success',
    nodeCount: 500,
  }),
  await generatedImage({
    id: 'm01-ui-8k',
    file: 'generated/ui-8k.png',
    width: 7680,
    height: 4320,
    expectedDecode: 'success',
    nodeCount: 1000,
  }),
  await generatedImage({
    id: 'm01-alpha-png',
    file: 'generated/alpha.png',
    width: 64,
    height: 64,
    expectedDecode: 'success',
    options: { alpha: true },
  }),
  await generatedImage({
    id: 'm01-icc-png',
    file: 'generated/icc.png',
    width: 64,
    height: 64,
    expectedDecode: 'success',
    options: { icc: true },
  }),
  await generatedImage({
    id: 'm01-exif-png',
    file: 'generated/exif.png',
    width: 64,
    height: 32,
    expectedDecode: 'success',
    options: { exif: true },
  }),
  await generatedImage({
    id: 'm01-corrupted-png',
    file: 'generated/corrupted.png',
    width: 64,
    height: 64,
    expectedDecode: 'failure',
  }),
  {
    id: 'm01-mixed-dpi-horizontal',
    kind: 'monitor-layout',
    file: monitorFile,
    sha256: sha256(monitorBytes),
    expectedValidation: 'success',
    source: 'Deterministically generated in-repository for M01',
    license: 'CC0-1.0',
    acquisition: generator.command,
    generator,
  },
]

const manifestPath = path.join(fixtureRoot, 'manifest.json')
await writeFile(
  manifestPath,
  await format(
    JSON.stringify({
      $schema: './manifest.schema.json',
      schemaVersion: 2,
      fixtures,
    }),
    { filepath: manifestPath },
  ),
)

console.log(`Generated ${fixtures.length - 1} M01 fixtures.`)
