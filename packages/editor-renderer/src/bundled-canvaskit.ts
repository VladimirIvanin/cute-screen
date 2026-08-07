import CanvasKitInit from 'canvaskit-wasm'
import canvasKitWasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url'

import type { CanvasKitApi } from './canvaskit'

let bundledCanvasKit: Promise<CanvasKitApi> | undefined

export function loadBundledCanvasKit(): Promise<CanvasKitApi> {
  bundledCanvasKit ??= CanvasKitInit({
    locateFile: () => canvasKitWasmUrl,
  }) as Promise<CanvasKitApi>
  return bundledCanvasKit
}
