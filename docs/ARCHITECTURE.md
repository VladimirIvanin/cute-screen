# Архитектура Cute Screen

## Измерение линейки от видимой области (ADR-076)

`RulerPercentBasis` в payload и renderer-neutral scene допускает canvasWidth,
canvasHeight и canvasDiagonal. Размеры в DOM-free `measureRuler` и helpers
badge/rebase описывают crop либо canvas; world endpoints не меняют систему
координат. Один formatter создаёт короткую подпись для scene, preview/export,
clipboard и conservative badge geometry. Vue добавляет локализованную базу
только в UI. `rulerMeasurementMode` атомарно задаёт unit/percentBasis через
существующую command boundary. Defaults сохраняют базу отдельно от style clipboard.
`setCrop` включает необходимую подгонку bounds всех ruler в rulerChanges.
Codec v7 принимает прежние диагональные документы; если старые full-canvas bounds
недостаточны для crop badge, проверяет прежнюю геометрию и обновляет производные
bounds до создания history, сохраняя world endpoints и payload semantics.

## Измерение текста и transient projection (ADR-062)

`editor-renderer/rich-text` вычисляет soft lines по целым graphemes и измеряет
полные styled fragments, учитывая kerning. DOM-free layout остаётся общим для
Canvas2D и CanvasKit. CanvasKit измеряет mixed Latin/Cyrillic через те же
Fontsource subset chunks, которыми рисует текст; отсутствие face не скрывается.

`editor-vue/text-layout.ts` предоставляет browser font metrics для inline
projection, commit, clipboard/style paste и width resize. Core принимает
необязательный `textHeight` callback при intrinsic resize, не зависит от DOM
и сохраняет сериализуемые commands. Новый point text ограничен 480 document px;
wrapped commit использует существующий v7 fixedWidth. Прежний autoSize не
ограничивается при открытии. BR в DOM projection обозначают только soft lines;
source text и UTF-16 selection offsets не получают новых символов.

Inline toolbar размещается относительно viewport и избегает header/bottom dock,
а не ограничивается шириной снимка. Возврат фокуса в editor отменяет deferred
blur commit; callback старого editing session не может подтвердить новый draft.

## Ограничения линейки и crop (ADR-059/074)

`ruler-constraints.ts` в DOM-free core ограничивает world endpoints текущим
crop/canvas. Shared move delta применяется ко всей selection; resize и rotation
используют те же helpers в transient preview и commit. `CommandManager` готовит
`setCrop`, сохраняя `rulerChanges` с точными before/after слоями; apply/revert
атомарно меняют crop и геометрию, включая locked/hidden rulers. Подгонка
сохраняет направление и style, сокращает длину только при нехватке места.
Move/crop дополнительно удерживают badge внутри по осям, где он помещается;
его percent layout использует исходные canvas dimensions.
Batch без crop не требует дополнительного проигрывания команд. Vue не хранит
реактивный scene graph; persisted schema и IPC не расширяются.
Transient ruler modifier resolver в canvas-controller выбирает Shift 45°
перед Alt configured step и пересчитывает направление из raw pointer.
Pointermove, key-only transitions и pointerup используют одинаковую привязку;
core ограничивает snapped ray краем canvas в preview и commit.

## Актуальность модулей editor в desktop build

Desktop Vite разрешает editor-core, editor-renderer и editor-vue из текущих
исходников. Иначе удалённый `dist/document/scene.js` может перекрыть новый
`dist/document/scene/index.js`, смешав несовместимые варианты spotlight payload.
`build:packages` полностью удаляет outputs TypeScript-пакетов и принудительно
генерирует их заново; incremental metadata не разрешает пропуск emission после
очистки. Persisted schema и renderer contract остаются по ADR-056/058.

## Центр поворота элемента

`rotateLayerTransform` в DOM-free core устанавливает абсолютный угол и
компенсирует translation по разнице преобразованного центра `localBounds`
до/после поворота. Scale и отражения сохраняются. Corner preview/release и
числовой preview/commit Layers используют один helper. Persisted Transform2D,
renderer origin и schema v7 не меняются: старые документы сохраняют внешний
вид. Это исправление механики ADR-035, а не изменение принятого решения.

## Предпросмотр ordered effects при выделении

`requiresScenePreview` объединяет loupe, censor, spotlight и marker.
При move/resize/rotate их временная проекция заменяет исходный слой на прежнем
месте в scene; overlay содержит только selection chrome. Geometry и renderer
используют одно правило. Это сохраняет порядок composite-below и составную
маску фонаря, не передавая precision nodes в `drawNodes2D`, который не может
отрисовать их без ordered surface. Pointer click не меняет документ/history.

## Панель скрытия данных

`CensorFormattingToolbar` подключён через общий `ContextToolbar` для privacy
и переиспользует существующие censor controls/events в defaults, configure,
selection и Quick. Три эффекта видны сразу; region и параметр раскрываются
через `usePreviewPopover`. По ADR-077 control `censorRegion` включается только
в defaults/configure: selection schema не содержит его даже для группы.
Панель скрывает кнопку и закрывает открытое меню при исчезновении control,
не возвращая focus удалённой кнопке. Effect resolver игнорирует `censorRegion`
для готового слоя без command/defaults update. `NumericControl` обслуживает визуальные preset slots,
точный ввод и transient preview; `SimpleColorPicker` — цвет заливки.
`CensorEffectPreview` рисует только демонстрационный фрагмент средствами SVG,
без чтения снимка. Command history, mixed projection, preferences, document v7,
renderer и IPC не меняются. Компоновка следует ADR-048/053/054 и не требует
замены принятого ADR.

## Компактная панель лупы

`LoupeFormattingToolbar` подключён через общий `ContextToolbar` в selection,
creation defaults, configure и Quick. Четыре trigger раскрывают zoom, size,
shape и border; последнее меню содержит цвет/толщину рамки и shadow.
Компонент использует существующие NumericControl, SimpleColorPicker,
usePreviewPopover и effect/command pipeline. Миниатюра circle/rectangle — CSS-контур.
Document v7, renderer и IPC сохраняются; отдельный ADR не требуется:
компоновка следует существующим ADR-048/053/054.

## Производный указатель лупы (ADR-079)

`editor-renderer/precision-rendering.ts` вычисляет lineWidth и вершины
треугольного наконечника в document pixels по border.width и lens.size.
Canvas2D и CanvasKit используют один результат в ordered preview/export.
Snapshot composite-below создаётся до connector; выбранная source handle
остаётся transient overlay. Рамка 0 не скрывает указатель. Новых полей
persisted v7, IPC или Vue state нет; существующие size/border commands
автоматически меняют производные пропорции с прежними cancel/undo/redo.

## Брендовый знак (ADR-057)

`scripts/generate-brand-assets.mjs` хранит общую геометрию монитора с кошачьими
ушами, прищурами и подставкой; производные SVG/PNG/ICO/ICNS создаются до запуска
приложения. Корневой `logo-mark.svg` — прозрачный самостоятельный знак,
`logo.svg`/editor/favicon/bundle — app tile. Embedded tray отделён от app tile;
Windows/Linux получают двухтонную форму, macOS — alpha template с прозрачными
глазами. Document/renderer/IPC и scene graph в этом изменении не участвуют.

## Pencil / Spotlight / Ruler (ADR-056)

DOM-free freehand geometry resolver обслуживает scene и hit testing, сохраняет
sampled pressure/endpoints и применяет smoothing только к pencil. Spotlight payload
содержит непустой массив локальных apertures с IDs; transform принадлежит всему слою.
Renderer композитит общую маску объединения, не последовательные затемнения.
Transient выбор области и numeric draft не сериализуются и не меняют history.
Ruler measurements используют canvas coordinates, clipboard bridge и общий numeric adapter.

## UI-иконки (ADR-055)

`shell/icon.ts` связывает стабильный `IconName` с явными Tabler imports и
проектными иконками. `shell/icons/` хранит типизированную геометрию допустимых
SVG-примитивов и один Vue renderer. Геометрия не попадает в editor-core,
document или IPC. `UiIcon` сохраняет class/style fallthrough, currentColor,
контур 1.8 и декоративную семантику. Потребители не выбирают библиотеку напрямую.
Dev entry `apps/desktop/icons-preview.html` показывает тот же `UiIcon` с
реальными theme tokens; production main не импортирует preview.
Принятый `spotlight` — прямоугольное окно на равномерной диагональной штриховке;
линии подходят встык к контуру. Его геометрия, как у остальных собственных
иконок, находится в `shell/icons/geometry.ts` и переиспользуется в dev preview.
`privacy` использует шахматную сетку 3×3 с заполненными клетками `currentColor`;
светлые клетки задаются локальной `fill-opacity` 0.15. Root-контракт не меняется,
цвет по-прежнему наследуется от кнопки, включая active/disabled состояния.

## Выделитель (ADR-051)

DOM-free highlighter resolver и brightness classifier принадлежат editor-core.
Marker payload сохраняет highlighterMode, а layer.blendMode — конкретный эффект;
legacy appearance не пересчитывается. Настройки жеста фиксируются в CanvasGesture.
HighlighterPreview сохраняет committed backdrop один раз, восстанавливает только
повреждённую область и композитит непрерывный путь с теми же nodes, что export.
Существующий marker при transform-preview композитится в порядке document layers.

HighlighterBackgroundController запускается из frameReady один раз на source load.
Worker сам читает immutable local asset или получает binary Blob structured clone,
декодирует и уменьшает его до 256 px, затем читает OffscreenCanvas. Уменьшение
ImageBitmap на основном потоке исключено: 8K runtime experiment обнаружил long task.
Binary fallback сохраняет Blob в WeakMap, привязанном к decoded image: worker не
зависит от уже revoked object URL. CSP разрешает worker fetch только существующих
local asset/blob источников. Отмена/timeout завершают Worker; stale replies игнорируются.
Результат анализа не входит в document history и не запускается при pointermove.

SimpleColorPicker обслуживает выделитель, stroke стрелок и stroke/solid fill фигур;
первый уровень содержит фиксированные образцы. Custom colour встраивает существующий
DeferredColorPicker. Palette trigger остаётся вне manually positioned NPopover,
чтобы изменение координат не удаляло его из DOM.

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

### Внутренние TypeScript-модули

Каждый TypeScript package организован по предметным доменам, а внутри домена —
по слоям `contracts → model → adapters/ui`. `shared` содержит только действительно
общие primitives и не импортирует предметные домены. Package root `index.ts`
является публичным compatibility barrel; код того же package не импортирует
собственный root barrel.

- `editor-core`: shared geometry/validation, document, tools, commands/history,
  interaction и renderer-neutral scene.
- `editor-renderer`: contracts, resources/text, независимые Canvas2D/CanvasKit
  backends и runtime/scheduler.
- `editor-vue`: shared UI, session/resources, tools, text, canvas и shell.
- `desktop`: generated DTO, platform/Tauri adapters, startup/document/capture
  features и composition roots.

Границы и отсутствие циклов проверяются TypeScript AST test. Vue components не
владеют scene graph: renderer resources, gestures и pointer-move state остаются
в imperative controllers, а Pinia получает только компактную UI/session
projection. Tauri API импортируется только desktop platform adapters.

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
markers вместо bubble/tail.
Callout geometry accepts a DOM-free `CalloutGeometryContext.measureText` callback.
The renderer's measured facade supplies cached rich-text metrics for scene projection,
spatial hit tests, selection handles and rebasing commands. The cache includes content,
styles, wrap width and font-load state, and is invalidated by font-loading events.
Derived geometry on open never changes document/history. The outer width grip edits
v7 `content.wrap/fixedWidth`; endpoints remain fixed in world coordinates. Padded labels
sit outside their endpoint, with a 6 px gap, and are vertically centered. Measured DOM
paragraph struts use the paragraph's largest span; spans retain proportional line height
so mixed font sizes cannot add browser-only leading. Новый text factory
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
- Editor и Quick Capture UI overlay (рамка, handles, размер) имеют backing store
  видимой части canvas в CSS pixels × DPR, независимо от resolution изображения.
  Отсечение по scroll viewport ограничивает bitmap при увеличении 8K-документа;
  прокрутка перерисовывает chrome без переноса scene graph в Vue.
  Vue adapter композитит annotation preview из отдельного временного canvas
  с плотностью сцены `max(1, zoom × DPR)` (bounded pixel budget, ADR-058)
  и рисует UI-векторы в display resolution. Pointer mapping и export сохраняют
  document coordinates независимо от backing store; при неизменном
  layout visible overlay не пересоздаётся на pointermove.
- Selection toolbar использует фактические CSS-размеры canvas. В Quick Capture
  координаты относятся к полному frozen frame; crop вычитается только для
  cropped output полного редактора. `UiSeparator` задаёт независимую геометрию
  декоративных разделителей ToolRail и transient controls.
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

## Переходы инструментов и transient surfaces (ADR-063)

Store `selectTool` очищает выбор при включении creation tools, а общий
workspace lifecycle обрабатывает каждую активацию (включая повторную), закрывая
configure и sampling. UI controller завершает inline text до нового режима;
layer selection использует тот же барьер. `finishTextEditing(continuation)`
дожидается IME/font readiness и выполняет последний переход один раз.
Canvas сообщает `clearSelection` после пустого hit; фон рабочей области имеет
собственный pointer handler, не затрагивающий chrome и pan.

Defaults открываются только по ПКМ/Shift+F10/ContextMenu на кнопке. Снизу
остаётся Crop; selection и inline toolbar сохраняют свои hosts. Flip canvas
доступен в More actions TopBar через typed `canvasAction` и `canEditCanvas`.
`provideTransientSurface` задаёт owner для host и teleported children;
`usePreviewPopover`, colour pickers и UiSelect передают `data-cs-surface`.
Общий overlay root не является внутренней областью каждого поповера.
Outside dismissal не возвращает фокус; Escape закрывает ближайший уровень.
Новые UI-переходы не создают EditorCommand; подтверждённые правки используют
прежний command/history pipeline, scene graph остаётся вне глубокой Vue reactivity.

## Vue UI

Основные компоненты:

- `EditorShell`
- `QuickCaptureShell`
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

Tool settings используют единые компактные ContextToolbar controls (ADR-069).
ToolRail центрирован внизу. Для arrow/shape/pencil/marker/numberedMarker и
precision tools над ним показываются defaults будущих объектов; Crop сохраняет
Apply/Cancel. Выбранные объекты и группы используют единственную transient-панель
у выделения. При inline-редактировании Text/Callout/подписи Numbered Marker
TextFormattingToolbar монтируется над .cs-text-editor без дублирования снизу.
ПКМ и клавиатурный configure фокусируют видимую строку либо открывают явный
popover. Quick Capture показывает автоматическую строку только вне crop.
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

### Area quick capture

Явный Area capture создаёт `QuickCaptureDraftV1`, а не library record. Windows
и X11 создают full-frame draft с `selectionPending`, а первый crop выбирается
уже в Quick surface. macOS создаёт draft после platform selector. Draft может
ссылаться на frozen virtual desktop и physical selection bounds; на macOS это
единый frozen multi-display frame native AppKit selector. Wayland draft
содержит только portal fragment. Pixels доступны Vue только через scoped/binary
transport token. Windows/macOS Window после native selection создаёт документ
напрямую и quick-mode не открывает.

Для X11 Area backend получает один root snapshot до показа capture UI,
декодирует его в canonical RGBA и передаёт как memory-owned BMP transport в
заранее созданную Quick WebView. Native Area selector и selector-to-WebView
handoff в этом маршруте отсутствуют; native X11 selector остаётся только у
Window target. Если client и Mutter frame процесса уже unmapped до команды
(tray, hotkey или CLI), orchestration не начинает новый 300 ms settle. После
недавнего hide оно ждёт только остаток этого интервала, чтобы compositor fade
не попал в новый frozen frame. Если editor видим, hide и проверка фактического
исчезновения client и Mutter frame обязательны до root snapshot.

WebKitGTK получает decoded frame, document session и canvas hosts до reveal.
Quick WebView мапится fullscreen в фазе `selecting`; первый валидный drag
исполняет одну `setCrop` command, подтверждает physical selection в native
draft и меняет только Vue state на `editing`. `EditorShell`, renderer, scene и
overlay canvas, frozen image, dim layer и dash остаются теми же DOM/native
объектами. Toolbar и actions добавляются вокруг существующего crop без
show/hide/focus и без повторного layout-ready gate. Wayland сохраняет
portal-owned system selector и не использует этот X11 маршрут.

Windows Area использует тот же frontend lifecycle: после скрытия `main` backend
подготавливает DXGI duplication, показывает прозрачный non-activating
compositor pulse, ждёт `DwmFlush` и собирает один physical virtual-desktop frame.
Top-down BMP preview кладётся в owned memory transport, а draft помечается
`selectionPending`. Win32 selector в этом маршруте не создаётся; его window
class переиспользуется для pulse, а сам selector остаётся только для Window
target. Prewarmed Quick WebView загружает frozen frame скрытой, затем один раз
показывается в `selecting`; первый валидный drag и переход в `editing`
обслуживают те же `CanvasViewport`, scene и overlay hosts. Окно создаётся в
восстановленном размере Tao (800×600). Первый Windows `set_fullscreen`
ставит мониторные bounds через `SWP_ASYNCWINDOWPOS`, поэтому `show` успевал
показать это обычное окно до интерфейса выделения. Перед fullscreen и `show`
скрытое окно синхронно получает `rcMonitor` монитора под курсором, без
`SWP_SHOWWINDOW` и без отложенного move; тот же commit выполняется в Area
preflight, пока кадр ещё скрыт.

Windows скрывает main на его оконном потоке через синхронный Win32 hide с
временно отключённой через `DWMWA_TRANSITIONS_FORCEDISABLED` анимацией. Подтверждение приходит
после проверки native visibility и `DwmFlush`; только затем начинается backend.
Ошибка/timeout скрытия останавливает capture и восстанавливает editor.
После barrier обычные переходы окна снова включаются (ADR-049).

`QuickCaptureShell` использует тот же document, renderer, `CanvasViewport`,
tool defaults и `EditorCommand`, но не монтирует TopBar, LayersPanel,
SeriesFilmstrip, beautify или watermark. Crop остаётся изменяемым; committed
layers хранят full-frame coordinates и clip-ятся crop. Перед Copy/Save/Editor
DOM-free materializer вычитает crop origin из geometry, заменяет base на hash
cropped original, устанавливает canvas в размер crop и очищает document crop.

При terminal action Editor controller публикует persisted outcome в main
WebView. Обычный (не quick-mode) `CanvasViewport` подтверждает `frameReady` после
фактического `runtime.render(['scene'])`. На Windows native handoff сначала
показывает main и снимает `always_on_top` с Quick, чтобы WebView2 main не был
полностью occluded во время первого frame. После acknowledgement Quick выполняет
`set_always_on_top(false) → hide`; `set_fullscreen(false)` после hide запрещён,
поскольку Windows может remap-нуть скрытое окно как обычное top-level окно.

Draft store допускает одну активную сессию и удаляет staging по cancel, crash,
shutdown и timeout. Подготовка cropped source и финальный repository commit —
разные versioned IPC steps, поэтому frontend получает итоговый hash/metadata до
создания persisted document, а transaction всё равно атомарно связывает bytes,
capture и document. Encoded output загружается в Rust binary transport; JSON и
base64 для изображения запрещены.

## Rust host

Rust host организован по смысловым границам. `capture/quick` владеет runtime
state machine Area draft; `platform/{linux,windows,macos}` содержит только
платформенные adapters; clipboard, activation, fonts, lifecycle и binary image
transport находятся в `services`. Tauri handlers сохраняют прежние command
names и успешные wire shapes, но возвращают единый `CommandErrorV1` и
делегируют durable storage через `StorageHandle`.

### Сервисы

- `CaptureController` — выбирает backend и координирует capture lifecycle.
- `HotkeyService` — Tauri/global-hotkey для X11/Windows/macOS, XDG portal для Wayland.
- `platform/macos` — Screen Recording probe, native AppKit Area/Window selector
  и versioned capture routing при deployment baseline macOS 12.0:
  CoreGraphics fallback на 12.0–12.2, intended one-shot `SCStream` на 12.3–13,
  `SCScreenshotManager` и system window picker на 14+. Area передаёт frozen
  multi-display draft в quick-mode; Window создаёт direct document. Runtime
  availability проверяется динамически; реальные platform smokes ещё pending.
- `cute-screen-storage` — независимый от Tauri workspace crate: синхронный
  `LibraryRepository` принадлежит одному worker, клонируемый `StorageHandle`
  использует bounded Tokio channel и oneshot responses.
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

- DTO объявляются в Rust, сериализуются Serde и через `ts-rs` генерируют
  `apps/desktop/src/generated/desktop-ipc.ts`. `pnpm ipc:check` форматирует
  результат только во временном файле и проверяет tracked binding на drift.
- Большие изображения передаются как scoped URL или binary response/channel.
- Долгие команды получают `operationId`; progress/cancel относятся к конкретной операции.
- Каждый frontend invoke создаёт correlation ID, который попадает в Vue log, Rust span и error object.
- Ожидаемая отмена имеет отдельный код и не записывается как error.
- Любая неожиданная ошибка имеет пользовательский fallback и диагностический контекст.
- Version check использует отдельный network adapter с трёхсекундным timeout; без manual action или opt-in он не делает запросов.

## Хранение и восстановление

SQLite schema v4 содержит как минимум:

- `series`
- `captures`
- `documents`
- `blobs`
- `settings`
- `recovery_journal`
- `history_thumbnails`

Новые изменения схемы являются immutable entries `rusqlite_migration` и
версионируются `PRAGMA user_version`. При `user_version = 0` legacy
`schema_migrations` сначала проверяется по точным version/name/checksum, затем
история принимается без изменения данных; migration 3 удаляет legacy-таблицу.
Повреждённая и future history возвращает typed error до mutation базы.

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

## Tool UX и styles (ADR-048)

DOM-free `styles` определяет creation policy и совместимые визуальные каналы;
style clipboard не переносит идентичность, geometry и content. UI явно разделяет
defaults, inline text и selection; selection changes собираются до одной
`updateLayer`/`batch` command. Floating panel читает компактную UI projection и
обновляет позицию при document/viewport/resize/scroll, скрываясь на canvas gesture.
Scene graph не становится deeply reactive. Preferences v3 независимы от document
v7 и command history, читают legacy drawing settings и хранят per-tool defaults.

`ShapeFormattingToolbar` использует тот же `ContextToolbar` в selection,
creation defaults и tool configure, включая Quick Capture. Его typed shape
projection содержит paint и совместимость редактирования заливки; значения
остальных параметров и mixed/disabled остаются в существующих controls.
Палитра `DeferredColorPicker` может встраиваться в popover без второго trigger;
HEX draft и числовой draft локальны. `fillColor` меняет только solid fill,
не затрагивая stroke, geometry, gradient/pattern/texture resources. Изменения
проходят через существующий selection command collector и defaults preferences;
document v7, renderer contracts и IPC не меняются.

## Каталог фигур и размещение выпадающих панелей (ADR-051)

`editor-core/shapes` хранит нормализованную геометрию и стабильные идентификаторы каталога: 30 shape kinds и rectangle preset с radius. Curved/compound shape компилируется в один `RenderVectorNode` с outline, detail paths и open-contour flag. Stroke-only braces не имеют fill hit area. Hit testing адаптивно аппроксимирует cubic curves; миниатюры используют те же команды. Canvas2D использует scratch composition, CanvasKit — saveLayer, чтобы opacity/blend применялись один раз ко всей фигуре.

`preview-placement` сравнивает верхние, нижние и боковые кандидаты относительно trigger и препятствий. Selection host публикует компактные CSS bounds объекта; popup adapter использует реальный viewport, размеры панели и занятый chrome. Layout observers и resize/scroll notifications не переносят scene или pointermove в Vue state. Defaults, shape, arrow и simple colour popovers сохраняют Naive UI и общий overlay root.

ADR-053 ограничивает зазор между trigger и вложенной панелью 16 CSS px при
доступном trigger. Preview-placement комбинирует горизонтальные и вертикальные
границы преград и минимизирует перекрытие среди близких позиций; заполненный
canvas не отрывает submenu от родительских controls.

### Numeric draft projection (ADR-054)

Числовые controls используют общий NumericControl и NumericPresetGroup.
Shell-owned NumericPreviewController объединяет updates через requestAnimationFrame,
разрешает команды теми же чистыми effect resolvers и передаёт renderer временную
shallow-проекцию. Committed activeDocument остаётся источником истории,
сохранения и export. Defaults поповера не изменяют выделенный объект.
Inline text preview сохраняет полный RichTextEditingState и background до первого
preview; normal formatting/cancel восстанавливает baseline перед применением.
Внешние shell props, schema v7, IPC и масштаб холста сохраняются.

## Различимые кисти (ADR-060)

Новый pencil сохраняет `strokeVersion: 2`, исходные samples и `pressureMode`.
DOM-free resolver возвращает centerline постоянного пера/автокоррекции либо
pressure outline экспрессивной кисти. Canvas2D/CanvasKit используют одну path
или polygon node; non-zero winding hit testing сохраняет прозрачные петли.
Bounds вычисляются по тому же outline. Без strokeVersion действует прежний
алгоритм с весами 1/2/3/2/1 и множителями толщины; открытие не обновляет штрихи.
Переход выбранного объекта на новую кисть проходит одной undoable command.
Preferences хранят отдельные значения коррекции; gesture фиксирует defaults и
источник давления на pointerdown. Финальный sample берёт координаты pointerup,
сохраняя последнее активное pressure при нулевом отпускном значении.
Vue не владеет samples/контуром; обновления preview идут через renderer lifecycle.

## Панель текста и локальные fonts (ADR-061)

UI-реестр содержит 12 bundled family с Latin/Cyrillic static faces 400/700 и
доступными italic. TextFontPicker показывает 32 code points диапазона или текста;
loading/error/retry не изменяют document. FontFaceSet loader кеширует готовые
faces, удаляет failed promise для retry и ждёт обе scripts. Перед scene frame
загружаются используемые document faces. Опциональный CanvasViewportHosts.waitForRender
позволяет Copy/Quick terminal actions дождаться последнего кадра и получить
ошибку renderer вместо предыдущего изображения. Font preview text transient;
schema v7, IPC и inline one-command commit не меняются.

CanvasKit выбирает отдельный subset для script chunks смешанного фрагмента.
Canvas2D resolver допускает список family для headless subset fallback;
production WebView использует штатный unicode-range bundled CSS. Golden runtime
регистрирует реальные файлы всех 12 гарнитур, включая Latin digits у Cyrillic text.

## Номерная метка (ADR-066/067/068)

DOM-free `numbered-marker` рассчитывает квадратную оболочку и безопасный text rect
для circle/square/diamond/star, сохраняя локальный центр при любом transform.
Renderer измеряет portable rich text; подготовка применяется до creation, style,
number edit и style paste. Размер badge зависит только от номера. Rich-text label
содержит строку номера и необязательные следующие строки внешней подписи;
scene разделяет их на независимые text nodes внутри одного слоя. Caption rect
расположен справа с зазором 8 px; union с badge используется в selection/hit-test.
Inline DOM редактирует только caption и использует тот же measured rect. Открытие старого документа не меняет persisted bounds.

`NumberedMarkerFormattingToolbar` используется в defaults/selection/inline;
marker metadata в text schema описывает mode, mixed channels, sequence и warning.
Одноразовый next override хранится в workspace отдельно от persistent styles.
Pointerdown готовит слой без history; pointerup подтверждает один EditorCommand,
pointercancel/Escape сохраняют override. Ghost pointer/cache/RAF принадлежат
canvas controller и не создают Vue updates на каждом pointermove. Schema v7 и
IPC не расширяются; max+1 не зависит от layer order/visibility/lock.

## Настройки до создания (ADR-069)

Внутренняя settings-policy определяет инструменты с автоматической строкой
defaults. Строка использует существующие ContextToolbar schemas и defaults
effects; inline text и selection сохраняют собственные владельцы.
QuickCaptureLayoutController измеряет settings + tools как группу и показывает
её вне crop либо сообщает свёрнутое состояние DOM-событием. Скрытая строка
остаётся измеряемой, но inert и исключена из accessibility tree.
useQuickChromeLayout наблюдает размеры chrome и фиксирует его положение на
время canvas gesture; layout updates не передают pointermove в Vue state.
Numeric drafts и пипетка сохраняют defaults target независимо от показа панели.
Document v7, renderer geometry, native IPC и persistence не меняются.

## Системная активация и отдельное окно настроек (ADR-070)

`shortcuts::host::ShortcutService` хранит постоянные предпочтения в repository,
а фактические регистрации, recorder lease, проверочные нажатия и portal session
держит в памяти Rust. Восстановление запускается до обработки launch intent;
frontend настроек не нужен для работы глобальных сочетаний. Сохранение новой
native комбинации выполняется между staging и освобождением старой регистрации.

Отдельный singleton WebView `settings` открывается из CLI и трея. На macOS его также открывает системное меню приложения. Windows и Linux не рисуют внутриоконную полосу меню (ADR-080).
Он использует activation-settings-adapter и generated IPC DTOs. Запись комбинации
подавляет собственные глобальные действия; blur, закрытие, отмена и истечение
lease возвращают обычную обработку. Все capture-вызовы используют существующий
dispatcher и preflight; перед native capture скрываются Editor и Settings.

Linux выбирает X11, portal либо GNOME по session/runtime probe. GNOME хранит
только собственные custom-keybinding paths, временный token подтверждается через
single-instance CLI. Portal session handles не попадают в постоянные настройки.
Windows/macOS подключают Rust global-shortcut plugin через отдельный registry.
Автозапуск имеет собственный OS adapter и возвращает фактическое состояние;
checkbox first-run не является регистрацией до явного подтверждения.

## Составной штрих (ADR-073)

editor-core владеет transient StrokeState: points, straightSegments, raw cursor,
offset и начало текущего прямого span. Canvas controllers передают pointer и
Shift events, не создавая reactive document updates. Preview и commit получают
одни points/ranges. Pencil v3 хранит индексы spans; общий resolver сглаживает
свободные части отдельно и строит цельный expressive outline. Codec проверяет
диапазоны; resize и style не удаляют их. Legacy и v2 geometry не меняются.
Canvas-controller перехватывает Escape активного stroke в window capture phase,
раньше terminal Close Quick; target/focus и порядок mount parent/child на это
не влияют. Вне stroke и при initial Area selection поведение Escape прежнее.

## Навигация Settings (ADR-075)

SettingsApp владеет разделом general/shortcuts и существующим lifecycle окна.
GeneralSettings показывает язык и автозапуск; ShortcutSettings содержит список
ShortcutRow со встроенным recorder и доступным меню ShortcutActions.
useShortcutRecorder изолирует draft/probe по generation; useSettingsRuntime
подключает реальные keyboard/blur/listener/polling и освобождает lease.
Выбранный раздел не хранится в preferences и не меняет generated IPC.

## Общая временная история (ADR-078)

`history` — отдельный storage domain на существующем single-owner worker.
`captures` содержит protection, legacy consent cohort и viewport JSON; документ
v7 не меняется. `HistoryRequest`/`HistoryResponse` генерируются в IPC bindings.
Список получает только summaries по cursor `(captured_at, id)`, по 50 записей.

Desktop history loader подготавливает и декодирует входящий кадр, flush-ит
исходящий документ и фиксирует active capture перед атомарной заменой session
и source image. Latest-selection generation исключает устаревший mount.
Viewport сохраняется перед capture, switch и close; Undo принадлежит одной
сессии. Документы остаются вне глубокой реактивности Vue.

Preview queue обрабатывает только запрошенные видимые карточки, одной задачей;
OffscreenCanvas worker использует общий Canvas2D saved-scene renderer. При
недоступном worker применяется тот же контракт на отдельном canvas. Crop и
censor входят в результат; selection/overlay отсутствуют. Ключ содержит
document ID, revision и renderer version. PNG передаётся бинарно с opaque
transport token; frontend никогда не получает filesystem path из history API.

Original decoded cache ограничен 256 МиБ, thumbnail decoded cache — 16 МиБ,
thumbnail disk cache — 32 МиБ. Активные leases могут превысить бюджет; это не
обещание ограничения RSS всего процесса. При смене документа освобождаются
старые transport registrations и texture maps.

Maintenance запускается после первого frame/empty startup, сохранения и смены
политики, периодически раз в час. Defaults: 7 дней / 512 МиБ / 200 captures.
Защита, активный документ и loading leases исключаются из автоудаления.
Старые captures мигрируют с `history_legacy_pending=1`; согласие снимается
только через подтверждённый preview. SQL references предотвращают удаление
shared originals и images/textures других документов.

Удаление metadata и `historyCleanup` journal фиксируются одной транзакцией;
затем удаляются только проверенные owned paths. Незавершённый journal
возобновляется maintenance, включая deferred live blob resources. Preview
имеет ограниченное время жизни и fingerprint; изменения истории требуют
повторного review. Отчёт различает files, SQLite allocation и reusable bytes.

История показывает две колонки с фиксированной высотой строки 140 CSS px;
виртуализация и keyboard navigation используют ту же геометрию. Кнопки защиты
и удаления доступны прямо на карточке; промежуточного меню нет. Корзина
открывает существующее подтверждение, Cancel возвращает focus к той же корзине.
Очистка в popover читает все cursor-страницы метаданных, исключает protected и
active IDs и использует существующий preview/commit contract ADR-078. Preview
явно подтверждает удаление старых снимков, но не меняет legacy auto-cleanup
consent. Schema, IPC, storage policy и бинарный transport не меняются.
