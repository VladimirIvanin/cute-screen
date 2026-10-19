# Архитектура Cute Screen

## Wayland raw-frame capture (ADR-118/119/120)

Area/Screen/Repeat используют XDG ScreenCast Monitor session. Разрешённая сессия
разделяется между clones CaptureController; повторный capture не вызывает
CreateSession/SelectSources/Start. Новый PipeWire consumer получает один raw
RGBA кадр в его negotiated resolution и закрывается, разрешение остаётся до
выхода/отзыва. Новая авторизация и успешный reselect ждут 350 мс после
portal response до публикации сессии: consumer открывается после запаса на
исчезновение permission dialog. Cached authorization, cancel и error не ждут.
Frame fitting/crop работают в пикселях выбранного монитора;
desktop geometry не синтезируется. Межмониторное выделение не заявляется.
Probe проверяет Monitor, Hidden cursor и создание pipewiresrc/videoconvert/appsink.
Stride, размер и полнота кадра проверяются до staging: Area — memory-owned BMP,
Screen — fast lossless PNG. Settings может заменить разрешённый монитор; cancel
сохраняет прежнюю сессию. Pipeline videoscale
и фиксированные уменьшенные caps отсутствуют. При ошибке нет Screenshot/X11 fallback.
Linux entry использует native Wayland для preview, исключая inherited XWayland.

Probe/capability handshake имеют короткий технический timeout. Screenshot
request/response не имеет прикладного deadline выбора: в ashpd 0.13.13 уже
`send().await` ожидает Response signal. `response()` извлекает готовый результат.
Это сохраняется для Window/Active Window и первого ScreenCast Start: время
ответа пользователя не ограничивается техническим handshake timeout.
Причины и ограничения — [Linux capture](LINUX_CAPTURE_RESEARCH.md).

## Windows/macOS GUI lifecycle (ADR-115)

Публичный capture CLI компилируется только для Linux. Windows/macOS не имеют
help/version flags и CLI fallback; внутренние launch intents остаются едиными
для tray, автозапуска, settings и single-instance. Скрытый --startup-check
проверяет запуск связанного binary без mount приложения. Windows release
использует GUI subsystem, без создания/подключения консоли. Quick WebView
создаётся non-resizable на Windows до установки native resize handler.
DXGI использует общий deadline для повторных WAIT_TIMEOUT и проверяет Rotation
до подготовки duplication. Ошибки не подменяются успешным неполным кадром.

## Загрузки лендинга (ADR-113)

Vite подставляет единый release snapshot в HTML обеих локалей; DOM-модуль
меняет только hero-рекомендацию через Navigator/optional Client Hints. Полный
список — обычные ссылки. CI получает актуальный каталог из GitHub API до build;
локально используется snapshot v0.1.5. Desktop и IPC не затрагиваются.

## Независимые проверки CI (ADR-112)

`ci.yml` задаёт matrix семи Linux tasks; reusable `ci-linux.yml` содержит общий
setup и исполняет только шаги выбранной task. Jobs не зависят друг от друга;
fail-fast выключен. Browser/native E2E по умолчанию ограничены smoke;
manual `full_e2e` включает прежние полные suites. Артефакт Linux x64 сохраняет
имя `linux-x64-ubuntu22-<sha>`, поэтому release publisher использует его без
изменения контракта. Reusable `checks` завершается успешно только после всех
tasks и compile matrix; независимая сборка не обходит release gates.

## Публикация установщиков (ADR-111)

`release.yml` фиксирует SHA version tag и вызывает reusable `ci.yml` с этим SHA.
После полного CI Linux packages берутся из artifacts того же workflow run;
Windows/macOS package jobs собирают соответствующий tagged source. Release
tooling отдельно checkout-ится из workflow commit, чтобы ручной запуск мог
добавить assets к более старому тегу без изменения его исходников.
`release-assets.mjs` подготавливает platform manifests, SBOM и license report;
`publish-release.mjs` проверяет комплектность, SHA-256 и актуальность tag,
прикрепляет файлы, повторно скачивает их и обновляет управляемую секцию Downloads.
Write token существует только в publisher; package jobs имеют read-only token.

## Метаданные версии в Settings (ADR-108)

AppVersion владеет только transient loading/error состоянием и читает
версию через app-version-adapter. Desktop получает package metadata Tauri;
browser preview использует Vite define из tauri.conf.json. Компонент
находится в общей боковой панели вне загрузки и навигации Settings.
Настройки, scene graph и IPC schema не меняются.

## Закрытие меню трея перед захватом (ADR-107)

Только capture_request_for_tray задаёт 200 мс delay. После preflight/hide
CaptureController захватывает single-flight и асинхронно ждёт с поддержкой
cancel до вызова backend. Hotkey, CLI и UI используют прежние requests.
Новых таймеров в Vue, блокирующего UI sleep или изменений image transport нет.

## Native focus фонового Quick Capture (ADR-106)

После mapped warmup Linux reveal устанавливает GTK accept-focus синхронно.
Для GDK X11 получает текущий server timestamp, обновляет user time и вызывает
present_with_time на уже существующем Quick window. CURRENT_TIME из очереди
Tao недостаточен для prewarmed окна с устаревшим user time в Mutter. Окно,
renderer и frozen frame не пересоздаются. Wayland использует общий Quick
lifecycle (ADR-118/119); GDK Wayland presentation использует обычный GTK present.
Native focus доказывается до WebDriver switchWindow и любого click по Quick.

## Внешняя атрибуция эмоджи (ADR-105)

Tauri host регистрирует opener plugin; его initialization script обрабатывает
обычные ссылки target=_blank, включая активацию клавиатурой. Отдельная
capability emoji-attribution связывает точный upstream URL с main и
quick-capture. Компонент палитры не импортирует native API. Production и
native E2E используют одну capability; браузерный preview использует href.

## Ширина подписи выноски (ADR-103)

CalloutWidthControl владеет только transient dropdown: общий preview-placement
размещает его относительно кнопки и защищаемой подписи, Teleport сохраняет
surface owner. TextFormattingToolbar закрывает соседние popover. NumericControl
сохраняет cancel/minimum/focus; прежний calloutTextWidth adapter обслуживает
inline draft и EditorCommand. Default auto-size, scene graph и схема не меняются.

## Углы рамки изображения (ADR-097)

Image scene-проекция использует miter join независимо от persisted border.join.
Только radius определяет форму углов: 0 сохраняет прямой внешний контур рамки,
положительный radius строит общий rounded path. Canvas2D/CanvasKit и экспорт
получают один RenderImageNode; schema v7 и command lifecycle не меняются.

## Линия (ADR-100)

Line — UI tool с отдельными drawing defaults и repeat policy. Persisted arrow
payload v7 содержит optional annotationTool: line; общий resolver определяет
панели, названия слоёв, style channels и defaults. Renderer/hit testing/bounds
переиспользуют arrow geometry без caps. autoAlignAxes остаётся UI preference;
transient lineAxis/rawCurrent не принадлежат реактивному документу Vue.

## Изолированный Window capture (ADR-091)

Window имеет отдельный native selection lifecycle. Windows/X11 сохраняют
native identity и owner в Rust, AppKit 12–13 — CGWindowID/PID, системный picker
macOS 14+ — opaque SCContentFilter. Эти значения не пересекают IPC. Общая
Rust selection state задаёт initial hover, front-to-back hit test, same-target
press/release, Enter и Tab/Shift+Tab; пустой выбор остаётся открытым.

Windows получает один WGC frame, X11 читает named pixmap WM-frame, macOS
использует single-window CoreGraphics/SCStream/SCScreenshotManager по runtime
availability. Desktop preview selector не является источником Window original.
Wayland запрашивает только advertised portal v3 Window; fallback к Area явный.
Capture metadata отражает источник Window pixels. Existing binary transport,
immutable original и прямой document mount сохраняются; Quick draft не создаётся.
Native failure возвращает типизированный outcome, поднимает существующий editor
и показывает RU/EN recovery с повторным выбором и явным переходом к области.

## Заливка и обводка фигур (ADR-092)

Shape UI предлагает none/solid/linear без удаления radial из schema v7.
Линейная заливка изменяется атомарным внутренним `fillGradient`: полный
проверенный paint с 2–8 точками, нормализованными start/end и opacity.
Индекс выбранной точки и drag draft принадлежат панели; отпускание создаёт одну
EditorCommand, смешанное выделение использует существующий batch routing.
Базовые rect/ellipse/polygon scene nodes передают dash и lineCap наравне с vector.
Круглые shape dots имеют `[0, width * 2]` и round cap; arrow/path семантика прежняя.

## Выноска: единая геометрия и transient editing (ADR-090)

CalloutRoute дополнен quadratic/bend, attachment — auto; optional поля v7 и старые
routes читаются без миграции. UI сводит routes к line/stepped; style extraction
копирует только preset, без bend/waypoints. Core определяет label visibility,
resolved attachment, tangent/accent, bounds/handles и адресное удаление ступени.
Empty rich text имеет пустые spans/paragraphs; скрытая подпись не участвует в сцене,
hit testing и bounds. Редактор пустой подписи использует временную измеренную область.
Alt deletion хранится в pointer gesture, preview/minus рисуются overlay без Vue
scene updates; один updateLayer возникает только на допустимом pointerup.

## Управляемые выноски (ADR-087)

Callout остаётся одним LayerNode. `route` поддерживает straight, corner, elbow
и orthogonal с внутренними точками, исходным preset и axis. `attachment`
закрепляет сторону подписи; отсутствие attachment/frame сохраняет legacy v7
placement без миграции. Optional frame хранит kind, solid fill, border,
padding/radius; optional endpoint styles — независимые size/color.
CalloutStyle/defaults/clipboard styles сохраняют только вид и route preset,
никогда промежуточные точки, координаты или содержимое.

DOM-free callout-route/callout-geometry обслуживают измеренный scene, handles,
hit testing и rebasing. Наконечники используют общую Arrow/Callout проекцию.
callout-label-geometry задаёт измеренные границы подписи. Если закреплённая
сторона обращена от цели, callout-attachment-route перестраивает прилегающий
участок снаружи подписи, сохраняя сторону и более ранние ручные точки.
Это локальный подход к собственной подписи, а не обход соседних объектов.
Transient insertion request проходит через существующий formatting adapter;
до завершения pointer gesture history не меняется. Escape/lost capture отменяет
gesture. Подпись имеет приоритет над свободной рамкой выделения и переносится
с сохранением target. Scene graph не становится глубоко реактивным.

## Изображение: панель и временная geometry (ADR-086)

ImageFormattingToolbar использует existing image control IDs и общий NumericControl
preview/commit service; цвет и толщина рамки находятся в одном popover. Host
изображения любого размера и вложенная панель используют preview-placement.
SceneDocumentController сохраняет временный image layer на исходном месте сцены;
CanvasGeometryController не отдаёт его в lightweight overlay. CanvasRendererController
обновляет ordered scene с существующими decoded resources на gesture invalidation.
Scene graph не становится глубоко реактивным; history/schema/IPC не расширяются.

## Политики взаимодействия с выделением (ADR-085)

`interaction-policy` в editor-core исчерпывающе покрывает LayerKind.
`resolveSelectionTarget` объединяет точный и расширенный hit-test, общую
рамку и показанные handles; CSS scale передаётся из фактического canvas rect.
Canvas adapter держит spatial index вне Vue и обновляет только изменённые
или удалённые layers при новом immutable snapshot. На pointermove запрос
работает по локальным кандидатам индекса, а не по всему документу.
Точные вызовы без options сохраняют историческое поведение. Renderer
пробрасывает hit options и измеренные text/callout metrics.

`layerSelectionHandles` является источником позиций для overlay и pointer
resolver. Hover/gesture — imperative transient state, без Vue scene graph.
Move фиксирует IDs и начальную позицию; порог проверяется в CSS client pixels.
Multi-selection preview двигает весь выбранный набор, commit передаёт
зафиксированные IDs существующему command adapter. Маленькое выделение
получает pointer-captured move grip в единственной selection-панели.

## Windows capture visibility (ADR-082)

Owning-thread hide вызывает Tauri hide внутри отключённых DWM transitions,
затем проверяет HWND visibility и DwmFlush. Framework и native state остаются
согласованы для следующего show. Windows Quick present готовит fullscreen
скрытого окна; reveal показывает его после стабильных viewport/scene/bitmap
и применения Fit. Selection gate не зависит от отсутствующих до drag панелей.

## Вставка изображения (ADR-081)

Shared content controller владеет transient операцией G/paste/drop и проверкой
session identity после await. Canvas adapter измеряет viewport/crop/chrome и
передаёт DOM-free placement helper только document-space bounds. Scene graph
не становится реактивным; результат вставки проходит существующий addLayer
и creation policy. Native drop выдаёт одноразовый window-bound file token,
байты проходят ограниченный reader и binary image transport. Native DTO
генерируется в desktop IPC; serde regression проверяет фактический JSON.

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

Дополнение ADR-093: generator также создаёт `BrandMark.vue` и inline SVG
в RU/EN HTML. DOM-only `attachBrandEyes(host): dispose` используется TopBar
через mount/unmount и отдельным landing entry. События меняют цель взгляда,
rAF обновляет только transform группы прищуров и останавливается после settle.
Scene graph, Vue render cycle и постоянный idle loop в движении не участвуют.
Blur/hidden/pagehide/reduced motion сбрасывают взгляд; dispose удаляет listeners.

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
Принятый `callout` — карточка с подписью, ступенчатой линией и точкой цели;
`calloutGeometry` из `shell/icons/geometry.ts` используется общим `UiIcon`
в editor, Quick Capture, gallery и при генерации SVG лендинга.
`strokeWidth` — три линии с толщиной 1/2/3; общий значок настройки штриха
для стрелки, линии, фигуры, выноски и линейки. Образцы типа штриха остаются в меню.
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
Callout payload хранит target/label points, route, stroke и независимые markers;
optional attachment/frame расширяют оболочку по ADR-087. Прежние elbow/circle
payload сохраняют прежний вид вместо bubble/tail.
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
содержит raw кадр выбранного монитора через memory-owned BMP с pending selection
(ADR-118/119).
Pixels доступны Vue только через scoped/binary
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
show/hide/focus и без повторного layout-ready gate. Wayland использует тот же
Quick lifecycle после получения raw кадра через XDG ScreenCast (ADR-118/119),
без вызовов X11 adapter.

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

## Карандаш и совместимость старых кистей (ADR-060/094)

Доступны pen/stabilized. Preferences brush нормализуются в stabilized с памятью
автокоррекции либо 65%. DocumentSession при открытии editable документа выполняет
одну `migrateExpressiveBrushes`: hidden/locked включены, snapshots проверяются,
samples/spans/appearance/transforms сохраняются, bounds пересчитываются.
Миграция участвует в undo/redo, dirty и автосохранении; read-only путь не меняется.
Описанная ниже pressure geometry сохраняется для чтения старых payload и undo.

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

ADR-113: stabilized v2/v3 после perfect-freehand скругляет свободные стыки
квадратичными кривыми с адаптивной аппроксимацией (0,1 document px).
Общий helper возвращает centerline для единственной path node; endpoints и
Shift anchors закреплены. 0% и pen возвращают исходные samples. Render,
hit testing, bounds и экспорт используют тот же результат без Vue state.

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

ADR-102: canvas gesture boundary отправляет bubbling `cs-quick-frame-gesture`
только при смене active frame gesture. `useQuickChromeLayout` скрывает chrome
через transient class на Quick root и пересчитывает layout по завершении.
Панели остаются mounted и измеряемыми. Pointermove не проходит через Vue state.

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

ADR-083 добавляет вход из main editor: EditorShell принимает optional async
`openSettings`, desktop использует существующий activation-settings-adapter.
EditorSettingsPopover владеет только transient show/pending/error/focus;
тема и язык используют прежние UiPreferences, отражения — EditorCommand.
Новые IPC DTOs, native команды и поля документа не вводятся.

`open_activation_settings` и вход истории `settings_open_history` исполняются
как async IPC commands: синхронное
создание WebView из UI-thread IPC на Windows блокирует WebView2. Существующий
builder/singleton и ошибки сохраняются; задача освобождает UI event loop.

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

## PNG export полного editor (ADR-083)

`CanvasViewportHosts.exportPng` передаёт committed document в renderer, используя
его decoded image resources, применённый crop и scale=1. Preview scale и transient
слои не определяют output. Desktop action завершает edits перед запросом Save As.
Native result-export service хранит выбранный путь за одноразовым ticket; frontend
передаёт только ticket и raw PNG. Запись выполняется вне UI thread. После cancel,
write или failure ticket удаляется; canonical destination не может быть внутри
каталога библиотеки. JPEG/WebP и export settings пока не реализованы этим путём.

PNG filename preferences (ADR-084): Rust export_filename владеет validation,
local-clock formatting и SQLite key export.filename.v1. Generated DTO содержит
pattern/defaultPattern/preview. General Settings хранит только transient draft;
preview requests проверяют revision, Save атомарно обновляет единственное setting,
Cancel не пишет. Editor и Quick получают suggested name при открытии диалога,
поэтому сохранённый выбор действует сразу в обоих окнах без broadcast/cache.

## Локаль native tray (ADR-088)

Desktop сохраняет существующий UiPreferencesV1 под тем же ключом
cute-screen.ui-preferences.v1 в SQLite settings. При первом подключении
переносится browser preference или системная локаль WebView. Перед mount
native preference восстанавливает browser storage. Main/Quick/Settings используют
один shell store; Settings больше не держит независимый locale ref.
Settings при setup сразу отражает resolvedTheme и locale в корневых HTML
атрибутах, затем наблюдает общий store и системный prefers-color-scheme;
media listener освобождается при unmount. Цвета всех разделов и native controls
берутся из существующих semantic tokens, как в editor.
Adapter сериализует записи, принимает native broadcast без обратной записи и
не заменяет более новый локальный выбор ответом на предыдущий save. Ошибка
сохранения видна в Settings; повторный выбор языка повторяет попытку.
Tray creation и shortcut refresh берут locale из native repository и используют
общие переводы всех восьми пунктов. Горячие клавиши и capability enabled flags
не зависят от перевода. macOS Settings menu item использует ту же локаль.

### Встроенные эмоджи (ADR-101)

EmojiLayer проецируется в image node с resource ID из collection/version/assetId.
Каталог DOM-free; загрузчик bundled Noto 2D находится в editor-vue и разделяется
между canvas, экспортом и history. Pointer ghost обновляет DOM style без Vue
реактивности pointermove. SVG resources загружаются локальными file URLs и кешируются;
в IPC/JSON идут только ссылки. History worker получает предварительно отрисованные
PNG blobs. Неизвестная версия пака — явная ошибка ресурса.

## Quick actions и History completion (ADR-096)

QuickCaptureActions — presentation-only вертикальная панель пяти UiIcon-кнопок.
QuickCaptureActionController завершает inline text/crop через prepareNavigation
перед History, затем использует общий QuickCaptureCommitController. CaptureCompletion
расширен history; Rust commit сохраняет clean crop и editable document атомарно.
Materialized flag защищает dismiss retry от дубликатов; pending блокирует конкуренцию.
Только editor completion запускает native mount handshake. X11 UI dispatcher
не восстанавливает main для history. Обычная фоновая загрузка capture сохраняется.
