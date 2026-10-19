import {
  expect,
  it,
} from 'vitest'
import { windowsSubsystem } from '../../scripts/check-windows-executable.mjs'

it('reads the actual PE subsystem for x64 and ARM64 release artifacts', () => {
  for (const machine of [0x8664, 0xaa64]) {
    const binary = Buffer.alloc(512)
    binary.write('MZ')
    binary.writeUInt32LE(128, 0x3c)
    binary.writeUInt32LE(0x4550, 128)
    binary.writeUInt16LE(machine, 132)
    binary.writeUInt16LE(0x20b, 152)
    binary.writeUInt16LE(2, 220)
    expect(windowsSubsystem(binary)).toBe(2)
    binary.writeUInt16LE(3, 220)
    expect(windowsSubsystem(binary)).toBe(3)
  }
})

it('rejects truncated files and invalid PE offsets instead of passing a stale artifact', () => {
  for (const size of [0, 63, 64]) expect(() => windowsSubsystem(Buffer.alloc(size))).toThrow()
  const binary = Buffer.alloc(128)
  binary.write('MZ')
  binary.writeUInt32LE(0xffffffff, 0x3c)
  expect(() => windowsSubsystem(binary)).toThrow('Invalid PE header')
})
