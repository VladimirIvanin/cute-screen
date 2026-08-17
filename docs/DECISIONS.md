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

**Статус:** accepted; older-schema migration portion superseded by ADR-031

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

**Статус:** superseded by ADR-033

**Решение:** top bar, tool rail, canvas, bottom contextual toolbar, series filmstrip, layers panel и zoom control сохраняются. Layers panel не дублирует tool options.

**Уточнение:** main editor использует системные window decorations; CSS-клоны системных кнопок не создаются.

## ADR-033 — Transient text formatting bar над inline editor

**Статус:** accepted; supersedes the bottom-only text-settings portion of ADR-012

**Контекст:** FigJam-like text editing держит formatting controls рядом с
редактируемым текстом. Нижний contextual toolbar остаётся единственным местом
для defaults, выбранного-but-not-editing слоя и non-text tools.

**Решение:** при активной inline edit-сессии Text/Callout/Numbered Marker
EditorShell передаёт shared `TextFormattingToolbar` в transient host
`CanvasViewport` над `.cs-text-editor`. Тот же `applyV7TextChange` и
`textFormatting` patch применяются без нового document command до commit.
Во время edit нижний toolbar не показывает text controls. Popover/focus guard
включает floating bar; blur не коммитит edit-сессию.

**Проверяемое основание:** component/e2e regression на порядок controls,
mixed/disabled, focus/blur без commit, responsive overflow 1024/640, позицию
над editor и отсутствие дублирования в bottom toolbar.

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

**Статус:** accepted; older-schema migration portion superseded by ADR-031

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

**Статус:** accepted; text-contract portions superseded by ADR-031

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

## ADR-024 — Fixed reference runner и GPU-complete performance gate

**Статус:** accepted

**Контекст:** software CanvasKit surfaces измеряют CPU raster path и не могут
служить доказательством display budget CanvasKit/WebGL. Нестабильный hosted
runner и CPU-submit duration также не показывают фактическую GPU работу.

**Решение:** M05 использует выделенный Ubuntu 24.04/X11 self-hosted runner:
i7-11700K, RTX 2070 SUPER, NVIDIA 595.84 и WebKitGTK 2.52.3. Real Tauri
renderer измеряется WebGL2 `EXT_disjoint_timer_query_webgl2` тремя независимыми
прогонами (30 warmups + 120 samples); каждый должен дать 4K/500 GPU p95 ≤16,7
ms. Fallback/software renderer, absent extension и GPU disjoint —
infrastructure failure. M13 повторяет тот же gate для build candidate.

**Последствия:** `pnpm test:perf` остаётся software trend и не может закрыть
REQ-QLT-001. Reference workflow ручной, доверенный и не выполняет fork PR;
artifact хранит fingerprint, commit, fixture, CPU/GPU metrics и runtime logs.

## ADR-025 — Portable content resources, staged import и native clipboard

**Статус:** accepted; text-reference and internal clipboard-version portions
superseded by ADR-031

**Контекст:** M07 добавляет переносимый rich text, локальные изображения и
clipboard. Передача bytes через JSON/base64 расходится с существующим binary
transport, а опора на шрифты, emoji или X11-only clipboard хоста делает документ
и Wayland-поведение непредсказуемыми.

**Решение:** документ v4 хранит plain Unicode и portable references, а не DOM
или HTML. Базовый текстовый fallback — проверенные bundled Roboto
Regular/Bold/Italic/Bold Italic; system face описывается family/PostScript/style
reference и при отсутствии даёт явное предупреждение. Emoji хранит grapheme и
versioned reference на approved static asset, а не зависит от системного emoji
font. Image import выполняется staged: native reader помещает raw bytes во
временное operation staging, Rust валидирует signature/limits/EXIF и статически
sanitizes SVG без scripts, events, external URLs и fonts; document transaction
выполняется только после webview decode opaque token. Отмена и ошибки удаляют
только staging.

Internal clipboard использует versioned
`application/x-cute-screen-layers+json;version=1` вместе с PNG и plain-text
fallback. Backend выбирается нативно для каждой платформы (GTK targets для
Linux X11/Wayland, registered Windows format и NSPasteboard UTI); X11-only
abstraction не является Linux implementation. Renderer PNG и импортированные
bytes передаются только raw binary IPC.

**Последствия:** content-layer codec обязан отвергать malformed/non-finite
данные и не переносит transient state. Paste сначала читает атомарный snapshot:
в active document valid internal payload имеет приоритет над bitmap и text;
повреждённый/newer payload допускает bitmap fallback с warning. Cut удаляет
layers одной command только после успешной записи clipboard. Пакеты шрифтов,
SVG и assets добавляются лишь после license/security audit; platform evidence
обязано отдельно покрыть Linux X11/Wayland, Windows и macOS.

Bundled baseline M07 — `@fontsource/roboto` 5.3.0 (OFL-1.1): только
Regular/Bold и соответствующие italic faces. Это audited dependency, включаемая
в webview bundle; установленный system font не подменяет document reference
молча.

## ADR-026 — Transient contenteditable и renderer-neutral rich-text ranges

**Статус:** accepted; text-schema portions superseded by ADR-031

**Контекст:** native textarea не даёт FigJam-like direct editing, selection и
range typography, а сохранение DOM/HTML нарушает portable document contract.

**Решение:** документ v5 хранит plain Unicode, paragraph ranges и
канонические UTF-16-safe span overrides для portable font family и solid color.
`contenteditable` существует только как transient projection: browser владеет
caret/IME/selection, адаптер принимает plain-text paste и строит typed content,
а commit создаёт ровно одну `EditorCommand`. Canvas2D и CanvasKit получают один
renderer-neutral layout contract.

**Последствия:** draft не сериализуется и Escape его откатывает; v4 documents
мигрируют без изменения визуального результата. HTML, arbitrary browser marks,
lists и embedded content не являются document data.

## ADR-027 — Windows capture использует compositor frame

**Статус:** superseded by ADR-029

**Контекст:** GDI `BitBlt` даже с `CAPTUREBLT` не гарантирует совпадение с
видимым результатом DWM. Layered, аппаратно отрисованное или системное окно
может оставаться видимым через selector, но отсутствовать в замороженном кадре;
успешный PNG в таком случае является ложным успехом.

**Решение:** Windows backend получает каждый активный output через DXGI Desktop
Duplication, копирует D3D11 texture в CPU-readable staging и собирает единый
physical virtual-desktop frame до показа selector. GDI desktop capture не
является fallback: недоступность compositor frame возвращает typed capture
failure. Area и Window по-прежнему являются crop одного immutable frame.

**Проверка:** unit tests покрывают row pitch, отрицательные virtual coordinates,
несколько outputs и crop; Windows runtime smoke обязан держать поверх обычного
окна видимое system/layered окно и сравнить контрольные pixels внутри выбранной
области. Успех маленькой синтетической fixture не заменяет этот smoke.

**Последствия:** Desktop Duplication требует D3D11/DXGI и может быть недоступен
в secure desktop, disconnected session или при смене display mode; эти случаи
являются восстанавливаемой ошибкой. Поворот output и mixed-adapter layout входят
в compositor-frame contract и не могут молча деградировать к GDI.

## ADR-028 — X11 capture выбирает фактически видимый drawable

**Статус:** accepted

**Контекст:** при активном X11 compositing manager дочерние окна root могут быть
redirected в off-screen storage, а итоговый desktop рисуется в Composite Overlay
Window. `GetImage(root)` в такой сессии не гарантирует кадр, видимый пользователю,
и способен пропустить верхнее аппаратно отрисованное окно.

**Решение:** backend проверяет owner selection `_NET_WM_CM_Sn`. Без compositor
он замораживает root drawable. При compositor owner он требует Composite 0.3,
получает Composite Overlay Window, читает его и освобождает reference после
получения pixels. Ошибка overlay не деградирует к заведомо неполному root frame.
Wayland продолжает использовать системный XDG Screenshot selector.

**Проверка:** unit contract различает composited и non-composited drawable
policy. Runtime smoke на X11 должен держать поверх контрольного окна отдельное
composited/layered окно и проверить его pixels в frozen frame.

**Последствия:** X11 с активным compositor без Composite Overlay Window получает
typed capture failure. Существующие non-composited X11 smoke остаются валидны,
но не доказывают compositor parity.

## ADR-029 — Windows interactive capture freezes on confirmation

**Статус:** accepted

**Контекст:** ADR-027 исправил источник pixels, но сохранил неверный момент
заморозки: DXGI frame создавался до selector. Если пользователь открывал Area,
переключался через Alt+Tab на другое окно и затем выбирал область, selector
показывал новое окно поверх старого frozen frame, а результат содержал старый.

**Решение:** Windows Area и Window сначала выполняют selection. После terminal
pointer action selector уничтожается, восстанавливается последнее foreground
окно, с которого selector получил activation, выполняется `DwmFlush`, и только
затем через DXGI приобретается один immutable compositor frame и применяется
crop. Screen и Active Window остаются direct snapshots без selector.

**Проверка:** unit contract фиксирует `SelectThenFrame` для Area/Window и
`FrameThenResolve` для direct targets. Runtime smoke обязан открыть Area,
переключиться на контрольное foreground окно при открытом selector, подтвердить
область и проверить pixels нового окна при отсутствии selector pixels.

**Последствия:** визуальная область до подтверждения является live desktop, а
immutable original определяется в момент подтверждения. X11 frozen overlay не
получает это поведение автоматически: его task-switch flow требует отдельного
решения и runtime evidence.

## ADR-030 — Naive UI как слой интерактивных Vue-примитивов

**Статус:** accepted

**Контекст:** editor shell имеет собственные canvas/layout contracts, но
дублирует controls, menus, popovers, focus handling и browser-native form
appearance. Это делает visual language несогласованным и увеличивает стоимость
доступности и keyboard regressions.

**Решение:** `naive-ui@2.44.1` используется только как MIT-licensed,
tree-shakeable слой Vue controls и overlays: buttons, tooltips, dropdowns,
popovers, selects, sliders, number inputs и colour control. `EditorShell`,
CanvasViewport, document commands, scene graph и interaction pointer loop
остаются собственными. Единые Cute Screen semantic tokens задают theme overrides
для light/dark; popup containers монтируются в shell overlay root. Прототип
`prototype-html` служит visual reference, но не production implementation.

**Проверка:** component/browser/Tauri evidence проверяет locale/theme,
accessible names, focus return, Escape/outside close, 1024 px geometry и один
undoable commit для завершённого slider/color/number interaction. License audit
проверяет всю production dependency chain.

**Последствия:** UI cannot import Naive controls into renderer, scene graph or
pointermove path. Existing public shell props/emits and `ContextToolbarSchema`
остаются совместимыми; internal CSS classes не являются public API.

## ADR-031 — Editable document v7 и переносимый минимальный text contract

**Статус:** accepted; supersedes the older-schema migration portions of ADR-005
and ADR-022 and the text-contract portions of ADR-023, ADR-025 and ADR-026

**Контекст:** paint/effect scope ADR-023 и ранний rich-text scope ADR-026
закрепили поля, которые требуют разных layout/rendering contracts в DOM,
Canvas2D и CanvasKit и не нужны для основного annotation workflow. Их
сохранение в common layer fields позволяло обойти ограничения text payload.
Одновременная поддержка миграций v0-v6 скрывала этот разрыв и не давала v7
стать однозначной editable boundary для следующих renderer/editor/UI slices.

**Решение:** schema v7 является единственной editable persisted schema.
Документы v0-v6 не мигрируются и не открываются: parser возвращает typed
`olderSchema` unsupported state с неизменённым raw JSON. v8+ возвращается как
typed read-only `newerSchema` state. Native capture/open/clipboard creation и
TypeScript factories создают только v7. Internal layer clipboard переходит на
`application/x-cute-screen-layers+json;version=2` с явным
`documentSchemaVersion: 7`; payload v1 больше не является editable input.

Text, Callout и Numbered Marker используют общий renderer-neutral rich-text
contract, сохраняя разные container semantics: background block, bubble и
badge. `RichTextSpan` имеет UTF-16-safe range и только portable font family,
font size, solid sRGB color, weight, italic и strikethrough.
`RichTextParagraph` имеет UTF-16-safe range, alignment `start|center|end` и
list kind `none|bullet`. Text background — solid sRGB color, padding и radius.
Новый текст имеет размер 24 px; именованные size presets относятся к UI и не
являются persisted data.

Presets, underline, letter spacing, line-height field, gradient/pattern/texture
text fill, text outline, text shadows и text opacity/blend полностью удалены из
v7. Text-bearing layers не сохраняют эти эффекты через common layer
`opacity`, `blendMode` или `shadows`. Transient `contenteditable`, plain-text
paste, one-command commit и отсутствие HTML в документе из ADR-026 сохраняются.
Paint/effect model ADR-023 продолжает действовать для нетекстовых слоёв.

**Проверяемое основание:** core codec tests обязаны доказать strict v7
round-trip, UTF-16 boundaries, exact span/paragraph coverage, solid colors и
background bounds, отказ removed fields, typed v0-v6/v8+ outcomes и отсутствие
image bytes в JSON. Rust tests обязаны доказать v7 native factory/persistence и
typed rejection older/newer schemas. Clipboard v2 tests обязаны декодировать
v7 text-bearing layers через тот же production parser. Renderer layout,
contenteditable selection и compact toolbar проверяются отдельными slices и не
являются evidence этого schema change.

## ADR-032 — Callout leader line вместо speech bubble

**Статус:** accepted; supersedes the callout container semantics portion of
ADR-031

**Контекст:** bubble/tail callout не соответствует technical annotation
workflow: хвост задаётся эвристикой, текст отрывается от target и toolbar
дублирует bubble-only semantics. Arrow connector text по-прежнему запрещён
(`REQ-TOL-001`).

**Решение:** schema v7 сохраняется; `CalloutPayload` заменяется на leader line:
`target`, `label`, elbow `route`, `stroke`, circle `targetMarker`/`labelMarker`,
optional `background` и общий `RichTextContent`. Старые `bubble`/`tailAnchor`
отклоняются codec без migration. Создание — drag target→label, затем transient
contenteditable. Text/Callout/Numbered Marker делят rich-text contract.

**Проверяемое основание:** codec reject legacy bubble/tail; factory/scene/hit-test
tests для elbow+markers+text; Vue drag/commit и contextual stroke+text toolbar;
browser e2e multiline callout с сохранением active tool.
