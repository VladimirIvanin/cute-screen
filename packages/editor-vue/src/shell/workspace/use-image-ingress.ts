import {
  onBeforeUnmount,
  watch,
} from 'vue'
import type { ImageDropEvent } from '../../texture-fill'
import type { ResolvedEditorShellProps } from '../contracts'
import type { createWorkspaceState } from './workspace-state'
import type { createWorkspaceBindings } from './workspace-bindings'

export function useImageIngress(
  props: ResolvedEditorShellProps,
  workspace: ReturnType<typeof createWorkspaceState>,
  bindings: ReturnType<typeof createWorkspaceBindings>,
  locale: () => 'ru' | 'en',
): void {
  let alive = true
  let supported = false
  let fileCount = 0
  let listenerGeneration = 0
  let unlisten: (() => void) | undefined
  const error = (en: string, ru: string) => {
    workspace.toolError.value = locale() === 'ru' ? ru : en
  }
  async function onDrop(event: ImageDropEvent): Promise<void> {
    if (!alive) return
    if (event.phase === 'leave') {
      workspace.imageDropActive.value = false
      return
    }
    if (event.phase === 'enter' || event.phase === 'drop') {
      supported = event.supported
      fileCount = event.fileCount
    }
    const target = !props.readOnlyDocument && !props.quickSelectionMode && !workspace.contentImageImporting.value
      ? workspace.canvasViewport.value?.imageInsertionTarget({ x: event.x, y: event.y }) : undefined
    workspace.imageDropActive.value = Boolean(target && supported && fileCount === 1 && event.phase !== 'drop')
    if (event.phase !== 'drop' || !target) return
    workspace.toolError.value = undefined
    if (fileCount !== 1) {
      error('Drop one image at a time.', 'Перетащите одно изображение.')
      return
    }
    if (!supported) {
      error('Choose a PNG, JPEG, WebP or safe SVG image.', 'Выберите PNG, JPEG, WebP или безопасный SVG.')
      return
    }
    if (!event.token) {
      error('Could not read the dropped file. Try again.', 'Не удалось прочитать файл. Попробуйте ещё раз.')
      return
    }
    if (workspace.activeDocument.value) {
      await new Promise<void>((resolve) => {
        workspace.canvasViewport.value?.finishTextEditing(() => {
          void bindings.importDroppedImage(event.token!, target).finally(resolve)
        })
      })
    } else if (props.openDroppedImage && props.initialDocumentState?.kind === 'empty') {
      await bindings.openDroppedDocument(event.token)
    }
  }
  watch(() => props.contentImageBridge, (bridge) => {
    const generation = ++listenerGeneration
    unlisten?.()
    unlisten = undefined
    if (!bridge?.subscribeImageDrop) return
    void bridge.subscribeImageDrop((event) => {
      void (async () => {
        try {
          await onDrop(event)
        } catch (cause) {
          console.warn('cute-screen native image drop failed', cause)
          if (alive) error('Could not add the image. Try again.', 'Не удалось добавить изображение. Попробуйте ещё раз.')
        } finally {
          if (event.phase === 'drop' && event.token) {
            try {
              await bridge.discardDroppedImage?.(event.token)
            } catch (cause) {
              console.warn('cute-screen drop grant cleanup failed', cause)
            }
          }
        }
      })()
    }).then((stop) => {
      if (!alive || generation !== listenerGeneration) stop()
      else unlisten = stop
    }).catch((cause: unknown) => {
      console.warn('cute-screen native image drop listener failed', cause)
      if (alive && generation === listenerGeneration) error('File drop is unavailable. Use G to choose an image.', 'Перетаскивание недоступно. Нажмите G для выбора изображения.')
    })
  }, { immediate: true })
  const onEscape = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('[role="dialog"], [aria-haspopup="dialog"][aria-expanded="true"]')) return
    if (
      event.key !== 'Escape' ||
      (!workspace.contentImageImporting.value &&
        !workspace.toolError.value)
    ) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (workspace.contentImageImporting.value) bindings.cancelImageImport()
    else workspace.toolError.value = undefined
  }
  window.addEventListener('keydown', onEscape, true)
  onBeforeUnmount(() => {
    alive = false
    unlisten?.()
    bindings.dispose()
    window.removeEventListener('keydown', onEscape, true)
  })
}
