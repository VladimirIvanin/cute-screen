<script setup lang="ts">
import { UiIcon } from '../icon'
import type { LayerSummary } from '../types'
defineProps<{
  layers: readonly LayerSummary[]
  open: boolean
  selectedLayerId?: string | undefined
  t: (key: 'layers' | 'layersEmpty' | 'hideLayers' | 'showLayers') => string
}>()
const emit = defineEmits<{ select: [id: string]; toggle: [] }>()
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
        ×
      </button>
    </header>
    <p v-if="layers.length === 0" class="cs-layers-empty">
      {{ t('layersEmpty') }}
    </p>
    <div v-else class="cs-layers-list" role="listbox" :aria-label="t('layers')">
      <button
        v-for="layer in layers"
        :key="layer.id"
        type="button"
        class="cs-layer-row"
        :class="{ 'is-selected': layer.id === selectedLayerId }"
        role="option"
        :aria-selected="layer.id === selectedLayerId"
        @click="emit('select', layer.id)"
      >
        <UiIcon :name="layer.icon" /><span>{{ layer.name }}</span
        ><UiIcon :name="layer.locked ? 'lock' : 'unlock'" />
      </button>
    </div>
  </aside>
</template>
