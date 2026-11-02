<script setup lang="ts">
import {
  onMounted,
  ref,
} from 'vue'
import {
  openUpdatePage,
  readAppVersion,
} from '../platform/tauri/app-version-adapter'
import type { SettingsStrings } from './labels'

const props = defineProps<{ labels: SettingsStrings }>()
const busy = ref(false)
const failed = ref(false)
const version = ref<string>()
const versionFailed = ref(false)
async function loadVersion(): Promise<void> {
  versionFailed.value = false
  try {
    version.value = await readAppVersion()
  } catch (error) {
    versionFailed.value = true
    console.error('Could not read application version', error)
  }
}
onMounted(loadVersion)
async function open(): Promise<void> {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    await openUpdatePage(props.labels.checkUpdates === 'Check for updates')
  } catch (error) {
    failed.value = true
    console.error('Could not open update page', error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="cs-settings-version" :aria-busy="busy">
    <p class="cs-settings-version-number" role="status">{{ versionFailed ? labels.versionUnavailable : `${labels.version} ${version ?? '…'}` }}</p>
    <button
      v-if="versionFailed"
      type="button"
      @click="loadVersion"
    >
      {{ labels.retry }}
    </button>
    <button
      type="button"
      :disabled="busy"
      @click="open"
    >
      {{ props.labels.checkUpdates }}
    </button>
    <p v-if="failed" role="alert">{{ props.labels.updateUnavailable }}</p>
  </div>
</template>
