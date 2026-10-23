<script setup lang="ts">
import {
  NButton,
  NConfigProvider,
} from 'naive-ui'
import {
  nextTick,
  ref,
  watch,
} from 'vue'
import { UiIcon } from '../icon'
import ActionFeedback from './ActionFeedback.vue'
import ImageImportFeedback from './ImageImportFeedback.vue'
import SelectionFormattingToolbar from './SelectionFormattingToolbar.vue'
import CanvasViewport from './CanvasViewport.vue'
import CanvasContextMenu from './CanvasContextMenu.vue'
import ContextToolbar from './ContextToolbar.vue'
import ToolConfigurePopover from './ToolConfigurePopover.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'
import { cuteScreenThemeOverrides } from '../ui/theme'
import {
  editorShellRuntimeEmits,
  editorShellRuntimeProps,
} from '../contracts'
import CaptureFallback from './CaptureFallback.vue'
import CompositionDock from '../composition/CompositionDock.vue'
import { useEditorWorkspace } from '../workspace/use-editor-workspace'

defineSlots<{ history(props: { locale: 'ru' | 'en' }): unknown }>()
const props = defineProps(editorShellRuntimeProps)
const emit = defineEmits(editorShellRuntimeEmits)
const {
  compositionOpen,
  compositionSpace,
  compositionController,
  toggleComposition,
  naiveTheme,
  naiveLocale,
  naiveDateLocale,
  store,
  state,
  translate,
  fallbackCopied,
  fallbackVisible,
  copyCaptureFallback,
  dismissCaptureFallback,
  tools,
  selectTool,
  openToolConfigure,
  closeToolConfigure,
  activeDocument,
  displayDocument,
  spotlightEditing,
  canvasMenu,
  canvasMenuItems,
  canvasMenuAction,
  openCanvasMenu,
  contextSchema,
  creationSchema,
  toolActivationRevision,
  onCreationChange,
  selectionSchema,
  toolConfigureSchema,
  drawingPreferences,
  onContextAction,
  onContextChange,
  onColorChange,
  startEyedropper,
  canvasViewport,
  textureImages,
  emojiDefaults,
  placeEmoji,
  baseImageLayer,
  sceneTexturesReady,
  highlighterAnalysis,
  onHighlighterFrameReady,
  samplingControl,
  drawingDefaults,
  precisionDefaults,
  textDefaults,
  calloutStroke,
  textFormatting,
  floatingTextToolbarSchema,
  markerShape,
  markerStyle,
  markerPreviewBlocked,
  nextMarkerSequence,
  selectLayer,
  moveLayer,
  transformLayer,
  updateLayerPayload,
  addLayer,
  executeDocumentCommand,
  setTextDraft,
  cancelTextDefaults,
  importContentImage,
  onColorSample,
  onColorSampleError,
  onColorSampleCancel,
  toolError,
  contentImageImporting,
  imageFeedback,
  imageDropActive,
  cancelImageImport,
  updateLayerProperty,
  onLayerOpacity,
  onLayerRotation,
  onLayerReorderTo,
  toolConfigure,
  onToolConfigureChange,
  eyedropperFeedback,
  eyedropperColor,
  undoDocument,
  redoDocument,
  retryDocumentSave,
  exportDocumentRecovery,
  fitCanvas,
} = useEditorWorkspace(props)

const quickSettingsCollapsed = ref(true)
watch(() => store.activeToolId, () => {
  quickSettingsCollapsed.value = true
}, { flush: 'sync' })
function onQuickSettingsLayout(event: Event): void {
  quickSettingsCollapsed.value = (event as CustomEvent<boolean>).detail
}
function openQuickSettings(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement && store.activeToolId)
    openToolConfigure(store.activeToolId, event.currentTarget)
}
watch([creationSchema, toolConfigure, () => state.locale.value], () => {
  void nextTick(() => document.dispatchEvent(new Event('cs-preview-layout')))
}, { flush: 'post' })

function onTextCancelled(): void {
  cancelTextDefaults()
  selectTool('select')
}
defineExpose({
  prepareNavigation: () => new Promise<{ zoom: number; mode: 'fit' | 'custom' }>((resolve) => {
    const finish = () => {
      canvasViewport.value?.applyCropDraft()
      resolve({ zoom: store.zoom, mode: store.zoomMode })
    }
    if (canvasViewport.value) canvasViewport.value.finishTextEditing(finish)
    else finish()
  }),
  restoreZoom: (viewport: { zoom: number; mode: string }) => {
    store.setZoom(viewport.zoom)
    if (viewport.mode === 'fit') store.enableFit()
  },
})
</script>

<template>
  <NConfigProvider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="cuteScreenThemeOverrides"
    :abstract="false"
  >
    <div class="cs-editor-shell" :class="{ 'is-quick-mode': props.quickMode, 'is-image-drop-target': imageDropActive, 'has-composition-dock': compositionOpen || store.layersOpen && !props.quickMode }">
      <TopBar
        v-if="!props.quickMode"
        :appearance-open="compositionOpen"
        :can-edit-canvas="
          Boolean(
            activeDocument &&
              props.documentSession &&
              !props.readOnlyDocument &&
              store.documentHistory.saveState !== 'readOnly' &&
              store.actionState.status !== 'pending'
          )
        "
        :locale="store.locale"
        :theme="store.preferences.theme"
        :can-copy-or-export="store.canCopyOrExport && !props.readOnlyDocument"
        :can-undo="store.documentHistory.canUndo && !props.readOnlyDocument"
        :can-redo="store.documentHistory.canRedo && !props.readOnlyDocument"
        :save-state="store.documentHistory.saveState"
        :save-error="store.documentHistory.error"
        :pending="store.actionState.status === 'pending'"
        :capture-available="props.captureAvailable"
        :capture-unavailable-reason="props.captureUnavailableReason ?? translate('captureUnavailable')"
        :open-image-available="props.openImageAvailable"
        :open-settings="props.openSettings"
        :t="translate"
        @appearance="toggleComposition"
        @canvas-action="onContextAction"
        @action="store.runAction"
        @undo="undoDocument"
        @redo="redoDocument"
        @retry-save="retryDocumentSave"
        @export-recovery="exportDocumentRecovery"
        @locale="store.setLocale"
        @theme="store.setTheme"
      />
      <CaptureFallback
        v-if="props.captureFallbackCommand && fallbackVisible"
        :command="props.captureFallbackCommand"
        :copied="fallbackCopied"
        :t="translate"
        @copy="copyCaptureFallback"
        @dismiss="dismissCaptureFallback"
      />
      <div class="cs-workbench">
        <div
          v-if="props.quickMode && !props.quickSelectionMode && creationSchema && !toolConfigure"
          class="cs-tool-defaults-toolbar cs-quick-defaults"
          :class="{ 'is-collapsed': quickSettingsCollapsed, 'is-sampling': Boolean(samplingControl || toolConfigure) }"
          :inert="quickSettingsCollapsed || Boolean(samplingControl || toolConfigure)"
          :aria-hidden="quickSettingsCollapsed || Boolean(samplingControl || toolConfigure)"
          @cs-quick-settings-layout="onQuickSettingsLayout"
        >
          <ContextToolbar
            :key="`${store.activeToolId ?? 'select'}:${toolActivationRevision}`"
            :schema="creationSchema"
            :defaults-tool="store.activeToolId ?? 'select'"
            :label="translate('toolSettings')"
            :recent-colors="drawingPreferences.recentColors"
            :picker-locale="state.locale.value"
            @action="onContextAction"
            @change="onCreationChange"
            @eyedropper="startEyedropper"
          />
        </div>
        <div v-if="props.quickMode && !props.quickSelectionMode" class="cs-quick-toolrail-group">
          <ToolRail
            :configured-tool-id="toolConfigure?.toolId"
            :tools="tools"
            :active-tool-id="store.activeToolId"
            :t="translate"
            @select="selectTool"
            @configure="openToolConfigure"
          />
          <NButton
            v-if="creationSchema"
            v-show="quickSettingsCollapsed"
            class="cs-quick-settings-button"
            :aria-label="translate('toolSettings')"
            aria-haspopup="dialog"
            :aria-expanded="Boolean(toolConfigure)"
            @click="openQuickSettings"
          >
            <UiIcon name="more" />
            {{ translate('toolConfigureHint') }}
          </NButton>
          <div
            class="cs-quick-history"
            role="group"
            :aria-label="translate('undo')"
          >
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canUndo"
              :aria-label="translate('undo')"
              @click="undoDocument"
            >
              <UiIcon name="undo" />
            </NButton>
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canRedo"
              :aria-label="translate('redo')"
              @click="redoDocument"
            >
              <UiIcon name="redo" />
            </NButton>
          </div>
        </div>
        <div v-else-if="!props.quickMode" class="cs-bottom-chrome">
          <slot name="history" :locale="state.locale.value">
            <SeriesFilmstrip
              :frames="store.frames"
              :active-frame-id="store.activeFrameId"
              :t="translate"
              @select="store.selectFrame"
            />
          </slot>
          <div class="cs-bottom-chrome-center">
            <ContextToolbar
              v-if="creationSchema && !samplingControl"
              :key="`${store.activeToolId ?? 'select'}:${toolActivationRevision}`"
              class="cs-tool-defaults-toolbar"
              :schema="creationSchema"
              :defaults-tool="store.activeToolId ?? 'select'"
              :label="translate('toolSettings')"
              :recent-colors="drawingPreferences.recentColors"
              :picker-locale="state.locale.value"
              @action="onContextAction"
              @change="onCreationChange"
              @eyedropper="startEyedropper"
            />
            <ContextToolbar
              :schema="contextSchema"
              :label="translate('toolSettings')"
              :recent-colors="drawingPreferences.recentColors"
              :picker-locale="state.locale.value"
              @action="onContextAction"
              @change="onColorChange"
              @eyedropper="startEyedropper"
            />
            <ToolRail
              :configured-tool-id="toolConfigure?.toolId"
              :tools="tools"
              :active-tool-id="store.activeToolId"
              :t="translate"
              @select="selectTool"
              @configure="openToolConfigure"
            />
          </div>
          <ZoomControls
            :zoom="store.zoom"
            :t="translate"
            @zoom="store.setZoom"
            @fit="fitCanvas"
          />
        </div>
        <CanvasViewport
          ref="canvasViewport"
          :document-state="store.documentState"
          :canvas="activeDocument?.canvas"
          :image="props.sourceImage"
          :texture-images="textureImages"
          :emoji-defaults="emojiDefaults"
          :image-layer="baseImageLayer"
          :document="displayDocument"
          :export-document="activeDocument"
          :interactive-preview="displayDocument !== activeDocument"
          :composition-space="compositionSpace"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :active-tool="store.activeToolId ?? 'select'"
          :spotlight-editing="spotlightEditing"
          :read-only="props.readOnlyDocument"
          :sampling="Boolean(samplingControl || store.activeToolId === 'eyedropper')"
          :sampling-blocked="!sceneTexturesReady"
          :drawing-defaults="drawingDefaults"
          :precision-defaults="precisionDefaults"
          :text-defaults="textDefaults"
          @layer-space="compositionController.activateCompositionSpace"
          :callout-stroke="calloutStroke"
          :text-formatting="textFormatting"
          :text-toolbar-schema="floatingTextToolbarSchema"
          :text-toolbar-locale="state.locale.value"
          :arrow-toolbar-schema="undefined"
          :arrow-toolbar-locale="state.locale.value"
          :next-marker-sequence="nextMarkerSequence"
          @emoji-place="placeEmoji"
          :marker-style="markerStyle"
          :marker-preview-blocked="markerPreviewBlocked"
          :marker-shape="markerShape"
          :open-image-available="props.openImageAvailable"
          :zoom="store.zoom"
          :fit-mode="store.zoomMode === 'fit'"
          :quick-frame-mode="props.quickMode"
          @spotlight-editing-change="spotlightEditing = $event"
          :quick-selection-mode="props.quickSelectionMode"
          @spotlight-remove="onContextAction('spotlightRemove')"
          :t="translate"
          :highlighter-effect="highlighterAnalysis.effect"
          @hosts-ready="emit('hostsReady', $event)"
          @frame-ready="onHighlighterFrameReady($event); emit('frameReady', $event)"
          @quick-frame-change="emit('quickFrameChange', $event)"
          @quick-selection-complete="emit('quickSelectionComplete', $event)"
          @context-menu="openCanvasMenu"
          @clear-selection="store.clearLayerSelection()"
          @select-layer="selectLayer"
          @move-layer="moveLayer"
          @transform-layer="transformLayer"
          @update-layer-payload="updateLayerPayload"
          @add-layer="addLayer"
          @document-command="executeDocumentCommand"
          @text-editing="setTextDraft"
          @text-editing-cancelled="onTextCancelled"
          @text-toolbar-change="onContextChange"
          @arrow-toolbar-change="onContextChange"
          @request-image-import="importContentImage"
          @open-image="store.runAction('openImage')"
          @select-tool="selectTool"
          @color-sample="onColorSample"
          @color-sample-error="onColorSampleError"
          @color-sample-cancel="onColorSampleCancel"
          @tool-error="toolError = $event"
          @zoom="store.setZoom"
          @fit-zoom="store.setFitZoom"
          @retry="emit('retryLoad')"
        />
        <SelectionFormattingToolbar
          :move-enabled="store.activeToolId === 'select' && !props.readOnlyDocument && !floatingTextToolbarSchema"
          :quick-mode="props.quickMode"
          :layers-open="store.layersOpen"
          :schema="selectionSchema"
          :document="activeDocument"
          :selected-ids="store.selectedLayerIds"
          :zoom="store.zoom"
          :locale="state.locale.value"
          :recent-colors="drawingPreferences.recentColors"
          @move-start="canvasViewport?.startSelectionMove($event)"
          @change="onColorChange"
          @action="onContextAction"
          @eyedropper="startEyedropper"
        />
        <CompositionDock
          v-if="!props.quickMode"
          :controller="compositionController"
          :can-import="Boolean(props.textureBridge && props.materialBridge)"
          :can-save="Boolean(props.materialBridge)"
        />
        <LayersPanel
          v-if="!props.quickMode && !compositionOpen"
          :layers="store.layers"
          :open="store.layersOpen"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :t="translate"
          @select="selectLayer"
          @toggle="store.toggleLayers"
          @visibility="updateLayerProperty($event, 'visible')"
          @lock="updateLayerProperty($event, 'locked')"
          @opacity="onLayerOpacity"
          @rotation="onLayerRotation"
          @reorder-to="onLayerReorderTo"
        />
        <ContextToolbar
          v-if="props.quickMode && !props.quickSelectionMode"
          class="cs-tool-defaults-toolbar"
          :schema="contextSchema"
          :label="translate('toolSettings')"
          :recent-colors="drawingPreferences.recentColors"
          :picker-locale="state.locale.value"
          @action="onContextAction"
          @change="onColorChange"
          @eyedropper="startEyedropper"
        />
      </div>
      <ActionFeedback
        :state="store.actionState"
        :t="translate"
        @cancel="store.cancelAction"
        @retry="store.retryAction()"
      />
      <CanvasContextMenu
        :request="canvasMenu"
        :items="canvasMenuItems"
        @action="canvasMenuAction"
        @close="canvasMenu = undefined"
      />
      <div class="cs-overlay-root" aria-live="polite">
        <ToolConfigurePopover
          v-if="toolConfigureSchema && toolConfigure"
          :key="toolConfigure.toolId"
          :anchor="toolConfigure.anchor"
          :label="translate('toolSettings')"
          @keydown.esc.prevent.stop="closeToolConfigure"
          @pointerdown.stop
        >
          <ContextToolbar
            :schema="toolConfigureSchema"
            :defaults-tool="toolConfigure.toolId"
            :label="translate('toolSettings')"
            :recent-colors="drawingPreferences.recentColors"
            :picker-locale="state.locale.value"
            @change="onToolConfigureChange"
            @action="onContextAction"
            @eyedropper="startEyedropper"
          />
        </ToolConfigurePopover>
      </div>
      <p
        v-if="eyedropperFeedback"
        class="cs-eyedropper-feedback"
        role="status"
      >
        <span
          v-if="eyedropperColor"
          class="cs-eyedropper-swatch"
          :style="{ backgroundColor: eyedropperColor }"
          :aria-label="
            state.locale.value === 'ru' ? `Образец цвета ${eyedropperColor}` : `Colour swatch ${eyedropperColor}`
          "
        />
        <span>{{ eyedropperFeedback }}</span>
      </p>
      <ImageImportFeedback
        :error="toolError"
        :pending="contentImageImporting"
        :message="imageFeedback"
        :locale="state.locale.value"
        @cancel="cancelImageImport"
      />
    </div>
  </NConfigProvider>
</template>
