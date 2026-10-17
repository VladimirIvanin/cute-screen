<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import { EditorPopover } from '@cute-screen/editor-vue'
import type {
  CleanupPlan,
  HistoryCursor,
  RecentCapture,
  StorageReport,
} from '../generated/desktop-ipc'
import { describeError } from '@cute-screen/editor-vue'
import {
  historyBytes,
  historyRequest,
  type HistoryBridge,
} from './bridge'
import { HistoryPreviews } from './previews'
import HistoryThumbnail from './HistoryThumbnail.vue'
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
const scrollTop = ref(0)
let trigger: HTMLButtonElement | undefined
const list = ref<HTMLElement>()
const menuId = ref<string>()
const previewVersion = ref(0)
const previews = new HistoryPreviews(props.bridge)
const ru = computed(() => props.locale === 'ru')
const startRow = computed(() => Math.max(0, Math.floor(scrollTop.value / 104) - 1))
const visible = computed(() => items.value.slice(startRow.value * 3, (startRow.value + 6) * 3))
const totalHeight = computed(() => Math.ceil(items.value.length / 3) * 104)
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
  menuId.value = undefined
  plan.value = undefined
  retryCapture.value = undefined
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
    ) trigger?.focus()
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
  const visibility = visibilityId
  menuId.value = undefined
  try {
    await props.bridge.request({ kind: 'protect', captureId: item.captureId, protected: !item.protected })
    if (visibility !== visibilityId || !opened.value) return
    await refresh()
    await nextTick()
    if (visibility !== visibilityId || !opened.value) return
    const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('.cs-history-capture') ?? [])]
    buttons.find((button) => button.dataset.historyId === item.captureId)?.focus()
  } catch (cause) {
    error.value = describeError(cause, 'Unable to change protection')
  }
}
async function previewDelete(item: RecentCapture): Promise<void> {
  menuId.value = undefined
  await previews.cancel()
  error.value = undefined
  try {
    if (item.captureId === props.activeId) {
      const next = items.value.find((entry) => entry.captureId !== item.captureId)
      if (!(await props.openCapture(next?.captureId ?? null))) return
    }
    plan.value = (await historyRequest(props.bridge, { kind: 'preview', captureIds: [item.captureId], includeLegacy: false, clearCache: false }, 'plan')).plan
  } catch (cause) {
    error.value = describeError(cause, 'Unable to prepare deletion')
  }
}
async function commitDelete(): Promise<void> {
  if (!plan.value) return
  loading.value = true
  try {
    await props.bridge.request({ kind: 'commit', token: plan.value.token })
    plan.value = undefined
  } catch (cause) {
    plan.value = undefined
    error.value = describeError(cause, 'Review deletion again')
    return
  } finally {
    loading.value = false
  }
  await refresh()
}
function onScroll(event: Event): void {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  if (cursor.value && target.scrollHeight - target.scrollTop - target.clientHeight < 208) void refresh(true)
}
async function onKey(event: KeyboardEvent): Promise<void> {
  event.stopPropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    await show(false)
    return
  }
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[event.key]
  if (!step || !(event.target instanceof HTMLElement)) return
  const id = event.target.closest<HTMLElement>('[data-history-id]')?.dataset.historyId
  const index = items.value.findIndex((item) => item.captureId === id)
  if (index < 0) return
  event.preventDefault()
  const target = Math.min(items.value.length - 1, Math.max(0, index + step))
  const row = Math.floor(target / 3)
  if (list.value) list.value.scrollTop = Math.max(0, (row - 1) * 104)
  scrollTop.value = list.value?.scrollTop ?? 0
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-history-index="${target}"]`)?.focus()
}
function date(item: RecentCapture): string {
  return new Intl.DateTimeFormat(props.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.capturedAt)
}
function toggle(event: MouseEvent): void {
  trigger = event.currentTarget as HTMLButtonElement
  void show(!opened.value)
}
function onWindowKey(event: KeyboardEvent): void {
  if (!opened.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  void show(false)
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
    @clickoutside="show(false, false)"
  >
    <template #trigger>
      <button
        class="cs-filmstrip cs-history-trigger"
        :aria-expanded="opened"
        aria-haspopup="dialog"
        :disabled="busy"
        @click="toggle"
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
      :aria-label="ru ? 'История снимков' : 'Capture history'"
      @keydown="onKey"
    >
      <header><strong>{{ ru ? 'История' : 'History' }}</strong><button :aria-label="ru ? 'Закрыть' : 'Close'" @click="show(false)">×</button></header>
      <div
        v-if="error || maintenanceError"
        class="cs-history-message"
        role="alert"
      >
        {{ error || maintenanceError }} <button @click="retry">{{ ru ? 'Повторить' : 'Retry' }}</button>
      </div>
      <div v-if="plan" class="cs-history-message">
        <p>{{ ru ? 'Удалить снимок и его аннотации?' : 'Delete capture and its annotations?' }}</p>
        <p>{{ historyBytes(plan.reclaimableBytes, locale) }} · {{ ru ? 'Восстановление недоступно' : 'Cannot be undone' }}</p>
        <button
          :disabled="loading"
          class="cs-history-danger"
          @click="commitDelete"
        >
          {{ ru ? 'Удалить' : 'Delete' }}
        </button>
        <button :disabled="loading" @click="plan = undefined">{{ ru ? 'Отмена' : 'Cancel' }}</button>
      </div>
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
          <div class="cs-history-grid" :style="{ transform: `translateY(${startRow * 104}px)` }">
            <div
              v-for="(item, index) in visible"
              :key="`${item.captureId}:${item.revision}:${previewVersion}`"
              class="cs-history-card"
            >
              <button
                :data-history-id="item.captureId"
                :data-history-index="startRow * 3 + index"
                class="cs-history-capture"
                :class="{ 'is-current': item.captureId === activeId }"
                :aria-current="item.captureId === activeId ? 'true' : undefined"
                :aria-label="`${date(item)}${item.protected ? (ru ? ', защищён' : ', protected') : ''}`"
                :title="`${new Date(item.capturedAt).toLocaleString(locale)} · ${item.width} × ${item.height}`"
                :disabled="busy"
                @click="select(item.captureId)"
              >
                <HistoryThumbnail
                  :item="item"
                  :previews="previews"
                  :unavailable="ru ? 'Миниатюра недоступна' : 'Preview unavailable'"
                />
                <small>{{ date(item) }} <span v-if="item.protected" aria-hidden="true">◆</span></small>
              </button>
              <button
                class="cs-history-more"
                :aria-label="ru ? 'Действия со снимком' : 'Capture actions'"
                :aria-expanded="menuId === item.captureId"
                @click="menuId = menuId === item.captureId ? undefined : item.captureId"
              >
                ⋯
              </button>
              <div v-if="menuId === item.captureId" class="cs-history-card-menu">
                <button @click="protect(item)">{{ item.protected ? (ru ? 'Снять защиту' : 'Remove protection') : (ru ? 'Защитить от автоочистки' : 'Protect from cleanup') }}</button>
                <button @click="previewDelete(item)">{{ ru ? 'Удалить…' : 'Delete…' }}</button>
              </div>
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
        <button @click="bridge.settings().catch((cause: unknown) => { error = describeError(cause, 'Unable to open settings') })">{{ ru ? 'Хранение…' : 'Storage…' }}</button>
      </footer>
    </section>
  </EditorPopover>
</template>
