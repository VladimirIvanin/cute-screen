# CI-сборки и проверка версии через GitHub

## Linux CI: GStreamer и libunwind в Ubuntu 22.04

Оба Linux workflow используют `scripts/ci-install-linux-tauri-deps.sh`.
Installer явно запрашивает `libunwind-dev` в одной apt-транзакции с переданными
пакетами: GStreamer требует этот пакет, а предустановленный в hosted Jammy
LLVM `libunwind-14-dev` конфликтует с ним. Явный выбор позволяет apt заменить
конфликтующие development packages без отдельного remove/autoremove,
ручного unhold или смены Ubuntu baseline. Bounded network retries сохраняются.
Воспроизведение и локальная проверка — TESTING.md; hosted ARM64 build требует
отдельного CI pass.

## Linux dev desktop (ADR-118)

`pnpm build:linux:dev` собирает debug binary с embedded frontend в штатном
Ubuntu 22.04 Docker image. Требуются Docker и установленные `pnpm install
--frozen-lockfile` зависимости; host GTK/WebKit dev packages не нужны.
Cargo cache и target сохраняются. Config `src-tauri/tauri.dev.conf.json` задаёт
имя Cute Screen Dev и отдельный identifier: обычная библиотека и single-instance
установленной версии не используются. Сборка не создаёт installer.

Успешная сборка атомарно копирует debug executable в
`artifacts/linux-dev/cute-screen-dev`: следующая обычная Cargo-сборка его
не перезаписывает, старый dev-процесс может продолжать работать.
`pnpm start:linux:dev` запускает этот файл; wrapper также
отделяет Linux activation socket через session scope. Можно передать capture
arguments, например `pnpm start:linux:dev capture --mode area`.
Это debug build для
локальной проверки, без Vite hot reload; стандартный `pnpm tauri dev` требует
host dependencies из DEVELOPMENT.md.

Wayland Area/Screen/Repeat используют разовые Screenshot/helper пути ADR-122.
GStreamer/PipeWire для захвата не требуются. WebKitGTK может иметь собственные
multimedia dependencies; это не ScreenCast backend Cute Screen.
Для GNOME ≤42 встроен Rust Screenshot client: отдельная утилита, Python и
extension не нужны. Используются уже имеющиеся D-Bus/zbus и Shell API, новые
системные зависимости не добавляются. Необязательная внешняя утилита
gnome-screenshot сохраняется как явный метод и Auto fallback при техническом
сбое встроенного пути; для совместимых wlroots окружений возможен grim.
Утилиты ищутся в PATH и ~/.local/bin, в bundle не включаются. Без helper
GNOME ≤42 сохраняет встроенный путь, другие окружения — Screenshot portal. Современный GNOME сохраняет portal.
Для проверки на данном host официальный Ubuntu пакет 41.0-2 установлен только
в пользовательский ~/.local/share/cute-screen/tools, wrapper — ~/.local/bin;
системные пакеты и их настройки не изменены. Для обычной установки рекомендуется
пакетный менеджер дистрибутива. GPL helper не линкуется с MIT-продуктом.

## Windows GUI release и внутренний startup smoke (ADR-115)

Windows/macOS не поставляют пользовательский capture CLI/help/version.
Служебный --startup-check завершается до создания окон и проверяет link/startup.
Windows release проверяется командой
`node scripts/check-windows-executable.mjs target/release/cute-screen.exe`:
фактический PE subsystem должен быть 2, startup exit code — 0.
Проверка входит в release boundary и NSIS workflow для x64/ARM64.
Debug Windows остаётся console subsystem. Native E2E проверяет свежий harness
через test-only query вместе с --startup-check, не запуская stale binary.

Системный Windows input: `CUTE_SCREEN_E2E_SCENARIOS=windows-area-edges pnpm test:e2e:tauri`
(PowerShell: задать переменную через `$env:`). Сценарий использует отдельный
профиль и Win32 mouse/key input; fake-platform pixels отключены. Native
mouse/key операции запускать последовательно. Протокол и пределы — TESTING.md.

## Дисковая гигиена локальной разработки (ADR-114)

`pnpm disk:usage` показывает GiB по подкаталогам `target`, `artifacts`,
`node_modules` и `.git`, не переходя по symlink/junction. Это логический размер
файлов: hardlinks pnpm могут разделять физические блоки. При параллельной записи
результат является снимком, а не точным измерением освобождённых блоков.

Windows-аудит 2026-10-18: `target` 159,961 GiB, `artifacts` 91,941 GiB;
главные причины — `target/debug/incremental` 51,676 GiB, повторные Rust target
каталоги и 448 Chrome profiles (browser-e2e суммарно 42,058 GiB). Это build/runtime
cache, а не размер исходного кода. Список очистки и фактические результаты — TESTING.md.

Ежедневный цикл: `pnpm dev` / относящиеся browser tests для UI,
`cargo check` / подходящие `cargo test` для Rust, `pnpm tauri dev` для native.
Standalone native smoke: `pnpm tauri build --debug --no-bundle`.
Пакетировать только для package/release проверки: например,
`pnpm tauri build --bundles nsis` на Windows. `--no-bundle` исключает упаковку,
но не Cargo cache. `--locked` удерживает lockfile, `--jobs` ограничивает
параллелизм; эти параметры не очищают старые outputs.

Workspace `target/` общий. Дополнительный target создаёт ещё один dependency
cache; при необходимой изоляции использовать один `target/e2e-isolated`.
Полезный cache этого isolated target также сохраняется. Исторические пути ниже
описывают прежние прогоны и не являются шаблоном для новых папок под каждую задачу.
Только для заведомо заброшенного target: остановить свои процессы; затем сначала:

```sh
cargo clean --target-dir target/e2e-isolated --dry-run
pnpm clean:artifacts
```

После проверки списка и абсолютных путей убрать `--dry-run`, либо выполнить
`pnpm clean:artifacts --apply`. Cargo очистит соответствующие caches; следующая
сборка будет холодной. Не запускать clean при активной сборке или E2E.
Не чистить отдельные случайные `.rlib`/`.fingerprint` в живом Cargo cache.

`clean:artifacts` имеет фиксированный список родителей и имён: Chrome profiles
в browser/landing E2E, pin-копии binary и frontend config в native runtime.
Он проверяет реальные пути, отсутствие tracked artifacts и использования путей
процессами. Он сохраняет JSON/JUnit/logs, screenshots, failed appData и driver-cache;
не чистит Rust, пользовательскую библиотеку, fixtures или release evidence.
Во время очистки не запускать новые тесты. После SIGKILL/сбоя worker выполнить
cleanup вручную. Успешный browser session убирает свой профиль в `afterSession`;
native build временные файлы убираются в `finally`, включая build/scenario errors.
Failed appData хранится до окончания расследования, затем удаляется адресно.

Полезный общий Cargo cache, включая `target/debug/incremental`, `deps`, `build`
и release outputs, сохраняется: он ускоряет следующие сборки. Размер cache сам
по себе не означает мусор. По уточнению владельца не отключаем incremental,
не меняем dev/test/release profiles и не чистим общий target автоматически.
`cargo clean` допустим для заброшенного отдельного target, при доказанной
поломке cache или явном запросе владельца. Переключение flags/profiles создаёт
дополнительные outputs. Параметры `debug` и `incremental` из Cargo Book полезны
для осознанной настройки конкретного окружения, но не являются обязательным
способом экономии места в этом проекте.

`pnpm store prune` удаляет неиспользуемые пакеты общего pnpm store и не очищает
Rust. Cargo global-cache GC также не заменяет очистку workspace build outputs.
Не переносить мусор в произвольный внешний target только ради уменьшения этой
папки: общий расход диска от этого не уменьшается.

Первоисточники: [Cargo clean](https://doc.rust-lang.org/cargo/commands/cargo-clean.html),
[Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html),
[Cargo build cache](https://doc.rust-lang.org/cargo/reference/build-cache.html),
[Tauri CLI](https://v2.tauri.app/reference/cli/),
[WebdriverIO hooks](https://webdriver.io/docs/configuration#hooks),
[pnpm store](https://pnpm.io/cli/store).

## Обновление загрузок лендинга (ADR-113)

Pages запускается после успешного Release assets, на push main и вручную.
Код берётся из main; каталог обновляется перед pnpm build:landing из максимального
стабильного полного GitHub Release. Ошибка API или отсутствие полного набора
останавливает deploy. Локальная `pnpm build:landing` работает со snapshot без сети.
Для ручного обновления: `node scripts/landing-release.mjs apps/landing/assets/release.json`.
Декларации `landing-release.d.mts` описывают каталог; Vite валидирует snapshot перед
HTML transform. Лицензия локальных SVG включена в `public/os-icons-licenses.txt`
и копируется в опубликованный сайт. Browser detection: `userAgentData.platform`,
UA fallback; для Windows/Linux только hints `architecture` и `bitness`.

## Обновление версии приложения

```sh
pnpm version:bump 0.1.5
```

Указать стабильную версию `MAJOR.MINOR.PATCH` без префикса `v`.
Команда обновляет package.json, src-tauri/tauri.conf.json, Cargo workspace,
точную локальную storage dependency и два workspace package entries в Cargo.lock.
До записи проверяются формат новой версии и согласованность исходных файлов.
Приватные JS-пакеты сохраняют отдельную версию 0.0.0; внешние зависимости и
pnpm-lock.yaml не меняются. Команда не создаёт commit, tag или Release.
После обновления выполнить `pnpm format` и `pnpm format:check`; release guard:
`node scripts/release-assets.mjs version . v0.1.5`.

## Проверка Esc на установленном пакете (ADR-106)

`pnpm smoke:installed:area-escape` проверяет `/usr/bin/cute-screen` через
штатный CLI в настоящей X11 session. Перед каждым из трёх capture активирует
отдельное xmessage window; Quick не активируется тестом до assertions.
Проверяются _NET_ACTIVE_WINDOW, Esc без клика, Esc с удерживаемым первым drag,
повторное открытие и typed cancelled. JSON содержит путь и SHA256 проверяемого
ELF: `artifacts/installed-area-escape.json`. Xmessage/xdotool необходимы.
`CUTE_SCREEN_AREA_ESCAPE_BINARY` позволяет проверить извлечённый package ELF;
такой результат помечен его путём и не считается проверкой `/usr/bin`.
После установки нужно полностью перезапустить resident process и сравнить
`sha256sum /usr/bin/cute-screen /proc/<pid>/exe`.

## Linux: совместимость с Ubuntu 22.04 (ADR-104)

Распространяемые x64/ARM64 DEB и AppImage собираются на Ubuntu 22.04
(glibc 2.35). Используются обновления Jammy и `libwebkit2gtk-4.1` версии
не ниже 2.40. Сборка на Ubuntu 24.04 может добавить GLIBC_2.39 даже через
weak imports; копирование в AppImage этого не исправляет.

На Linux с работающим Docker:

```sh
pnpm build:linux:ubuntu22
```

Команда собирает pinned Node/pnpm/Rust image из `scripts/ubuntu22.Dockerfile`,
копирует исходники в `artifacts/ubuntu22-work`, устанавливает отдельные JS/Rust
dependencies и запускает штатный `pnpm tauri build --bundles deb,appimage`.
Host `node_modules` и `target` не используются. Архитектура нативная:
x64 host выпускает x64, ARM64 host — ARM64; эмуляция не включается.
Готовые пакеты и SHA256SUMS появляются в `artifacts/ubuntu22` после успешных
ABI/DEB/AppImage CLI gates. AppImage smoke использует extract-and-run без FUSE.

`pnpm check:linux:compat` проверяет `target/release/cute-screen` через readelf;
другой путь передаётся как аргумент. Для локальной сборки на Ubuntu 24.04
ожидается отказ, если ELF требует более новую glibc. Linux CI использует
`ubuntu-22.04` / `ubuntu-22.04-arm`, независимые caches и тот же ABI gate
перед upload. Минимальные libc6/WebKit dependencies и xdg-utils указаны в DEB metadata.
Статус runtime проверок и ограничения X11/Wayland — PLATFORM_MATRIX.md.

## Проверка линии (ADR-100)

Новые line/line-reopen сценарии используют штатный tauri runner и общий
выделенный persistenceGroup. Native input запускается последовательно. Свежая
сборка обязательна; browser pass не заменяет real WebView. IPC и document v7
не меняются. Фактические команды и артефакты — TESTING.md.

## Изолированный снимок окна (ADR-091)

PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='window-capture'; pnpm test:e2e:tauri`.
Сценарий требует интерактивный Windows desktop и external provider, запрещает
fake pixels и использует отдельный профиль. Реальные WinForms окна 1400×1000
и 700×480 создают частичное перекрытие; native SendInput подтверждает/отменяет
selector; production mount и PNG decode выполняются внутри WebView2.
Артефакты: `artifacts/tauri-e2e/window-selector-*.png`, `window-editor-*.png`,
`window-capture-decoded.json`. Не запускать параллельные package-cleaning builds.
Для занятого обычного target проверен отдельный
`CARGO_TARGET_DIR=D:/cutescreen/artifacts/window-capture-target` и
`CUTE_SCREEN_FRONTEND_DIST=D:/cutescreen/artifacts/window-capture-frontend`.
Runner записывает временный Tauri config с относительным frontendDist;
`CUTE_SCREEN_E2E_DRIVER_PORT=5660` позволяет избежать занятого default 4444.
Сценарий проверяет EN/dark и RU/light, использует script timeout 45 s,
не взаимодействует с selector другого executable и не останавливает пользовательский editor.

Windows добавляет WinRT/WGC features существующего MIT windows crate;
Screen/Area остаются DXGI. macOS weak-links ScreenCaptureKit, deployment baseline
12.0 сохраняется, CoreImage/CoreMedia/CoreVideo используются для одного frame.
X11 использует существующий x11rb Composite. Новых GPL-зависимостей нет.

## Два режима карандаша (ADR-094)

`pnpm test:e2e:browser --spec tests/e2e/specs/browser-brushes.e2e.ts --spec tests/e2e/specs/browser-straight-strokes.e2e.ts --spec tests/e2e/specs/browser-ruler-shift.e2e.ts`.
Windows PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='brushes,brushes-reopen,straight-strokes,straight-strokes-reopen,ruler-shift'; pnpm test:e2e:tauri`.
Native runner использует isolated profiles и свежую сборку, pin-ит binary
перед запуском и проверяет Quick → Editor → отдельный reopen через external driver.
Не перестраивать packages/frontend во время browser run; при параллельной работе
Vite polling с большим интервалом исключает HMR от чужой записи файлов.
Новых schema/IPC/features/dependencies нет; migration/save/undo покрыты отдельно.

## Доработка выноски (ADR-090)

`pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-editing.e2e.ts --spec tests/e2e/specs/browser-callout-empty.e2e.ts --spec tests/e2e/specs/browser-callout-layout.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts --mochaOpts.timeout=180000`
проверяет новые route/empty/width и Alt gestures. Расширенный editing scenario имеет
300 s limit. Native: `$env:CUTE_SCREEN_E2E_SCENARIOS='callout-editing,callout-editing-reopen'; pnpm test:e2e:tauri`.
На занятом пользовательским editor target использовать отдельный CARGO_TARGET_DIR.
Сценарии делят только выделенный persistence profile. v7 codec расширяется quadratic
и auto attachment без миграции прежних документов; native IPC остаётся прежним.

## Проверка управляемых выносок (ADR-087)

Browser: `pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-editing.e2e.ts --spec tests/e2e/specs/browser-callout-layout.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts`.
PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='callout-editing,callout-editing-reopen'; pnpm test:e2e:tauri`.
Native scenarios делят isolated profile и используют external driver:
production fake capture → Quick/non-origin crop → Editor → отдельный запуск.
При занятом executable задавать отдельный CARGO_TARGET_DIR; не останавливать
чужой запущенный editor. IPC, Rust core и document schema version не меняются.

## Проверка image toolbar и gesture preview (ADR-086)

`pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-editing.e2e.ts`
проверяет G import, crop и все промежуточные кадры жестов в RU/EN, light/dark,
1024/1600 px. PowerShell:
`$env:CUTE_SCREEN_E2E_SCENARIOS='content-image-tool'; pnpm test:e2e:tauri` —
тот же pixel contract после настоящего native import в Quick и Editor.
Подготовка source/document выполняется production flow; новые IPC или features
не требуются. На занятом target использовать отдельный CARGO_TARGET_DIR.

## Проверка входа в хранение из истории

PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='history-settings'; pnpm test:e2e:tauri`.
Сценарий использует isolated profile, production empty-editor mount и external
driver; проверяет загрузку History Settings, повторную активацию singleton,
закрытие и открытие заново. Новых commands, permissions и зависимостей нет.

## Проверка выбора и перемещения (ADR-085)

Browser: `pnpm test:e2e:browser --spec tests/e2e/specs/browser-selection-interactions.e2e.ts`.
PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='selection-interactions'; pnpm test:e2e:tauri`.
Native сценарий использует отдельный профиль, fake-platform capture,
production Quick → Editor и external provider для trusted pointer/keyboard.
Это не доказательство physical capture. Новых IPC/features/dependencies нет.

## Проверка входа в настройки из редактора (ADR-083)

PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='editor-settings'; pnpm test:e2e:tauri`.
Сценарий использует отдельный профиль, external driver и обычный empty-editor
mount. Проверяются trusted keyboard, шестерёнка, native singleton Settings,
сохранение раздела при повторной активации и открытие после закрытия окна.
Новые native команды, permissions и зависимости сборки не добавляются.

## Проверка вставки изображений (ADR-081)

PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='content-image-tool,content-image-reopen,content-image-empty'; pnpm test:e2e:tauri`.
Первые два сценария используют один изолированный persistence profile; empty
получает отдельный. Native picker selection и OS drop подменяются только на
входной границе test-harness, storage/serde/decode/commands остаются настоящими.
Test-only команда и picker hook исключены из production Rust build.

## Проверка настроек линейки (ADR-076)

`CUTE_SCREEN_E2E_SCENARIOS=ruler-toolbar,ruler-toolbar-reopen pnpm test:e2e:tauri`
проверяет production Capture → Quick → Editor, режимы измерения, crop,
undo/redo и отдельный запуск с сохранённым документом/defaults. Сценарии
используют общую persistence group и external Linux driver, как ruler-shift.
Расширены значения percentBasis существующей schema v7; native IPC не меняется.
Старые документы с canvasDiagonal читаются, старые preferences без базы
восстанавливают диагональ; новая установка использует pixels/canvasWidth.

## Очистка outputs editor-пакетов

`pnpm build:packages` удаляет `packages/editor-core/dist` и
`packages/editor-renderer/dist`, затем вызывает `vue-tsc -b --force`. Это
исключает старые файловые модули после переноса кода в одноимённые директории:
обычный incremental build не удаляет, например, старый `document/scene.js`.
Desktop Vite в dev, browser E2E и production build использует исходники всех
трёх editor-пакетов через aliases. Ручная очистка checkout не требуется.

Для `CUTE_SCREEN_E2E_SCENARIOS=spotlight-preview pnpm test:e2e:tauri` выбран
external provider: в Linux нужны `tauri-driver` и соответствующий установленному
WebKitGTK `WebKitWebDriver` в PATH. Встроенный драйвер 1.3.0 создаёт synthetic
MouseEvent и не подтверждает PointerEvent-жесты canvas. Другие сценарии сохраняют
прежний provider; `CUTE_SCREEN_E2E_DRIVER_PROVIDER` задаёт явный override.

Для Shift drawing добавлены сценарии `straight-strokes,straight-strokes-reopen`
с общим persistenceGroup и external provider. Они проверяют production
Capture → Quick → Editor и повторный запуск сохранённого документа.
Browser и native input suites запускать последовательно, чтобы native focus
не отменял активный browser gesture. Не запускать package-cleaning builds
параллельно: native build и typecheck используют общие dist directories.

Сценарий `CUTE_SCREEN_E2E_SCENARIOS=ruler-shift pnpm test:e2e:tauri`
использует external provider для обеих Shift, key-only preview и endpoint
resize в production Quick → Editor. Для browser input на общем desktop
доступен opt-in `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`: Chrome запускается с
`--headless=new`, поэтому фокус другого приложения не отменяет drag-жесты.
По умолчанию browser mode остаётся headed. Native focus проверяется отдельно.

## Deployment target macOS

Native bridges используют `@available`, которому нужен Clang builtins runtime.
`build.rs` передаёт `-fapple-link-rtlib` драйверу Clang: это сохраняет runtime
при Rust `-nodefaultlibs`, без жёстко заданного пути Xcode или архитектуры.
Без него release link может падать с undefined `__isPlatformVersionAtLeast`.
Compile matrix дополнительно линкует binary без test features и запускает
`--startup-check` на Intel/ARM64; `cargo check` сам по себе линковку не проверяет.
Release gate по-прежнему собирает и проверяет release binary.

Baseline macOS 12.0 из ADR-038 задан и в `bundle.macOS.minimumSystemVersion`,
и в `.cargo/config.toml` через `MACOSX_DEPLOYMENT_TARGET`. Cargo-конфигурация
нужна для прямых `cargo test`/`cargo check` в CI: они не читают Tauri bundle
settings, а cc-rs без target может выбрать macOS 15.5 и отклонить
`CGWindowListCreateImage` как obsoleted. Явное значение переменной окружения
сохраняет приоритет над default Cargo. Это настройка сборки; она не подтверждает
runtime capture на новых macOS и не реализует ScreenCaptureKit routing из ADR-038.

Deployment target и SDK — разные ограничения (ADR-109). На macOS 12 доступен
максимум Xcode 14.2 / Command Line Tools с SDK 13.1; такая сборка годится для
`pnpm tauri dev` и локальных тестов, но системный window picker и
SCScreenshotManager в неё не компилируются, `build.rs` печатает предупреждение.
Релиз собирается с SDK 14+ (Xcode 15+): `pnpm verify:release-boundary` на
macOS завершается ошибкой при SDK ниже 14. SDK выбирается через `xcode-select`,
`DEVELOPER_DIR` или `SDKROOT`; версию показывает `xcrun --show-sdk-version`.
`tauri dev` запускает бинарник без `.app`: Info.plist не применяется,
Screen Recording запрашивается для родительского terminal/IDE, а bundle id
отсутствует, поэтому self-exclusion системного picker в dev не работает.

## Локальная real-WebView проверка Windows

`pnpm install --frozen-lockfile` применяет зафиксированные patches native-core
и tauri-service. Нужны установленный WebView2 и официальный tauri-driver
(`cargo install tauri-driver --locked`, проверено 2.1.0). Подходящий EdgeDriver
проверяется service и при необходимости скачивается автоматически; последующие
сценарии используют `artifacts/tauri-e2e/driver-cache`. WebKitGTK на Windows
для этого не устанавливается.

Стабильная команда — `pnpm test:e2e:tauri`. Она собирает test-harness binary,
отказывается запускать stale executable после build failure и изолирует
профили в `artifacts/tauri-e2e/runtime`. Фильтр `CUTE_SCREEN_E2E_SCENARIOS`
предназначен для повторной проверки конкретной причины; полный запуск идёт
без фильтра. Production build не включает WDIO plugins/test permissions.
Linux/macOS гарантии этим запуском не подтверждаются. Evidence — TESTING.md.

Сценарии с одинаковым `persistenceGroup` используют один выделенный app-data/
WebView2 profile до завершения всей группы; остальные получают отдельные
профили. Native input проверяется последовательно: одновременно запущенные
runner из разных задач могут вмешиваться в ввод. Зафиксированный пример и
изолированные повторы — `artifacts/tool-settings/concurrent-runners.log` и TESTING.md.

Test-harness использует отдельный identifier с hash абсолютного E2E profile,
чтобы single-instance dispatch не подключался к resident developer app. Служебный
запуск того же профиля сохраняет тот же identifier. Интерактивная physical проверка
Windows запускается через `CUTE_SCREEN_E2E_SCENARIOS=windows-capture-exclusion`;
обычный unattended suite её пропускает. Production identity не меняется.

## Принцип

Проект публикует неофициальные unsigned пакеты в GitHub Releases (ADR-111).
Нет code signing, notarization, Tauri updater или автоматической установки обновлений.

GitHub Actions выполняет две независимые функции:

1. Создаёт проверенные versioned artifacts для Linux, Windows и macOS, включая ARM64.
2. Хранит Git tags `vX.Y.Z`, с которыми приложение может сравнить свою текущую SemVer.

Artifacts считаются тестовыми/неофициальными сборками. На macOS и Windows пользователь может увидеть Gatekeeper/SmartScreen warning, и это должно быть явно написано рядом с инструкцией скачивания.

## Матрица artifacts

| ОС      | Target                                         | Runner               | CI artifact               |
| ------- | ---------------------------------------------- | -------------------- | ------------------------- |
| Linux   | `x86_64-unknown-linux-gnu`                     | Ubuntu 22.04 x64     | `.deb`, `.AppImage`       |
| Linux   | `aarch64-unknown-linux-gnu`                    | Ubuntu 22.04 ARM64   | `.deb`, `.AppImage`       |
| macOS   | `x86_64-apple-darwin` + `aarch64-apple-darwin` | native Apple Silicon | unsigned universal `.dmg` |
| Windows | `x86_64-pc-windows-msvc`                       | Windows x64          | unsigned NSIS `.exe`      |
| Windows | `aarch64-pc-windows-msvc`                      | Windows ARM64        | unsigned NSIS `.exe`      |

Если hosted ARM runner недоступен, workflow использует узко помеченный self-hosted native runner. Cross-compilation может проверить compile, но не заменяет native install/launch smoke.

## Версии и теги

- Версия приложения хранится в одном источнике и синхронизируется с Tauri/Cargo/package metadata.
- Versioned build запускается тегом строгого формата `vMAJOR.MINOR.PATCH`, например `v0.8.3`.
- Тег обязан совпадать с embedded app version без начального `v`.
- Теги с suffix (`-alpha`, `-beta`, `-rc`) не участвуют в обычной проверке новой версии.
- Невалидные и удалённые теги игнорируются и не ломают приложение.
- Перезапись опубликованного version tag запрещена; исправление получает новый patch tag.

## GitHub Actions workflows

### `ci.yml`

Запускается на pull request и push в `main`:

- Markdown links/docs consistency;
- formatting, lint, TypeScript и Rust checks;
- dependency/license/security audit;
- unit/property/component tests;
- renderer goldens;
- browser E2E;
- Linux fake-platform Tauri smoke;
- compile checks Windows/macOS и ARM targets.

ADR-112: Linux выполняется семью независимыми jobs через reusable
`ci-linux.yml`, с `fail-fast: false` и одинаковым source SHA:

| Task     | Проверки                                                               |
| -------- | ---------------------------------------------------------------------- |
| quality  | `pnpm check`: lint, types, format, docs, boundaries, IPC и Rust Clippy |
| tests    | unit/component coverage, renderer goldens, controlled performance      |
| rust     | workspace tests с/без fake-platform и controlled X11 smoke             |
| audit    | JavaScript license/security и Rust cargo-deny                          |
| browser  | короткий E2E smoke; полный suite по manual opt-in                      |
| tauri    | короткий native E2E smoke; полный suite по manual opt-in               |
| packages | production boundary, Jammy DEB/AppImage, ABI и extracted package smoke |

Rust job перед прямыми Cargo tests отдельно выполняет
`pnpm fixtures:generate:m01`: storage tests читают generated 4K PNG,
которые не хранятся в Git и не появляются при `pnpm build`.
Независимая unit job не подготавливает файлы для Rust runner.

Browser smoke: `browser-keyboard-shortcuts.e2e.ts` и
`browser-activation-settings.e2e.ts` (три tests), с headless Chrome.
Native smoke: `m04-clean-profile-capture,result-export` через внешний
tauri-driver 2.1.0/WebKitWebDriver под Xvfb. UI persistence/reopen и подробное
форматирование остаются в полном наборе; Rust/storage tests сохраняются в CI.
Автоматический browser smoke ограничен 10 минутами, native smoke — 20 минутами
вместе со свежей harness-сборкой; превышение завершает соответствующий job ошибкой.
Подробные toolbar/theme/gesture regressions выполняются локально. Для полного
прогона в Actions: CI → Run workflow → `full_e2e: true`; тот же флаг доступен
в manual Release assets. Локальные `pnpm test:e2e:browser` и
`pnpm test:e2e:tauri` без фильтров по-прежнему запускают полный набор.
Обычный smoke push не отменяет manual full run.

Отдельный compile job для Linux x64 не требуется. Unit suites запускаются
один раз через `pnpm test:coverage`; compile matrix Linux ARM64,
Windows x64/ARM64 и macOS Intel/ARM64 сохранена. Browser failure больше не
мешает получить package artifact; публикация Release всё равно ждёт всех jobs.
Отчёты сохраняются отдельно как `linux-<task>-evidence-<run>-<attempt>`.
Task build caches не зависят от результата browser E2E; driver binaries также
кэшируются. Production и test-harness outputs остаются в разных jobs.

Все Vitest projects наследуют `maxWorkers: 2` из `vitest.config.ts`.
Это общий бюджет параллельных процессов для unit, coverage, renderer и perf
gates: число CPU не учитывает память jsdom, native Canvas2D и CanvasKit.
Файлы сохраняют изоляцию; unhandled errors по-прежнему проваливают gate.
Для отдельного диагностического запуска число workers можно явно изменить
через `--maxWorkers`; CI использует общий default без override.

Vitest 4.x использует pnpm patch по селектору `vitest@4`, проверенный на 4.1.10:
`patches/vitest-worker-diagnostics.patch`. Аварийный выход worker сообщает project,
последние назначенные test files, exit code и signal. Patch меняет только
сообщение ошибки; авария по-прежнему завершает gate с ненулевым кодом.
pnpm проверяет применимость patch и завершает install с ошибкой при
несовместимости. Внутренний hashed chunk может измениться даже в новой 4.x;
тогда patch нужно адаптировать либо убрать, если upstream уже даёт диагностику.
`pnpm test:boundaries` проверяет настоящий native exit и, на Unix, SIGKILL,
а также успешный тест и обычный assertion failure.

Linux jobs не используют `azure.archive.ubuntu.com` как первый apt-mirror:
hosted Ubuntu runners могут зависнуть на нём на десятки минут и сжечь
`timeout-minutes` ещё на `apt-get update`. Установка Tauri-зависимостей идёт
через `scripts/ci-install-linux-tauri-deps.sh` с bounded HTTP timeout и
повторными попытками.

### `nightly.yml`

- Во время разработки: доступные на текущей системе real Tauri E2E, large
  fixtures, memory/soak, performance trends и system smoke.
- После функционального завершения: Real Tauri E2E и system
  capture/hotkey/portal smokes на Linux, Windows и macOS.

### `reference-perf.yml`

Manual-only workflow для trusted commits на self-hosted `cutescreen-reference`
runner. Он не запускается для fork PR и не получает repository secrets. Перед
M05 evidence проверяет pinned Linux/X11/GPU/WebKitGTK fingerprint и запускает
`pnpm test:perf:reference`; его artifacts удерживаются 90 дней.
Provisioning и runbook: [REFERENCE_PERF_RUNNER.md](REFERENCE_PERF_RUNNER.md).

- Artifacts могут иметь короткий retention и не считаются versioned builds.

### `release.yml` — Release assets

Trigger: GitHub Release `published` либо manual dispatch с существующим тегом.
После попадания workflow в `main` для уже существующего `v0.1.0` открыть
Actions → Release assets → Run workflow, выбрать `main`, указать `tag: v0.1.0`.
Тег пересоздавать не нужно. Новые версии: синхронизировать package.json,
Cargo workspace/Cargo.lock и tauri.conf.json, создать tag и опубликовать Release.
Сам push тега не запускает публикацию пакетов.

1. Проверить строгий tag `vMAJOR.MINOR.PATCH`, совпадение package/Tauri/Cargo
   version и зафиксировать SHA tagged source.
2. Вызвать весь `ci.yml` для этого SHA, включая quality, E2E smoke и compile
   matrix. Manual `full_e2e: true` включает полные E2E suites вместо smoke.
3. Повторно использовать проверенные Linux x64/ARM64 CI DEB/AppImage без
   повторной сборки; собрать Windows native x64/ARM64 NSIS и macOS universal DMG.
4. На macOS проверить обе архитектуры через lipo, внутренний startup check и целостность DMG;
   Windows проверяет PE GUI subsystem и startup check. Полный install/capture/export acceptance
   остаётся отдельным пунктом A14; наличие пакета его не подтверждает.
5. Подготовить platform manifest, CycloneDX 1.6 inventory и license report.
   Inventory включает npm production graph, Cargo resolved packages, в том
   числе build dependencies/all targets, и bundled Noto Emoji; OS libraries
   исключены. Font license texts включаются в license report.
6. Только после всех пяти package jobs publisher проверяет комплектность,
   SHA-256 и неизменность tag; формирует общий SHA256SUMS и прикрепляет файлы.
   Каждый загруженный файл скачивается обратно и сверяется по SHA-256.
7. Описание получает секцию Downloads со ссылками и `UNSIGNED / UNOFFICIAL BUILD`.
   Пользовательский текст, сторонние assets и статус существующего Release
   сохраняются. Для отсутствующего Release manual run создаёт draft, затем
   публикует его только после успешной проверки всех загруженных файлов.

Файлы: `cute-screen-<version>-<os>-<arch>.<ext>`; macOS —
`cute-screen-<version>-macos-universal.dmg`, общий для Intel и Apple Silicon.
Только job `publish` получает `contents: write`; PAT и signing secrets не нужны.
Обычные PR/main CI не создают и не меняют Release.

При transient upload error повторить только failed publish job, чтобы использовать
тот же набор artifacts. Идентичный файл пропускается; отличие опубликованного
одноимённого файла блокирует весь preflight без перезаписи — нужен новый patch tag.
Для существующего опубликованного Release загрузка нескольких assets не атомарна:
после ошибки часть файлов может быть уже видна; повтор publish job завершает набор.
При включённой release immutability создавать draft ручным запуском workflow
до публикации: к уже immutable Release добавить файлы нельзя.
Workflow не прикладывает updater manifests.

## Контракт проверки версии

### Источники

ADR-108: текущий номер уже показывается в Settings sidebar через Tauri
getVersion с отдельным core:app:allow-version для settings window.
Browser preview получает номер из tauri.conf.json при Vite build;
номер вручную в Vue не задаётся. Это отображение локальных метаданных,
независимое от запланированного GitHub version check ниже.

- Current version: Tauri package/app metadata, получаемая через typed native adapter.
- Repository: compile-time `owner/repo`, задаваемый CI variable `CUTE_SCREEN_GITHUB_REPOSITORY`.
- Remote versions: публичный GitHub REST endpoint `GET /repos/{owner}/{repo}/tags?per_page=100`.
- При наличии `Link: rel=next` клиент следует максимум пяти страницам, чтобы ограничить запросы.
- Ссылка пользователю ведёт на `https://github.com/{owner}/{repo}/tree/<tag>` и страницу Actions, а не на отсутствующий GitHub Release.

Если repository variable отсутствует или имеет invalid format, version check отображается как недоступный build capability и не делает сетевой запрос.

### Сравнение

1. Отобрать только tags формата `^v[0-9]+\.[0-9]+\.[0-9]+$`.
2. Удалить `v` и распарсить через SemVer library.
3. Найти максимальную стабильную версию независимо от порядка GitHub API.
4. Сравнить с current version:
   - remote `>` current: `updateAvailable`;
   - remote `=` current: `upToDate`;
   - remote `<` current: `developmentBuild`;
   - нет валидных tags: `noPublishedVersion`.

### Сеть и приватность

- Manual button «Проверить версию» доступна всегда.
- Automatic check выключена по умолчанию и включается отдельным opt-in toggle.
- После opt-in automatic check выполняется не раньше чем через 30 секунд после запуска и не чаще одного раза в 24 часа.
- Используются `ETag`/`If-None-Match`; `304` обновляет `checkedAt`, сохраняя cached result.
- Timeout одного запроса — 3 секунды; requests отменяются при закрытии приложения.
- Запрос содержит обычный `User-Agent` с именем/версией приложения, но не device ID, пути, settings, library metadata или содержимое снимков.
- GitHub token не используется и не запрашивается.
- Offline, DNS, timeout, malformed response и rate limit не блокируют startup и не показывают modal.

### UI

В Settings/About показываются:

- текущая версия;
- время последней успешной проверки;
- latest tag при наличии;
- состояния checking, up-to-date, newer available, development build, offline/rate limited;
- кнопка открыть tag и кнопка открыть GitHub Actions.

Приложение не содержит кнопки «Установить», не скачивает binary и не запускает installer.

## Локальный кэш

Version-check cache хранит только:

- repository ID;
- `checkedAt`;
- ETag;
- latest stable version/tag URL;
- последний успешный status.

Network error не перезаписывает последний успешный latest result, но UI показывает, что текущая попытка не удалась. Смена repository ID очищает cache.

## Проверки artifacts

Для каждого versioned artifact:

1. Имя содержит version, OS и architecture.
2. Binary architecture соответствует matrix.
3. Версия binary совпадает с tag.
4. Чистая установка/запуск либо documented portable launch.
5. Tray и single-instance; Linux — CLI version/JSON, Windows/macOS — внутренний startup check.
6. Fake capture → editor → export.
7. Real platform capture/hotkey smoke на доступном runner.
8. Повторный запуск сохраняет library/settings.
9. Удаление не очищает пользовательскую библиотеку без отдельного выбора.
10. Downloaded file совпадает с опубликованным checksum.

## Supply chain без официальной подписи

Rust audit использует строгий `bans.wildcards = "deny"`: локальные path
dependencies также задают явную версию. Storage закрепляет `zip =9.0.4`
с отключёнными default features и включённым deflate; неиспользуемая прямая
desktop-зависимость удалена. Обновление устраняет CI advisories для `zip 6.0.0`
без allowlist/ignore. Recovery bundle schema и способ импорта не меняются.
Проверки и ограничения локального прогона — TESTING.md.

- Lockfiles обязательны.
- GitHub Actions pinned по full commit SHA.
- Rust audit через `cargo audit`/`cargo deny`.
- JS audit с fail-closed allowlist из `scripts/js-license-policy.mjs`.
  Шрифтовая `OFL-1.1` разрешается только для явно проверенной версии пакета;
  набор Fontsource 5.3.0 из ADR-061 включает Roboto, Manrope, Rubik, Comfortaa,
  Oswald, PT Serif, Lora, JetBrains Mono, PT Mono, Caveat и Marck Script с точными
  OFL-исключениями; Roboto Slab использует Apache-2.0. Обновление
  версии или другой OFL-пакет требует отдельного license audit и новой точной
  записи в allowlist.
- Полные license texts и copyright fonts из ADR-061 включаются Vite public asset
  `font-licenses.txt` в frontend и Tauri bundle.
- SBOM CycloneDX или SPDX создаётся для каждого versioned build.
- License report проверяет permissive policy и перечисленные asset exceptions.
- Signing certificates, notarization credentials и updater private keys не создаются и не требуются.

## Build blockers

- Тег не соответствует embedded version.
- Любой обязательный тест или artifact architecture check не прошёл.
- Нет native ARM runtime smoke для artifact, заявленного как проверенный.
- Artifact не запускается после скачивания из Actions.
- Отсутствует checksum/SBOM/license report.
- Version check пытается использовать token, скачивать binary или выполнять запрос без manual action/opt-in.
- `docs/TRACEABILITY.md` содержит незакрытые требования для выпуска сборки.

## Явные ограничения

- GitHub Actions retention может удалить CI artifacts; опубликованные Release assets
  хранятся отдельно и не зависят от retention конкретного Actions run.
- Для private repository без пользовательского GitHub token version check не поддерживается. План рассчитан на публичный repository.
- Unsigned Windows/macOS artifacts неизбежно могут вызывать OS warnings.
- Если в будущем потребуется официальный подписанный канал или auto-update, он проектируется отдельным ADR, а не добавляется скрыто в этот workflow.

## Перегенерация иконок

ADR-093: та же `pnpm icons:generate` обновляет generated `BrandMark.vue`,
inline SVG между `brand-mark:start/end` в обеих landing HTML и landing favicon.
Фрагменты не редактируются вручную. Статические платформенные assets сохраняют
прежнюю геометрию. `pnpm build:landing` собирает только небольшой DOM-модуль
пасхалки; Vue и desktop entry в него не импортируются. Landing TypeScript
проверяется общей `pnpm typecheck`. Без JS знак и навигация остаются доступны.

`pnpm icons:generate` воспроизводит SVG логотипа/редактора/favicon, отдельные
tray/template PNG и все bundle icons (PNG/ICO/ICNS) из единой геометрии в
`scripts/generate-brand-assets.mjs`. Команда использует существующие
`@napi-rs/canvas` и Tauri CLI; новые зависимости не требуются. `logo-mark.svg`
сохраняет выбранный монитор с ушами, прищурами и подставкой без фоновой плитки.
CLI запускается через текущий Node, без платформозависимого запуска pnpm shim.
Команда `pnpm tauri` также вызывает CLI через Node напрямую, сохраняя все
аргументы: Windows `.cmd` shim не должен повторно интерпретировать завершённую
сборку и возвращать ошибку после успешного линкования.
Generated assets
хранятся в Git и не генерируются при каждом запуске приложения. После изменения
проверить декодированные PNG и системный tray; app tile нельзя подставлять
вместо tray asset.

## Изолированная native E2E сборка

`pnpm test:e2e:tauri` учитывает `CARGO_TARGET_DIR` при сборке и поиске executable; относительный путь нормализуется от корня workspace и передаётся Cargo как абсолютный. Это позволяет проверять UI без перезаписи занятого resident developer executable. Runner по-прежнему копирует успешно собранный test binary в собственный runtime directory перед запуском сценариев. Пример фактического прогона с отдельным target — TESTING.md, ADR-051.

## Callout layout follow-up (2026-10-17, ADR-065)

Callout measurements remain derived; schema v7, native IPC and original image
storage do not change. Renderer re-exports provide measured geometry to browser
preview, interaction and the canvas used by Copy/Save. The native acceptance runner
adds `callout-layout` with a 2560×1440 document and production pointer creation.
Use an isolated `XDG_SESSION_ID` and the external Linux driver as recorded in
TESTING.md. Run builds sequentially: build:packages cleans shared outputs.

## Проверка номерной метки (2026-10-17)

`CUTE_SCREEN_E2E_SCENARIOS=numbered-marker pnpm test:e2e:tauri` запускает
production Capture → Quick → Editor без подготовленного document state.
Используется external driver; Linux требует `tauri-driver` и `WebKitWebDriver`.
Первый запуск без drivers в PATH не создал native session. Повторный запуск
с локальными drivers из artifacts/spotlight-fix/tools/ прошёл Capture → Quick →
Editor, редактирование номера, отдельной подписи и undo в настоящем WebKitGTK.
Точные PATH/XDG параметры и browser/renderer evidence — TESTING.md.

## Установка и системная активация (ADR-070)

Windows NSIS использует `installer/activation-hooks.nsh`, current-user install
и общий с приложением Run value `io.github.vladimirivanin.cute-screen`:
`"<absolute executable>" --background`. Custom checkbox заранее включён,
изменение сохраняется только при подтверждённой установке; silent/passive upgrade
сохраняет существующий выбор. StartupApproved приложение/установщик не записывают.
Синтаксис hooks отдельно проверен makensis 3.09; полный Windows bundle и запуск
установщика требуют Windows SDK и интерактивного Windows host.

DEB/AppImage/DMG сохраняют прежние форматы; вопрос перенесён в первый обычный
GUI launch. Capture CLI на Linux и `--background` не открывают мастер. Для AppImage
autostart и GNOME command используют внешний APPIMAGE path; после перемещения
Settings показывает необходимость ремонта собственной записи. Для macOS 13+
используется SMAppService.mainApp, для 12 — сериализованный LaunchAgent plist;
из `/Volumes/` регистрация запрещена с предложением переноса в Applications.

`CUTE_SCREEN_E2E_SCENARIOS=activation-settings,activation-reopen,activation-capture pnpm test:e2e:tauri`
собирает test binary и проверяет Settings, relaunch и native capture. Для X11
physical input требуется xdotool. `TAURI_WEBDRIVER_PORT` позволяет выбрать
свободный embedded port, но keyboard/pointer suites следует выполнять последовательно.

Для `CUTE_SCREEN_E2E_SCENARIOS=censor-toolbar pnpm test:e2e:tauri` выбран
external provider: regression ADR-077 рисует rectangle/freeform настоящими
PointerEvent в production Quick → Editor. В Linux нужны `tauri-driver` и
`WebKitWebDriver` в PATH; embedded DOM MouseEvent не доказывает рисование.
В X11 сценарий выбирает `contextInput=x11` и рисует системным указателем через
`xdotool`: WebKitWebDriver Actions в этом окружении доставляет только MouseEvent.
Сохранённая input trace обязана содержать trusted PointerEvent, без полифилла
или искусственного создания слоя. Остальные платформы сохраняют WebDriver Actions.

## История снимков (ADR-078)

SQLite migration 4 добавляет protection/legacy consent/viewport и
`history_thumbnails`; document schema остаётся v7. Старые сборки с поддержкой
SQLite v3 не открывают библиотеку v4. Перенос originals и автоматический
export не выполняются. Existing captures защищены от автоочистки до consent.

Локальная native acceptance: `CUTE_SCREEN_E2E_SCENARIOS=history,history-reopen,history-delete pnpm test:e2e:tauri`. Сценарии используют общий isolated
profile, production Capture → Quick → Editor и фактическое сохранение.
На Linux без внешних drivers используется embedded WebView driver; размещение
аннотации выполняется реальным X11 pointer input. Browser/native input suites
запускаются последовательно.

### Bundled emoji resources (2026-10-18)

100 Noto 2D SVG, Apache-2.0.txt, LICENSE, NOTICE и manifest находятся в
packages/editor-vue/src/emoji/assets. Источник и upstream commit закреплены в
emoji-catalog.ts; scripts/vendor-noto-emoji.mjs воспроизводит выборку и XML
normalization. SHA-256 проверяются render suite. Vite URL imports используют
no-inline, поэтому asset-файлы и notices входят в frontend build. Сетевой доступ
для штатного picker/render/export не нужен.

## Проверка компактных Quick actions (ADR-096)

PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='quick-history,quick-history-reopen,quick-chrome'; pnpm test:e2e:tauri`.
Первые два сценария делят только isolated persistence profile; используют
external tauri-driver/EdgeDriver, production Quick mount, native input и decode
original/result. При занятом target задать отдельный CARGO_TARGET_DIR.
`pnpm ipc:codegen` обновляет additive CaptureCompletion history; schema хранения,
permissions, зависимости и платформенные capture backends не меняются.

## Ссылка атрибуции Noto Emoji (ADR-105)

Native host добавляет tauri-plugin-opener 2.5.3 (MIT/Apache-2.0) и закреплённый
Cargo.lock. JavaScript зависимости, desktop IPC и document schema не меняются.
`CUTE_SCREEN_E2E_SCENARIOS=emoji-link pnpm test:e2e:tauri` строит свежий binary
и проверяет production Capture → Quick → Editor на Linux через external
`tauri-driver` и соответствующий runtime `WebKitWebDriver`. Встроенный driver
не заменяет проверку keyboard default actions. Runner подставляет
recording xdg-open только для этого сценария; frontend/IPC/plugin остаются
настоящими. Capability emoji-attribution одинакова для production и harness.
Артефакты: artifacts/tauri-e2e/emoji-link-dispatch.log и *-noto-link.png.
На Windows/macOS автоматический сценарий пока skipped; нужен ручной click/Enter
с реальным системным браузером. Не считать этот skip платформенным pass.
