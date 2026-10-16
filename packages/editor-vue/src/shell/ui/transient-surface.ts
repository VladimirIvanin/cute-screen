import {
  inject,
  provide,
  useId,
} from 'vue'
import type { InjectionKey } from 'vue'

const surfaceKey: InjectionKey<string> = Symbol('transient-surface')

/** A surface and its teleported children share an owner, not an overlay root. */
export function provideTransientSurface(): string {
  const owner = `cs-surface-${useId()}`
  provide(surfaceKey, owner)
  return owner
}

export function useTransientSurface(): string | undefined {
  return inject(surfaceKey, undefined)
}

export function ownsSurfaceTarget(
  owner: string | undefined,
  target: EventTarget | null,
): boolean {
  return Boolean(owner && target instanceof Element && target.closest('[data-cs-surface]')?.getAttribute('data-cs-surface') === owner)
}
