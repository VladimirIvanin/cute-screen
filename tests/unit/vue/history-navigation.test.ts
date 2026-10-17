import {
  describe,
  expect,
  it,
} from 'vitest'
import { HistoryNavigation } from '../../../apps/desktop/src/history/navigation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
describe('history navigation', () => {
  it('does not install a decoded frame after a newer selection and skips intermediate requests', async () => {
    const navigation = new HistoryNavigation()
    const decoded = deferred<void>()
    const entered = deferred<void>()
    const installed: string[] = []
    const first = navigation.run(async (current) => {
      entered.resolve()
      await decoded.promise
      if (!current()) return false
      installed.push('a')
      return true
    })
    await entered.promise
    const middle = navigation.run(async () => {
      installed.push('b')
      return true
    })
    const last = navigation.run(async () => {
      installed.push('c')
      return true
    })
    decoded.resolve()
    expect(await Promise.all([first, middle, last])).toEqual([false, false, true])
    expect(installed).toEqual(['c'])
  })
  it('accepts another selection after failure and cancels work on teardown', async () => {
    const navigation = new HistoryNavigation()
    await expect(navigation.run(async () => {
      throw new Error('disk full')
    })).rejects.toThrow('disk full')
    expect(await navigation.run(async () => true)).toBe(true)
    const pending = navigation.run(async () => true)
    navigation.cancel()
    expect(await pending).toBe(false)
  })
})
