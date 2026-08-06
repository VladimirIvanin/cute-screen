# Журнал архитектурных решений

Статусы: `proposed`, `accepted`, `superseded`, `rejected`. Accepted ADR не переписывается без нового решения, которое явно его заменяет.

## ADR-001 — Tauri 2 + Vue 3 + Rust

**Статус:** accepted

**Решение:** системная оболочка и платформенные сервисы реализуются на Tauri 2/Rust, интерфейс — Vue 3 + TypeScript + Vite.

**Почему:** один frontend для трёх ОС, меньшая idle-нагрузка по сравнению с Electron, Rust подходит для capture/storage/hotkey boundaries. Цена — три системных webview, поэтому CI/runtime проверки обязательны на каждой ОС.

## ADR-002 — Изолированный editor core

**Статус:** accepted

**Решение:** документ, геометрия, hit testing и commands находятся в DOM-free `editor-core`; Vue получает только snapshots/events.

**Альтернатива:** хранить слои и pointer state в Pinia/Vue. Отклонено из-за deep reactivity и ненужных component renders.

## ADR-003 — CanvasKit основной, Canvas2D совместимый renderer

**Статус:** accepted

**Решение:** CanvasKit/WebGL2 является основным display/export renderer, Canvas2D реализует compatibility path.

**Последствия:** CanvasKit проверяется на WebKitGTK/WebView2/WKWebView, включая context loss и headless rendering. Одинаковый scene graph предотвращает отдельные документы для fallback.

## ADR-004 — Scene и interaction overlay разделены

**Статус:** accepted

**Решение:** screenshot+committed layers и selection/guides/draft gestures рисуются на разных canvas. Scheduler работает по invalidation flags.

**Почему:** selection/pointer feedback не должен заставлять перерисовывать весь 4K scene.

## ADR-005 — Единый versioned document и command history

**Статус:** accepted

**Решение:** `EditorDocument` имеет `schemaVersion`; любое изменение проходит через `EditorCommand`. Transient gesture не попадает в документ до commit.

**Последствия:** property drag создаёт один history step; migrations покрываются golden fixtures.

## ADR-006 — SQLite metadata + immutable content-addressed blobs

**Статус:** accepted

**Решение:** каталог и документы хранятся в SQLite, оригиналы — в `blobs/<sha256>.<ext>`, previews — rebuildable cache.

**Альтернатива:** mutable JSON manifest на серию. Отклонено из-за слабой атомарности, индексации и миграций.

## ADR-007 — Атомарная запись и recovery journal

**Статус:** accepted

**Решение:** temporary file создаётся в целевой файловой системе, синхронизируется и переименовывается; SQLite transaction связывает blob, capture и document; незавершённые операции восстанавливаются при старте.

## ADR-008 — Платформенные capture/hotkey backends

**Статус:** accepted

**Решение:** X11/Windows/macOS и Wayland реализуют общие traits, но не скрывают разные capabilities. Wayland использует XDG Screenshot и GlobalShortcuts portals.

**Альтернатива:** единая библиотека и заявление одинаковой поддержки. Отклонено из-за X11-only shortcut semantics и ограничений Wayland.

## ADR-009 — Системный Wayland selector

**Статус:** accepted

**Решение:** на Wayland используется selector desktop portal. Собственный ScreenCast/PipeWire overlay не входит в приложение.

**Последствия:** интерфейс выбора области может отличаться между GNOME/KDE; это документированная platform difference.

## ADR-010 — Один бинарник с GUI/tray/CLI dispatch

**Статус:** accepted

**Решение:** `cute-screen` без capture subcommand запускает обычный lifecycle; CLI разбирается через `clap`, использует single-instance forwarding и стабильный JSON/exit-code контракт.

**Почему:** одна установка и единая команда для Wayland/system shortcut fallback.

## ADR-011 — Бинарные изображения вне JSON IPC

**Статус:** accepted

**Решение:** primary transport — scoped asset URL; fallback — binary IPC/Blob URL. Base64 запрещён. Долгие операции используют Channel API.

**Проверка:** реальный webview декодирует production-like image и загружает CanvasKit texture.

## ADR-012 — Tool settings находятся только в toolbar

**Статус:** accepted

**Решение:** top bar, tool rail, canvas, bottom contextual toolbar, series filmstrip, layers panel и zoom control сохраняются. Layers panel не дублирует tool options.

**Уточнение:** main editor использует системные window decorations; CSS-клоны системных кнопок не создаются.

## ADR-013 — Runtime evidence обязательно

**Статус:** accepted

**Решение:** requirement нельзя закрыть unit-тестом механизма, если пользовательский путь зависит от webview/Tauri/OS. `TRACEABILITY.md` хранит автоматическое и runtime-доказательство.

## ADR-014 — CI и проверки вводятся вместе с кодом

**Статус:** accepted

**Решение:** lint/typecheck/unit/browser E2E и platform compile checks вводятся вместе с первым кодом. Каждое изменение добавляет проверки своего поведения; системные проверки дополняют, а не заменяют раннее тестирование.

## ADR-015 — Без телеметрии

**Статус:** accepted

**Решение:** приложение хранит rotating local logs и создаёт diagnostic bundle только по ручному действию. Содержимое снимков не включается по умолчанию.

## ADR-016 — Лицензионная политика permissive-only

**Статус:** accepted

**Решение:** production code/dependencies используют совместимые permissive-лицензии. MacShot и другие GPL-проекты служат только UX-референсами.

## ADR-017 — Полный релиз без публичного MVP

**Статус:** superseded by ADR-018

**Решение:** разработка может создавать внутренние CI artifacts, но публичная публикация начинается только после прохождения полного набора функций и acceptance matrix.

## ADR-018 — Неофициальные CI-сборки и GitHub version check

**Статус:** accepted

**Решение:** проект не создаёт официальный подписанный канал дистрибуции, не выполняет code signing/notarization и не использует Tauri updater. GitHub Actions собирает versioned unsigned artifacts для всей платформенной матрицы. Приложение сравнивает встроенную SemVer с публичными GitHub tags `vX.Y.Z` и только сообщает о более новой версии.

**Поведение проверки:** ручная проверка доступна всегда; автоматическая проверка не чаще одного раза в 24 часа включается пользователем явно. Используются `ETag`/кэш, короткий timeout и публичный GitHub API без token/device ID. Ошибка сети, rate limit или отсутствие подходящего тега не блокируют запуск.

**Не делаем:** GitHub Releases API как обязательный источник, автоматическое скачивание, установку, rollback, update manifests и фоновые запросы без opt-in.

**Последствия:** unsigned Windows/macOS builds могут показывать SmartScreen/Gatekeeper warnings; это честно описывается рядом с artifact. Если позднее потребуется официальный канал, он вводится отдельным ADR.
