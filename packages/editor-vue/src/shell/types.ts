export type SupportedLocale = 'en' | 'ru'
export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export interface UiPreferencesV1 {
  readonly schemaVersion: 1
  readonly locale: SupportedLocale
  readonly theme: ThemePreference
}

export type ShellDocumentState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly title: string
      readonly dimensions: string
    }
  | { readonly kind: 'error'; readonly message: string }

export interface ToolDescriptor {
  readonly id: string
  readonly group: 'annotate' | 'canvas' | 'more'
  readonly icon: IconName
  readonly labelKey: TranslationKey
  readonly shortcut?: string
  readonly disabled?: boolean
  readonly disabledReasonKey?: TranslationKey
}

export interface LayerSummary {
  readonly id: string
  readonly icon: IconName
  readonly name: string
  readonly visible: boolean
  readonly locked: boolean
  readonly opacity: number
  readonly rotation: number
}

export interface FrameSummary {
  readonly id: string
  readonly label: string
  readonly selected: boolean
}

export type ContextControl =
  | { readonly kind: 'action'; readonly id: string; readonly label: string }
  | {
      readonly kind: 'color'
      readonly id: string
      readonly label: string
      readonly value: string
    }
  | {
      readonly kind: 'range'
      readonly id: string
      readonly label: string
      readonly value: number
      readonly min: number
      readonly max: number
      readonly step: number
    }
  | {
      readonly kind: 'select'
      readonly id: string
      readonly label: string
      readonly value: string
      readonly options: readonly Readonly<{
        readonly value: string
        readonly label: string
      }>[]
    }

export interface ContextToolbarSchema {
  readonly icon: IconName
  readonly title: string
  readonly hint: string
  readonly controls: readonly ContextControl[]
}

export interface CanvasViewportHosts {
  readonly scene: HTMLCanvasElement
  readonly overlay: HTMLCanvasElement
  readonly scrollContainer: HTMLDivElement
}

export type AsyncActionName = 'capture' | 'openImage' | 'copy' | 'export'

export type AsyncActionState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'pending'
      readonly action: AsyncActionName
      readonly captureProgress?: CaptureProgressState
    }
  | {
      readonly status: 'cancelled'
      readonly action: AsyncActionName
      readonly message: string
    }
  | {
      readonly status: 'success'
      readonly action: AsyncActionName
      readonly message: string
    }
  | {
      readonly status: 'error'
      readonly action: AsyncActionName
      readonly message: string
    }

export type DocumentSaveState =
  'saved' | 'dirty' | 'saving' | 'error' | 'readOnly'

export interface DocumentHistoryState {
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly saveState: DocumentSaveState
  readonly error?: string
}

export interface ShellActionAdapter {
  run(
    action: AsyncActionName,
    signal: AbortSignal,
    reportCaptureProgress?: (state: CaptureProgressState) => void,
  ): Promise<string>
}

export type IconName =
  | 'arrow'
  | 'camera'
  | 'check'
  | 'close'
  | 'chevronDown'
  | 'copy'
  | 'crop'
  | 'export'
  | 'eye'
  | 'eyeOff'
  | 'hand'
  | 'image'
  | 'layers'
  | 'lock'
  | 'marker'
  | 'more'
  | 'pencil'
  | 'plus'
  | 'privacy'
  | 'redo'
  | 'select'
  | 'shape'
  | 'spotlight'
  | 'text'
  | 'undo'
  | 'unlock'
  | 'zoomIn'
  | 'zoomOut'

export const translationKeys = [
  'appName',
  'canvasViewport',
  'capture',
  'captureAction',
  'captureProbing',
  'captureReady',
  'captureDelay',
  'captureSelecting',
  'captureCapturing',
  'capturePersisting',
  'captureCancelled',
  'openImage',
  'openImageAction',
  'openImageUnavailable',
  'copy',
  'export',
  'moreActions',
  'theme',
  'language',
  'systemTheme',
  'lightTheme',
  'darkTheme',
  'tools',
  'toolSettings',
  'canvasActions',
  'flipHorizontal',
  'flipVertical',
  'seriesFrames',
  'zoom',
  'fitZoom',
  'zoomPercentage',
  'sceneCanvas',
  'interactionOverlay',
  'emptyTitle',
  'emptyDescription',
  'readyLoadError',
  'captureUnavailable',
  'captureFallback',
  'copyCaptureFallback',
  'captureFallbackCopied',
  'copyUnavailable',
  'exportUnavailable',
  'layers',
  'layersEmpty',
  'baseImage',
  'opacity',
  'rotation',
  'moveLayerUp',
  'moveLayerDown',
  'lockLayer',
  'unlockLayer',
  'hideLayers',
  'showLayers',
  'toolSelect',
  'toolHand',
  'toolCrop',
  'toolArrow',
  'toolShape',
  'toolPencil',
  'toolMarker',
  'toolText',
  'toolNumberedMarker',
  'toolCallout',
  'toolImage',
  'toolPrivacy',
  'toolSpotlight',
  'toolUnavailable',
  'arrowHint',
  'color',
  'width',
  'zoomOut',
  'zoomIn',
  'zoomValue',
  'selectedFrame',
  'cancel',
  'retry',
  'loadingEditor',
  'copyAction',
  'exportAction',
  'undo',
  'redo',
  'unsavedChanges',
  'savingDocument',
  'readOnlyDocument',
  'saveFailed',
  'exportRecovery',
] as const

export type TranslationKey = (typeof translationKeys)[number]
import type { CaptureProgressState } from '../platform'
