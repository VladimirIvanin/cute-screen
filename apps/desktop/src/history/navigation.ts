/** Serializes document swaps and discards work superseded while decoding. */
export class HistoryNavigation {
  #generation = 0
  #tail: Promise<unknown> = Promise.resolve()
  run(work: (isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> {
    const generation = ++this.#generation
    const current = () => generation === this.#generation
    const result = this.#tail.catch(() => undefined).then(() => current() ? work(current) : false)
    this.#tail = result
    return result
  }
  cancel(): void {
    this.#generation += 1
  }
}
