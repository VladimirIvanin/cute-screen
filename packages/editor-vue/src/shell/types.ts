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
  readonly opacityEditable: boolean
  /** A non-serializable editor projection, e.g. the current text draft. */
  readonly transient?: boolean
}

export interface FrameSummary {
  readonly id: string
  readonly label: string
  readonly selected: boolean
}

export type ContextControl =
  | {
      readonly kind: 'action'
      readonly id: string
      readonly label: string
      readonly disabled?: boolean
    }
  | {
      readonly kind: 'color'
      readonly id: string
      readonly label: string
      readonly value: string
      readonly disabled?: boolean
      readonly eyedropper?: boolean
      /** Arrow uses one swatch trigger instead of the general quick-colour row. */
      readonly compact?: boolean
    }
  | {
      readonly kind: 'range'
      readonly id: string
      readonly label: string
      readonly value: number
      readonly min: number
      readonly max: number
      readonly step: number
      readonly disabled?: boolean
    }
  | {
      readonly kind: 'select'
      readonly id: string
      readonly label: string
      readonly value: string
      readonly disabled?: boolean
      readonly options: readonly Readonly<{
        readonly value: string
        readonly label: string
      }>[]
    }
  | {
      readonly kind: 'arrowStroke'
      readonly id: 'stroke'
      readonly label: string
      readonly width: number
      readonly style: 'solid' | 'dashed' | 'dotted'
      readonly disabled?: boolean
      readonly solidLabel: string
      readonly dashedLabel: string
      readonly dottedLabel: string
    }
  | {
      readonly kind: 'arrowCap'
      readonly id: 'startCap' | 'endCap'
      readonly label: string
      readonly value:
        'none' | 'lineArrow' | 'solidArrow' | 'triangle' | 'circle' | 'diamond'
      readonly disabled?: boolean
      readonly options: readonly Readonly<{
        readonly value:
          | 'none'
          | 'lineArrow'
          | 'solidArrow'
          | 'triangle'
          | 'circle'
          | 'diamond'
        readonly label: string
      }>[]
    }
  | {
      readonly kind: 'arrowPath'
      readonly id: 'arrowPath'
      readonly label: string
      readonly value: 'straight' | 'elbow' | 'quadratic'
      readonly disabled?: boolean
      readonly options: readonly Readonly<{
        readonly value: 'straight' | 'elbow' | 'quadratic'
        readonly label: string
      }>[]
    }

export interface ContextToolbarSchema {
  readonly icon: IconName
  readonly title: string
  readonly hint: string
  readonly controls: readonly ContextControl[]
  /** The v7 rich-text toolbar is a compact, shared control strip. */
  readonly text?: Readonly<{
    readonly kind: 'text' | 'callout' | 'numberedMarker'
    readonly color: string | null
    readonly fontFamily: string | null
    readonly fonts: readonly string[]
    readonly fontSize: number | null
    readonly bold: boolean | null
    readonly italic: boolean | null
    readonly strikethrough: boolean | null
    readonly listKind: 'none' | 'bullet' | null
    readonly alignment: 'start' | 'center' | 'end' | null
    readonly background: {
      readonly color: string
      readonly padding: number
      readonly radius: number
    } | null
    readonly disabled: readonly ('list' | 'none' | 'padding' | 'radius')[]
    readonly disabledReason?: string
  }>
}

export interface PrecisionToolDefaults {
  readonly censor: {
    readonly region: 'rectangle' | 'freeform'
    readonly mode: 'pixelate' | 'blur' | 'solid'
    readonly blockSize: number
    readonly blurStrength: number
    readonly solidColor: import('@cute-screen/editor-renderer').SrgbColor
  }
  readonly spotlight: {
    readonly shape: 'rectangle' | 'ellipse' | 'diamond'
    readonly dimColor: import('@cute-screen/editor-renderer').SrgbColor
    readonly dimOpacity: number
    readonly feather: 'soft' | 'strong' | null
  }
  readonly ruler: {
    readonly unit: 'pixels' | 'percent'
    readonly snap: boolean
    readonly snapAngleIncrementDegrees: number
    readonly color: import('@cute-screen/editor-renderer').SrgbColor
    readonly thickness: number
    readonly fontSize: number
  }
  readonly loupe: {
    readonly zoom: number
    readonly size: number
    readonly shape: 'circle' | 'rectangle'
    readonly borderColor: import('@cute-screen/editor-renderer').SrgbColor
    readonly borderWidth: number
    readonly shadow: boolean
  }
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
  | 'eyedropper'
  | 'hand'
  | 'image'
  | 'layers'
  | 'lock'
  | 'loupe'
  | 'marker'
  | 'more'
  | 'pencil'
  | 'plus'
  | 'privacy'
  | 'redo'
  | 'ruler'
  | 'select'
  | 'shape'
  | 'spotlight'
  | 'sparkles'
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
  'dismissCaptureFallback',
  'copyUnavailable',
  'exportUnavailable',
  'layers',
  'layersEmpty',
  'layersNoSelection',
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
  'toolEyedropper',
  'toolPrivacy',
  'toolSpotlight',
  'toolRuler',
  'toolLoupe',
  'toolUnavailable',
  'toolNeedsCanvas',
  'arrowHint',
  'arrowStroke',
  'arrowTail',
  'arrowGeometry',
  'arrowHead',
  'arrowSolid',
  'arrowDashed',
  'arrowDotted',
  'arrowStraight',
  'arrowElbow',
  'arrowQuadratic',
  'arrowNone',
  'arrowLine',
  'arrowSolidArrow',
  'arrowTriangle',
  'arrowCircle',
  'arrowDiamond',
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
