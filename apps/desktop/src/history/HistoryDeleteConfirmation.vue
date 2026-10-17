<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
} from 'vue'
import type { CleanupPlan } from '../generated/desktop-ipc'
import { historyBytes } from './bridge'

const props = defineProps<{
  plan: CleanupPlan
  locale: 'ru' | 'en'
  clearAll: boolean
  loading: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ cancel: []; confirm: [] }>()
const ru = computed(() => props.locale === 'ru')
const cancelButton = ref<HTMLButtonElement>()
onMounted(() => cancelButton.value?.focus())
function onKey(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key !== 'Tab') return
  const root = event.currentTarget as HTMLElement
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  if (!buttons.length) {
    event.preventDefault()
    return
  }
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && event.target === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault()
    first?.focus()
  }
}
</script>
<template>
  <div
    class="cs-history-message cs-history-delete-confirm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="history-confirm-title"
    aria-describedby="history-confirm-description"
    :aria-busy="loading"
    @keydown="onKey"
  >
    <strong id="history-confirm-title">{{ clearAll ? (ru ? 'Очистить историю?' : 'Clear history?') : (ru ? 'Удалить снимок?' : 'Delete capture?') }}</strong>
    <div id="history-confirm-description">
      <p>{{ ru ? `Снимков с аннотациями к удалению: ${plan.captureIds.length}.` : `Captures and annotations to delete: ${plan.captureIds.length}.` }}</p>
      <p v-if="clearAll">{{ ru ? 'Защищённые снимки и текущий открытый документ останутся. Остальные будут удалены, включая старые снимки.' : 'Protected captures and the current open document will be kept. All others, including older captures, will be deleted.' }}</p>
      <p>{{ historyBytes(plan.reclaimableBytes, locale) }} · {{ ru ? 'Восстановление недоступно' : 'Cannot be undone' }}</p>
    </div>
    <div class="cs-history-confirm-actions">
      <button
        ref="cancelButton"
        class="cs-history-cancel"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ ru ? 'Отмена' : 'Cancel' }}
      </button>
      <button
        :disabled="loading || busy || !plan.captureIds.length"
        class="cs-history-danger"
        @click="emit('confirm')"
      >
        {{ loading ? (ru ? 'Удаление…' : 'Deleting…') : clearAll ? (ru ? 'Очистить историю' : 'Clear history') : (ru ? 'Удалить' : 'Delete') }}
      </button>
    </div>
  </div>
</template>
