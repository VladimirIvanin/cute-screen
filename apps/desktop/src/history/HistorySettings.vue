<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import { describeError } from '@cute-screen/editor-vue'
import type {
  CleanupPlan,
  HistoryPolicy,
  StorageReport,
} from '../generated/desktop-ipc'
import {
  historyBytes,
  historyRequest,
  nativeHistory,
  type HistoryBridge,
} from './bridge'
import './history.css'
const props = defineProps<{ locale: 'ru' | 'en'; bridge?: HistoryBridge }>()
const bridge = props.bridge ?? nativeHistory
const ru = computed(() => props.locale === 'ru')
const policy = ref<HistoryPolicy>({ days: 7, maxMib: 512, maxCaptures: 200 })
const report = shallowRef<StorageReport>()
const plan = shallowRef<CleanupPlan>()
const busy = ref(false)
const error = ref<string>()
const message = ref<string>()
async function perform(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = undefined
  message.value = undefined
  try {
    await action()
  } catch (cause) {
    error.value = describeError(cause, ru.value ? 'Не удалось обновить историю' : 'Unable to update history')
  } finally {
    busy.value = false
  }
}
async function load(): Promise<void> {
  await perform(async () => {
    policy.value = (await historyRequest(bridge, { kind: 'policy' }, 'policy')).policy
    report.value = (await historyRequest(bridge, { kind: 'report' }, 'report')).report
  })
}
async function save(): Promise<void> {
  await perform(async () => {
    policy.value = (await historyRequest(bridge, { kind: 'setPolicy', policy: { ...policy.value } }, 'policy')).policy
    report.value = (await historyRequest(bridge, { kind: 'maintain' }, 'cleaned')).report
    message.value = ru.value ? 'Настройки сохранены' : 'Settings saved'
    plan.value = undefined
  })
}
async function preview(
  clearCache: boolean,
  includeLegacy: boolean,
): Promise<void> {
  await perform(async () => {
    plan.value = (await historyRequest(bridge, { kind: 'preview', captureIds: null, includeLegacy, clearCache }, 'plan')).plan
  })
}
async function commit(): Promise<void> {
  if (!plan.value) return
  await perform(async () => {
    const result = await historyRequest(bridge, { kind: 'commit', token: plan.value!.token }, 'cleaned')
    report.value = result.report
    plan.value = undefined
    message.value = `${ru.value ? 'Освобождено' : 'Freed'} ${historyBytes(result.freedBytes, props.locale)}`
  })
  if (error.value) plan.value = undefined
}
onMounted(load)
</script>
<template>
  <section
    class="cs-history-settings"
    :aria-label="ru ? 'История и хранение' : 'History and storage'"
    :aria-busy="busy"
  >
    <h2 class="cs-settings-section-title">{{ ru ? 'История и хранение' : 'History and storage' }}</h2>
    <p class="cs-settings-muted">{{ ru ? 'Временная история автоматически удаляет старые снимки вместе с аннотациями. Защитите важные снимки или экспортируйте результат.' : 'Temporary history automatically removes old captures and their annotations. Protect important captures or export the result.' }}</p>
    <p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="load">{{ ru ? 'Повторить' : 'Retry' }}</button></p>
    <label>{{ ru ? 'Хранить не дольше' : 'Keep for' }}<select v-model.number="policy.days" :disabled="busy"><option
      v-for="days in [1, 7, 30]"
      :key="days"
      :value="days"
    >{{ days }} {{ ru ? 'дн.' : 'days' }}</option></select></label>
    <label>{{ ru ? 'Объём истории' : 'History size' }}<select v-model.number="policy.maxMib" :disabled="busy"><option
      v-for="size in [256, 512, 1024]"
      :key="size"
      :value="size"
    >{{ size }} {{ ru ? 'МиБ' : 'MiB' }}</option></select></label>
    <label>{{ ru ? 'Количество снимков' : 'Capture count' }}<select v-model.number="policy.maxCaptures" :disabled="busy"><option
      v-for="count in [100, 200, 1000]"
      :key="count"
      :value="count"
    >{{ count }}</option></select></label>
    <button :disabled="busy" @click="save">{{ ru ? 'Применить ограничения' : 'Apply limits' }}</button>
    <template v-if="report">
      <dl>
        <dt>{{ ru ? 'Всего' : 'Total' }}</dt><dd>{{ historyBytes(report.totalBytes, locale) }}</dd>
        <dt>{{ ru ? 'Оригиналы' : 'Originals' }}</dt><dd>{{ historyBytes(report.originalsBytes, locale) }}</dd>
        <dt>{{ ru ? 'Данные документов' : 'Document data' }}</dt><dd>{{ historyBytes(report.documentsBytes, locale) }}</dd>
        <dt>{{ ru ? 'Материалы оформления' : 'Appearance materials' }}</dt><dd>{{ historyBytes(report.materialsBytes, locale) }}</dd>
        <dt>{{ ru ? 'Кэш' : 'Cache' }}</dt><dd>{{ historyBytes(report.cacheBytes, locale) }}</dd>
        <dt>{{ ru ? 'База данных, включая документы' : 'Database, including documents' }}</dt><dd>{{ historyBytes(report.databaseBytes, locale) }}</dd>
      </dl>
      <p class="cs-settings-muted">{{ ru ? 'Удалённые строки базы освобождают место для повторного использования внутри SQLite; размер файла может не уменьшиться.' : 'Deleted database rows become reusable inside SQLite; its file size may stay unchanged.' }}</p>
      <p v-if="report.overLimit" role="status">{{ ru ? 'Лимит превышен. Активный и защищённые снимки сохраняются; экспортируйте важное и удалите ненужное вручную.' : 'Over limit. Active and protected captures are kept; export important results and remove unneeded captures manually.' }}</p>
      <p v-if="report.legacyPendingCount">{{ ru ? 'Старые снимки пока защищены от автоочистки:' : 'Existing captures awaiting cleanup consent:' }} {{ report.legacyPendingCount }}</p>
      <div class="cs-history-settings-actions">
        <button :disabled="busy" @click="preview(true, false)">{{ ru ? 'Очистить кэш…' : 'Clear cache…' }}</button>
        <button :disabled="busy" @click="preview(false, false)">{{ ru ? 'Очистить по ограничениям…' : 'Clean up by limits…' }}</button>
        <button
          v-if="report.legacyPendingCount"
          :disabled="busy"
          @click="preview(false, true)"
        >
          {{ ru ? 'Применить к старым снимкам…' : 'Apply to existing captures…' }}
        </button>
      </div>
    </template>
    <div
      v-if="plan"
      class="cs-history-confirm"
      role="group"
      :aria-label="ru ? 'Подтверждение очистки' : 'Confirm cleanup'"
    >
      <p>{{ plan.clearCache ? (ru ? 'Удалить восстанавливаемый кэш?' : 'Remove rebuildable cache?') : `${ru ? 'Будет удалено снимков с аннотациями:' : 'Captures and annotations to delete:'} ${plan.captureIds.length}` }}</p>
      <p>{{ ru ? 'Освобождаемые файлы:' : 'Reclaimable files:' }} {{ historyBytes(plan.reclaimableBytes, locale) }}</p>
      <p v-if="plan.includeLegacy">{{ ru ? 'После подтверждения старые снимки также будут удаляться автоматически по выбранным ограничениям.' : 'After confirmation, existing captures will also be cleaned automatically using these limits.' }}</p>
      <p v-if="!plan.clearCache">{{ ru ? 'После подтверждения восстановление недоступно.' : 'Deletion cannot be undone after confirmation.' }}</p>
      <button :disabled="busy" @click="commit">{{ ru ? 'Подтвердить' : 'Confirm' }}</button>
      <button :disabled="busy" @click="plan = undefined">{{ ru ? 'Отмена' : 'Cancel' }}</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
