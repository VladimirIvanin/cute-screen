import {
  normalizeEditorDocument,
  serializeEditorDocument,
} from '../document/codec'
import { jsonEquals } from '../document/json'
import type { EditorDocumentV1 } from '../document/types'
import { applyEditorCommand } from './operations'
import type {
  CommandManagerOptions,
  EditorCommand,
  EditorSnapshot,
} from './types'

interface Entry {
  readonly command: EditorCommand
  readonly before: EditorDocumentV1
  readonly after: EditorDocumentV1
  readonly bytes: number
  readonly beforeToken: number
  readonly afterToken: number
}

const DEFAULT_MAX_ENTRIES = 200
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

function assertLimit(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer`)
  }
}

function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    const next = text.charCodeAt(index + 1)
    const surrogatePair =
      code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    bytes += surrogatePair ? 4 : code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3
    if (surrogatePair) index += 1
  }
  return bytes
}

function entryByteLength(
  command: EditorCommand,
  before: EditorDocumentV1,
  after: EditorDocumentV1,
): number {
  return (
    utf8ByteLength(JSON.stringify(command)) +
    utf8ByteLength(serializeEditorDocument(before)) +
    utf8ByteLength(serializeEditorDocument(after))
  )
}

export class CommandManager {
  #document: EditorDocumentV1
  #undo: Entry[] = []
  #redo: Entry[] = []
  #token = 0
  #savedToken = 0
  #nextToken = 1
  readonly #maxEntries: number
  readonly #maxBytes: number
  #bytes = 0

  constructor(document: EditorDocumentV1, options: CommandManagerOptions = {}) {
    this.#document = normalizeEditorDocument(document)
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    assertLimit(this.#maxEntries, 'maxEntries')
    assertLimit(this.#maxBytes, 'maxBytes')
  }

  get snapshot(): EditorSnapshot {
    return Object.freeze({
      document: this.#document,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      dirty: this.#token !== this.#savedToken,
      versionToken: this.#token,
    })
  }

  execute(command: EditorCommand): EditorSnapshot {
    const before = this.#document
    const after = applyEditorCommand(before, command)
    if (jsonEquals(before, after)) return this.snapshot
    if (this.#nextToken > Number.MAX_SAFE_INTEGER) {
      throw new Error('version token space exhausted')
    }
    const entry: Entry = {
      command,
      before,
      after,
      bytes: entryByteLength(command, before, after),
      beforeToken: this.#token,
      afterToken: this.#nextToken,
    }
    this.#nextToken += 1
    this.#document = after
    this.#token = entry.afterToken
    this.#undo.push(entry)
    this.#bytes += entry.bytes
    this.#redo = []
    this.#trim()
    return this.snapshot
  }

  undo(): EditorSnapshot {
    const entry = this.#undo.pop()
    if (!entry) return this.snapshot
    this.#document = entry.before
    this.#token = entry.beforeToken
    this.#bytes -= entry.bytes
    this.#redo.push(entry)
    return this.snapshot
  }

  redo(): EditorSnapshot {
    const entry = this.#redo.pop()
    if (!entry) return this.snapshot
    this.#document = entry.after
    this.#token = entry.afterToken
    this.#undo.push(entry)
    this.#bytes += entry.bytes
    this.#trim()
    return this.snapshot
  }

  markSaved(versionToken = this.#token): EditorSnapshot {
    if (
      !Number.isSafeInteger(versionToken) ||
      versionToken < 0 ||
      versionToken >= this.#nextToken
    ) {
      throw new RangeError('versionToken was not emitted by this manager')
    }
    this.#savedToken = versionToken
    return this.snapshot
  }

  #trim(): void {
    while (
      this.#undo.length > 1 &&
      (this.#undo.length > this.#maxEntries || this.#bytes > this.#maxBytes)
    ) {
      const entry = this.#undo.shift()
      if (entry) this.#bytes -= entry.bytes
    }
  }
}
