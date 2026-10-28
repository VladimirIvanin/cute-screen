# Подключение локального агента

Cute Screen предоставляет локальный MCP-сервер и 15 профилей настройки клиентов.
Собственные модели, API-ключи провайдеров и облачный сервис
приложению не нужны. Клиент агента определяет, какой модели передаются результаты.

## Подключение

1. Откройте **Подключить агента** в редакторе. В узком окне пункт находится в
   дропе шестерёнки. Можно открыть **Настройки приложения → Агенты / MCP**.
2. Включите подключения, выберите клиент и нажмите **Создать конфигурацию**.
3. Скопируйте блок в настройки выбранного клиента и перезапустите MCP-подключение.
   Формат, место вставки и инструкция показаны под выбором клиента.
4. Попросите агента вызвать `get_status`, затем `get_document` или `list_history`.

Приложение не меняет конфигурационные файлы клиентов автоматически.
У каждого подключения доступны **Открыть** и **Скопировать**: конфиг можно получить
повторно после закрытия Settings и перезапуска приложения. **Создать ещё ключ**
добавляет независимое подключение того же клиента; ранее настроенные агенты продолжают
работать. Короткий ID различает подключения одного клиента. **Отозвать** блокирует
выбранное подключение и удаляет его сохранённый ключ, сохраняя остальные.
Конфигурация содержит секрет; кнопка **Скрыть конфигурацию** убирает её с экрана.
«Недавно активен» означает запрос в последние 60 секунд, а не постоянное соединение.
Проверка запуска companion и готовности редактора не заменяет реальный вызов из клиента.

Сервер работает на той же машине и в пользовательской сессии, что и Cute Screen.
При необходимости companion запускает приложение в фоне; документ открывается
в обычном редакторе. WSL, SSH, контейнеры и cloud agents не считаются локальной
машиной. Общедоступного HTTP endpoint нет.

## Навык для аннотирования снимков

В репозитории есть [устанавливаемый навык](../skills/cute-screen-annotate/SKILL.md)
для агентов: он помогает захватить или импортировать снимок через MCP, добавить
читаемые стрелки и подписи, проверить результат в итоговом масштабе и экспортировать
PNG. В разделе **Агенты / MCP → Навык для агента** есть команда и кнопка
**Скопировать команду**. Выполните её в терминале из папки вашего проекта
(нужен Node.js 22.20 или новее):

```sh
npx --yes skills add VladimirIvanin/cute-screen --skill cute-screen-annotate --yes
```

[Skills CLI](https://github.com/vercel-labs/skills) устанавливает навык для
поддерживаемых агентов в текущем проекте; для установки во все проекты добавьте
`--global`. Затем перезапустите сессию агента и попросите использовать
`cute-screen-annotate`.

Для ручной установки в Codex из клона репозитория:

```sh
mkdir -p ~/.codex/skills
cp -R skills/cute-screen-annotate ~/.codex/skills/
```

Затем перезапустите сессию агента и попросите использовать
`$cute-screen-annotate`. Для других клиентов скопируйте папку в их каталог
навыков. Навык не содержит ключ подключения: конфигурация MCP создаётся отдельно
в настройках Cute Screen по инструкции выше.

## Профили клиентов

Все профили запускают один companion через stdio с отдельным отзываемым ключом.
Профиль определяет синтаксис настройки; он не включает auto-approve инструментов.
Пути с `~` в таблице — подсказки пользователю; внутри скопированного блока executable
и пути приложения абсолютные. Объединяйте блок с существующими настройками, сохраняя
остальные разделы. Для другого экземпляра агента создавайте отдельный ключ того же
профиля; отзыв одного ключа не затрагивает другие.

Ключи для повторного копирования сохраняются в пользовательском app-data `mcp-keys/`
отдельно от SQLite; на Unix каталог 0700 и файлы 0600. В Windows используются ACL
пользовательского app-data. Settings snapshot содержит только metadata, без секретов.
Старые версии сохраняли только необратимый хэш: при первом открытии такой записи
создаётся сохраняемый configuration key для того же ID; ранее установленный ключ
продолжает работать. Отзыв записи запрещает оба ключа (ADR-155).

| Клиент                   | Формат                                                     | Куда добавить                                                                                          |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Codex                    | TOML `mcp_servers.cute-screen`                             | `~/.codex/config.toml`                                                                                 |
| Claude Code              | JSON `mcpServers`                                          | `.mcp.json` проекта                                                                                    |
| Claude Desktop           | JSON `mcpServers`                                          | Settings → Developer → Edit Config; Windows/macOS                                                      |
| Cursor                   | JSON `mcpServers`                                          | `.cursor/mcp.json` или `~/.cursor/mcp.json`                                                            |
| VS Code / GitHub Copilot | JSON `servers`, `type: stdio`                              | `.vscode/mcp.json`                                                                                     |
| Gemini CLI               | JSON `mcpServers`                                          | `.gemini/settings.json` или `~/.gemini/settings.json`                                                  |
| Windsurf / Cascade       | JSON `mcpServers`                                          | Cascade → MCPs → Open MCP config file                                                                  |
| Cline                    | JSON `mcpServers`                                          | MCP Servers → Configure → Configure MCP Servers; CLI: `~/.cline/data/settings/cline_mcp_settings.json` |
| Roo Code                 | JSON `mcpServers`                                          | `.roo/mcp.json` или MCP → Edit Global MCP                                                              |
| Zed                      | JSON `context_servers`                                     | zed: open settings file; Zed Agent                                                                     |
| Continue                 | YAML `mcpServers[]`, `type: stdio`                         | Новый `.continue/mcpServers/cute-screen.yaml`; Agent mode                                              |
| ZCode                    | JSON `mcp.servers`                                         | `~/.zcode/cli/config.json`                                                                             |
| GigaCode CLI             | JSON `mcpServers`                                          | `~/.gigacode/settings.json`                                                                            |
| OpenCode                 | JSON `mcp`, `type: local`, массив `command`, `environment` | `opencode.json` или `~/.config/opencode/opencode.json`                                                 |
| Другой клиент / stdio    | JSON одной записи `command`, `args`, `env`                 | Перенести поля в ручную форму; имя `cute-screen`, транспорт stdio                                      |

Профиль OpenCode соответствует стабильной документации; экспериментальный V2
`mcp.servers` не используется. Windsurf-профиль относится к Cascade в Windsurf /
Devin Desktop; новый Devin Local имеет отдельный формат и этим профилем не покрыт.
Для Continue YAML содержит JSON-quoted scalars и flow collections, допустимые в
YAML 1.2; границы аргументов и Windows backslashes сохраняются без shell escaping.

Официальные инструкции:
[Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers),
[VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers),
[Gemini CLI](https://geminicli.com/docs/tools/mcp-server/),
[Windsurf / Cascade](https://docs.devin.ai/desktop/cascade/mcp),
[Cline](https://github.com/cline/cline/blob/main/docs/mcp/mcp-overview.mdx),
[Roo Code](https://docs.roocode.com/features/mcp/using-mcp-in-roo),
[Zed](https://zed.dev/docs/ai/mcp),
[Continue](https://docs.continue.dev/customize/deep-dives/mcp).

## Работа с документом

Рекомендуемый цикл: `get_status` → `import_image` / `capture` / `open_document` →
`get_document` → `apply_edits` → `get_preview` → корректировка → `export_image`.

`get_document` возвращает документ, `stateToken`, `canUndo`, `canRedo` и `saveState`.
Используйте `document.id` как `documentId`. Все координаты создания по умолчанию —
пиксели исходного документа. `space: "card"` у операции создания задаёт пиксели
выходной карточки; выбранная пользователем область оформления не меняет координаты агента.

Пример `operations` для `apply_edits`:

```json
[
  {
    "type": "create",
    "tool": "text",
    "input": { "text": "Проверить кнопку", "origin": { "x": 100, "y": 80 }, "fontSize": 32 }
  },
  {
    "type": "create",
    "tool": "drawing",
    "input": { "tool": "arrow", "start": { "x": 120, "y": 130 }, "end": { "x": 300, "y": 240 } }
  }
]
```

В запросе также обязательны `documentId`, `expectedStateToken` и уникальный
`requestId`. Создание использует core factories, идентификаторы назначает приложение.
Схемы операций генерируются из TypeScript-контракта и доступны в `tools/list`.
`drawing` включает line, arrow, shape, pencil, marker и gradient. Остальные
фабрики: text, callout, numberedMarker, image, emoji, censor, spotlight, ruler, loupe.
`list_assets` ищет встроенные emoji по русскому/английскому названию или символу;
используйте возвращённые `asset` и `grapheme` без изменений. Для image/texture сначала вызовите `import_resource`, затем используйте `blobHash`.

Другие операции: `update`, `remove`, `duplicate`, `reorder`, `crop`, `flip`,
`presentation`. `update.changes` заменяет переданные свойства целиком;
в частности, `payload` — полный payload слоя, а не вложенный patch.
Базовое изображение нельзя разблокировать или заменить. Ручная цензура доступна;
автоматическая цензура и OCR не добавлены.

Пакет содержит 1–100 операций и отменяется одним Undo. Весь пакет проверяется
до применения; ошибка не оставляет первые операции выполненными. Undo/Redo
относятся к общей истории текущего документа, включая ручные действия.

Любая правка, Undo/Redo и замена сессии инвалидируют старый `stateToken`.
При `conflict` перечитайте документ. При `busy` дождитесь окончания ручного жеста,
inline text или Quick Capture; агент не коммитит черновик пользователя.
Последние 512 результатов `apply_edits` кешируются в живой сессии для повторов
того же `requestId` и тех же аргументов. После смены сессии кеш сбрасывается.
После потери связи не повторяйте мутацию автоматически: сначала прочитайте состояние.

`applied: true` с `saveState: "error"` означает, что правка уже видна и имеет Undo,
но сохранение не завершилось. Не создавайте такой же пакет повторно; используйте
штатный повтор сохранения в редакторе. Открытие другой записи сохраняет текущую
через production handoff; после переключения история Undo начинается заново.

## Изображения и захват

`get_preview` требует текущий токен и возвращает PNG до 1536 px по длинной стороне.
Для проверки деталей передайте `region` в пикселях выходного изображения.
Метаданные содержат размеры, область, `scaleX/scaleY`, crop и composition `layout`:
source/content/screen позволяют перевести координаты между исходником и карточкой.
Выделение, handles и незавершённые жесты в preview не входят.

Внутри приложения и между Rust host и companion пиксели передаются бинарно.
Только уменьшенный MCP ImageContent кодируется base64 в stdio companion (ADR-154).
Оригинальные файлы не возвращаются как base64. Экспорт пишет новый абсолютный
`.png` путь, проверяет декодирование и отказывает при существующем файле либо пути
внутри библиотеки; оригинал никогда не перезаписывается.

`capture` принимает `mode` (area, screen, window, activeWindow, repeat),
опциональные `delayMs` (0–60000) и `cursor`, возвращает `jobId`.
`get_job` показывает progress и terminal result; `cancel_job` отменяет принадлежащий
подключению незавершённый capture. Для интерактивных режимов пользователь завершает
штатный selector/Quick Capture. Отмена, отсутствие разрешения, недоступный режим и
ошибка различаются в `result.outcome`. Возможности конкретной ОС — в `get_status`.
Wayland сохраняет существующие XDG/GNOME/helper пути, без ScreenCast.

## Разработка и поставка

- `pnpm tauri dev/build` сначала собирает `cute-screen-mcp` с тем же target/profile,
  затем подключает `tauri.mcp.conf.json` для bundling sidecar. Собственный Cargo target
  не создаётся. Прямые `cargo check/test` не требуют заранее собранного sidecar.
- Companion живёт рядом с GUI executable; AppImage-конфиг использует постоянный
  путь AppImage с `--mcp-stdio`, без временного mount path. macOS universal companion
  собирается для обеих архитектур и объединяется через `lipo`.
- `pnpm mcp:schema` обновляет JSON Schema; `pnpm mcp:schema:check` входит в `pnpm check`.
- Native smoke: `CUTE_SCREEN_E2E_SCENARIOS=mcp,mcp-reopen pnpm test:e2e:tauri`.
  Shared persistence group хранится до последнего reopen-сценария; profiles и
  pin-копии обоих executable очищает штатный runner.

Архитектура соединения: клиент → stdio companion на rmcp → framed binary TCP только
`127.0.0.1` → Rust host → typed dispatcher main WebView → DocumentSessionController.
Авторизация хранит SHA-256; повторное копирование использует отдельные приватные
файлы ключей (ADR-155). Discovery-файл и settings snapshot не содержат ключей.
Нет JS eval, произвольного invoke или raw document replacement. Очередь проверяет
наличие запроса и доступ подключения непосредственно перед выполнением.

Основания: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[MCP ImageContent](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[rmcp](https://github.com/modelcontextprotocol/rust-sdk),
[Blender bridge](https://github.com/djeada/blender-mcp-server),
[Excalidraw](https://github.com/yctimlin/mcp_excalidraw).
Конфигурации клиентов сверены с официальными руководствами:
[Codex](https://learn.chatgpt.com/docs/extend/mcp), [Claude](https://code.claude.com/docs/en/mcp),
[Cursor](https://prod.cursor.com/help/customization/mcp), [ZCode](https://zcode.z.ai/en/docs/mcp-services),
[GigaCode](https://gitverse.ru/docs/ai/ai-assistant-gigacode/gigacode-cli/mcp),
[OpenCode](https://opencode.ai/docs/en/mcp-servers/).
