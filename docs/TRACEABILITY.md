# Трассируемость требований

## Версия 0.1.3 (2026-10-18)

`REQ-REL-001/002/003/005`: штатной командой `pnpm version:bump 0.1.3`
синхронизировать package.json, Tauri config, Cargo workspace, локальную storage
dependency и Cargo.lock. Проверить release version guard для `v0.1.3`, Cargo
metadata с `--locked --offline`, boundary tests и форматирование.
Реализовано; release guard, Cargo metadata, boundary 81/81 и formatting/docs
checks passed. Фактические команды и артефакты — TESTING.md.

## Диагностика аварийного выхода Vitest (2026-10-18)

`REQ-REL-001/002/003/005`: закреплённый patch Vitest 4.1.10 добавляет в ошибку
worker имя проекта, последние назначенные test files, exit code и signal.
Число workers, изоляция, timeout и отказ gate при unhandled error сохраняются.
Boundary-проверка запускает настоящий fork с exit 23 и SIGKILL, а также
обычный успешный тест и assertion failure. Patch улучшает диагностику;
первопричина исходного CI crash не считается исправленной без воспроизведения.
Реализовано; boundary 81/81 passed. Команды и результаты — TESTING.md.

## Версия 0.1.2 (2026-10-18)

`REQ-REL-001/002/003/005`: штатной командой `pnpm version:bump 0.1.2`
синхронизировать package.json, Tauri config, Cargo workspace, локальную storage
dependency и Cargo.lock. Проверить release version guard для `v0.1.2`, Cargo
metadata с `--locked --offline`, boundary tests и форматирование.
Реализовано; release guard, Cargo metadata, boundary 78/78 и formatting/docs
checks passed. Фактические команды и артефакты — TESTING.md.

## Clang runtime в macOS linker (2026-10-18)

`REQ-REL-002`, `REQ-CAP-015`: native bridges с `@available` должны линковаться
при Rust `-nodefaultlibs` с baseline macOS 12.0. Build script явно просит
Clang подключить builtins runtime через `-fapple-link-rtlib`; Xcode выбирает
путь и архитектуру библиотеки. Compile matrix должна выполнять настоящий
`cargo build` и CLI `--help` на macOS Intel/ARM64, поскольку `cargo check`
не обнаруживает undefined `__isPlatformVersionAtLeast` на этапе линковки.
Red evidence: release run 39142547248, job 117722198522, arm64 linker failure.
Реализовано; Linux boundary 78/78, Rust workspace 184/184 и actionlint passed.
Локальные Linux checks не заменяют macOS link/runtime evidence; новый macOS
run pending. Команды и артефакты — TESTING.md.

## Fixtures независимого Rust CI (2026-10-18, до реализации)

`REQ-REL-001/005`, ADR-014/112: Rust/X11 job самостоятельно генерирует M01
fixtures перед `cargo test --workspace` с/без `fake-platform`. Подготовка
не зависит от unit job, cache или файлов разработчика. Проверка: storage test
на чистом снимке commit без generated PNG должен падать с missing fixture,
после штатной `pnpm fixtures:generate:m01` — проходить; затем оба workspace suites.

Результат: clean-snapshot red/green подтверждён; workspace 184 и fake-platform
187 tests passed, boundary 78/78, actionlint, formatting и docs checks passed.
Команды и артефакты — TESTING.md; новый hosted run ещё не выполнен.

## Версия 0.1.1 (2026-10-18, до реализации)

`REQ-REL-001/002/003/005`: добавить `pnpm version:bump <MAJOR.MINOR.PATCH>`
для согласованного обновления тех же пяти файлов без создания commit/tag.
До записи проверять формат версии и согласованность исходных метаданных;
не менять версии внешних зависимостей, fixtures и приватных JS-пакетов.
Boundary tests запускают CLI во временном checkout и проверяют отказ без записи.

`REQ-REL-001/002/003/005`: синхронизировать версию приложения 0.1.1 в
package.json, Tauri config, Cargo workspace, локальной storage dependency и
Cargo.lock. Проверки: release version guard для `v0.1.1`, Cargo metadata с
`--locked --offline`, release boundary tests и форматирование. Поведение
приложения и версии приватных JS-пакетов не меняются.

## Независимые CI jobs и короткий E2E smoke (2026-10-18, до реализации)

`REQ-REL-001/002/003/005/006`, ADR-014/020: разделить Linux quality/runtime
job на независимые quality, unit/render/perf, Rust/X11, audits, browser E2E,
Tauri E2E и packaging. Все gates сохраняются перед публикацией Release;
package artifacts появляются независимо от E2E. По запросу владельца обычный
CI выполняет только browser/native smoke; полный E2E suite остаётся локальным
и доступным через manual workflow_dispatch. Smoke покрывает создание объекта,
undo/redo, Settings, production capture mount и PNG export.
Проверки: actionlint reusable workflow graph, фактический smoke запуск,
стабильные formatting/docs/boundary gates. Hosted длительности не обещаются.

`REQ-LIB-002`: clean-profile smoke использует кнопку History вместо удалённой
постоянной ленты кадров и проверяет размер сохранённого документа через native
API, а не размер viewport canvas после zoom. Подробные M03 persistence/reopen
UI tests остаются в full suite; их устаревшие popover selectors требуют
отдельного обновления. Обязательные Rust/storage integration tests сохраняются.

Результат: browser smoke 3/3 passed (9 s), native smoke 2/2 passed (26 s и 3 s
после сборки) на Ubuntu 24.04.5 x64 / GNOME X11, Chrome 154 и WebKitGTK 2.52.6.
Boundary 61/61, E2E types, lint и actionlint passed. Полный набор E2E не
объявляется успешным; новый hosted граф требует отдельного Actions run.
Команды, исходные failure logs и финальный smoke — TESTING.md.

## Пакеты в GitHub Releases (2026-10-18, до реализации)

`REQ-REL-001/002/003/005/006`: опубликованный GitHub Release с тегом
`vMAJOR.MINOR.PATCH` запускает проверки того же commit, затем прикрепляет
Linux x64/ARM64 DEB/AppImage, Windows x64/ARM64 NSIS и один macOS universal DMG.
Ручной запуск принимает существующий тег, включая уже созданный `v0.1.0`.
Несовпадение версий блокирует сборку; ошибка любого job блокирует публикацию.
К пакетам прилагаются SHA256SUMS, CycloneDX inventory и license report.
Повторный запуск не перезаписывает отличающиеся опубликованные файлы.
Проверки: version guard, комплектность пяти платформ, checksums и отказ
публикации при конфликте; hosted runtime/installer acceptance остаётся отдельной.

Результат: release boundary/API contracts 15/15, все boundary tests 61/61,
`pnpm check` и actionlint passed на Ubuntu 24.04.5 x64. Coverage scripts:
statements 92.85%, branches 85.59%. Hosted release run не выполнялся.
Команды и артефакты — TESTING.md.

## Версия приложения в настройках (2026-10-18, до реализации)

`REQ-UI-015`, часть `REQ-REL-004`: боковая панель Settings показывает текущую
версию под названием приложения во всех разделах. Native adapter читает
метаданные запущенного Tauri приложения; browser preview использует версию
из build config. Загрузка и ошибка чтения не блокируют настройки; ошибка
допускает повтор. Проверки: UI RU/EN, light/dark, компактное окно, переходы
между разделами и совпадение native metadata. Проверка новых версий по сети
остаётся отдельным planned контрактом.

Результат: unit 6/6, browser 2/2 passed; RU/EN × light/dark и compact layout
проверены по screenshots. Native metadata assertion прошёл в Settings
WebView; полный activation-settings native regression — 3/3 passed.
Команды и результаты проверок — TESTING.md.

## Захват после закрытия меню трея (2026-10-18, до реализации)

`REQ-CAP-001/002/005/006/012/014`: команды захвата из трея дают системному
меню 200 мс на закрытие перед обращением к backend. Пауза использует штатный
отменяемый delay и блокировку параллельного capture; hotkey, CLI и UI не
получают дополнительной задержки. Проверки: red-first Rust для всех пяти
tray actions и отмены до backend, реальное меню GNOME X11 → Area/Screen
с повторным декодированием frozen/original PNG. Платформенные ограничения
и фактические результаты фиксируются в TESTING.md.

Результат: Rust workspace и pnpm check passed. Native GNOME X11 tray click
проверил 40 250 decoded background pixels в Area frozen frame и Screen
original. Area materialization и остальные платформы этим не подтверждены.

## Native focus Area из фонового процесса (2026-10-18, до реализации)

`REQ-CAP-009/011/012/014`: видимый Quick selector после CLI/tray/hotkey должен
получать системный focus без клика. Escape до выделения отменяет захват при
активном постороннем приложении до вызова и при повторном захвате. Проверка
установленного DEB воспроизвела Quick с DEMANDS_ATTENTION и focus в Codex;
WebDriver switchWindow скрывал дефект. Новый smoke использует только native
CLI/X11 input, не активирует Quick до assertions и проверяет typed cancelled.
Изменение native presentation проверяется failing smoke до реализации;
результаты и SHA256 установленного/проверенного ELF — TESTING.md.

## Escape до первого выделения Area (2026-10-18, до реализации)

`REQ-CAP-011/012/014`: первый Escape после открытия Area отменяет draft и
закрывает Quick Capture без клика/выделения, в том числе при фокусе на body
и во время первого drag. Повторный Area доступен сразу после отмены; документ
и original не создаются. В editing сохраняется приоритет отмены активного
штриха над закрытием и защита от key repeat после отмены штриха. Начальная
отмена срабатывает также при Escape с repeat=true после повторного открытия
WebView. Проверки: mounted production EditorShell (body/canvas/drag),
native X11 capture → trusted Escape без назначения focus → cancel → retry;
команды, артефакты и ограничения — TESTING.md.

## TypeScript architecture ratchets (2026-10-18, до реализации)

`REQ-EDT-002/015/016`, `REQ-CAP-012`, `REQ-TOL-015`: рефакторинг применения
стилей, финализации canvas gestures, preview панели фигур и image E2E сохраняет
существующие команды, undo/redo, focus/cancel и сравнения пикселей. Размеры
файлов, complexity и depth возвращаются в бюджеты ADR-042 без исключений
и повышения лимитов. Build boundary находит test-harness capability по
identifier среди строковых ссылок и inline capabilities. Проверки: исходно падающий `pnpm test:boundaries`,
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` и browser
image-editing regression; фактические команды и результаты — TESTING.md. Итог:
45/45 boundaries, 1365/1365 unit/component, 51/51 renderer goldens и browser
image-editing (восемь сочетаний) passed; typecheck/lint/format также passed.

## Ссылка Noto Emoji (2026-10-18, до реализации)

`REQ-TOL-014`: ссылка атрибуции Noto Emoji в палитре открывает upstream
репозиторий в системном браузере из Editor и Quick Capture, включая Enter
при фокусе на ссылке. Native opener получает разрешение только на точный
`https://github.com/googlefonts/noto-emoji`, без файлов и произвольных URL.
Проверки: capability boundary и production mount → реальный WebView click/Enter
→ OS browser dispatch; browser-only/unit evidence не заменяет native прогон.
Linux/X11 WebKitGTK 2.52.6: native 1/1 passed, четыре dispatch по click/Enter
из Quick/Editor; scoped capability 2/2 и Vue 6/6 passed. Артефакты — TESTING.md.

## Ubuntu 22.04 как Linux build baseline (2026-10-18, ADR-104)

`REQ-REL-001`: Linux x64/ARM64 пакеты собираются на Ubuntu 22.04 с glibc 2.35
и обновлённым WebKitGTK 4.1. Изолированный local Docker build использует ту же
базу, отдельные dependencies/target и проверяет ABI перед выдачей пакетов.
CI отклоняет ELF с требованиями GLIBC выше 2.35; DEB объявляет минимальные
runtime dependencies. Проверки: отрицательный gate на прежнем Ubuntu 24.04
binary, новая release-сборка, DEB install/CLI и GUI launch в Jammy, AppImage
extract-and-run. X11/Wayland capture, hotkeys и clipboard требуют отдельных
runtime проверок и этим изменением не объявляются полностью подтверждёнными.

Результат x64: новый release ELF требует максимум GLIBC_2.34, DEB install/CLI,
AppImage extract-and-run и GUI startup с включённой sandbox в Jammy прошли;
контрольные суммы обоих пакетов проверены. Команды и ограничения — TESTING.md.

## Пользовательский README и GitHub-шапка (2026-10-18)

`REQ-UI-013`, `REQ-ACT-006`: пользовательская документация EN/RU использует
существующий статичный бренд ADR-057 и supplied ToolRail 598×41 без изменения
геометрии или поведения приложения. README описывает только реализованные
возможности с оговорками из PLATFORM_MATRIX и BUILD_RELEASE; инженерные
инструкции вынесены отдельно. Шапка README 1280×480 и Social preview 1280×640
проверяются визуально, повторным PNG decode, размером файла, относительными
ссылками и форматированием. Подготовленные метаданные GitHub сохраняют прежние
topics и homepage; по уточнению пользователя настройки применяются вручную.
Углы supplied screenshot обрезаются по скруглению панели без изменения исходника.
Evidence: EN/RU × light/dark × 375/1280 px в локальном preview с GitHub Markdown
API; команды и ограничения — TESTING.md. Новых продуктовых требований, IPC,
schema или платформенных гарантий нет.

## Независимый Vite cache для E2E (2026-10-18, до реализации)

`REQ-UI-001/006`: browser E2E mode использует отдельный optimize-deps cache
для своего порта, чтобы тестовый запуск не заменял зависимости работающего
dev editor и не вызывал HTTP 504 Outdated Optimize Dep. Проверка: одновременно
работающие dev/E2E серверы, HTTP-загрузка актуального импортируемого Tauri core
и повторная загрузка dev после старта E2E. Контракты приложения не меняются.

## Иконка выноски: карточка и точка (2026-10-18)

`REQ-EDT-008`, `REQ-TOL-007`, ADR-055: пользователь выбрал вариант 01.
Общий `UiIcon` показывает карточку с подписью, ступенчатую связь и точку цели
вместо Tabler `stroke-dynamic`. Каноническая геометрия хранится в `shell/icons/`;
gallery и landing используют тот же источник. Accessible names, shortcut O,
состояния кнопок и поведение инструмента сохраняются. Evidence: SVG-контракт,
Vue toolbar assertions, boundary checks, gallery 16/18/20/24/32 при DPR 1/2,
RU/EN × light/dark и production Capture → Quick → Editor. Фактические команды
и ограничения — TESTING.md.

## Иконки настроек выноски (2026-10-18, до реализации)

`REQ-TOL-007`, `REQ-EDT-016`, `REQ-UI-001/003/006`: пять групп selection/defaults
выноски показывают маршрут, оба наконечника и штрих графически, оформление
подписи и текст — существующими UiIcon. Названия групп и длинные значения
переносятся в локализованные подсказки; толщина и размер шрифта остаются
короткими числами. Mixed не показывает значение первого объекта как общее.
Сохраняются accessible names, disabled, единственный popover, Escape и возврат
фокуса. Проверки: Vue regression и browser production drag → commit → selection,
RU/EN, обе темы, 1024 px и zoom 50/100/200%; фактические результаты — TESTING.md.

## Миниатюра автоматического положения выноски (2026-10-18, до реализации)

`REQ-TOL-007`, `REQ-UI-001/006`: кнопка «Авто» в положении подписи показывает
простую карточку с линией и отдельной искрой автоматического выбора вместо
двух разрозненных стрелок. Это геометрический preview параметра в
`CalloutRouteSettings`, рядом с четырьмя фиксированными сторонами; доступное
имя, размеры кнопки и команда attachment сохраняются. Проверки: существующие
Vue toolbar/SVG/boundary tests, просмотр реального popover в обеих темах.
Фактические команды, screenshots и ограничения — TESTING.md.

## Ширина подписи выноски (2026-10-18, до реализации)

`REQ-TOL-007`, `REQ-EDT-016`, `REQ-UI-001/003/004/006`: inline-панель
показывает единую кнопку ширины высотой с остальными controls. Выпадающая
панель объясняет режим «По содержимому» и позволяет задать ширину в px;
новая подпись сохраняет auto-size. Escape отменяет числовой draft и закрывает
только выпадающий блок с возвратом фокуса; смена параметра закрывает соседние
popover, read-only блокирует правку. Проверки: Vue, browser production drag-flow,
RU/EN, light/dark, 1024 px, zoom и целевой WebView. Фактические результаты — TESTING.md.
Результат: Vue 14/14, browser visual 12/12 сочетаний и production WebView2
1/1 passed; существующие общие architecture violations описаны в TESTING.md.

## Chrome при изменении Quick-области (2026-10-18)

`REQ-UI-010`, `REQ-CAP-012`: при initial selection, move и resize Quick-рамки
панели инструментов, defaults, selection и actions скрыты до конца жеста.
Pointerup возвращает панели у новой рамки; pointercancel, Escape и blur
возвращают их у исходной. Рисование аннотации не скрывает chrome.
Доказательства: mounted canvas regression и production Capture → Quick
в real WebView с удержанием pointer, отменой, undo/redo и screenshot.
Фактические результаты и ограничения — TESTING.md.

## Общая тема окна настроек (2026-10-18)

`REQ-UI-001/002`, `REQ-ACT-008`: до реализации зафиксирован repair gate.
Settings применяет сохранённую тему общего shell store при production mount,
обновляет её по broadcast из редактора и при изменении системной темы в режиме
system. Все разделы, controls и scrollbar используют общие semantic tokens.
Проверки: mounted Settings, повторное открытие и live light/dark в настоящем
WebView2 через существующий сценарий `editor-settings`.
Результат: component 8/8, real WebView2 2/2 passed; команды и screenshots
записаны в TESTING.md.

## Подпись открытия изображения (2026-10-18, до реализации)

`REQ-UI-001/003/006`: «Открыть изображение» / «Open image» показываются
без многоточия в кнопке, tooltip и accessible name; общий перевод сохраняет
ту же подпись в пустом холсте. Существующие selectors обновляются под подпись.
Фактические проверки — TESTING.md.

## Прямые углы рамки изображения при радиусе 0 (2026-10-18, до реализации)

`REQ-TOL-015`, `REQ-EDT-005/006/016`: скругление изображения определяется
только radius; при 0 внешний контур рамки имеет прямые углы независимо от
сохранённого border.join. Общая scene-проекция использует miter для рамки,
не меняя persisted payload. Red-first core regression и повторно декодированные
Canvas2D/CanvasKit PNG проверяют четыре внешних угла с рамкой 26/32 px,
нулевой/положительный radius и preview/export parity на 4K изображении.
Production G import, возврат radius к 0 и undo/redo проверяются отдельно
в browser и real WebView. Результаты и ограничения — TESTING.md.

Результат: 9 focused core/renderer tests passed; production browser — все
8 сочетаний 1024/1600 × RU/EN × light/dark, включая corner pixels и undo/redo.
Real WebView2 pending: свежая сборка прошла, два запуска остановлены
занятым driver port и затем bind/closed-window startup failure до image assertions.
Общие gates имеют отдельные ошибки — TESTING.md.

## Эмоджи Noto 2D (до реализации, 2026-10-18)

REQ-TOL-014: палитра сохраняет высоту и положение при смене категории,
поиске и пустой выдаче; browser-emoji проверяет геометрию во всех этих состояниях.

REQ-TOL-014, REQ-EDT-002/003/006/015/018: инструмент E в Editor и Quick,
100 bundled Noto 2D SVG, 13 быстрых отметок (включая огонь и молнию), категории,
поиск RU/EN, 12 недавних, defaults 64 px (16–256), размещение центром кликом,
отменяемый preview без pointermove-реактивности и одна EditorCommand до Select.
Замена/размер экземпляра не меняют defaults; scene/export/reopen используют
versioned static reference без системных glyphs. Доказательства: failing core
контракты, asset decode/render, Vue и browser/real-WebView production flow.
Статус: implementation pending; артефакты и фактические проверки ниже после реализации.

## Линия (до реализации, 2026-10-18)

REQ-TOL-017, REQ-EDT-002/003/015/016/017: отдельная прямая линия (L), лупа (Z),
серийное создание, привязка 5°/8°, Shift 45°, отдельные defaults и semantic
annotationTool в arrow payload v7. Red-first core tests, decoded renderer,
production browser и real WebView Quick → Editor → reopen обязательны.
Результат: core/Vue 88/88, decoded 4K renderer 1/1, browser 2/2,
performance 6/6 и real WebView2 line,line-reopen 2/2 passed. Проверены series,
endpoint edits, clipboard pixels и восстановление шести линий/defaults.
Фактические команды, screenshots и ограничения — TESTING.md.
Уточнение UI по отзыву пользователя: icon-only toggle magnet/magnet-off,
название в tooltip/aria-label; постоянная текстовая инструкция рядом скрыта.

## Свёрнутый режим выделителя (2026-10-18)

`REQ-TOL-004`, `REQ-EDT-015/016`, `REQ-UI-003/006`: кнопка режима показывает
образец текущего цвета и интенсивности с подписью «Темнее / Светлее / Окрасить»;
Авто показывает resolved effect, loading/mixed — нейтральный образец.
Единый sample используется в trigger и меню; подписи пунктов меню сохраняются.
Запись добавлена до реализации. Vue: 51/51 passed; browser: RU/EN × light/dark
на 1024/1280 px; native: 2/2 tests passed, те же языки/темы в Editor и Quick,
trusted input и decoded screenshots образцов. Browser drawing checksum и общие
check/format gates оцениваются отдельно; команды и ограничения — TESTING.md.

## Отступ действия на пустом холсте (2026-10-18)

`REQ-UI-001/006`: запись до реализации. Кнопка открытия изображения отделена
от описания пустого холста отступом 16 px; большая иконка состояния 32×32
не меняет размер иконки внутри кнопки (18×18). Проверки и ограничения — TESTING.md.

## Подписи кнопок и закрытие истории (2026-10-18, до реализации)

`REQ-UI-001/006`, `REQ-LIB-013`: кнопки истории «Очистить»/«Хранение» и
«Настройки приложения» в дропе редактора показываются без многоточий в RU/EN,
включая accessible names. Подтверждение очистки и loading/error/disabled
сохраняются; progress-сообщения остаются с многоточиями. Крестик истории —
существующий UiIcon close 18×18 CSS px в кнопке 32×32, с focus-visible и
возвратом фокуса. Доказательства: существующие Vue regressions, browser
RU/EN × light/dark на 1024 px и native history-settings/editor-settings.
Фактические команды, screenshots и ограничения — TESTING.md.

Результат: Vue 12/12, все 8 выбранных browser cases passed с учётом rerun
expanded matrix. Scoped lint и E2E types — exit 0. Native запуск блокируется
TS2883 в текущем ShapeGradientEditor.vue; WebView2 evidence pending. Общие
format/check имеют ошибки вне правки. Подробные команды и логи — TESTING.md.

## Заливка и пунктир фигур (2026-10-18)

REQ-TOL-002, ADR-092: три образца заливки, редактор 2–8 точек линейного
градиента, solid/dashed/dotted для всех фигур в defaults/selection/group,
Editor/Quick. Red-first scene tests, Vue tests, decoded Canvas2D/CanvasKit
export parity и browser/real WebView evidence обязательны. Schema v7 сохраняется;
старые radial paints читаются без конвертации. Реализовано: 74 целевых tests,
46 renderer tests, browser locale/theme/zoom matrix и 2/2 real WebView2 scenarios
passed. Общий check/unit gate имеет отдельные ограничения; результаты — TESTING.md.

## Выбор окна без перекрытий (2026-10-18, ADR-091)

`REQ-CAP-003/008/010/015`: red-first native selection state tests закрепляют
initial hover, topmost identity, same-target click, Tab/Shift+Tab, empty Enter,
cancel и invalidated target. Windows Window требует WGC вместо desktop crop;
X11 — named Composite pixmap; macOS — single-window CoreGraphics/SCStream/
SCScreenshotManager с системным picker на 14+; Wayland — advertised portal v3
Window target. Native IDs не покидают Rust/Objective-C. Physical smokes обязаны
повторно декодировать PNG большого перекрытого окна и исключить pixels соседа
и selector; fake capture и browser tests не доказывают capture backend.
Запись добавлена до реализации. Реализованы native selectors и pixel backends,
typed recovery и отдельная Window capability. Windows 10/WebView2: физические
Escape/retry, click, Tab/Shift+Tab/Enter, EN/dark и RU/light прошли; PNG
1386×893 повторно декодирован и содержит скрытые контрольные pixels.
Rust workspace и focused Vue tests passed. Команды, артефакты, ограничения
общих gates и оставшаяся платформенная матрица — TESTING.md.

## Сборка macOS с SDK ниже 14 (2026-10-18, ADR-109, до реализации)

`REQ-CAP-003/009`: `@available` проверяет только ОС при запуске, поэтому
SCScreenshotManager, системный picker и свойства SCContentFilter из macOS 14
дополнительно исключаются при компиляции с SDK ниже 14. Тогда Window на любой
версии ОС использует AppKit selector и SCStream (12.3+) или CoreGraphics
(12.0–12.2); маршруты сборки с SDK 14+ не меняются. Native capability
`cute_macos_system_window_picker_available` — единственный критерий выбора
picker. Red-first Rust contracts: routing с учётом SDK и запрет 14+ маршрута
при SDK ниже 14. `build.rs` предупреждает о вырезанном маршруте,
`pnpm verify:release-boundary` отказывает релизу с SDK ниже 14. Evidence:
`pnpm tauri dev` и Window capture на macOS 12.7.6 с SDK 13.1, CI syntax check
legacy-ветки на macos-15. Команды и ограничения — TESTING.md.

## macOS: только Область и Экран (2026-10-18, ADR-110)

`REQ-CAP-003/009`, `REQ-ACT-*`: macOS capability не объявляет Window target;
gate отклоняет Window из tray/hotkey/CLI/UI, tray menu на macOS не содержит
«Снимок окна». Red-first Rust contracts: `macos_adapter_advertises_only_area_
and_screen_targets`, `capture_action_gate_follows_advertised_macos_capabilities`,
`tray_lists_window_capture_everywhere_except_macos`. E2E tray-locale ожидает
семь пунктов на macOS. Screen evidence: `pnpm smoke:m04:macos:screen` с
повторным PNG decode. Команды и результаты — TESTING.md.

## macOS: Screen без следа редактора и зависшего preflight (2026-10-18, до реализации)

`REQ-CAP-001/002/010`: Tauri `hide()` с async-потока только ставит сообщение в
event loop, поэтому CoreGraphics snapshot мог получить ещё видимый Editor.
На macOS main и settings скрываются `orderOut` на главной очереди AppKit, затем
capture ждёт, пока WindowServer перестанет считать окно on-screen; иначе захват
отклоняется и окно возвращается. Скрытый или свёрнутый WKWebView на macOS 12–13
приостановлен (`inactiveSchedulingPolicy` есть только с 14), поэтому
preflight к нему не отправляется: закрытие уже прошло flush, а mount
полученного документа сначала выполняет тот же flush и не заменяет документ при
отказе. Red-first Rust contract: `capture_preflight_skips_a_suspended_macos_editor`.
Native evidence: CLI Screen при видимом и скрытом Editor на macOS 12.7.6,
повторный PNG decode без окна Cute Screen. Результаты — TESTING.md.

## Окно настроек и notification init script (2026-10-18)

`REQ-UI-*`: init script tauri-plugin-notification вызывает
`is_permission_granted` в каждом webview на macOS/Linux; capability `settings`
получает только это read-only разрешение. Boundary test требует его для main,
quick-capture и settings и запрещает settings notify/request. Native evidence:
`tauri-history-settings` вызывает команду внутри окна settings.

## Два режима карандаша и краткие подсказки (до реализации, 2026-10-18)

`REQ-TOL-003/004/010`, `REQ-EDT-002/006/015/016`, `REQ-UI-006`:
доступны только точное перо и автокоррекция. Сохранённый default экспрессивной
кисти заменяется автокоррекцией; её старые штрихи при открытии editable session
преобразуются одной undoable command, включая hidden/locked. Samples, spans,
appearance и transforms сохраняются; localBounds пересчитываются общей геометрией.
Read-only документы не мигрируют. Tooltip RU/EN больше не объясняют Shift/45°;
модификаторы и числовые поля угла продолжают работать. План доказательств:
red-first core/preferences, mounted session/save/undo, renderer decode,
production browser и Windows WebView2 Quick → Editor → reopen.

Статус: implemented (ADR-094). Финальные migration/preferences/session — 33/33,
renderer — 3/3; browser drawing и Shift matrix passed, follow-up preferences/
RU/EN tooltip — 3/3 passed. Свежая native сборка блокируется сторонним TS2883 в
ShapeGradientEditor.vue; runtime evidence pending. Команды и ограничения — TESTING.md.

## Выноска: линия, подпись и адресное удаление ступени (до реализации, ADR-090)

`REQ-TOL-007`, `REQ-TOL-005`, `REQ-EDT-002/005/006/016/017`, `REQ-UI-006/007`:
пустой commit сохраняет connector без оформления подписи; две категории маршрута
«Линия»/«Ступенчатая», bend handle, auto и четыре явные стороны, направленный акцент.
Alt-click внутренней ручки удаляет указанную ступень с preview и одним undo;
Escape/lost capture/release Alt/drag отменяют удаление. Контур и поле ширины относятся
только к тексту. Наконечники — SVG, размер/цвет видимы без disclosure.
Red-first core: empty/bounds/hits, quadratic/rebase/codec, auto/accent, indexed removal.
Vue/browser/real WebView2: production creation, width, modifier cancellation, history,
Quick non-origin crop, Editor handoff/reopen. Decoded Canvas2D/CanvasKit export.
Старые v7 routes/explicit attachment сохраняются. Результаты и ограничения — TESTING.md.
Фактические доказательства: 76 focused core/Vue, 46 render, 4 browser specs / 5 tests,
2 real WebView2 scenarios с trusted input и отдельным process reopen — passed.
Общие check/unit ограничения и платформы без прогона зафиксированы в TESTING.md.

## Расширенные диапазоны изображения (2026-10-18, до реализации)

`REQ-TOL-015`, `REQ-EDT-005/006`, `REQ-UI-006/007`: убрать UI-предел
скругления 128 px; максимум равен половине короткой стороны изображения
в локальных координатах. Квадрат достигает круга, прямоугольник — капсулы.
Толщина рамки доступна от 0 до 32 px. Проверить 4K square/landscape,
максимумы слайдеров, preview без записи, один commit и точные undo/redo.
Формат v7 и геометрия rounded rectangle сохраняются; эллиптическая маска
этим изменением не добавляется. Результаты — TESTING.md.

## Управляемые выноски (REQ-TOL-007, до реализации, ADR-087)

Red-first core: маршруты/ступени, закреплённая сторона, world endpoints,
codec/clipboard legacy/new v7, markers/frame bounds и перенос стиля без точек.
Vue/production browser/native: drag → inline → commit → перенос подписи с
неподвижной целью → ручной маршрут → оформление → undo/redo → reload.
Renderer: decoded PNG Canvas2D/CanvasKit, все оболочки/наконечники и mixed text.
RU/EN, light/dark, 1024 px, zoom 50/100/200%, Quick non-origin crop;
cancel, focus, locked/read-only/mixed. Результаты записываются в TESTING.md;
human usability и WebKit остаются отдельными доказательствами.

Итог Windows x64: full unit 1201/1201, render 41/41, дополнительные mounted
context/menu 33/33; browser 4+1 cases и native Quick/handoff/reopen 2/2 passed.
Старые payload round-trip без миграции, новые геометрия/defaults восстановлены
после отдельного native launch. Логи и ограничения общего check — TESTING.md.

## Открытие хранения из истории (2026-10-17, до реализации)

`REQ-LIB-002/012`, `REQ-UI-006/008`: «Хранение» открывает singleton Settings
на разделе истории без блокировки native event loop. Окно показывает controls,
закрывается и открывается повторно; существующее окно переключается на историю.
Rust regression фиксирует async IPC boundary; отдельный `history-settings`
real-WebView сценарий проверяет production mount и реальные кнопки.
Фактические команды и результаты — TESTING.md.

Результат: Rust red E0277 → green 1/1, Vue 26/26,
Windows WebView2 `history-settings` 1/1 passed. Подтверждены controls/report,
singleton, переход General → History, два закрытия, повторное создание,
Escape/focus main. Общие check/format имеют сторонние failures; TESTING.md.

## Настройки изображения и непрерывный preview (2026-10-17, до реализации)

`REQ-TOL-015`, `REQ-EDT-005/006/016`, `REQ-UI-006/007`: selection image
использует компактные кнопки скругления, рамки и непрозрачности с текущими
значениями. Один popover объединяет толщину и цвет рамки; NumericControl
сохраняет display-only draft, cancel и один command на commit. Locked/read-only,
mixed, keyboard/focus и RU/EN проверяются отдельно. Toolbar и popover защищают
изображение и handles через общий preview-placement.

Изображение остаётся в ordered scene на pointerdown и протяжении move/resize/rotate,
включая разблокированный base layer. Preview не меняет порядок слоёв, immutable
resources или историю. Доказательства: Vue regressions, decoded render/export,
production browser и Windows WebView2 с 4K import, промежуточными пикселями жеста,
cancel и undo/redo; perf gates. Фактические результаты — TESTING.md.

## Удобный захват и перемещение (2026-10-17, до реализации)

`REQ-EDT-019`, `REQ-EDT-004/005/006/016`, `REQ-TOL-001/002`: первичный выбор использует
геометрию с допуском 6 CSS px, только показанное выделение допускает перенос
за пустую область рамки. Видимые handles, точная геометрия, рамка и допуск
имеют общий порядок разрешения. Перенос начинается после 4 CSS px; маленькое
выделение получает ручку переноса в своей панели. Политики покрывают LayerKind,
hover и pointerdown используют общий resolver. Schema/IPC не меняются.
Доказательства: red-first core, mounted Vue, browser и real-WebView production
creation → selection → move/handle/cancel/undo. Итог: core/Vue 61/61,
render 35/35, Chrome matrix 12/12, external WebView2 Quick → Editor 1/1 passed.
Общие unit/check/format gates имеют отдельные failures; TESTING.md содержит
точные команды, логи и pending native/platform matrix.

## Дроп настроек редактора (2026-10-17, до реализации)

`REQ-UI-001/002/003/004/006/007`: убрать кнопку Window capture из верхней
панели, заменить overflow шестерёнкой «Настройки». Немодальный дроп содержит
сохраняемые тему/язык, существующие undoable отражения и вход в singleton
Settings через существующий native adapter. Переключатели оставляют дроп
открытым; Escape возвращает фокус, outside click закрывает. Native opening
различает pending/error/success, без callback пункт disabled с объяснением.
Проверки: mounted Vue, browser RU/EN × light/dark × 1024/1600, undo отражения,
trusted keyboard и real Windows WebView2 singleton. Результаты и ограничения
будут записаны в TESTING.md; остальные capture entrypoints сохраняются.

Уточнение до исправления обнаруженных browser regressions: Escape открытого
dialog имеет приоритет перед фоновым import error, включая focus на trigger.
На 1024 px quiet-кнопки скрывают только подписи, сохраняя видимые SVG-иконки.

Уточнение перед native fix: первый real-WebView вызов воспроизвёл Windows
deadlock при синхронном `open_activation_settings`. Команда должна создавать
Settings из async IPC task; проверка остаётся реальным `editor-settings`,
включая повторную активацию singleton и открытие после закрытия.

Статус: implemented. Windows: полный TS/Vue suite 1128/1128; финальная
settings/import regression 16/16, browser settings/crop 10/10, SVG matrix 1/1,
native WebView2 1/1 passed. Проверены async Settings open/singleton/reopen.
Команды, shared-tree gate limitations и платформенные границы — TESTING.md.

## Холодный Windows capture и возврат редактора (2026-10-17, до реализации)

`REQ-CAP-010/013`, `REQ-ACT-006`: первый Area после запуска должен показывать
только уже стабилизированный полноэкранный frozen frame. Native hide обязан
сохранять согласованное состояние видимости Tauri; Editor одним кликом и tray/CLI
Show после захвата снова показывают main. Доказательства: red-first callback
contract Windows hide, Vue selection-layout gate и physical capture в настоящем
WebView2 с записью первых кадров и видимости обоих окон. Проверить cancel/retry.

## Вставка изображений (2026-10-17, до реализации)

`REQ-TOL-015/016`, `REQ-EDT-002/003`, `REQ-UI-006/014`: G, bitmap paste и
native drop одного файла используют decode-before-command, fit в 80% видимой
области без upscale, Select после успеха и один Undo. Отмена/ошибка не меняют
документ; поздний результат не попадает в другую session. Empty drop создаёт
документ. Native drop использует window-bound одноразовый token, не frontend path.
Проверки: реальная serde camelCase-сериализация, core placement, Vue lifecycle,
browser zoom/crop и real-WebView import/decode/paste/drop/reopen/export.
Результаты и ограничения платформ фиксируются в TESTING.md после запуска.

Итог Windows 10 x64: реализовано; core 4/4, полный TS/Vue suite 1111/1111,
render 33/33, boundaries 43/43, browser 3/3 и native WebView2 3/3 passed.
Native проверяет Quick → Editor, системный bitmap clipboard, persisted reopen
шести image layers и создание документа через empty drop. Системный picker
selection и событие OS drop заданы test-only adapter; физические жесты и
Linux/Wayland/macOS остаются pending. Подробности и логи — TESTING.md, ADR-081.

## Таймер итога действия (2026-10-17)

`REQ-UI-014`: запись до реализации. Тост успеха и отмены (`Image opened`,
захват, копирование, отмена) скрывается через 3 секунды. Ошибка остаётся до
повтора, нового действия или Escape. Предыдущий таймер отменяется при новом
запуске и при ручном закрытии. Платформенная матрица не меняется: таймер живёт
в shell feedback, не в native dialog.
Статус: implemented. Vue store и mounted shell passed на Windows 10 x64.
Команда и граница evidence — TESTING.md. Нативный диалог открытия файла в
запущенном desktop-окне этим прогоном не повторялся.

## Публичный лендинг (2026-10-17)

Уточнение `REQ-WEB-001`: главный заголовок и title страницы — «Объясняйте
наглядно.»; английский вариант — «Explain it visually.». Подзаголовок сохранён.

Уточнение `REQ-WEB-003`: убрать подпись «Одна картинка. И всё понятно.» и её
английский эквивалент под hero-снимком. Подсказку прокрутки оставить только
там, где снимок действительно прокручивается. Проверка — поиск строк в обеих
локалях и format check.

Уточнение `REQ-WEB-003` до мобильной адаптации: по запросу пользователя
hero-изображение целиком скрыто при viewport до 760 px включительно. Настоящий
ToolRail и описания инструментов остаются доступны. Проверка: 375 px без hero,
768/1024/1440 px с загруженным снимком, без горизонтального overflow страницы.

Уточнение `REQ-WEB-003` до замены демонстрации: использовать предоставленный
пользователем снимок вымышленной тёмной админки с нанесёнными в Cute Screen
аннотациями как единый растровый hero-ресурс. Удалить прежний HTML/CSS-макет
сайта и нарисованные кодом аннотации; локальный прототип админки оставить в
игнорируемом каталоге. Проверка: обе локали и ширины 375/768/1024/1440 px,
загрузка снимка под `/cute-screen/`, отсутствие общего горизонтального скролла
и просмотр результата в браузере. Текст самого снимка остаётся русским в обеих
версиях; переводятся подпись и альтернативное описание изображения.

Уточнение содержания `REQ-WEB-001/004`: удалить RU/EN блок о фоне, отступах,
скруглениях и тенях, поскольку оформление ещё не реализовано. Рядом с GitHub
оставить только подпись об открытом коде, без фразы об аккаунте. Проверка —
поиск текста в обеих локалях, статичная сборка и форматирование.

Уточнение до переработки: `REQ-WEB-001/003/004` — единственный бренд в верхней
части страницы, адаптивная демонстрация с привязанными к содержимому аннотациями,
новый снимок ToolRail с обрезанными углами и описания всех 16 инструментов с
SVG из существующего UiIcon. SVG экспортируются при разработке без Vue в
публичной сборке. Проверка: обе локали на точных viewport 375/768/1024/1440 px,
полная видимость демо без горизонтальной прокрутки, загрузка каждого SVG,
keyboard navigation и просмотр полных screenshots production preview.

Переработка реализована: все восемь RU/EN × viewport combinations и три browser
сценария прошли на Windows / Chrome 155. Результаты и пределы — TESTING.md.

| Требование  | Контракт и доказательство                                                               | Статус                              |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| REQ-WEB-001 | RU/EN статичные страницы, существующий знак и изолированная web-сборка                  | implemented; evidence in TESTING.md |
| REQ-WEB-002 | GitHub Pages под `/cute-screen/`; keyboard links, language links, anchor и local assets | implemented; evidence in TESTING.md |
| REQ-WEB-003 | Снимок вымышленной админки с аннотациями пользователя, адаптивный hero и ToolRail       | implemented; evidence in TESTING.md |
| REQ-WEB-004 | 16 описаний с SVG UiIcon, единственный бренд вверху, обрезка углов снимка панели        | implemented; evidence in TESTING.md |

## Исправление Rust dependency audit (2026-10-17)

`REQ-QLT-005`, `REQ-REL-005`, ADR-016: запись до изменения зависимостей.
CI блокируется advisories RUSTSEC-2026-0367/0368/0369 для `zip 6.0.0`.
План: обновить используемый storage crate до точной исправленной версии
`zip 9.0.4`, удалить неиспользуемую прямую desktop-зависимость, обновить
Cargo.lock и проверить полный `cargo deny check` без advisory exceptions.
Recovery bundle продолжает читать именованные entries и проверять checksum,
не вызывает `ZipArchive::extract`. Контракты документа и originals не меняются.
Для local path dependency storage требуется явная версия workspace: иначе
`bans.wildcards = "deny"` считает отсутствующую версию wildcard. Проверить
исправление точной версией, сохранив строгую policy без исключений.
Доказательства: workspace Rust tests (160 passed, 1 ignored, включая recovery
round-trip), storage Clippy, formatting и полный dependency audit passed на
Windows 10 x64. Команды, advisory DB commit и логи — TESTING.md. Hosted CI
и остальные платформы этим локальным прогоном не подтверждаются.

## Удаление повторных CI-проверок (2026-10-17)

`REQ-REL-001/002/003`, ADR-014/020: запись до изменения workflow.
Linux x64 проверяется в `quality-linux` через `pnpm check` (сборка frontend,
Rust format и все Clippy-конфигурации) и Rust tests. Отдельный compile job для
того же target удаляется; Linux ARM64, Windows x64/ARM64 и macOS Intel/ARM64
сохраняются. Unit/property/component suites выполняются один раз через
`pnpm test:coverage`, использующий те же Vitest projects, что и `pnpm test`.
Renderer, performance, browser/native E2E, audits и release-boundary остаются.
Проверка: YAML parsing и сопоставление package scripts, `pnpm format`,
`pnpm format:check`, `pnpm docs:check` и `pnpm test:boundaries` (43/43) passed;
команды, платформа и логи — TESTING.md. Hosted matrix требует GitHub Actions.
Это изменение организации CI, а не evidence готовности release artifacts.

## Пропорции указателя лупы (2026-10-17, ADR-079)

`REQ-TOL-011`: запись до реализации. Общая производная геометрия задаёт толщину
линии по рамке (65%, 3–8 px) и увеличенный наконечник по размеру линзы/линии
(5% / четыре толщины, 16–32 px, не больше половины линзы). При border=0
указатель сохраняется. Schema v7 и IPC не меняются. План доказательств:
geometry regressions размеров 16/64/256/512/2048; повторно декодированные
Canvas2D/CanvasKit PNG для circle/rectangle, размеров 64/512 и рамок 0/3/8/64,
export 1×/2×; visual matrix 256/512 × light/dark × 50%/100%;
browser и production Tauri Quick → Editor, preview cancel, undo/redo и screenshots.
Статус: implemented; geometry/decoded PNG, visual matrix и browser passed.
Native дважды остановился до создания лупы в Quick и остаётся pending.
Результаты и ограничения фиксируются в TESTING.md.

## Однозначное выделение пресетов (2026-10-17)

`REQ-EDT-015/016`, `REQ-UI-006/007`: запись до реализации. При открытии
настроек линейки, карандаша, подсветки, выделителя, лупы и палитры фокус
переходит на выбранную доступную кнопку, затем на поле ввода либо первую
доступную кнопку. CSS selector list не задаёт приоритет выбора элемента.
Текущие 4 px / 24 px не должны сопровождаться подсветкой первого пресета;
custom/mixed значения не выбирают пресет. Проверки: mounted Vue focus,
browser pointer/keyboard, RU/EN × light/dark, screenshots при 1024 px.
Статус: implemented; 11 focus regressions и browser pointer/keyboard прошли.
Результаты, PNG и ограничения общего gate — TESTING.md.

## Понятные настройки линейки (2026-10-17, ADR-076)

`REQ-TOL-010`, `REQ-EDT-006/015/016/017`, `REQ-UI-006`: запись до реализации.
Однострочная панель различает толщину, размер подписи и измерение пиктограммами;
единицы и база процентов находятся в меню измерения и видны при закрытом меню.
Базы: ширина, высота, диагональ crop либо canvas. Подпись на линии остаётся короткой.
Единицы/база меняются атомарной командой; crop пересчитывает measurement и badge bounds
включая locked/hidden rulers. План доказательств: red-first core/codec/history, Vue,
decoded renderer, browser RU/EN × light/dark при 1024 px и production Tauri Quick → Editor.
Статус: implemented; core/Vue, decoded renderer, browser и production Tauri
с restart passed. Команды, screenshots и ограничения shared check — TESTING.md.

## Shift для линейки (2026-10-17)

`REQ-TOL-010`, `REQ-EDT-005/006`: запись до реализации. Shift ограничивает
направление линейки шагом 45° при создании и изменении endpoints; Alt сохраняет
настраиваемый шаг. Shift имеет приоритет. Key-only transitions пересчитывают
preview из raw pointer, отпускная точка учитывается. Проверки: Vue input,
browser DPR 1/2, production Quick → Editor в Tauri, undo/redo и cancel.
Дополнение до исправления: native undo/redo к уже сохранённому состоянию
оставлял ложный dirty badge. Red-first DocumentSession regression воспроизвёл
ошибку; статус redo теперь берётся из `CommandManager.dirty`, как у undo.
Native повтор со снятым save badge passed.
Статус: implemented; Vue, browser DPR 1/2 × Fit/1:1 и настоящий
Linux Tauri Quick → Editor passed. Команды, PNG и ограничения — TESTING.md,
`artifacts/ruler-shift/`.

## Меню других действий (2026-10-17)

`REQ-UI-001/002/003/004/006`: запись добавлена до реализации. Ширина меню
TopBar учитывает локализованные подписи и ограничена viewport; пункты не
выходят за поверхность меню. Единственная подсказка триггера скрывается при
открытии меню. Проверки: browser geometry и screenshots RU/EN, light/dark,
1024 px и desktop, выбор темы/языка и disabled canvas actions.
Статус: implemented; 4/4 focused browser scenarios (8 locale/theme/size
combinations) и 11/11 component tests passed. Фактические команды и отдельные
ошибки общего прогона — TESTING.md. Native WebView re-smoke pending.

## Прямые участки штрихов через Shift (2026-10-17)

`REQ-TOL-003/004`, `REQ-EDT-006/016`: запись добавлена до реализации.
Shift начинает прямой участок с шагом 45° от конца текущей траектории;
отпускание сохраняет участок и продолжает свободный штрих без скачка.
Контракт общий для marker и трёх pencil brushes, Editor и Quick Capture.
Планируемые доказательства: red-first core/codec/geometry/history tests,
Vue input/cancel, production browser и real-WebView, decoded renderer, 4K/8K perf.
`REQ-CAP-012`: Escape активного штриха потребляется capture listener canvas-controller до window Close Quick Capture;
regression воспроизводит ранний parent listener (`escape-red.log`).
Статус: implemented. Core/Vue suite — 115 файлов / 913 проверок; renderer —
32 проверки, включая decoded 4K/8K exports; perf — 6 проверок. Production
browser matrix DPR 1/2 × Fit/1:1 и RU/EN tooltip, native Quick → Editor и
reopen проверены. Фактические команды и границы evidence — TESTING.md.

## Форма фонаря кнопками-иконками (2026-10-17)

`REQ-TOL-009`, `REQ-EDT-015/016`, `REQ-UI-006`: запись добавлена до реализации.
В defaults и панели выбранной области три прямые кнопки формы заменяют меню:
rectangle/ellipse/diamond, с локализованными именами/подсказками, pressed,
disabled и keyboard focus. Изменение выбранной области остаётся одной
undoable command; отсутствующий shape control не показывает группу.
Проверки: mounted toolbar/history, browser RU/EN × light/dark и Quick/Editor
через real Tauri. Фактические результаты — TESTING.md.

## Чёткие края фонаря по умолчанию (2026-10-17)

`REQ-TOL-009`, `REQ-EDT-015`: запись добавлена до реализации. Новый workspace
использует «Чётко» (`feather: null`) для фонаря в editor и Quick Capture.
Явный выбор мягкости и стили существующих объектов сохраняются. Проверка:
browser/native spotlight-preview создаёт слой pointer-жестом и проверяет
`feather: null` и выбранное «Sharp» в панели; результаты — TESTING.md.

## Горячие клавиши и запуск при входе (2026-10-17)

| Требование              | Вертикальный срез                                                           | Доказательство                                                                                         |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| REQ-ACT-001/002/009/011 | Rust shortcut service, отдельное окно, recorder, восстановление             | Rust transaction tests, Vue/browser и real Tauri X11 key/relaunch/capture; остальные платформы pending |
| REQ-ACT-003/004/010     | Portal configure/list/changed, GNOME owned custom-keybindings, CLI fallback | Rust GNOME ownership/cancel tests, portal runtime matrix                                               |
| REQ-ACT-005/006/008     | Tray/menu/CLI settings и общий dispatch                                     | CLI parser tests, singleton window и real-WebView route                                                |
| REQ-ACT-007/012         | NSIS choice, first-run choice, platform autostart state                     | Rust path/registration tests; реальный logout/login отдельно на каждой ОС                              |

План реализации и источники: [исследование](HOTKEYS_RESEARCH.md). Поддержка не выводится из наличия кода или компиляции.

## Физические буквенные shortcuts редактора (2026-10-16, ADR-064)

`REQ-EDT-003/005/006/016`: запись добавлена до реализации. Все существующие
буквенные команды используют `KeyboardEvent.code` для физической позиции
клавиши, чтобы Ctrl/Cmd+Я на русской раскладке соответствовал Ctrl/Cmd+Z.
`key` сохраняется только как fallback при отсутствующем либо `Unidentified`
`code`. IME composition, editable targets и уже обработанные события не
запускают редакторские команды. Проверки: helper, mounted keyboard controller,
browser native input и real Tauri; фактическая платформа и ограничения —
`TESTING.md`.

## Ограничение параллельных Vitest workers (2026-10-16)

`REQ-REL-001/002/003/005`: запись добавлена до изменения конфигурации.
Unit/coverage/renderer/perf gates используют общий предел в два workers,
чтобы jsdom, native Canvas2D и CanvasKit не запускались по числу CPU без учёта
памяти. Изоляция файлов и обработка unhandled errors сохраняются; timeout
тестов не увеличивается. Проверки — стабильные `pnpm test`,
`pnpm test:coverage`, `pnpm test:render`, `pnpm test:perf`,
`pnpm test:boundaries`; результаты и ограничения — TESTING.md.

## Жизненный цикл инструментов и панелей (2026-10-16, ADR-063)

`REQ-EDT-002/003/008/015/016/018`, `REQ-UI-003/006/007`: запись добавлена до
реализации. Пустой canvas/background снимает выделение; создание очищает прежний
выбор; defaults доступны только по ПКМ/Shift+F10/ContextMenu. Один переход
синхронизирует tool, selection, sampling и принадлежащие поверхности, включая
teleport. Escape закрывает ближайший уровень; внешний клик сохраняет назначение
и фокус. Inline commit предшествует выбору/переключению с учётом IME и fonts.
Crop сохраняет Apply/Cancel; общие flip commands переносятся в More actions.
Проверки: mounted-shell regressions, browser native input, production Tauri
Capture → Quick → Editor. Реализовано; browser 20/20 и полный `pnpm check`
прошли. Native external + X11 system context input прошёл 2/2;
фактические команды и результаты — TESTING.md.

Диагностика native E2E была добавлена до исправления конфигурации. Сценарий
использует external provider: embedded 1.3.0 не генерирует contextmenu/PointerEvent
и теряет Shift у F10. На Linux/X11 ПКМ отправляется системным xdotool, поскольку
WebKitGTK automation 2.52.6 превращает отпускание ПКМ в левый click. Production
Capture → Quick → Editor проверяет trusted keyboard/contextmenu/pointer input,
готовность кнопок и фокус после handoff; диагностика событий сохраняется в JSON.

## Text sizing and wrapping follow-up (2026-10-16, ADR-062)

REQ-TOL-005 / REQ-EDT-005: this entry was added before implementation.
Implemented compact point-text input growing up to 480 document px, emergency
grapheme wrapping, real-font bounds on commit/style/clipboard paste/width resize,
soft wraps preserving source text and range, and a background popup without
horizontal overflow. Inline toolbar uses viewport bounds; returning focus cancels
stale blur commits. Red-first core/renderer/focus/font-loading regressions,
component tests, decoded PNG and browser undo/reopen/large-canvas flows are
recorded in TESTING.md. Schema v7 and one-command editing/resize semantics stay.
Real Tauri embedded driver mounted toolbar but could not create the editor;
Windows/macOS/Wayland are not newly verified.

## Live preview фона текста и встроенная палитра (2026-10-16)

`REQ-TOL-005`, `REQ-EDT-008`, `REQ-UI-001/003/006/007`: запись добавлена до
исправления. Выбор готового или пользовательского цвета обновляет тот же
transient background draft, что и padding/radius, и сразу проецируется на inline
text без document command или изменения defaults. Apply подтверждает общий
draft; Cancel/Escape/outside возвращают baseline. Embedded расширенная палитра
ограничена шириной text background dialog: её tiles, HEX, пипетка, recent и
suggestions не выходят за границы панели. Проверки: mounted editor, browser и
production Tauri при 1024 px, RU/EN, focus/Escape и один undoable commit;
фактические команды и артефакты будут записаны в TESTING.md.

## Панель текста и встроенные шрифты (2026-10-16)

`REQ-TOL-005/006/007`, `REQ-EDT-005/008/016`, `REQ-UI-001/005/006/007`:
общая панель Text/Callout/Numbered Marker показывает все функции, переносит
целые группы и сохраняет inline selection. Общая палитра, семантические иконки,
три кнопки выравнивания и 12 локальных гарнитур с образцами заменяют native controls.
Предпросмотр только в меню; выбор применяется явно. Загрузка faces предшествует
рендеру; фон сохраняет Apply/Cancel и ограничения контейнера.
Проверки: component mixed/disabled/focus/loading/error, browser responsive/selection/history,
реальные font assets и decoded PNG; фактический статус — TESTING.md.

## Подтверждение кропа и панель (2026-10-16)

`REQ-TOL-013`, `REQ-EDT-005/006`, `REQ-UI-005`: Apply/Enter подтверждают
одну undoable обрезку и переходят в Select; cropped preview виден сразу без
дополнительного Cancel/Select. Cancel/Escape отбрасывают только текущий draft,
Reset восстанавливает полную рамку до подтверждения. Панель кропа выравнивает
controls по центру, использует одинаковую высоту 32 px и выделяет Apply;
RU/EN и обе темы остаются доступны при 1024×700.
Проверки: failing-first Vue regression, browser видимый viewport/overlay и
production Capture → Quick → Editor в Tauri — 1/1; Chrome — 5 specs / 7 scenarios,
unit — 750/750 и `pnpm check` — passed. Фактические команды и ограничения — TESTING.md.

## Линейка внутри холста (2026-10-16)

`REQ-TOL-010`, `REQ-EDT-005/006`: при создании и редактировании world-space
endpoints линейки ограничены видимым canvas (crop при его наличии).
Перемещение, включая keyboard и группу, сохраняет длину и взаимное положение;
endpoint drag сохраняет неподвижный конец, Alt — угол привязки до края.
Кроп автоматически сдвигает линейки внутрь, а слишком длинные сокращает
с сохранением направления; locked/hidden линейки также подгоняются как часть
изменения canvas. Кроп и геометрия отменяются одним шагом. Подгонка/move удерживают badge
внутри, если он помещается, сохраняя доступность edge-to-edge измерения.
Preview совпадает с commit, Escape не меняет документ, undo/redo точны.
Проверки: red-first core geometry, mounted shell, 1000 property cases,
Chrome 1280/1024 — 2/2 и real-WebView production Capture → Editor — 1/1;
unit 750/750, render 20/20 и `pnpm check` — passed.
Фактические результаты и платформенные ограничения — TESTING.md.

## Security audit зависимостей Vue (2026-10-16)

`REQ-REL-001/002/003/005`: production dependency graph должен проходить
`pnpm audit:security` без high/critical advisories. Для GHSA-g2v6-rqmx-r4w6
Vue и compiler-sfc обновляются согласованно до 3.5.42 во всех workspace manifests;
для GHSA-68fv-2mgg-jv7q lockfile фиксирует source-map-js 1.2.2.
Проверка: frozen-lockfile install, security/license audit, `pnpm check`,
`pnpm test` и renderer goldens — passed на Linux x86_64: unit 733/733,
render 20/20, boundaries 43/43; high/critical отсутствуют. Оставшаяся low KaTeX
и фактические команды/логи — TESTING.md.

## Фонарь: создание и перемещение в Quick/editor (2026-10-16)

`REQ-TOL-009`, `REQ-EDT-005/006`, `REQ-OUT-003`: затемнение и прозрачная
область должны быть видны уже во время создания; при перемещении слоя или
отдельной области маска следует за pointer до отпускания кнопки. Документ
остаётся неизменным до commit, Escape отменяет preview, undo/redo восстанавливают
результат. Проверка: пиксели реального canvas при удерживаемой кнопке,
production fake Capture → Quick → Editor в Linux WebKitGTK и browser regression.
Chrome 154 и Linux WebKitGTK 2.52.6 external native Quick → Editor — passed;
unit 733/733, render 20/20 (включая 4K/8K), boundaries 43/43 и `pnpm check` —
passed. Актуальные source aliases и чистая сборка исключают старые dist modules.
Фактические результаты и ограничения — TESTING.md.
`REQ-REL-001/002`: native regression требует готового window-selector API и
валидного D-Bus profile ID. Тестовый hash-компонент не может начинаться с цифры;
это проверяется Rust regression до изменения E2E profile helper.

## Deployment target прямых Cargo-сборок macOS (2026-10-16)

`REQ-REL-002`, `REQ-CAP-015`: прямые `cargo test`/`cargo check` используют
macOS 12.0 из ADR-038, как и Tauri bundle. `.cargo/config.toml` задаёт
`MACOSX_DEPLOYMENT_TARGET`, чтобы cc-rs не выбирал host target 15.5
и не отклонял legacy CoreGraphics bridge. Boundary regression сверяет baseline
с `bundle.macOS.minimumSystemVersion`. Native Intel/ARM compile и capture
smoke требуют macOS; локальный Linux boundary test их не заменяет.

## Boundary gate из чистого checkout (2026-10-16)

`REQ-REL-001/002/003`: `tauri-driver-cache.test.ts` должен проверять сохранение
завершённой загрузки без предварительного создания `artifacts`. Временный
каталог создаётся в системном temp и удаляется в `finally`. Проверка:
изолированный запуск теста без `artifacts`, затем `pnpm test:boundaries`.
Фактические команды и результаты — TESTING.md.

## Единое числовое поле (2026-10-16)

`REQ-UI-001/002/003/004/006/007`, `REQ-EDT-015/016`: общий NumericControl
показывает значение, единицы и горизонтальные −/+ внутри одной рамки высотой
32 px; кнопки не образуют отдельные выступающие сегменты. Сохраняются точный
ввод, пресеты, slider, preview/cancel, keyboard, focus, mixed/error/disabled
и существующая граница undoable commit. Проверка: production ruler label-size
popover в RU/EN, light/dark и 1024 px; browser и Windows WebView2 evidence,
существующие numeric component tests. Реализовано: unit 8/8, browser 1/1,
production WebView2 Quick → Editor 1/1 и `pnpm check` — passed.
Команды, screenshots и initial failures — TESTING.md; WebKit pending.

## Резкость подписи линейки (2026-10-16)

`REQ-TOL-010`, `REQ-EDT-001`, `REQ-OUT-003`: committed и transient подпись
растеризуются с учётом zoom × DPR, без изменения document geometry/font size
и экспортного масштаба. Regression сравнивает пиксели preview с прямым рендером
в повышенном разрешении; crop, pointer coordinates, sampling и marker preview
сохраняют document space. Большие preview ограничены pixel budget (ADR-058).
Unit 733/733, render 20/20, Chrome DPR 1/2 — 2/2 и production WebView2
Quick → Editor — 1/1 passed. Команды, screenshots и ограничения — TESTING.md.

## Поворот вокруг центра элемента (2026-10-16)

`REQ-EDT-005/006/009/013`: corner gesture и числовой угол в Layers сохраняют
world position центра `localBounds`, включая non-origin bounds, исходный поворот,
image scale и отражения. Preview и commit используют один core helper; отмена
не меняет документ, подтверждение создаёт один undoable updateLayer. Red-first
core и Vue regression пройдены; Chrome 155 и реальный WebView2 155 подтвердили
Shape/Arrow через pointer, числовой ввод и undo/redo; native прошёл production
fake Capture → Quick → Editor. Команды и ограничения — TESTING.md.

## Переключение панели между объектами (2026-10-16)

`REQ-EDT-016`, `REQ-TOL-009/011`: после выбора лупы и последующего выбора
фонаря на canvas панель должна сразу показывать настройки текущего выделения;
изменения применяются только к нему. Повторный выбор, вложенные меню и
числовой draft не должны сохранять настройки предыдущего объекта.
Mounted-shell 2/2 и browser regression пройдены; исходный browser повторил
`spotlight rendering requires an ordered Canvas2D surface`. Исправление
сохраняет ordered precision preview в scene. Полные результаты — TESTING.md.

## Компактные настройки лупы (2026-10-16)

`REQ-TOL-011`, `REQ-EDT-015/016`, `REQ-UI-001/003/004/006/007`:
общая панель лупы в selection, defaults и Quick использует четыре компактных
trigger: увеличение, размер, форма, обводка. Вложенные панели сохраняют zoom,
size, circle/rectangle, цвет/толщину рамки и тень; числовые draft/preview,
Escape, focus return, mixed и locked/read-only используют существующие контракты.
Document, renderer и команды не меняются. Windows x64: unit 709/709,
Chrome 2/2 и WebView2 production Capture → Quick → Editor 1/1 пройдены.
Evidence: `artifacts/loupe-settings/`, фактические команды — TESTING.md.

## Иконка «Показать слои» (2026-10-16)

`REQ-EDT-008/009`, `REQ-UI-001/006`: семантическая иконка `layers` использует
Tabler `stack-2` через общий `UiIcon`. Проверка: существующие SVG-контракты
`ui-icon.test.ts` и взаимодействия `layers-panel.test.ts`.
Windows x64 / PowerShell: `pnpm test --project vue tests/unit/vue/ui-icon.test.ts tests/unit/vue/layers-panel.test.ts`
— 75/75 passed; `pnpm format` и `pnpm format:check` — passed.
Логи: `artifacts/layers-stack-2-{tests,format,format-check}.log`.

## Карандаш, составной фонарь и измерения (2026-10-16)

`REQ-TOL-003/009/010`, `REQ-EDT-002/015/016/017`, `REQ-UI-001/003/004/006/007`:
четыре компактных контрола для каждого инструмента; общий numeric preview adapter.
Перед реализацией core требуются failing tests сглаживания, областей фонаря,
codec и resize. Обязательны объединённая маска без внутренних швов, decoded exports,
отмена и одна undo-команда, production editor/Quick, keyboard и clipboard failure.
Реализовано в core, обоих renderer backend и общей editor/Quick панели.
Core geometry/codec, mounted UI, renderer decoded exports, 4K/8K и dedicated
Chrome/WebView2 flow пройдены; результаты и границы платформенного evidence —
TESTING.md. Отдельный native launch подтверждает сохранённые документ/defaults.
Покрыты все 23 browser specs и 22 native scenarios с успешными изолированными
повторами сбоев общего прогона; эти повторы явно отделены в отчёте.

## Иконка Shape (2026-10-16)

`REQ-UI-001/006`: семантическая иконка `shape` использует Tabler `circle-square`
через общий `UiIcon`. Проверка: существующий SVG-контракт `ui-icon.test.ts`.

## Собственные UI-иконки рядом с Tabler (2026-10-16)

`REQ-EDT-008`, `REQ-UI-001/003/006/007`: единый typed `UiIcon` сохраняет
Tabler и добавляет проектные marker/pencil/eyedropper с различимыми силуэтами.
Доказательство: полный SVG-контракт каталога, import boundary,
dev-preview 16/18/20/24/32 px, raster review при DPR 1/2, RU/EN × light/dark,
keyboard/focus/disabled и production Capture → Quick → Editor в WebView2.
Реализовано: 70 SVG/attrs tests, browser gallery и dedicated WebView2 capture
flow ранней редакции. Финальная native visual проверка pending из-за текущих
build errors параллельного core среза. Проверки и артефакты — TESTING.md;
WebKit evidence pending.

## Активация пипетки без указателя (2026-10-17)

`REQ-TOL-012`: включение пипетки из ToolRail или палитры не создаёт
искусственную точку в центре canvas. Предпросмотр появляется после движения
по canvas либо явного клавиатурного перемещения; выход указателя скрывает его.
Повторная активация не восстанавливает старую точку. Проверки:
`m08-precision-guides.test.ts`, `browser-m08-8.e2e.ts` и
`tauri-m08-eyedropper-clipboard.e2e.ts`; результаты — в `TESTING.md`.

## Размер пипетки в палитре (2026-10-16)

`REQ-EDT-008`, `REQ-UI-001/003/006/007`: кнопка пипетки в HEX-поле
расширенной палитры отображает общий проектный SVG размером 18×18 CSS px,
сохраняя доступное имя, подсказку, disabled и focus состояния. Визуальная
проверка — mounted палитра в RU/EN, light/dark и при масштабе окна 1024 px.

## Числовые параметры и живой draft (2026-10-15)

`REQ-EDT-008/009/015/016/017`, `REQ-TOL-001/002/003/004/005`,
`REQ-UI-003/004/006/007`: числовые параметры используют общий адаптер,
точный ввод, компактные группы пресетов и отменяемый предпросмотр.
Preview не меняет document session, autosave или preferences; подтверждение
создаёт одну команду, мультивыбор — один batch. Inline text сохраняет собственную
границу подтверждения. Масштаб холста исключён из изменений. Реализованы общий
Naive UI adapter, display-only RAF projection, синхронизация точного поля,
слайдера и пресетов, отмена при смене контекста и блокировка read-only.
Component/integration, browser и Windows WebView2 production flow проверены;
4K render test сравнивает декодированные preview/commit/export. Фактические
команды и границы доказательств — TESTING.md, ADR-054.

## Вложенные настройки фигуры после выделения сноски (2026-10-16)

`REQ-EDT-015/016`, `REQ-UI-003/006/007`: выделить сноску обычным canvas input,
открыть defaults фигуры через ПКМ и меню «Наложение». Вложенная панель должна
оставаться рядом с trigger, учитывать актуальную позицию родительской панели
и доступный viewport, сохранять selection и документ. Проверка переключения
меню и повторного открытия — browser и real WebView; evidence — TESTING.md.
Исправление подтверждено isolated Windows WebView2 в Quick/editor: gap 8–14 px,
Escape/focus и документ сохранены. Unit/component — 646/646, boundaries — 40/40;
отдельный native scenario `shape-defaults-placement` — 1/1 passed.

## Компоновка палитры и свой цвет (2026-10-15)

`REQ-EDT-008/015/016`, `REQ-UI-001/003/006/007`: drawing palette содержит два
полных ряда по десять цветов; custom action отделён сбоку. Увеличенный интервал
оставляет свободное место вокруг selection/focus ring. Градиент рисуется только
внутри отдельного круглого swatch, без цветных краёв кнопки и секторного круга.
Проверить selection/defaults/embedded, keyboard, обе темы и закрытие без скачка
через browser и real WebView; результаты — TESTING.md.

## Закрытие палитры без скачка (2026-10-15)

`REQ-EDT-008/015/016`, `REQ-UI-003/006/007`: manually positioned popover
сохраняет последние координаты до конца leave transition. Выбор preset/custom
цвета, Escape и click outside не переносят ещё видимую панель в начало editor.
Browser и real-WebView regression записывают геометрию каждого animation frame
при закрытии; результаты и ограничения — TESTING.md.

## Курсоры crop handles (2026-10-15)

`REQ-TOL-013`, `REQ-UI-005`: восемь crop handles показывают соответствующие
`ns/ew/nwse/nesw-resize` при наведении; внутри crop доступен `move`.
Quick frame показывает resize на handles и move только у перемещаемой границы.
Hover использует тот же hit testing, что начало жеста, с учётом zoom/crop.
Проверка — browser и real-WebView production-flow; результаты — TESTING.md.

## Настройки с кнопки инструмента без дополнительной стрелки (2026-10-15)

`REQ-EDT-015`, `REQ-UI-001/006/007`: ToolRail не добавляет отдельную кнопку
`⌄` при выборе инструмента. Видимый trigger настроек — сама кнопка инструмента:
ПКМ, Shift+F10 и ContextMenu сохраняют defaults popover, Escape и возврат фокуса.
Существующие browser tool-ux и native quick-chrome сценарии проверяют
доступность настроек; screenshots показывают ToolRail без отдельной стрелки.
Фактические результаты фиксируются в TESTING.md.

## Курсор штриховых инструментов (2026-10-15)

Расширение 2026-10-16, `REQ-TOL-006`: нумерованные точки используют тот же
`crosshair` сразу при активации и при движении над холстом/объектами; временный
pan сохраняет `grabbing` с возвратом креста. Общий `highlighter-toolbar.ts`
проверяет выбор, hover и pan также для numbered marker.

`REQ-TOL-003/004`, `REQ-UI-005`: Pencil и Highlighter показывают `crosshair`
сразу при выборе и при наведении на холст, включая существующие объекты и
рисование. Временное панорамирование показывает `grabbing`, затем возвращает
крест; Select и Hand сохраняют свои курсоры. Проверка — общий browser/native
highlighter E2E через production mount-flow; результаты — в TESTING.md.

## Expanded shape palette and unobscured preview (2026-10-15)

`REQ-TOL-002`, `REQ-EDT-008/015/016`, `REQ-UI-001/003/004/006/007`: shared shape catalogue, compact seven-column palette, conditional geometry controls, contour-aware selection, identical preview/export and object-aware overlay placement. New core contracts require red-first codec/geometry/history tests; browser and real-WebView evidence must use production mount and creation flows. Status: implemented; core/component 642/642 and renderer 17/17 passed; Windows real WebView2 4 scenarios / 5 tests passed, including production Capture → Quick → Editor, every palette kind, Arrow focus/history and cylinder persistence across restart. Browser final 2 files / 8 tests passed; commands and artifacts recorded in TESTING.md. Physical capture and Linux/macOS remain separate gates.

## Выделитель и простые палитры (2026-10-15)

Уточнение `REQ-TOL-004`: название normal-эффекта — «Окрасить» / Tint;
подсказка поясняет полупрозрачный цвет поверх изображения и текста.
Существующие toolbar и group-edit tests проверяют новые подписи.

`REQ-TOL-004`, `REQ-EDT-008/015/016/017`: планируемое evidence — red-first
core tests классификации фона, resolver и legacy preferences; Vue tests четырёх
режимов, атомарного group edit и двухуровневой палитры; renderer parity draft /
commit / decoded export; browser и real Tauri production-flow E2E. Анализ всего
original выполняется один раз после первого frame в Worker, не блокирует UI,
не меняет существующие штрихи и не повторяется при zoom/crop/annotation.
Evidence выделителя: 9 core/Vue files / 83 tests, browser UI и 4K/8K Worker E2E,
native Quick/editor (1 test), shape palette (1 test) и arrow regression (2 tests)
прошли на Windows x64. Preview/commit/decoded PNG и обе renderer goldens проверены.
`pnpm check`, полный unit/component suite (644/644), renderer suite (17/17),
Rust и perf прошли. Расширенный browser replay: 5/6 files passed, один failure
нового shape catalogue на `arrowLeft`; полный browser suite зелёным не объявляется.
Фактические команды, артефакты и ограничения перечислены в TESTING.md.

## Выход из пипетки при выборе инструмента (2026-10-15)

`REQ-TOL-012`, `REQ-EDT-003/015/016`: transient sampling из палитры отменяется
при любом явном выборе инструмента, включая повторный выбор текущего, shortcut
и configure через ПКМ. Палитра не меняет документ/defaults при отмене; следующий
canvas gesture создаёт выбранную аннотацию. Mounted shell и native WebView
проверяют palette → eyedropper → tool → draw в editor и Quick. Configure popover
закрывается при старте sampling, сохраняя defaults target. Windows native
final — 7/7 вместе с Quick handoff/chrome; полный unit suite — 578/578,
`pnpm check` — exit 0. Команды и artifacts — TESTING.md.

## Quick → Editor: переход с аннотацией (2026-10-15)

`REQ-CAP-010/012/014`, `REQ-EDT-006/013`: native regression создаёт non-origin
crop и стрелку через обычный input, нажимает Editor один раз, проверяет первый
кадр main и скрытие Quick, размеры materialized canvas, editable arrow и
удаление/Undo/Redo без следа аннотации в immutable base. Источником редактора
должен быть чистый crop frozen image; rendered annotation PNG предназначен для
Copy/Save, не для замены base при сохранении редактируемых слоёв. Native
regression до исправления воспроизвёл оставшуюся ink после Delete. После исправления
Windows WebView2: handoff 1/1, один клик 228 ms, crop 320×240 из (80,60),
Delete/Undo/Redo проходит. Артефакты — `artifacts/quick-editor-handoff/`.

## Компактная панель фигур (2026-10-15)

`REQ-TOL-002`, `REQ-EDT-015/016/017`, `REQ-UI-003/004/006/007`: четыре контрола
формы, заливки, обводки и наложения в selection/defaults/Quick; независимые
цвета, контекстные параметры, mixed/locked, одна undoable command на commit,
отмена draft и keyboard focus. `shape-context-toolbar.test.ts` и mounted-shell
`tool-ux.test.ts` проверяют значения документа, историю и prefs; focused
Vue/boundary gate — 72/72. Полный `pnpm test` — 574/574, render goldens — 13/13.
Chrome 155 / Windows: три spec-файла, 12 tests, RU/EN × light/dark, 1024/1280 px.
Real WebView2 155.0.4283.45: `shape-toolbar`, 1/1, production fake capture → Quick
shape gesture → HEX/opacity/blend/undo/redo → Editor → native ПКМ defaults.
Артефакты и команды — в TESTING.md. Document v7, binary resources и ADR-048
сохраняются; Linux/macOS и physical capture этим evidence не подтверждаются.

## Чёткое выделение и компактные меню стрелок (2026-10-15)

Дополнительная geometry-проверка `REQ-EDT-008/016`: сравнить верхний и нижний
inset controls относительно самой панели, а не только центры кнопок друг с
другом. Разделитель у цвета прямой, без border radius, не выше swatch и
вертикально центрирован. Проверить normal/hover/focus/disabled и nested menu.

`REQ-CAP-012/013`, `REQ-EDT-016`: в Quick Capture selection toolbar использует
полный frozen frame, без повторного вычитания crop; editor использует cropped
output. Геометрия привязана к фактическому CSS-размеру canvas. Regression:
создать crop не в origin, затем стрелку через настоящий pointer input, проверить
панель над bounds стрелки и доступность controls внутри viewport.
Рамка Quick Capture не должна прерывать отрисовку selection frame/handles
выбранной аннотации; пиксельный regression сначала воспроизводит их отсутствие.

`REQ-EDT-005/008/015/016`, `REQ-TOL-001`: экранный overlay редактора и Quick
Capture рисуется в CSS pixels × DPR; толщина рамки, пунктир и handles сохраняют
экранный размер при zoom. Corner rotation использует Tabler `rotate-clockwise`
с контрастной обводкой. Панель стрелки имеет одинаковую высоту controls и
chevrons; меню наконечников и геометрии показывает миниатюры, доступные через
RU/EN labels, selected/disabled/focus и Escape. Настройки применяются прежними
undoable commands. Проверки: pixel overlay regression, mounted Vue toolbar,
browser и real WebView; результаты будут записаны в TESTING.md.

## Windows: исключение следа редактора при захвате (2026-10-15)

`REQ-CAP-001/002/010/013`: перед native capture Windows должен завершить
скрытие main на оконном потоке без DWM hide-animation и дождаться compositor
barrier. Rust regression проверяет отказ для invalid HWND; real-WebView
сценарий `windows-capture-exclusion` проверяет decoded frozen pixels поверх
контрольного рабочего стола, отмену и повторный захват. До реализации и
runtime replay: Windows 10 x64 / WebView2 155.0.4283.45 — три capture/cancel/retry,
27/27 decoded pixels совпали с контрольным desktop; screenshots просмотрены.
Статус repair — implemented; mixed-DPI и другие платформы остаются pending.

Этот physical replay также требует `REQ-CAP-012/014`: Escape в начальной фазе
selecting закрывает draft даже при перехвате клавиши вложенным canvas handler.
Regression — mounted Quick Capture с consuming child и native Escape/retry.
`REQ-QLT-003`: single-instance identity test-harness также изолируется по
абсолютному E2E profile, чтобы WDIO/CLI не подключались к resident developer app.

Для `REQ-EDT-008` инструмент Marker использует Tabler `brush` через общий
`UiIcon` в editor и Quick Capture; SVG проверяется в `ui-icon.test.ts`.

Для `REQ-EDT-008` инструмент Callout использует собственную карточку с подписью,
ступенчатой связью и точкой цели через общий `UiIcon` в editor и Quick Capture;
native SVG assertion в `tests/e2e/quick-capture.ts` проверяет `cs-icon-callout`.

Для `REQ-EDT-008` инструмент Select использует Tabler `pointer-2` через общий
`UiIcon` в editor и Quick Capture. Проверка — существующий runtime SVG assertion
в `quick-context-toolbar.test.ts`; команды и результаты фиксируются в `TESTING.md`.

## Согласованный UX инструментов и стилей (ADR-048)

| Требования      | Проверки                                                                                           | Статус      |
| --------------- | -------------------------------------------------------------------------------------------------- | ----------- |
| REQ-EDT-002/003 | styles.test.ts, tool-ux.test.ts, browser-tool-ux.e2e.ts: creation/cancel, physical shortcuts       | implemented |
| REQ-EDT-015     | tool-ux.test.ts, tauri-quick-chrome.e2e.ts: defaults, menu, nested focus/Escape, trusted input     | implemented |
| REQ-EDT-016     | styles.test.ts: compatible/mixed/batch/history; tool-ux.test.ts; render decode; RU/EN screenshots  | implemented |
| REQ-EDT-017     | tool-preferences.test.ts: legacy; tool-ux.test.ts: memory; browser reload; native persistence pair | implemented |

Диагностика real-WebView (2026-10-15): устранить startup отказ EdgeDriver,
сохранить backend tracing в test-harness и подтвердить native-input сценарий
`quick-chrome` через production mount-flow. Выполнено на Windows x64:
15 scenarios / 18 tests, включая 4/4 trusted-input Quick tests; результаты — в TESTING.md;
сборка и Chrome browser mode не заменяют native runtime evidence.

Статусы: `planned`, `implemented`, `verified`, `blocked`. `implemented` означает
наличие реализации и применимые automated/local-runtime evidence текущей системы;
`verified` — подтверждённое пользовательское поведение в полной финальной
platform/release matrix.

Evidence заполняется фактической ссылкой на test ID, CI run, screenshot/log или
system smoke record. Во время разработки отсутствующее evidence других ОС
помечается как отложенное; оно не блокирует следующий milestone, но placeholder
не позволяет получить `verified` или статус platform `supported`.

Foundation harness не создаёт отдельного продуктового требования. Его локальные и CI-доказательства определены в [стратегии тестирования](TESTING.md) и [CI workflow](../.github/workflows/ci.yml); статусы `REQ-*` ниже M00 не меняет.

Форматирование исходников относится к foundation tooling и не добавляет нового
`REQ-*`: локальная команда `pnpm format:check` и существующий gate `pnpm check`
проверяют единые правила: ESLint Stylistic для JS/TS/Vue, Prettier для остальных
поддерживаемых текстовых файлов. Контракт включает перенос named imports с двумя
и более именами, многострочные объявления функций с двумя и более параметрами,
одну инструкцию на строку и сохранение существующих структурных переносов.
Также многострочными остаются списки базовых интерфейсов и условия из трёх
и более проверок. Regression evidence — `tests/boundaries/formatting-contract.test.ts`.
Проверяется также повторное форматирование без изменения результата.
Автоформатирование редактора и обязательная
проверка для агентов описаны в `../AGENTS.md` и `TESTING.md`.

## Живой взгляд логотипа (2026-10-18, ADR-093)

До реализации уточнены `REQ-UI-013`, `REQ-WEB-001/002` и `REQ-QLT-003`:
генерируемый inline SVG в TopBar и RU/EN шапках, один DOM-only контроллер,
После пользовательского review темп замедлен до 1500 ms приветствия,
300 ms сглаживания слежения и 500 ms возврата (контракт уточнён до правки).
Прищуры ограничены
±1,5/±0,8 units; touch/reduced motion статичны, blur/hidden/unmount освобождают
animation frame и listeners. Требуемое evidence: controller lifecycle tests,
production landing/browser hover и no-JS navigation, real-WebView pointer input,
размерный review. Native icons и document pipeline не меняются.
Implemented: 22 unit/regression tests, landing RU/EN и browser editor hover,
no-JS navigation и размерный review прошли на Windows/Chrome. Native build
сначала блокировался сторонним типом градиента и Windows CLI shim; после их
исправления финальный runtime-прогон свежего binary прошёл в WebView2 155 /
external driver, EN × light/dark с trusted pointer input. WebKit/Linux runtime
pending. Команды, transient startup failure и артефакты — TESTING.md.

## Читаемый знак приложения и трея (2026-10-15)

Обновление контракта до реализации (2026-10-16), `REQ-ACT-006`, `REQ-UI-013`,
ADR-057: выбран монитор с кошачьими ушами, двумя крупными изогнутыми прищурами
и подставкой. `logo.svg`/editor/favicon/bundle и отдельный прозрачный
`logo-mark.svg` генерируются из общего источника. Windows/Linux tray сохраняет
светлую форму, внешний тёмный контур и тёмные прищуры; macOS — alpha template
с прозрачными прищурами. Требуемое evidence: red-first Rust decode/alpha/contrast
tests для глаз и подставки, повторное декодирование PNG/ICO/ICNS, размерный review
16/20/24/32 px и реальные platform smokes. Старый GNOME smoke ниже относится
к предыдущей геометрии; для нового знака native runtime пока pending.

Историческая запись для предыдущего знака (2026-10-15):
до реализации уточнены `REQ-ACT-006` и `REQ-UI-013`: tray использует отдельный
прозрачный знак без цветной плитки, с крупным силуэтом кота без рамок и мелких деталей. Windows
и Linux получают светлый знак с тёмным контуром; macOS — alpha template с
прозрачным фоном и системной окраской. Логотип редактора и bundle icons
производятся из одной геометрии. Required evidence: red-first Rust decode/alpha/
contrast tests, визуальная проверка 16/20/24/32 px на светлом и тёмном фоне,
реальный GNOME tray и открытие меню. Windows/macOS runtime остаётся pending.
Статус: implemented; PNG/template tests, размерный review и GNOME tray
подтверждены локально. Фактические команды и artifacts — в `TESTING.md`.

## TypeScript/Vue architecture refactor gate (2026-08-31)

Рефакторинг по ADR-042 не создаёт нового пользовательского сценария и не меняет
document schema v7, `EditorCommand`, IPC, package exports или DOM/E2E contract.
До переноса модулей compatibility tests фиксируют публичные TypeScript exports,
Vue props/emits, generated capture DTO, CSS entrypoint/selectors и renderer
contracts. `REQ-EDT-001/002/005/006`, `REQ-UI-001/005/010`,
`REQ-CAP-010/012/013` и `REQ-QLT-001/003` продолжают использовать существующие
core, renderer, Vue, browser и real-Tauri evidence без ослабления assertions.

Архитектурный gate отдельно проверяет направление импортов
`editor-core → editor-renderer → editor-vue → desktop`, отсутствие Vue/DOM/Tauri
в нижних слоях, отсутствие циклов между доменами и бюджеты размера/сложности.
Pointer move остаётся imperative/transient path: он не создаёт document command
и не передаёт scene graph в глубокую Vue-reactivity; завершённый gesture создаёт
ровно один command. Quick `selecting → editing` сохраняет те же scene/overlay
canvas hosts. Перемещение или дробление тестов не является новым evidence:
количество сценариев, project names и stable commands должны сохраниться.
Фактическая локальная матрица, бюджеты и baseline-сравнение real-Tauri
зафиксированы в разделе
[TypeScript/Vue architecture refactor evidence](TESTING.md#typescriptvue-architecture-refactor-evidence-2026-08-31).

## Rust core refactor gate (2026-08-30)

Рефакторинг по ADR-041 не создаёт новый capture workflow: Area quick capture
остаётся единым сценарием `selecting → editing → terminal`. До механического
переноса модулей red-first Rust tests обязаны доказать атомарный переход draft в
commit, невозможность persisted-but-cancelled и exactly-once terminal outcome.
`REQ-CAP-010` дополнительно требует, чтобы renderer timeout после durable commit
деградировал только presentation handoff и не превращал сохранённый документ в
ошибку либо необходимость второго клика.

Для `REQ-CAP-008/013/015` macOS FFI contract запрещает неатомарное чтение Rust
`AtomicBool` через C pointer и требует ABI/layout coverage. Multi-display Area
evidence использует единый frozen virtual-desktop frame; отдельные per-display
снимки не считаются реализацией cross-monitor выбора.

## Linux startup, dialog and quick-capture repair gate (2026-08-24)

Дополнение `REQ-CAP-012/013` (2026-08-30, Windows): Windows Area больше не
использует отдельный Win32 selector перед Quick Capture. Red-first Rust contract
требует один frozen DXGI virtual-desktop frame с `quick_selection_pending`, без
вызова native Area selection; существующий mounted Quick `CanvasViewport`
выполняет первый drag и переход `selecting → editing`. Обязательное runtime
доказательство на Windows — один fullscreen `Cute Screen Quick Capture` HWND и
неизменный frozen frame/canvas до, во время и после первого drag; mixed-DPI и
cross-monitor выбор проверяются отдельно.

Repair gate `REQ-CAP-001/012/013` (2026-08-30, Windows): первый runtime replay
единой Quick surface обнаружил не GPU-screenshot limitation, а полностью нулевой
первый DXGI frame. Игнорируемый interactive Rust probe воспроизвёл дефект до
WebView. Area обязан подготовить duplication, инициировать прозрачный compositor
present, дождаться `DwmFlush` и только затем читать frame; all-zero BGRA считается
красным runtime-сигналом на контролируемом заведомо непустом desktop. Приложенный
DOM также показал оставшийся `cs-loading`; component regression обязана доказать
переход `DocumentSessionController` в `ready`, а Windows replay — отсутствие
loading overlay и чёрного quick-окна после первого drag.

Repair gate `REQ-CAP-010/013`, `REQ-UI-010` (2026-10-17, Windows first Area show):
первый показ prewarmed Quick шёл через восстановленный размер Tao 800×600.
`set_fullscreen` на Windows ставит bounds монитора через `SWP_ASYNCWINDOWPOS`,
поэтому первый `show` отображал обычное окно и только затем selecting surface;
повторный показ уже был fullscreen и вспышки не имел. Red-first контракт
запрещает `SWP_SHOWWINDOW` и `SWP_ASYNCWINDOWPOS` у скрытого placement и
требует commit монитора под курсором до `set_fullscreen`/`show`, включая Area
preflight. Визуальный replay первого Area остаётся обязательным.

Repair gate `REQ-CAP-010`, `REQ-UI-010` (2026-08-30, Windows editor handoff):
живой dev replay после первого клика `Редактор` показал materialized document в
main, но обычный `CanvasViewport` не отправил `frameReady`, потому что событие
было ошибочно ограничено `quickFrameMode`. Native mount wait завершился timeout,
повторный клик попал в materialized fallback, а `hide → set_fullscreen(false)`
повторно отобразил Quick как обычное окно 654×487. Red-first component/boundary
обязаны требовать main-mode frame acknowledgement, Windows handoff `show main →
lower Quick → wait`, а terminal dismiss — `lower → hide` без post-hide fullscreen
mutation. Runtime доказательство — один клик открывает готовый editor, Quick HWND
становится невидимым и не возвращается уменьшенным.

Дополнение `REQ-CAP-012` (2026-08-29): `build-contract.test.ts` требует, чтобы
принятый macOS Area selector оставался видимым handoff-слоем до явного
подтверждения первого готового кадра quick WebView. Runtime-проверка отсутствия
пустого кадра на mouse-up остаётся обязательной.

Эта таблица зафиксирована до реализации пользовательских воспроизведений на
Ubuntu 24.04 / GNOME 46 / X11. Unit/component evidence не заменяет реальный
WebKitGTK/X11 smoke.

| Requirement                                | Required red-first evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Runtime/platform evidence                                                                                                                                                                                                                                                                                                                                       | Status                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `REQ-LIB-009`                              | `document-session.test.ts` maps `olderSchema` to a useful message; `App.vue` uses the shared native-error decoder instead of `String(error)`; repository schema-v4 rejection/raw preservation remains covered; `app-startup.test.ts` proves `runEditorStartup` mounts the last document before optional font/capability IPC and leaves `loading` even if fonts never settle; `lib.rs` unit forbids macOS startup prewarming of the fullscreen `quick-capture` WebView because AppKit can map a fullscreen window despite Tauri `visible(false)`             | macOS 12.7.6 x64 production re-smoke must prove that `pnpm tauri dev` shows the `main` WebView and that no idle `quick-capture` WebView is visible; last-document and empty-profile screenshots must be refreshed after the native lifecycle repair.                                                                                                            | implemented in code; macOS 12 production runtime re-smoke pending 2026-08-29                     |
| `REQ-UI-011`, `REQ-TOL-016`                | `build-contract.test.ts` rejects blocking dialog APIs; every Open/Import/Save command awaits callback completion and parents native file dialogs on the invoking webview window; `tool-catalog.test.ts` keeps Image tool availability in sync with a late `contentImageBridge` and `readOnlyDocument`                                                                                                                                                                                                                                                       | GNOME Open image stayed responsive for more than one minute and cancelled normally                                                                                                                                                                                                                                                                              | implemented                                                                                      |
| `REQ-CAP-010/012/014`, `REQ-UI-010`        | `canvas-viewport.test.ts` requires the first X11 Quick drag to emit one `setCrop`, reject a zero-area click and preserve the scene canvas across `selecting → editing`; `App.test.ts` forbids ToolRail/Zoom/actions in selecting; `build-contract.test.ts` forbids native X11 Area selection and retained handoff; Rust stages pending full-frame drafts, rejects pre-confirm commit and verifies current-process client/Mutter-frame exclusion, recent-hide settle and direct xRGB32 BMP staging. macOS keeps its platform-specific presentation coverage. | Resident Ubuntu 24.04/GNOME 46/X11 physical drag kept one fullscreen Quick XID `0x42000fc`, one frozen frame and the exact 700×450 dash before/after tools appeared; dev/debug command → focused selecting measured 723 ms visible / 607 ms hidden; Escape returned typed `cancelled`. macOS 12 seamless selector-to-ready-quick-mode runtime re-smoke pending. | X11 unified surface locally verified 2026-08-30; mixed-DPI/cross-monitor matrix re-check pending |
| `REQ-CAP-012/013`, `REQ-UI-010`            | Windows Rust contract maps Area to a frozen full-frame Quick-selection route, keeps Window on native `SelectThenFrame`, marks the Area result `quick_selection_pending` and forbids `area_geometry`/`select_on_virtual_desktop` in the Area route; the shared Vue mounted-surface tests cover the first `setCrop` and `selecting → editing` transition.                                                                                                                                                                                                     | Windows 10 build 19045 x64 replay kept fullscreen Quick HWND `0x4078C` before/after a physical drag, exposed no selector HWND and changed the same frozen desktop surface from hint-only selecting to a 1225×750 physical crop with tools/actions. Escape removed the Quick window. Cross-monitor bounds remain required.                                       | implemented; single-display pixels, same-HWND lifecycle and Escape passed 2026-08-30             |
| `REQ-CAP-001/012/013`, `REQ-UI-010`        | Interactive Windows Rust probe on a controlled non-black desktop fails for immediate first DXGI acquisition and passes after prepared duplication, registered transparent compositor pulse and `DwmFlush`; boundary coverage pins that order. Quick Vue regression mounts a pending full-frame draft, reaches `ready` and removes `cs-loading`.                                                                                                                                                                                                             | Windows 10 build 19045 x64 selecting/editing screenshots show the actual frozen desktop pixels and no `Подготавливаем редактор…`; the same HWND survives the first drag.                                                                                                                                                                                        | repaired and physically verified 2026-08-30                                                      |
| `REQ-CAP-010`, `REQ-UI-010`, `REQ-QLT-003` | Red-first regular-editor `CanvasViewport` regression requires `frameReady` after completed render; Windows boundary pins `show_editor → lower Quick → mount wait`, present-time topmost restore and terminal `lower → hide` without post-hide fullscreen mutation.                                                                                                                                                                                                                                                                                          | Windows 10 dev replay: one Editor Invoke made main visible at 104 ms and Quick invisible at 163 ms; after 3 s only main remained visible and the resident process was alive.                                                                                                                                                                                    | repaired and physically verified 2026-08-30                                                      |
| `REQ-CAP-001/009/013`                      | X11 unit encodes canonical RGBA for the target visual/depth; continuous-motion damage regression requires every previous transient visual to be restored from a frozen backing pixmap; boundary test rejects captured-native replay and XOR drawing                                                                                                                                                                                                                                                                                                         | Packaged GNOME/X11 smoke: 472 hint motions and 120 pressed-drag motions left only the current transient state                                                                                                                                                                                                                                                   | implemented; mixed-DPI/cross-monitor re-smoke pending                                            |

| Requirement | Основное автоматическое доказательство                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Runtime/platform доказательство                                                                                                                                                                                                                                                                                                                                                                                                            | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-EDT-001 | `App.test.ts`: enabled Hand tool is activated by `H`, and text editing does not change the active tool; `canvas-viewport.test.ts`: active Hand pans the scroll surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Vue component keyboard and pointer regressions                                                                                                                                                                                                                                                                                                                                                                                             | implemented; focused Vue regressions passed on Windows x64 (2026-08-12); browser and real-Tauri pointer evidence remains covered by the existing pan/zoom track                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-CAP-001 | `capture.rs` controller state machine, delay-before-backend cancellation and owned-image repository tests; Windows Area fresh full-frame DXGI quick-selection order, Window selector-before-frame order, registered non-activating compositor-pulse policy, pointer-resource retry and compositor output assembly units; X11 compositor/root drawable policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Windows Area single-surface frozen-frame smoke; Windows Window smoke must switch the foreground window while the selector is open; X11 compositor-backed screen/area re-smoke pending                                                                                                                                                                                                                                                      | implemented in code: Windows Area prepares duplication, registers/shows the transparent pulse, flushes DWM and acquires one frozen DXGI virtual desktop before the Quick selection surface is shown. Window alone additionally destroys its selector and restores foreground before final acquire/crop. Screen/Active Window remain direct snapshots. Physical single-display Area pixels/same-HWND passed; exact Window Alt+Tab → Task Manager and Area cross-monitor evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-CAP-002 | `linux_platform.rs` v2/v3 target-validation tests; X11 composited/non-composited drawable selection and full-rect crop; Windows DXGI output-to-virtual-desktop assembly contract; macOS Screen backend selection, packed-BGRA/PNG and InvalidTarget contracts in `macos_platform.rs`/`platform.rs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | X11 compositor-backed screen re-smoke pending; Windows desktop smoke with composited topmost/system window pending; macOS Intel/Apple Silicon Screen runtime pending until local smoke records decoded PNG evidence                                                                                                                                                                                                                        | implemented in code: Screen exports the visible compositor frame; Windows DXGI or the X11 Composite Overlay Window becoming unavailable is a typed failure rather than a successful but incomplete screenshot. macOS Screen uses one CoreGraphics desktop snapshot for Intel and Apple Silicon; Area/Window use the native AppKit selector and stay unverified until decoded-pixel smoke. Local Windows physical 2560×1440 DXGI readback passed; exact topmost/system-window, X11 compositor and macOS Screen runtime evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-CAP-003 | M04 portal v3 advertised-target dispatch; X11 EWMH stacking-list selector; Windows click-to-top-level-window bounds intersected with the frozen virtual desktop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | X11 window smoke (`artifacts/m04/x11-window.json`), X11 selector-policy/capability units; Windows geometry unit                                                                                                                                                                                                                                                                                                                            | implemented in code; Windows Window uses the native selector and never captures the selector itself; X11 local selector smoke remains passed, and Windows runtime evidence is pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| REQ-CAP-004 | M04 portal v3 dispatch; X11 EWMH active-window visible decorated-bounds crop through the selector inventory policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | X11 active-window smoke (`artifacts/m04/x11-active-window.json`), X11 selector-policy unit                                                                                                                                                                                                                                                                                                                                                 | implemented; local X11 direct-target smoke passed; minimized/self/non-user targets are invalid rather than silently recovered; portal runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| REQ-CAP-005 | X11 physical repeat geometry + RandR layout fingerprint, largest-intersection current-monitor and intersecting monitor-ID guard; Wayland repeat maps to Area selector                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | X11 repeat smoke (`artifacts/m04/x11-repeat.json`), X11 horizontal/vertical monitor property tests                                                                                                                                                                                                                                                                                                                                         | implemented; X11 repeat checks bounds, physical-size layout and monitor identity; current monitor uses a stable largest-intersection rule; portal repeat safely reopens the selector; rotation runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-CAP-006 | M04 controller cancel signal, progress states, `capture_cancel` IPC and capability-driven capture control; Windows Window selector message-queue lifecycle and controller-signal regressions; shared Quick selecting Escape/cancel coverage for Windows Area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | X11 area cancel smoke (`artifacts/m04/x11-area-cancel.json`), Rust selector-queue/cancel-target/signal regressions and Vue unavailable/cancelled-control tests                                                                                                                                                                                                                                                                             | implemented in code; Windows Area cancels through the single Quick surface, while the native selector cancellation lifecycle applies only to Window. Windows desktop smoke remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| REQ-CAP-007 | X11 XFixes cursor hotspot/clipping/composite plus portal cursor terminal mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | X11 cursor smoke (`artifacts/m04/x11-screen-cursor.json`), portal metadata unit                                                                                                                                                                                                                                                                                                                                                            | implemented; local XFixes metadata recorded `included`; portal preference is persisted as `unsupported` when its contract has no cursor control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-CAP-008 | M01 monitor-layout fixtures; M03 coordinate properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | mixed-DPI multi-monitor smoke                                                                                                                                                                                                                                                                                                                                                                                                              | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-CAP-009 | M01 portal validation; bounded portal probe/handshake with unbounded system selector response; X11 root/RandR/XFixes/EWMH capability gates; pending full-frame Area draft and unified Quick selecting-state boundary. Native X11 selector coverage applies only to Window target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | X11 physical Area drag on the single Quick surface; X11 Window selector smoke; Vue unavailable-control and X11 EWMH-gate units.                                                                                                                                                                                                                                                                                                            | implemented for X11 unified Area surface; Wayland runtime and mixed-DPI/cross-monitor evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-CAP-010 | `capture.rs` owned-image → repository transaction, staging-failure cleanup, shared editor-core v1 initial-document golden, native renderer-preflight gate and Vue `DocumentSessionCoordinator` handoff tests; Tauri E2E bootstrap regression explicitly selects the `main` WebView when the resident `quick-capture` WebView is prewarmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | X11 screen persisted document (`artifacts/m04/x11-screen.json`), Tauri `m04-clean-profile-capture`; sequential real-Tauri scenarios must mount their requested harness in `main` while `quick-capture` remains prewarmed and hidden                                                                                                                                                                                                        | implemented; transaction fault tests leave no openable phantom document and consume only operation staging; action success waits for shared decode/mount acknowledgement, while UI retry preserves the previous tool/zoom/dirty state; tray/hotkey/warm-CLI wait for a renderer `flush` acknowledgement before hide/backend; clean-profile Tauri flow uses a feature-gated native fake image but real command/repository/decode/mount; Linux CI multi-WebView context-selection repair pending rerun                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-CAP-011 | Quick draft store cleanup tests for cancel, shutdown, failed staging and timeout; quick-action regression guarantees immediate window close without waiting for draft-cancel IPC and still closes when that IPC rejects; production Tauri capability boundary grants `core:window:allow-close` to `quick-capture`; repository remains unchanged before commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Real Tauri Area Close/Escape from clean profile, including Close after a failed terminal action                                                                                                                                                                                                                                                                                                                                            | implemented; controller tests prove no persistence before commit and owned staging cleanup; frontend Close starts native window close concurrently with draft cancellation and handles either failure explicitly. Production capability regression covers the WebView permission shared by Escape and terminal Copy/Save/Editor close paths; runtime Close/Escape and crash-recovery evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-CAP-012 | Red-first quick-crop/rebase and live chrome anchoring tests; Windows/X11 first-drag coverage requires one `setCrop`, unchanged scene canvas/dash and state-only `selecting → editing`; click-without-area remains selecting. Windows Rust/boundary contracts forbid the native selector in Area while retaining it for Window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | X11 single-XID physical drag/Escape with same 700×450 frame; Windows single-HWND physical drag/Escape; Wayland inward-only crop.                                                                                                                                                                                                                                                                                                           | implemented for Windows/X11 unified surface and deterministic suites; Windows single-display 125%-scale physical pixels/same-HWND/Escape passed, cross-monitor re-smoke remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-CAP-013 | Platform DTO/capability tests distinguish full-frame and portal-fragment drafts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Windows/X11 mixed-DPI overlay and GNOME/KDE portal quick-surface smokes                                                                                                                                                                                                                                                                                                                                                                    | implemented; Windows/X11 drafts carry full-frame geometry while Wayland remains fragment-only; no support claim before runtime evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-CAP-014 | Capture controller busy and completion-routing tests; quick-action regression normalizes transient floating crop geometry to bounded integer physical pixels before PNG preparation and `quick_capture_commit`; CLI terminal compatibility tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | tray/hotkey/CLI Area terminal completion smoke; Windows quick Copy after a resize that produces fractional scene coordinates                                                                                                                                                                                                                                                                                                               | implemented; unit coverage distinguishes copied/saved/editor, rejects concurrent drafts and guards the integer IPC selection contract; end-to-end terminal runtime evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-CAP-015 | `platform.rs` selects `macosScreenCapture` only after the native probe flag; `macos_platform.rs` maps missing Screen Recording to `permissionDenied` without creating an overlay; the AppKit selector freezes each `CGDirectDisplayID` at native pixel dimensions instead of stretching the bounding box returned for `CGRectNull`; Vue store maps the terminal outcome to Settings/retry copy; activation socket falls back from `XDG_RUNTIME_DIR` so the macOS host can start                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Local macOS 12 Intel Screen Recording grant/deny, System Settings deep-link, selector edge-to-edge visual and decoded-PNG smoke pending; Apple Silicon remains compile/CI until owner runtime                                                                                                                                                                                                                                              | implemented in code (2026-08-28, darwin 21 Intel): `cargo clippy -p cute-screen-desktop --all-targets -- -D warnings`; `cargo test -p cute-screen-desktop --lib -- macos_` (6) and `runtime_dir_falls_back` (1); vitest `capture-request.test.ts` + `shell-store.test.ts` (14); capability advertised only after probe. Per-display frozen selector regression coverage added 2026-08-29; runtime permission, border-free visual and decoded Screen evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-ACT-001 | CLI/dispatcher и Rust shortcut restore                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | activation-settings/reopen/capture real Tauri, CLI parser                                                                                                                                                                                                                                                                                                                                                                                  | implemented; X11 evidence в TESTING.md; другие ОС pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| REQ-ACT-002 | X11 grabs с Caps/Num lock, native Windows/macOS registry, staged persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Rust transaction/duplicate/conflict tests, physical X11 key/relaunch                                                                                                                                                                                                                                                                                                                                                                       | implemented; Windows/macOS runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| REQ-ACT-003 | ShortcutService portal create/list/bind/configure/changed/reconnect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rust contracts и portal runtime matrix                                                                                                                                                                                                                                                                                                                                                                                                     | implemented; GNOME/KDE Wayland runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-ACT-004 | CLI fallback, GNOME owned keybindings и one-time verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | CLI tests, Gio memory-backend ownership/cancel/external changes                                                                                                                                                                                                                                                                                                                                                                            | implemented; Wayland/policy-lock runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-ACT-005 | Unix activation IPC, single-instance, shared dispatcher и settings route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Rust activation tests; repeated CLI/window real Tauri                                                                                                                                                                                                                                                                                                                                                                                      | implemented; local X11 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-ACT-006 | Native tray icon, capture capabilities, shortcut labels и Settings entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | existing tray artifact plus CLI/menu Settings route                                                                                                                                                                                                                                                                                                                                                                                        | implemented; absence-of-tray route available through CLI/menu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-ACT-007 | NSIS consent, first-GUI-launch consent, platform autostart adapters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Vue/browser consent, serializer tests и NSIS hook syntax compile                                                                                                                                                                                                                                                                                                                                                                           | implemented; installer runtime, upgrade и logout/login pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-EDT-001 | `viewport.test.ts` plus Vue viewport layout regressions: fit floors to the largest integer percent inside padded viewport without a scrollbar, anchored zoom, DPR matrix, 64 CSS px pan clamp and exact zoomed surface geometry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | browser and real-Tauri 2560×1440 Fit → 1:1 → Fit at 1024×700; frame/tool navigation                                                                                                                                                                                                                                                                                                                                                        | implemented; Windows 10, `vitest` `canvas-viewport-quick.test.ts -t fit` 3/3 (2026-10-18) proves Fit floors inside the padded viewport; Chrome 150 and Tauri WebKitGTK 605.1.15/Linux evidence (2026-08-10) proves zoom changes only the scroll surface, while shell height and visible zoom controls remain stable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-EDT-002 | `drawing.test.ts`, `CanvasViewport` transient draft and one-command `addLayer` handoff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `browser-m06-drawing-tools.e2e.ts`: two arrows, persistent tool, cancel and four creation flows                                                                                                                                                                                                                                                                                                                                            | in_progress; Chrome 150/Linux x86_64 M06 browser spec passes all 3 flows (2026-08-10); real Tauri production mount-flow is pending because this host lacks `webkit2gtk-driver`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-EDT-003 | `m08-precision-interactions.test.ts`: loupe creation auto-selects only the loupe while censor, spotlight and ruler creation preserve an empty selection and the active tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Focused `browser-m08-crop-precision.e2e.ts` verifies loupe-only auto-selection and persistent precision tools in the seeded App harness; clean production mount and real Tauri remain pending                                                                                                                                                                                                                                              | implemented; focused Vue and Chrome 151 M08 component/browser evidence passed on Windows x64 (2026-08-15); no real-Tauri/WebView2 claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-EDT-004 | `hit-test.test.ts` and `interaction.test.ts`: topmost hit, incremental `rbush` point index, and time/movement overlap-cycle reset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | double-click cycle E2E                                                                                                                                                                                                                                                                                                                                                                                                                     | implemented; core contract passes, browser pointer evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-EDT-005 | `operations.test.ts`, `layer-resize.test.ts`, `hit-test.test.ts`, `canvas-viewport.test.ts` and shell keyboard routing: lock guard, image-only transform scale, intrinsic non-image geometry, corner rotation, modifiers/cancel, batch/flip snapshots, and a single live transient layer geometry for Arrow ink, selection frame and floating toolbar; one command only on release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | M05/M06/M08 browser specs: move, image resize, arrow/ruler geometry handles, text width reflow, corner rotation-adjacent selection behavior, undo/redo and cancel                                                                                                                                                                                                                                                                          | implemented; non-image resize emits one `updateLayer` with unit scale and style-preserving intrinsic geometry, while image retains transform resize. Focused CanvasViewport 33/33 and complete Chrome 151/Windows x64 browser matrix 7/7 spec files passed (2026-08-22); real-Tauri interaction remains blocked by local embedded-driver configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-EDT-006 | M03 command/session flush-handoff, no-op and transient-commit tests; M06 v3 codec/storage save; native structured-save-error normalization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `document-persistence.e2e`: committed edit survives close/reopen                                                                                                                                                                                                                                                                                                                                                                           | implemented for current persisted document flow; M06 drawing reopen evidence remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-EDT-007 | `interaction.test.ts`, `snap.test.ts` and `CanvasViewport`: transient guide flag, 6 CSS px snapping and Alt/Ctrl gesture modifiers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `browser-m05-editor-foundation.e2e.ts`: pointer + Alt hold/release                                                                                                                                                                                                                                                                                                                                                                         | implemented; Chrome 150/Linux x86_64 targeted Alt guide flow passed (2026-08-10) after the M05 harness preserved an interior pointer target through M06 drawing-payload normalization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| REQ-EDT-008 | `quick-context-toolbar.test.ts`, `ui-icon.test.ts` and ADR-043: Quick Capture omits canvas flip/fallback panel; Tabler MIT icons preserve SVG/accessibility and distinct text-tool semantics. `ui-controls.test.ts`, `m08-precision-interactions.test.ts`, `text-context-toolbar.test.ts` and `layer-selection.ts`: bottom horizontal `ToolRail`, controls panel above rail, product picker grid/HEX validation, precision and selected-layer text settings in bottom contextual toolbar, inline text edit via transient floating `TextFormattingToolbar`, no arrow controls while arrow tool is active, floating `ArrowFormattingToolbar` for selected arrow under select, configure popover defaults on arrow tool button, locked/read-only inert controls and one command per completed selected-layer interaction                                                                                                                                     | Focused Chrome 151 M08 browser coverage passed 8/8 with desktop/1024×700 RU/EN contextual controls, locked-control/default isolation and opaque eyedropper states; the seeded browser harness is not native clipboard or clean-mount evidence                                                                                                                                                                                              | implemented; core/Vue and focused browser evidence pass locally on Windows x64 (2026-08-15). The previously recorded full-browser M06/M07 failures and real-Tauri clean-mount/native-clipboard evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-EDT-009 | Single-row LayersPanel list (eye · icon · name · lock); selected-layer opacity/rotation in panel header; HTML5 DnD insert before/after without ↑↓ buttons; selection/order/visibility/lock plus Naive UI opacity/rotation regressions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | browser selected-layer interaction at 1600×1000/1024×700                                                                                                                                                                                                                                                                                                                                                                                   | implemented; panel remains limited to its accepted layer responsibilities and its controls are command-backed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-EDT-010 | `content-tools.test.ts`: versioned internal codec, transient stripping, internal/bitmap/text dispatch and one-command paste; `clipboard.rs`: bounded RGBA→PNG native snapshot encoding and bounded native text write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `clipboard-runtime.e2e`: custom layers, bitmap and text precedence on real Tauri                                                                                                                                                                                                                                                                                                                                                           | in_progress; Linux 6.8.0-137-generic x86_64/X11: `pnpm test` passed 148 tests and `cargo test --workspace` passed 77 (2026-08-11); active-document bitmap/text and empty-state bitmap `Mod+V` use native snapshots and opaque tokens. Selected unlocked Text layers support native plain-text `Mod+C/X`; cut removes its layer through one command only after the native write succeeds. Custom MIME, PNG clipboard write, arbitrary rich-layer cut and real system-clipboard E2E remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-EDT-011 | `content-tools.test.ts`: duplicate clone, 16 CSS px screen-space cascade and preserved marker sequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `duplicate-layer.e2e`: `Mod+D` preserves active tool and selection semantics                                                                                                                                                                                                                                                                                                                                                               | in_progress; Linux 6.8.0-137-generic x86_64/X11: `pnpm test` passed 127 tests (2026-08-10), including portable command helper; browser shortcut evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-EDT-012 | `codec.test.ts`, `scene.test.ts`, `viewport.test.ts` and Vue stage/surface regression: v1→v2 migration, independent canvas, exact scaled dimensions and canvas-based fit; `crop-session.test.ts`: crop session opens and constrains geometry from `document.canvas` only after valid production dimensions, independent of deleted/resized/moved base layers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | browser and real-Tauri production-like landscape canvas Fit plus custom zoom without viewport resize; clean-state Crop must derive dimensions through production mount-flow rather than a seeded frame                                                                                                                                                                                                                                     | implemented; M08 editor-core canvas-only crop session passed focused/property and full core suites on Windows x64 (2026-08-15), while clean-state browser/Tauri crop mount evidence remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-EDT-013 | `capture.rs` v2 factory, `layer-resize.test.ts`, `content-tools.test.ts`, `document-session.test.ts` and command guards: locked base layer, image-only non-unit scale, idempotent legacy normalization, unit-reflection preservation and clipboard parity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | capture/open → image resize/delete plus legacy non-image normalization and pure flip persistence across restart                                                                                                                                                                                                                                                                                                                            | implemented; core/session coverage proves normalization has no history or dirty state and the full browser matrix preserves image resize/flip. Real-Tauri persisted reopen remains pending because the local embedded-driver session could not be created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| REQ-EDT-014 | `quick-context-toolbar.test.ts`: full-editor flip click/undo/redo on both axes; no flip in Quick Capture. `operations.test.ts`: both-axis affine reflection of translated/rotated/scaled layers plus snapshot/revert including crop and locked base; `crop-session.test.ts`: flip-before/after-crop deterministic examples and undo/redo round-trips without source/layer-coordinate mutation; renderer tests cover negative-scale annotation preview/export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | browser flip/undo + decoded export comparison                                                                                                                                                                                                                                                                                                                                                                                              | implemented; M08 crop/flip command ordering and undo/redo replay passed in editor-core on Windows x64 (2026-08-15), while real browser decoded-export parity remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-TOL-001 | `drawing.test.ts`, `drawing-preferences.test.ts`, `codec.test.ts`, `arrow-geometry.test.ts`, `hit-test.test.ts`, `scene.test.ts` and `storage.rs`: v5/v1 migration, v6 native save, straight/quadratic/elbow geometry, rebased bounds, independent endpoints and one continuous body path; `arrow-context-toolbar.test.ts`, `App.test.ts`, `canvas-viewport.test.ts` and `layer-selection.ts`: five-control order/states, no bottom arrow toolbar while drawing, floating toolbar on select, configure defaults popover and one-command endpoint/bend/middle-segment edits; `golden.test.ts`: decoded persisted-route goldens and preview/export parity                                                                                                                                                                                                                                                                                                   | `browser-m06-drawing-tools.e2e.ts`: 3-size × 2-locale × 2-theme toolbar matrix, persistent tool, no auto-selection, elbow drag and undo/redo. `tauri-arrow.e2e.ts` plus M03 write/reopen exist but did not execute because embedded WebDriver port 4445 was unavailable                                                                                                                                                                    | in_progress; Windows 10 x64 (2026-08-13): `pnpm test` 206/206, `pnpm test:render` 9/9, `cargo test --workspace` 77 passed/1 interactive ignored, `pnpm test:e2e:browser` 5/5 specs and 27 scenarios. Six visually reviewed arrow PNG cover straight/quadratic/elbow, solid/dashed and all endpoints on both ends; Canvas2D preview/export RGBA is exact and CanvasKit parity is within the documented tolerance. Real Tauri/WebView2 arrow and reopen evidence remains pending; no Wayland/X11 runtime claim is made                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-TOL-002 | v3 codec validation, gradient compiler and Canvas2D/CanvasKit gradient tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | advanced shape toolbar + text-backdrop browser E2E                                                                                                                                                                                                                                                                                                                                                                                         | in_progress; linear/radial gradient and filled polygon rendering pass; pattern/texture rendering and picker pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-TOL-003 | `drawing.test.ts` deterministic sampled-point simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | brush pointer E2E                                                                                                                                                                                                                                                                                                                                                                                                                          | in_progress; core simplification passes; real pointer/performance evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| REQ-TOL-004 | marker v3 blend-mode persistence plus a single contiguous freehand render path regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | marker visual E2E                                                                                                                                                                                                                                                                                                                                                                                                                          | in_progress; marker default is persisted as multiply; contiguous-stroke regression and parity golden pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-TOL-005 | `v7-contract.test.ts`, `codec.test.ts`, `content-tools.test.ts`: strict v7 round-trip, UTF-16-safe ranges, exact span/paragraph coverage, solid colors/background bounds, removed-field/common-effect rejection, typed v0-v6/v8+ states, clipboard v2 and TS factory; `rich-text-editing.test.ts`: UTF-16-safe selection/replacement, span split/merge, typing style, paragraph normalization and bullet key semantics; `scene.test.ts`, `rich-text-layout.test.ts`, Canvas2D/CanvasKit tests and `golden.test.ts`: renderer-neutral runs/paragraphs, UTF-16 traversal, mixed styles, wrapping, alignment, bullet metadata, strike geometry and solid backgrounds across Text/Callout/Numbered Marker; Rust `capture.rs`/`storage.rs`: native v7 creation/open gate; `text-context-toolbar.test.ts`: shared compact toolbar ordering, visibility, states, range/caret/whole-layer command boundary, validation/cancel/focus, a11y and responsive overflow | `rich-text-editor.test.ts`, `rich-text-editing-component.test.ts`, `text-context-toolbar.test.ts` and `canvas-viewport.test.ts`: transient contenteditable selection, IME, plain-text clipboard, list keys, Escape rollback and one-command commit; `browser-v7-rich-text.e2e.ts`: range/caret/mixed/partial patch, lists, IME, plain-text paste, one command, rollback, Text/Callout/Numbered states, RU/EN focus and responsive overflow | in_progress; v7 contract, renderer/layout, headless editing and Chrome 151/Windows browser acceptance implemented. Real Tauri/WebView2 remains infrastructure-blocked before test bodies because the installed 151.0.4129.78 runtime has no local matching `msedgedriver`; browser evidence is not substituted for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-TOL-006 | `content-tools.test.ts`, `scene.test.ts`: minimal-free-positive allocator, circle/square/diamond/star serialization and a full-body visual-center label contract; `canvas2d.test.ts` and `canvaskit.test.ts`: digit ink is centered from measured glyph ascent/descent rather than an em-box/top-baseline offset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `browser-m06-drawing-tools.e2e.ts`: two marker clicks allocate stable sequence and preserve tool; local Chromium visual evidence at `artifacts/browser-e2e/numbered-marker-visual-center.png`; actual Tauri WebView2 rerun pending                                                                                                                                                                                                         | in_progress; Windows 10 x64 (2026-08-14): red-first renderer/core regressions now pass 39/39, full `pnpm test` passes 223/223 and `pnpm test:render` passes 10/10. At 453% browser zoom the black circle center is 426.5 px and white digit center is 424 px, an optical offset of -0.55 canvas px; the scene uses the audited bundled Roboto reference instead of unbundled Inter. Installed WebView2 runtime is 151.0.4129.78, but this repair does not claim a real-Tauri rerun. Direct multiline label editing and duplicate keyboard evidence remain pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| REQ-TOL-007 | `callout-geometry.test.ts`, scene/hit-test tests, Vue rich-text editing/toolbar tests and render `callout-layout.test.ts`: measured outside placement, padded gap, mixed font metrics, v7 round-trip, width handles, conservative bounds and stable world endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `browser-callout-layout.e2e.ts`, `browser-callout-visual.e2e.ts`, `tauri-callout-layout.e2e.ts`: production drag, wrapping, commit/reopen, numeric/grip width, focus/cancel, undo/redo; decoded Canvas2D/CanvasKit export                                                                                                                                                                                                                  | passed on Linux x86_64/X11 with Chrome and external-driver real WebKitGTK; 1024 px RU/EN, both themes, 50/100/200% zoom. Windows/macOS/Wayland not run; commands and artifacts in TESTING.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-TOL-008 | `precision-tools.test.ts`, `codec.test.ts`: strict v7 payload/mode/unknown-field rejection, rectangle/freeform factories, polygon bounds/hit-test, composite-below scene descriptor and add/update/undo/redo; `precision-rendering.test.ts` and M08 Vue/browser focused suites cover the three manual modes, transient creation and bottom-toolbar settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | decoded Canvas2D/CanvasKit precision goldens and seeded Chrome interaction coverage, including locked-selection disabled/no-history/no-default-leak behavior                                                                                                                                                                                                                                                                               | in_progress; editor-core, renderer/export and focused Vue/browser evidence passed on Windows x64 (2026-08-15), including the locked/read-only precision-control repair. Real Tauri/WebView2 remains blocked on embedded WebDriver port 4445                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-TOL-009 | `precision-tools.test.ts`: strict v7 payload, rectangle/ellipse/diamond factories and exact hit geometry, normalized dim/feather values, scene descriptor and command history; `precision-rendering.test.ts` and M08 Vue/browser focused suites cover aperture pixels, transient creation and contextual settings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | decoded Canvas2D/CanvasKit precision goldens and seeded Chrome interaction coverage, including locked-selection disabled/no-history/no-default-leak behavior                                                                                                                                                                                                                                                                               | in_progress; editor-core, renderer/export and focused Vue/browser evidence passed on Windows x64 (2026-08-15), including the locked/read-only precision-control repair. Real Tauri/WebView2 evidence remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-TOL-010 | `precision-tools.test.ts`, `codec.test.ts`: strict v7 endpoints/unit/diagonal-basis/snap plus required colour/integer thickness/integer label-size fields and conservative visual bounds; deterministic length label, retained angle semantics, snapping, hit-test and one-command updates; focused renderer/Vue/browser suites cover the approved ruler visual and overlay-only guides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | decoded Canvas2D/CanvasKit ruler pixels plus seeded Chrome bottom-toolbar/guide interaction coverage, including locked-selection disabled/no-history/no-default-leak behavior                                                                                                                                                                                                                                                              | in_progress; core/codec, renderer/export and focused Vue/browser ruler evidence passed on Windows x64 (2026-08-15), including the loupe/ruler and locked/read-only control repairs. Real Tauri/WebView2 remains blocked on port 4445                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-TOL-011 | `precision-tools.test.ts`: strict v7 separate source/destination schema, bounded zoom/size/border/shadow, circle/rectangle hit geometry, composite-below scene descriptor and command history; focused renderer/Vue/browser suites cover clipped transparent sampling, flip behavior, conservative bounds, loupe-only transient auto-selection and source/lens drag that keeps the entire loupe (connector, lens and source marker) in the ordered transient scene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | decoded Canvas2D/CanvasKit lens sampling plus seeded Chrome creation/context-toolbar coverage, including locked-selection disabled/no-history/no-default-leak behavior                                                                                                                                                                                                                                                                     | in_progress; core/codec, renderer/export and focused Vue/browser evidence passed on Windows x64 (2026-08-15), including the loupe/ruler and locked/read-only control repairs. Real Tauri/WebView2 remains blocked on port 4445                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-TOL-012 | `color-picker.test.ts`: HEX/RGB/HSV/palette/suggestions; Vue/browser eyedropper tests accept only composited pixels with alpha `255`, reject alpha `0` and `128` recoverably before clipboard/recent/swatch mutation, and retain zoom/crop mapping plus transient-overlay exclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | seeded Chrome sampling interaction coverage; native clipboard readback and real WebView/GPU readback require real Tauri                                                                                                                                                                                                                                                                                                                    | in_progress; focused Vue and seeded Chrome interaction evidence covers alpha `0`/`128` rejection, alpha `255` acceptance, mapping, overlay exclusion and recoverable states. Native clipboard/readback remains blocked before the Tauri test body on port 4445                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-TOL-013 | M03 codec fixtures plus `crop-session.test.ts`: deterministic presets, canvas-bounded resize/move/nudge, reset/reopen, immutable cancel and one-command apply; renderer and Vue tests cover cropped output bounds, coordinate translation and overlay behavior; `overlay-handle-bounds.test.ts` clamps crop/selection handles inside the visible overlay bitmap on full-canvas sessions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `browser-m08-crop-precision.e2e.ts` under the `?m05=1` App harness provides seeded interaction coverage only; a clean production decoded-source mount and real Tauri/WebView remain required                                                                                                                                                                                                                                               | in_progress; editor-core, renderer/export, Vue and seeded Chrome interaction evidence passed on Windows x64 (2026-08-15). The browser harness is not production mount evidence; clean decoded-source mount remains pending and real Tauri is blocked before the test body on port 4445                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-TOL-014 | `content-tools.test.ts`: grapheme and versioned emoji asset reference round-trip; emoji renderer goldens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `browser-emoji.e2e.ts`, `tauri-emoji.e2e.ts`, `tauri-emoji-reopen.e2e.ts`: RU/EN search, keyboard grid and recent items                                                                                                                                                                                                                                                                                                                    | in_progress; Linux 6.8.0-137-generic x86_64/X11: `pnpm test` passed 134 tests (2026-08-10), covering typed portable emoji factory; Windows 2026-10-18: Noto 2D pack, picker, scene/export implemented; core/Vue/render/browser evidence in TESTING.md; Windows WebView2 emoji + reopen passed, decoded export and fixed picker geometry verified; Linux/macOS runtime pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| REQ-TOL-015 | `storage.rs`: encoded byte/dimension limits, strict static-SVG validation, immutable content blobs and error fixtures; Canvas Image-tool center/import routing; `tool-catalog.test.ts` and `content-image-import.test.ts` for reactive Image-tool availability and command-backed import; renderer/core rounded-image regressions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `image-import-suite`, `tauri-content-image-tool.e2e.ts` and local-dialog/paste real-Tauri flows                                                                                                                                                                                                                                                                                                                                            | in_progress; Linux 6.8.0-137-generic x86_64/X11: content images now expose radius, border and opacity only in the contextual toolbar; the update is command-backed, and Canvas2D/CanvasKit clip and stroke the same renderer node. Core/component/headless renderer coverage proves the new contract. Existing static SVG acceptance/executable rejection and native PNG/JPEG/WebP/SVG content-image command wiring pass. `cargo test --workspace` passed 78 and `pnpm test` passed 154 (2026-08-11). Windows 10 x64 2026-10-17: Image enablement follows a late `contentImageBridge`; import/open dialogs parent the invoking webview; focused Vue/boundary checks passed and `cargo test -p cute-screen-desktop --lib` passed 129. `tauri-content-image-tool.e2e.ts` was not launched while the dev binary was running. The same dialog then failed on Windows and Linux with "Native image staging failed"; the content-image session token is now memory-backed while the library blob stays immutable. EXIF normalization, Linux dialog runtime and a full real-dialog pass remain pending |
| REQ-TOL-016 | `capture.rs`: atomic `CreateDocumentFromImage` transaction with locked base layer/provenance; `clipboard.rs` bitmap ingress reuses it for empty-state paste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `open-image-document.e2e` and `bitmap-paste-routing.e2e` in clean-profile real Tauri                                                                                                                                                                                                                                                                                                                                                       | in_progress; Linux 6.8.0-137-generic x86_64/X11: `cargo test --workspace` passed 76 tests and `pnpm check` passed (2026-08-10); native Open Image and empty-state `Mod+V` command are wired. Real system-clipboard/clean-profile E2E remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| REQ-LIB-001 | M03 repository transaction/fault-recovery and immutable-original tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | clean profile persisted capture, Tauri `m04-clean-profile-capture`                                                                                                                                                                                                                                                                                                                                                                         | implemented; clean-profile Tauri capture creates and opens the committed document without a seeded frontend state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| REQ-LIB-002 | `M02 editor shell` filmstrip visibility test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `M02 shell` empty/active-series screenshots                                                                                                                                                                                                                                                                                                                                                                                                | implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-LIB-003 | pagination/lazy-load test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 1000-item performance E2E                                                                                                                                                                                                                                                                                                                                                                                                                  | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-004 | storage aggregation test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | library UI E2E                                                                                                                                                                                                                                                                                                                                                                                                                             | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-005 | cleanup plan/rollback tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | recoverable cleanup E2E                                                                                                                                                                                                                                                                                                                                                                                                                    | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-006 | repository rename/delete tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | confirmation/undo E2E                                                                                                                                                                                                                                                                                                                                                                                                                      | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-007 | window adapter tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | always-on-top per OS                                                                                                                                                                                                                                                                                                                                                                                                                       | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-008 | M03 SQLite migration fixtures and session-handoff tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `document-persistence.e2e` restart/reopen Tauri E2E                                                                                                                                                                                                                                                                                                                                                                                        | implemented; local Tauri restart passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-LIB-009 | `document-session.test.ts` maps unsupported last documents to a typed recoverable state; `app-startup.test.ts` proves `runEditorStartup` mounts the last document before optional font/capability IPC so `loading` cannot wait on those calls; `lib.rs` unit forbids startup prewarm of the hidden `quick-capture` WebView when Area quick-mode is unsupported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Clean-profile and last-document launch must leave `loading` without a click, Shift+Tab or other focus event. Capture and Open image remain available.                                                                                                                                                                                                                                                                                      | implemented; macOS 12.7.6 x64 last-document/empty-profile `pnpm tauri dev` smoke passed 2026-08-29 (`artifacts/macos-startup/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| REQ-OUT-001 | presentation renderer goldens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | beautify controls E2E                                                                                                                                                                                                                                                                                                                                                                                                                      | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-OUT-002 | watermark layout tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | exact/corner placement E2E                                                                                                                                                                                                                                                                                                                                                                                                                 | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-OUT-003 | encode/decode integration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | save dialog + decoded file                                                                                                                                                                                                                                                                                                                                                                                                                 | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-OUT-004 | `result-clipboard.test.ts`: scene canvas PNG is encoded once and sent as raw bytes through the native clipboard bridge; unavailable/failed encoding is surfaced. Rust `clipboard.rs` decodes the bounded PNG and writes native RGBA without JSON/base64.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | paste into an external macOS and Windows application from a real Tauri webview                                                                                                                                                                                                                                                                                                                                                             | in_progress; the editor scene canvas is the copy source so the copied bitmap contains the rendered document, not the immutable original. The regular editor no longer depends on WKWebView `navigator.clipboard`, which macOS can reject with `NotAllowedError`; external-app smoke remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-OUT-005 | stitch layout/property tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | multi-frame export E2E                                                                                                                                                                                                                                                                                                                                                                                                                     | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-OUT-006 | M03 atomic recovery-bundle writer and typed recovery-export outcomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | native Save As cancel/failure smoke                                                                                                                                                                                                                                                                                                                                                                                                        | implemented; runtime planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-OUT-007 | progress/cancel channel tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | UI progress/error E2E                                                                                                                                                                                                                                                                                                                                                                                                                      | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-OUT-008 | Binary quick-result staging, shared regular-editor/Quick native clipboard path and atomic PNG decode tests; macOS selector geometry covers both vertically stacked Retina display slices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Paste into external app, macOS multi-display Area, and native Save As cancel/failure/success smoke                                                                                                                                                                                                                                                                                                                                         | implemented; raw IPC never places image bytes in DTO, both Copy surfaces use native PNG clipboard rather than Web clipboard permission, Save As precedes materialization and the atomically written PNG is decoded again; external-app and physical multi-display runtime evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| REQ-UI-001  | semantic-token and Naive UI theme-override component tests; shell popovers with custom panels use `raw` NPopover so only one chrome layer renders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | M02 shell 1600×1000 screenshot review against `prototype-html` visual reference                                                                                                                                                                                                                                                                                                                                                            | implemented; canvas remains dominant and all chrome consumes one semantic token layer; manual reference review remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-UI-002  | live Cute Screen → Naive UI light/dark theme and locale provider component tests; browser menu-placement regression; theme/locale menu popover uses single custom chrome without Naive padding wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | system/light/dark browser and real-Tauri screenshots                                                                                                                                                                                                                                                                                                                                                                                       | implemented; one warm accent group is shared by native and library controls; real-Tauri evidence remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-UI-003  | `M02 editor shell` locale fallback/completeness test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `M02 shell` live RU/EN browser E2E                                                                                                                                                                                                                                                                                                                                                                                                         | implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-UI-004  | responsive shell and bounded-workbench browser/Tauri E2E with library overlays; `App.test.ts` docks filmstrip, `ToolRail` and zoom in `.cs-bottom-chrome` so the rail is width-bounded by the remaining center lane; `browser-shell.e2e.ts` requires `.n-config-provider` to fill `#app`, `.cs-workbench` height ≤ `#app`, and filmstrip/rail/zoom fully inside the window vertically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1600×1000, 1280×720 and 1024×700 screenshots without overflow or control collisions; 1024 px ready shell keeps filmstrip/rail/zoom inside the viewport horizontally and vertically without pairwise overlap                                                                                                                                                                                                                                | implemented; primary capture/edit/export actions remain reachable; bottom chrome is a single docked row instead of independently centered overlays; `.n-config-provider` and `.cs-editor-shell` fill `#app` with `height: 100%` so workbench cannot exceed the window; final real-Tauri evidence remains pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-UI-005  | selected tool/object/frame component regressions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | M02 shell visual/contrast review                                                                                                                                                                                                                                                                                                                                                                                                           | implemented; state has colour, position and semantic affordances                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| REQ-UI-006  | accessible-name, tooltip and native/control role component tests; `App.test.ts` compact Fit/1:1 zoom HUD keeps Zoom out, Fit, 1:1 and Zoom in as labelled buttons and has no free-form percentage input or preset combobox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | keyboard browser E2E                                                                                                                                                                                                                                                                                                                                                                                                                       | implemented; Naive UI overlays retain labels and form semantics; zoom HUD is four labelled buttons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| REQ-UI-007  | focus return, Escape/outside-close and reduced-motion component tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | keyboard-only browser and real-Tauri E2E                                                                                                                                                                                                                                                                                                                                                                                                   | in progress; Naive UI overlays are wired to the shell overlay root, with focused browser and real-Tauri evidence still pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-UI-008  | `m02-lifecycle` window config unit test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `tauri-shell.e2e` native-decoration smoke                                                                                                                                                                                                                                                                                                                                                                                                  | implemented                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| REQ-UI-009  | diagnostics redaction tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | exported bundle review                                                                                                                                                                                                                                                                                                                                                                                                                     | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-UI-010  | QuickCaptureShell exact tools/actions, full-viewport frozen-frame presentation and collision layout; Windows/X11 selecting component forbids all editor chrome, first drag preserves canvas hosts, boundary forbids native Area selector; process-start WebView prewarm, memory-owned binary transport, decoded-frame/renderer readiness and Tauri `custom-protocol` packaging remain covered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | X11 resident selecting/editing screenshots and single-XID observation; Windows single-HWND selecting/editing replay; RU/EN 1024 px and mixed-DPI real-WebView screenshots; standalone custom-protocol build and clean-check packaging.                                                                                                                                                                                                     | X11 unified selecting/editing passed locally; Windows physical frozen pixels, no-loading state, same-HWND transition and Escape passed at 125% scale; RU/EN 1024 px and cross-monitor evidence pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| REQ-UI-012  | `build-contract.test.ts` scans shipped CSS and rejects `color-mix()`, space-separated alpha `rgb()` and an unprefixed-only `backdrop-filter`; semantic premixed light/dark tokens keep all chrome backgrounds valid when blur is unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | macOS 12.7.6 x64 WKWebView screenshot of ToolRail, contextual/transient panels and quick actions in light/dark themes                                                                                                                                                                                                                                                                                                                      | implemented in CSS; focused boundary/build checks passed, real-WebView visual re-smoke pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| REQ-QLT-001 | M01 software trend; M05 real-Tauri GPU hard gate; M13 final regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | designated reference-runner report (three GPU passes)                                                                                                                                                                                                                                                                                                                                                                                      | planned; M05 remains blocked until the exact commit has three retained real-Tauri/WebKitGTK CanvasKit GPU reports with p95 ≤16.7 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| REQ-QLT-002 | M01 8K/1000 baseline; M13 hard gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | reference runner report                                                                                                                                                                                                                                                                                                                                                                                                                    | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-QLT-003 | M01 scheduler idle test; M13 editor trace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | runtime no-continuous-frame trace                                                                                                                                                                                                                                                                                                                                                                                                          | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-QLT-004 | 1000-item benchmark                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | runtime first-page trace                                                                                                                                                                                                                                                                                                                                                                                                                   | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-QLT-005 | M03 journal, every write-boundary fault, atomic-file and constrained-path tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | crash/restart recovery                                                                                                                                                                                                                                                                                                                                                                                                                     | implemented; runtime planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| REQ-REL-001 | Linux artifact/architecture checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | x64/ARM64 install smoke                                                                                                                                                                                                                                                                                                                                                                                                                    | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-REL-002 | universal binary check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | unsigned Intel/Apple launch smoke                                                                                                                                                                                                                                                                                                                                                                                                          | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-REL-003 | installer/architecture checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | unsigned Win x64/ARM64 launch smoke                                                                                                                                                                                                                                                                                                                                                                                                        | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-REL-004 | SemVer/tag/cache/error tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | manual + opt-in GitHub check                                                                                                                                                                                                                                                                                                                                                                                                               | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-REL-005 | checksum/SBOM/license CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | downloaded artifact verification                                                                                                                                                                                                                                                                                                                                                                                                           | planned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| REQ-REL-006 | release.yml; release-assets.mjs; publish-release.mjs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | strict version guard, five-platform manifest validation, publisher API flow and actionlint; hosted run pending                                                                                                                                                                                                                                                                                                                             | implemented; native release acceptance pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## X11 Area quick-preview latency follow-up (2026-08-28)

- Historical status: superseded by ADR-039. These measurements describe the
  removed native Area selector flow and are not acceptance evidence for the
  current unified Quick surface.
- Requirement: `REQ-UI-010`.
- Automatic evidence: red-first
  `area_quick_preview_uses_a_memory_owned_top_down_bmp` proves exact top-down
  32-bit BMP pixels, native memory staging, empty asset URL and no synchronous
  transport file. Full Rust tests and all configured Clippy gates pass.
- Runtime evidence: resident Ubuntu 24.04/GNOME X11 debug/Vite at 2560×1440
  measured 700 ms on the first observed mouse-up → viewable presentation and
  486 ms warm. Escape returned typed `cancelled`; a third attempt cancelled
  before presentation and is not counted as a latency result.
- Status: implemented for X11 Area. The temporary full-desktop preview no longer
  performs PNG compression or disk staging after pointer release. Repeated
  optimized-build, mixed-DPI and cross-monitor evidence remain pending.

## X11 selector-to-quick composited handoff gate (2026-08-30)

- Historical status: superseded by ADR-039. Retaining a native Area selector,
  mapping Quick beneath it and completing a reveal-time handoff are now
  explicitly forbidden. The original measurements remain useful only as the
  baseline that motivated the unified-surface decision.

## X11 command-to-selector latency gate (2026-08-30)

- Historical status: superseded by ADR-039. Command-to-first-visible latency is
  now measured against the single Quick surface, not a native Area selector.
  The still-current part of this gate is capture exclusion: already-hidden app
  windows skip a new settle interval, recently hidden surfaces wait its
  remainder, and a visible editor must be absent before root acquisition.

## X11 unified Quick selection surface gate (2026-08-30)

- Requirements: `REQ-CAP-009`, `REQ-CAP-010`, `REQ-CAP-012`, `REQ-UI-010`,
  `REQ-QLT-003`; decision: ADR-039.
- Required red-first evidence: a full-frame X11 Area draft is staged with
  pending selection and cannot commit before explicit selection confirmation.
  Mounted Vue coverage must start with no committed crop, accept the first
  pointer drag through Quick `CanvasViewport`, emit exactly one `setCrop`
  `EditorCommand`, preserve the same scene/overlay hosts and reveal annotation
  chrome only by changing `selecting → editing` state. Escape in selecting must
  cancel the temporary draft.
- Boundary evidence: X11 Area may capture/decode/import a frozen compositor
  frame but must not call the native `select_frozen_target`, retain an X11 Area
  overlay or complete such a handoff from Quick reveal/dismiss. Window target
  may continue to use native selection; Wayland remains portal-owned.
- Runtime/platform evidence: resident Ubuntu 24.04 / GNOME 46 / X11 must show
  one Quick Capture top-level XID and one pair of canvas hosts before drag,
  throughout dashed-frame motion and after editing chrome appears. No additional
  mapped app window, focus transfer, loading surface or dash replacement is
  allowed after first visibility.
- Status: implemented and runtime-validated on resident Ubuntu 24.04 / GNOME 46
  / X11 on 2026-08-30. Red-first Vue coverage failed until the first drag emitted
  exactly one `setCrop` and preserved the mounted scene canvas; a second
  component test failed until selecting stopped rendering the main editor's
  ToolRail/Zoom branch. Rust compilation/tests failed until pending selection,
  explicit confirmation and remaining compositor-settle state existed. The
  boundary test rejects `select_frozen_target` and X11 handoff calls from Area.
  A physical `300,250 → 1000,700` drag retained top-level XID `0x42000fc`,
  produced the exact 700×450 dash, added tools/actions on the same surface and
  returned typed `cancelled` on Escape. Direct xRGB32 BMP staging plus
  decode-overlapped GTK warmup measured command → focused selecting at 723 ms
  from a visible editor and 607 ms from the hidden resident dev/debug process.

## X11 selector visibility follow-up (2026-08-28)

- Historical status: the Area portion is superseded by ADR-039; the native
  selector visibility contract remains relevant only to Window target.
- Requirements: `REQ-CAP-009`, `REQ-CAP-012`.
- Automatic evidence planned before implementation: the compositor gate must
  reject the old 100 ms boundary; selector geometry must expose a complete
  camera body/top/lens; selection strokes must use a dark solid underlay below
  the white dashed foreground.
- Runtime evidence: a resident GNOME/X11 replay must keep the editor and its
  compositor fade absent for the selector lifetime, show a recognizable camera
  hint before drag and keep the in-drag frame visible over a white page.
- Status: passed on Ubuntu 24.04/GNOME 46 X11 in the resident dev/Vite
  process. Red-first Rust coverage rejects the old 100 ms settle boundary and
  proves the camera/text/stroke contracts. A warm CLI replay kept Area open for
  more than four seconds without an editor fade, rendered the opaque rounded
  hint with camera body/top/lens, and showed the dark-underlaid white dash over
  a LibreOffice white page. Evidence:
  `/tmp/cutescreen-selector-predrag-final-2026-08-28.png` and
  `/tmp/cutescreen-selector-white-page-drag-final-2026-08-28.png`. Optimized,
  mixed-DPI and cross-monitor confirmation remain platform acceptance gates.

## X11 selector SVG camera follow-up (2026-08-28)

- Historical status: superseded for Area by ADR-039. Legacy native Area
  selector helpers and their dedicated vendored asset were removed on
  2026-08-31; this section records old evidence and is not a current gate.
- Archived evidence: the former native selector used an offline 24×24 Lucide
  Camera derivative and passed an Ubuntu 24.04/GNOME 46 X11 replay. The asset
  was visually inspected in
  `/tmp/cutescreen-selector-lucide-camera-2026-08-28.png`. Both Rust feature
  configurations passed 108/108 and the complete `pnpm check` gate passed at
  that time. Current `REQ-CAP-012` evidence belongs to the Quick WebView
  component/runtime tests and has no native-camera asset contract.

## Short arrow endpoint repair gate (2026-08-22)

`REQ-TOL-001` requires a red-first editor-core scene test proving that a straight
arrow whose endpoints are closer than the nominal `solidArrow` or `triangle`
cap length scales the closed cap down to the available route without overflow.
Persisted endpoints, stroke width, selection handles, undo/redo and normal-length
cap geometry stay unchanged. Status: passed; red 1/20, focused final 27/27,
full test suite 413/413 and renderer goldens 13/13 on Windows x64.

## Hand cursor and tooltip repair gate (2026-08-22)

| Requirement                | Required red-first Vue/component evidence before implementation                                                                                                                               | Explicit boundary                                                        | Status                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `REQ-EDT-001`              | Active Hand exposes `grab` over the scene, switches to `grabbing` only for the pan gesture, and restores `grab` after pointer release/cancel.                                                 | Cursor feedback is transient UI state and never enters document history. | passed; focused red 1/26, final 26/26; full Vue 140/140 |
| `REQ-UI-006`, `REQ-UI-007` | Tool buttons retain accessible names, expose one tooltip path without duplicated custom/native surfaces, and the custom tooltip theme restores explicit readable horizontal/vertical padding. | Other popovers keep their existing zero-padding product-owned layouts.   | passed; focused red 1/4, final 4/4; full Vue 140/140    |

## Image-only scale and intrinsic resize contract gate (2026-08-22)

| Requirement                                   | Required red-first evidence before implementation                                                                                                                                                                                                                                                                                                                       | Explicit boundary                                                                                                  | Status                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-005/006/013/014`                     | Core tests normalize legacy non-image non-unit scale to `+1/+1`, preserve image scale and pure unit reflections, reject new non-image non-unit scale through add/update/duplicate commands, and prove exact undo/redo. Vue session coverage proves normalization creates neither dirty state nor history; clipboard coverage applies the same policy on internal paste. | Schema v7 and `EditorCommand` stay unchanged; normalization precedes history and does not mark the document dirty. | implemented; focused core 10/10, session/clipboard tests and full 432/432 suite passed on Windows x64; real-Tauri persisted reopen remains blocked by the local embedded-driver session configuration |
| `REQ-TOL-001/002/003/004/005/008/009/010/011` | Core geometry tests resize tool-owned bounds/points/endpoints/wrap width while preserving stroke, font and effect style. Vue tests remove generic non-image scale handles and the detached rotate handle, then prove inner resize versus outer corner rotation, synchronized Arrow transient ink/frame/toolbar, modifiers, cancel and one-command release.              | Images retain transform resize; Numbered Marker remains content-sized; group resize is not introduced.             | implemented; focused Vue 33/33, renderer 13/13 and Chrome browser 7/7 spec files passed on Windows x64, including ruler endpoint resize and text width reflow                                         |

## M08 Vue interaction contract gate (2026-08-15)

This gate defines the component/controller evidence required before the M08 Vue
implementation. Browser, real-Tauri, native clipboard and platform-runtime
acceptance remain separate and cannot be inferred from component tests.

| Requirement                             | Required red-first Vue/component evidence before implementation                                                                                                                                                                                                                                                                                                                          | Explicit boundary                                                                                                           | Status                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-002`, `REQ-EDT-003`            | Manual censor, spotlight and ruler commit exactly one `addLayer` command without changing selection; loupe commits one `addLayer` command and is selected by UI state only. Every creation keeps the active tool, and undo/redo deterministically restores the document without persisting selection.                                                                                    | Selection and active-tool state remain transient Vue state, outside the v7 document.                                        | component passed                                                                                                                                                  |
| `REQ-EDT-007`, `REQ-TOL-010`            | Configured guide shortcut reveals overlay-only snapping guides only while held; keyup and window blur clear them without pointer movement. Tests assert no guide payload enters the document or committed renderer scene.                                                                                                                                                                | Browser keyboard routing and real-webview focus recovery remain follow-up evidence.                                         | component passed                                                                                                                                                  |
| `REQ-EDT-008`, `REQ-EDT-009`            | Compact RU/EN contextual controls expose every persisted censor, spotlight, ruler and loupe setting in the bottom toolbar at 1024 px; ruler controls include colour, thickness and label font size alongside unit/snapping/angle-step semantics. `LayersPanel` exposes no tool-setting controls. Draft setting changes do not enter history before a committed creation/update boundary. | Visual 1024 px desktop/Tauri geometry remains acceptance evidence rather than a component-test claim.                       | component coverage passed, including the final 33/33 focused M08 Vue file; focused Chrome 151 browser passed 8/8 and the ruler/toolbar screenshots were inspected |
| `REQ-TOL-012`                           | Eyedropper maps viewport coordinates to image space, samples the final visible scene without transient overlay, normalizes uppercase HEX, updates recent colours only after a successful opaque sample, exposes an accessible swatch/HEX status, retains the chosen colour on recoverable clipboard failure, handles not-ready/transparent pixels, and cancels by pointer/keyboard.      | Native clipboard write and WebView/GPU readback are explicitly not covered by the Vue adapter tests.                        | component passed, including alpha `0`/`128` rejection and alpha `255` acceptance                                                                                  |
| `REQ-TOL-013`, `REQ-EDT-012/014`        | App/component logic derives first-document canvas dimensions from decoded source; crop remains canvas-based after base-layer resize/removal and across flip order. Overlay tests cover free/original/aspect presets, eight handles, move, keyboard nudge, dim/rule-of-thirds, reset/reopen, Enter single-command apply and Escape immutable cancel.                                      | The `?m05=1` browser App harness seeds a document and is interaction coverage, not a clean production decoded-source mount. | component passed; clean production mount and real-Tauri mount evidence remain pending                                                                             |
| `REQ-TOL-008/009/010/011`, `REQ-UI-006` | Pointer drafts stay transient until pointer-up; compact text-labelled controls and keyboard/focus/cancel/error/disabled states are accessible in RU and EN. Censor supports rectangle plus optional freeform, spotlight rectangle/ellipse/diamond, ruler endpoints/unit/angle snap, and loupe source/destination/shape/border/shadow settings.                                           | Automatic censor, OCR, eraser and any native backend expansion remain excluded.                                             | component passed, including locked/read-only disabled/no-history/no-default-leak and unlock single-command coverage                                               |

Observed Vue evidence is recorded in `docs/TESTING.md`. The component gate does
not close browser, real-Tauri, native clipboard, WebView/GPU readback or visual
1024 px acceptance.

## M08 locked precision controls and opaque eyedropper repair gate (2026-08-15)

This gate is recorded before the repair implementation. It narrows the remaining
confirmed review findings without changing the existing crop, loupe or ruler
renderer contracts.

`docs/milestones/` is gitignored in this checkout. Its local notes are not
promoted or force-added as evidence; the tracked records remain this file,
`docs/TESTING.md` and the named test outputs.

| Requirement                                      | Required red-first repair evidence before implementation                                                                                                                                                                                                                                                                                                                                                | Explicit boundary                                                                                                                 | Status                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-005/006/008`, `REQ-TOL-008/009/010/011` | Range, select, colour and related precision-toolbar controls expose native disabled semantics for a locked/read-only selected censor, spotlight, ruler or loupe. Pointer, keyboard and focus interaction creates no command and cannot mutate creation defaults. After unlock, one completed interaction creates exactly one `EditorCommand`; without selection the same controls update defaults only. | Settings remain only in the bottom contextual toolbar; existing loading, disabled, focus and RU/EN label semantics are preserved. | passed; Vue red 4/31 locked cases, final 32/32; seeded Chrome red 1/8 locked scenario, final 8/8                          |
| `REQ-TOL-012`, `REQ-EDT-008`                     | Eyedropper accepts sampling/copy/recent only when the composited scene pixel alpha is exactly `255`. Alpha `0` and `128` produce the existing recoverable transparent/not-ready error before clipboard, swatch or recent-colour mutation; alpha `255` succeeds. Zoom/crop coordinate mapping and transient-overlay exclusion remain covered.                                                            | No RGBA HEX and no implicit background compositing are introduced; native clipboard/WebView evidence remains a real-Tauri gate.   | passed; Vue red on alpha `128`, final alpha matrix 0/128/255 passed; seeded Chrome red 1/8 eyedropper scenario, final 8/8 |

## M08 browser and real-Tauri acceptance gate (2026-08-15)

These rows define the user-visible evidence run after the core, renderer and
Vue contracts. A row is marked passed only where its named browser or render
test reached the observable result and the artifact was inspected; browser
mocks never substitute for native clipboard or WebView evidence.

| Evidence ID            | Requirements                                   | Required observable proof                                                                                                                                                                                                                                                                                                 | Status                                                                                                                                        |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `crop-first-open`      | `REQ-EDT-012/014`, `REQ-TOL-013`               | The `?m05=1` App harness exercises presets, handles, rule-of-thirds, reset, Enter/Escape, undo and base-layer/flip ordering against a seeded document. A separate clean production decoded-source mount without `setFrameSize` or equivalent seeding is still required.                                                   | seeded browser interaction coverage only; clean production mount pending; real Tauri blocked before test body on embedded WebDriver port 4445 |
| `censor-render-suite`  | `REQ-TOL-008`, `REQ-OUT-003/006`               | The existing decoded Canvas2D/CanvasKit precision render suite passes at scales 1 and 2 and its four committed PNG artifacts are visually inspected; no duplicate golden is added for browser acceptance.                                                                                                                 | renderer passed: 13/13; four PNGs inspected                                                                                                   |
| `precision-guides`     | `REQ-EDT-007`, `REQ-TOL-010`                   | Browser hold/release and window-blur flows visibly reveal and clear overlay guides, while the document/export scene exposes no guide node.                                                                                                                                                                                | browser passed in focused M08 run: 5/5 spec scenarios                                                                                         |
| `loupe-tool`           | `REQ-EDT-002/003`, `REQ-TOL-008/009/010/011`   | Browser pointer creation proves loupe-only auto-selection, persistent active-tool semantics and no auto-selection for censor, spotlight or ruler; contextual settings remain reachable in RU/EN at desktop and 1024×700.                                                                                                  | browser/render passed; RU/EN screenshots inspected                                                                                            |
| `eyedropper-runtime`   | `REQ-TOL-012`, `REQ-EDT-008`, `REQ-UI-006/007` | A known opaque visible scene pixel is sampled at zoom/crop without transient overlay, uppercase HEX/swatch/recent/error/cancel/not-ready states are observable, alpha `0`/`128` are rejected without clipboard or colour-state mutation, and real Tauri reads the system clipboard back when the local harness can start. | seeded browser interaction coverage passed; native clipboard readback blocked before Tauri test body                                          |
| `m08-responsive-tools` | `REQ-UI-003/004/006/007`, `REQ-TOL-008…013`    | Browser screenshots at desktop and 1024×700 in RU/EN are captured and inspected for labelled contextual controls, no overflow, logical focus and recoverable cancel/error/disabled states.                                                                                                                                | browser passed; six screenshots inspected, including the ruler visual and bottom toolbar                                                      |

## M08 cropped-viewport repair contract gate (2026-08-15)

The independent review found that the committed crop was applied to renderer
pixels but not to the editor viewport coordinate system. The repair must be
proved red-first without changing ruler styling, loupe flip, locked controls,
eyedropper UI/clipboard behavior or the existing document-evidence scope.

| Requirement                      | Required repair evidence before implementation                                                                                                                                                                                                                                                                                                                            | Explicit boundary                                                                                                                                                                                      | Status                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-001/012`, `REQ-TOL-013` | Vue component tests apply a non-origin crop and prove that normal-mode intrinsic/CSS surface dimensions and Fit aspect ratio use `outputBounds`; pointer gestures translate output-local coordinates by the crop origin; selection/precision overlays and direct DOM text editing remain in canvas space; rebuilding the scene for text editing preserves `outputBounds`. | Crop edit/reset temporarily renders the full canvas with origin `(0, 0)` while leaving the committed crop unchanged.                                                                                   | passed; four focused Vue tests failed red-first, then the combined Vue/renderer repair run passed 56/56 |
| `REQ-TOL-005/008/010/012/013`    | Browser E2E applies a non-origin crop through the visible pointer/keyboard flow in the seeded `?m05=1` App harness, then performs a new precision-tool gesture and edits text through the cropped viewport. The read-only snapshot must observe the resulting canvas-space coordinates; no crop or layer state may be injected after harness startup.                     | This is seeded interaction coverage only. Clean production decoded-source mount, native clipboard and real-Tauri/WebView evidence remain separate; the known embedded-WebDriver blocker is not re-run. | passed in Chrome 151; red-first 1/6 failed, final focused spec 6/6 passed                               |
| `REQ-QLT-003`, `REQ-OUT-003`     | A live `CanvasKitRenderer` lifecycle test, rather than only the headless export helper, drives full→non-origin crop→full scenes and checks scene/overlay backing sizes, CSS-visible output size, rendered destination bounds, surface/context disposal and preservation of registered image/font resources across surface recreation.                                     | The test exercises renderer lifecycle/resource ownership; it does not claim a real GPU/WebView platform runtime.                                                                                       | passed; one live lifecycle test failed red-first, then focused renderer/core coverage passed 82/82      |

## M08 loupe/ruler transform and bounds repair contract gate (2026-08-15)

The independent review found three gaps between the existing M08 claims and
the implemented contracts. This repair is required to preserve the approved
ruler visual, separate loupe source/destination geometry and composite-below
ordering while adding the missing transform and conservative-bounds behavior.

Historical note: the generic ruler-scale portions of this gate were superseded
by ADR-035 on 2026-08-22. Current UI behavior uses factual start/end endpoint
handles and unit transform scale; the older rows remain only as evidence for
codec compatibility and conservative derived bounds.

| Requirement                      | Required red-first repair evidence before implementation                                                                                                                                                                                                                                                                                                                                                                                          | Explicit boundary                                                                                                                                                                            | Status                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `REQ-EDT-014`, `REQ-TOL-011`     | Core command tests flip a loupe source region in the same horizontal/vertical `flipCanvas` history entry as its destination transform, crop and other layers, with deterministic both-axis undo/redo. Strict-v7 factory/codec tests accept finite positive-size source rectangles that partially cross the canvas, enforce bounded anti-DoS coordinates/area and reject non-finite, zero/negative or wholly disjoint sources.                     | Source and destination remain separate; flip does not mutate loupe size, zoom, lens geometry, sampling order or immutable source provenance.                                                 | passed; command/core red-first runs failed 2/8 and 2/26, then focused and full core coverage passed                                        |
| `REQ-TOL-011`, `REQ-OUT-003`     | Canvas2D and CanvasKit semantic/pixel tests cover circle and rectangle lenses at scales 1 and 2. Each backend must initialize the complete lens sample to transparent black, copy only the source/canvas intersection from the frozen composite-below image, and prove that out-of-canvas lens pixels never reveal old destination content in preview or export.                                                                                  | No self-recursion or sampling of later layers; existing crop/export output translation remains unchanged.                                                                                    | passed; renderer red-first run failed 12/26, final focused renderer passed 26/26 and render harness 13/13                                  |
| `REQ-TOL-010`, `REQ-EDT-005/006` | A shared editor-core ruler rebase helper computes conservative local visual bounds for line, endpoint ticks and the approved length badge after creation, persisted style updates, factual endpoint changes, rotation or canvas reflection. Historical strong/non-uniform scale fixtures remain codec/bounds compatibility tests only. Canvas2D/CanvasKit derive badge orientation from world endpoints so text is never upside down or mirrored. | Line/ticks retain rotation/reflection semantics; endpoint resize keeps unit scale and the approved colour, thickness, font size, badge layout and endpoint semantics.                        | superseded generic-scale portion retained as legacy evidence; current intrinsic endpoint core/Vue/browser coverage passed on 2026-08-22    |
| `REQ-TOL-011`, `REQ-OUT-003`     | Red-first Canvas2D/CanvasKit pixel tests prove that the persisted loupe renders a border-coloured callout connector to the source centre in preview and export without entering its own composite-below sample. A Vue overlay test proves that only a selected loupe shows the source marker and zoom/size chips.                                                                                                                                 | Connector geometry is derived from the existing source/destination model; no schema field is added. Source marker and chips are transient, non-interactive and excluded from export/history. | passed; red-first 8 renderer + 1 Vue failures, final focused 68/68, render 13/13, full test 396/396 and `pnpm check` passed on Windows x64 |

## M08 generic ruler transform repair contract gate (2026-08-15, superseded)

This historical gate was recorded before its tests and production changes. Its
generic non-image scale behavior was superseded by ADR-035; it is retained as
evidence for legacy decoding and conservative bounds, not as a current UI
requirement. Current ruler resize moves factual endpoints with unit scale.

| Requirement                      | Required red-first repair evidence before implementation                                                                                                                                                                                                                                                                                                              | Explicit boundary                                                                                                                                                                    | Status                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-TOL-010`, `REQ-EDT-005/006` | Historical tests drove strong scale-down and non-uniform legacy transforms to prove conservative selection/broad-phase bounds and strict-v7 rejection of undercovered derived ruler geometry. ADR-035 replaces the UI path with factual endpoint resize; current tests additionally prove a fixed opposite endpoint, unit scale, unchanged style and exact undo/redo. | The approved `#E3488F` default, endpoint ticks without dots and length-only upright badge remain unchanged. Legacy scale fixtures do not authorize new generic ruler scale commands. | superseded by ADR-035; retained legacy-bound evidence passed, and current focused core/Vue plus Chrome 151 intrinsic endpoint coverage passed on 2026-08-22 |

## M08 precision-tool core contract gate (2026-08-15)

These rows narrowed the editor-core boundary before implementation. Renderer,
Vue, browser and Tauri evidence remain separate follow-up work and cannot be
inferred from the completed core pass.

| Requirement   | Required editor-core evidence before implementation                                                                                                                                                                                                                                                                                                                                                 | Out-of-scope evidence in this slice                  | Status                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `REQ-TOL-008` | Red-first strict-v7 codec, immutable factory, rectangle/freeform region bounds and hit testing, composite-below scene descriptor, and add/update/undo/redo tests. Exactly `pixelate`, `blur` and `solid` modes are allowed; OCR, automatic detection and eraser data are rejected.                                                                                                                  | Renderer goldens and manual-censor browser flow      | core passed                                                                           |
| `REQ-TOL-009` | Red-first strict-v7 codec, immutable factory, rectangle/ellipse/diamond geometry and hit testing, normalized dim colour/opacity and optional feather preset, scene descriptor and command-history tests.                                                                                                                                                                                            | Renderer goldens and spotlight toolbar/browser       | core passed                                                                           |
| `REQ-TOL-010` | Red-first strict-v7 codec, immutable factory and create/update/undo/redo coverage for endpoints, unit, angle-step, pink-crimson default colour, bounded integer thickness and label font size; deterministic integer `NNN px` or percent-unit on-canvas length, separately retained angle semantics, angle snapping, transient guide exclusion, ruler stroke/tick hit testing and scene descriptor. | Ruler/guides browser interaction and renderer pixels | core extension passed; focused core+codec 34/34 after the expected red-first failures |
| `REQ-TOL-011` | Red-first strict-v7 codec, immutable factory, separate source region/destination lens geometry, bounded zoom/size/border/shadow, composite-below non-recursive scene descriptor, circle/rectangle hit testing and command-history tests; selection remains outside the document/factory.                                                                                                            | Renderer lens sampling and auto-selection UI         | core passed                                                                           |

## M08 renderer/export contract gate (2026-08-15)

These rows define the renderer evidence required before the M08 Canvas2D and
CanvasKit implementation. They do not claim browser, Tauri, GPU, clipboard or
platform-runtime acceptance.

| Requirement   | Required red-first renderer/export evidence before implementation                                                                                                                                                                                                                                                                                                                                                                                                                               | Explicit boundary                                                                                                                   | Status                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `REQ-TOL-008` | Decoded-pixel tests for exact solid fill, deterministic image-space pixel blocks and toleranced blur at multiple export scales; a different lower and higher layer must prove that all three modes sample only the already-composited layers below the censor.                                                                                                                                                                                                                                  | Blur may use backend-specific filtering within a documented tolerance; automatic censor and eraser remain excluded.                 | renderer passed                                                                                             |
| `REQ-TOL-009` | Decoded-pixel and golden tests for rectangle, ellipse and diamond apertures, configured dim colour/opacity and optional feather; preview and scaled export must preserve aperture geometry and representative pixels.                                                                                                                                                                                                                                                                           | Spotlight affects the composite below it at its z-position; transient selection/guide overlays are never part of committed output.  | renderer passed                                                                                             |
| `REQ-TOL-010` | Red-first Canvas2D/CanvasKit semantic and pixel tests at scales 1/2 for horizontal and angled rulers: persisted colour/thickness, short perpendicular endpoint ticks without round endpoint dots, and a centered rounded badge rotated along the line while its text stays upright. The badge overlaps the line, uses an automatic light/dark contrast surface with a thin ruler-colour border, and displays only integer `NNN px` or the percent-unit length; angle remains outside the badge. | Temporary snapping guides remain overlay-only and are not rendered by the committed scene or export.                                | renderer extension passed 12/12; render harness 13/13 and all four scale/backend goldens visually inspected |
| `REQ-TOL-011` | Decoded-pixel and golden tests for circle/rectangle lenses, zoom, clipping, border and shadow; distinct lower/higher content must prove a frozen composite-below sample, no self-recursion and stable transparent-black sampling for source pixels outside canvas.                                                                                                                                                                                                                              | Loupe samples only nodes below its own ordered scene position and never recursively includes itself or later nodes.                 | renderer passed                                                                                             |
| `REQ-TOL-013` | Decoded export PNG tests must prove crop-controlled dimensions, representative translated pixels and a deterministic effect crossing the crop edge without changing source or layer coordinates; committed render/export must omit crop, guide and selection overlays.                                                                                                                                                                                                                          | Crop is a viewport/export clip in canvas coordinates, not a document/source/layer coordinate mutation.                              | renderer passed                                                                                             |
| `REQ-OUT-003` | Export PNG is decoded, its cropped/scaled dimensions and representative pixels are asserted, and Canvas2D preview/export plus CanvasKit semantic parity are compared at documented tolerances.                                                                                                                                                                                                                                                                                                  | This slice proves renderer-produced PNG only; native Save As, JPEG/WebP encoding and real webview/runtime evidence remain separate. | renderer passed                                                                                             |
| `REQ-OUT-005` | The shared cropped render-surface contract must expose stable bounds that stitch can consume without baking transient overlays or mutating frame coordinates.                                                                                                                                                                                                                                                                                                                                   | Full multi-frame stitch layout and native export orchestration remain outside this renderer slice.                                  | renderer passed                                                                                             |
| `REQ-OUT-006` | Renderer tests must prove that export operates on a derived surface and leaves the immutable source reference, document crop and ordered layer payloads unchanged.                                                                                                                                                                                                                                                                                                                              | Atomic native file replacement is already a separate Rust boundary and is not re-claimed by renderer tests.                         | renderer passed                                                                                             |

## M08 renderer/export evidence (2026-08-15)

Windows 10 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. Red-first runs
failed as intended: the focused renderer suite could not resolve the new
precision module, two core crop-bound tests observed a missing `outputBounds`,
and the render harness reported the four absent precision PNG baselines.

The completed renderer evidence decodes PNG bytes and asserts cropped/scaled
dimensions, representative pixels, immutable document/source/layer data,
image-space pixel blocks across scales, exact solid censor colour, a toleranced
blur, spotlight aperture/dim/feather, ruler strokes/ticks plus the length-only
badge, and a clipped loupe with border/shadow. Distinct lower and higher colours prove
that censor and loupe freeze only the composite below their ordered node; a
partly out-of-canvas loupe source uses transparent-black source pixels, and
transient overlays are absent from export.

The four intentional precision goldens cover Canvas2D and CanvasKit at export
scales 1 and 2. Exact PNG baselines are retained per backend. Cross-backend
semantic comparison ignores per-channel deltas up to 24 and requires fewer than
9% of channels beyond that threshold, because Canvas2D uses a deterministic box
blur while CanvasKit uses its Gaussian image filter and their ruler glyph edges
are independently antialiased. Solid censor pixels remain exact on both
backends. Final command counts are recorded in `docs/TESTING.md`.

This is headless renderer/export evidence only. It does not claim Vue tool
lifecycle, loupe auto-selection, browser/Tauri/WebView or GPU runtime, native
Save As, JPEG/WebP encoding, clipboard, or complete stitch orchestration.

## Text editing projection repair evidence (2026-08-15)

- `REQ-TOL-005`: component regression must prove that entering direct edit for
  an existing Text layer removes that persisted layer from the scene while the
  transient `contenteditable` projection is visible, then restores it on cancel
  without a document command. Red-first regression now passes in the focused
  Vue slice and the full 267-test workspace suite.
- `REQ-TOL-005`: browser acceptance must compare the editing projection and the
  committed canvas ink at the same zoom and prove a stable top edge within one
  canvas pixel. During inline edit the floating text toolbar is visible above
  the editor and absent from the bottom contextual toolbar. Chrome 151/Windows
  10 browser acceptance passes 5/5, including pixel readback and the
  scene-without-persisted-text check. Updated Canvas2D and CanvasKit goldens
  pass 11/11 and were decoded and visually inspected. Real Tauri/WebView2
  evidence remains pending.

## Arrow integration evidence (2026-08-13)

| Level     | Command / test ID                                                           | Environment                                 | Result                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated | `pnpm test`; `pnpm test:render`; `cargo test --workspace`                   | Windows 10 22H2 build 19045, x86_64         | 206/206; 9/9 including six decoded/visually reviewed arrow PNG; 77 passed and one interactive Windows desktop test ignored                                                              |
| Browser   | `pnpm test:e2e:browser`; `browser-m06-drawing-tools.e2e.ts`                 | Chrome 151.0.7922.109, Windows x64          | 5/5 specs, 27 scenarios; five controls fit at 1600×1000, 1280×720, 1024×700 for RU/EN × light/dark; active tool, no auto-selection, elbow drag and undo/redo pass                       |
| Tauri     | `pnpm test:e2e:tauri`; `tauri-arrow.e2e.ts`; M03 document write/reopen pair | Windows x64, WebView2 runtime 151.0.4129.78 | Unavailable: test binary built, but embedded WebDriver did not listen on port 4445 within 60 seconds in any scenario. Test bodies did not run; no WebView2 arrow or native reopen claim |

## Arrow repair evidence (2026-08-14)

| Level     | Command / test ID                                                                                        | Environment                        | Result                                                                                                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automated | focused core/Vue Vitest; `pnpm test`; `pnpm typecheck`; `pnpm lint`; scoped Prettier; `git diff --check` | Windows 10 22H2 build 19045, AMD64 | High repairs: 77/77 focused and initial 220/220 full tests. Final combined focused suite: 114/114; repeated full suite: 221/221. Typecheck/production Vue build, full ESLint and scoped formatting passed. Covers selected legacy toolbar values, one-command rebasing/hit/undo/reopen and corrupt v1/v2 autosave. |
| Renderer  | semantic curved start-cap scene regression; `pnpm test:render`                                           | Windows 10 22H2 build 19045, AMD64 | User-reported quadratic left filled-cap seam and asymmetry were reproduced red-first, then 10/10 render-harness tests passed. New Canvas2D/CanvasKit yellow-arrow goldens were visually inspected; the cap uses the shared trim join, is symmetric, and backend parity remains within the documented tolerance.    |
| Runtime   | browser/Tauri suites                                                                                     | Not rerun                          | No new browser, WebView2 or native persisted-reopen claim.                                                                                                                                                                                                                                                         |

## Numbered marker pointer anchoring repair evidence (2026-08-15)

| Level       | Command / test ID                                                                                            | Environment                        | Result                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core + Vue  | `pnpm exec vitest run packages/editor-core/src/content-tools.test.ts tests/unit/vue/canvas-viewport.test.ts` | Windows 10 22H2 build 19045, AMD64 | Red-first regressions reproduced a +16 px offset on both axes. After the repair, 32/32 tests pass and a click at `(30, 40)` is the visual centre of the new 32 × 32 marker.                                                           |
| Full unit   | `pnpm test`                                                                                                  | Windows 10 22H2 build 19045, AMD64 | 40/40 files and 267/267 tests pass.                                                                                                                                                                                                   |
| Static gate | `pnpm check`                                                                                                 | Windows 10 22H2 build 19045, AMD64 | The changed files pass focused ESLint and Prettier checks. The repository gate reaches test typecheck, then remains blocked by pre-existing `RenderSceneSnapshot` and implicit-`any` errors in `rich-text-editing-component.test.ts`. |

## Numbered marker alignment repair evidence (2026-08-14)

| Level          | Command / test ID                                                                                                            | Environment                                                         | Result                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated      | red-first focused core/renderer Vitest; `pnpm test`; `pnpm test:render`; `pnpm typecheck`; `pnpm lint`; docs/boundary checks | Windows 10 Home 22H2 build 19045, AMD64; Node 22.23.1; pnpm 10.33.2 | Before the repair the Canvas2D digit ink center was 10.5 for a 32 px target. After measured baseline alignment the focused suite passes 39/39, the full suite 223/223, render harness 10/10, boundary suite 7/7, and typecheck/lint/docs checks pass. Full `pnpm check` stops only at 18 pre-existing repository-wide Prettier findings. |
| Browser visual | local Vite E2E harness and `numbered-marker-visual-center.png`                                                               | Codex in-app Chromium browser, Windows x64, 453% canvas zoom        | Pixel inspection gives circle center 426.5 px and digit center 424 px: -2.5 screen px, or -0.55 canvas px. The full numbered marker is visually centered; the scene contract selects the audited bundled Roboto family.                                                                                                                  |
| WebView2       | runtime inventory                                                                                                            | Installed Evergreen WebView2 151.0.4129.78                          | The current runtime supports the Chromium Canvas text-metrics contract used by the repair. The real Tauri/WebView2 suite was not rerun; the aggregate browser E2E command timed out after 184 seconds before reporting a spec result, so neither command is claimed as completed runtime evidence.                                       |

## Document v7 integration evidence (2026-08-14)

| Level          | Command / test ID                                                                                                  | Environment                                                    | Result                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/component | focused `canvas-viewport.test.ts` + `rich-text-editing-component.test.ts`; `pnpm.cmd test`                         | Windows 10 22H2 build 19045, AMD64; Node 22.23.1; pnpm 10.33.2 | Correction regression reproduced 8 commit-on-blur failures; after retaining only actual toolbar pointer interactions, focused 32/32 and full 263/263 pass.                                                     |
| Browser        | process-local `CHROMEDRIVER_PATH=…151.0.7922.109…`; `pnpm.cmd test:e2e:browser`                                    | Chrome 151.0.7922.138, Windows x64                             | 6/6 specs; v7 spec 4/4. Driver override recovers an incomplete external cache and is not a production requirement.                                                                                             |
| Browser visual | local Vite E2E build, in-app Chromium browser                                                                      | Windows x64; 1024×700 and 640×700                              | Actual screenshots inspected. 32 px control row, approved order, no horizontal scroll, accessible narrow overflow; escaped color label defect fixed and rechecked. No repository screenshot artifact retained. |
| Real Tauri     | `pnpm.cmd test:e2e:tauri`                                                                                          | WebView2 151.0.4129.78, Windows x64                            | Infrastructure-blocked before test bodies: missing local matching `msedgedriver`; service attempted a prohibited download, port 4445 stayed closed and no new JUnit was produced.                              |
| Stable matrix  | `pnpm.cmd check`; `test:render`; `test:perf`; `cargo test --workspace`; `pnpm.cmd tauri build`; `git diff --check` | Windows 10 22H2 build 19045, AMD64                             | Passed: aggregate quality gate; renderer 11/11; performance 4/4; Rust 77 passed/1 interactive ignored; release executable produced; whitespace check exit 0.                                                   |

## M07 interim evidence

| Requirement   | Test ID                                                                                                                                                 | Level                       | Platform                                                                      | Action                                                                                                           | Actual                                                                                                                                                                                                                                              | Date       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `REQ-TOL-015` | `storage::tests::content_image_import_reports_dimensions_after_exif_orientation_once`; `browser-m06-drawing-tools.e2e.ts`; `tauri-renderer-exif.e2e.ts` | Rust unit + browser + Tauri | Linux 6.8.0-137-generic x86_64/X11; Chrome 150.0.7871.186; WebKitGTK 605.1.15 | Import/decode a valid immutable 3×2 JPEG carrying EXIF Rotate90; decode the scoped EXIF asset in a real webview. | Native inspection accepts the bytes and publishes 2×3 display dimensions; Chrome `Image.decode()` returns the same 2×3 dimensions; real WebKitGTK EXIF transport passes. The raw JPEG is not modified. Real native-dialog evidence remains pending. | 2026-08-11 |

## Evidence record template

| Field       | Value                                                |
| ----------- | ---------------------------------------------------- |
| Requirement | `REQ-...`                                            |
| Test ID     | stable test/spec name                                |
| Level       | unit / component / render / browser / Tauri / system |
| Platform    | OS, version, architecture, desktop session           |
| Artifact    | commit/bundle SHA                                    |
| Fixture     | fixture ID + SHA-256                                 |
| Action      | exact user action or command                         |
| Expected    | observable result                                    |
| Actual      | observable result                                    |
| Evidence    | CI URL, log, screenshot or report                    |
| Date        | ISO date                                             |

## Browser E2E cropped-viewport stability gate (2026-08-17)

| Requirements                                         | Required browser evidence                                                                                                                                                                                                                                                                         | Boundary                                                                                                                                                                                                                                                           | Status                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-001/005/007/012`, `REQ-TOL-001/008/010/013` | M05 layout assertions use the committed crop output dimensions; M05 guide assertions wait for the next observable overlay frame; M06 elbow-handle targeting and M08 precision gestures map integer WebDriver viewport coordinates through the visible output bounds, including a non-origin crop. | The browser driver may quantize viewport coordinates to integer CSS pixels. Assertions compare document state with the canvas-space point actually delivered by that driver; they do not widen editor-core geometry tolerances or seed document state after mount. | passed on Windows x64 / Chrome 151: focused M05 7/7, M06 9/9, M08 8/8; aggregate browser suite 7/7 spec files. Linux CI rerun remains pending |

## Eyedropper live-loupe contract gate (2026-08-22)

| Requirement   | Required red-first evidence before implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Explicit boundary                                                                                                                                                                                                                                                                                               | Status                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REQ-TOL-012` | Vue and seeded-browser tests activate a pointer-transparent floating loupe at the visible canvas centre, then prove that pointer movement and keyboard nudging update a 9×9 pixelated scene preview, highlighted centre pixel, opaque live swatch and uppercase HEX before confirmation. While sampling, the scene canvas exposes the dedicated eyedropper cursor; preview reads are frame-coalesced, preserve zoom/crop mapping, exclude the transient overlay, and flip/clamp the card inside the viewport. | Live preview and its cursor are transient UI only: they cannot write clipboard/recent colours, emit a colour selection or create document history before click/Enter. Alpha below `255`, loading and readback failures remain recoverable; persisted loupe, renderer/export and document schemas do not change. | passed; red-first Vue cursor assertion failed 1/36, then final focused suite passed 36/36. Existing Chrome M08 8/8 validates the sampling flow; the CSS cursor itself is a browser visual concern. Real-Tauri remains infrastructure-blocked before WebView test bodies. |

## macOS Area/Window routing gate

| Requirements                          | Required contract evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Required runtime evidence                                                                                                                                                                                                                                                                                                                                          | Status                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-CAP-001/003/008/009/012/013/014` | Native AppKit selector contract; macOS 12.0 availability checks; CoreGraphics fallback routing for 12.0–12.2; ScreenCaptureKit routing to `SCStream` on 12.3–13 and `SCScreenshotManager` plus the system window picker on 14+; frozen multi-display Area quick draft; direct Window document creation; selector window frame equals each `NSScreen.frame`; frozen preview fills that frame via AppKit `NSImage` without a CTM flip; flipped-view top-left maps to the top-left of the frozen image. | Real macOS 12.0–12.2, 12.3–13 and 14+ smokes on Intel/Apple Silicon: permission grant/deny, cancel, Retina and mixed-scale multi-display bounds, decoded pixels, selector exclusion, Area quick-mode cleanup/materialization and Window direct document mount. Overlay orientation/fill must be re-smoked on the owner Intel laptop after the preview-draw repair. | implemented in code (2026-08-29): `macos_capture_pixel_backend` / `macos_window_picker_kind` units, AppKit selector + Area full-frame/Window crop contracts, capability advertisement and `pnpm smoke:m04:macos:{screen,area,window}`. Selector fill/orientation contracts are in `macos_platform.rs`. Runtime grant/deny, decoded-pixel and mixed-scale evidence remain pending. |

## Quick capture → editor first-frame readiness gate (2026-08-29)

For `REQ-CAP-010` and `REQ-QLT-003`, a red-first frontend lifecycle test requires
quick-capture mount acknowledgement to remain pending after document decode and
mount, resolving only after the editor renderer reports its first completed
frame. Timeout and render failure remain distinguishable from success. This
gates presentation of the already-resident main WebView; it does not claim GPU
backend startup, native capture latency or platform support. Status:
implemented; the focused test passed after the expected red-first failure.

## macOS selector coverage and composited quick-presentation gate (2026-08-29)

For `REQ-CAP-001/008/010/012/013` and `REQ-QLT-003`, native contract tests must
prove that the borderless selector refuses AppKit's menu-bar-constrained window
frame and retains the complete `NSScreen.frame`. A frontend lifecycle test must
also prove a two-phase quick-window presentation: map the real WKWebView while
transparent and pointer-inert, wait for two equal complete layout frames, then
reveal and focus it. Missing stable geometry must remain a visible failure and
must never reveal an intermediate compositor surface. Runtime verification on
the owner macOS 12 machine remains required. Status: implemented in code;
focused frontend and native Objective-C bridge tests passed after the expected
red-first failures.

The first restarted visual smoke showed a separate quick-window defect: after
the native selector closed, Tauri positioned the frameless WKWebView against
macOS `visibleFrame`, leaving the live menu bar exposed. The quick window must
instead use the pointer monitor's complete `NSScreen.frame` and a level above
the menu bar before its transparent mapped warmup begins.

The notification plugin injects a permission-state probe into every WebView,
including quick-capture. Its capability grants only
`notification:allow-is-permission-granted`; notification sending, permission
requests and the broad notification default remain unavailable to the capture
window. The capability boundary test enforces this least-privilege contract.

Retina quick-frame overlay evidence must derive its inverse drawing scale from
the canvas's actual CSS rect versus backing dimensions, not only from the
possibly stale fit-zoom store value. Focused tests cover a 2× mismatch and the
runtime overlay is redrawn after fit zoom so handles remain 8 CSS px and the
dimension badge remains 28 CSS px high.

## Quick Capture chrome и MIT-иконки (2026-10-15)

| Требование    | Планируемое доказательство                                                                                                                                                                                                                                                                             | Статус                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-EDT-008` | Vue: Quick Capture без общих действий холста и пустой панели; настройки аннотаций сохраняются. Tabler Icons за typed `UiIcon`, отдельные Text/Callout/Numbered Marker; boundary gate для TS/Vue, accessibility и runtime SVG assertions; MIT dependency audit. Browser screenshots и real-Tauri smoke. | implemented; Vue/boundary/license passed; WebKitGTK quick-chrome 3/3 + clean-profile mount 1/1; full browser failures and physical smoke limits in TESTING.md |
| `REQ-EDT-014` | Vue: оба flip доступны только в полном editor, click → undo → redo сохраняют командный контракт. Quick Capture не показывает flip при select, arrow или снятии selection. Existing core/renderer flip coverage сохраняется.                                                                            | implemented; both-axis Vue history passed; native gesture/export gates remain in A15                                                                          |

## Quick Capture: резкость рамки и размера (2026-10-15)

| Требование        | Доказательство до реализации                                                                                                                                                                                                                                                                                                                                           | Статус                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-CAP-012/013` | Regression: 400×300 preview растянут до 1440×1080 CSS px; пунктир/handles/badge должны растеризоваться в display resolution × DPR и сохранять CSS размеры. Vue controller/pixel tests при zoom >1, <1 и DPR 1/2; real-WebKitGTK screenshot сравнивается с приложенным blurred кадром. Scene pixels, crop commands, hit coordinates и export остаются в document space. | implemented; pixel/controller regressions 14/14, full unit 522/522, check passed; real WebKitGTK 3/3 and before/after screenshots in TESTING.md |

## Loupe icon B1 · 2026-10-16

`REQ-EDT-008`, `REQ-TOL-011`: adopt the user-selected B1 metaphor: a segmented
source-region frame with a circular magnifier and handle. Keep the `loupe`
semantic name, accessible labels and tool behaviour. Use one canonical geometry
for shell and gallery. Validate existing SVG contracts, 16/18/20/24/32 px at
DPR 1/2 in both themes, disabled/active/focus, RU/EN, and native Quick → Editor.
Evidence: `artifacts/custom-icons/loupe-adopted/`. SVG 70/70 and browser 2/2
passed on Windows/Chrome 155; both native attempts stop before loupe selection
on pencil stroke creation in Quick. Native handoff remains pending; TESTING.md
records the commands and screenshots.

## Spotlight icon concepts · 2026-10-16

`REQ-EDT-008`, `REQ-TOL-009`: compare three dev-only icon proposals (hand torch,
clear window in a dimmed area, light cone) at 18 px beside Tabler in both themes.
The existing production `spotlight` mapping remains in use pending visual selection.
Evidence: `artifacts/custom-icons/spotlight-proposals/`.

Refinement from the user's sketch: a clear horizontal rectangle with diagonal
hatching around it; compare sparse, balanced and dense hatching in the dev gallery
at 18 px in both themes. Evidence: `artifacts/custom-icons/spotlight-hatching/`.

The first hatch refinement was rejected: disconnected accents did not form a
uniform background. The next dev comparison uses one continuous 45-degree lattice
with constant spacing, with either a clear window or uninterrupted lines.
Evidence: `artifacts/custom-icons/spotlight-uniform/`.

User selected the clear-window concept and requested a second version with hatch
lines meeting its outline. Compare the original clearance against zero clearance;
both retain the same angle and spacing. Evidence: `artifacts/custom-icons/spotlight-joined/`.

Approved adoption: `spotlight` now uses the joined hatch/window geometry through
the existing `UiIcon` mapping. Validate the complete SVG catalog, production
tool selection/disabled states in RU/EN and both themes, and native Quick→Editor.
Evidence: `artifacts/custom-icons/spotlight-adopted/` and adjacent command logs.
Passed on Windows: SVG catalog 70/70, browser 2/2, WebView2 custom-icons 1/1,
full test 709/709, format, format:check and check. WebKit remains unverified.

## Censor icon concepts · 2026-10-16

`REQ-EDT-008`, `REQ-TOL-008`: dev-only comparison of pixel mosaic (user reference),
redaction bar and blurred fragment. Review at 18 px beside the adopted spotlight
and Tabler in both themes. Keep production `privacy` mapping until selection.
Evidence: `artifacts/custom-icons/censor-proposals/`.

The first three proposals were rejected as effects without a clear concealment
meaning; current privacy/censor also resembles spotlight. Compare three new
dev-only metaphors: crossed eye, redacted document and locked data. Include the
current censor and adopted spotlight at 18 px for direct comparison.
Evidence: `artifacts/custom-icons/censor-concealment/`.

Next dev-only round: six concepts for confidential data/password concealment,
using the user's eye/lock, masked symbols, stop-field and document/eye references.
Compare at 18 px, both themes and DPR 1/2; production privacy stays unchanged.
Evidence: `artifacts/custom-icons/censor-secrets/`.

Approved selection after screenshot-editor research: a coherent monochrome
checkerboard replaces `privacy` behind UiIcon. The original 4×4 vector grid
represents general censoring, not passwords or access control. Validate full SVG
catalog, 18 px beside spotlight, RU/EN × light/dark, disabled/focus and native
Capture → Quick → Editor. Evidence: `artifacts/custom-icons/censor-adopted/`.
User refinement: preserve the checkerboard but add inherited-currentColor
halftones through per-cell fill-opacity. Validate finite opacity in (0, 1],
both themes and disabled opacity; the root SVG contract is unchanged.
The initial three-tone version lacked contrast at toolbar size. Final refinement:
coarser 3×3 checkerboard, full-opacity dark cells and 15% light cells, with grid
edges aligned to whole device pixels at the actual 18 CSS px size (DPR 1/2).

## Различимые кисти (2026-10-16)

`REQ-TOL-003`, `REQ-EDT-002/005/006/015`, `REQ-OUT-003`: implemented; core/renderer/Vue и focused browser/native passed.
Red-first core contracts: точное перо, RMS коррекции, pressure/simulated outline,
legacy codec, bounds/hit testing; затем decoded renderer parity, mounted Vue,
production Quick → Editor pointer flows и 4K/8K 12 000 samples. Фактические
команды и ограничения будут записаны в TESTING.md.

Новые проверки кистей: `brushes.test.ts` (core и mounted Vue),
`golden-brushes.test.ts`, `browser-brushes.e2e.ts`, `tauri-brushes.e2e.ts` и
`tauri-brushes-reopen.e2e.ts`. Существующая large fixture проверяет один render
node для 12 000 samples. Общие проверки и сторонние текущие failures — TESTING.md.

## Censor toolbar UX · 2026-10-16

`REQ-TOL-008`, `REQ-EDT-008/015/016/017`, `REQ-UI-006`: replace clipped
region/effect selects and the permanently expanded slider with a shared compact
censor toolbar. Three labelled effect thumbnails remain visible; region and
effect-specific settings open anchored menus. Pixelate presets 6/12/24 and blur
presets 4/12/24 supplement exact numeric input. Defaults, configure, selection,
mixed values, locking, draft cancellation and atomic undo/redo retain the existing
command pipeline. Document v7, renderer, IPC and initial defaults are unchanged.

Evidence: focused Vue 20/20, followed by final preset Enter/focus regressions
8/8; full unit suite 802/802 and decoded render harness 24/24. Final browser
5/5 covers RU/EN × light/dark × DPR 1/2 at 1024×700 and 1440×900, plus actual
creation/settings/cancel/undo/redo/configure. Existing M08 browser 2/2.
WebKitGTK production Quick → Editor menus/Select: 1/1 with embedded DOM input;
physical pointer gestures and Windows/macOS remain unverified by this run.
Screenshots and logs: `artifacts/censor-toolbar/`; commands in TESTING.md.

## Callout sizing and outside placement (REQ-TOL-007, REQ-TOL-005)

Implemented: red-first core regressions cover left/right/equal-X placement,
padded gap, measured bounds, width resize and stable endpoint world coordinates.
Vue/browser/Tauri regressions cover production drag creation, inline/commit/reopen
parity, manual width, cancellation, undo/redo and decoded export. Browser coverage also
includes mixed font sizes and 1024 px × RU/EN × light/dark × 50/100/200% zoom.
Linux/X11 real WebKitGTK editing passed with the external driver; embedded pointer
input did not create a draft. Commands and artifacts are recorded in TESTING.md.
Existing v7 autoSize content is measured without changing its wrap mode on open.

## Номерная метка: специализированный UX (2026-10-17, ADR-066)

REQ-TOL-006 / REQ-EDT-002/006/008/015/016/017: запись добавлена до реализации.
План: отдельная панель номера/формы/размера/двух цветов; max(sequence)+1,
одноразовый ручной номер с предупреждением о совпадении; измеряемая оболочка,
единая геометрия preview/inline/commit/export и полупрозрачный canvas preview.
Схема v7 и IPC сохраняются. Доказательства: red-first core, Vue, decoded render,
browser и real Tauri production flows; фактический статус — TESTING.md.

REQ-TOL-006 / ADR-067: preview заменяет крест, обновляется при смене defaults;
`browser-numbered-marker.e2e.ts` проверяет цвет/форму пикселями overlay и создание;
`browser-creation-cursors.e2e.ts` проверяет hover и временный pan.

REQ-TOL-006 / уточнение подписи 2026-10-17: номер всегда внутри badge;
необязательная multiline подпись находится справа, с фиксированным зазором и
вертикальным центрированием. Правки подписи не меняют sequence/размер badge.
Проверки: core caption contract, renderer export, mounted и browser edit/undo.

## Контекстные настройки до создания (2026-10-17, ADR-069)

REQ-EDT-008/015/018, REQ-TOL-001/003/004/005/006/007/008/009/010/011:
запись добавлена до реализации. Единая политика показывает defaults стрелки,
фигуры, карандаша, выделителя, номера, цензуры, подсветки, линейки и лупы при
активации. Text/Callout открывают inline controls после размещения.
Quick Capture показывает автоматическую строку только вне рамки; при нехватке
места доступна явная кнопка настроек. Первый pointerdown после outside-dismiss
должен создавать штрих без дополнительного клика. Проверки: mounted shell,
геометрия размещения, browser pointer/keyboard, real Tauri Capture → Quick → Editor.
Статус: implemented; pnpm test — 113 файлов / 884 проверки, затем 48/48 focused regressions.
Browser matrix на 2560×1440 документе и native creation-settings прошли;
фактические команды, дополнительные проверки и ограничения — TESTING.md.

## Прямые разделители тулбаров (2026-10-17)

REQ-UI-001: запись добавлена до реализации. Панели фигур и выделителя используют
существующий UiSeparator вместо боковых рамок скруглённых кнопок: 1×21 CSS px,
вертикальное центрирование, border-radius: 0. Группировка, скругление кнопок,
hover/focus и поведение инструментов сохраняются в Editor и Quick Capture.
Остальные декоративные разделители проверяются на тот же дефект; прямые линии
не требуют замены. Проверки: browser computed geometry, RU/EN, light/dark,
1024 px и desktop screenshots, component regressions и pnpm check.
Статус: implemented; 29/29 component, 2/2 browser matrix и 1/1 real-WebView
Capture → Quick → Editor passed. Геометрия и скриншоты проверены на Linux/X11;
изоляция от параллельных правок и ограничения общих прогонов — TESTING.md.

## Меню приложения не дублирует заголовок окна (2026-10-17, ADR-080)

`REQ-ACT-008`: запись добавлена до реализации. Меню с названием программы
остаётся только в системной строке macOS. Windows и Linux открывают настройки
из трея и CLI и не показывают внутриоконную полосу. Проверка: контракт
`installs_app_menu`; визуально first-run настройки на Windows.

## Навигация настроек и запись в строке (2026-10-17)

| Требование      | Изменение                                                        | Проверка                                                            |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| REQ-ACT-008     | Один tray item, Общие/Горячие клавиши слева, отдельный CLI route | Rust query contract; mounted navigation; browser/native singleton   |
| REQ-ACT-009     | Запись с одного клика, inline draft/errors, меню троеточия       | Mounted component tests; browser keyboard/menu/size matrix          |
| REQ-ACT-002/011 | Cancel/blur/Tab/navigation и stale probe isolation               | Mounted delayed-bridge tests; real Tauri recorder/activation/reopen |

Evidence и фактические ограничения добавляются в TESTING.md после прогонов.

## Форма скрытия данных только до рисования · 2026-10-17

`REQ-TOL-008`, `REQ-EDT-015/016`, `REQ-UI-006`, ADR-077: запись добавлена до реализации.
Defaults/configure сохраняют выбор rectangle/freeform в Editor и Quick Capture.
Selection schema не содержит censorRegion для одного объекта и группы; панель
не показывает кнопку или подпись формы. Прямое событие censorRegion для готового
объекта не меняет документ, историю и defaults. Эффекты и параметры сохраняют
undo/redo и исходную геометрию. Доказательства: Vue censor-toolbar, browser/native
censor-toolbar через pointer creation и production Capture → Quick → Editor;
фактические результаты — TESTING.md, артефакты — `artifacts/censor-toolbar/`.

## Компактная временная история (ADR-078)

| Requirement | Contract/evidence                                                                      | Status                              |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| REQ-LIB-010 | Recent history across series; production capture → edit → switch → restart             | implemented; evidence in TESTING.md |
| REQ-LIB-011 | Cursor pages of 50, virtualized thumbnails, bounded caches and token lifecycle         | implemented; evidence in TESTING.md |
| REQ-LIB-012 | 7 days / 512 MiB / 200 captures; protected and leased captures survive maintenance     | implemented; evidence in TESTING.md |
| REQ-LIB-013 | Journalled cleanup, shared references, stale-plan rejection, legacy consent preview    | implemented; evidence in TESTING.md |
| REQ-LIB-014 | Saved-result previews, revision invalidation, no originals in list payloads            | implemented; evidence in TESTING.md |
| REQ-LIB-008 | Restore last successfully activated capture and per-capture viewport; fresh Undo stack | implemented; evidence in TESTING.md |

Этот срез не завершает series/search/pin windows M09. Native evidence относится
к Linux/X11; Windows/macOS/Wayland runtime pending (ADR-020).

## Читаемая история и ручная очистка (2026-10-17)

| Требование      | Контракт и проверка                                                                                                                                   | Статус                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| REQ-LIB-002/011 | Две колонки крупных превью, виртуализация и keyboard шаг по двум карточкам; прямая корзина с подтверждением; browser history regression и screenshots | implemented; TESTING.md |
| REQ-LIB-012/013 | Прямая кнопка защиты и очистка всех страниц с preview/confirm/cancel; protected и active сохраняются, busy/error/focus; browser history regression    | implemented; TESTING.md |

Уточнение REQ-LIB-002/013: единственное действие карточки «Удалить» доступно
прямой кнопкой корзины рядом с замком, без промежуточного меню; подтверждение,
Cancel/Escape и disabled/busy сохраняются. Проверка: browser/native history flows.

REQ-UI-006 / REQ-LIB-002: белые иконки защиты и корзины используют мягкую
тёмную подложку на прозрачных кнопках для светлых участков превью; SVG strokes
не переопределяются, обводка/filter на самом значке отсутствуют.

## Исправление кнопки экспорта (2026-10-17)

- `REQ-OUT-003/006/007`: Export полного editor открывает системный Save As и
  сохраняет PNG 1× из committed renderer с учётом crop, независимо от zoom/DPR
  и активного Crop tool. Raw binary IPC, атомарная запись, повторное декодирование,
  запрет записи в библиотеку originals, отмена и повтор после ошибки обязательны.
- До реализации: regression desktop action должен воспроизвести заглушку;
  Rust contract проверяет decoded pixels и защиту originals; real WebView2
  проходит production Open image → Export с 4K fixture. JPEG/WebP и отдельные
  quality/scale controls остаются незакрытой частью `REQ-OUT-003`.

Export fix evidence: desktop/Offscreen regression 6/6, Rust export 3/3,
full TS/Vue 1128/1128, renderer 33/33 and Windows/WebView2 native 1/1 passed.
Decoded outputs are 3840×2160 and cropped 2160×2160 with matching RGBA;
Save As cancellation preserves the previous file. The OS picker selection is
substituted; manual dialog, other platforms and JPEG/WebP/quality/scale remain
pending. General check has an unrelated 503-line controller boundary violation.
Exact commands and artifacts: TESTING.md, ADR-083.

## Имя PNG по умолчанию (2026-10-17)

`REQ-OUT-003/008`: оба native Save As предлагают `Скриншот YYYY-MM-DD HH-MM-SS.png`
по локальному времени открытия диалога. Общий formatter исключает запрещённые
в Windows двоеточия и сохраняет секунды и ведущие нули. Перед реализацией —
red-first Rust contract на фиксированную локальную дату; затем focused Rust,
форматирование и проверка компиляции. Пользователь может изменить имя в диалоге.

## Настраиваемое имя PNG (уточнение 2026-10-17)

`REQ-OUT-003/008`, `REQ-UI-003/006/007`: default `YYYY-MM-DD_HH-MM-SS_Скриншот.png`
без пробелов, с лексикографическим порядком дат. Общие настройки приложения
редактируют шаблон с обязательными `{date}` / `{time}`, живым native preview,
Save, Cancel и Reset. Rust проверяет переносимость имени и сохраняет шаблон
в SQLite; editor и Quick читают его при каждом Save As. Ошибка/отмена не
перезаписывают сохранённый выбор. До реализации — red-first Rust formatter,
validation, persistence tests; затем Vue draft/error/cancel и native Settings
→ save/reopen → export evidence. Schema документа и originals не меняются.

ADR-084 status: implemented. Rust formatter/validation/reopen 3/3, Vue settings
18/18, typecheck, IPC and scoped lint passed. Windows/WebView2 production
Settings → reopen → named export плюс crop/cancel regression passed 2/2.
Rust workspace: 170 passed, 1 ignored. General repository checks remain blocked
by unrelated current style/architecture violations; details and artifacts — TESTING.md.

## Панели настроек и системный chrome (2026-10-17)

`REQ-UI-001`, `REQ-EDT-015/016`: selection toolbar и вложенные настройки
учитывают фактическую верхнюю панель действий, включая её расположение вне
workbench, и нижние системные панели. Регрессии: объект у верхнего края,
маленькое выделение, изменение размеров chrome и отсутствие topbar в Quick.
Проверки: Vue geometry/component, browser production pointer flow и доступный
real WebView; фактические результаты и ограничения — TESTING.md.

Статус: implemented; Vue 59/59, browser RU/EN light/dark 4/4 и Windows x64 /
WebView2 155.0.4283.45 production Capture → Quick → Editor 1/1 passed.
Screenshots selection/Stroke просмотрены; другие ОС и physical capture pending.

## Отступы верхних действий (2026-10-17)

`REQ-UI-001/004/006`: запись до реализации. Кнопки верхней панели сохраняют
8 CSS px между иконкой и подписью внутри content-wrapper Naive UI,
6 CSS px между кнопками и горизонтальный padding 12 CSS px с подписями.
При ширине 1024 px сохраняется компактный режим без переполнения.
Проверка: существующий browser-shell на 1600/1024 px; результаты — TESTING.md.

## Общая локаль настроек и трея (2026-10-17)

`REQ-UI-003`, `REQ-ACT-006/008`: запись до реализации. General Settings,
editor и native tray используют один сохранённый выбор RU/EN. Все восемь
пунктов трея, включая disabled actions, Settings и Quit, меняют язык без
перезапуска; обновление shortcut labels сохраняет локаль и комбинации.
Существующий browser preference переносится в native settings для tray startup.
Проверки: red-first Rust labels/preferences, mounted Settings persistence,
production Settings → language → native MenuItem text и повторный запуск.
Фактические команды, платформа и ограничения — TESTING.md.

ADR-088: implemented. Windows/WebView2 155.0.4283.45 production Settings
RU/EN/RU, all eight native MenuItem texts, editor sync, Settings reopen и
process restart startup labels — 2/2 native scenarios passed. 37 уникальных
Vue tests, Rust workspace 173 passed / 1 ignored, Clippy passed. Общие
сторонние lint/typecheck/format/boundary blockers — TESTING.md.

## Компактные Quick actions и сохранение в историю (2026-10-18)

`REQ-CAP-010/011/012/014`, `REQ-LIB-002`, `REQ-UI-001/003/004`, ADR-096:
пять icon-only кнопок, RU/EN hover/focus, terminal completion history, clean
original и editable annotations. Commit failure оставляет draft; dismiss retry
не создаёт дубликат. Portal note обходит crop, action buttons и нижние tools;
подсказки кнопок раскрываются в свободную половину viewport.

Implemented: red-first Rust completion/rollback/retry; 153 focused Vue/icon tests,
19 layout tests после tooltip-side regression; Windows 10 x64 real WebView2
production Quick → history → restart на high-entropy 3840×2160 fixture. Чистый
crop 3074×1730 совпал по SHA-256 decoded RGBA; exported PNG содержит annotations.
Фактические команды, artifacts и незатронутые ошибки общего прогона — TESTING.md.

## Актуализация лендинга (2026-10-18)

`REQ-EDT-008`, `REQ-TOL-001/002/003/004/005/006/007/008/009/010/011/012/013/014/015/017`:
запись добавлена до реализации. RU/EN landing описывает текущие возможности
18 инструментов, включая отдельный Emoji; SVG экспортируются только из UiIcon.
Панель снимается в настоящем WebView после production Open image, без подмены
mount state. Landing E2E проверяет одинаковый полный набор карточек, загрузку
изображений, размеры и прокрутку панели, responsive layout, keyboard navigation
и no-JS. Большой hero screenshot и поведение редактора сохраняются.
Статус: implemented; Windows x64 / Chrome 155: landing RU/EN на пяти ширинах,
JS и no-JS — по 4 tests passed. Native Open image и capture панели — 1/1 passed
в WebView2 155. По уточнению пользователя итоговый asset заменён предоставленным
скриншотом 598×41 без изменения pixels; наружный фон скрыт CSS clipping 12 px.
Команды и ограничения общих gates — TESTING.md.

## Плавные дуги автокоррекции (2026-10-18)

`REQ-TOL-003`, `REQ-EDT-002/005/006`, `REQ-OUT-003`: до реализации уточнён
контракт — stabilized v2/v3 скругляет стыки стабилизированных samples
квадратичными кривыми с ограниченной ошибкой аппроксимации. На редкой дуге
при 65% нет поворотов между соседними render segments более 0,18 rad.
Начало/конец, исходные samples, постоянная толщина, точное перо, 0% и Shift
anchors сохраняются. Red-first core tests; затем decoded render parity,
production browser pointer/undo/cancel, visual review и 12 000 samples.
Фактические команды и платформенные ограничения фиксируются в TESTING.md.

ADR-113 evidence: red-first 2/2 новых core contracts failed до реализации;
после реализации 1372 unit/component checks, 6 decoded render checks,
7 browser regressions и отдельный loop pointer test passed. Плавные 65% дуги,
точные endpoints/Shift и 0% подтверждены; CPU correctness 12 000 samples passed.
Native acceptance для нового сглаживания отдельно не заявляется; TESTING.md.
