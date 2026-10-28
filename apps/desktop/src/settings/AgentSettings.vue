<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { describeError } from '@cute-screen/editor-vue'
import type {
  AgentClient,
  AgentConnection,
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
const skillInstallCommand = 'npx --yes skills add VladimirIvanin/cute-screen --skill cute-screen-annotate --yes'
const config = ref('')
const configId = ref<string>()
const configField = ref<HTMLTextAreaElement>()
const clientField = ref<HTMLSelectElement>()
const client = ref<AgentClient>('codex')
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
let messageTimer: ReturnType<typeof setTimeout> | undefined
const ru = computed(() => props.locale === 'ru')
const profile = computed(() => agentClientProfiles[client.value])
const hasConnection = computed(() => state.value?.connections.some((entry) => entry.client === client.value))
let failedAction: (() => Promise<void>) | undefined
function connectionLabel(connection: AgentConnection): string {
  const name = connection.client === 'generic' && ru.value ? 'Другой клиент / stdio'
    : agentClientProfiles[connection.client]?.label ?? connection.client
  return `${name} · ${connection.id.slice(0, 8)}`
}
function clearConfiguration(): void {
  config.value = ''
  configId.value = undefined
}
async function hideConfiguration(): Promise<void> {
  clearConfiguration()
  await nextTick()
  clientField.value?.focus()
}
async function showConfiguration(
  id: string,
  value: string,
): Promise<void> {
  configId.value = id
  config.value = value
  await nextTick()
  configField.value?.focus()
}
async function perform(action: () => Promise<void>): Promise<void> {
  if (busy.value || disposed) return
  busy.value = true
  error.value = ''
  message.value = ''
  clearTimeout(messageTimer)
  try {
    await action()
    failedAction = undefined
  } catch (cause) {
    failedAction = action
    if (!disposed) error.value = describeError(cause, ru.value ? 'Не удалось выполнить действие' : 'Action failed')
  } finally {
    busy.value = false
  }
}
const load = () => perform(async () => {
  const next = await bridge.snapshot()
  if (!disposed) state.value = next
})
async function retry(): Promise<void> {
  if (failedAction) await perform(failedAction)
  else await load()
}
async function enable(enabled: boolean): Promise<void> {
  await perform(async () => {
    state.value = await bridge.configure(enabled)
    if (!enabled) clearConfiguration()
  })
}
async function create(): Promise<void> {
  await perform(async () => {
    const result = await bridge.create(client.value)
    state.value = result.snapshot
    await showConfiguration(result.id, result.config)
  })
}
async function open(connection: AgentConnection): Promise<void> {
  await perform(async () => {
    const value = await bridge.configuration(connection.id)
    client.value = connection.client
    await showConfiguration(connection.id, value)
  })
}
async function copy(id?: string): Promise<void> {
  await perform(async () => {
    const value = id ? await bridge.configuration(id) : config.value
    await bridge.copy(value)
    message.value = ru.value ? 'Конфигурация скопирована' : 'Configuration copied'
    messageTimer = setTimeout(() => {
      message.value = ''
    }, 3000)
  })
}
async function copySkillCommand(): Promise<void> {
  await perform(async () => {
    await bridge.copy(skillInstallCommand)
    message.value = ru.value ? 'Команда установки скопирована' : 'Install command copied'
    messageTimer = setTimeout(() => {
      message.value = ''
    }, 3000)
  })
}
async function revoke(id: string): Promise<void> {
  await perform(async () => {
    state.value = await bridge.revoke(id)
    if (configId.value === id) clearConfiguration()
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
      {{ error }} <button :disabled="busy" @click="retry">{{ ru ? 'Повторить' : 'Retry' }}</button>
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
        ref="clientField"
        v-model="client"
        :disabled="busy"
        @change="clearConfiguration"
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
        <button :disabled="busy || !state.enabled" @click="create">{{ hasConnection ? (ru ? 'Создать ещё ключ' : 'Create another key') : (ru ? 'Создать конфигурацию' : 'Create configuration') }}</button>
        <button :disabled="busy || !state.enabled" @click="check">{{ ru ? 'Проверить подключение' : 'Check connection' }}</button>
      </div>
      <p class="cs-settings-muted">{{ ru ? 'Конфигурации можно открыть и скопировать из списка подключений, в том числе после перезапуска. Дополнительный ключ не меняет существующие подключения. Каждый ключ отзывается отдельно; не публикуйте конфигурацию.' : 'Open or copy configurations from the connections list, including after restart. An additional key keeps existing connections working. Revoke each key separately; keep configurations private.' }}</p>
      <template v-if="config">
        <label for="mcp-config">{{ ru ? 'Конфигурация подключения' : 'Connection configuration' }}</label>
        <textarea
          id="mcp-config"
          ref="configField"
          :value="config"
          readonly
          rows="12"
          spellcheck="false"
        />
        <div class="cs-agent-buttons">
          <button :disabled="busy" @click="copy()">{{ ru ? 'Скопировать' : 'Copy' }}</button>
          <button :disabled="busy" @click="hideConfiguration">{{ ru ? 'Скрыть конфигурацию' : 'Hide configuration' }}</button>
        </div>
      </template>
      <section class="cs-agent-skill" aria-labelledby="mcp-skill-title">
        <h3 id="mcp-skill-title">{{ ru ? 'Навык для агента' : 'Agent skill' }}</h3>
        <p class="cs-settings-muted">
          {{ ru
            ? 'Установите cute-screen-annotate, чтобы агент умел делать снимки, добавлять читаемые аннотации и проверять экспорт через Cute Screen MCP.'
            : 'Install cute-screen-annotate to help your agent capture screenshots, add readable annotations and verify exports through Cute Screen MCP.' }}
        </p>
        <p class="cs-settings-muted">
          {{ ru
            ? 'Выполните команду в терминале из папки проекта. Нужен Node.js 22.20 или новее. Skills CLI установит навык для поддерживаемых агентов в этом проекте.'
            : 'Run this command in a terminal from your project folder. Requires Node.js 22.20 or later. Skills CLI installs the skill for supported agents in this project.' }}
        </p>
        <pre><code>{{ skillInstallCommand }}</code></pre>
        <div class="cs-agent-buttons">
          <button :disabled="busy" @click="copySkillCommand">{{ ru ? 'Скопировать команду' : 'Copy install command' }}</button>
        </div>
        <p class="cs-settings-muted">
          {{ ru
            ? 'Перезапустите сессию агента и попросите использовать cute-screen-annotate. Подключение MCP настройте отдельно выше.'
            : 'Restart your agent session and ask it to use cute-screen-annotate. Configure the MCP connection separately above.' }}
        </p>
      </section>
      <p v-if="message" role="status">{{ message }}</p>
      <h3>{{ ru ? 'Подключения' : 'Connections' }}</h3>
      <p v-if="!state.connections.length" class="cs-settings-muted">{{ ru ? 'Подключений пока нет' : 'No connections yet' }}</p>
      <ul v-else class="cs-agent-connections">
        <li
          v-for="connection in state.connections"
          :key="connection.id"
          :data-connection-id="connection.id"
        >
          <div>
            <strong>{{ connectionLabel(connection) }}</strong>
            <p>{{ connection.connected ? (ru ? 'Недавно активен' : 'Recently active') : (ru ? 'Нет недавних запросов' : 'No recent requests') }}</p>
            <p v-if="connection.lastAction">{{ connection.lastAction }} · {{ new Date(connection.lastSeen!).toLocaleString(locale) }}</p>
          </div>
          <div class="cs-agent-connection-actions">
            <button
              :disabled="busy"
              :aria-label="`${ru ? 'Открыть конфигурацию' : 'Open configuration'} ${connectionLabel(connection)}`"
              @click="open(connection)"
            >
              {{ ru ? 'Открыть' : 'Open' }}
            </button>
            <button
              :disabled="busy"
              :aria-label="`${ru ? 'Скопировать конфигурацию' : 'Copy configuration'} ${connectionLabel(connection)}`"
              @click="copy(connection.id)"
            >
              {{ ru ? 'Скопировать' : 'Copy' }}
            </button>
            <button
              :disabled="busy"
              :aria-label="`${ru ? 'Отозвать' : 'Revoke'} ${connectionLabel(connection)}`"
              @click="revoke(connection.id)"
            >
              {{ ru ? 'Отозвать' : 'Revoke' }}
            </button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.cs-agent-settings { display: grid; gap: 12px; min-width: 0; }
.cs-agent-settings h3, .cs-agent-settings p { margin: 0; }
.cs-agent-skill { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cs-agent-skill pre { min-width: 0; margin: 0; padding: 12px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cs-agent-enable { display: flex; gap: 8px; align-items: center; }
.cs-agent-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.cs-agent-settings textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 12px; font-family: monospace; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cs-agent-connections { list-style: none; padding: 0; margin: 0; }
.cs-agent-connections li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
.cs-agent-connection-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.cs-agent-settings :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
</style>
