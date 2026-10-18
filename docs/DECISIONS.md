# Журнал архитектурных решений

## ADR-108 — Текущая версия в боковой панели настроек

**Статус:** accepted (2026-10-18); дополняет ADR-018 и REQ-UI-015.

**Контекст:** пользователь не видит номер запущенной сборки в интерфейсе.

**Решение:** показывать локализованную строку версии под Cute Screen в
Settings sidebar. Typed native adapter использует Tauri getVersion;
settings capability получает только core:app:allow-version. Browser preview
получает номер из tauri.conf.json через Vite define. Строка доступна во всех
разделах, выделяется для копирования и не зависит от загрузки настроек.
Ошибка метаданных допускает повтор, не блокируя остальной интерфейс.

**Проверяемое основание:** browser UI RU/EN × light/dark при 820×720 и
620×520 сохраняет видимую версию при смене разделов; unit проверяет
отложенный ответ native metadata, prerelease, локализацию и retry.
Native acceptance сравнивает видимый номер с конфигурацией сборки.
Фактические результаты и ограничения — TESTING.md.

## ADR-107 — Короткая пауза захвата только из меню трея

**Статус:** accepted (2026-10-18); дополняет ADR-010/041 и REQ-CAP-006.

**Контекст:** tray menu event приходит до завершения закрытия меню системным
композитором. Немедленный Area замораживает собственное открытое меню.

**Решение:** фабрика запросов трея задаёт delay_ms=200 для Area, Screen,
Window, Active Window и Repeat. Используется существующий асинхронный delay
CaptureController с cancel signal и single-flight; блокирующего sleep в
UI thread нет. Остальные ingress сохраняют свои задержки без добавочной
паузы. Это ограниченный запас на закрытие меню, не универсальный сигнал
завершения анимации любого desktop shell.

**Проверяемое основание:** red-first Rust отмена tray request видит Selecting
вместо Delay до исправления; после него backend не вызывается, draft и документ
не создаются. Проверяется delay всех пяти tray actions. Native GNOME X11
menu click → Area/Screen проверяет декодированные пиксели под прежним меню.
Команды, результаты и границы других платформ — TESTING.md.

## ADR-106 — Native focus Quick Capture при фоновом X11-захвате

**Статус:** accepted (2026-10-18); дополняет ADR-039/041 и REQ-CAP-012.

**Контекст:** установленный DEB показывает selector с DEMANDS_ATTENTION,
оставляя keyboard focus в чужом приложении. Esc не попадает в WebView.
Tao `set_focus` асинхронно вызывает GTK `present_with_time(CURRENT_TIME)`;
prewarmed tray window может иметь устаревшее user time. WebDriver
`switchWindow` самостоятельно активирует окно и скрывает этот дефект.

**Решение:** Linux reveal выполняет accept-focus и opacity синхронно на GTK
thread. Для фактического GDK X11 window получает свежий server timestamp,
обновляет user time и выполняет `present_with_time(timestamp)` на том же
окне. Другие GDK backends используют GTK present, системный XDG selector
не меняется. gdkx11 0.18.2 уже присутствует в dependency graph GTK/Wry;
добавляется прямое MIT dependency без нового native backend или unsafe кода.

**Проверяемое основание:** native CLI smoke из постороннего активного окна
сравнивает _NET_ACTIVE_WINDOW с Quick XID до ввода и до WebDriver switch.
Первый и повторный Escape, а также Escape во время начального drag должны
давать typed cancelled. Старый установленный ELF воспроизводимо проваливает
focus assertion; ручная активация выполняется исключительно при cleanup.
Фактические SHA256, команды и результаты — TESTING.md.

## ADR-104 — Ubuntu 22.04 как база распространяемых Linux-сборок

**Статус:** accepted (2026-10-18); уточняет REQ-REL-001.

**Контекст:** существующий release ELF, собранный на Ubuntu 24.04, требует
GLIBC_2.39. В Ubuntu 22.04.5 с glibc 2.35 его `--help` завершается ошибкой
загрузчика даже при установленных GTK/WebKit runtime libraries.

**Решение:** Linux x64 и ARM64 собираются нативно на Ubuntu 22.04; local
packaging использует Docker с такой же базой и отдельными Cargo/JS outputs.
Проверка фактических ELF version requirements запрещает GLIBC выше 2.35,
включая weak imports. DEB явно требует libc6 >= 2.35 и WebKitGTK 4.1 >= 2.40;
системный WebKitGTK должен получать обновления Jammy. AppImage также собирается
на Jammy: упаковка сама по себе не устраняет glibc ABI requirements.
Существующий reference-perf runner Ubuntu 24.04 из ADR-024 сохраняется;
его локальные бинарники не являются распространяемыми Jammy artifacts.

**Проверяемое основание:** отрицательный ABI gate на прежнем ELF, новая сборка
через `pnpm build:linux:ubuntu22`, положительный ABI gate и запуск пакетов в
Jammy. Фактические результаты — TESTING.md. Физический захват, Wayland portals,
clipboard и ARM64 runtime требуют собственных платформенных доказательств.

## ADR-097 — Радиус изображения определяет углы рамки

**Статус:** accepted (2026-10-18); дополняет ADR-086/089.

**Контекст:** сохранённый border.join=round скруглял внешний контур толстой
рамки даже при показанном radius=0. Значение панели не соответствовало pixels.

**Решение:** общая image scene-проекция всегда задаёт miter join; положительный
radius продолжает строить rounded path, нулевой — прямоугольный. Это устраняет
независимое скругление обводки в обоих backend и экспорте. Persisted v7 payload,
команды, undo/redo и originals сохраняются без миграции.

**Проверяемое основание:** red-first core tests для round/bevel/miter и
decoded Canvas2D/CanvasKit PNG с 4K source, рамками 26/32 px и radius 0/80;
четыре внешних угла и preview/export parity. Production UI evidence и
фактические ограничения — TESTING.md.

## ADR-095 — Образец эффекта в кнопке выделителя

**Статус:** accepted (2026-10-18); дополняет ADR-051, не заменяя его.

Свёрнутая кнопка режима показывает образец 36×24 px и подпись результата
«Темнее / Светлее / Окрасить». Названия и пояснения внутри меню сохраняются.
Общий Vue sample накладывает текущий цвет/интенсивность поверх демонстрационных
фона и текста через multiply/screen/normal, оставляя края исходного фона.
Авто показывает resolved effect из существующей schema; pending и mixed
не изображают выдуманное значение. Доступное имя Effect/Режим сохраняется,
описание и tooltip объясняют результат и fallback. Высота trigger — 36 px.
Schema документа, IPC, renderer и команды не меняются.

**Проверяемое основание:** component tests состояний, реактивного цвета и
интенсивности, доступного описания и focus; shared browser/WebView2 scenario
выбирает режимы реальным вводом и декодирует screenshot образца, проверяя
направление изменения яркости. Команды, результаты и платформенные пределы — TESTING.md.

## ADR-093 — Живой взгляд в блоках бренда

**Статус:** accepted (2026-10-18); дополняет ADR-057.

Наведение на весь блок бренда в editor и RU/EN landing запускает короткий
взгляд влево/вправо, затем прищуры следуют за курсором; уход возвращает знак
в исходное состояние. Единственный источник геометрии остаётся brand generator:
он создаёт Vue-компонент и inline SVG-фрагменты HTML с отдельной группой глаз.
Тёмные прищуры накладываются на белый силуэт; меняется только transform группы.
Tray/favicon/bundle и исходная геометрия ADR-057 остаются статичными.

Общий DOM-only контроллер не импортирует Vue, Tauri или document code.
На pointermove меняется цель, rAF работает только пока движение не завершено.
Touch/reduced motion отключают эффект; blur, hidden и unmount его останавливают.
Inline SVG и все ссылки лендинга доступны без JS. Новых focus stops нет.

**Проверяемое основание:** контролируемые временные тесты последовательности,
limits, settle/cancel/dispose; настоящее browser/WebView наведение; размеры
30/31/36 px, обе локали/темы, no-JS navigation и независимый landing bundle.
Фактические результаты и платформенные ограничения фиксируются в TESTING.md.

## ADR-094 — Два режима карандаша и краткие подсказки

**Статус:** accepted (2026-10-18); supersedes выбор трёх кистей и сохранение
экспрессивных штрихов без преобразования из ADR-060. Уточняет краткие tooltip ADR-069.

**Контекст:** пользователь отказался от экспрессивной кисти и выбрал замену
старых экспрессивных штрихов автокоррекцией. Пояснения Shift/45° удаляются из UI.

**Решение:** доступны pen/stabilized. Старые brush payload остаются читаемыми
для undo и read-only. Editable DocumentSession после создания CommandManager
выполняет одну `migrateExpressiveBrushes`, если есть brush strokes. Команда
проверяет before/after, атомарно преобразует hidden/locked, не открывая обход
lock для обычных updateLayer. Samples, spans, appearance и transforms сохраняются;
strokeVersion становится 2 либо остаётся 3, pressureMode сохраняется (legacy:
simulated). Коррекция сохраняется, невалидная получает 65%; localBounds
пересчитываются resolver-ом. Undo восстанавливает исходный вид; повторный open
сохранённого преобразованного документа не создаёт команду. Обычные dirty/save/error/
retry действуют и для миграции. Read-only путь не создаёт editable session.

Preferences brush → stabilized с памятью stabilized либо 65%. Выбор brush
недоступен в UI/actions; остаётся внутренняя геометрия для старых данных и undo.
Tooltip инструментов содержит имя и shortcut без Shift/45°; пояснения modifiers
в настройках линейки убраны. Поля угла и жесты Shift/Alt не меняются.
Schema v7, original blobs, IPC и алгоритмы двух доступных кистей не меняются.

**Проверяемое основание:** red-first migration/preferences; legacy/v2/v3,
hidden/locked, before validation, сохранность данных и один undo/redo;
session save/retry/reopen; decoded 4K Canvas2D preview/export и CanvasKit;
production browser и native Quick → Editor → reopen. Результаты — TESTING.md.

## ADR-092 — Образцы заливки, редактор градиента и пунктир фигур

**Статус:** accepted

**Контекст:** текстовые варианты заливки не показывают результат; созданный
градиент нельзя настроить. Базовые scene nodes теряют stroke dash.

**Решение:** три образца none/solid/linear, 2–8 редактируемых gradient stops,
угол и разворот, три образца stroke. Radial остаётся в codec/render существующих
документов. Shape dotted использует нулевой dash и round cap, остальные
инструменты сохраняют прежний контракт. Временный drag редактирует локальную
полосу, commit создаёт одну EditorCommand; multi-selection — batch.

**Проверяемое основание:** red-first scene propagation tests и decoded
Canvas2D/CanvasKit stroke/gradient comparisons, затем production mounted browser
и real WebView сценарии с undo/redo и defaults. Фактические результаты — TESTING.md.

**Последствия:** schema v7 не меняется; ADR-023 о paint model сохраняется.

## ADR-091 — Выбор native identity и изолированный снимок окна

**Статус:** accepted (2026-10-18); заменяет Window-часть ADR-029 и уточняет
Window-часть ADR-028/038. Area, Screen и Active Window сохраняют прежние решения.

**Контекст:** Windows использовал selector области и определял WindowFromPoint
после его уничтожения. Все desktop-crop пути включали перекрывающие приложения.

**Решение:** Window selector сохраняет identity кандидата до подтверждения,
подсвечивает его до первого движения, поддерживает same-target click, Enter,
Tab/Shift+Tab и Escape. Desktop/dock, minimized, hidden и свои окна исключены.
Pixels читаются у выбранного окна: WGC CreateForWindow, XComposite named pixmap,
CoreGraphics single-window на macOS 12.0–12.2, SCStream на 12.3–13,
SCScreenshotManager на 14+. На macOS 14+ picker системный; Wayland использует
только advertised Screenshot portal v3 Window. Desktop crop не является fallback.
Недоступный изолированный backend даёт typed outcome, а не неверный снимок.
Результат Window сразу материализуется через существующий document mount-flow.

**Проверяемое основание:** red-first selection/identity tests и physical smoke
большого частично перекрытого окна с повторным PNG decode и проверкой скрытых
pixels, размеров, отсутствия selector/соседних окон. Pending runtime-платформы
не объявляются проверенными; фактические команды и evidence — TESTING.md.

## ADR-090 — Выноска без подписи, изгиб и адресное удаление ступени

**Статус:** accepted (2026-10-18); supersedes ADR-087 в части каталога маршрутов,
default attachment и взаимодействия с подписью/удалением ступеней.

**Контекст:** дублирующие ортогональные presets, невидимые границы текста и
символьные markers усложняют настройку; удаление последней ступени не позволяет
выбрать нужный участок. Пустой commit ошибочно удаляет целую выноску.

**Решение:** две UI категории «Линия»/«Ступенчатая»; optional v7 quadratic route
с bend и attachment auto. Старые routes и explicit стороны читаются без миграции.
Auto размещает подпись горизонтально, explicit стороны остаются закреплёнными.
Accent противоположен tangent у target. Пустой rich text сохраняет connector и
оформление в payload, но не рисует/не захватывает область подписи.
Alt-click внутренней ручки локально удаляет два поворота с immutable endpoints,
preview не пишет историю; pointerup подтверждает один EditorCommand. Escape,
lost capture, release Alt и превышение drag threshold отменяют. Нижняя панель,
transient formatting, immutable originals и native IPC сохраняют прежние контракты.

**Проверяемое основание:** red-first 11 core failures, затем green contracts
для empty/auto/quadratic/rebase/codec/accent/indexed removal. Production browser,
real WebView2, decoded exports и ограничения записываются в TESTING.md.

## ADR-089 — Диапазоны оформления изображения

**Статус:** accepted (2026-10-18); дополняет ADR-086.

**Контекст:** предел скругления 128 локальных px не позволяет полностью
скруглить вставленное 4K изображение. Диапазон рамки 0–16 px слишком узок.

**Решение:** максимум скругления равен половине короткой стороны localBounds;
максимум толщины рамки — 32 px. Это существующая геометрия rounded rectangle:
квадрат достигает круга, прямоугольник — капсулы. Отдельная эллиптическая
маска не вводится. Размеры остаются в локальных px, preview/commit и формат
v7 сохраняются; schema toolbar и command validation принимают новые значения.

**Проверяемое основание:** mounted EditorShell на 3840×2160 и 3840×3840,
максимумы 1080/1920 и 32 px, preview без команды, по одному undo на параметр;
production G browser smoke с видимым результатом. Команды — TESTING.md.

## ADR-088 — Общий язык WebView и native tray

**Статус:** accepted (2026-10-17); дополняет ADR-010/075/083 и REQ-UI-003.

**Контекст:** General Settings держал язык в отдельном ref, tray capture/quit
использовали английские строки, остальные пункты читали LANG. Shortcut refresh
снова заменял перевод английским текстом.

**Решение:** Settings использует существующий shell preference RU/EN; desktop
adapter переносит browser preference в native settings и сериализует записи.
Native preference event обновляет открытые WebViews без обратной записи.
Tray creation и shortcut refresh используют одну таблицу переводов и сохранённую
локаль; trigger и enabled state остаются независимыми от языка. Меню macOS
использует тот же выбор. Document schema и оригиналы не меняются.

**Проверяемое основание:** red-first Rust label regression и mounted Settings
persistence; WebView2 Settings → RU/EN/RU → чтение actual MenuItem text,
синхронизация editor и startup labels после нового процесса. Результаты — TESTING.md.

## ADR-087 — Управляемая линия и оболочка выноски

**Статус:** superseded в части UI routes/default attachment/пустой подписи/удаления
ступеней by [ADR-090](#adr-090-выноска-без-подписи-изгиб-и-адресное-удаление-ступени);
remaining geometry/markers/container accepted; supersedes ADR-032 в части elbow-only/markers/container и
ADR-065 в части автоматической стороны и отделения карточки от линии.

**Решение:** новые Callout создаются как Г-линия, target circle, label none и
скруглённая карточка. Маршрут выбирается независимо от наконечников/оболочки.
Ручные маршруты сохраняют ортогональные точки, изменение сегмента — один command.
Перенос подписи сохраняет target; сторона подключения закреплена и меняется явно.
Core geometry обслуживает scene, bounds, hits, handles и измеренную подпись.
Optional v7 fields расширяют контракт без миграции: отсутствие новых полей
сохраняет прежнюю геометрию. Rich-text/IPC и immutable originals не меняются.

**Проверяемое основание:** red-first route/codec/style tests, production creation,
move/cancel/history и decoded render parity; команды и ограничения в TESTING.md.
Г-образный default — гипотеза для screenshot workflow, основанная на
[исследовании читаемости](https://arxiv.org/html/1509.00379), а не human-pass.

## ADR-086 — Компактные настройки изображения и ordered gesture preview

**Статус:** accepted (2026-10-17); дополняет ADR-051/053/054/081.

**Контекст:** generic image toolbar растягивал три слайдера и палитру на две
строки. Canvas gesture удалял image из scene, но lightweight overlay пропускает
image nodes: простой click давал пропадание до pointerup, rotate скрывал картинку.

**Решение:** ImageFormattingToolbar показывает три подписанные кнопки с текущими
значениями: скругление, рамка, непрозрачность. Один popover; рамка объединяет
NumericControl толщины и embedded SimpleColorPicker. Numeric preview, command
collector, mixed/disabled и focus/cancel используют существующие контракты.
Selection image любого размера использует общий preview-placement с protected
bounds и handles; вложенные popover сохраняют tether к кнопке. Панель скрывается
на время canvas gesture и возвращается у итогового выделения.

Image входит в requiresScenePreview наравне с ordered effects. Временная geometry
подставляется в исходный scene slot; renderer использует прежние decoded resources.
Это относится к content и unlocked base image. Pointermove не изменяет Vue scene
state или историю; commit/cancel используют прежний lifecycle. Document v7,
публичные API, native IPC и immutable originals не меняются.

**Проверяемое основание:** red-first Vue regression для base/content, component
keyboard/draft/mixed/disabled tests; 4K decoded pixel equality между held gesture,
commit и export с reflected scale, opacity, radius, border и верхним слоем;
browser и real-WebView2 production G import с pixel checks на pointerdown,
move/resize/rotate, cancel и undo/redo. Команды и фактический статус — TESTING.md.

## ADR-085 — Политики захвата и перенос за выделение

**Статус:** accepted (2026-10-17); дополняет ADR-048/069 и REQ-EDT-019.

**Контекст:** перенос тонких стрелок и незалитых фигур требовал попадания
в stroke; управляющие точки уже имели более широкую область. Пользователь
выбрал перенос за пунктирную рамку после выделения, сохранив первичный выбор
по геометрии с допуском и доступ к соседним объектам внутри рамки.

**Решение:** исчерпывающий LayerInteractionPolicy по LayerKind в editor-core
определяет первичный захват, CSS margin и перенос за рамку. Точные hit queries
сохраняются; optional options включают допуск и measured screen scale.
Spatial index расширяет query, narrow phase — bounds и геометрию. Один
resolveSelectionTarget определяет hover/cursor и начало жеста; позиции
ручек общие с overlay. Приоритет: handles → geometry → selected frame → margin.
После pointerdown цель фиксирована; 4 CSS px отделяют перенос от щелчка.
Мультивыбор имеет общую рамку и общий preview. Для маленьких выделений
используется ручка в существующей transient-панели, без второго инспектора.
Schema v7, IPC, creation policies и command/history boundary сохраняются.

**Проверяемое основание:** red-first core regression, проверки mounted canvas,
production browser creation при 25/100/400%, RU/EN и light/dark; отдельный
external-driver WebView2 сценарий Capture → Quick с non-origin crop → Editor.
Фактические команды, результаты и ограничения записываются в TESTING.md.

## ADR-083 — Дроп настроек в редакторе

**Статус:** accepted (2026-10-17); дополняет ADR-070/075/080.

**Контекст:** Window capture стоял между Undo и Redo, а тема и язык были
спрятаны в overflow вместе с отражениями. Входа в общие настройки из editor
не было. Пользователь запросил убрать лишнюю кнопку и создать расширяемый дроп.

**Решение:** удалить только кнопку Window capture из main editor. На месте
overflow перед Export поставить шестерёнку, открывающую немодальную панель
304 CSS px с viewport bounds и прокруткой. Сначала идут radio-переключатели
темы и языка, затем отдельная группа undoable отражений и вход в Settings.
Выбор темы/языка не закрывает панель; Escape возвращает фокус. Quick Capture
сохраняет собственный chrome. Новые настройки добавляются в смысловые группы.

EditorShell получает optional async `openSettings`; desktop передаёт
существующий adapter `openActivationSettings`. Без adapter ссылка отключена
с пояснением; pending исключает повтор, ошибка допускает retry. Успешный вызов
закрывает дроп без перехвата фокуса native Settings. Существующий singleton
сохраняет раздел при повторной активации. Native IPC и preferences schema
не меняются; CLI/tray/hotkey Window capture сохраняются.

**Проверяемое основание:** mounted Vue tests для live/persisted preferences,
disabled/pending/error/retry/focus, browser matrix RU/EN × light/dark ×
1024/1600 и short viewport; real-WebView сценарий `editor-settings` проверяет
trusted keyboard, открытие из editor, singleton и сохранение раздела.
Фактические результаты и ограничения фиксируются в TESTING.md.

## ADR-082 — Согласованная видимость Windows capture

**Статус:** accepted (2026-10-17); replaces ADR-049.

**Контекст:** прямой Win32 SW_HIDE оставлял Tao VISIBLE=true. Последующий
Tauri show не менял flags и не показывал main; это ломало Editor, tray и CLI.
Первый fullscreen Quick показывался до resize/fit WebView: запись холодного
запуска обнаружила видимый кадр 1901×1069 перед правильным 1920×1080.

**Решение:** Windows hide выполняет Tauri hide на owning thread внутри
временного DWMWA_TRANSITIONS_FORCEDISABLED. Проверка native visibility и
DwmFlush по-прежнему предшествуют capture acknowledgement; transitions
восстанавливаются и при ошибке callback. Windows Quick present готовит
fullscreen скрытого окна; reveal показывает его после двух одинаковых
измерений viewport/scene/bitmap. Selection использует собственное измерение,
поскольку action chrome до первого drag отсутствует. Decode, renderer lifecycle,
originals, IPC и EditorCommand не меняются.

**Проверяемое основание:** red-first Rust framework-hide callback и Vue
selection-layout regressions, physical DXGI cold capture и single-click
Quick → Editor в dev WebView2, stable native capture-exclusion suite.
Фактические команды, результаты и границы — TESTING.md.

## ADR-081 — Немедленная вставка изображения в видимую область

**Статус:** accepted (2026-10-17)

**Контекст:** G возвращал Rust enum с snake_case полями вместо ожидаемых
camelCase, и импорт останавливался до decode. Native E2E проверял только
доступность кнопки. Bitmap paste обходил successful-create policy; размер и
центр документа не учитывали zoom/pan и закрывающие холст панели.

**Решение:** G — действие выбора одного файла с немедленной вставкой;
дополнительного placement mode нет. Файл, bitmap и native drop используют
один decode-before-command flow. Core вычисляет uniform scale до 80% измеренной
видимой области без upscale; drop центрируется в точке отпускания и ограничивается
видимой областью. Источник/документ v7 не меняются. Слой добавляется одним
EditorCommand; Select/selection принадлежат существующей creation policy.
Операция проверяет session identity/document ID и cancellation generation.

Native drop выдаёт одноразовый token на канонизированный путь для конкретного
WebView; JSON содержит метаданные, байты идут через binary transport.
Размер файла ограничивается до чтения. DTO генерируется из Rust; тест serde
проверяет фактические поля. Временные transport tokens и object URLs
освобождаются после decode, decoded image остаётся доступным истории.

**Основание UX:** [FigJam](https://help.figma.com/hc/en-us/articles/1500004290881-Place-images-video-and-GIFs-in-FigJam)
использует центр viewport; [tldraw](https://tldraw.dev/sdk-features/external-content)
объединяет источники external content. Выбор немедленной вставки и одного файла
подтверждён пользователем. Код этих редакторов не переносился.

**Проверяемое основание:** red-first serde regression, core fit/clamp tests,
Vue decode/cancel/session/undo tests и browser/native ingress suites.
Фактические платформенные результаты — TESTING.md. ADR-025 binary/decode
boundary и ADR-048 creation policy сохраняются.

## ADR-072 — Прямой выбор формы фонаря

**Статус:** accepted; дополняет ADR-056 и ADR-071.

**Решение:** по запросу пользователя меню формы заменено тремя icon buttons
в defaults и панели выбранной области. Размер и состояния совпадают с группой
форм номерной метки: 36 px, accent selected, focus ring, disabled, локализованные
имена и подсказки. При отсутствии shape control группа скрыта.
Schema и command routing остаются прежними; редактируется активная область.

**Проверяемое основание:** mounted-shell locked/unlock/undo и независимое
редактирование областей; browser 1024 px RU/EN × light/dark с keyboard input;
общий browser/native pointer scenario с shape change → undo/redo.
Фактические результаты и ограничения — TESTING.md.

## ADR-071 — Чёткие края фонаря по умолчанию

**Статус:** accepted; дополняет ADR-056.

**Решение:** по запросу пользователя новый workspace в editor и Quick Capture
начинает с `spotlight.feather: null` («Чётко»). Явно выбранная мягкость,
сохранённые настройки и слои продолжают использовать свои значения.
Schema, renderer и IPC не меняются.

**Проверяемое основание:** browser creation-settings проверяет «Чётко»/«Sharp»
в defaults RU/EN; общий browser/native spotlight-preview проверяет payload
созданного pointer-жестом слоя. Фактические результаты — TESTING.md.

## ADR-070 — Системные сочетания и явный выбор запуска при входе

**Статус:** accepted; дополняет ADR-008 и ADR-010.

**Контекст:** existing X11/portal traits не предоставляли пользовательский
settings flow; Windows/macOS hotkeys были unavailable, Settings tray item
отключён. Пользователь выбрал автоматическую настройку GNOME без portal,
готовые предложения с recorder и заранее включённый installer/first-run checkbox.

**Решение:** Rust владеет настройками, регистрациями и восстановлением;
единственный отдельный Settings WebView доступен из tray/menu/CLI. Native
замена сначала добавляет новую регистрацию, затем сохраняет preferences,
затем освобождает старую; persistence failure откатывает staging. GNOME
создаёт собственную временную custom-keybinding с одноразовым token,
подтверждает её фактическим CLI-вызовом и сохраняет чужие paths. Wayland
portal использует стабильные IDs, системную конфигурацию и session-local
handles; X11 backend на Wayland не выбирается.

Autostart выключен до подтверждения; в вопросе флажок предварительно включён.
NSIS choice и первый GUI launch являются альтернативными входами в одну
настройку, обновление сохраняет выбор. Linux использует XDG_CONFIG_HOME,
Windows per-user Run без записи StartupApproved, macOS 12 LaunchAgent,
macOS 13+ SMAppService.mainApp. Фактическое состояние ОС показывается отдельно
от пользовательского выбора; неизвестное состояние не объявляется enabled.

**Проверяемое основание:** red-first Rust transaction contract и mounted
Settings UI tests, browser recorder/cancel/conflict сценарий, native CLI/window
и X11 keyboard activation/reopen scenarios. Команды, результаты и pending
platform/login checks фиксируются в TESTING.md и PLATFORM_MATRIX.md.

Источники и зафиксированные snapshots: [HOTKEYS_RESEARCH.md](HOTKEYS_RESEARCH.md).

## ADR-059 — Линейка ограничена видимым canvas и подгоняется при crop

**Статус:** accepted; дополняет ADR-056.

**Контекст:** move и endpoint drag позволяли унести линейку за изображение.
Crop мог оставить существующую линейку вне новой рабочей области.

**Решение:** ограничивать world endpoints прямоугольником crop либо полным
canvas. Move использует общий допустимый delta всей selection; endpoint drag
фиксирует второй конец, Alt пересекает край вдоль snapped ray. Поворот сдвигает
линейку внутрь; угол, при котором её длина не помещается, отклоняется.
При изменении crop линейка сначала сокращается только насколько необходимо
с сохранением направления, затем сдвигается внутрь. Это распространяется на
locked/hidden rulers как часть изменения canvas. Style не масштабируется.
CommandManager дополняет `setCrop` before/after снимками изменённых линеек;
apply/revert и history сохраняют crop и геометрию одной атомарной правкой.
Документ v7 и IPC не меняются. Засечки и badge не сокращают доступный диапазон
измерения между краями изображения. Move и crop учитывают conservative badge
по каждой оси, если он помещается; на меньшем canvas остаётся ограничение endpoints.

**Проверяемое основание:** red-first endpoint/crop/Escape regressions,
1000 property cases rotated/reflected non-origin crops, mounted-shell history,
browser и production real-WebView pointer/crop scenarios. Результаты — TESTING.md.

## ADR-058 — Плотность preview сцены с учётом zoom и DPI

**Статус:** accepted; заменяет ограничение document-resolution preview в ADR-050.

**Контекст:** подпись линейки растеризовалась в document resolution и затем
растягивалась браузером. На дробном zoom и HiDPI цифры теряли резкость.

**Решение:** Canvas2D viewport рисует committed scene и annotation draft
с density `max(1, zoom × DPR)`. Document coordinates, style и экспортный scale
не меняются. Selection chrome сохраняет отдельный viewport-sized canvas.
Плотность ограничена 64 Mi pixels или размером исходного canvas, если он больше;
сторона ограничена 16384 px или исходной стороной, если она больше. На предельном
zoom допускается увеличение bounded bitmap. На fit сохраняется native sampling.
Quick PNG берёт crop из соответствующей области плотного preview и выдаёт
исходные physical dimensions; immutable original по-прежнему берётся из frozen image.

**Проверяемое основание:** pixel comparison preview с decoded scaled export,
неизменность обычного export, pointer/sampling и marker blend/cancel regressions,
production browser и real-WebView Quick → Editor. Команды и ограничения — TESTING.md.

## ADR-056 — Сглаживание карандаша и составной фонарь

**Статус:** superseded в части карандаша by ADR-060; фонарь и линейка остаются accepted.

Карандаш хранит исходные sampled points и smoothing 0…1. Общий DOM-free resolver
смешивает внутренние точки с окном весов 1/2/3/2/1, сохраняя endpoints и pressure;
scene, preview и hit testing используют один путь. Настройки фиксируются на pointerdown.
Фонарь хранит массив областей со стабильными IDs, индивидуальными shape/bounds и
общим dim/feather style. Renderer затемняет кадр один раз через маску объединения;
пересечения и мягкие края не образуют внутренних швов. Геометрия областей не входит
в style clipboard. Линейка показывает измерение и копирование в transient UI,
Alt включает привязку при создании и редактировании endpoints.

Schema v7 расширяется без миграций старых файлов по явному решению пользователя.
**Проверяемое основание:** red-first core geometry/codec tests, renderer decoded pixel
tests и production browser/native editor/Quick. Результаты записываются в TESTING.md;
Windows evidence не распространяется на WebKitGTK/WKWebView.

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

**Статус:** superseded by ADR-034

**Решение:** top bar, tool rail, canvas, bottom contextual toolbar, series filmstrip, layers panel и zoom control сохраняются. Layers panel не дублирует tool options.

**Уточнение:** main editor использует системные window decorations; CSS-клоны системных кнопок не создаются.

## ADR-033 — Transient text formatting bar над inline editor

**Статус:** superseded by ADR-034

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

## ADR-034 — Нижний tool rail и transient панели у объекта

**Статус:** superseded by ADR-048; supersedes ADR-012 and the toolbar-layout portion of
ADR-033

**Контекст:** FigJam-like chrome держит основной tool rail внизу, а controls
над ним. Arrow и text не должны дублировать inspector в layers panel или
показывать settings до выбора/редактирования.

**Решение:** `ToolRail` становится горизонтальным и центрируется внизу.
`ContextToolbar` монтируется над rail для активных non-arrow инструментов,
precision tools и выбранных non-arrow слоёв. Arrow settings убираются из
нижнего toolbar: `ArrowFormattingToolbar` появляется над выделенной стрелкой
только при инструменте select; defaults arrow редактируются через configure
popover по context menu / Shift+F10 на кнопке инструмента arrow.
`TextFormattingToolbar` сохраняет transient host над inline editor; нижний
toolbar не дублирует text controls во время edit.

**Проверяемое основание:** `arrow-context-toolbar.test.ts`, `App.test.ts`,
`canvas-viewport.test.ts`, `layer-selection.ts` helper и focused browser shell
/regression suites на bottom rail layout, отсутствие arrow controls при active
arrow tool, floating arrow toolbar при select и configure popover defaults.

## ADR-035 — Image-only transform scale и intrinsic geometry handles

**Статус:** accepted

**Контекст:** общий bounding-box scale растягивает stroke, arrow caps, text и
effect geometry и создаёт визуально сломанные слои. При этом raster/image layer
должен сохранять обычный proportional resize, а vector/annotation tools уже
имеют либо могут однозначно получить собственную редактируемую геометрию.

**Решение:** persisted non-unit `Transform2D.scaleX/scaleY` создаётся UI только
для `image` layers. Остальные слои меняют endpoints, sampled points,
`localBounds`, lens size либо text wrap width через DOM-free editor-core helpers;
style values остаются неизменными. Отдельный верхний rotate handle удаляется:
rotation доступен через внешние зоны четырёх углов, а у resizeable geometry
внутренняя зона угла остаётся resize handle. Все gestures transient до одного
`updateLayer` на release.

При открытии editable v7 документа legacy non-image layer с модулем хотя бы
одного scale, отличным от единицы, получает `scaleX = scaleY = 1` без
компенсации translation и без history/dirty state. Чистые unit reflections
`±1` сохраняются для canvas flip; image scale не меняется. Schema v7 и
`EditorCommand` wire shape остаются прежними.

**Проверяемое основание:** red-first core tests покрывают scale policy,
idempotent load normalization, unit reflections, intrinsic geometry/style
invariants и undo/redo. Vue/browser tests проверяют handle routing, corner
rotation, transient preview/cancel и отсутствие non-image transform scale.

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

**Статус:** superseded в части автоматического maintenance по [ADR-078](#adr-078-компактная-временная-история); остальные storage/resource инварианты сохраняются.

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
superseded by ADR-031; bundled-font baseline superseded by ADR-061

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

**Статус:** accepted для Screen/Area/Active Window; Window superseded by ADR-091

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

**Статус:** superseded для Area by ADR-040; для Window by ADR-091

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

## ADR-036 — Area capture использует временный quick draft

**Статус:** accepted; supersedes only the Area immutable-original timing of
ADR-029; X11 Area presentation superseded by ADR-039; Windows Area presentation
superseded by ADR-040

**Контекст:** обязательное открытие полного редактора после Area мешает
сценарию «выделить → скопировать». При этом custom annotation chrome нельзя
встраивать в Wayland XDG selector, а сохранение отменённого quick-mode засоряет
library.

**Решение:** явный Area capture после platform selector удерживает pixels в
приватном bounded staging и открывает frameless `QuickCaptureShell`. Crop и
аннотации используют обычный v7 document/`EditorCommand`, но документ не
persisted. Copy, Save PNG или Editor сначала rebase-ят draft к выбранному crop
и атомарно создают immutable original, capture и editable document; Close и
Escape до этого уничтожают staging. Windows/X11/macOS могут показывать полный
frozen frame, Wayland использует только fragment, возвращённый portal, и не
пытается заменить системный selector.

**Проверяемое основание:** red-first editor-core rebase/crop tests, Rust
stage/commit/cancel and transaction-fault tests, Vue toolbar/keyboard tests и
real-Tauri platform smokes. Screen, Window, Active Window и Repeat сохраняют
старый direct-to-editor flow.

## ADR-039 — X11 Area выбирается внутри единой Quick Capture surface

**Статус:** accepted; supersedes the X11 Area presentation portion of ADR-036

**Контекст:** отдельный native X11 selector и последующий fullscreen Quick
WebView удовлетворяли пиксельной непрерывности только через composited handoff,
но оставались двумя окнами, двумя interaction models и двумя реализациями
пунктирной рамки. Даже без пустого кадра пользователь ощущал загрузку и смену
режима после mouse-up. Требование продукта теперь сильнее: выбор области — это
первая фаза Quick Capture, а не отдельный предшествующий интерфейс.

**Решение:** X11 backend до показа UI получает один frozen compositor frame и
передаёт его в заранее созданную Quick WebView через owned binary transport.
После первого renderer flush эта WebView мапится ровно один раз в фазе
`selecting`. Canvas interaction overlay рисует dim, crosshair, подсказку,
dimension badge и crop dash. Первый валидный drag создаёт crop через
`EditorCommand` и переключает ту же mounted surface в фазу `editing`, добавляя
toolbar/actions без native show/hide/focus и без повторного renderer mount.
Native X11 selector остаётся допустимым для Window target; Wayland сохраняет
системный portal selector.

**Проверяемое основание:** red-first Vue test обязан провести pointer drag по
mounted Quick `CanvasViewport`, получить ровно одну `setCrop` command и затем
показать chrome без замены DOM/canvas hosts. Rust contract обязан staged full
frame пометить как pending selection и отклонять commit до явного подтверждения.
Boundary test запрещает вызов X11 native Area selector и retained-selector
handoff из Quick reveal/dismiss. Resident GNOME/X11 smoke проверяет один и тот
же top-level XID и canvas hosts до drag, во время drag и после появления chrome.

**Последствия:** frozen pixels должны быть decoded до первого видимого кадра,
поэтому command-to-surface latency измеряется отдельно и не маскируется вторым
native окном. UI-start from a visible editor по-прежнему ждёт его безопасного
исчезновения из compositor frame. Wayland и macOS/Windows presentation не
меняются этим ADR.

## ADR-040 — Windows Area выбирается внутри единой Quick Capture surface

**Статус:** accepted; supersedes Windows Area selection/presentation portions of
ADR-029 and ADR-036; Windows Window behavior remains unchanged

**Контекст:** Windows сохранял отдельный Win32 Area selector: mouse-up закрывал
его, после чего DXGI получал новый frame и только затем показывал Quick WebView.
После перехода X11 на единую surface это оставляло на Windows два окна, два
interaction lifecycle и визуальную смену режима между выделением и
аннотированием, хотя продуктовый контракт `REQ-CAP-012/013` требует один режим.

**Решение:** Windows Area после скрытия editor получает один frozen physical
virtual-desktop frame через DXGI и передаёт его в owned binary transport как
full-frame quick draft с `selectionPending`. Чтобы первая acquisition не вернула
нулевой queued frame, backend сначала создаёт duplication, регистрирует и
показывает прозрачный non-activating compositor pulse, ждёт `DwmFlush` и только
затем читает outputs. Prewarmed fullscreen Quick WebView один раз показывается в
фазе `selecting`; первый валидный drag создаёт crop одной `EditorCommand` и
переводит ту же mounted surface в `editing`. Отдельный Win32 Area selector,
selector destruction и повторный DXGI acquire на mouse-up из этого маршрута
удаляются. Window capture сохраняет native selector и `SelectThenFrame`, потому
что оно создаёт direct document и не является Area quick-mode.

Terminal Editor handoff сохраняет first-frame gate, но устраняет Windows
occlusion cycle: после успешной materialization native host показывает main,
снимает `always_on_top` с Quick и повторно фокусирует main до ожидания renderer
acknowledgement. Обычный editor `CanvasViewport` обязан отправлять `frameReady`
после завершённого render, а не только в `quickFrameMode`. После acknowledgement
Windows Quick снимает topmost и скрывается без post-hide `set_fullscreen(false)`,
который WebView2/Win32 мог интерпретировать как повторный show обычного окна.

**Проверяемое основание:** red-first Windows Rust contract различает
`FrameForQuickSelection` для Area и `SelectThenFrame` для Window, boundary test
запрещает вызов native selector из Area capture route, а общие Vue tests требуют
один `setCrop` и неизменные scene/overlay hosts при `selecting → editing`.
Windows runtime smoke проверяет один fullscreen Quick HWND, неизменный frozen
frame и физические mixed-DPI/cross-monitor bounds до, во время и после drag.
Отдельные component/boundary regressions требуют main-mode `frameReady`, lowering
до mount wait и Windows dismiss без fullscreen mutation; runtime replay проверяет
один клик Editor и отсутствие видимого Quick HWND после задержки.

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

**Статус:** superseded in route/markers/container by [ADR-087](#adr-087-управляемая-линия-и-оболочка-выноски), in label placement/sizing by [ADR-065](#adr-065-измеряемая-подпись-выноски); remaining leader-line decision accepted; supersedes the callout container semantics portion of
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

## ADR-037 — macOS Screen capture adapter без xcap

**Статус:** accepted

**Контекст:** `SessionKind::Macos` существовал, но capture backend всегда был
`Unavailable`. `xcap` отклонён ADR-019. `SCScreenshotManager` доступен только с
macOS 14, а текущая машина владельца — macOS 12. Нужен один исходник для Intel
и Apple Silicon.

**Решение:** отдельный `macos_platform` adapter за `cfg(target_os = "macos")`.
Первый вертикальный срез — Screen: `CGWindowListCreateImage` / display snapshot
через permissive `core-graphics` 0.25, Screen Recording через
`CGPreflightScreenCaptureAccess` / `CGRequestScreenCaptureAccess`, hide `main`
до кадра, owned PNG transport. Area, Window, Active Window и Repeat не
рекламируются, пока нет selector/crop slice. `SCStream` one-shot может заменить
источник кадра отдельным ADR, если runtime докажет недостаточную compositor
fidelity. Activation socket на unix использует `XDG_RUNTIME_DIR`, иначе
`TMPDIR` / `temp_dir()`, чтобы macOS host запускался без Linux session vars.

**Проверка:** `select_capture_backend(Macos)` unit; packed-BGRA/PNG и
`invalidTarget` tests; `permissionDenied` без overlay; Vue mapping; `cargo test`
на macos-15 ARM и macos-15-intel compile jobs. Local Intel Screen smoke с
повторным decode PNG обязателен до status `supported`. Apple Silicon runtime по
ADR-020 отложен, пока нет машины владельца.

## ADR-038 — Native macOS Area/Window selector и versioned capture routing

**Статус:** accepted для Area/baseline; Window superseded by ADR-091

**Контекст:** ADR-037 фиксирует первый Screen-only срез и не определяет
Area/Window selector, минимальную версию macOS или маршрутизацию между
CoreGraphics и ScreenCaptureKit. Продукту нужен единый native UX на Intel и
Apple Silicon без повышения baseline выше macOS 12.

**Решение:** deployment baseline — macOS 12.0. Area и Window используют native
AppKit selector. На macOS 12.0–12.2 pixels получает legacy CoreGraphics
fallback; на 12.3–13 intended routing использует one-shot `SCStream`; на 14+
используются `SCScreenshotManager` и системный window picker. Area замораживает
единый multi-display frame с physical display bounds и открывает quick-mode;
Window выбирается нативно и создаёт документ напрямую, без quick-mode.
Availability проверяется во время выполнения, а не только версией SDK.

**Проверяемое основание:** deterministic routing/availability, coordinate,
cancel и cleanup tests; compile checks для Intel/Apple Silicon; реальные smokes
на 12.0–12.2, 12.3–13 и 14+ с permission grant/deny, Retina, mixed-scale
multi-display, decoded pixels и отсутствием selector pixels. До этих прогонов
capability может быть реализована, но runtime support не считается
подтверждённым.

## ADR-041 — Семантические Rust-модули и атомарный Area Quick Capture lifecycle

**Статус:** accepted

**Контекст:** после ADR-039/040 Area quick capture на X11 и Windows стал одним
mounted WebView lifecycle, но native host по-прежнему смешивает Tauri commands,
platform routing, draft locks, persistence и window handoff в крупных файлах.
Раздельные `active`/`cancel_requested` flags и `Option<QuickCaptureDraftRecord>`
не выражают допустимые переходы и позволяют cancel забрать draft между началом
commit и durable persistence. Ручной SQL registry дублирует ответственность
SQLite `user_version` и удерживает repository внутри Tauri crate.

**Решение:** Area quick capture моделируется runtime state machine
`Idle → Selecting/Editing/Preparing → Committing → Committed/Idle`. Переход в
`Committing` атомарно забирает право завершить draft; cancel разрешён только до
этого перехода, terminal outcome публикуется один раз. Durable commit отделён от
presentation handoff: renderer timeout после сохранения даёт degraded handoff,
а не failed capture. X11/Windows Area остаётся внутри одной Quick WebView;
AppKit и XDG portal остаются платформенными selector boundaries, после которых
используется тот же draft lifecycle.

Rust host делится по смыслу на `app`, `capture`, `platform` и `services`, а
SQLite repository переносится в независимый `cute-screen-storage` workspace
crate. Миграции использует `rusqlite_migration`/`PRAGMA user_version`; legacy
`schema_migrations` принимается только после строгой проверки известных
version/name/checksum. Tauri commands являются тонкими adapters, сохраняют
текущие command names и успешные wire payloads и возвращают versioned typed
errors. Изображения продолжают передаваться только бинарным transport.

**Проверяемое основание:** state-transition и barrier tests для commit/cancel,
legacy/future/corrupt SQLite fixtures, generated DTO drift check, X11/Windows
boundary tests без native Area selector, macOS atomic-cancel/ABI/virtual-desktop
tests и реальные platform smokes из A15. Source-text existence tests остаются
architecture guards и не заменяют runtime evidence.

## ADR-042 — Семантические TypeScript-домены и тонкие Vue composition roots

**Статус:** accepted

**Контекст:** package direction из ADR-002 соблюдается, но несколько Vue SFC,
renderer implementations, codecs и tests накопили несколько тысяч строк и
смешивают lifecycle, orchestration, domain rules и presentation. Формальные
папки `components`, `composables`, `utils` не выражают владельца поведения и не
предотвращают повторное слипание кода.

**Решение:** существующие packages и их публичные exports сохраняются, а
внутренний TypeScript организуется по предметным доменам и слоям
`contracts → model → adapters/ui`. `EditorShell`, `CanvasViewport`, desktop App
и Quick Capture остаются compatibility composition roots над typed controllers.
Scene graph, renderer resources и pointer gestures не переходят в глубокую
Vue-reactivity. Canvas2D и CanvasKit остаются независимыми backends и разделяют
только renderer-neutral contracts/algorithms. CSS делится по тем же доменам с
неизменным публичным `shell.css`, selectors и cascade order.

**Границы:** document schema v7, `EditorCommand`, IPC names/wire payloads,
package exports, Vue props/emits, DOM/E2E selectors и визуальный результат не
меняются. Новые production dependencies не добавляются. AST boundary tests,
type-level API contracts и обязательные size/complexity budgets блокируют
обратные зависимости, циклы и новые монолиты.

**Проверяемое основание:** полный core/renderer/Vue test набор, неизменённые
renderer goldens, browser/real-Tauri flows, performance suite, `ipc:check` и
architecture budget gate. Перенос теста или source-text assertion не заменяет
проверку пользовательского действия.

## ADR-043 — Tabler Icons и контекстные панели Quick Capture

**Статус:** superseded by [ADR-055](#adr-055-собственные-ui-иконки-рядом-с-tabler).

**Контекст:** первый этап постепенного упрощения интерфейса убирает canvas flip
из Quick Capture и требует единой MIT-библиотеки иконок. Основная лицензия
Lucide — ISC; Tabler предоставляет MIT-набор и официальный Vue 3 package.

**Решение:** общие иконки используют `@tabler/icons-vue` через единственный
typed `UiIcon` с явными imports, currentColor и stroke 1.8. Семантические имена
сохраняются, Callout и Numbered Marker получают отдельные обозначения.
Геометрические previews параметров остаются собственными SVG. Генератор
контекстной панели учитывает quick mode и не возвращает fallback canvas
actions; toolbar без schema не создаёт DOM. В полном editor flip и история
сохраняются. Это отдельное UI-решение после завершённого рефакторинга ADR-042,
а не изменение его ограничений задним числом.

**Проверяемое основание:** `app-shell-layout.test.ts`, runtime icon tests,
TS/Vue import boundary и `pnpm audit:licenses`; browser screenshot review и
A15 real-Tauri smoke с отдельной фиксацией недоступного evidence. Document
schema, renderer, original blobs и platform backends не меняются.

Источники: [Tabler Vue](https://docs.tabler.io/icons/libraries/vue),
[MIT license](https://github.com/tabler/tabler-icons/blob/main/LICENSE),
[Lucide license](https://lucide.dev/license).

## ADR-044 — Отдельный контрастный знак трея и единая геометрия логотипа

**Статус:** superseded — [ADR-045](#adr-045-метафора-захвата-в-логотипе)

**Контекст:** уменьшенная цветная app tile делает кота и его мелкую мимику
неразличимыми в системном трее. Пользовательский screenshot показывает этот
дефект при номинальном размере около 16 px.

**Решение:** собственный MIT-знак — крупный силуэт кота и два квадратных глаза.
`scripts/generate-brand-assets.mjs` хранит единую геометрию и генерирует SVG
логотипа, редактора, favicon, bundle icons через Tauri CLI и отдельные tray PNG.
Windows/Linux используют тёмный знак с белым контуром и глазами на прозрачном
фоне; macOS получает чёрную alpha mask с прозрачными глазами и
`icon_as_template(true)`. App icon сохраняет тёплую розовую плитку. Брендовый
знак является собственным artwork; общие action icons по ADR-043 остаются Tabler.
Ошибки декодирования embedded PNG возвращаются через штатный tray failure path.

**Проверяемое основание:** red-first Rust tests повторно декодируют реальные
tray PNG и проверяют прозрачность, крупные контрастные глаза и template alpha;
визуальная проверка 16/20/24/32 px на светлом/тёмном фоне и GNOME tray/menu
smoke из `TESTING.md`. Windows/macOS требуют отдельного runtime smoke и не
получают статус supported по PNG/unit evidence.

## ADR-045 — Метафора захвата в логотипе

**Статус:** superseded — [ADR-046](#adr-046-кот-в-рамке-захвата-без-мелких-деталей)

**Контекст:** контрастный силуэт из ADR-044 читается в трее, но не объясняет
назначение screenshot-приложения. Логотип должен опираться на capture metaphor,
а не только на маскота.

**Решение:** четыре угла рамки выделения окружают изображение с крупным
силуэтом горы и солнцем. App icon использует тёмную плитку, розовые углы и
белое изображение без тяжёлой наружной обводки. Tray сохраняет прозрачный фон,
светлую графику с тёмным контуром; macOS — alpha template. Геометрия, генератор
и отдельное подключение tray из ADR-044 сохраняются. Этот ADR заменяет выбор
силуэта и цветов app tile из ADR-044; action icons по ADR-043 не меняются.

**Проверяемое основание:** red-first PNG decode/alpha/contrast tests требуют
раздельную рамку захвата и изображение с прозрачными деталями template;
визуальная проверка 16–32 px на двух фонах, app icon 32/48/128 px и GNOME tray.
Фактические команды и ограничения платформ зафиксированы в `TESTING.md`.

## ADR-046 — Кот в рамке захвата без мелких деталей

**Статус:** superseded — [ADR-047](#adr-047-сплошной-силуэт-кота)

**Контекст:** изображение горы и солнца из ADR-045 добавляет мелкие детали и
теряет узнаваемую отсылку к коту. Нужен единый простой знак для приложения и трея.

**Решение:** крупный сплошной силуэт кота без глаз/усов/мимики помещён между
двумя диагональными углами рамки захвата. Тёмная app tile, розовая рамка и белый
кот; tray — светлый знак с тёмным контуром, macOS — alpha template без мелких
вырезов. Геометрия и генератор общие. Это заменяет графику ADR-045, сохраняя
отдельный embedded tray asset и системную template-окраску из ADR-044.

**Проверяемое основание:** red-first decode/alpha tests требуют сплошной силуэт,
прозрачный промежуток между ушами и отсутствие двух лишних углов. Визуальный
review проверяет app 32/48/128 px и tray 16/20/24/32 px на двух фонах; GNOME
runtime и команды зафиксированы в `TESTING.md`.

## ADR-047 — Сплошной силуэт кота

**Статус:** superseded — [ADR-057](#adr-057-монитор-с-кошачьими-прищурами)

**Контекст:** отсылка к screenshot не требуется; рамка из ADR-046 усложняет знак.

**Решение:** единственная геометрия — крупный сплошной силуэт кота без лица и
скобок. App icon: белый кот на тёмной плитке; tray: белый кот с тёмным контуром
на прозрачном фоне; macOS: чёрный alpha template. Отдельные tray assets и общий
генератор сохраняются. Заменяет графику ADR-046.

**Проверяемое основание:** PNG decode/alpha tests требуют отсутствие capture
corners, сплошную крупную форму и прозрачный промежуток между ушами; размерный
review и GNOME tray smoke описаны в `TESTING.md`.

## ADR-048 — Жизненный цикл инструментов и стили у выделения

**Статус:** superseded by [ADR-063](#adr-063-согласованные-переходы-инструментов-и-панелей); supersedes ADR-034.

**Контекст:** единое sticky-поведение вынуждало вручную выходить из стрелки и
фигур, ПКМ настраивала только arrow, а параметры экземпляра и defaults смешивались.
Пользователь утвердил разные creation policies, автонаследование стиля и память
между запусками. FigJam используется как UX-ориентир для панели у выделения.

**Решение:** pencil/marker/numberedMarker создают серии без auto-selection;
arrow/shape/precision/image переходят в select с выделением, text/callout — после
commit. ПКМ активирует инструмент и открывает defaults, поддерживая вложенные
controls; клавиатурный эквивалент Shift+F10. Выделение получает одну floating
панель с compatible/mixed свойствами; group changes используют batch. Меню
объекта сохраняет мультивыбор и предоставляет atomic actions. Style clipboard
переносит визуальные каналы без content/geometry/identity. Настройки text,
callout и numberedMarker раздельны, versioned preferences читают legacy drawing
settings. Undo/redo меняет документ, а не preferences. LayersPanel не становится
инспектором. ToolRail остаётся снизу; defaults и специальные режимы используют
нижний chrome, inline text — собственный transient host. Quick не получает
общие canvas actions полного редактора.

**Проверяемое основание:** red-first `styles.test.ts` и
`tool-preferences.test.ts`; mounted-shell `tool-ux.test.ts`; native-input
`browser-tool-ux.e2e.ts`, RU/EN light/dark screenshots. Фактические результаты,
доступность WebView и ограничения записываются в TESTING.md. Document v7,
immutable originals, binary image transport и platform adapters сохраняются.

## ADR-049 — Подтверждённое скрытие Windows editor до capture

**Статус:** superseded by [ADR-082](#adr-082-согласованная-видимость-windows-capture).

**Контекст:** успешный Tauri `hide()` из capture task означает постановку
команды в оконную очередь. DWM может продолжать hide-animation, и её полупрозрачный
след попадает в frozen desktop даже после одного compositor present.

**Решение:** Windows main скрывается на owning thread через Win32 `SW_HIDE`,
с временным per-window `DWMWA_TRANSITIONS_FORCEDISABLED`. Проверка visibility
и `DwmFlush` предшествуют acknowledgement в capture task; только затем backend
создаёт duplication. Обычные переходы восстанавливаются при успехе и ошибке.
Ошибка/timeout даёт failed capture и возвращает editor. Глобальные animation
settings не меняются. Это уточнение реализации существующего исключения editor,
а не замена Area lifecycle или pixel transport.

**Проверяемое основание:** Rust regression отклоняет invalid HWND; interactive
`windows-capture-exclusion` через production Capture проверяет decoded pixels
реального DXGI desktop под editor marker в трёх циклах с Escape/retry.
Результаты и ограничения — в `TESTING.md`. Семантика hide-animation описана
в [Microsoft DWM documentation](https://devblogs.microsoft.com/oldnewthing/20121003-00/?p=6423).

## ADR-050 — Экранное разрешение selection chrome и миниатюры стрелок

**Статус:** superseded в части document-resolution annotation preview: ADR-058.
Остальные правила selection chrome и миниатюр сохранены.

**Контекст:** документный bitmap overlay растягивал рамку выделения при zoom;
текстовые варианты наконечников раздували меню, а оба конца показывали
одинаковое направление. Отдельная иконка arrow и вложенная рамка панели
занимали место без дополнительного действия.

**Решение:** editor и Quick используют отдельный display-resolution canvas
для transient chrome, CSS pixels × DPR, сохраняя document-space preview
от renderer. Толщина рамки, длина пунктира и радиус handles зависят от zoom.
Corner rotation сохраняет прежние hit zones и показывает MIT Tabler
`rotate-clockwise` с белой контрастной обводкой. Пять arrow controls имеют
общую высоту и явные chevrons; хвост зеркалится относительно наконечника.
Варианты cap/path показываются миниатюрами с локализованными accessible names
и title; открыта максимум одна вложенная панель. Escape возвращает focus,
выбор закрывает меню; locked selection сохраняет disabled controls.

**Проверяемое основание:** pixel regression `selection-overlay-resolution.test.ts`
проверяет фактический raster при zoom 2 / DPR 2 в обеих поверхностях;
`arrow-context-toolbar.test.ts` проверяет именованные варианты и focus.
Общий `arrow-selection-menu.ts` проходит создание стрелки, nested Escape с
trusted keyboard input, выравнивание controls, display backing, выбор, Undo
и corner hover в browser и real Tauri. Результаты — TESTING.md.

## ADR-051 — Понятные эффекты выделителя и фоновый автоподбор

**Статус:** accepted; дополняет ADR-048 и ADR-050.

**Решение:** выделитель имеет один выбор Auto/Highlight/Illuminate/Colour veil:
auto разрешается в multiply, screen или normal по распределению яркости всего
неизменяемого original. Не менее 60% opaque samples с яркостью ≤0.4 означают
screen, ≥0.65 — multiply, иначе normal; прозрачные samples не участвуют.
Задача запускается после первого frame один раз на загрузку, использует bitmap
до 256 px и Worker/OffscreenCanvas. Ошибка не блокирует ручные эффекты.
Результат и defaults фиксируются при pointerdown; сохранённый blend определяет
вид существующих штрихов, а отдельный highlighterMode хранит намерение Auto.
Preview рисуется поверх committed pixels сцены, UI overlay остаётся отдельным.
Палитры выделителя, фигур и стрелок имеют фиксированные образцы; расширенный
picker доступен через Custom colour. Оригинал, schema v7 и IPC сохраняются.

**Проверяемое основание:** red-first highlighter core tests и codec regression;
worker lifecycle, gesture freeze, group command и decoded PNG pixel tests;
Canvas2D/CanvasKit highlighter goldens; browser/native WebView production-flow
сравнение preview/commit и 4K/8K фоновые задачи. Фактические результаты и
ограничения фиксируются в TESTING.md.

## ADR-052 — Настройки с самой кнопки инструмента

**Статус:** superseded by [ADR-063](#adr-063-согласованные-переходы-инструментов-и-панелей); дополняет ADR-048.

**Контекст:** отдельная кнопка `⌄` появляется в конце группы при выборе
инструмента, дублирует вход в defaults и меняет ширину нижней панели.
Пользователь запросил убрать этот лишний элемент.

**Решение:** удалить дополнительную кнопку из общего ToolRail editor/Quick.
Настройки открываются на самой кнопке инструмента по ПКМ, Shift+F10 или
ContextMenu. Defaults, selection, nested controls и Escape сохраняются.

**Проверяемое основание:** существующие mounted-shell tool-ux, browser tool-ux
и native quick-chrome проверяют открытие настроек и создание объектов.
Screenshots подтверждают отсутствие отдельной стрелки; результаты и пределы
platform evidence записываются в TESTING.md.

## ADR-053 — Связность кнопки и вложенной панели настроек

**Статус:** accepted; дополняет ADR-048 и ADR-052.

**Контекст:** после выделения большой сноски ПКМ по Shape открывает defaults,
но вложенное «Наложение» может оказаться в 231 px от своей кнопки: минимизация
перекрытия preview выбирает удалённую позицию на другом краю canvas.

**Решение:** общий preview-placement сначала рассматривает позиции с зазором
между прямоугольниками trigger и панели не более 16 CSS px. Среди них сохраняются
минимизация перекрытия объекта/chrome, устойчивость стороны и близость центров.
Позиции сочетают горизонтальный обход одной преграды с вертикальным обходом
другой, чтобы находить свободные углы рядом с trigger. При заполненном preview
панель минимизирует перекрытие поблизости. Если trigger вне доступного viewport
и близкая позиция невозможна, остаётся viewport-clamped fallback. Canvas и
selection не перемещаются ради настроек; document/command contracts сохраняются.

**Проверяемое основание:** red-first browser regression создаёт сноску обычным
pointer input, выделяет её после commit и открывает Shape через trusted ПКМ.
Измеряется реальный зазор для «Наложение → Обводка → Наложение», Escape/focus
и неизменность документа. Геометрические tests проверяют свободный угол и
заполненное окружение; shared E2E проходит Quick/editor в WebView2.
Команды, результаты и ограничения фиксируются в TESTING.md.

## ADR-054 — Общие числовые параметры и отменяемый предпросмотр

**Статус:** accepted; дополняет ADR-030 и ADR-048.

**Контекст:** числовые поля фигур не дают быстро подбирать результат на глаз;
разные панели используют несовместимые поля, слайдеры и разрозненные пресеты.
Пользователь выбрал обновление параметров всего редактора, компактные группы
готовых значений и живой предпросмотр. Масштаб холста явно исключён.

**Основание выбора (исследование 2026-10-15):**
[Adobe Spectrum](https://spectrum.adobe.com/page/slider/) объединяет слайдер
и редактируемое значение для визуального и точного выбора;
[NN/g о слайдерах](https://www.nngroup.com/articles/gui-slider-controls/)
описывает трудности точного выбора одним слайдером;
[NN/g о steppers](https://www.nngroup.com/articles/input-steppers/)
рекомендует крупные горизонтальные кнопки для небольших дискретных изменений.
[WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
задаёт keyboard/semantics. Это экспертное обоснование, не сравнительное
пользовательское исследование Cute Screen.

**Решение:** общий Naive UI adapter сочетает слайдер с точным полем,
горизонтальные −/+ и NButtonGroup пресетов. Единицы отображаются отдельно;
проценты не меняют persisted ratios. Input использует NInput с семантикой
spinbutton: это позволяет хранить пустой/некорректный draft и принимать запятую
без неявного clamp/coercion браузерного number input.

Preview собирает те же EditorCommand через чистые resolvers и применяет
applyEditorCommand к временной проекции. Проекция хранится в shallowRef и
обновляется не чаще animation frame. Session, autosave и preferences до commit
не меняются. В inline text сохраняется полный rich-text state и background;
каждый preview строится от исходного state, отмена восстанавливает диапазон,
смешанные spans, paragraphs и typing style. Общая граница text commit сохраняется.
Числовой draft отменяется при смене контекста; владельцы защищают друг друга от
запоздалого cancel. Завершённый gesture даёт одну команду/batch, удержание
клавиши объединяется до keyup. Панели с Apply/Cancel сохраняют общий draft.

**Проверяемое основание:** adapter/controller tests, mounted inline-text flow,
trusted browser/native drag с пиксельным сравнением до/после pointerup,
undo/redo/cancel и production Capture → Quick → Editor. Фактические команды,
артефакты и платформенные ограничения — TESTING.md. Schema v7, IPC и Rust
не меняются. Форматирование существующих accepted ADR сохраняется.

## ADR-055 — Собственные UI-иконки рядом с Tabler

**Статус:** accepted; supersedes ADR-043.

**Контекст:** установленные Tabler Highlight и Pencil используют почти один
диагональный контур; ColorPicker имеет сходный стержень. При 18 CSS px инструменты
плохо различаются. Требуются собственные метафоры без смены библиотеки интерфейса.

**Решение:** typed `UiIcon` остаётся единственной точкой выбора UI-иконок.
Явные Tabler imports дополняются собственными marker/pencil/eyedropper.
Геометрия — типизированные SVG-примитивы в `shell/icons/`, общий Vue renderer
строит один SVG через `h()`: viewBox 24×24, currentColor, fill none, stroke 1.8,
round caps/joins, декоративные aria-hidden/focusable. Внешние ресурсы, text,
scripts, filters и HTML injection исключены. Caller class/style сохраняются.
Фактические размеры задаёт прежний CSS. Геометрия одна для shell, tests и dev
gallery; отдельный HTML preview entry не включается в production main.

Сохраняются решения ADR-043 по Quick Capture: canvas flip скрыт, fallback canvas
actions отсутствуют, toolbar без schema не создаёт DOM. В полном editor flip
и история сохраняются. Callout/Numbered Marker различимы; геометрические previews
параметров имеют собственную геометрию. App/tray assets и курсоры — отдельные
контракты. Document schema, renderer, originals и platform backends не меняются.

**Проверяемое основание:** runtime SVG-контракт всего каталога, source boundary,
gallery 16/18/20/24/32 CSS px и raster review при DPR 1/2, shell RU/EN × light/dark,
production Capture → Quick → Editor с native input, sampling и undo/redo.
Фактические команды, screenshots, ограничения и platform evidence — TESTING.md.

## ADR-057 — Монитор с кошачьими прищурами

**Статус:** accepted; supersedes ADR-047.

**Контекст:** пользователь выбрал вариант монитора с кошачьими ушами, подставкой
и двумя изогнутыми прищурами вместо прямоугольного просвета экрана. Прищуры
прочитаны пользователем как глаза; выбранный знак принят для проекта 2026-10-16.

**Решение:** общий источник хранит внешний силуэт монитора и крупный вырез
прищуров. App/editor/favicon/bundle: белый знак на тёмной плитке. Отдельный
`logo-mark.svg`: чёрный знак на прозрачном фоне. Windows/Linux tray: белый знак,
тёмный внешний контур и тёмные прищуры; контур рисуется под белой формой и не
сужает глаза или подставку. macOS template сохраняет настоящую прозрачность глаз.
Все SVG/PNG/ICO/ICNS генерируются через `pnpm icons:generate`; generated assets
не правятся отдельно. Новые зависимости и изменения platform backends не нужны.

**Проверяемое основание:** red-first Rust tests повторно декодируют embedded
PNG и проверяют оба прищура, stem/foot, прозрачность фона/template и двухтонный
tray. Размерный review 16/20/24/32 px и повторное декодирование bundle icons —
asset evidence; runtime tray light/dark/HiDPI на каждой ОС проверяется отдельно.
Фактические результаты и ограничения фиксируются в `TESTING.md`.

## ADR-060 — Различимые кисти и цельный контур

**Статус:** superseded в части формата составных штрихов и сглаживания их прямых участков — ADR-073;
в части выбора трёх кистей и сохранения экспрессивных штрихов — ADR-094;
supersedes карандашную часть ADR-056.

Точное перо сохраняет траекторию и постоянную толщину. Автокоррекция использует
стабилизацию perfect-freehand, экспрессивная кисть — переменный pressure outline.
Зависимость MIT закреплена в editor-core. Новый pencil payload имеет
`strokeVersion: 2`, `pressureMode: pen | simulated` и brush `pen | stabilized | brush`.
Отсутствие версии сохраняет прежний renderer; неизвестная версия отклоняется codec.
Schema v7, original blobs и IPC не меняются. Исходные samples остаются в payload;
контур вычисляется DOM-free resolver для scene, bounds, hit testing и миниатюр.
Настройки и pressureMode фиксируются при начале жеста, pointerup сохраняет
конечную позицию без нулевого отпускного pressure. Один штрих — одна command.

**Проверяемое основание:** red-first тесты разных геометрий, RMS шума ≤50%
при 65% коррекции, legacy pixel stability, цельное наложение opacity, decoded
Canvas2D/CanvasKit export, production pointer flow и 12 000 samples на 4K/8K.

## ADR-061 — Панель текста и 12 переносимых гарнитур

**Статус:** accepted; supersedes bundled-font baseline portion of ADR-025.

**Контекст:** native color/font/alignment controls расходятся с остальными
инструментами, системный каталог перегружен и не показывает внешний вид.
Пользователь выбрал 12 bundled fonts, образцы только в меню и все функции на виду.

**Решение:** общая панель использует UiIcon, SimpleColorPicker и NumericControl;
выравнивание задаётся тремя кнопками. Целые группы переносятся на узкой ширине.
Каталог: Roboto, Manrope, Rubik, Comfortaa, Oswald, PT Serif, Lora, Roboto Slab,
JetBrains Mono, PT Mono, Caveat, Marck Script. Статические Fontsource 5.3.0,
Latin/Cyrillic, 400/700 и доступные italic; недоступные faces синтезируются.
Roboto Slab — Apache-2.0; остальные — OFL-1.1 с version-specific allowlist.
Образец — 32 Unicode code points выделения/текста либо локализованный пример.
Клик применяет готовый face; loading/error/retry видимы, hover не меняет документ.
Старое family сохраняется с предупреждением вне встроенного набора. Документ v7,
IPC, EditorCommand и общий inline commit сохраняются.

**Проверяемое основание:** component/browser проверки selection, keyboard,
responsive geometry и undo; локальные реальные faces и decoded PNG, отдельно
фиксируемые результаты real WebView и обеих renderer-веток в TESTING.md.

## ADR-062 — Измеряемая геометрия текста и ограниченный ввод

**Статус:** accepted; уточняет sizing/wrapping REQ-TOL-005, дополняет ADR-061.

**Контекст:** DOM начинался с трети ширины canvas, persisted bounds считались
как length × size × 0.6, а renderer измерял реальный font. Рамка расходилась
с glyphs, длинное слово растягивало строку. Источники и UX-основание —
[research](TEXT_LAYOUT_RESEARCH.md).

**Решение:** новый point text растёт от одного em до 480 document px, затем
переносится. Ручной width resize сохраняет fixedWidth и может превысить cap.
Короткий текст сохраняет autoSize, перенесённый — существующий fixedWidth v7.
Действующие autoSize документы не получают новый cap при открытии. Browser
Canvas2D измеряет реальные загруженные faces; общая renderer layout определяет
bounds и soft line boundaries для inline projection, commit, style и resize.
Переносы сохраняют исходную строку, UTF-16 bookmarks и целые graphemes.
Ширина фрагмента измеряется целиком, с kerning. Сохранение и undo используют
прежние EditorCommand; schema/IPC не меняются. Text, callout и numbered marker
сохраняют разные container semantics. Popup использует shrinkable grid tracks,
box sizing и перенос controls вместо горизонтального скролла. Inline toolbar
ограничивается viewport, независимо от ширины снимка. Перед измерением доступны
все B/I faces используемой гарнитуры; stale blur не подтверждает активный draft.

**Проверяемое основание:** red-first renderer/core contracts, component
selection/source roundtrip, production browser input с long Cyrillic/Latin,
12 faces, resize/style/undo, decoded export и отсутствие popup overflow.
Фактические команды, platform и ограничения фиксируются в TESTING.md.

## ADR-063 — Согласованные переходы инструментов и панелей

**Статус:** superseded by [ADR-069](#adr-069-настройки-до-создания-с-приоритетом-свободного-canvas); supersedes ADR-048 и ADR-052.

**Контекст:** пользователь подтвердил defaults только через ПКМ и снятие выбора
при creation activation. Пустой hit ранее оставлял selection, а hotkey менял tool
без закрытия прежнего configure. FigJam/Excalidraw служат UX-ориентирами.

**Решение:** общий переход для buttons/hotkeys/configure/layer selection/create;
defaults только ПКМ/Shift+F10/ContextMenu с самой кнопки. Пустой canvas/background
очищает selection. Панели принадлежат owner, включая teleport; Escape закрывает
один уровень с focus return, outside click не поглощается и не крадёт фокус.
Inline commit завершается перед новым режимом/выбором с учётом IME/fonts.
Crop сохраняет Apply/Cancel; flip canvas переносится в More actions.
Creation policies, compatible/mixed selection toolbar, style clipboard,
раздельные persistent defaults и их независимость от undo/redo из ADR-048
сохраняются. Снизу ToolRail; Layers остаётся управлением слоями. Quick не
получает общие canvas actions. Document v7 и IPC неизменны.

**Проверяемое основание:** воспроизведение пустого hit/background и Arrow → P
при открытом configure; mounted-shell regressions, browser pointer/keyboard и
production Tauri Capture → Quick → Editor. Команды, artifacts и ограничения
платформ записываются в TESTING.md.

## ADR-064 — Физические буквенные shortcuts редактора

**Статус:** accepted; дополняет ADR-063.

**Контекст:** `KeyboardEvent.key` содержит символ активной раскладки. Поэтому
привязанные к букве команды, в том числе Undo, не работали после переключения
с латиницы.

**Решение:** буквенная команда получает латинскую букву из `KeyboardEvent.code`
формата `KeyA`…`KeyZ`; это идентификатор физической позиции клавиши. Если `code`
отсутствует либо равен `Unidentified`, используется прежний ASCII `key` fallback.
Правило обслуживает существующие команды editor shell, инструментов, numeric
preview и пустого desktop window. Editable controls и inline text сохраняют
свою обработку, IME composition и `defaultPrevented` не вызывают команду.
Новые shortcuts не добавляются; schema v7, IPC, Rust и EditorCommand не меняются.

**Проверяемое основание:** unit/component регрессии русской и иной нелатинской
раскладки, browser native input и real Tauri с системными раскладками. Команды,
platform evidence и известные ограничения — в `TESTING.md`.

## ADR-065 — Измеряемая подпись выноски

**Статус:** superseded in label side/attachment by [ADR-087](#adr-087-управляемая-линия-и-оболочка-выноски), in width control presentation by [ADR-103](#adr-103-ширина-подписи-выноски-в-выпадающей-панели); remaining measurement/sizing accepted; supersedes ADR-032 in label placement/sizing only.

**Контекст:** callout inline editor retained a one-em width and always opened to
its label's right. Character-count bounds disagreed with glyph metrics and reopening.

**Решение:** label.x < target.x places the entire padded label to its left;
otherwise to its right, with a 6 document-pixel marker gap and vertical centering.
A host-provided, cached rich-text measurement context supplies scene projection,
hit-test, selection and command rebasing. Core remains DOM-free; derived metrics
are not persisted. New labels grow up to 480 document px; an outer width handle
and numeric width/Auto controls change existing v7 wrap/fixedWidth without scaling
fonts or moving connector endpoints. Existing autoSize content retains its mode.
Each committed gesture remains one EditorCommand.

**Проверяемое основание:** core red-first placement/width tests, Vue editing and
renderer regressions plus browser and real-WebView production drag-flow evidence
are recorded in TESTING.md; missing platform runs are explicitly reported.

## ADR-066 — Специализированная номерная метка

**Статус:** superseded в части произвольной подписи решением ADR-068; остальные положения accepted.

**Контекст:** текстовая панель скрывает форму и следующий номер; фиксированная
рамка 32×32 обрезает длинные номера и подписи.

**Решение:** специализированная компактная панель для numberedMarker с отдельными
цветами badge/label и progressive disclosure текста. Автонумерация max+1;
одноразовый override принадлежит документной сессии и не является preferences.
Повторы допустимы с подсказкой. Измерение rich text и DOM-free shape geometry
задают безопасную область, квадратную оболочку и неизменный центр. Старый v7
документ при открытии не переразмечается; новые/изменённые метки проходят общий
prepare до EditorCommand. Canvas preview хранит pointer вне Vue и рисуется RAF.
Defaults, selection и inline используют существующее владение transient surfaces.
Общая панель Text/Callout и остальные решения ADR-061 сохраняются.

**Проверяемое основание:** воспроизведённая двухстрочная панель с overflow,
red-first tests нумерации/геометрии, Vue и browser flows, decoded renderer и
доступный native WebView; команды и ограничения записываются в TESTING.md.

## ADR-067 — Предпросмотр номерной метки заменяет курсор

**Статус:** accepted; дополняет ADR-066.

**Контекст:** центрированный badge уже обозначает точку размещения. Дополнительный
крест закрывает цифру; устаревший preview после defaults вводит в заблуждение.

**Решение:** внутри canvas при активной номерной метке системный cursor скрыт.
Preview получает актуальные sequence, shape и style; изменения настроек и загрузка
шрифта инвалидируют измеренную геометрию. Pointer хранится в canvas controller,
RAF обновляет overlay без Vue pointermove renders. Во время настроек preview скрыт;
pan использует grab/grabbing, за пределами canvas остаётся системный курсор.

**Проверяемое основание:** browser regression считывает pixels overlay до/после
смены square/blue на diamond/red, проверяет форму, цвет, cursor и payload создания.
Команды, screenshots и native ограничения — TESTING.md.

## ADR-068 — Подпись номерной метки рядом с номером

**Статус:** accepted; заменяет трактовку произвольной подписи в ADR-066.

**Контекст:** пользователь уточнил назначение подписи: это текст рядом с номером,
аналог текста выноски, чтобы не создавать и не выравнивать отдельный Text layer.

**Решение:** sequence всегда рисуется внутри badge. Подпись расположена справа
с зазором 8 document px и центрируется по вертикали; перенос ограничен 480 px.
Номер, подпись и badge — один перемещаемый/удаляемый/undoable объект. Изменение
подписи не увеличивает badge. Inline редактирует только подпись; номер доступен
отдельным полем. Пустая подпись удаляет внешний текст.

Document v7 и IPC сохраняются. Существующий rich-text label содержит первую
строку номера и необязательные следующие строки подписи; projection разделяет
их и сохраняет стили/ranges. Старые label, совпадающие с sequence, остаются без
внешней подписи; старые произвольные label показываются рядом. Переразметки при
открытии нет. Layout/hit-test/selection/export используют одну измеренную область.

**Проверяемое основание:** red-first проверка независимости sequence и подписи,
сохранения центра/размера badge и portable round-trip, browser edit/undo и
декодирование PNG обоих backend; фактические результаты — TESTING.md.

## ADR-069 — Настройки до создания с приоритетом свободного canvas

**Статус:** accepted; supersedes ADR-063.

**Контекст:** пользователь отказался от скрытого единственного входа в defaults
и длинных tooltip-инструкций. Настройки кисти/фигуры полезны до первого жеста,
текстовые — после размещения. В Quick Capture настройки не должны мешать рисованию.

**Решение:** единая внутренняя политика открывает defaults arrow/shape/pencil/
marker/numberedMarker/censor/spotlight/ruler/loupe при активации. Text/Callout
оставляют inline controls; Crop — Apply/Cancel. Полный editor показывает строку
над ToolRail. Quick размещает целую группу вне crop (below, затем above);
при нехватке места сворачивает настройки в явную кнопку. Явный popover не
поглощает outside-pointerdown. Во время gesture chrome не перемещается.
ПКМ и клавиатурный configure фокусируют строку либо открывают явный popover.
Tooltip содержит только имя и shortcut.

Сохраняются остальные переходы ADR-063: activation очищает selection,
inline commit завершается перед сменой режима, Escape закрывает один уровень,
selection styles не дублируются снизу, defaults независимы от undo/redo.
Document v7, IPC и публичные API остаются прежними.

**Проверяемое основание:** matrix mounted-shell click/hotkey/creation,
геометрические проверки внешнего размещения и fallback при полном crop,
browser/native pointer creation после outside-dismiss. Фактические команды,
платформы, снимки и ограничения фиксируются в TESTING.md.

## ADR-073 — Прямые участки карандаша и выделителя через Shift

**Статус:** accepted; supersedes соответствующую часть ADR-060.

Shift начинает прямой участок от конца траектории с ближайшим направлением,
кратным 45°, и сохраняет длину вектора. Отпускание фиксирует участок, а offset
между его концом и raw cursor сохраняется до конца жеста. Предыдущие участки
не перерисовываются. Состояние DOM-free, transient, общее для двух инструментов;
keydown/keyup и pointerup используют тот же контракт, что coalesced pointermove.
Escape активного pencil/marker stroke обрабатывается canvas-controller в capture
phase до window Close
Quick Capture; отмена начального выбора и Escape вне штриха сохраняются.

Marker сохраняет рассчитанные points. Pencil с прямыми диапазонами использует
`strokeVersion: 3`, `straightSegments: [{start, end}]` с включительными индексами
samples. Диапазоны упорядочены, не перекрываются (общий endpoint допустим),
непусты и находятся внутри points. Свободные spans сглаживаются отдельно;
прямые сохраняют ось и anchors. Expressive brush строит один pressure outline
по объединённой оси. Schema v7 и IPC остаются прежними; обычный pencil сохраняет
версию 2, прежняя геометрия не меняется. Старые приложения не поддерживают
версию 3 и отклоняют её существующей проверкой неизвестного strokeVersion.

**Проверяемое основание:** red-first core contracts для восьми направлений,
смешанных участков, pressure и offset; codec/style/resize/history round-trip,
Vue coalesced/key-only/cancel, decoded export parity и native production flow.
Фактические результаты и платформенные ограничения записываются в TESTING.md.

## ADR-074 — Привязка линейки через Shift

**Статус:** accepted; дополняет линейку ADR-056 и ограничения ADR-059.

Shift задаёт шаг 45° при создании линейки и изменении её endpoints.
Alt сохраняет настраиваемый шаг; Shift имеет приоритет при одновременном
удержании. После отпускания Shift остающийся Alt восстанавливает свой шаг,
без модификаторов возвращается raw pointer. Keydown/keyup пересчитывают
preview без движения мыши, pointerup учитывает финальные координаты и клавиши.
Линейка всегда остаётся одним отрезком.
Общий core resolver сохраняет длину вектора и ограничивает snapped ray
видимым canvas; фиксированный endpoint при resize не меняется.
Transient шаг не попадает в defaults/payload. Schema, renderer, экспорт
и формат документа не меняются; commit по-прежнему одна undoable command.

**Проверяемое основание:** red-first Vue input tests, key-only transitions,
оба endpoints, Shift/Alt priority, browser DPR 1/2 и production Quick → Editor
в настоящем Tauri webview. Команды и ограничения — TESTING.md.

## ADR-075 — Навигация настроек и запись сочетания в строке

**Статус:** accepted; дополняет ADR-070.

**Контекст:** два пункта трея открывали одинаковое окно. Recorder находился
под всем списком; «Изменить» только открывал его, хотя текст уже предлагал
нажимать клавиши. Автозапуск был скрыт ниже назначений.

**Решение:** один пункт «Настройки…», постоянные разделы «Общие» и
«Горячие клавиши» слева. Обычный вход открывает общие настройки, существующий
CLI `--section shortcuts` — сочетания; открытый singleton сохраняет раздел.
«Назначить…»/«Изменить…» сразу включает запись в строке действия. Сохранение
явное; ошибки, конфликт, pending verification и проверочное нажатие находятся
в этой строке. Вертикальное троеточие открывает проверку и удаление. Tab/blur
освобождают recorder; Escape и смена раздела/строки отменяют черновик.
Асинхронная проверка привязана к поколению редактора, а не только тексту
сочетания. Portal остаётся системным редактором; native registrations,
автозапуск, IPC DTOs и формат preferences не меняются.

**Проверяемое основание:** red-first Rust entry-point contract и mounted
Vue tests, browser keyboard/menu/resize сценарии, real Tauri recorder,
физическая активация и relaunch. Фактические результаты и ограничения —
TESTING.md; источники UX — HOTKEYS_RESEARCH.md.

## ADR-076 — Понятные параметры и база процентов линейки

**Статус:** accepted; дополняет ADR-056/059/074.

**Контекст:** три числа без видимых смысловых ориентиров плохо различимы;
единицы измерения в меню размера текста выглядят как единицы шрифта.
Единственная диагональная база всего canvas не описывает область Quick Capture.

**Решение:** одна строка: цвет, пиктограмма толщины с px, Aa с размером в px,
прямой разделитель, пиктограмма линейки с длиной и явной базой процентов.
Четыре режима находятся в меню измерения: pixels, percent от ширины/высоты/диагонали
crop либо canvas без crop. На линии и в экспорте остаётся короткая подпись.
Все потребители используют один расчёт, включая bounds badge и hit testing.
Изменение единиц/базы атомарно; изменение crop включает производную геометрию
locked/hidden rulers в свою команду. Schema v7 расширяет существующий percentBasis;
прежние диагональные значения сохраняются. Новая установка использует pixels
и предпочитает canvasWidth; старые preferences без базы получают canvasDiagonal.

**Проверяемое основание:** пользовательский сценарий с закрытыми меню, red-first
core/codec/history, mounted Vue, decoded renderer и browser/native сценарии.
Фактические результаты и платформенные ограничения фиксируются в TESTING.md.

## ADR-077 — Форма скрытия данных выбирается до рисования

**Статус:** accepted; дополняет ADR-069.

**Контекст:** смена rectangle на freeform у готовой области создавала polygon
из четырёх прежних углов: выбор менялся, видимого результата не было. Обратная
смена могла потерять произвольный контур.

**Решение:** censorRegion существует только в defaults/configure до рисования,
включая Quick Capture. Selection одного или нескольких объектов показывает
эффект и его параметры без выбора и подписи формы. Прямой вызов censorRegion
для существующего слоя обрабатывается без изменения документа/history/defaults.
Следующая область использует выбранный creation default. Формат v7, persisted
points, public API, renderer и undoable effect updates сохраняются.

**Проверяемое основание:** red-first Vue отсутствие selector для rectangle,
freeform и группы, закрытие открытого меню при исчезновении control, no-op
resolver; browser и real Tauri pointer creation rectangle → freeform, эффекты
и undo/redo через production Capture → Quick → Editor. Фактические результаты
и ограничения — TESTING.md.

## ADR-078 — Компактная временная история

**Статус:** accepted; supersedes maintenance scheduling portion of ADR-021.

**Решение:** вместо номерного filmstrip — кнопка истории и bounded popover. Общая история использует SQLite cursor pagination и неизменяемые blobs. Defaults: 7 дней / 512 МиБ / 200 кадров. Защита и активные leases важнее лимитов. Старые данные требуют согласия на preview. Maintenance выполняется после первого отображения, materialization/save, изменения политики и не чаще раза в час для периодического запуска. Startup recovery лишь восстанавливает journal; полная orphan sweep при старте запрещена. Ручное удаление подтверждается до commit, Undo удаления отсутствует. Undo документа не переносится между сессиями кадров.

**Проверяемое основание:** red-first Rust storage contracts, production session handoff tests, browser/native history flows, preview revision/censor tests и bounded-resource soak. Результаты и ограничения фиксируются в TESTING.md; наличие API не считается runtime evidence.

Исследование ADR-078: [паттерны истории и ограничения ресурсов](HISTORY_RESEARCH.md).

## ADR-080 — Меню приложения только в системной строке macOS

**Статус:** accepted; уточняет способ открытия Settings из ADR-070.

**Контекст:** `app.set_menu` с единственным пунктом «Cute Screen» на Windows и Linux рисуется полосой внутри каждого окна, под системным заголовком. В редакторе и в настройках это выглядит как второй заголовок с названием программы. На macOS то же меню остаётся в системной строке и окно не дублирует.

**Решение:** меню приложения устанавливается только на macOS. На Windows и Linux настройки по-прежнему открываются из трея и CLI; внутриоконная полоса не создаётся.

**Проверяемое основание:** контракт `installs_app_menu` отличает macOS от остальных платформ. Визуально полоса отсутствует в окнах Windows; first-run настройки держат галочку по центру подписи, а сноска об истории имеет тот же боковой отступ, что и содержимое.

## ADR-079 — Пропорции указателя лупы

**Статус:** accepted; дополняет REQ-TOL-011, не заменяет принятые ADR.

**Контекст:** фиксированные 3 px линии и максимум 12 px наконечника теряются
рядом с большой линзой и толстой рамкой, особенно при уменьшенном viewport.

**Решение:** в document pixels толщина линии `t = clamp(0.65 × borderWidth, 3, 8)`;
длина наконечника `L = min(lensSize / 2, clamp(max(0.05 × lensSize, 4 × t), 16, 32))`.
Полуширина треугольника — `0.45 × L`. Border=0 сохраняет указатель с t=3.
Линия заканчивается на 0.35 × L перед source center, наконечник указывает на
source center. Цвет следует рамке; при source внутри линзы connector отсутствует.
Оба backend используют общий расчёт после snapshot composite-below; viewport
и export scale масштабируют геометрию. Нового контрола, schema и IPC нет;
существующие документы получают новые производные пропорции при отрисовке.

**Проверяемое основание:** при lensSize=512 и borderWidth=8 ожидаются t=5.2,
L=25.6 вместо прежних 3/12. Геометрические и decoded-pixel проверки обоих
backend, browser/native изменение размера и рамки, cancel и undo/redo;
визуальная проверка 256/512 px на светлом/тёмном фоне и при уменьшении.
Фактические команды, результаты и ограничения — TESTING.md.

## ADR-083 — PNG export полного редактора

**Статус:** accepted (2026-10-17); дополняет ADR-021.

**Контекст:** native desktop action Export возвращал `export is not available yet`,
хотя кнопка была доступна. Scene preview зависит от zoom/DPR, а при Crop показывает
весь canvas, поэтому его bitmap нельзя использовать как итоговый файл.

**Решение:** после подготовки inline edits и flush полный editor экспортирует
committed scene через существующий renderer `exportPng({ scale: 1 })`. Native Save
As выдаёт одноразовый opaque ticket; PNG идёт raw binary IPC с ticket в header.
Rust пишет атомарно и проверяет PNG; canonical paths внутри app library запрещены.
Отмена диалога и отмена до записи не создают output, ошибки допускают retry.
Document schema, original blobs и undo history сохраняются. Этот срез даёт PNG 1×;
JPEG/WebP и настройки качества/масштаба остаются отдельной частью REQ-OUT-003.

**Проверяемое основание:** red-first desktop action воспроизводит сообщение со
скриншота; Rust проверяет overwrite, декодированные RGBA и отказ для originals;
реальный WebView проверяет production Open image, аннотацию, crop и отмену picker.
Фактические результаты и границы — TESTING.md.

## ADR-084 — Общий шаблон имени PNG

**Статус:** accepted (2026-10-17); дополняет ADR-083.

**Контекст:** пробелы в имени неудобны; дата в начале имени должна поддерживать
хронологическую сортировку. Пользователь хочет менять формат в настройках.

**Решение:** default `{date}_{time}_Скриншот` формирует
`YYYY-MM-DD_HH-MM-SS_Скриншот.png` по локальным часам открытия Save As. В General
Settings доступны draft, native preview, Save, Cancel и Reset. Обязательные
подстановки `{date}` и `{time}` имеют фиксированные сортируемые ISO-компоненты;
расширение .png добавляется автоматически. Rust запрещает whitespace, path
separators, управляющие/запрещённые Windows символы, неизвестные tokens и слишком
длинные имена. Settings key `export.filename.v1` хранится в существующей SQLite,
без изменения schema. Невалидная/повреждённая запись даёт default; failed save
не меняет прежний выбор. Оба Save As читают сохранённый шаблон заново.

**Проверяемое основание:** red-first Rust формат/validation/reopen; Vue async
preview/cancel/error/retry; real-WebView General Settings save → reopen → export
с декодированием 4K output. Команды и платформенные границы — TESTING.md.

## ADR-100 — Самостоятельная линия на общей геометрии стрелки

**Статус:** accepted; дополняет ADR-069, ADR-064 и creation policy ADR-048.

**Контекст:** пользователь может не знать о прямых штрихах карандаша. Для быстрых
подчёркиваний нужен заметный инструмент без настроек наконечников и траектории.

**Решение:** Line (L), Loupe (Z), repeat policy. Общий annotationTool resolver
разделяет UI, defaults, layer labels и style inheritance. Persisted kind остаётся
arrow, optional annotationTool: line разрешён только для straight/none/none;
codec сохраняет признак, legacy arrows не переопределяются. Document v7 и IPC
сохраняются. В preferences drawing.defaults.line хранятся отдельные stroke и
UI-only autoAlignAxes; последний не является каналом стиля и не попадает в слой.
Transient resolver привязывает к оси при <=5°, удерживает до >8°; Shift 45°
имеет приоритет. Endpoint editing выполняет projection в world coordinates.
Создание/правка — одна команда; preview и final pointerup используют один resolver.

**Проверяемое основание:** red-first line.test.ts, mounted line-tool.test.ts,
decoded 4K Canvas2D/CanvasKit, browser native input и real WebView Quick → Editor
→ reopen. Команды и фактические границы платформ записываются в TESTING.md.
UX-источники: [Figma](https://help.figma.com/hc/en-us/articles/360040450133-Shape-tools),
[Greenshot](https://getgreenshot.org/help/#drawing-shapes),
[Krita](https://docs.krita.org/en/reference_manual/tools/line.html).

## ADR-096 — Компактные Quick actions и завершение в историю

**Статус:** accepted (2026-10-18); дополняет ADR-041 и ADR-055.

**Контекст:** текстовые Quick actions занимают лишнюю ширину; нужен выход
с сохранением снимка без clipboard, файла или открытия editor.

**Решение:** вертикальные UiIcon-кнопки 36×36, icons 20×20, RU/EN hover/focus
подсказки и aria-label. History добавляется в CaptureCompletion существующего
commit IPC. Перед commit завершаются inline text/crop; clean original и editable
слои сохраняются атомарно. Quick закрывается после commit, без editor handoff.
Failure допускает retry; после durable commit повторный History только dismiss.
Схема хранения и binary transport сохраняются.

**Проверяемое основание:** red-first Rust completion/rollback, Vue pending/retry,
X11 restoration regression и Windows real-WebView Quick → history → restart
с декодированием изображения и проверкой слоёв; результаты — TESTING.md.

## ADR-102 — Скрытие chrome во время изменения Quick-рамки

**Статус:** accepted (2026-10-18); дополняет ADR-069 и ADR-096.

**Контекст:** замороженные позиции тулбаров при resize узкой области оставляли
панели поверх изображения и мешали оценить границы снимка.

**Решение:** canvas controller сообщает DOM-событием только начало и конец
Quick frame gesture (initial selection/move/resize). Quick chrome становится
невидимым до pointerup либо отмены; mounted controls сохраняют размеры для
layout. После жеста размещение пересчитывается у committed crop. Escape
активного Quick resize перехватывается до terminal Close. Аннотации и Crop
полного редактора сохраняют прежнюю видимость. Pointermove не создаёт новых
реактивных UI updates; EditorCommand, undo/redo, document и IPC не меняются.

**Проверяемое основание:** mounted resize проверяет pointerup/pointercancel,
Escape/blur и отсутствие сигнала при рисовании. Real WebView Capture → Quick
проверяет hidden chrome при удерживаемом native pointer, возврат панелей,
undo/redo и Escape без закрытия Quick. Результаты — TESTING.md.

## ADR-101 — Встроенные эмоджи Noto 2D

**Статус:** accepted (2026-10-18); дополняет ADR-025 и ADR-069.

**Решение:** 100 статических Noto 2D SVG из закреплённого upstream commit,
Apache 2.0 и NOTICE поставляются вместе с приложением. XML declarations/DOCTYPE
удалены, namespace entities раскрыты; художественная графика не меняется.
Документ v7 сохраняет существующий EmojiLayer и versioned reference
`notoEmoji/noto-2d-v1/assetId`, а не шрифт, DOM или bytes. Default 64 px,
13 быстрых отметок, палитра RU/EN и локальные 12 recent items. Emoji —
однократный инструмент E с последующим Select. Instance changes не пишут defaults.

Общий resolver декодирует SVG до создания слоя и при открытии; ошибки не
подменяются системным glyph. Scene использует image nodes, включая gesture preview
и export. Для history worker SVG сначала преобразуется в PNG Blob в WebView:
createImageBitmap(SVG) не является переносимой гарантией. Оригинальные screenshot
blobs и native IPC не изменяются. Новая версия документа не требуется.

**Проверяемое основание:** red-first emoji core contracts; checksum и pixel decode
всех 100 SVG; экспорт с повторным декодированием; production browser и Tauri
scenarios emoji/emoji-reopen. Фактические результаты и ограничения — TESTING.md.

## ADR-103 — Ширина подписи выноски в выпадающей панели

**Статус:** accepted; supersedes width control presentation in ADR-065.

**Контекст:** числовое поле и отдельное «Авто» перегружают inline-панель,
нарушают единый ряд controls и не объясняют автоматический режим.

**Решение:** одна кнопка «Ширина» с текущим режимом и chevron открывает
компактный dropdown. «По содержимому» объясняет автоматический рост и перенос;
ниже доступна ручная ширина в px. Новый текст сохраняет auto-size. Dropdown
использует общий preview-placement и transient owner; Escape отменяет draft,
закрывает только этот уровень и возвращает focus. Read-only закрывает панель.
Sizing, schema, EditorCommand, inline commit и undo/redo не меняются.

**Проверяемое основание:** регрессия Vue проверяет hidden numeric field,
режимы, минимум, cancel/focus, взаимное закрытие и disabled. Browser drag-flow
проверяет RU/EN, обе темы, 1024 px и zoom с видимой подписью и dropdown.
Фактические результаты и ограничения WebView — TESTING.md.

## ADR-105 — Открытие атрибуции Noto Emoji системным браузером

**Статус:** accepted (2026-10-18); дополняет ADR-101.

**Контекст:** обычная ссылка с target=_blank в Tauri WebView не передавала
URL системному браузеру; нажатие атрибуции оставалось без результата.

**Решение:** native host подключает MIT/Apache-2.0 tauri-plugin-opener 2.5.3,
совместимый с закреплённым Tauri 2.11.5. Его штатный initialization script
обрабатывает активацию существующей ссылки. Capability emoji-attribution
разрешает main и quick-capture только open-url для точного upstream URL,
без default permission set, открытия файлов и произвольных URL. Renderer
остаётся независимым от Tauri; browser preview сохраняет обычную ссылку.
Enter на атрибуции не всплывает в глобальный Quick shortcut Copy, но
сохраняет default activation ссылки.
Новый EditorCommand и изменение документа не нужны.

**Проверяемое основание:** capability regression и реальный Linux WebView:
production Capture → Quick → Editor, click/Enter атрибуции, вызов OS opener,
отказ для постороннего HTTPS URL, file URL и вложенного пути. OS boundary
в тесте записывает аргументы вместо запуска браузера. Результаты — TESTING.md;
Windows/macOS runtime требуют отдельного подтверждения.
