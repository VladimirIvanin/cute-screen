import type { DocumentSessionController } from '../document-session'
import type { PropType } from 'vue'
import type { SystemFontFace } from '../font-catalog'
import type { ClipboardBridge } from '../image-transport'
import type { CaptureProgressState } from '../platform'
import type { ContentImageBridge, TextureFillBridge } from '../texture-fill'
import type {
  CanvasViewportHosts,
  FrameSummary,
  ShellActionAdapter,
  ShellDocumentState,
} from './types'

export interface EditorShellProps {
  actions?: ShellActionAdapter | undefined
  documentSession?: DocumentSessionController | undefined
  fixture?: 'empty' | 'error' | 'loading' | 'ready'
  initialDocumentState?: ShellDocumentState | undefined
  readOnlyDocument?: boolean
  captureAvailable?: boolean
  captureWindowAvailable?: boolean
  captureUnavailableReason?: string | undefined
  openImageAvailable?: boolean
  captureFallbackCommand?: string | undefined
  captureProgress?: CaptureProgressState | undefined
  frames?: readonly FrameSummary[] | undefined
  sourceImage?: HTMLImageElement | undefined
  textureBridge?: TextureFillBridge | undefined
  contentImageBridge?: ContentImageBridge | undefined
  clipboardBridge?: ClipboardBridge | undefined
  systemFonts?: readonly SystemFontFace[] | undefined
  quickMode?: boolean
  quickSelectionMode?: boolean
}

export type ResolvedEditorShellProps = EditorShellProps &
  Required<
    Pick<
      EditorShellProps,
      | 'fixture'
      | 'readOnlyDocument'
      | 'captureAvailable'
      | 'captureWindowAvailable'
      | 'openImageAvailable'
      | 'quickMode'
      | 'quickSelectionMode'
    >
  >

export type EditorShellEmits = {
  hostsReady: [hosts: CanvasViewportHosts]
  frameReady: [documentId: string]
  retryLoad: []
  quickFrameChange: [
    crop: { x: number; y: number; width: number; height: number },
  ]
  quickSelectionComplete: [
    crop: { x: number; y: number; width: number; height: number },
  ]
}

export type EditorShellEmit = <K extends keyof EditorShellEmits>(
  event: K,
  ...args: EditorShellEmits[K]
) => void

export const editorShellRuntimeProps = {
  actions: Object as PropType<EditorShellProps['actions']>,
  documentSession: Object as PropType<EditorShellProps['documentSession']>,
  fixture: {
    type: String as PropType<EditorShellProps['fixture']>,
    default: 'empty',
  },
  initialDocumentState: Object as PropType<
    EditorShellProps['initialDocumentState']
  >,
  readOnlyDocument: { type: Boolean, default: false },
  captureAvailable: { type: Boolean, default: true },
  captureWindowAvailable: { type: Boolean, default: false },
  captureUnavailableReason: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
  openImageAvailable: { type: Boolean, default: false },
  captureFallbackCommand: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
  captureProgress: String as PropType<EditorShellProps['captureProgress']>,
  frames: Array as PropType<EditorShellProps['frames']>,
  sourceImage: Object as PropType<EditorShellProps['sourceImage']>,
  textureBridge: Object as PropType<EditorShellProps['textureBridge']>,
  contentImageBridge: Object as PropType<
    EditorShellProps['contentImageBridge']
  >,
  clipboardBridge: Object as PropType<EditorShellProps['clipboardBridge']>,
  systemFonts: Array as PropType<EditorShellProps['systemFonts']>,
  quickMode: { type: Boolean, default: false },
  quickSelectionMode: { type: Boolean, default: false },
} as const

export const editorShellRuntimeEmits = [
  'hostsReady',
  'frameReady',
  'retryLoad',
  'quickFrameChange',
  'quickSelectionComplete',
] as string[]
