# Архитектура Cute Screen

## Цели архитектуры

- Стабильные 60 FPS на типичном 4K-документе без Vue-render на pointer events.
- Одинаковый документ и renderer на Linux, Windows и macOS.
- Явная изоляция X11, Wayland, Windows и macOS backends.
- Локальное, версионируемое и восстанавливаемое хранение.
- Возможность детерминированно тестировать frontend без реального desktop и отдельно тестировать runtime integration.

## Workspace

```text
apps/desktop/                 Vue shell and Tauri frontend entry
packages/editor-core/         DOM-free document, commands, geometry, hit testing
packages/editor-renderer/     CanvasKit/Canvas2D renderers and export surfaces
packages/editor-vue/          Vue adapters, composables and editor components
src-tauri/                    Rust host, capture, hotkeys, storage, clipboard
tests/fixtures/               Versioned production-like image/document fixtures
tests/e2e/                    Browser and real-Tauri WebdriverIO suites
```

Начальная структура может использовать Tauri-стандартные `src/` и `src-tauri/`, но package boundaries выше должны существовать логически и импортироваться только в разрешённом направлении:

```text
editor-core ← editor-renderer ← editor-vue ← desktop shell
      ↑                                ↑
 shared DTOs                      platform adapters → Tauri IPC
```

`editor-core` не импортирует Vue, DOM, Tauri или CanvasKit.

## Модель документа

```ts
interface EditorDocument {
  schemaVersion: number
  id: string
  source: SourceImageRef
  canvas: { width: number; height: number }
  crop: CropRect | null
  layers: LayerNode[]
  presentation: PresentationSettings
  createdAt: string
  updatedAt: string
}
```

`LayerNode` — discriminated union: arrow, shape, pencil, marker, text, numbered
marker, callout, censor, spotlight, ruler, loupe, emoji и image. Общие поля:
immutable ID, transform, visibility, lock, z-order и tool-specific payload.
Opacity, blend и shadows относятся только к нетекстовым composited layers;
text, callout и numbered marker не сохраняют их в schema v7.

Non-unit transform scale является editable capability только image layers.
Non-image resize изменяет payload/local bounds через DOM-free geometry helpers,
сохраняя style values; command boundary не принимает новый non-unit scale для
таких слоёв. Legacy normalization выполняется до создания command history и не
меняет schema v7.

`EditorDocument.source` хранит immutable original provenance и blob reference, но
не является специальным renderer background. Видимый исходный screenshot или
открытая картинка представлены нижним image `LayerNode` с `role: base`, locked
по умолчанию. После unlock этот узел использует общие transform/delete commands;
его удаление не удаляет source blob и не меняет canvas dimensions.

Координаты хранятся в canvas space, независимом от bounds или наличия base image.
Viewport имеет отдельные `zoom`, `panX`, `panY`, DPR и матрицы преобразования.
Crop не меняет исходные координаты и применяется как viewport/export clipping
rectangle. Horizontal/vertical canvas flip преобразует layers и crop одной
document command, но не presentation или viewport.

Schema v7 — единственная editable persisted schema. v0-v6 возвращаются parser
как typed unsupported `olderSchema` без миграции и изменения raw data; v8+
возвращаются typed read-only `newerSchema`.

Ruler payload в strict v7 хранит endpoints, unit, percent basis, angle-step,
`color`, целочисленную `thickness` в диапазоне 1…12 и целочисленный `fontSize`
в диапазоне 10…48. Renderer-neutral scene переносит эти значения без UI state;
angle/snapping остаются семантикой инструмента, а committed on-canvas label
содержит только длину.

Shape использует versioned paint/effect model: solid, multi-stop linear/radial
gradient, bundled pattern или immutable image texture, paint transform,
opacity, curated blend mode, stroke и bounded shadow stack. Arbitrary shader
code в документ не сохраняется.

Text-bearing v7 layers используют общий renderer-neutral rich-text contract:
UTF-16-safe spans содержат только portable font family, font size, solid color,
weight, italic и strikethrough; paragraph ranges — alignment
`start|center|end` и list kind `none|bullet`. Text background, Callout optional
background и Numbered Marker badge остаются разными container semantics и
используют solid colors. Text background хранит также padding и radius.
Callout payload хранит target/label points, elbow route, stroke и circle
markers вместо bubble/tail. Новый text factory
создаёт 24 px text. Presets, underline, letter spacing, line-height field,
gradient/pattern/texture text fill, text outline, text shadows и text
opacity/blend в v7 отсутствуют.

Internal layer clipboard использует MIME version 2 и сохраняет
`documentSchemaVersion: 7`; decode каждого слоя проходит через production v7
parser. Изображения остаются immutable blob references и не попадают в этот
JSON как bytes/base64.

## Команды и состояние

- Любая завершённая правка создаёт `EditorCommand` с `apply`, `revert` и сериализуемым описанием.
- Pointer gesture хранит transient draft вне документа; commit происходит один раз в конце жеста.
- Property drag может показывать live preview, но создаёт одну undo-команду на завершение.
- Новая команда после undo очищает redo branch.
- No-op и отклонённая команда не создают history step, не меняют dirty checkpoint и не запускают autosave. Undo/revert восстанавливает предыдущее committed состояние; после history limit самая старая сохранённая запись становится границей undo.
- Selection, hover, guides, active tool и viewport не сериализуются как слои.
- Pinia хранит UI/session state и компактный `EditorSnapshot`: tool, selection IDs, zoom, dirty, undo/redo availability и active frame.

## Renderer

### Основной путь

- CanvasKit/WebGL2 рисует единый ordered scene graph, включая base raster layer;
  отдельного неуправляемого screenshot-background pass нет.
- Второй canvas рисует hover, selection handles, crop overlay, guides и in-progress gesture.
- Dirty flags разделены на scene, overlay, viewport, resource и export.
- Scheduler объединяет несколько invalidations в один `requestAnimationFrame`.
- Для статичных узлов используются cached pictures; spatial index отбрасывает невидимые узлы.
- Каждый immutable raster/texture blob декодируется один раз, дедуплицируется
  resource manager и повторно используется как GPU resource.

### Compatibility path

- Canvas2D реализует тот же `Renderer` contract.
- Он включается при отсутствии WebGL2, невозможности создать CanvasKit surface или неуспешном восстановлении context.
- UI показывает ненавязчивое диагностическое сообщение, но функции документа остаются доступны.
- Golden suite сравнивает смысловую геометрию и допустимые pixel tolerances двух renderers.

### Экспорт

- Export surface создаётся с итоговым размером и scale вне visible viewport.
- Renderer возвращает RGBA/encoded binary, не base64.
- Rust выполняет атомарную запись и при необходимости JPEG/WebP encoding.
- После записи файл декодируется обратно в release/E2E suite для проверки размера и формата.

## Vue UI

Основные компоненты:

- `EditorShell`
- `TopBar`
- `ToolRail`
- `CanvasViewport`
- `ContextToolbar`
- `ArrowFormattingToolbar`
- `TextFormattingToolbar`
- `SeriesFilmstrip`
- `LayersPanel`
- `ZoomControls`
- `ExportPopover`
- `SettingsWindow`

Компоненты используют semantic CSS variables: surface, raised, sunken, text, muted, border, accent, danger, focus ring, radii и elevations. Raw brand colors не повторяются в SFC.

Tool settings принадлежат нижнему chrome редактора. Горизонтальный `ToolRail`
центрирован внизу; `ContextToolbar` появляется над ним для активных
non-arrow инструментов, precision tools и выбранных слоёв, кроме arrow.
При inline-редактировании Text/Callout/Numbered Marker shared
`TextFormattingToolbar` монтируется в transient host `CanvasViewport` над
`.cs-text-editor`; нижний `ContextToolbar` в это время не дублирует text
controls. Arrow settings не показываются в нижнем toolbar: shared
`ArrowFormattingToolbar` монтируется в transient host над выделенной стрелкой
только при инструменте select, а defaults arrow редактируются через configure
popover на кнопке инструмента arrow. Defaults и форматирование выбранного,
но не редактируемого non-arrow слоя остаются в `ContextToolbar` над rail.
`LayersPanel` не становится вторым inspector: она управляет выбором, порядком,
visibility, lock, rotation и opacity. Список слоёв — однострочные ряды;
opacity и rotation редактируются в шапке панели для выбранного слоя, а не на
каждой строке. При пустом selection она показывает компактную подсказку, а не
пустую широкую панель.

### Naive UI boundary

`EditorShell` hosts `NConfigProvider` and maps the existing locale/theme
preferences to Naive UI’s locale, date locale and light/dark overrides. Naive
UI is limited to interactive controls and transient overlays: buttons,
tooltips, popovers, selects, sliders, number inputs and colour pickers.
Popups are teleported into the shell-owned `.cs-overlay-root`, which provides a
shared stacking context and viewport collision handling.

`CanvasViewport`, the scene graph, renderer and pointer-move path do not mount
Naive UI controls and remain outside Vue’s deep-reactive state. Adapter
components keep local drafts for pointer sliders, colour pickers and number
inputs, committing to the existing contextual-toolbar events only at their
document-command boundary.

## Rust host

### Сервисы

- `CaptureController` — выбирает backend и координирует capture lifecycle.
- `HotkeyService` — Tauri/global-hotkey для X11/Windows/macOS, XDG portal для Wayland.
- `LibraryRepository` — SQLite, blobs, thumbnails и recovery.
- `ClipboardService` — bitmap/text/custom editor MIME.
- `ExportService` — dialogs, atomic output, format encoding.
- `WindowService` — editor, overlay, pin, tray и single-instance.
- `DiagnosticsService` — structured rotating logs и diagnostic bundle.
- `VersionCheckService` — manual/opt-in запрос GitHub tags, SemVer comparison и ETag cache; не скачивает и не устанавливает binaries.

### Backend traits

```rust
trait CaptureBackend {
    fn capabilities(&self) -> CaptureCapabilities;
    async fn capture(&self, request: CaptureRequest) -> Result<CapturedFrame, CaptureError>;
}

trait HotkeyBackend {
    async fn bind(&self, action: CaptureAction, shortcut: Shortcut) -> Result<Binding, HotkeyError>;
    async fn unbind(&self, action: CaptureAction) -> Result<(), HotkeyError>;
    fn capabilities(&self) -> HotkeyCapabilities;
}
```

Backends не возвращают UI-строки. Они возвращают стабильные error codes, context и capability flags.

## IPC и диагностика

- DTO объявляются в Rust, сериализуются Serde и генерируют/проверяют TypeScript types.
- Большие изображения передаются как scoped URL или binary response/channel.
- Долгие команды получают `operationId`; progress/cancel относятся к конкретной операции.
- Каждый frontend invoke создаёт correlation ID, который попадает в Vue log, Rust span и error object.
- Ожидаемая отмена имеет отдельный код и не записывается как error.
- Любая неожиданная ошибка имеет пользовательский fallback и диагностический контекст.
- Version check использует отдельный network adapter с трёхсекундным timeout; без manual action или opt-in он не делает запросов.

## Хранение и восстановление

SQLite содержит как минимум:

- `schema_migrations`
- `series`
- `captures`
- `documents`
- `blobs`
- `settings`
- `recovery_journal`

`captures.capture_metadata_json` хранит versioned provenance v1: backend,
target, geometry, monitor snapshot, cursor и invocation source. Все ключи
присутствуют; недоступные значения записываются как `null`.

Файл оригинала сначала записывается во временное имя в той же файловой системе, синхронизируется и атомарно переименовывается. После этого транзакция базы связывает blob с capture. Незавершённые записи находятся по recovery journal при следующем запуске. Unreferenced blobs очищаются только отдельным безопасным maintenance flow.

## Безопасность

- Tauri capabilities выдаются минимально каждому окну.
- Asset scope ограничен каталогами библиотеки и временного export.
- Путь из frontend не используется напрямую без canonicalization и allowlist проверки.
- SVG image layer декодируется как изображение; скрипты и внешние ресурсы не исполняются.
- Clipboard и file dialogs вызываются только пользовательским действием.
- Diagnostic bundle исключает содержимое снимков по умолчанию.
