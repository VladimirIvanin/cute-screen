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

**Статус:** superseded by ADR-020

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

## ADR-019 — Отклонение xcap 0.9.7 и отдельный X11 adapter

**Статус:** accepted

**Контекст:** M01 рассматривал `xcap` 0.9.7 как candidate для X11/Windows/macOS. Лицензия crate совместима с permissive-only policy, но обязательный `cargo deny check` для all-features graph обнаружил в его Linux build-chain `xcb` → `quick-xml` 0.30.0 с `RUSTSEC-2026-0194` и `RUSTSEC-2026-0195`. Кроме того, Linux build `xcap` безусловно требует PipeWire development libraries, хотя Wayland path проекта обязан использовать только XDG portals.

**Решение:** `xcap` 0.9.7 отклонён и не входит в production dependency graph. X11 risk spike использует отдельный permissive `x11rb` adapter за feature `x11-capture`; Wayland adapter остаётся на `ashpd` и никогда не вызывает X11 adapter. Общие `CaptureBackend`, DTO и stable error codes не меняются.

**Проверка:** `cargo deny check` должен быть зелёным с all-features graph. Controlled X11 gate отдельно проверяет RandR monitor coordinates/physical dimensions и RGBA hash реального окна; до появления такого evidence X11 capability не объявляется доступной.

## ADR-020 — Локальная runtime-приёмка до финальной платформенной матрицы

**Статус:** accepted; supersedes ADR-013

**Контекст:** приложение разрабатывается и проверяется на текущей системе владельца
проекта. Выполнять runtime, portal, native-window и installation прогоны на
каждой целевой ОС после каждого вертикального среза нецелесообразно; это
замедляет завершение продукта без добавления нового пользовательского сценария.

**Решение:** во время разработки runtime-приёмка выполняется только на текущей
системе владельца. Для остальных platform rows продолжаются реализация,
type/compile checks и deterministic tests через общие traits/fake-platform, но
runtime-статус не заявляется. Полная матрица реальных webview, capture, hotkey,
permissions и install/launch выполняется один раз после функционального
завершения приложения как финальная platform/release acceptance.

**Границы:** это не отменяет unit/property/render/browser tests, requirements к
undo/redo, безопасной обработке ошибок и platform capability contracts. Локальный
runtime pass не означает `supported` или `verified` для другой ОС; до финальной
матрицы такие строки остаются `planned` либо `implemented` с явно указанным
отложенным evidence.

## ADR-021 — Content-addressed blobs и bounded image resources

**Статус:** accepted

**Контекст:** M03 должен хранить originals и будущие image layers локально,
не помещая bytes в document JSON или SQLite metadata. Полноразмерные bitmap
потребляют значительно больше памяти, чем их сжатые файлы, поэтому один hash
store без resource lifecycle привёл бы к повторному decode и GPU upload.

**Решение:** originals и imported images хранятся неизменяемыми файлами под
SHA-256, разложенными по двум hash-prefix каталогам; SQLite хранит metadata и
явные references. Derivatives — `thumbnail` и `interactive-2048` — являются
rebuildable cache. Renderer получает byte-bounded, deduplicating resource
manager; texture-limit выбирает preview до появления tiled rendering в M07.

**Последствия:** blob cleanup не выполняется автоматически при старте; он
должен опираться на reference rows и отдельный maintenance flow. Малые
thumbnails могут быть перенесены в отдельный cache database только после
platform benchmark. Recovery bundle включает authoritative blobs, но не cache.

## ADR-022 — Независимый canvas и исходное изображение как raster layer

**Статус:** accepted

**Контекст:** специальный неуправляемый screenshot background ограничивает
быстрые графические задачи: пользователь не может освободить canvas, изменить
размер/позицию исходного изображения или собрать композицию из нескольких
bitmap. При этом immutable original из ADR-006/ADR-021 должен сохраниться.

**Решение:** `EditorDocument.source` хранит immutable provenance и blob reference,
а видимое исходное изображение является обычным ordered raster `LayerNode` с
ролью `base`. Initial-document factory создаёт canvas по decoded dimensions,
помещает base layer внизу и включает lock. После явного unlock слой использует
общие transform/delete commands; его удаление не удаляет original и не меняет
canvas dimensions. Horizontal/vertical canvas flip является сериализуемой
command над слоями и crop, а не viewport transform.

**Последствия:** renderer больше не имеет отдельного screenshot-background path;
capture, Open image и empty-state bitmap paste используют один document factory.
Legacy documents мигрируются идемпотентно. Preview, restart и export tests
обязаны покрывать resized/deleted base layer и canvas flip.

## ADR-023 — Общая paint/effect model для полноценного редактора

**Статус:** accepted

**Контекст:** отдельные ad-hoc реализации gradient, pattern, texture, outline,
shadow и blend для shapes, text и presentation быстро расходятся между
CanvasKit, Canvas2D, DOM text overlay и export. Одновременно продукт должен
закрывать частые простые задачи графического редактора, а не останавливаться на
минимальных аннотациях.

**Решение:** scene layers используют versioned reusable primitives: solid и
multi-stop linear/radial gradients, bundled pattern или immutable image texture,
opacity, curated blend modes, outline/stroke и bounded shadow stack. Text style
presets являются комбинациями тех же полей; texture/pattern transform хранит
scale, rotation и offset. Advanced controls раскрываются контекстно. Arbitrary
user shader code, shader graph и plugin effects не входят в текущий продукт.

**Последствия:** M06 сначала вводит общие paint/compositing primitives, M07
доводит их до text/texture/style-presets вертикального среза. Каждый primitive
обязан иметь schema migration, CanvasKit/Canvas2D/export parity, memory limits и
failure behavior для missing texture. Богатый scope реализуется этапами, но не
объявляется необязательным MVP-spike.
