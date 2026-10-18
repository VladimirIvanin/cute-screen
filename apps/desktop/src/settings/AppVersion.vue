<script setup lang="ts">
import {
  onMounted,
  ref,
} from 'vue'
import { readAppVersion } from '../platform/tauri/app-version-adapter'
import type { SettingsStrings } from './labels'

defineProps<{ labels: SettingsStrings }>()
const version = ref<string>()
const failed = ref(false)
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    version.value = await readAppVersion()
  } catch (error) {
    failed.value = true
    console.error('Could not read application version', error)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="cs-settings-version" :aria-busy="loading">
    <p role="status">
      {{ failed ? labels.versionUnavailable : `${labels.version} ${version ?? '…'}` }}
    </p>
    <button
      v-if="failed"
      :disabled="loading"
      @click="load"
    >
      {{ labels.retry }}
    </button>
  </div>
</template>
