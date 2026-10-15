<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NInput, NSpin } from 'naive-ui'
import type {
  LibraryAdapter,
  LibraryCaptureRowV1,
  LibraryCleanupPlanV1,
  LibrarySeriesRowV1,
  LibraryStorageReportV1,
  SupportedLocale,
} from '../types'

const props = defineProps<{
  adapter: LibraryAdapter
  locale: SupportedLocale
}>()
const emit = defineEmits<{ close: [] }>()
const labels = computed(() =>
  props.locale === 'ru'
    ? {
        title: 'Библиотека',
        search: 'Поиск по названию',
        empty: 'Библиотека пуста',
        noResults: 'Ничего не найдено',
        retry: 'Повторить',
        loadMore: 'Показать ещё',
        storage: 'Хранилище',
        originals: 'Оригиналы',
        documents: 'Документы',
        cache: 'Миниатюры и кэш',
        clearCache: 'Очистить кэш',
        rename: 'Переименовать',
        remove: 'Удалить',
        cancel: 'Отмена',
        confirm: 'Удалить навсегда',
        preview: 'Необратимое удаление',
        protected: 'Активные данные защищены',
        close: 'Закрыть библиотеку',
        loading: 'Загружаем библиотеку…',
        bytes: 'Будет освобождено',
      }
    : {
        title: 'Library',
        search: 'Search by title',
        empty: 'Library is empty',
        noResults: 'No results',
        retry: 'Retry',
        loadMore: 'Load more',
        storage: 'Storage',
        originals: 'Originals',
        documents: 'Documents',
        cache: 'Thumbnails and cache',
        clearCache: 'Clear cache',
        rename: 'Rename',
        remove: 'Delete',
        cancel: 'Cancel',
        confirm: 'Delete permanently',
        preview: 'Permanent deletion',
        protected: 'Active data is protected',
        close: 'Close library',
        loading: 'Loading library…',
        bytes: 'Space to reclaim',
      },
)
const loading = ref(true)
const error = ref<string>()
const search = ref('')
const series = ref<readonly LibrarySeriesRowV1[]>([])
const seriesCursor = ref<string | null>(null)
const selectedSeriesId = ref<string>()
const captures = ref<readonly LibraryCaptureRowV1[]>([])
const captureCursor = ref<string | null>(null)
const selectedCaptureId = ref<string>()
const report = ref<LibraryStorageReportV1>()
const scrollTop = ref(0)
const captureViewport = ref<HTMLElement>()
const renameKind = ref<'series' | 'capture'>()
const renameValue = ref('')
const cleanup = ref<LibraryCleanupPlanV1>()
const confirming = ref(false)
let searchTimer: number | undefined
const rowHeight = 68
const overscan = 4
const visibleStart = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / rowHeight) - overscan),
)
const visibleEnd = computed(() =>
  Math.min(captures.value.length, visibleStart.value + 14 + overscan * 2),
)
const visibleCaptures = computed(() =>
  captures.value.slice(visibleStart.value, visibleEnd.value),
)

function query(cursor: string | null) {
  return {
    search: search.value.trim() || null,
    fromInclusive: null,
    toExclusive: null,
    cursor,
    limit: 50,
  }
}
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let amount = value / 1024
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit += 1
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[unit]}`
}
function displaySeries(row: LibrarySeriesRowV1): string {
  return (
    row.title ??
    `${props.locale === 'ru' ? 'Серия' : 'Series'} ${row.seriesId.slice(0, 8)}`
  )
}
function displayCapture(row: LibraryCaptureRowV1): string {
  return row.title ?? new Date(row.capturedAt).toLocaleString(props.locale)
}
async function loadSeries(append = false): Promise<void> {
  loading.value = true
  error.value = undefined
  try {
    const page = await props.adapter.listSeries(
      query(append ? seriesCursor.value : null),
    )
    series.value = append ? [...series.value, ...page.items] : page.items
    seriesCursor.value = page.nextCursor
    report.value = await props.adapter.storageReport()
    if (!append) {
      selectedSeriesId.value = series.value[0]?.seriesId
      await loadCaptures(false)
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}
async function loadCaptures(append = false): Promise<void> {
  const seriesId = selectedSeriesId.value
  if (!seriesId) {
    captures.value = []
    return
  }
  try {
    const page = await props.adapter.listCaptures(
      seriesId,
      query(append ? captureCursor.value : null),
    )
    captures.value = append ? [...captures.value, ...page.items] : page.items
    captureCursor.value = page.nextCursor
    if (!append) {
      selectedCaptureId.value = captures.value[0]?.captureId
      scrollTop.value = 0
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
async function selectSeries(id: string): Promise<void> {
  selectedSeriesId.value = id
  await loadCaptures(false)
}
function scheduleSearch(): void {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => void loadSeries(false), 220)
}
async function openCapture(id: string): Promise<void> {
  selectedCaptureId.value = id
  try {
    await props.adapter.openCapture(id)
    emit('close')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
function beginRename(kind: 'series' | 'capture'): void {
  const row =
    kind === 'series'
      ? series.value.find((item) => item.seriesId === selectedSeriesId.value)
      : captures.value.find(
          (item) => item.captureId === selectedCaptureId.value,
        )
  if (!row) return
  renameKind.value = kind
  renameValue.value = row.title ?? ''
  void nextTick(() =>
    document
      .querySelector<HTMLInputElement>('.cs-library-rename input')
      ?.focus(),
  )
}
async function commitRename(): Promise<void> {
  try {
    if (renameKind.value === 'series' && selectedSeriesId.value)
      await props.adapter.renameSeries(
        selectedSeriesId.value,
        renameValue.value,
      )
    if (renameKind.value === 'capture' && selectedCaptureId.value)
      await props.adapter.renameCapture(
        selectedCaptureId.value,
        renameValue.value,
      )
    renameKind.value = undefined
    await loadSeries(false)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
async function previewDelete(
  kind: 'series' | 'capture' | 'none',
  clearCache = false,
): Promise<void> {
  try {
    cleanup.value = await props.adapter.cleanupPlan({
      seriesIds:
        kind === 'series' && selectedSeriesId.value
          ? [selectedSeriesId.value]
          : [],
      captureIds:
        kind === 'capture' && selectedCaptureId.value
          ? [selectedCaptureId.value]
          : [],
      clearCache,
    })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}
async function executeCleanup(): Promise<void> {
  if (!cleanup.value) return
  confirming.value = true
  try {
    const result = await props.adapter.cleanupExecute(cleanup.value.token)
    report.value = result.report
    cleanup.value = undefined
    await loadSeries(false)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    confirming.value = false
  }
}
function onCaptureKeydown(event: KeyboardEvent): void {
  const current = Math.max(
    0,
    captures.value.findIndex(
      (row) => row.captureId === selectedCaptureId.value,
    ),
  )
  let target: number | undefined
  switch (event.key) {
    case 'ArrowDown':
      target = Math.min(captures.value.length - 1, current + 1)
      break
    case 'ArrowUp':
      target = Math.max(0, current - 1)
      break
    case 'Home':
      target = 0
      break
    case 'End':
      target = captures.value.length - 1
      break
    case 'Enter':
    case ' ':
      if (selectedCaptureId.value) void openCapture(selectedCaptureId.value)
      break
    case 'F2':
      beginRename('capture')
      break
    case 'Delete':
      void previewDelete('capture')
      break
    case 'Escape':
      emit('close')
      break
    default:
      return
  }
  event.preventDefault()
  if (target === undefined) return
  selectedCaptureId.value = captures.value[target]?.captureId
  captureViewport.value
    ?.querySelector<HTMLElement>(
      `[data-capture-id="${CSS.escape(selectedCaptureId.value ?? '')}"]`,
    )
    ?.focus()
}
onMounted(() => void loadSeries())
onBeforeUnmount(() => window.clearTimeout(searchTimer))
</script>

<template>
  <aside
    class="cs-library-panel"
    :aria-label="labels.title"
    @keydown.esc="emit('close')"
  >
    <header>
      <div>
        <strong>{{ labels.title }}</strong
        ><small v-if="report">{{ formatBytes(report.totalBytes) }}</small>
      </div>
      <NButton
        quaternary
        circle
        :aria-label="labels.close"
        @click="emit('close')"
        >×</NButton
      >
    </header>
    <NInput
      v-model:value="search"
      clearable
      :placeholder="labels.search"
      @update:value="scheduleSearch"
    />
    <div v-if="loading && !series.length" class="cs-library-state">
      <NSpin size="small" /> {{ labels.loading }}
    </div>
    <div v-else-if="error" class="cs-library-state is-error" role="alert">
      <span>{{ error }}</span
      ><NButton size="small" @click="loadSeries(false)">{{
        labels.retry
      }}</NButton>
    </div>
    <div v-else-if="!series.length" class="cs-library-state">
      {{ search ? labels.noResults : labels.empty }}
    </div>
    <template v-else>
      <section class="cs-library-series" aria-label="Series">
        <button
          v-for="row in series"
          :key="row.seriesId"
          type="button"
          :class="{ 'is-active': row.seriesId === selectedSeriesId }"
          @click="selectSeries(row.seriesId)"
          @dblclick="beginRename('series')"
        >
          <span
            ><strong>{{ displaySeries(row) }}</strong
            ><small
              >{{ row.captureCount }} ·
              {{ formatBytes(row.logicalBytes) }}</small
            ></span
          >
          <span aria-hidden="true">›</span>
        </button>
        <NButton
          v-if="seriesCursor"
          text
          size="small"
          @click="loadSeries(true)"
          >{{ labels.loadMore }}</NButton
        >
      </section>
      <div v-if="renameKind" class="cs-library-rename">
        <NInput
          v-model:value="renameValue"
          maxlength="120"
          @keyup.enter="commitRename"
          @keyup.esc="renameKind = undefined"
        /><NButton type="primary" @click="commitRename">OK</NButton
        ><NButton @click="renameKind = undefined">{{ labels.cancel }}</NButton>
      </div>
      <section
        ref="captureViewport"
        class="cs-library-captures"
        role="listbox"
        tabindex="0"
        aria-label="Captures"
        @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
        @keydown="onCaptureKeydown"
      >
        <div :style="{ height: `${captures.length * rowHeight}px` }">
          <button
            v-for="(row, offset) in visibleCaptures"
            :key="row.captureId"
            type="button"
            role="option"
            :aria-selected="row.captureId === selectedCaptureId"
            :data-capture-id="row.captureId"
            :class="{ 'is-active': row.captureId === selectedCaptureId }"
            :style="{ top: `${(visibleStart + offset) * rowHeight}px` }"
            @focus="selectedCaptureId = row.captureId"
            @dblclick="openCapture(row.captureId)"
          >
            <span
              class="cs-library-thumb"
              :data-state="row.thumbnailStatus"
              aria-hidden="true"
              >{{ row.thumbnailStatus === 'indexed' ? '▧' : '·' }}</span
            >
            <span
              ><strong>{{ displayCapture(row) }}</strong
              ><small
                >{{ row.width }}×{{ row.height }} ·
                {{ formatBytes(row.originalByteSize) }}</small
              ></span
            >
          </button>
        </div>
      </section>
      <NButton
        v-if="captureCursor"
        text
        size="small"
        @click="loadCaptures(true)"
        >{{ labels.loadMore }}</NButton
      >
      <div class="cs-library-actions">
        <NButton
          size="small"
          :disabled="!selectedCaptureId"
          @click="beginRename('capture')"
          >{{ labels.rename }}</NButton
        ><NButton
          size="small"
          :disabled="!selectedCaptureId"
          @click="previewDelete('capture')"
          >{{ labels.remove }}</NButton
        ><NButton
          size="small"
          :disabled="!selectedSeriesId"
          @click="previewDelete('series')"
          >{{ labels.remove }} series</NButton
        >
      </div>
    </template>
    <section v-if="report" class="cs-library-storage">
      <strong>{{ labels.storage }}</strong
      ><span
        >{{ labels.originals }}
        <b>{{ formatBytes(report.originalsBytes) }}</b></span
      ><span
        >{{ labels.documents }}
        <b>{{ formatBytes(report.editableDocumentsBytes) }}</b></span
      ><span
        >{{ labels.cache }}
        <b>{{ formatBytes(report.thumbnailCacheBytes) }}</b></span
      ><NButton
        size="small"
        :disabled="report.thumbnailCacheBytes === 0"
        @click="previewDelete('none', true)"
        >{{ labels.clearCache }}</NButton
      >
    </section>
    <div
      v-if="cleanup"
      class="cs-library-confirm"
      role="dialog"
      aria-modal="true"
      :aria-label="labels.preview"
    >
      <strong>{{ labels.preview }}</strong>
      <p>
        {{ labels.bytes }}: <b>{{ formatBytes(cleanup.reclaimableBytes) }}</b>
      </p>
      <p>
        {{ cleanup.captureIds.length }} captures ·
        {{ cleanup.seriesIds.length }} series ·
        {{ cleanup.cacheEntries.length }} cache
      </p>
      <p
        v-if="
          cleanup.protectedCaptureIds.length ||
          cleanup.protectedSeriesIds.length
        "
      >
        {{ labels.protected }}
      </p>
      <div>
        <NButton :disabled="confirming" @click="cleanup = undefined">{{
          labels.cancel
        }}</NButton
        ><NButton
          type="primary"
          :loading="confirming"
          @click="executeCleanup"
          >{{ labels.confirm }}</NButton
        >
      </div>
    </div>
  </aside>
</template>
