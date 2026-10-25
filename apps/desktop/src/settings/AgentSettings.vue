<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { describeError } from '@cute-screen/editor-vue'
import type {
  AgentClient,
  AgentSettings,
  AgentSettingsBridge,
} from '../agent/contracts'
import { agentSettingsBridge } from '../platform/tauri/agent-settings-adapter'
import { agentClientProfiles } from '../agent/client-profiles'

const props = defineProps<{ locale: 'ru' | 'en'; bridge?: AgentSettingsBridge }>()
const bridge = props.bridge ?? agentSettingsBridge
const state = ref<AgentSettings>()
const busy = ref(false)
const error = ref('')
const message = ref('')
const config = ref('')
const client = ref<AgentClient>('codex')
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
let messageTimer: ReturnType<typeof setTimeout> | undefined
const ru = computed(() => props.locale === 'ru')
const profile = computed(() => agentClientProfiles[client.value])
async function perform(action: () => Promise<void>): Promise<void> {
  if (busy.value || disposed) return
  busy.value = true
  error.value = ''
  message.value = ''
  clearTimeout(messageTimer)
  try {
    await action()
  } catch (cause) {
    if (!disposed) error.value = describeError(cause, ru.value ? 'Не удалось выполнить действие' : 'Action failed')
  } finally {
    busy.value = false
  }
}
const load = () => perform(async () => {
  const next = await bridge.snapshot()
  if (!disposed) state.value = next
})
async function enable(enabled: boolean): Promise<void> {
  await perform(async () => {
    state.value = await bridge.configure(enabled)
    if (!enabled) config.value = ''
  })
}
async function create(): Promise<void> {
  await perform(async () => {
    const result = await bridge.create(client.value)
    state.value = result.snapshot
    config.value = result.config
  })
}
async function copy(): Promise<void> {
  await perform(async () => {
    await bridge.copy(config.value)
    message.value = ru.value ? 'Конфигурация скопирована' : 'Configuration copied'
    messageTimer = setTimeout(() => {
      message.value = ''
    }, 3000)
  })
}
async function revoke(id: string): Promise<void> {
  await perform(async () => {
    state.value = await bridge.revoke(id)
    config.value = ''
  })
}
async function check(): Promise<void> {
  await perform(async () => {
    const result = await bridge.check()
    message.value = result.companion && result.bridge && result.editorReady
      ? (ru.value ? 'Companion, мост и редактор готовы' : 'Companion, bridge and editor are ready')
      : (ru.value ? 'Companion доступен. Редактор ещё запускается.' : 'Companion available. Editor is still starting.')
  })
}
onMounted(() => {
  void load()
  timer = setInterval(() => {
    if (
      busy.value ||
      disposed ||
      !state.value
    ) return
    void bridge.snapshot().then((next) => {
      if (!disposed) state.value = next
    }).catch((cause) => {
      if (!disposed) error.value = describeError(cause, 'Status unavailable')
    })
  }, 5000)
})
onBeforeUnmount(() => {
  disposed = true
  clearInterval(timer)
  clearTimeout(messageTimer)
})
</script>

<template>
  <section
    class="cs-agent-settings"
    :aria-busy="busy"
    :aria-label="ru ? 'Агенты / MCP' : 'Agents / MCP'"
  >
    <h2 class="cs-settings-section-title">{{ ru ? 'Агенты / MCP' : 'Agents / MCP' }}</h2>
    <p class="cs-settings-muted">
      {{ ru
        ? 'Подключите локального агента к истории, захвату и инструментам редактора. Правки видны сразу и отменяются через Undo. Отправкой изображений модели управляет выбранный клиент.'
        : 'Connect a local agent to history, capture and editor tools. Edits appear immediately and support Undo. Your chosen client controls sending images to its model.' }}
    </p>
    <p v-if="!state && !error" role="status">{{ ru ? 'Загрузка…' : 'Loading…' }}</p>
    <div
      v-if="error"
      class="cs-settings-error"
      role="alert"
    >
      {{ error }} <button :disabled="busy" @click="load">{{ ru ? 'Повторить' : 'Retry' }}</button>
    </div>
    <template v-if="state">
      <label class="cs-agent-enable">
        <input
          type="checkbox"
          :checked="state.enabled"
          :disabled="busy"
          @change="enable(($event.target as HTMLInputElement).checked)"
        />
        {{ ru ? 'Разрешить подключение агентов' : 'Enable agent connections' }}
      </label>
      <p v-if="!state.enabled" class="cs-settings-muted">{{ ru ? 'MCP выключен. Включите его, чтобы создать конфигурацию подключения.' : 'MCP is off. Enable it to create a connection configuration.' }}</p>
      <label for="mcp-client">{{ ru ? 'Клиент' : 'Client' }}</label>
      <select
        id="mcp-client"
        v-model="client"
        :disabled="busy"
        @change="config = ''"
      >
        <option
          v-for="(entry, id) in agentClientProfiles"
          :key="id"
          :value="id"
        >
          {{ id === 'generic' && ru ? 'Другой клиент / stdio' : entry.label }}
        </option>
      </select>
      <p class="cs-settings-muted">{{ profile.format }}</p>
      <p class="cs-settings-muted">{{ profile.destination }}</p>
      <p class="cs-settings-muted">{{ profile.help[locale] }}</p>
      <div class="cs-agent-buttons">
        <button :disabled="busy || !state.enabled" @click="create">{{ ru ? 'Создать конфигурацию' : 'Create configuration' }}</button>
        <button :disabled="busy || !state.enabled" @click="check">{{ ru ? 'Проверить подключение' : 'Check connection' }}</button>
      </div>
      <p class="cs-settings-muted">{{ ru ? 'Новая конфигурация заменяет прежний ключ этого клиента. Скопируйте блок в настройки агента и перезапустите подключение. Ключ показывается только сейчас; не публикуйте его.' : 'A new configuration replaces this client’s old key. Copy the block into your agent settings and restart its connection. The key is shown only now; keep it private.' }}</p>
      <template v-if="config">
        <label for="mcp-config">{{ ru ? 'Конфигурация подключения' : 'Connection configuration' }}</label>
        <textarea
          id="mcp-config"
          :value="config"
          readonly
          rows="12"
          spellcheck="false"
        />
        <button :disabled="busy" @click="copy">{{ ru ? 'Скопировать' : 'Copy' }}</button>
      </template>
      <p v-if="message" role="status">{{ message }}</p>
      <h3>{{ ru ? 'Подключения' : 'Connections' }}</h3>
      <p v-if="!state.connections.length" class="cs-settings-muted">{{ ru ? 'Подключений пока нет' : 'No connections yet' }}</p>
      <ul v-else class="cs-agent-connections">
        <li v-for="connection in state.connections" :key="connection.id">
          <div>
            <strong>{{ connection.client === 'generic' && ru ? 'Другой клиент / stdio' : agentClientProfiles[connection.client]?.label ?? connection.client }}</strong>
            <p>{{ connection.connected ? (ru ? 'Недавно активен' : 'Recently active') : (ru ? 'Нет недавних запросов' : 'No recent requests') }}</p>
            <p v-if="connection.lastAction">{{ connection.lastAction }} · {{ new Date(connection.lastSeen!).toLocaleString(locale) }}</p>
          </div>
          <button
            :disabled="busy"
            :aria-label="`${ru ? 'Отозвать' : 'Revoke'} ${connection.client}`"
            @click="revoke(connection.id)"
          >
            {{ ru ? 'Отозвать' : 'Revoke' }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.cs-agent-settings { display: grid; gap: 12px; }
.cs-agent-settings h3, .cs-agent-settings p { margin: 0; }
.cs-agent-enable { display: flex; gap: 8px; align-items: center; }
.cs-agent-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.cs-agent-settings textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 12px; font-family: monospace; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cs-agent-connections { list-style: none; padding: 0; margin: 0; }
.cs-agent-connections li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
.cs-agent-settings :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
</style>
