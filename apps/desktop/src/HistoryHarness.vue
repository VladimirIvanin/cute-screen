<script setup lang="ts">
import { ref } from 'vue'
import { EditorShell } from '@cute-screen/editor-vue'
import HistoryPopover from './history/HistoryPopover.vue'
import HistorySettings from './history/HistorySettings.vue'
import { createHistoryHarnessBridge } from './history/browser-harness'
const bridge = createHistoryHarnessBridge()
const active = ref('capture-0')
const settings = new URLSearchParams(location.search).get('historySettings') === '1'
const locale = new URLSearchParams(location.search).get('locale') === 'ru' ? 'ru' : 'en'
</script>
<template>
  <HistorySettings
    v-if="settings"
    :bridge="bridge"
    :locale="locale"
    style="max-width: 600px; margin: 24px auto"
  />
  <EditorShell v-else fixture="ready">
    <template #history>
      <HistoryPopover
        :bridge="bridge"
        :active-id="active"
        :locale="locale"
        :prepare="async () => undefined"
        :open-capture="async (id) => { active = id ?? ''; return true }"
      />
    </template>
  </EditorShell>
</template>
