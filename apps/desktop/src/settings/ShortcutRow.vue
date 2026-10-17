<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
  watch,
} from 'vue'
import type { ShortcutEntryV1 } from '../generated/desktop-ipc'
import {
  actionLabel,
  displayTrigger,
  statusLabel,
  type SettingsLocale,
  type SettingsStrings,
} from './labels'
import type { SettingsState } from './use-settings'
import ShortcutActions from './ShortcutActions.vue'

const props = defineProps<{
  entry: ShortcutEntryV1
  locale: SettingsLocale
  labels: SettingsStrings
  state: SettingsState
}>()
const emit = defineEmits<{ cancel: [] }>()
const recorder = ref<HTMLElement>()
const name = computed(() => actionLabel(props.entry.action, props.locale))
const editing = computed(() => props.state.editing.value === props.entry.action)
const macos = computed(() => props.state.snapshot.value?.platform === 'macos')
const manual = computed(() => props.state.snapshot.value?.backend === 'manual')
const portal = computed(() => props.state.snapshot.value?.backend === 'portal')
const systemEdit = computed(() => portal.value && !!props.entry.display)
const probe = computed(() => props.state.probe.value)
const busy = computed(() => props.state.busy.value)
const canSave = computed(() => !busy.value && !props.state.recording.value && !!props.state.trigger.value &&
  ['available', 'unknown'].includes(probe.value) && !props.state.recordError.value)
const rowError = computed(() => props.state.errorAction.value === props.entry.action ? props.state.error.value : '')
const editLabel = computed(() => {
  if (systemEdit.value) return props.labels.systemEdit
  return props.entry.display ? props.labels.edit : props.labels.assign
})
const editName = computed(() => {
  if (systemEdit.value) return props.labels.systemEdit
  return props.entry.display ? props.labels.editName : props.labels.assignName
})
const probeLabel = computed(() => {
  const conflict = props.state.conflictAction.value
  if (conflict) return `${props.labels.conflictWith}: ${actionLabel(conflict, props.locale)}`
  return props.labels[probe.value as 'available' | 'unknown' | 'occupied' | 'assigned' | 'checking' | 'unchanged'] ?? ''
})

watch(() => editing.value && props.state.recording.value, async (active) => {
  if (active) {
    await nextTick()
    recorder.value?.focus()
    recorder.value?.closest('.cs-shortcut-row')?.scrollIntoView?.({ block: 'nearest' })
  }
})
</script>

<template>
  <div
    class="cs-shortcut-row"
    :class="{ 'is-editing': editing }"
    :data-action="entry.action"
  >
    <div class="cs-shortcut-description">
      <strong :id="`action-${entry.action}`">{{ name }}</strong>
      <span class="cs-settings-muted" :data-status="entry.status">{{ statusLabel(entry.status, locale) }}</span>
      <span v-if="!entry.supported" class="cs-settings-muted">{{ labels.unavailable }}</span>
    </div>
    <div v-if="!editing" class="cs-shortcut-controls">
      <kbd v-if="entry.display">{{ displayTrigger(entry.display, macos) }}</kbd>
      <button
        :disabled="busy || !entry.supported || manual || (systemEdit && !state.snapshot.value?.canConfigure)"
        :aria-label="`${editName}: ${name}`"
        :data-edit="entry.action"
        @click="state.edit(entry.action)"
      >
        {{ editLabel }}
      </button>
      <ShortcutActions
        v-if="entry.display && entry.supported && !portal"
        :name="name"
        :labels="labels"
        :busy="busy"
        :manual="manual"
        @test="state.test(entry.action)"
        @remove="state.assign(entry.action, null)"
      />
    </div>
    <div v-else class="cs-shortcut-inline-editor">
      <div
        ref="recorder"
        class="cs-record-shortcut"
        :class="{ 'is-recording': state.recording.value }"
        tabindex="-1"
        role="group"
        :aria-labelledby="`action-${entry.action}`"
        :aria-describedby="`record-${entry.action} help-${entry.action}`"
      >
        <strong v-if="state.recording.value" :id="`record-${entry.action}`">{{ labels.recording }}</strong>
        <kbd v-else-if="state.trigger.value" :id="`record-${entry.action}`">{{ displayTrigger(state.trigger.value, macos) }}</kbd>
        <span v-else :id="`record-${entry.action}`">{{ labels.record }}</span>
        <span v-if="state.recording.value" class="cs-settings-muted">{{ labels.escape }}</span>
      </div>
      <div class="cs-settings-row-actions">
        <button
          v-if="!state.recording.value"
          class="cs-settings-primary"
          :disabled="!canSave"
          @click="state.assign(entry.action, state.trigger.value)"
        >
          {{ busy ? labels.saving : portal ? labels.systemContinue : labels.apply }}
        </button>
        <button
          v-if="!state.recording.value"
          :disabled="busy"
          @click="state.startRecording"
        >
          {{ labels.restart }}
        </button>
        <button :disabled="busy" @click="emit('cancel')">{{ labels.cancel }}</button>
      </div>
      <p :id="`help-${entry.action}`" class="cs-settings-muted">{{ labels.recordHelp }}</p>
      <p v-if="state.invalid.value" role="status">{{ labels.invalid }}</p>
      <p
        v-if="probeLabel"
        role="status"
        :class="{ 'cs-settings-error': probe === 'occupied' || probe === 'assigned' }"
      >
        {{ probeLabel }}
      </p>
      <p
        v-if="state.recordError.value"
        class="cs-settings-error"
        role="alert"
      >
        {{ state.recordError.value }}
      </p>
      <p v-if="state.trigger.value.includes('PRINT')" class="cs-settings-muted">{{ labels.print }}</p>
    </div>
    <div
      v-if="entry.message || rowError"
      class="cs-shortcut-feedback cs-settings-error"
      role="alert"
    >
      {{ rowError || entry.message }}
    </div>
    <div
      v-if="state.snapshot.value?.pendingAction === entry.action"
      class="cs-shortcut-feedback"
      role="status"
    >
      <p>{{ labels.pending }}</p><button :disabled="busy" @click="state.cancel">{{ labels.cancel }}</button>
    </div>
    <p
      v-if="state.testing.value === entry.action"
      class="cs-shortcut-feedback"
      role="status"
    >
      {{ labels.testing }}
    </p>
    <p
      v-if="state.testPassed.value === entry.action"
      class="cs-shortcut-feedback"
      role="status"
    >
      {{ labels.tested }}
    </p>
    <p
      v-if="state.testExpired.value === entry.action || state.verificationExpired.value === entry.action"
      class="cs-shortcut-feedback"
      role="status"
    >
      {{ labels.timeout }}
    </p>
    <details v-if="manual" class="cs-shortcut-command"><summary>CLI</summary><code>{{ entry.command }}</code></details>
  </div>
</template>
