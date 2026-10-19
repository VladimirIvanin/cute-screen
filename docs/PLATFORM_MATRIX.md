# Платформенная матрица

## Wayland single-shot без трансляции (2026-10-20, ADR-121)

ScreenCast/PipeWire capture удалён. Ubuntu 22.04.5 x64 / GNOME 42.9 /
Wayland / gnome-screenshot 41.0-2: три внешних снимка и новый dev Screen capture
прошли; все PNG 1920×1080 повторно декодированы. Native dev завершился captured;
D-Bus trace содержит GNOME Screenshot и не содержит ScreenCast calls.
Auto предпочитает helper только для ShellVersion ≤42; современные GNOME,
включая Ubuntu 24, сохраняют Screenshot portal. KDE/wlroots/ARM64/mixed-DPI
не проверены на этом host. Их маршруты проверяются capability contracts,
но это не native evidence. Settings и повторный Quick reset проверены 19 component tests; real GNOME
WebView: два Area, History PNG decode и preference reopen прошли. На обоих
warmup document=null, ready=false, overlay=hidden; оба новых crop=null. Drag
в тесте — DOM PointerEvents; физический input gate отдельно pending (TESTING.md).

## Единая иконка толщины линии (2026-10-19)

`REQ-EDT-015/016`, `REQ-UI-001/003/006`: общий Vue `UiIcon.strokeWidth`
используется у стрелки, линии, фигуры, выноски и линейки. Linux x86_64 /
Chrome 147: component suites и browser RU/EN × light/dark, 1024 px;
линия и выноска также 50/100/200%. Native WebKitGTK, WebView2 и WKWebView
в этой правке не запускались; платформенные capabilities прежние.
Точные команды, результаты и screenshots — TESTING.md.

## Wayland: закрытие первого permission dialog (2026-10-19, ADR-120)

Пользовательский снимок на GNOME/Wayland показывает permission dialog в первом
кадре. Backend добавляет 350 мс только после новой успешной авторизации или
reselect; cached captures не замедляются. Rust regressions и dev build
проверяются на Ubuntu 22.04 x64. Визуальная приёмка новой сборки с реальным
системным диалогом остаётся pending до отдельного capture; KDE/wlroots,
ARM64 и изменённая скорость compositor animations не проверены.

## Windows GUI и физические края Area (2026-10-19, ADR-115)

Windows 10 build 19045 x64, WebView2 155.0.4283.62, один экран 1920×1080,
DPR 1: системный ввод с четырёх краёв и четырёх углов, полный экран,
Escape во время drag и повторный захват прошли. Quick chrome 7/7,
Editor handoff и capture exclusion также прошли. Release 0.1.6 имеет
PE GUI subsystem 2; NSIS собран, silent install завершился с exit 0.
Пользовательский CLI остаётся только на Linux; macOS использует внутренний
startup check в build gates. Нативные Windows 11/ARM64/HDR/mixed-DPI,
несколько мониторов, RDP и macOS этим прогоном не подтверждены.
Срабатывание PRO32 ID700022 относится к установщику 0.1.5; результат
проверки 0.1.6 этим антивирусом неизвестен. Evidence — TESTING.md.

## Wayland: сессия доступа и raw frame (2026-10-19, ADR-118)

Ubuntu 22.04.5 x64 / GNOME 42.9 / Wayland: Screenshot v2, ScreenCast v4,
AvailableSourceTypes=3, pipewiresrc 0.3.48. Владелец подтвердил, что прежний
Screenshot путь каждый раз просит доступ, preview недостаточно чёткий;
dev наследовал GDK_BACKEND=x11. Поэтому Area/Screen/Repeat переведены на
переиспользуемую Monitor session и raw-RGBA PipeWire consumer, entry — на
native Wayland. Наличие raw pipeline проверяется, frame не уменьшается.
Выделение в пределах выбранного монитора, без синтеза desktop geometry.
Владелец проверил два захвата новой сборкой: повторного запроса нет, качество
хорошее. Сообщённая задержка перед выделением привела к memory-owned BMP
preview (ADR-119). Владелец подтвердил заметное ускорение, открытие системного
выбора и рабочий capture после отмены. После повторного назначения hotkey
Ctrl+Shift+2 сохранён в GNOME и dev preferences; пользователь сообщил, что
заработало. Настоящий restart и смена физического монитора ещё pending.
Команды и результаты — TESTING.md.
KDE/wlroots, X11, Windows/macOS и mixed-DPI этим изменением не проверены.

## Стартовая толщина линий (2026-10-18, ADR-116)

Общие TypeScript/Vue defaults: arrow 8 px; line, shape, pencil и рамка лупы
4 px. Native API, схема документа, preferences и платформенные гарантии
не меняются. Core/component проверки выполняются на Windows x64;
новая native runtime проверка Linux/macOS этим изменением не заявляется.

## Локальная дисковая гигиена (2026-10-18, ADR-114)

Cargo profiles и полезный build/incremental cache сохраняются.
Cleanup Chrome profiles/pin binary/config не меняет native
capture backend. Windows-аудит и фактическая проверка cleanup — TESTING.md.
Linux/macOS cleanup отдельно не проверялся; размер/скорость их сборок
не экстраполируются с Windows.

## Загрузки лендинга (ADR-113)

Определение ОС в браузере — рекомендация: optional Client Hints, UA fallback,
неизвестная архитектура x64. Это не подтверждение native install/capture/export.
macOS universal; Linux DEB/AppImage x64/ARM64, Ubuntu 22.04+, Wayland portals;
Windows unsigned EXE x64/ARM64. Ubuntu 24.04.5 / Chrome 154: RU/EN E2E с JS/no-JS passed, 375–1440 px;
OS/CPU scenarios эмулированы до production mount. Safari/Firefox и hosted
Pages не запускались. Browser/CI evidence и ограничения — TESTING.md.

## macOS Clang availability runtime (2026-10-18)

Release run 39142547248 / job 117722198522 упал при arm64 link с undefined
`__isPlatformVersionAtLeast`, до создания DMG. `build.rs` теперь запрашивает
Clang builtins runtime при `-nodefaultlibs`. CI Intel/ARM64 дополнен реальной
линковкой и внутренним `--startup-check` (ADR-115). Baseline 12.0 и SDK gate 14+ сохраняются.
Linux boundary/Rust checks не подтверждают native macOS link: исправленный
macOS run, universal DMG и capture runtime остаются pending.

## CI smoke и локальная полная приёмка (2026-10-18, ADR-112)

Linux hosted CI: семь независимых jobs, browser headless smoke и два native
сценария под Xvfb с external tauri-driver. Это не полный Linux desktop/portal
runtime pass и не подтверждение Windows/macOS runtime. Полные E2E остаются
локальными либо manual opt-in; существующая compile/release matrix сохранена.
Новый hosted workflow пока не запускался; локальные результаты — TESTING.md.
Ubuntu 24.04.5 / GNOME X11: финальные browser smoke 3/3 и native smoke 2/2
passed с external driver; подтверждены production capture mount и 4K/cropped
PNG decode. Локально Xvfb отсутствует, hosted Xvfb pass не заявляется.

## Release assets (2026-10-18, ADR-111)

Build matrix: Ubuntu 22.04 x64/ARM64 DEB/AppImage; Windows native x64/ARM64
unsigned NSIS; macOS 15 Apple Silicon собирает universal DMG (`--bundles app,dmg`)
и проверяет `lipo <Mach-O> -verify_arch x86_64 arm64`. Один DMG поддерживает Intel и Apple Silicon;
это не отдельная Intel runtime acceptance. Linux packages сохраняют CI ABI
и extracted-package CLI gates. Windows проверяет PE GUI subsystem/startup;
macOS — внутренний startup check и DMG image verification. Полный install/capture/export, macOS Intel
runtime и предупреждения после скачивания требуют отдельного native прогона.
Локальные проверки скриптов/workflows на Linux не считаются hosted build pass.

## Версия в Settings (2026-10-18, ADR-108)

Общий Vue UI показывает package version через Tauri getVersion; settings
window имеет core:app:allow-version. Ubuntu 24.04.5 x64 / GNOME X11 /
WebKitGTK 2.52.6: native metadata assertion прошёл, видна Version 0.1.0.
Полный activation-settings native regression после ожидания save — 3/3 passed.
Chrome 154: 2/2 browser scenarios, RU/EN × light/dark и 820×720/620×520;
screenshots просмотрены. Полные результаты — TESTING.md.
Windows/macOS runtime в этом срезе не проверялись.

## Закрытие меню трея перед захватом (2026-10-18, ADR-107)

Все tray capture requests используют штатный отменяемый delay 200 мс;
hotkey/CLI/UI не получают добавочной паузы. Ubuntu 24.04.5 / GNOME X11 /
WebKitGTK 2.52.6: реальный menu click → Area frozen frame и Screen original
1920×1080 прошли pixel decode, по 40 250 пикселей фона под прежним меню.
Rust проверяет все пять tray actions и cancel до backend; pnpm check passed.
Команды, screenshots и границы Area materialization — TESTING.md.
Windows/macOS/Wayland, Repeat/Window/Active Window и другие shell animations
runtime не проверены; 200 мс не объявляются универсальной гарантией анимаций.

## Фокус установленного Quick Capture (2026-10-18, ADR-106)

Ubuntu 24.04.5 / GNOME X11 / WebKitGTK 2.52.6: установленный Jammy DEB с ELF
SHA256 `115b5752949e83f42494eb2344d902eedc7549dbac5171dfb6124c41ba7a161f`
воспроизводит видимый Quick без native focus; Esc остаётся в чужом окне.
Ранний WebDriver pass ниже не доказывает background activation, поскольку
switchWindow сам активирует окно. Исправление использует свежий GDK X11 server
timestamp и синхронный accept-focus. Native Tauri 2/2 и три background CLI
попытки на извлечённом из нового Jammy DEB release ELF прошли. Новый ELF
SHA256 `69da0181798d6f4373a04dbe01687b4a1c73c0bd8837c68ac9484f448b141a81`.
После установки и перезапуска `/usr/bin/cute-screen` (PID 124925) тот же smoke
прошёл 3/3, SHA256 файла и resident процесса совпадает. Во всех случаях Quick
сам получил native focus до ввода, Escape вернул cancelled, окно скрылось.
Команды и JSON — TESTING.md.
Windows, macOS и Wayland этим изменением не объявляются проверенными.

## Escape до первого выделения Area (2026-10-18)

Общий Vue handler начальной отмены больше не зависит от DOM focus внутри
shell. Mounted tests body/canvas/первый drag и существующая stroke cancellation:
78/78 passed на Ubuntu 24.04.5 x64. Physical X11 1920×1080 / WebKitGTK 2.52.6:
1/1 native test passed — Escape без клика, повторный capture и Escape при
удерживаемом первом drag. Оба отменённых draft удалены, Quick hidden,
main visible, persisted document отсутствует. Повторный native Escape имел
repeat=true; selecting принимает его, editing сохраняет защиту от повтора
после отмены штриха. Команды, JSON и screenshots — TESTING.md. Windows exclusion regression лишён искусственного `.focus()` перед
Escape; Windows/WebView2 и macOS для этой правки не запускались. Системный
Wayland XDG selector сохраняет собственный cancel lifecycle.

## Ubuntu 22.04 binary baseline (2026-10-18, ADR-104)

Linux x64/ARM64 CI использует Ubuntu 22.04; package ABI gate запрещает
GLIBC выше 2.35. Local Docker build изолирует dependencies и target от host.
Jammy x64 / glibc 2.35 / WebKitGTK 2.50.4: прежний Ubuntu 24.04 ELF воспроизводимо
не запускается (`GLIBC_2.39 not found`); отрицательный gate passed.
Focused WebKitGTK API probe прошёл для canvas, module workers, OffscreenCanvas,
fonts, structuredClone, randomUUID, Segmenter, inert и :has. Probe выполнялся
в Xvfb/root container с отключённой WebKit sandbox; это не подтверждение
production editor или физического захвата. Команды/логи — TESTING.md.
Новая x64 release-сборка: maximum GLIBC_2.34, ABI gate passed; DEB установлен
через apt, CLI DEB/AppImage extract-and-run прошли. Установленный DEB запустил
Settings и WebKitWebProcess под обычным пользователем в Xvfb/X11 с включённой
sandbox; это startup smoke без visual/interaction приёмки. Пакеты и SHA256SUMS —
`artifacts/ubuntu22/`. ARM64, FUSE mount и physical capture/clipboard pending.
Wayland Screenshot/GlobalShortcuts capabilities по-прежнему определяются
portal version и backend; полная GNOME 42 приёмка этим ABI gate не закрывается.

## Иконки настроек выноски (2026-10-18)

Windows x64: Vue 16/16 passed; Chrome 155.0.8059.80 2/2 passed, включая
12 сочетаний RU/EN × light/dark × zoom 50/100/200 при 1024 px. Пять кнопок
остаются в одном ряду; screenshots просмотрены. Свежая WebView2-сборка прошла,
но оба native прогона остановились до проверки toolbar на ранних pointer
gestures (Callout create / Quick resize); native layout/handoff не подтверждены.
Linux/WebKitGTK и macOS/WKWebView pending. Команды и логи — TESTING.md.

## Иконка выноски: карточка и точка (2026-10-18)

Windows x64: Vue 110/110, Chrome 155.0.8059.80 2/2 и WebView2 155.0.4283.45
external driver 1/1 passed. Production Capture → Quick → Editor использует
единую `calloutGeometry`; RU/EN × light/dark и размеры 16–32 px просмотрены.
Команды, screenshots и ограничения общих gates — TESTING.md.
Linux/WebKitGTK и macOS/WKWebView для этой замены pending.

## Компактная ширина выноски (2026-10-18, ADR-103)

Windows 10 x64: Vue 14/14 passed; Chrome 155.0.8059.80 — все 12 сочетаний
RU/EN × light/dark × zoom 50/100/200 при 1024 px, dropdown не пересекает
inline text. WebView2 155.0.4283.45 / external tauri-driver — production
Capture → non-origin Quick → Callout width/manual/cancel/auto → Editor,
1/1 passed на окончательной сборке. PNG просмотрены. Команды и ограничения
общих architecture gates — TESTING.md. Linux/WebKitGTK и macOS/WKWebView
runtime pending; native physical capture гарантии не расширяются.

## Chrome при изменении Quick-рамки (2026-10-18, ADR-102)

Windows 10 x64 / WebView2 155.0.4283.45: 7/7 Quick chrome scenarios passed
через external driver и свежую сборку. Held native resize скрывает панели,
release/Escape возвращают их, undo/redo сохраняет crop. Mounted Vue 42/42
включает pointercancel/blur. Скриншоты просмотрены; команды — TESTING.md.
Fake capture проверяет UI lifecycle; physical capture гарантии не расширяются.
Linux/WebKitGTK, macOS/WKWebView и отдельный browser mode не запускались.

## Общая тема окна настроек (2026-10-18)

Windows 10 x64, WebView2 155.0.4283.45 / external tauri-driver:
2/2 tests passed. Настоящий Settings WebView использует общий saved/live theme,
общие semantic tokens и dark native controls/scrollbar. Повторное открытие
проверено через production editor entry; system media change покрыт component
tests, без заявления о native OS toggle. Linux/WebKitGTK и macOS/WKWebView
для этой правки не запускались. Команды и ограничения — TESTING.md.

## Углы рамки изображения (2026-10-18, ADR-097)

Windows x64: shared core и decoded software Canvas2D/CanvasKit tests прошли
для 4K source, рамок 26/32 px, radius 0/80 и четырёх внешних углов.
Browser и real WebView2 результаты — TESTING.md. Linux/WebKitGTK и
macOS/WKWebView для этой правки не запускались; platform capture не меняется.
Chrome 155.0.8059.80: 1024/1600 × RU/EN × light/dark — все 8 сочетаний passed,
включая четыре внешних угла и undo/redo после production G import.
WebView2 155.0.4283.45: fresh build passed, runtime pending; первый запуск
остановлен занятым 4445, второй — bind 10048 / closed WebView до image assertions.

## Свёрнутый режим выделителя (2026-10-18, ADR-095)

Windows 10 x64, Chrome 155.0.8059.80: RU/EN × light/dark × 1024/1280,
sample 36×24 px, текущий цвет/интенсивность и направление изменения яркости
проверены через decoded screenshot. Vue — 51/51 passed. WebView2 155.0.4283.45,
external driver: 2/2 tests passed, production Capture → Quick → Editor,
RU/EN × light/dark, штатный fallback Settings в Quick, trusted input и
точный native stroke preview/commit checksum. Browser drawing checksum остаётся
отдельным failed gate; общий check/format не считается целевым UI evidence.
Команды, логи и ограничения — TESTING.md. WKWebView/WebKitGTK runtime pending;
гарантии физического захвата не расширяются.

## Линия (2026-10-18, ADR-100)

Windows 10 x64: core/Vue 88/88, decoded 4K screenshot Canvas2D/CanvasKit 1/1,
controlled perf 6/6. Chrome 155.0.8059.80: 2/2 browser scenarios, trusted pointer,
RU/EN × light/dark × 1024 px, zoom 50/100/200%. WebView2 155.0.4283.45:
2/2 line,line-reopen passed на свежей сборке, non-origin Quick → Editor,
endpoint/style edits, decoded clipboard и восстановление шести линий/defaults.
Просмотрены screenshots controls + результата. Команды, диагностика и общие
check/typecheck ограничения — TESTING.md. Linux/WebKitGTK и macOS/WKWebView
runtime pending; native capture/hotkey гарантии этим UI изменением не расширяются.

## Заливка и пунктир фигур (2026-10-18, ADR-092)

Shared core/renderer/Vue: schema v7, radial compatibility, 2–8 linear stops,
solid/dashed/round dotted. Windows x64: 74 целевых tests и 46 renderer tests
passed; decoded Canvas2D/CanvasKit PNG просмотрены. Chrome 155.0.8059.80:
RU/EN × light/dark × 1024/1280, zoom 50/100/200 и четыре прежних shape-toolbar
сценария passed. Real WebView2 155.0.4283.45: 2/2 native scenarios passed,
trusted input, non-origin Quick → Editor, decoded clipboard и восстановление
фигур/defaults после relaunch. Команды и ограничения — TESTING.md.
Linux/WebKitGTK и macOS/WKWebView для этой панели
не проверены; platform capture/hotkey гарантии не расширяются.

## Изолированный снимок окна (2026-10-18, ADR-091)

Windows 10 Home 19045 x64 / WebView2 155.0.4283.45: WGC CreateForWindow,
initial hover, Escape/retry, click и Tab/Shift+Tab/Enter проверены на реальном
перекрытом окне, EN/dark и RU/light. Сохранённый PNG 1386×893 повторно
декодирован: скрытые pixels target сохранены, перекрывающее окно и selector
отсутствуют. Window capability независима от DXGI. Rust workspace и Vue recovery
tests прошли; команды/артефакты — TESTING.md. Windows 11, tray/hotkey/CLI,
Alt+Tab, close/resize, DPI 125/150/200% и multi-monitor runtime pending.
X11: named Composite pixmap и отдельная capability; без compositor Window
недоступен, screen/area не меняются. Linux runtime pending.
macOS 12.0–12.2: CoreGraphics single-window; 12.3–13: SCStream one-shot;
14+: system picker + SCScreenshotManager. Intel/Apple Silicon compile/runtime
pending на владельцах macOS; Windows build не доказывает Objective-C путь.
ADR-109: маршрут 14+ требует SDK 14+ при сборке; с SDK 13.x Window на любой ОС
идёт через AppKit selector и SCStream/CoreGraphics. Релиз требует SDK 14+.
ADR-110: macOS не объявляет Window target — продукт на macOS предлагает только
Area и Screen; описанные маршруты Window остаются кодом без пользовательского входа.
Wayland: только advertised Screenshot v3 Window; GNOME/KDE runtime pending.

## Два режима карандаша и краткие подсказки (2026-10-18, ADR-094)

Windows x64: migration/preferences/session — 33/33 final tests passed;
decoded renderer — 3/3 passed, включая 4K и оба backend. Chrome 155.0.8059.80:
две кисти, Shift drawing/ruler DPR 1/2 × Fit/1:1 и RU/EN × light/dark 1024 px
проверены. Follow-up preferences/tooltip — 3/3 passed после исправления двух
дефектов подготовки/assertions тестов. Windows WebView2: финальная свежая
сборка остановлена TS2883 в параллельной правке ShapeGradientEditor.vue;
native Quick → Editor → reopen и migration runtime pending. Команды и логи — TESTING.md.
Linux/WebKitGTK и macOS/WKWebView не проверены; capture/hotkey гарантии не меняются.

## Подписи кнопок и крестик истории (2026-10-18)

Windows x64 / Chrome 155.0.8059.80: Vue 12/12 и все 8 выбранных browser cases
passed с учётом повторного прогона expanded matrix. RU/EN × light/dark на
1024 px: подписи без многоточий, close 18×18 в кнопке 32×32, click/Escape/focus.
Native history-settings/editor-settings не запущены: свежую сборку блокирует
TS2883 в текущем ShapeGradientEditor.vue. WebView2 для этой правки pending,
Linux/WebKitGTK и macOS/WKWebView не проверялись. Команды и логи — TESTING.md.

## Пасхалка бренда (2026-10-18, ADR-093)

Hover-анимация inline SVG относится к chrome editor и RU/EN landing.
Mouse включает эффект; touch/reduced motion сохраняют статичный знак.
Windows WebView2, Chromium и отдельно WebKit/WKWebView требуют runtime evidence;
наличие SVG и controller unit tests не подтверждает платформенную поддержку.
Windows/Chrome 155: landing RU/EN, no-JS navigation и editor RU/EN × light/dark
прошли. Windows WebView2 155.0.4283.45 / external driver: финальный runtime-прогон
свежего binary прошёл в EN × light/dark с trusted pointer input. Первые native
build/startup failures и точная команда повторного запуска записаны отдельно.
Linux/WebKit/WKWebView не проверялись.
Фактические команды и ограничения — TESTING.md.

## Доработка выноски (2026-10-18, ADR-090)

Windows x64: red-first core и focused Vue — 76 passed; decoded Canvas2D/CanvasKit
на 2560×1440 — passed (`pnpm test:render`, 46/46). Production Chrome 155.0.8059.80:
4 specs / 5 tests passed, включая Alt deletion/cancel, curve, empty caption,
width и 1024 px × RU/EN × обе темы × zoom 50/100/200.
Real WebView2 155.0.4283.45: Quick с non-origin crop → Editor → новый процесс,
2/2 passed после Alt isolation; команды, артефакты и общие ограничения — TESTING.md.
WebKitGTK/WKWebView/Wayland pending.

## Диапазоны изображения (2026-10-18, ADR-089)

Windows x64: mounted Vue 4K square/landscape — passed; свежая сборка и
real WebView2 155.0.4283.45 `content-image-tool` — 1/1 passed. Проверены
максимальное скругление и рамка 32 px в Quick/Editor, G, preview/commit,
cancel и undo/redo, PNG повторно декодирован. Chrome 155.0.8059.80:
1024/1600 × RU/EN × light/dark — все 8 сочетаний passed.
Команды и артефакты — TESTING.md.
Linux/WebKitGTK и macOS/WKWebView для расширенных диапазонов не проверены.

## Управляемые выноски (2026-10-18, ADR-087)

Shared core/renderer/Vue путь: schema v7 extensions без миграции старых выносок.
Windows x64: red-first geometry/codec и decoded Canvas2D/CanvasKit appearance
проверены. Browser RU/EN × light/dark × 1024 px × zoom 50/100/200 проверен
отдельно от WebView2. Финальные команды, повторные прогоны и ограничения —
TESTING.md. Windows WebView2 155.0.4283.45 / external tauri-driver 2.1.0:
свежая изолированная сборка и оба native сценария passed. Проверены Quick с
non-origin crop, trusted keyboard/ПКМ, Editor handoff и отдельный запуск с
восстановлением manual route/card/defaults. Linux/WebKitGTK, Wayland и
macOS/WKWebView runtime pending;
платформенные capture/hotkey гарантии этим изменением не расширяются.

## Вход в хранение из истории (2026-10-17)

Windows 10 x64 / WebView2 155.0.4283.45, external tauri-driver 2.1.0:
native `history-settings` — 1/1 passed. Async `settings_open_history`
освобождает UI thread при создании окна. Проверены загрузка History Settings,
singleton/navigation, закрытие и повторное открытие, main keyboard/focus.
Screenshot и команды — TESTING.md. Linux/WebKitGTK и macOS/WKWebView pending;
native capture, IPC DTOs и storage policy не меняются.

## Изображение: настройки и gesture preview (2026-10-17, ADR-086)

Общий Vue/Canvas2D путь сохраняет image в ordered scene во время жеста.
Windows x64: Vue regressions, software 4K render/decoded PNG, Chrome 155
(1024/1600 × RU/EN × light/dark) и настоящий WebView2 155.0.4283.45 прошли.
Native G import, held gesture, commit/cancel, undo/redo и Copy проверены в Quick
и Editor на закреплённом binary успешной сборки этого изменения. Native pixels
используют блоки 8×8 / 2⁄255 для resampling; document и decoded export — exact.
Последующая сборка всего дерева блокируется параллельными callout props;
команды, evidence и ограничения подробно записаны в TESTING.md. Linux/WebKitGTK,
Wayland и macOS/WKWebView для этого изменения не проверены. Native capture,
hotkey backend, IPC и document v7 не изменяются.

## Выбор и перенос за рамку (2026-10-17, ADR-085)

Общий DOM-free core и Vue canvas используют CSS hit margin и общий resolver.
Windows Chrome 155.0.8059.80: 12/12 passed (RU/EN × light/dark × 25/100/400%).
WebView2 155.0.4283.45 с external driver: 1/1 passed, production Capture →
Quick non-origin crop → Editor, trusted pointer/keyboard. Native проверяет
исходный fit-масштаб; полная native zoom/theme/locale matrix pending.
Команды и логи — TESTING.md. Linux/WebKitGTK, Wayland и macOS/WKWebView для нового контракта
pending; изменение не затрагивает native capture/hotkey backend.

## Дроп настроек редактора (2026-10-17, ADR-083)

Общий Vue chrome удаляет Window capture из main editor и открывает
немодальные настройки темы/языка, отражения и существующее native Settings.
Browser без native callback показывает disabled-пункт с объяснением.
Проверки Windows Chrome/WebView2 и фактические результаты — TESTING.md.
Windows 10 x64: Chrome 155.0.8059.80 — focused browser 10/10 и icons matrix
1/1 passed; WebView2 155.0.4283.45 — 1/1 native passed с external driver.
Синхронный Settings IPC воспроизвёл deadlock; async command устранил его.
Linux/WebKitGTK, Wayland и macOS/WKWebView для этого изменения pending;
capture backend и системные entrypoints не меняются.

## Пипетка до входа на canvas (2026-10-17)

`REQ-TOL-012`: общий Vue lifecycle не создаёт preview при активации;
pointerleave скрывает карточку и очищает transient target. Keyboard nudging
сохраняет начальную точку в видимой области. Проверки Windows Chromium/WebView2
и фактические результаты перечислены в `TESTING.md`; Linux/macOS runtime
для этого исправления не проверялись.

## Windows capture visibility (2026-10-17, ADR-082)

Windows 10 x64 / WebView2 155.0.4283.45: dev physical DXGI capture воспроизвёл
холодный Fit jump и скрытый main после Editor; callback hide устранил
рассинхронизацию Tauri/Win32. Окончательные native проверки и ограничения
записаны в TESTING.md. Linux/macOS visibility routing не меняется;
общий frontend selection gate требует отдельных platform re-smokes.

## Вставка изображений (2026-10-17, ADR-081)

Windows 10 x64: Chrome 155 browser 3/3 и WebView2 155.0.4283.45 external
native 3/3 passed. G/import, bitmap clipboard, drop command, Quick → Editor,
cancel/error, undo/redo, six-image persisted reopen и empty drop проверены.
Picker selection и OS drop event заданы test-only adapter; физический chooser
и перетаскивание из Проводника не подтверждены. Linux X11/Wayland и macOS
по этому изменению не проверялись. Подробные команды/артефакты — TESTING.md.

## Пропорции указателя лупы (2026-10-17, ADR-079)

Linux x86_64/X11: geometry и повторно декодированные Canvas2D/CanvasKit PNG,
circle/rectangle, 1×/2× export и visual light/dark × 50%/100% passed.
Chrome 154.0.8037.57 — browser creation/size 256/512/border 8/0,
preview cancel и undo/redo passed на 2560×1440 harness; screenshots просмотрены.
Tauri/Wry 0.55.1 с external driver собран и запущен дважды, но Quick drag
не создал лупу до проверок новых пропорций (source 400×300, active Loupe,
start hit-test `.cs-canvas-stage`). Native новый контракт остаётся pending;
это не physical capture evidence. Windows/macOS/Wayland не проверялись.
Команды, результаты и артефакты — TESTING.md, `artifacts/loupe-pointer/`.

## Фокус пресетов (2026-10-17)

Linux x86_64 / Chrome 154.0.8037.57: browser pointer/Enter reopen для
4 px / 24 px, произвольное 5 px, Escape/focus и 1024 px fit прошли;
RU/EN × light/dark screenshots просмотрены. Mounted Vue дополнительно
покрывает mixed, лупу, карандаш, подсветку, выделитель и палитру.
Native WebView, Windows/macOS и Wayland runtime в этом исправлении
не запускались. Renderer, document commands и IPC не меняются.
Команды и артефакты — TESTING.md, `artifacts/preset-focus/`.

## Понятные настройки линейки (2026-10-17, ADR-076)

Linux x86_64/X11: Chrome 154.0.8037.57 — 2 browser scenarios passed,
2560×1440 document, четыре режима, crop/history и RU/EN × light/dark при 1024 px.
Wry 0.55.1/WebKitGTK с external driver — production Capture → Quick → Editor
и отдельный restart passed; unit/core/decoded renderer и existing perf gates
прошли. Native fake source — 400×300; native большие изображения, physical capture,
Windows/macOS и Wayland portal runtime не проверялись. Общий check в shared workspace
имеет отдельные blockers из параллельной разработки history; результаты — TESTING.md.

## Shift для линейки (2026-10-17, ADR-074)

Linux x86_64, Chrome 154.0.8037.57: обе Shift, key-only preview, endpoints,
undo/redo и Escape, DPR 1/2 × Fit/1:1 на 2560×1440 browser document;
RU/EN tooltip. Wry 0.55.1/WebKitGTK с external WebKitWebDriver: production
Capture → Quick → Editor, те же input/preview/history/cancel проверки.
Native fake source — 400×300; physical capture и native large images не
проверялись. Windows/macOS и Wayland portal runtime остаются отдельными gates.
Команды, логи и снимки — TESTING.md, `artifacts/ruler-shift/`.

## Меню TopBar (2026-10-17)

Linux x86_64 / Chrome 154: RU/EN × light/dark × окна 1024/1600 px прошли
browser geometry/tooltip regression; просмотрены RU/light и RU/dark screenshots.
Активные команды дополнительно просмотрены в in-app Chromium с `m05` harness.
Это browser evidence; native WebView и Windows/macOS re-smoke pending.

## Прямые участки штрихов (2026-10-17, ADR-073)

Linux x86_64: Chrome 154.0.8037.57 проверяет три pencil brushes и marker через
trusted input на документе 2560×1440, DPR 1/2 × Fit/1:1, ShiftLeft/ShiftRight,
undo/redo, Escape constrained draft и RU/EN tooltip при 1024 px. Tauri/Wry 0.55.1 с external
WebKitWebDriver подтверждает production Capture → Quick → Editor, Escape без
закрытия Quick во время штриха и восстановление
шести pencil v3 и двух marker после restart. Native источник — fake 400×300:
это input/persistence evidence, а не physical capture или native large-image gate.
Decoded Canvas2D exports и CanvasKit parity, 4K/8K fixtures с 12000 samples
на каждый из четырёх штрихов и CPU perf подтверждены отдельно headless suite.
Windows/macOS и Wayland portal runtime в этом изменении не запускались.
Команды, логи и PNG — TESTING.md, `artifacts/straight-strokes/`.

## Разделители Shape/Highlighter (2026-10-17)

Linux x86_64/X11: Chrome 154.0.8037.57 — 2/2 browser matrix passed;
wry 0.55.1, external tauri-driver — 1/1 Capture → Quick → Editor passed.
Проверены 1×21 CSS px, radius 0 и центрирование. Все четыре production-файла
совпадают с проверенной изолированной копией; подробности — TESTING.md,
`artifacts/toolbar-separators/`. Windows/macOS visual re-smoke не выполнялся.

## Кнопки формы фонаря (2026-10-17, ADR-072)

Linux x86_64/X11: Chrome 154.0.8037.57 — browser 2/2 passed: RU/EN ×
light/dark при 1024 px, pointer/keyboard shape selection и undo/redo.
Native Wry 0.55.1/WebKitGTK с external driver — production Capture → Quick →
Editor 1/1 passed для прямых icon buttons и shape/history contract.
Browser использует 2560×1440 document для layout; native — fake source 400×300,
без claim physical capture. Скриншоты RU light/dark и native editor просмотрены.
Windows/macOS/Wayland для изменения не проверялись. Evidence — TESTING.md.

## Чёткие края фонаря по умолчанию (2026-10-17, ADR-071)

Linux x86_64/X11, Chrome 154.0.8037.57: создание фонаря с `feather: null`
и Sharp в панели подтверждено browser spotlight-preview. Defaults Sharp/Чётко
просмотрены в EN/RU light; EN dark assertion также прошёл. Полная матрица
creation-settings прервана существующей ошибкой Text tooltip.
Real Tauri/Wry 0.55.1/WebKitGTK, external driver: production Capture → Quick →
Editor — 1/1 passed для default, preview, move, undo/redo и cancel;
fake source 400×300 не доказывает physical capture. Windows, macOS и Wayland
для этого изменения не проверялись. Команды и артефакты — TESTING.md.

## Подписи выносок (2026-10-17, ADR-065)

Linux x86_64/X11: Chrome 154.0.8037.57 and real Tauri/WebKitGTK through the
external driver verify drag creation, left/right placement, wrapping, reopen,
numeric width, outer grip resize and undo/redo. Browser visual evidence covers
1024 px × RU/EN × light/dark × 50/100/200% zoom; mixed-size paragraphs are centered.
Canvas2D and CanvasKit exports are decoded by the render harness.
Embedded WebKitGTK driver opened the app but did not deliver the creation drag;
the successful native run uses isolated XDG_SESSION_ID and the external driver.
Windows, macOS and Wayland remain unverified for this change. Schema/IPC are unchanged.

## Геометрия текста и переносы (2026-10-16, ADR-062)

Ubuntu 24.04.5 LTS x86_64/X11, Linux 6.8.0-142, Chrome 154.0.8037.57:
новый capped input, unbroken Cyrillic, 12 loaded font faces, style geometry,
manual width >480 px, reflow/undo и reopen проверяются production browser
flows. Background popup — 640/1024/1440; toolbar — обе темы/RU/EN; большой
canvas — 2560×1440. Сохранены screenshots и decoded PNG renderer goldens.

Real Tauri/WebKitGTK 605.1.15 с embedded driver: toolbar mount прошёл, native
canvas gesture не создал contenteditable. `tauri-driver` и `WebKitWebDriver`
отсутствуют в PATH; native editing не подтверждено. Windows/macOS/Wayland для
этого follow-up не запускались. Фактические результаты — TESTING.md.

## Курсор номерных меток (2026-10-16)

`REQ-TOL-006`: Linux x86_64 / Chrome 154.0.8037.57 — browser E2E 1/1 passed
для выбора, hover, временного pan и возврата crosshair. Shared canvas logic
используется также в Quick; native WebView, Windows/macOS и Wayland этим
прогоном не подтверждены. Команды и ограничения — TESTING.md.

## Панель текста и 12 fonts (2026-10-16, ADR-061)

Ubuntu 24.04.5 x86_64/X11, Chrome 154.0.8037.57: RU/EN × dark/light ×
640/1024/1440; все controls видимы, шрифты загружаются из bundle, меню
и editing сохраняют range, PNG повторно декодирован. Native WebKitGTK 605.1.15
отобразил панель; annotation gesture в embedded-driver не создал editor,
поэтому native editing/Quick handoff не объявляются подтверждёнными.

12 Latin/Cyrillic families поставляются статическими Fontsource 5.3.0 assets.
Canvas2D и CanvasKit имеют отдельные decoded renderer goldens. CanvasKit
сохраняет существующий synthesis B/I; pixel-identical DOM↔CanvasKit claim не
делается. Windows/macOS и Wayland для этого изменения не запускались.
Команды, артефакты и известные ограничения — TESTING.md.

## Немедленный результат кропа (2026-10-16)

Linux x86_64, Chrome 154.0.8037.57: 5 specs / 7 scenarios passed для
Apply/Enter → Select/cropped viewport, Cancel/Escape, reset, undo/redo,
non-origin annotations и crop cursors. RU/EN × light/dark × окна
1213×724 / 1024×700: controls 32 px, общая вертикальная ось, keyboard focus,
полные подписи и доступный Apply справа; восемь screenshots просмотрены.
WebKitGTK 2.52.6 / wry 0.55.1 с external tauri-driver 2.1.0:
production fake Capture → Quick → Editor → Crop — 1/1 passed, первый decoded
400×300 canvas без injected frame state; viewport меняется сразу по Enter/Apply.
Native screenshot 1024×700 просмотрен. Для параллельного resident editor
изолирован `XDG_SESSION_ID`; embedded attempt не является native evidence.
Physical capture/mixed-DPI, Windows и macOS остаются без нового runtime smoke.
Команды и результаты — TESTING.md, `artifacts/crop-apply/`.

## Линейка внутри canvas и crop (2026-10-16, ADR-059)

Linux x86_64/X11: Chrome 154.0.8037.57 — 2/2 при 1280/1024 px;
WebKitGTK 2.52.6 / wry 0.55.1, external tauri-driver 2.1.0 — production
fake Capture → Quick → Editor, 1/1. Подтверждены trusted pointer move/endpoint,
transient/cancel и crop с точным Undo/Redo; native/browser screenshots просмотрены.
Core/Vue 750/750, renderer goldens 20/20 и `pnpm check` — passed.
Runtime-каталог теста изолирован от activation socket resident developer app.
Fixture 400×300; physical capture, Wayland/mixed-DPI, Windows/WebView2 и
macOS/WKWebView остаются без нового evidence. Команды/неуспехи — TESTING.md.

## Фонарь и актуальность сборки (2026-10-16)

Linux x86_64 / WebKitGTK 2.52.6, wry 0.55.1, external tauri-driver 2.1.0:
production fake Capture → Quick → Editor — 1/1 passed. Создание и перемещение
проверяют пиксели до release, один undoable commit, redo и aperture cancel;
pointer `isTrusted=true`, screenshots обоих окон просмотрены. Chrome 154.0.8037.57
— 1/1; software render на 4K/8K с decoded export — passed.
Native capture fixture — 400×300, physical capture/mixed-DPI не подтверждены.
Embedded driver не используется как доказательство PointerEvent-жестов.
Windows/WebView2 и macOS/WKWebView требуют отдельного повтора; источник проблемы
общий — старые dist modules после file → directory refactor. Команды — TESTING.md.

## Прямые Cargo-сборки macOS (2026-10-16)

`.cargo/config.toml` задаёт baseline 12.0 для прямых Cargo-команд, согласованный
с Tauri bundle и ADR-038. Boundary regression проверяет совпадение настроек.
Для ошибки cc-rs при host target 15.5 добавлена конфигурация; Intel/ARM native
compile с Xcode 16.4 и runtime capture здесь не проверены: текущий host — Linux.
Поддержка ScreenCaptureKit этим исправлением не подтверждается.

## Плотность подписи линейки (2026-10-16, ADR-058)

Windows x64 / Chrome 155.0.8059.79: native browser pointer, DPR 1/2,
160% → 100%, длина и undo/redo — 2/2 passed; screenshots просмотрены.
Canvas2D decoded preview/export tests, crop/sampling/marker и unit suite — passed.
WebView2 155.0.4283.45 / external tauri-driver 2.1.0: dedicated production
fake Capture → Quick (zoom 3.6) → Editor (160%/100%) — 1/1 passed;
trusted pointer, измеренная длина и undo/redo, screenshots просмотрены.
Команды и initial failures — TESTING.md. WebKitGTK/WKWebView
и физический mixed-DPI этим изменением не подтверждены.

## Единое числовое поле (2026-10-16)

Windows x64: Chrome 155.0.8059.79 подтверждает панель размера подписи линейки
при 1024/1280 px, RU/EN и light/dark; −/+, точный ввод и Escape проходят.
WebView2 155.0.4283.45, external tauri-driver 2.1.0: production fake Capture
→ Quick с non-origin crop → Editor, те же действия в обоих окнах — 1/1.
Оба native screenshot просмотрены; команды и component evidence — TESTING.md.
WebKitGTK/WKWebView и physical capture не проверены.

## Центр поворота элементов (2026-10-16)

Windows x64: Chrome 155.0.8059.79 и WebView2 155.0.4283.45 подтвердили
поворот созданных через UI Shape/Arrow вокруг центра локальной рамки.
Native production fake Capture → Quick → Editor — 1/1, external tauri-driver
2.1.0, trusted pointer/keyboard; editor также проверяет numeric preview/cancel,
commit и undo/redo. Скриншоты Quick/editor просмотрены. Это общая DOM-free
механика transform, но отдельного Linux WebKitGTK/macOS WKWebView evidence
для данного исправления нет. Фактические команды и артефакты — TESTING.md.

## Переключение панели лупа ↔ фонарь (2026-10-16)

Windows x64: Chrome 155.0.8059.79 и WebView2 155.0.4283.45 подтверждают
повторный выбор лупы/фонаря кликами на canvas и изменение только текущего
объекта. Native production fake Capture → Quick → Editor — 1/1, external
tauri-driver 2.1.0; скриншоты обоих окон просмотрены. Ошибка ordered preview
устранена также для censor. Unit: 711/711. Команды и initial failures — TESTING.md.
WebKitGTK/WKWebView и physical capture не проверены.

## Компактные настройки лупы (2026-10-16)

Windows x64: Chrome 155.0.8059.79 — создание лупы и compact settings;
WebView2 155.0.4283.45 — production fake Capture → Quick → Editor,
zoom/size defaults, numeric cancel, shape, border, shadow и Undo/Redo.
External tauri-driver 2.1.0, trusted contextmenu/keydown.
Финальная палитра без overflow проверена в Chrome и WebView2; см. TESTING.md.
WebKitGTK/WKWebView, physical capture и mixed-DPI этим срезом не проверены.

## Pencil / Spotlight / Ruler (2026-10-16, ADR-056)

Windows x64: Chrome 155.0.8059.79 проверяет компактные настройки при 1024/1280 px,
RU/EN и light/dark. WebView2 155.0.4283.45 через external tauri-driver 2.1.0
прошёл production Capture → Quick с non-origin crop → Editor: области фонаря,
настройки кисти, clipboard и Alt endpoints. Pointer/keyboard события trusted.
Capture здесь fake-platform; физических платформенных гарантий этот тест не даёт.
Отдельный запуск восстанавливает документ с составными фонарями и defaults.
Все 22 native scenarios имеют успешное выполнение с изолированными повторами;
общий прогон во время параллельного native runner не считается единым pass.
Оба software renderer backend проверяются decoded PNG при 1×/2×; отдельный
4K/8K harness подтверждает preview/export pixels больших документов.
WebKitGTK/WKWebView и физический mixed-DPI pending. Подробности — TESTING.md.

## Проектные UI-иконки (2026-10-16, ADR-055)

Лупа B1: Windows x64 / Chrome 155.0.8059.79 — SVG 70/70 и browser 2/2,
16–32 px при DPR 1/2, обе темы, RU/EN, disabled/focus и выбор инструмента.
Два запуска WebView2 155.0.4283.45 остановились на создании pencil stroke
в Quick до выбора лупы; dedicated native handoff остаётся pending.
Evidence: `artifacts/custom-icons/loupe-adopted/`, команды — TESTING.md.
Linux/WebKitGTK и macOS/WKWebView не проверены; capture guarantees не меняются.

Шахматная `privacy` 3×3 с полутонами 15/100%: Chrome 155.0.8059.79 —
2/2 (DPR 1/2, RU/EN, обе темы). WebView2 155.0.4283.45 подтвердил её
отображение и выбор в Quick; полный dedicated handoff остановился на перекрытии
Select панелью настроек цензуры. Native final остаётся pending; TESTING.md
содержит команды и evidence `artifacts/custom-icons/censor-adopted/`.

Принятый фонарь «Встык»: Chrome 155.0.8059.79 — gallery и shell 2/2,
WebView2 155.0.4283.45 — dedicated Capture → Quick → Editor 1/1 после
подключения геометрии. Evidence: `artifacts/custom-icons/spotlight-adopted/`.
WebKitGTK/WKWebView для этой иконки не проверены.

Windows x64: Chrome 155.0.8059.79 проверяет реальные `UiIcon`, две темы,
16/18/20/24/32 CSS px при DPR 1/2, отсутствие выхода stroke за viewBox,
RU/EN и disabled/focus. WebView2 155.0.4283.45 проверяет dedicated production
Capture → Quick → Editor с fake-platform capture: пипетку, оба штриха,
native keyboard/focus и undo/redo, затем editor RU/EN × light/dark.
Этот native pass выполнен до финальной визуальной правки по референсам;
повтор окончательного варианта блокируется текущими TS errors параллельного
spotlight/core среза на build stage. Финальный browser/raster pass выполнен.
Начальные preferences прогретого Quick не проверяются как live-синхронизация
с main; это не новый контракт иконок. Физический mixed-DPI и Linux/macOS/WebKit
runtime не проверены. App/tray assets, capture capabilities и release targets
не меняются. Дополнительные проверки и ограничения — TESTING.md.

## Числовые controls и preview (2026-10-16, ADR-054)

Windows NT 10.0.19045 x64: Chrome 155.0.8059.79 проверяет shell controls,
RU/EN, light/dark, 1024 px и inline text; WebView2 155.0.4283.45 проверяет
production Capture → Quick → Editor с fake capture, native pointer/keyboard
и non-origin crop (первый прогон 4 spec files / 9 tests). Preview меняет пиксели до commit,
сохраняя committed document; отмена и undo/redo проверены. 4K decoded RGBA
preview/commit/export совпадают в CanvasKit render harness. Software perf suite
прошёл, но это не аппаратная GPU гарантия. Логи и команды — TESTING.md.

В дополненном native прогоне есть failures общей Quick suite (sampling/tool
switch и создание стрелки), а также отдельный сбой driver port. Inline text
background повторно прошёл 1/1. Повтор shape-only остановлен до runtime из-за
параллельного обновления shared frontend dist; ограничения и логи — TESTING.md.

После завершения параллельных сборок shape-only WebView2 повтор прошёл 1/1:
production Quick → Editor, live opacity и история, defaults и 31 форма.
`tauri-shape-isolated.log`; отдельный inline background повтор — 1/1 passed.

Linux/macOS/WebKit runtime этого изменения не проверен и остаётся pending.
Schema v7, IPC, Rust, capture backends и навигационный zoom не меняются.

## Вложенные настройки после выделения сноски (2026-10-16, ADR-053)

Windows x64 / Chrome 155 воспроизводит удалённое меню Shape defaults и
подтверждает привязку к trigger после исправления. Исходный shared regression
создаёт сноску через настоящий pointer/keyboard input и проверяет переключение
меню, Escape/focus и неизменность документа. Полная проверка текущего workspace
ограничена параллельными UI-изменениями; отдельный worktree проверяет только
исправление placement. Команды, результаты WebView2 и артефакты — TESTING.md.
Изолированный Windows WebView2 155.0.4283.45 прошёл production fake Capture →
Quick → Editor с измерением привязки меню, Escape/focus и сохранности документа;
дополнительно прошли native shape catalogue и Arrow scenarios (3 tests).
Physical capture, Linux/WebKitGTK и macOS/WKWebView этим Windows-срезом не
подтверждаются; capture capabilities и release guarantees сохраняются.

## Компоновка палитры и custom swatch (2026-10-15)

Windows x64 / Chrome 155.0.8059.79: 9 browser tests проверили два полных ряда
цветов, отдельный custom action, интервалы 10/23 px, RU/EN и light/dark.
WebView2 155.0.4283.45: highlighter 1/1, arrow 2/2 и отдельный shape replay
1/1 подтвердили palette selection/defaults, embedded stroke/fill в Quick/editor,
focus/history и закрытие без скачка. Capture использует fake-platform;
Linux/WebKitGTK, macOS/WKWebView и physical capture остаются отдельными gates.
Команды, первоначальные сбои test mount/input и artifacts — TESTING.md.

## Закрытие цветовой палитры (2026-10-15)

Windows 10 x64: Chrome 155.0.8059.79 подтвердил выбор цвета и закрытие палитры
выделенной стрелки; WebView2 155.0.4283.45 проверил preset/custom commit,
Escape и click outside в Quick Capture и editor через production fake capture.
Покадровый замер показывает смещение 0 px при исчезновении. Команды и
ограничения — TESTING.md. Linux/WebKitGTK, macOS/WKWebView и physical capture
не проверялись; platform capabilities не меняются.

## Курсоры crop handles (2026-10-15)

Windows x64 / Chrome 155.0.8059.79 и WebView2 155.0.4283.45: все восемь
направлений resize и move внутри рамки проверены на полном crop и preset 1:1.
Native production fake capture → Quick → Editor и stroke cursor regression
прошли (2 scenarios / 2 tests). Linux/WebKitGTK, macOS/WKWebView и physical
capture остаются отдельными gates. Команды и артефакты — TESTING.md.

## Курсор Pencil / Highlighter (2026-10-15)

Windows x64: Chrome 155.0.8059.79 и настоящий WebView2 155.0.4283.45 подтвердили
крест на холсте для обоих инструментов, временный `grabbing` и возврат креста.
Native сценарий проходит Capture → Quick → Editor с fake-platform. Это UI
evidence; Linux/WebKitGTK, macOS/WKWebView и physical capture не проверялись.
Команды и артефакты — TESTING.md.

## ToolRail без дополнительной стрелки (ADR-052)

Windows x64 / Chrome 155 и WebView2 155.0.4283.45: browser tool-ux 5/5,
native quick-chrome 6/6 passed. Общая кнопка инструмента сохраняет ПКМ defaults,
вложенные controls, Escape и focus; дополнительной кнопки `⌄` нет.
Native capture использует fake-platform; physical capture, Linux/WebKitGTK
и macOS/WKWebView остаются отдельными gates. Команды и артефакты — TESTING.md.

## Расширенный каталог фигур и popover placement (ADR-051)

Windows x64 / WebView2 155.0.4283.45: четыре native сценария / пять tests passed. Проверены Capture → Quick → Editor, 31 palette item, реальные keyboard/pointer actions, nested focus/history, сохранение cylinder и повторный запуск. Рендеринг Canvas2D/CanvasKit и decoded exports 1×/2× покрывают общий каталог. Browser Chrome 155 — 2 files / 8 tests passed; команды и артефакты — TESTING.md. Physical capture, macOS/WKWebView и Linux/WebKitGTK не проверены этим срезом. Schema v7 и IPC сохраняются; старые сборки не читают новые shape enum values.

## Выделитель: фоновый анализ

Общий Vue/core contract использует Worker, worker-side createImageBitmap и
OffscreenCanvas. При недоступности этих API или чтения source автоподбор показывает
объяснимый fallback «Выделить»; все ручные эффекты доступны. Windows/WebView2 и
Chromium проверяются отдельными runtime E2E. Результаты Windows не являются
подтверждением WKWebView/WebKitGTK, Linux capture или Wayland; их runtime evidence
остаётся отдельной проверкой. CSP не добавляет внешние сетевые источники.

## Quick handoff и palette sampling (2026-10-15)

Windows 10 Home 19045 x64 / WebView2 155.0.4283.45, external tauri-driver 2.1.0:
`quick-editor-handoff` 1/1 и `quick-chrome` 6/6. Production fake capture →
non-origin crop → arrow → один Editor click → Delete/Undo/Redo подтверждает
editable annotations без ink в immutable source. Palette → eyedropper →
click/keyboard/ПКМ tool → draw проверен в Quick и main. Test-only focus
capability не меняет production permissions. Physical capture, Linux/macOS
и mixed-DPI этим evidence не расширяются; команды и artifacts — TESTING.md.

## Компактные shape controls (2026-10-15)

Windows 10 Home 19045 x64 / WebView2 155.0.4283.45: native `shape-toolbar`
прошёл production fake capture, создание/форматирование в Quick, перенос в
editor и defaults через trusted ПКМ/keyboard. Browser Chrome 155.0.8059.79
дополняет это RU/EN × light/dark и размерами окна 1024/1280 px. Оба режима
используют общий `ShapeFormattingToolbar`; document/IPC/platform adapters
сохраняются. Это evidence интерфейса, не новая гарантия physical capture либо
Linux/macOS. Команды, screenshots и ограничения — TESTING.md.

## Arrow selection и Quick toolbar (2026-10-15)

Windows 10 Home 19045 x64 / WebView2 155.0.4283.45: Arrow 2/2, viewport 1/1
и Quick chrome 5/5 прошли с external tauri-driver 2.1.0. Non-origin Quick
frame → создание стрелки проверяет позицию панели относительно нарисованных
bounds, nested menu/Escape и selection handles. Insets 5/5 px и прямой
UiSeparator подтверждены browser и native geometry. Pixel tests включают DPR 2
и bounded 8K overlay, но не заменяют mixed-DPI/native WebKit проверки.
Fake capture, команды, snapshots и ограничения — TESTING.md.

## Windows: исключение editor из frozen desktop (2026-10-15)

Windows 10 Home 19045 x64 / WebView2 155.0.4283.45: production Area через
реальный DXGI прошёл три capture/cancel/retry на контролируемом desktop;
27 decoded pixels и просмотренные screenshots подтверждают отсутствие editor.
Main hide подтверждается на оконном потоке после suppression hide-animation
и DWM barrier. Это single-display local evidence; ARM64, mixed-DPI, Window
target, Linux/macOS и полная release matrix остаются отдельными проверками.
Команда, scoped test identity и артефакты — в TESTING.md.

## Windows WebView harness (2026-10-15)

Полный native suite: 15 scenarios / 18 tests, Windows x64 / WebView2
155.0.4283.45, `artifacts/tool-ux/tauri-final-accepted.log`. Проверки используют
scoped app data и явный EdgeDriver userDataFolder; defaults и native repository
проверяются раздельно. Driver cache/patches входят в lockfile. См. TESTING.md.

Windows x64 / WebView2 Evergreen 155.0.4283.45 подтверждён scoped native-input
прогоном: Quick chrome 4/4 и alpha asset transport 1/1. Harness использует
external tauri-driver 2.1.0 + подходящий EdgeDriver; embedded 1.3.0 DOM input
не считается доказательством настоящих ПКМ/клавиатуры. Runtime и cleanup fixes,
команды, screenshot и ограничения описаны в TESTING.md. Linux/macOS provider
не изменён; новая полная cross-platform приёмка и physical capture остаются pending.

## Поддерживаемые цели

| Платформа       | Архитектура    | Захват                                                                                                    | Горячие клавиши                                       | Неофициальный CI artifact |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------- |
| Linux X11       | x86_64         | `x11rb` visible drawable + target-visual frozen overlay; local compositor/quick runtime passed 2026-08-24 | Tauri/global-hotkey                                   | deb, AppImage             |
| Linux X11       | aarch64        | `x11rb` visible drawable + собственный frozen overlay; compositor runtime re-smoke pending                | Tauri/global-hotkey                                   | deb, AppImage             |
| GNOME Wayland   | x86_64/aarch64 | Screenshot portal; GNOME ≤42: optional gnome-screenshot; v3 Window                                        | XDG GlobalShortcuts, GNOME GSettings или CLI fallback | deb, AppImage             |
| KDE Wayland     | x86_64/aarch64 | XDG Screenshot portal                                                                                     | XDG GlobalShortcuts или CLI fallback                  | deb, AppImage             |
| wlroots Wayland | x86_64/aarch64 | Screenshot portal; optional grim при совместимом compositor                                               | Portal при наличии, иначе CLI fallback                | deb, AppImage             |
| Windows         | x86_64         | DXGI/D3D11 frozen Area Quick surface; single-HWND/pixel replay passed; cross-monitor smoke pending        | Tauri/global-hotkey                                   | NSIS exe                  |
| Windows 11      | ARM64          | DXGI/D3D11 frozen Area Quick surface; native Window selector; runtime smoke pending                       | Tauri/global-hotkey                                   | NSIS exe                  |
| macOS           | Intel          | Native AppKit Area/Window; CG 12.0–12.2, intended SCKit 12.3+ routing; runtime smoke pending              | later slice: Tauri/global-hotkey                      | universal DMG             |
| macOS           | Apple Silicon  | Same versioned native adapter as Intel; compile/CI until owner runtime                                    | later slice: Tauri/global-hotkey                      | universal DMG             |

macOS deployment baseline зафиксирован ADR-038 как 12.0. Остальные точные
минимальные версии ОС фиксируются во время финальной runtime-проверки capture
API и webview. Release baseline не повышается без ADR и CI-доказательства.

## Capture capabilities

| Возможность      | X11                                            | Wayland portal                                         | Windows                                     | macOS                        |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- | ---------------------------- |
| Area             | One fullscreen Quick surface: select → edit    | Quick selection полного single-shot PNG                | One fullscreen Quick surface: select → edit | AppKit; frozen quick-mode    |
| Screen           | Root or Composite Overlay Window               | Полный single-shot desktop                             | DXGI virtual screen                         | Direct after permission      |
| Window           | Direct/window list                             | Portal target/capability                               | Direct/window list                          | Native; direct document      |
| Active window    | Window manager adapter                         | Portal when exposed, otherwise clear unavailable state | Native                                      | Not advertised (later slice) |
| Repeat last area | Stored physical/image geometry with validation | Новое Quick выделение в разрешённом Monitor            | Stored geometry                             | Not advertised (later slice) |
| Delay            | App countdown before backend invocation        | App countdown before portal                            | App countdown                               | App countdown                |
| Cursor           | Capability-dependent                           | Portal-dependent                                       | Backend option                              | Not advertised               |

Area является единственной capture action, которая заканчивается в quick-mode.
На X11/Windows/macOS quick surface сохраняет frozen desktop и physical
selection coordinates; macOS Area использует единый frozen multi-display
frame. Wayland использует полный разовый PNG desktop и тот же Quick lifecycle;
рамка может расширяться до границ кадра. Repeat на Wayland получает новый PNG
и начинает новое выделение без постоянной сессии. Screen, Window
и Active Window продолжают direct-to-editor flow; Repeat остальных платформ
сохраняет собственный контракт.

UI получает `CaptureCapabilities` и не показывает неподдерживаемый режим как рабочий. Если функция временно недоступна, control disabled с объяснением и доступной альтернативой.

## Hotkey behavior

| Сценарий                 | Требуемое поведение                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Комбинация свободна      | Сначала регистрируется новая, затем сохраняется и снимается старая        |
| Комбинация занята        | Новая не сохраняется, старая остаётся рабочей, показана ошибка            |
| Wayland portal доступен  | Открывается системный binding flow, сохраняется portal handle/token       |
| Portal не поддерживается | Показана точная команда и инструкция desktop environment                  |
| AppImage перемещён       | Fallback-инструкция обновляет абсолютный executable path                  |
| Приложение уже запущено  | CLI передаёт action single-instance процессу                              |
| Приложение не запущено   | Бинарник запускает минимальный capture lifecycle                          |
| Hotkey во время capture  | Повтор игнорируется либо ставится одна команда; параллельных overlays нет |

## Multi-monitor и DPI

Обязательные layouts:

- один монитор 100%;
- два горизонтальных монитора с отрицательной X-координатой;
- вертикально расположенные мониторы;
- primary 100% + secondary 150/200%;
- Retina/HiDPI macOS;
- монитор отключён после сохранения repeat-area;
- окно пересекает два монитора.

Хранятся logical и physical bounds с monitor ID/scale snapshot. Перед repeat-area геометрия валидируется и при необходимости ограничивается текущим monitor layout.

## Permissions и ошибки

### Linux

- Отмена portal считается ожидаемым результатом, а не ошибкой приложения.
- Недоступный portal backend диагностируется отдельным capability/error code.
- Приложение не устанавливает `grim`, `slurp` или desktop extensions.
- On composited X11, `_NET_WM_CM_Sn` selects the Composite Overlay Window as
  the frozen source. A non-composited session uses root; an active compositor
  with no usable Composite 0.3 overlay fails instead of returning a known
  incomplete root frame. The selector converts canonical RGBA into the target
  root visual/depth instead of replaying the Composite Overlay Window image.
  After Area confirmation, the same canonical RGBA becomes a top-down 32-bit
  BMP held by native memory transport; full-desktop PNG compression and disk
  staging are outside the mouse-up presentation path. Local GNOME X11
  compositor/quick runtime passed on 2026-08-28; mixed-DPI, cross-monitor and
  repeated optimized latency evidence remain pending.
- UI capture waits for the hidden main client and its Mutter frame before the
  request crosses into native capture. CLI, tray and hotkey ingress enforce the
  same gate in the native orchestration path. A visible client/frame must remain
  absent for 300 ms before root acquisition; an already-hidden resident process
  skips a newly-started settle interval, while a just-hidden Quick surface waits
  only its unexpired remainder so Mutter's fade actor cannot enter the frame.
- X11 Area decodes the captured root into owned binary transport before its
  first visible frame, then maps one prewarmed fullscreen Quick WebView. The
  same scene and overlay canvas own both the initial crosshair/dim/dashed crop
  gesture and subsequent annotation state. No native Area selector, retained
  overlay, second top-level XID or reveal-time window replacement is allowed.
  The native selector code remains available only for Window target. Resident
  GNOME 46/X11 runtime evidence on 2026-08-30 kept XID `0x42000fc` across a
  physical `300,250 → 1000,700` drag and showed the same 700×450 dash before
  adding Quick tools/actions; Escape returned typed `cancelled`. Direct xRGB32
  → top-down BMP staging and overlapped GTK warmup reduced the resident
  dev/debug command → focused selecting measurement to 723 ms from a visible
  editor and 607 ms from an already-hidden process.

### macOS

- Screen Recording permission проверяется до Screen snapshot. Отказ —
  typed `permissionDenied`, без прозрачных окон и без overlay.
- UI объясняет переход в System Settings (`Privacy_ScreenCapture`) и Retry.
- ADR-110: на macOS доступны только Area и Screen; Window target не объявляется,
  tray menu не содержит «Снимок окна».
- Deployment baseline — macOS 12.0. Native AppKit selector обслуживает Area и
  Window. Intended pixel routing: legacy CoreGraphics fallback на 12.0–12.2,
  one-shot `SCStream` на 12.3–13, `SCScreenshotManager` и system window picker
  на 14+; API availability проверяется во время выполнения, а маршрут 14+
  дополнительно требует SDK 14+ при сборке (ADR-109).
- Area использует frozen multi-display frame и quick-mode. Window создаёт
  direct document без quick-mode.
- Локальный macOS 12.7.6 x64 startup smoke (2026-08-29) подтвердил только
  Screen-only поведение существующего среза и отсутствие prewarmed
  `quick-capture` окна; он не подтверждает новую Area/Window архитектуру.
- macOS Area follow-up (2026-08-29) исправляет два code-level дефекта,
  обнаруженных по первому визуальному кадру: AppKit menu-bar constraint для
  borderless selector и преждевременный reveal hidden WKWebView до готового
  composited chrome. Frontend 15/15, native bridge 16/16 и boundary 15/15
  прошли; runtime visual status остаётся pending до перезапуска локального
  `tauri dev` и проверки полного menu bar плюс первого видимого quick-frame.
- Intel и Apple Silicon делят один versioned adapter. Compile evidence идёт
  через CI `macos-15` / `macos-15-intel`; runtime support Area/Window не
  заявляется до реальных decoded-pixel smokes на ветках 12.0–12.2, 12.3–13 и
  14+.

### Windows

- Windows backend uses DXGI Desktop Duplication plus a D3D11 CPU-readable
  staging texture for every attached output. It assembles one physical
  virtual-desktop frame under a per-monitor-v2 DPI context. Screen and Active
  Window are direct snapshots. Area prepares duplication after the editor is
  hidden, registers/shows a transparent non-activating compositor pulse, waits
  for `DwmFlush`, then acquires one full frozen frame and opens the prewarmed
  fullscreen Quick WebView directly in `selecting`. The hidden window is moved
  onto the pointer monitor with a synchronous non-activating `SetWindowPos`
  before that first show, so Tao's deferred fullscreen cannot flash the
  restored 800×600 window. The first crop and later
  annotation chrome share its mounted scene/overlay hosts. Window alone keeps
  the native selector, foreground
  restore, transparent compositor pulse, DWM flush and final acquire/crop. A
  pointer-only update is retried only when
  it has no desktop resource; protected-content masking and rotated outputs fail
  explicitly, and there is no GDI fallback. Unit assembly/crop and
  a local interactive-desktop compositor probe pass on Windows x64 (2026-08-12);
  the Task Manager/topmost-window pixel smoke is still required before a
  `supported` claim.
- Windows 10 build 19045 x64 repair replay (2026-08-30) kept fullscreen Quick
  HWND `0x4078C` before and after the first drag, showed no native Area selector
  HWND and preserved visible frozen desktop pixels while changing the same
  surface from selecting hint to a 1225×750 physical crop with tools/actions.
  The loading overlay was absent and Escape removed the Quick window.
  Cross-monitor validation remains pending.
- Локальный M01 smoke на Windows x64 подтвердил WebView2 runtime: asset decode,
  binary IPC/Blob fallback и typed error для corrupted PNG.
- Повторная локальная regression-проверка 2026-08-10 на Windows 10 Home 22H2
  (build 19045), x86_64, commit `3dcfcc5`: `cargo test --workspace` прошёл
  46/46, `pnpm test` прошёл 123/123 и `pnpm test:render` прошёл 6/6 при Node
  `22.23.1`. Migration на `@lucide/vue@1.31.0` сняла production-build blocker;
  browser harness больше не зависит от POSIX shell syntax и сохраняет Vite
  server между spec workers. M01/M02/M06 browser specs прошли, M05 остаётся
  failed на UI rounding/interactability assertions. Это portable
  Rust/headless/browser coverage без WebView2 или native-capture claim и не
  меняет статус platform support.
- CanvasKit/WebGL startup в проверенном WebView2 перешёл на Canvas2D fallback;
  это не подтверждает primary CanvasKit path для Windows.
- M08 Windows browser acceptance (2026-08-15, Chrome 151.0.7922.138) passed its
  focused 8/8 crop/precision scenarios and visually inspected 1440×900 and
  1024×700 EN/RU screenshots plus the ruler visual/default-settings artifact.
  This is browser evidence only. The feature-gated
  real-Tauri binary built, but `@wdio/tauri-service` timed out waiting 60 seconds
  for its embedded WebDriver on port 4445 before the test body. Therefore the
  clean decoded-source crop mount and native clipboard readback remain pending.
  This does not claim a full browser-suite or real-Tauri pass, and the saved
  gitignored `artifacts/tauri-e2e/wdio.log` does not contain the timeout
  transcript; durable real-Tauri evidence remains pending. No Windows/WebView2
  support claim is added.
- Mixed DPI, политика запуска в фоне, capture и hotkey остаются pending до M04
  system smoke.
- Повторная установка более новой CI-сборки не должна удалять shortcut configuration или library.

## Runtime evidence

Во время разработки runtime evidence собирается только на текущей системе
владельца проекта. Другие строки matrix получают code/compile/fake-platform
coverage, но остаются без runtime support claim. Полный список ниже обязателен
для финальной platform/release acceptance после функционального завершения
приложения.

Каждая platform-row получает:

- OS/version и architecture;
- desktop/session (`X11`, `GNOME Wayland`, `KDE Wayland`);
- app artifact SHA;
- capture action;
- hotkey/CLI activation;
- monitor layout;
- expected/actual result;
- ссылку на log/screenshot/test run.

Статус `supported` разрешён только после реального smoke, а не после успешной компиляции.

## M01/M04 capability baseline

- `xcap` 0.9.7 отклонён из-за security advisories в dependency graph; решение и отдельный `x11rb` 0.14.0 boundary зафиксированы в ADR-019.
- Локальный Ubuntu/GNOME X11 controlled-window smoke подтвердил monitor enumeration, physical millimetres, coordinates, 96×64 RGBA capture и SHA-256. До появления устойчивой CI artifact URL это локальная диагностика, не статус `supported`.
- Локальный X11 portal probe увидел Screenshot v2 без `AvailableTargets` и без GlobalShortcuts. Это диагностика dbus на X11-сессии, не substitute для Wayland runtime.
- Локальный Ubuntu 24.04 / GNOME Wayland smoke (2026-08-09, SHA `7ff7d283`, xdg-desktop-portal 1.18.4, gnome portal 46.2): Screenshot portal v2 подтвердил interactive area capture (640×360 RGBA, decoded PNG SHA-256 `361b7fa2…`); `availableTargets: 0` (monitor/window target через portal v3 недоступен); GlobalShortcuts portal backend отсутствует → hotkey capability `unavailable`, CLI fallback. Evidence: `artifacts/m01/portal-probe.json`, `portal-screenshot.json`, `portal-shortcuts.json`, `portal-invalid-uri.json`. Статус GNOME Wayland capture — локальная диагностика, не `supported` без CI artifact URL. KDE Wayland и полный shortcut bind/activate cycle остаются pending.
- WebKitGTK 2.52.3, локальный Windows x64 / WebView2 smoke (2026-08-08) и
  локальный macOS 12.7.6 x64 / WKWebView 605.1.15 smoke (2026-08-09)
  подтвердили scoped asset decode, binary IPC fallback и typed error для
  corrupted PNG. Во всех трёх runtime CanvasKit/WebGL startup перешёл на
  Canvas2D fallback.
- Windows M01 Tauri E2E: `pnpm test:e2e:tauri` (2026-08-09, Windows x64 /
  WebView2) прошёл четыре per-scenario прогона — `tauri-foundation.e2e.ts`,
  `tauri-renderer-alpha.e2e.ts`, `tauri-renderer-binary.e2e.ts`,
  `tauri-renderer-corrupted.e2e.ts`; артефакты в `artifacts/tauri-e2e/junit-*`.
- macOS M01 Tauri E2E: `pnpm test:e2e:tauri` (2026-08-09, macOS 12.7.6 x64 /
  Intel i7-4770HQ / WKWebView 605.1.15, SHA `22119a9`) прошёл те же четыре
  per-scenario прогона; Canvas2D startup fallback, asset alpha decode, binary
  ICC fallback и corrupt error подтверждены; артефакты в
  `artifacts/tauri-e2e/junit-*`.
- Linux M01 Tauri E2E на GNOME Wayland: `pnpm test:e2e:tauri` (2026-08-09,
  Ubuntu 24.04 x64 / WebKitGTK 2.52.3, SHA `7ff7d283`) прошёл четыре
  per-scenario прогона на Wayland-сессии; Canvas2D startup fallback, asset
  alpha decode, binary ICC fallback и corrupt error подтверждены; артефакты в
  `artifacts/tauri-e2e/`.
- M04 clean-profile Tauri E2E на локальном WebKitGTK (2026-08-10):
  `m04-clean-profile-capture.e2e.ts` начал с пустого app data, вызвал
  production `capture_request`, сохранил и заново смонтировал первый документ
  через repository и decoded asset. Пиксели поставляет только feature-gated
  fake native adapter; frontend state и image bytes не seed-ятся. Evidence:
  `artifacts/tauri-e2e/junit-m04-clean-profile-capture-0-0.xml`. Это доказывает
  orchestration/mount-flow, но не native capture или platform support.
- M04 local Ubuntu/GNOME X11 x86_64 smoke (2026-08-09):
  `pnpm smoke:m04:x11:screen` захватил root 2560×1440, декодировал PNG,
  передал bytes через owned transport, сохранил immutable original и создал
  editable document. Evidence: `artifacts/m04/x11-screen.json`. Это только
  прямой X11 screen flow; area overlay, window/active-window, cursor,
  multi-monitor/repeat и X11 hotkeys остаются pending, поэтому это не статус
  `supported`.
- M04 local Ubuntu/GNOME X11 x86_64 frozen-area smoke (2026-08-09):
  `pnpm smoke:m04:x11:area` captured the root before mapping a native X11
  overlay, used an automated 100,100→400,300 drag, and persisted the resulting
  300×200 document. Evidence: `artifacts/m04/x11-area.json`. `xdotool` is only
  the local smoke driver, never a product dependency. The overlay keeps the
  first valid Area drag completes on primary pointer release and opens quick
  mode; `Enter` is the equivalent keyboard confirm path before a selection is
  made. Move/resize, arrow-key physical-pixel nudge and Shift+arrow resize are
  available in quick mode. The isolated 2026-08-24 Ubuntu/GNOME X11 smoke
  completed a 600×400 primary-pointer drag and mapped quick mode without an
  injected `Enter`. The later resident-editor button smoke waits for the X11
  server to observe both the main client unmapped and Mutter's separately owned
  `_MUTTER_FRAME_FOR` decoration destroyed, then holds that state through a
  compositor-settle interval before acquiring pixels. The inspected selector
  frame contains only the desktop behind the editor; Escape restores `main`.
  Mixed-DPI/cross-monitor interaction remains pending.
- Ubuntu 24.04/GNOME 46 X11 packaged-debug repair smoke (2026-08-24): a clean
  isolated profile accepted CLI Area, the native selector completed a physical
  300,220→900,620 drag, and WebKitGTK mapped `Cute Screen Quick Capture` at
  2560×1440 with the exact 600×400 frozen crop, visible annotation/action
  chrome and no foreign-visual corruption. Close returned typed terminal
  `cancelled` without materialization. Screenshot:
  `/tmp/codex-shot-2026-08-24_18-15-32.png`. The historical
  `smoke:m04:x11:area` driver now stops at the quick-draft terminal boundary and
  requires a harness update before it can again claim a complete persisted flow.
- The follow-up continuous-motion smoke moved the X11 cursor hint 472 times and
  changed a pressed Area rectangle 120 times. Frozen-background damage restore
  left only one current hint/rectangle in
  `/tmp/codex-shot-2026-08-24_18-31-00.png` and
  `/tmp/codex-shot-2026-08-24_18-31-30.png`; no XOR trails remained.
- Selector-visibility follow-up (2026-08-28): warm CLI activation hid a visible
  resident editor, held the selector for more than four seconds and acquired a
  frozen Chrome frame without the editor or its compositor fade. A physical
  600×650 drag across a white LibreOffice page kept the full two-tone Area frame
  visible. The hint rendered readable text plus a camera body, top and centred
  lens. Evidence:
  `/tmp/cutescreen-selector-predrag-final-2026-08-28.png` and
  `/tmp/cutescreen-selector-white-page-drag-final-2026-08-28.png`.
- M04 local Ubuntu/GNOME X11 x86_64 selector-cancel smoke (2026-08-09):
  `pnpm smoke:m04:x11:area-cancel` cancelled an active Area operation through
  the shared controller, returned terminal `cancelled` without a document, and
  exercised native overlay cleanup (pointer/keyboard ungrab and destroy).
  Evidence: `artifacts/m04/x11-area-cancel.json`.
- M04 local Ubuntu/GNOME X11 x86_64 cursor smoke (2026-08-09):
  `pnpm smoke:m04:x11:screen-cursor` completed through the XFixes version
  handshake; persisted capture metadata records `cursor.requested: true` and
  `result: included`. Evidence: `artifacts/m04/x11-screen-cursor.json`.
- M04 local Ubuntu/GNOME X11 x86_64 window-selector smoke (2026-08-09):
  `pnpm smoke:m04:x11:window` read the EWMH stacking list, excluded desktop,
  dock and transient/tool window types, highlighted the clicked topmost client
  over a frozen root frame,
  and persisted a 2560×1331 document. Evidence:
  `artifacts/m04/x11-window.json`. Frame-extents/multi-monitor validation and
  keyboard move/resize/nudge semantics remain pending.
- The selector policy also rejects root, unmapped/minimized and `_NET_WM_PID`
  windows owned by the current Tauri process, without title matching; its
  deterministic unit test covers those exclusions plus desktop/dock. Invalid
  or zero geometry is rejected before an overlay rectangle is created.
- Window/ActiveWindow capability is independently gated by the needed EWMH
  atoms. A usable X root only enables Screen/Area; it cannot make an unavailable
  window selector look supported.
- M04 local Ubuntu/GNOME X11 x86_64 active-window smoke (2026-08-09):
  `pnpm smoke:m04:x11:active-window` resolved `_NET_ACTIVE_WINDOW` and cropped
  its 2560×1331 bounds from one frozen root frame before persisting the decoded
  original. Evidence: `artifacts/m04/x11-active-window.json`. It reuses the
  selector inventory, so minimized, self and non-user targets return
  `invalidTarget`; occluded pixels retain the visible frozen-compositor result.
  Multi-monitor runtime validation remains pending.
- M04 local Ubuntu/GNOME X11 x86_64 repeat smoke (2026-08-09):
  `pnpm smoke:m04:x11:repeat` persisted the 300×200 selected physical area,
  then repeated it from the same frozen-root coordinate snapshot. The repeat
  rejects a changed virtual-root size or RandR monitor-layout fingerprint and
  stores geometry in capture metadata.
  Evidence: `artifacts/m04/x11-repeat.json`. The geometry stores the
  largest-intersection RandR monitor first, followed by every other intersected
  name; repeat rejects an identity mismatch as well as a layout mismatch.
  Horizontal/vertical property tests include negative, vertical, cross-monitor
  and seam-tie bounds. DPI/rotation runtime validation remains pending.
- M04 local Ubuntu/GNOME X11 x86_64 cold CLI smoke (2026-08-09):
  `pnpm smoke:m04:x11:cli-cold` launched the real Tauri lifecycle with
  `capture --mode screen --json` and received a terminal `captured` reply.
  Evidence: `artifacts/m04/x11-cli-cold.json`.
- M04 local Ubuntu/GNOME X11 x86_64 warm CLI smoke (2026-08-09):
  `pnpm smoke:m04:x11:cli-warm` started an isolated hidden primary,
  forwarded `capture --mode screen --json` via its session socket and received
  a terminal `captured` reply. Evidence: `artifacts/m04/x11-cli-warm.json`.
  The direct X11 `active-window` backend is an EWMH lookup and crop from one
  frozen root frame.
  The X11 native hotkey backend now parses normalized triggers and uses
  passive grabs behind `hotkeys_bind`; physical-key activation/conflict
  evidence remains pending because XTEST/`xdotool` does not exercise passive
  grabs on this session.
- M04 local Ubuntu x86_64 deb bundle smoke (2026-08-10):
  `pnpm smoke:m04:deb` produced
  `target/release/bundle/deb/Cute Screen_0.0.0_amd64.deb`; `dpkg-deb` verified
  the native architecture, `usr/bin/cute-screen` and a desktop entry, and
  rejected test-only `m01/m04-platform-smoke` binaries. The extracted deb
  executable and `Cute Screen_0.0.0_amd64.AppImage` both ran `--help` with the
  capture grammar; AppImage was built after declaring existing square icons in
  Tauri bundle config. This is still not an installed/portable capture proof:
  desktop activation and moved-AppImage fallback capture remain pending.

## CLI fallback and activation contract (M04 partial)

- Установленный deb: `cute-screen capture --mode area`.
- AppImage: shell-quoted абсолютный путь из `current_exe`, затем те же аргументы `capture --mode area`; перемещение AppImage требует заново сформировать строку.
- `capture --json` передаёт request в primary process через per-user/session
  Unix socket и ждёт terminal outcome (`captured`, `cancelled`, `busy`,
  permission/unavailable/failed), не путь к blob и не image bytes. Cold start
  использует тот же controller. Socket ограничен правами `0600` и scoped к
  `XDG_RUNTIME_DIR`/session display. Unit coverage есть; реальный warm/cold
  desktop smoke остаётся pending.
- Отсутствие portal или неподдерживаемый capture target нельзя объявлять
  success. CLI fallback пока является конкретной альтернативой binding flow,
  а не доказательством поддержки Wayland hotkey.

## Знак системного трея (2026-10-15)

Обновление геометрии 2026-10-16, ADR-057: монитор с ушами, двумя прищурами и
подставкой. Новый знак требует отдельного native smoke на каждой платформе;
прежнее GNOME evidence не распространяется автоматически на новый artwork.
Повторное декодирование и размерный PNG review — только asset evidence.

Windows и Linux используют отдельный прозрачный двухтонный знак; светлый
знак виден на тёмной панели, тёмный контур — на светлой. macOS использует
alpha template с прозрачным фоном и системным tint. App/Dock/launcher icon
использует тёмную плитку с белым силуэтом кота и не используется как tray image. Linux GNOME runtime
проверяется на текущей системе; Windows/macOS light/dark + HiDPI остаются pending.
Это не изменяет capture/hotkey capabilities и support matrix.

## Quick Capture chrome и Tabler Icons (2026-10-15)

Общие UI-иконки используют MIT `@tabler/icons-vue@3.49.0`; quick mode не
показывает canvas flip и пустую fallback-панель. На Ubuntu 24.04.5 x86_64/X11
Chrome 154 проверяет browser shell, WebKitGTK 605.1.15 — production Area request
с fake-platform capture, tool settings и handoff в editor. Это real-WebView
evidence интерфейса, а не новый physical capture/portal smoke. Windows/macOS и
Wayland runtime для этого UI-среза остаются pending; capture capabilities и
release guarantees не меняются. Команды и ограничения — в `TESTING.md`.

Quick frame sharpness: WebKitGTK на текущем X11 host подтвердил display-sized
UI backing и резкие frame/size badge (quick-chrome 3/3). DPR 2 проверен
pixel/controller tests; это не physical mixed-DPI evidence. См. before/after
и ограничения в `TESTING.md`.

## Различимые кисти (2026-10-16, ADR-060)

Linux x86_64/X11, Chrome 154.0.8037.57 и настоящий Tauri wry 0.55.1 /
WebKitGTK 2.52.6: три кисти, pointer creation, Cancel/Undo/Redo и settings работают
в browser и production fake Capture → Quick → Editor. Отдельный native relaunch
восстановил шесть штрихов и expressive default. RU/EN × light/dark при 1024 px
подтверждены browser screenshots. Стили pen pressure/simulated покрыты core и
renderer; физический графический планшет не проверялся. Windows/WebView2 и
macOS/WKWebView в этом изменении не запускались; новых supported claims нет.

## Панель скрытия данных (2026-10-16)

Linux x86_64 / Chrome 154: RU/EN × light/dark × DPR 1/2 при 1024×700 и
1440×900; presets, numeric cancel/commit, solid colour и undo/redo.
WebKitGTK 605.1.15: production Capture → Quick → Editor, настройки и возврат
в Select — 1/1 с embedded driver и fake capture. External provider не создал
сессию до test body. Native pointer-жесты, физический capture, WebView2/WKWebView
этим UI-прогоном не подтверждаются. Document v7, IPC и capture capabilities
не меняются. Evidence и команды — TESTING.md, `artifacts/censor-toolbar/`.

## Жизненный цикл инструментов и панелей (2026-10-16, ADR-063)

Linux x86_64 / Chrome 154.0.8037.57: browser suite — 6/6 файлов, 20/20
сценариев; native browser pointer/keyboard, selection/defaults/inline text,
RU/EN, light/dark и DPR 1/2 подтверждены соответствующими сценариями.
Настоящий Tauri / Ubuntu 24.04.5 X11, WebKitGTK 2.52.6 / wry 0.55.1:
production Capture → Quick → Editor прошёл 2/2 с external tauri-driver.
Shift+F10 и обычные pointer/keyboard идут через WebDriver; ПКМ — через системный
xdotool из-за неверного left mouseup/click в WebKit automation. Проверяются
trusted события. Runner выбирает этот режим для tool-lifecycle на Linux/X11;
требуются tauri-driver, WebKitWebDriver в PATH и установленный xdotool.
Исходный embedded 0/2 не был продуктовой регрессией: driver не создаёт
contextmenu/PointerEvent и теряет modifier у F10.
Windows/WebView2, macOS/WKWebView, Wayland и physical capture для этого изменения
не запускались; новые supported claims не добавлены. Команды и artifacts — TESTING.md.

## Физические буквенные shortcuts редактора (ADR-064)

Chrome 154 на Linux x86_64 подтвердил browser keyboard flow: создание Arrow,
Undo, Redo и Duplicate. Component/unit coverage сопоставляет русские и другие
нелатинские `key` с физическими `KeyA`…`KeyZ`; это не заменяет системную
раскладку real WebView. Linux/WebKitGTK с RU/EN system input, Windows/WebView2,
macOS/WKWebView и Wayland пока не проверены и не получают новых supported claims.

## Номерная метка и подпись (ADR-066/067/068, 2026-10-17)

| Поверхность                               | Проверено                                                                                                                                 | Ограничение                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Linux x86_64 / X11, Chrome 154            | Manual next/max+1, external caption/drag/undo, colours/shape preview, cursor, nested menus, RU/EN light/dark, 640/1024/1440 и 50/100/200% | Browser harness 2560×1440; не заменяет capture backend acceptance         |
| Linux / Tauri WebKitGTK / external driver | Production Capture → Quick → Editor, последовательность между WebViews, number edit/undo, caption add/undo                                | Capture source fake-platform; physical capture и mixed-DPI не запускались |
| Canvas2D + CanvasKit                      | Повторно декодированные PNG: четыре формы, номер внутри, caption снаружи; Canvas2D preview/export pixel equality                          | Software renderer tests не подтверждают GPU budget                        |
| Windows / macOS / Wayland                 | В этом срезе не запускались                                                                                                               | Новых supported claims нет                                                |

Команды, red-first evidence, screenshots и промежуточные ограничения — TESTING.md.

## Контекстные настройки (ADR-069)

Политика показа defaults и свободной области Quick Capture общая для всех ОС.
Runtime evidence для изменения фиксируется в TESTING.md; Linux/WebKitGTK smoke
не подтверждает Windows/WebView2, macOS или Wayland capture.

## Глобальные сочетания и автозапуск (2026-10-17, ADR-070)

- Ubuntu 24.04.5 / X11, Linux x86_64: настоящий WebKitGTK 605.1.15 подтверждает
  CLI → отдельный Settings, назначение recorder, открытие скрытого редактора
  физическим сочетанием и восстановление регистрации после relaunch без Settings.
  Захват: frozen 1920×1080 → selection 980×551 → совпадающий decoded PNG.
  Debug DEB собран локально; установка и login acceptance остаются pending.
  На host включены Num Lock и RU layout; Caps Lock/AltGr/удержание во всех ОС
  требуют отдельной физической матрицы.
- Chrome 154: browser first-run consent, конфликт, отмена и удаление. Это UI
  evidence с fixture bridge, без утверждения о native регистрации или login.
- GNOME custom-keybindings: Gio memory-backend tests подтверждают ownership,
  сохранность чужих записей, staging/cancel, cleanup и чтение внешних изменений.
  Ubuntu 22.04/24.04 Wayland, policy locks и GNOME/KDE portal runtime остаются pending.
- Windows 10/11: RegisterHotKey и per-user Run реализованы; NSIS hooks проверены
  отдельной компиляцией makensis 3.09 с `-WX`. Это проверка синтаксиса хуков,
  не запуск полного NSIS installer. Cross-check MSVC остановился до проверки
  приложения: в Linux окружении отсутствует SDK `lib.exe` для bundled SQLite.
- macOS 12/13+, Intel/Apple Silicon: Carbon, LaunchAgent и SMAppService реализованы,
  но компиляция Apple SDK и runtime matrix здесь недоступны и остаются pending.
- Для всех ОС реальный logout/login, установка с обоими вариантами checkbox,
  upgrade preservation и отключение автозапуска средствами ОС остаются pending.
  Наличие адаптера и успешные unit tests не повышают статус этих гарантий.

Команды, native capture/decode evidence и ограничения — TESTING.md.

## Настройки: навигация и inline recorder (ADR-075)

- Chrome 154 / Linux: browser UI matrix RU/EN, light/dark, 820×720 и 620×520;
  проверяются overflow и видимость встроенного редактора. Это fixture bridge.
- Ubuntu 24.04.5 / X11 / WebKitGTK 605.1.15: реальная запись, отмена/focus,
  singleton CLI, настоящий пункт DBusMenu трея → Общие, физическая активация
  скрытого редактора и восстановление после relaunch. Фактические результаты
  финального native прогона и decoded capture — TESTING.md.
- Windows/macOS/Wayland: новых runtime/support claims нет. Existing
  platform-owned registration и first-run autostart contracts сохраняются.

## Форма скрытия данных до рисования (2026-10-17, ADR-077)

Linux x86_64 / X11, Chrome 154.0.8037.57: 34 Vue checks и 9 browser scenarios
passed. Обычный pointer input создаёт rectangle, затем freeform; selection
не содержит переключателя формы, предыдущий объект и undo/redo сохраняются.
RU/EN × light/dark, 1024 px и defaults matrix 1024/1440 px × DPR 1/2;
PNG панелей RU light/dark просмотрены.

Native Wry 0.55.1/WebKitGTK не подтверждает рисование в этом окружении:
WebDriver Actions доставляет только MouseEvent, системный X11 ввод —
mousedown/pointerup без pointerdown (trace сохранена). Regression явно pending
при отсутствии pointerdown; UI/settings checks считаются отдельно. Изолированная
сборка использует тот же censor source, без параллельных Rust history changes.
Fake capture 400×300 не доказывает physical capture. Windows/macOS/Wayland
для этой правки не проверялись. Команды, хеши и ограничения — TESTING.md,
`artifacts/censor-toolbar/creation-only-*`.

## Временная история · ADR-078 · 2026-10-17

Ubuntu 24.04.5 / Linux x86_64 / X11: Chrome 154 проверяет popover/settings
RU/EN, light/dark на 1600×1000, 1280×720 и 1024×700, virtualized каталог
1000 записей и saved-result worker previews. Реальный Tauri/WebKitGTK 605.1.15
использует production Capture → Quick → Editor, SQLite и binary IPC с
4K fake backend; физический захват этим не подтверждается.
Native restart/deletion и 200-switch RSS evidence фиксируются в TESTING.md.

Storage migration 4 и document schema v7 проверяются Rust tests. Прежняя
библиотека не подвергается автоудалению до consent preview. Windows/macOS/
Wayland runtime для истории остаётся pending по ADR-020. Reference-hardware
performance claims не добавлены; renderer cache budget не равен всему RSS.

## История: крупные превью и очистка (2026-10-17, ADR-078)

Linux x86_64 / Chrome 154.0.8037.57: browser history 4/4 passed, включая
1000 записей, все страницы очистки, cancel/commit, защиту, неполную строку
прокрутки и bounded menus. RU/EN × light/dark, 1024×700–1600×1000.
Linux/X11 / WebKitGTK 605.1.15: production history → reopen → delete,
3 native scenarios passed. Проверены защита, preview нулевого/непустого
плана, отмена, удаление active и protected вручную и 200 переключений.
Windows/macOS/Wayland runtime этого UI-среза не запускался. Schema, IPC и
storage policy не менялись. Команды, screenshots и логи — TESTING.md.

Уточнение UI истории: меню заменено прямой корзиной; белые SVG используют
отдельную мягкую тёмную подложку вместо дополнительной обводки. Linux Chrome:
4 browser сценария passed, screenshots просмотрены. Для этого уточнения
native gate остаётся pending: обычный запуск столкнулся с activation endpoint
работающего приложения, isolated повтор потерял WebDriver во время soak.
Подробности и команды — TESTING.md; прежние 3/3 относятся к предыдущему срезу.

## PNG export полного editor (2026-10-17, ADR-083)

Windows x64 / WebView2 155.0.4283.45: production Open image → numbered marker →
Export, cancel and cropped re-export passed 1/1 with external native input.
3840×2160 and 2160×2160 outputs were decoded, compared pixel-for-pixel to the
scene/cropped reference and visually inspected. The OS picker selection alone
is substituted; manual system-dialog interaction remains unverified. Linux,
macOS and ARM runtime remain pending. Renderer encoding now supports
OffscreenCanvas.convertToBlob and HTMLCanvasElement.toBlob; headless renderer
33/33 passed. Commands, general check limitation and artifacts — TESTING.md.

## Шаблон имени PNG (ADR-084, 2026-10-17)

Windows x64 / WebView2 155.0.4283.45: native General Settings draft/validation/
Save/reopen и export с configured Unicode filename passed; named PNG повторно
декодирован как 3840×2160. RU/EN layout просмотрен. Вместе с прежним crop/cancel
проверены 2/2 native сценария. Date-first default и безопасные filename tokens
общие для editor/Quick; Quick OS dialog, Linux/macOS runtime и ручной Save As
заново не проверены. Артефакты и отдельные общие check blockers — TESTING.md.

## Обход системных тулбаров настройками (2026-10-17)

Windows x64 / Chrome 155.0.8059.80: 1024 px, RU/EN и обе темы — 4/4 browser
regressions passed; selection toolbar и Stroke popover измерены после обычного
создания стрелки, screenshots просмотрены. Vue 59/59 passed. Browser evidence
не заменяет WebView2; native build/result и ограничения — TESTING.md.
Linux/WebKitGTK, macOS/WKWebView и ARM runtime заново не проверялись.

Native этого исправления: Windows x64 / WebView2 155.0.4283.45,
external provider, `selection-toolbar-chrome` 1/1 passed. Production
Capture → Quick → Editor и обычное рисование стрелки, bounds панели/Stroke,
Escape/focus, без предсозданного document state. Fake-platform capture;
оба native screenshots просмотрены. Другие ОС остаются pending.

## Локаль native tray (ADR-088)

Общая логика RU/EN применяется на Windows/Linux/macOS, включая shortcut refresh
и macOS Settings menu item. Перевод не меняет capture capabilities и hotkeys.
Локальные Windows/WebView2 результаты и команды — TESTING.md. Linux/macOS и
визуальная проверка открытого системного popup остаются pending.

Windows x64 / WebView2 155.0.4283.45 (2026-10-18): tray-locale и
tray-locale-reopen — 2/2 passed, external driver, production Settings flow,
actual MenuItem text и startup snapshot. Другие ОС и визуальный OS popup
не проверены этим прогоном.

### Emoji — целевые платформы (2026-10-18)

Общий versioned Noto 2D pack для Windows/WebView2, Linux WebKitGTK и macOS
WKWebView; glyph не зависит от шрифта ОС. SVG decoding и history PNG worker
нужно подтверждать на каждом runtime. Windows browser evidence не закрывает
real-WebView и не считается Linux/macOS pass. Windows WebView2 155.0.4283.45:
emoji и emoji-reopen прошли с external native input, Quick non-origin crop,
Editor handoff, постоянной геометрией палитры, restart и decoded PNG export
1:1 (RGBA SHA-256). Capture в этом прогоне fake-platform 400×300;
browser production mount использует document 2560×1440. Linux/macOS runtime
pending. Результаты и артефакты — TESTING.md.

## Компактные Quick actions и история (2026-10-18, ADR-096)

Windows 10 19045 x64 / WebView2 155: production Quick → history → restart прошёл
на high-entropy 3840×2160 fake capture; non-origin 3074×1730 original проверен
по decoded RGBA SHA-256, PNG export 1× повторно декодирован с annotations.
Main остаётся скрытым после History; кнопки 36×36 и panel 46 px проверены в WebView.
X11 no-restore покрыт dispatcher unit regression. Physical capture, реальный
portal, Linux/WebKitGTK и macOS/WKWebView этой правкой не проверялись.
Команды и ограничения общего workspace — TESTING.md.

## Лендинг RU/EN (2026-10-18)

Windows 10 x64 / Chrome 155.0.8059.80: по 4 landing E2E passed с JS и без JS,
пять ширин 375–1440 px, 18 инструментов, keyboard navigation и mobile scroll.
WebView2 155.0.4283.45 / external driver: production Open image → editor,
1/1 capture-проверка панели passed. Итоговый asset 598×41 предоставлен
пользователем и сохранён без изменения pixels; внешние углы скрываются CSS.
Изменения лендинга не расширяют платформенные capture гарантии; Safari,
Linux/WebKitGTK и macOS/WKWebView для этой правки не проверялись.

## Ссылка атрибуции Noto Emoji (ADR-105, 2026-10-18)

Windows/WebView2, Linux/WebKitGTK и macOS/WKWebView используют общий native
opener и точное разрешение URL для Editor/Quick. Browser preview продолжает
использовать обычную ссылку. Native scenario emoji-link проверяет Linux OS
dispatch с recording executable вместо браузера; не является доказательством
загрузки сайта, physical capture или работы Windows/macOS. Linux/X11
WebKitGTK 2.52.6: external native scenario 1/1 passed, click/Enter из обоих
окон, четыре точных URL и отказ для трёх посторонних URL. Результаты — TESTING.md.

## Плавная автокоррекция (2026-10-18, ADR-113)

Ubuntu 24.04.5 x64: Chrome 154.0.8037.57, trusted pointer creation в production
Vue shell на документе 2560×1440 — плавные петли при 65%, точное перо для
сравнения. Browser regression также проверяет Undo/Redo/Cancel и Shift при
DPR 1/2 × Fit/1:1. Headless Canvas2D/CanvasKit: decoded preview/export и
goldens дуг/петель/S-кривых; 12 000 samples на 4K/8K остаются конечными.
Общий DOM-free core применяется на всех ОС, native adapters не менялись.
Новый native Tauri/WebKitGTK/WebView2/macOS прогон не выполнялся; browser и
headless evidence не считаются новым native platform pass. Команды — TESTING.md.

## Ресайз за углы (2026-10-20)

`REQ-TOL-014/015`, `REQ-EDT-005/006`: общая DOM-free проекция image/emoji
преобразует локальное начало через полную матрицу слоя. Emoji size control
сохраняет world centre после corner resize и отражений. Schema v7, IPC,
capabilities и принятый контракт ADR-035 прежние. Проверка — Ubuntu 22.04.5
x86_64 / headless Chrome 147.0.7727.101, core и Canvas2D pixel/export tests.
Native WebKitGTK, Windows WebView2 и macOS WKWebView в этой задаче не
запускались; browser results не считаются их платформенным pass.
Подробные результаты — TESTING.md.
