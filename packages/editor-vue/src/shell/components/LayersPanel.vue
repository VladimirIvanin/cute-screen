<script setup lang="ts">
import { ref } from 'vue'

import { UiIcon } from '../icon'
import type { LayerSummary } from '../types'
defineProps<{
  layers: readonly LayerSummary[]
  open: boolean
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  t: (
    key:
      | 'layers'
      | 'layersEmpty'
      | 'hideLayers'
      | 'showLayers'
      | 'opacity'
      | 'rotation'
      | 'moveLayerUp'
      | 'moveLayerDown'
      | 'lockLayer'
      | 'unlockLayer',
  ) => string
}>()
const dragLayerId = ref<string>()
function startReorder(id: string): void {
  dragLayerId.value = id
}
function dropReorder(targetId: string): void {
  const sourceId = dragLayerId.value
  dragLayerId.value = undefined
  if (sourceId && sourceId !== targetId) emit('reorderTo', sourceId, targetId)
}
function clearReorder(): void {
  dragLayerId.value = undefined
}
const emit = defineEmits<{
  select: [id: string, toggle: boolean, range: boolean]
  toggle: []
  visibility: [id: string]
  lock: [id: string]
  opacity: [id: string, opacity: number]
  rotation: [id: string, rotation: number]
  reorder: [id: string, direction: 'up' | 'down']
  reorderTo: [id: string, targetId: string]
}>()
</script>

<template>
  <button
    v-if="!open"
    type="button"
    class="cs-layers-peek cs-icon-button"
    :aria-label="t('showLayers')"
    :title="t('showLayers')"
    @click="emit('toggle')"
  >
    <UiIcon name="layers" />
  </button>
  <aside v-else class="cs-layers-panel" aria-label="Layers">
    <header>
      <strong>{{ t('layers') }}</strong
      ><button
        type="button"
        class="cs-icon-button"
        :aria-label="t('hideLayers')"
        :title="t('hideLayers')"
        @click="emit('toggle')"
      >
        <UiIcon name="close" />
      </button>
    </header>
    <p v-if="layers.length === 0" class="cs-layers-empty">
      {{ t('layersEmpty') }}
    </p>
    <div v-else class="cs-layers-list" role="listbox" :aria-label="t('layers')">
      <div
        v-for="layer in layers"
        :key="layer.id"
        class="cs-layer-row"
        :data-layer-id="layer.id"
        draggable="true"
        :class="{
          'is-selected':
            selectedLayerIds?.includes(layer.id) ??
            layer.id === selectedLayerId,
        }"
        role="option"
        :aria-selected="
          selectedLayerIds?.includes(layer.id) ?? layer.id === selectedLayerId
        "
        @dragstart="startReorder(layer.id)"
        @dragover.prevent
        @drop="dropReorder(layer.id)"
        @dragend="clearReorder"
      >
        <button
          type="button"
          class="cs-layer-select"
          @click="
            emit(
              'select',
              layer.id,
              $event.metaKey || $event.ctrlKey,
              $event.shiftKey,
            )
          "
        >
          <UiIcon :name="layer.icon" /><span>{{ layer.name }}</span>
        </button>
        <button
          type="button"
          class="cs-layer-action"
          :aria-label="layer.visible ? t('hideLayers') : t('showLayers')"
          @click.stop="emit('visibility', layer.id)"
        >
          <UiIcon :name="layer.visible ? 'eye' : 'eyeOff'" />
        </button>
        <button
          type="button"
          class="cs-layer-action"
          :aria-label="layer.locked ? t('unlockLayer') : t('lockLayer')"
          @click.stop="emit('lock', layer.id)"
        >
          <UiIcon :name="layer.locked ? 'lock' : 'unlock'" />
        </button>
        <div class="cs-layer-properties">
          <label>
            <span>{{ t('opacity') }}</span>
            <input
              type="range"
              min="0"
              max="100"
              :value="Math.round(layer.opacity * 100)"
              :disabled="layer.locked"
              @input="
                emit(
                  'opacity',
                  layer.id,
                  Number(($event.target as HTMLInputElement).value) / 100,
                )
              "
            />
          </label>
          <label>
            <span>{{ t('rotation') }}</span>
            <input
              type="number"
              min="-360"
              max="360"
              step="1"
              :value="Math.round(layer.rotation)"
              :disabled="layer.locked"
              @change="
                emit(
                  'rotation',
                  layer.id,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
          </label>
          <button
            type="button"
            class="cs-layer-order"
            :aria-label="t('moveLayerUp')"
            :title="t('moveLayerUp')"
            :disabled="layer.locked"
            @click="emit('reorder', layer.id, 'up')"
          >
            ↑
          </button>
          <button
            type="button"
            class="cs-layer-order"
            :aria-label="t('moveLayerDown')"
            :title="t('moveLayerDown')"
            :disabled="layer.locked"
            @click="emit('reorder', layer.id, 'down')"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
