export interface CanvasKitInitOptions {
  readonly locateFile?: (file: string) => string
}

export default function CanvasKitInit(
  options?: CanvasKitInitOptions,
): Promise<unknown>
