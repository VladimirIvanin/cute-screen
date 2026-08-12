export interface ClipboardImageWriter {
  write(items: readonly unknown[]): Promise<void>
}

export interface ResultClipboardDependencies {
  readonly clipboard: ClipboardImageWriter
  readonly createItem: (items: Record<'image/png', Blob>) => unknown
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
 * Copies the fully rendered editor scene through the webview's native
 * clipboard implementation. PNG bytes never travel through Tauri JSON IPC.
 */
export async function writeResultCanvasToClipboard(
  canvas: HTMLCanvasElement,
  dependencies: ResultClipboardDependencies = {
    clipboard: navigator.clipboard,
    createItem: (items) => new ClipboardItem(items),
  },
): Promise<void> {
  const blob = await canvasPngBlob(canvas)
  await dependencies.clipboard.write([
    dependencies.createItem({ 'image/png': blob }),
  ])
}
