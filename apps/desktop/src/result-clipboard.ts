export interface ResultClipboardDependencies {
  readonly writePng: (bytes: Uint8Array) => Promise<void>
}

function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Result PNG encoding failed'))
        return
      }
      if (blob.type !== 'image/png') {
        reject(
          new Error(
            `Result PNG encoding returned ${blob.type || 'no MIME type'}`,
          ),
        )
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

/**
 * Copies the fully rendered editor scene through the desktop host's native
 * clipboard implementation. PNG bytes never travel through Tauri JSON IPC.
 */
export async function writeResultCanvasToClipboard(
  canvas: HTMLCanvasElement,
  dependencies: ResultClipboardDependencies,
): Promise<void> {
  const blob = await canvasPngBlob(canvas)
  await dependencies.writePng(new Uint8Array(await blob.arrayBuffer()))
}
