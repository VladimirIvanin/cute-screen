import type { Point } from './document/types'

/** Tools with a document-changing gesture are intentionally explicit here so
 * the DOM adapter cannot invent a persisted tool id. */
export type EditorToolId =
  'select' | 'hand' | 'arrow' | 'shape' | 'pencil' | 'marker'

export interface InteractionState {
  readonly activeTool: EditorToolId
  readonly selectionIds: readonly string[]
  readonly primaryId?: string
  readonly hoverId?: string
  readonly guidesVisible: boolean
}

/** Transient state: never serialize or turn selection into an EditorCommand. */
export class InteractionController {
  #activeTool: EditorToolId = 'select'
  #selectionIds: string[] = []
  #hoverId: string | undefined
  #guidesVisible = false
  #cycle:
    | { point: Point; at: number; ids: readonly string[]; index: number }
    | undefined

  get snapshot(): InteractionState {
    return Object.freeze({
      activeTool: this.#activeTool,
      selectionIds: Object.freeze([...this.#selectionIds]),
      ...(this.#selectionIds[0] ? { primaryId: this.#selectionIds[0] } : {}),
      ...(this.#hoverId ? { hoverId: this.#hoverId } : {}),
      guidesVisible: this.#guidesVisible,
    })
  }

  setTool(tool: EditorToolId): InteractionState {
    this.#activeTool = tool
    this.resetCycle()
    return this.snapshot
  }

  select(id: string, toggle = false): InteractionState {
    this.#selectionIds = toggle
      ? this.#selectionIds.includes(id)
        ? this.#selectionIds.filter((selected) => selected !== id)
        : [...this.#selectionIds, id]
      : [id]
    return this.snapshot
  }

  clearSelection(): InteractionState {
    this.#selectionIds = []
    return this.snapshot
  }

  setHover(id: string | undefined): InteractionState {
    this.#hoverId = id
    return this.snapshot
  }

  setGuidesVisible(value: boolean): InteractionState {
    this.#guidesVisible = value
    return this.snapshot
  }

  cycleOverlap(input: {
    readonly point: Point
    readonly ids: readonly string[]
    readonly now: number
  }): InteractionState {
    const previous = this.#cycle
    const canContinue =
      previous &&
      input.now - previous.at <= 1000 &&
      Math.hypot(
        input.point.x - previous.point.x,
        input.point.y - previous.point.y,
      ) <= 4 &&
      sameIds(input.ids, previous.ids)
    const index = canContinue ? (previous.index + 1) % input.ids.length : 0
    const selected = input.ids[index]
    this.#cycle = {
      point: input.point,
      ids: input.ids,
      at: input.now,
      index,
    }
    if (selected) this.#selectionIds = [selected]
    return this.snapshot
  }

  resetCycle(): void {
    this.#cycle = undefined
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
