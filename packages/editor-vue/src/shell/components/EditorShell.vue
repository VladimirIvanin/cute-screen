<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { t } from '../i18n'
import { createBrowserPreferencesStorage } from '../preferences'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type {
  CanvasViewportHosts,
  ShellActionAdapter,
  ToolDescriptor,
} from '../types'
import ActionFeedback from './ActionFeedback.vue'
import CanvasViewport from './CanvasViewport.vue'
import ContextToolbar from './ContextToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'

const props = withDefaults(
  defineProps<{
    actions?: ShellActionAdapter | undefined
    fixture?: 'empty' | 'error' | 'loading' | 'ready'
  }>(),
  { actions: undefined, fixture: 'empty' },
)
const emit = defineEmits<{ hostsReady: [hosts: CanvasViewportHosts] }>()
const store = useEditorShellStore()
const state = storeToRefs(store)
const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
const tools: readonly ToolDescriptor[] = [
  {
    id: 'select',
    group: 'canvas',
    icon: 'select',
    labelKey: 'toolSelect',
    shortcut: 'V',
    disabled: props.fixture !== 'ready',
  },
  {
    id: 'hand',
    group: 'canvas',
    icon: 'hand',
    labelKey: 'toolHand',
    shortcut: 'H',
    disabled: props.fixture !== 'ready',
  },
  {
    id: 'crop',
    group: 'canvas',
    icon: 'crop',
    labelKey: 'toolCrop',
    shortcut: 'C',
    disabled: true,
  },
  {
    id: 'arrow',
    group: 'annotate',
    icon: 'arrow',
    labelKey: 'toolArrow',
    shortcut: 'A',
    disabled: props.fixture !== 'ready',
  },
  {
    id: 'shape',
    group: 'annotate',
    icon: 'shape',
    labelKey: 'toolShape',
    shortcut: 'S',
    disabled: true,
  },
  {
    id: 'pencil',
    group: 'annotate',
    icon: 'pencil',
    labelKey: 'toolPencil',
    shortcut: 'P',
    disabled: true,
  },
  {
    id: 'marker',
    group: 'annotate',
    icon: 'marker',
    labelKey: 'toolMarker',
    shortcut: 'M',
    disabled: true,
  },
  {
    id: 'text',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolText',
    shortcut: 'T',
    disabled: true,
  },
  {
    id: 'privacy',
    group: 'more',
    icon: 'privacy',
    labelKey: 'toolPrivacy',
    disabled: true,
  },
  {
    id: 'spotlight',
    group: 'more',
    icon: 'spotlight',
    labelKey: 'toolSpotlight',
    disabled: true,
  },
]
const contextSchema = computed(() =>
  state.activeToolId.value === 'arrow'
    ? {
        icon: 'arrow' as const,
        title: translate('toolArrow'),
        hint: translate('arrowHint'),
        controls: [
          { kind: 'color' as const, id: 'color', label: translate('color') },
          { kind: 'range' as const, id: 'width', label: translate('width') },
        ],
      }
    : undefined,
)
const media: Pick<
  MediaQueryList,
  'matches' | 'addEventListener' | 'removeEventListener'
> =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : {
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }
const onMediaChange = (event: MediaQueryListEvent) =>
  store.setSystemDark(event.matches)
function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch (error) {
    void error
    return undefined
  }
}
const preferencesOptions: ShellStoreOptions = {
  ...(props.actions ? { actions: props.actions } : {}),
  languages: navigator.languages,
  preferences: createBrowserPreferencesStorage(
    browserStorage(),
    navigator.languages,
  ),
  systemDark: () => media.matches,
}

function loadFixture(): void {
  if (props.fixture === 'loading') {
    store.setDocumentState({ kind: 'loading' })
    return
  }
  if (props.fixture === 'error') {
    store.setDocumentState({
      kind: 'error',
      message: translate('readyLoadError'),
    })
    return
  }
  if (props.fixture === 'ready') {
    store.setFixture({
      document: {
        kind: 'ready',
        title: 'Landing-page redesign',
        dimensions: '1440 × 900',
      },
      activeToolId: 'arrow',
      selectedLayerId: 'arrow-1',
      layers: [
        {
          id: 'text-1',
          icon: 'text',
          name: 'CTA comment',
          visible: true,
          locked: false,
        },
        {
          id: 'arrow-1',
          icon: 'arrow',
          name: 'Arrow to button',
          visible: true,
          locked: false,
        },
        {
          id: 'marker-1',
          icon: 'marker',
          name: 'Title highlight',
          visible: true,
          locked: true,
        },
      ],
      frames: [
        { id: 'frame-1', label: '1', selected: true },
        { id: 'frame-2', label: '2', selected: false },
        { id: 'frame-3', label: '3', selected: false },
      ],
    })
    store.setLayersOpen(true)
    return
  }
  store.setFixture({ document: { kind: 'empty' } })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    store.clearFeedback()
    store.setLayersOpen(false)
  }
}
onMounted(() => {
  store.initialize(preferencesOptions)
  loadFixture()
  media.addEventListener('change', onMediaChange)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  media.removeEventListener('change', onMediaChange)
  window.removeEventListener('keydown', onKeydown)
})
watch(
  [state.resolvedTheme, state.locale],
  ([theme, locale]) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
  },
  { immediate: true },
)
</script>

<template>
  <div class="cs-editor-shell">
    <TopBar
      :locale="store.locale"
      :theme="store.preferences.theme"
      :can-copy-or-export="store.canCopyOrExport"
      :pending="store.actionState.status === 'pending'"
      :t="translate"
      @action="store.runAction"
      @locale="store.setLocale"
      @theme="store.setTheme"
    />
    <div class="cs-workbench">
      <ToolRail
        :tools="tools"
        :active-tool-id="store.activeToolId"
        :t="translate"
        @select="store.selectTool"
      />
      <CanvasViewport
        :document-state="store.documentState"
        :t="translate"
        @hosts-ready="emit('hostsReady', $event)"
        @retry="store.setDocumentState({ kind: 'empty' })"
      />
      <LayersPanel
        :layers="store.layers"
        :open="store.layersOpen"
        :selected-layer-id="store.selectedLayerId"
        :t="translate"
        @select="store.selectLayer"
        @toggle="store.toggleLayers"
      />
      <ZoomControls :zoom="store.zoom" :t="translate" @zoom="store.setZoom" />
      <ContextToolbar
        :schema="contextSchema"
        :label="translate('toolSettings')"
      />
    </div>
    <SeriesFilmstrip
      :frames="store.frames"
      :active-frame-id="store.activeFrameId"
      :t="translate"
      @select="store.selectFrame"
    />
    <ActionFeedback
      :state="store.actionState"
      :t="translate"
      @cancel="store.cancelAction"
      @retry="
        store.runAction(
          store.actionState.status === 'error'
            ? store.actionState.action
            : 'capture',
        )
      "
    />
  </div>
</template>
