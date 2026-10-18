<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import {
  EditorPopover,
  describeError,
  UiIcon,
} from '@cute-screen/editor-vue'
import type {
  CleanupPlan,
  HistoryCursor,
  RecentCapture,
  StorageReport,
} from '../generated/desktop-ipc'
import {
  historyBytes,
  historyRequest,
  previewHistoryClear,
  type HistoryBridge,
} from './bridge'
import { HistoryPreviews } from './previews'
import HistoryThumbnail from './HistoryThumbnail.vue'
import HistoryDeleteConfirmation from './HistoryDeleteConfirmation.vue'
import './history.css'

const props = defineProps<{
  bridge: HistoryBridge
  activeId?: string | undefined
  locale: 'ru' | 'en'
  openCapture: (id: string | null) => Promise<boolean>
  prepare: () => Promise<void>
  cancelNavigation?: () => void
  maintenanceError?: string | undefined
  busy?: boolean
}>()
const emit = defineEmits<{ retryMaintenance: [] }>()
const retentionDays = ref(7)
const opened = ref(false)
const loading = ref(false)
const error = ref<string>()
const retryCapture = ref<string>()
const items = shallowRef<readonly RecentCapture[]>([])
const cursor = shallowRef<HistoryCursor | null>(null)
const report = shallowRef<StorageReport>()
const plan = shallowRef<CleanupPlan>()
const columns = 2
const rowHeight = 140
const scrollTop = ref(0)
const clearButton = ref<HTMLButtonElement>()
const clearAll = ref(false)
const notice = ref<string>()
let deleteId: string | undefined
const trigger = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()
const previewVersion = ref(0)
const previews = new HistoryPreviews(props.bridge)
const ru = computed(() => props.locale === 'ru')
const startRow = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight) - 1))
const visible = computed(() => items.value.slice(startRow.value * columns, (startRow.value + 5) * columns))
const totalHeight = computed(() => Math.ceil(items.value.length / columns) * rowHeight)
let requestId = 0
let visibilityId = 0
let disposed = false

async function refresh(append = false): Promise<void> {
  if (loading.value || disposed) return
  const id = ++requestId
  loading.value = true
  error.value = undefined
  try {
    const { page } = await historyRequest(props.bridge, { kind: 'list', cursor: append ? cursor.value : null }, 'page')
    if (disposed || id !== requestId) return
    const known = new Set(items.value.map((item) => item.captureId))
    items.value = append ? [...items.value, ...page.items.filter((item) => !known.has(item.captureId))] : page.items
    cursor.value = page.nextCursor
    retentionDays.value = (await historyRequest(props.bridge, { kind: 'policy' }, 'policy')).policy.days
    const storage = (await historyRequest(props.bridge, { kind: 'report' }, 'report')).report
    if (!disposed && id === requestId) report.value = storage
  } catch (cause) {
    error.value = describeError(cause, ru.value ? 'Не удалось загрузить историю' : 'Unable to load history')
  } finally {
    if (id === requestId) loading.value = false
  }
}
async function show(
  value: boolean,
  restoreFocus = true,
): Promise<void> {
  const visibility = ++visibilityId
  opened.value = value
  plan.value = undefined
  retryCapture.value = undefined
  notice.value = undefined
  if (value) {
    scrollTop.value = 0
    loading.value = true
    try {
      await props.prepare()
      if (visibility !== visibilityId || !opened.value) return
      loading.value = false
      await refresh()
      await nextTick()
      if (visibility !== visibilityId || !opened.value) return
      list.value?.querySelector<HTMLButtonElement>('.cs-history-capture')?.focus()
    } catch (cause) {
      if (visibility === visibilityId) {
        loading.value = false
        error.value = describeError(cause, 'Unable to save document')
      }
    }
  } else {
    props.cancelNavigation?.()
    requestId += 1
    loading.value = false
    await previews.cancel()
    await nextTick()
    if (
      restoreFocus &&
      visibility === visibilityId &&
      !opened.value
    ) trigger.value?.focus()
  }
}
async function select(id: string): Promise<void> {
  if (loading.value || props.busy) return
  error.value = undefined
  await previews.cancel()
  try {
    if (await props.openCapture(id)) await show(false)
  } catch (cause) {
    error.value = describeError(cause, 'Unable to open capture')
    retryCapture.value = id
    previewVersion.value += 1
  }
}
async function retry(): Promise<void> {
  if (retryCapture.value) await select(retryCapture.value)
  else if (props.maintenanceError) emit('retryMaintenance')
  else await refresh()
}
async function protect(item: RecentCapture): Promise<void> {
  if (loading.value || props.busy) return
  const visibility = visibilityId
  loading.value = true
  error.value = undefined
  try {
    await props.bridge.request({ kind: 'protect', captureId: item.captureId, protected: !item.protected })
    if (visibility !== visibilityId || !opened.value) return
    items.value = items.value.map((entry) => entry.captureId === item.captureId
      ? { ...entry, protected: !item.protected }
      : entry)
    loading.value = false
    await nextTick()
    if (visibility !== visibilityId || !opened.value) return
    const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('.cs-history-capture') ?? [])]
    buttons.find((button) => button.dataset.historyId === item.captureId)?.focus()
  } catch (cause) {
    error.value = describeError(cause, 'Unable to change protection')
  } finally {
    if (visibility === visibilityId) loading.value = false
  }
}
async function previewDelete(item: RecentCapture): Promise<void> {
  if (loading.value || props.busy) return
  const visibility = visibilityId
  loading.value = true
  clearAll.value = false
  deleteId = item.captureId
  await previews.cancel()
  error.value = undefined
  try {
    if (item.captureId === props.activeId) {
      const next = items.value.find((entry) => entry.captureId !== item.captureId)
      if (!(await props.openCapture(next?.captureId ?? null))) return
    }
    const result = await historyRequest(props.bridge, { kind: 'preview', captureIds: [item.captureId], includeLegacy: false, clearCache: false }, 'plan')
    if (visibility !== visibilityId || !opened.value) return
    plan.value = result.plan
    loading.value = false
  } catch (cause) {
    if (visibility === visibilityId) error.value = describeError(cause, 'Unable to prepare deletion')
  } finally {
    if (visibility === visibilityId) loading.value = false
  }
}
async function cancelDelete(): Promise<void> {
  plan.value = undefined
  await nextTick()
  if (clearAll.value) clearButton.value?.focus()
  else {
    const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('.cs-history-delete') ?? [])]
    buttons.find((button) => button.dataset.historyDeleteId === deleteId)?.focus()
  }
}
async function previewClear(): Promise<void> {
  if (loading.value || props.busy) return
  const visibility = visibilityId
  loading.value = true
  error.value = undefined
  notice.value = undefined
  clearAll.value = true
  try {
    await previews.cancel()
    const reviewed = await previewHistoryClear(
      props.bridge,
      props.activeId,
      () => visibility === visibilityId && opened.value,
    )
    if (!reviewed) return
    plan.value = reviewed
    loading.value = false
  } catch (cause) {
    if (visibility === visibilityId) error.value = describeError(cause, ru.value ? 'Не удалось подготовить очистку' : 'Unable to prepare cleanup')
  } finally {
    if (visibility === visibilityId) loading.value = false
  }
}
async function commitDelete(): Promise<void> {
  if (
    !plan.value ||
    loading.value ||
    props.busy
  ) return
  const visibility = visibilityId
  loading.value = true
  error.value = undefined
  try {
    const result = await historyRequest(props.bridge, { kind: 'commit', token: plan.value.token }, 'cleaned')
    if (visibility !== visibilityId || !opened.value) return
    plan.value = undefined
    report.value = result.report
    notice.value = `${ru.value ? 'Удалено снимков:' : 'Captures deleted:'} ${result.removedCount}`
    scrollTop.value = 0
  } catch (cause) {
    if (visibility !== visibilityId) return
    plan.value = undefined
    error.value = describeError(cause, ru.value ? 'Подготовьте удаление повторно' : 'Review deletion again')
    await nextTick()
    clearButton.value?.focus()
    return
  } finally {
    if (visibility === visibilityId) loading.value = false
  }
  if (visibility !== visibilityId || !opened.value) return
  await refresh()
  await nextTick()
  clearButton.value?.focus()
}
function onScroll(event: Event): void {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  if (cursor.value && target.scrollHeight - target.scrollTop - target.clientHeight < rowHeight * 2) void refresh(true)
}
async function onKey(event: KeyboardEvent): Promise<void> {
  event.stopPropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    await escape()
    return
  }
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[event.key]
  if (!step || !(event.target instanceof HTMLElement)) return
  const id = event.target.closest<HTMLElement>('[data-history-id]')?.dataset.historyId
  const index = items.value.findIndex((item) => item.captureId === id)
  if (index < 0) return
  event.preventDefault()
  const target = Math.min(items.value.length - 1, Math.max(0, index + step))
  const row = Math.floor(target / columns)
  if (list.value) list.value.scrollTop = Math.max(0, (row - 1) * rowHeight)
  scrollTop.value = list.value?.scrollTop ?? 0
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-history-index="${target}"]`)?.focus()
}
function date(item: RecentCapture): string {
  return new Intl.DateTimeFormat(props.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.capturedAt)
}
async function escape(): Promise<void> {
  if (loading.value && plan.value) return
  if (plan.value) await cancelDelete()
  else await show(false)
}
function onWindowKey(event: KeyboardEvent): void {
  if (!opened.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  void escape()
}
onMounted(() => window.addEventListener('keydown', onWindowKey, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKey, true)
  disposed = true
  requestId += 1
  previews.dispose()
})
</script>
<template>
  <EditorPopover
    :show="opened"
    @clickoutside="!plan && !loading && show(false, false)"
  >
    <template #trigger>
      <button
        ref="trigger"
        class="cs-filmstrip cs-history-trigger"
        :aria-expanded="opened"
        aria-haspopup="dialog"
        :disabled="busy"
        @click="!loading && !plan && show(!opened)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        ><path d="M3 11a9 9 0 1 1 2.7 7M3 5v6h6M12 7v5l3 2" /></svg>
        {{ ru ? 'История' : 'History' }}
        <span
          v-if="maintenanceError"
          :title="maintenanceError"
          :aria-label="ru ? 'Не удалось очистить историю' : 'History cleanup failed'"
        >!</span>
      </button>
    </template>
    <section
      class="cs-history-popover"
      role="dialog"
      :aria-busy="loading"
      :aria-label="ru ? 'История снимков' : 'Capture history'"
      @keydown="onKey"
    >
      <header>
        <strong>{{ ru ? 'История' : 'History' }}</strong>
        <div class="cs-history-header-actions">
          <button
            ref="clearButton"
            class="cs-history-clear cs-history-danger"
            :disabled="loading || busy || !items.length || !!plan"
            @click="previewClear"
          >
            {{ ru ? 'Очистить' : 'Clear history' }}
          </button>
          <button
            class="cs-history-close"
            :disabled="loading"
            :aria-label="ru ? 'Закрыть' : 'Close'"
            @click="show(false)"
          >
            <UiIcon name="close" />
          </button>
        </div>
      </header>
      <p
        v-if="notice"
        class="cs-history-notice"
        role="status"
      >
        {{ notice }}
      </p>
      <div
        v-if="error || maintenanceError"
        class="cs-history-message"
        role="alert"
      >
        {{ error || maintenanceError }} <button @click="retry">{{ ru ? 'Повторить' : 'Retry' }}</button>
      </div>
      <HistoryDeleteConfirmation
        v-if="plan"
        :plan="plan"
        :locale="locale"
        :clear-all="clearAll"
        :loading="loading"
        :busy="busy"
        @cancel="cancelDelete"
        @confirm="commitDelete"
      />
      <div
        v-else
        ref="list"
        class="cs-history-scroll"
        :aria-busy="loading"
        @scroll="onScroll"
      >
        <p
          v-if="!items.length"
          class="cs-history-message"
          role="status"
        >
          {{ loading ? (ru ? 'Загрузка…' : 'Loading…') : (ru ? 'Сделайте снимок — он появится здесь' : 'Take a capture to see it here') }}
        </p>
        <div class="cs-history-virtual" :style="{ height: `${totalHeight}px` }">
          <div class="cs-history-grid" :style="{ transform: `translateY(${startRow * rowHeight}px)` }">
            <div
              v-for="(item, index) in visible"
              :key="`${item.captureId}:${item.revision}:${previewVersion}`"
              class="cs-history-card"
            >
              <button
                :data-history-id="item.captureId"
                :data-history-index="startRow * columns + index"
                class="cs-history-capture"
                :class="{ 'is-current': item.captureId === activeId }"
                :aria-current="item.captureId === activeId ? 'true' : undefined"
                :aria-label="`${date(item)}${item.protected ? (ru ? ', защищён' : ', protected') : ''}`"
                :title="`${new Date(item.capturedAt).toLocaleString(locale)} · ${item.width} × ${item.height}`"
                :disabled="busy || loading"
                @click="select(item.captureId)"
              >
                <HistoryThumbnail
                  :item="item"
                  :previews="previews"
                  :unavailable="ru ? 'Миниатюра недоступна' : 'Preview unavailable'"
                />
                <small>{{ date(item) }}</small>
              </button>
              <button
                class="cs-history-delete cs-history-overlay-action"
                :data-history-delete-id="item.captureId"
                :aria-label="ru ? 'Удалить снимок' : 'Delete capture'"
                :title="ru ? 'Удалить снимок…' : 'Delete capture…'"
                :disabled="loading || busy"
                @click="previewDelete(item)"
              >
                <UiIcon name="trash" />
              </button>
              <button
                class="cs-history-protect cs-history-overlay-action"
                :class="{ 'is-protected': item.protected }"
                :aria-pressed="item.protected"
                :aria-label="item.protected ? (ru ? 'Снять защиту' : 'Remove protection') : (ru ? 'Защитить от очистки' : 'Protect from cleanup')"
                :title="item.protected ? (ru ? 'Снять защиту' : 'Remove protection') : (ru ? 'Защитить от очистки' : 'Protect from cleanup')"
                :disabled="loading || busy"
                @click="protect(item)"
              >
                <UiIcon :name="item.protected ? 'lock' : 'unlock'" />
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="cursor"
          class="cs-history-load"
          :disabled="loading"
          @click="refresh(true)"
        >
          {{ ru ? 'Ещё' : 'More' }}
        </button>
      </div>
      <footer>
        <span v-if="report" :class="{ 'cs-history-warning': report.overLimit }">{{ historyBytes(report.totalBytes, locale) }}
          <small>{{ ru ? `Временная история · до ${retentionDays} дн.` : `Temporary history · up to ${retentionDays} days` }}</small><small v-if="report.overLimit">{{ ru ? 'Лимит превышен: проверьте защищённые снимки' : 'Over limit: review protected captures' }}</small></span>
        <button :disabled="loading || !!plan" @click="bridge.settings().catch((cause: unknown) => { error = describeError(cause, 'Unable to open settings') })">{{ ru ? 'Хранение' : 'Storage' }}</button>
      </footer>
    </section>
  </EditorPopover>
</template>
