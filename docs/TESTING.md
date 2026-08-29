# Стратегия тестирования

## Цель

Тестовый harness должен доказывать пользовательское действие в подходящей среде. Unit-тест механизма не заменяет проверку реального Tauri webview, а ручной smoke не заменяет детерминированную проверку core.

## Пирамида тестов

| Слой            | Инструмент                          | Что проверяет                                              | Не проверяет                               |
| --------------- | ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Rust unit       | `cargo test`                        | capability mapping, validation, paths, storage transitions | OS permission dialogs и реальный capture   |
| Rust property   | `proptest`                          | geometry, migrations, command invariants                   | Webview/UI                                 |
| TS core         | Vitest + fast-check                 | scene, transforms, hit testing, undo/redo, serialization   | CanvasKit/WebGL runtime                    |
| Vue component   | Vitest + Vue Testing Library        | semantics, keyboard, states, adapter calls                 | Tauri window, portals, native clipboard    |
| Renderer golden | headless CanvasKit/Canvas2D         | raster output и parity                                     | Реальный системный webview                 |
| Browser E2E     | WebdriverIO browser mode            | полные editor flows с mocked native adapters               | OS integration                             |
| Tauri E2E       | WebdriverIO + `@wdio/tauri-service` | production mount-flow и IPC в WebKitGTK/WebView2/WKWebView | Реальные permission/portal UI в generic CI |
| System smoke    | platform runners/manual harness     | capture, hotkeys, portals, permissions, window lifecycle   | Детерминированный pixel output             |

Тестовый WebDriver plugin включается только в test/debug bundle и отсутствует в релизной конфигурации.

## Режим проверки в разработке

Во время разработки реальная runtime-приёмка выполняется только на текущей
системе владельца проекта. Изменение, затрагивающее webview/Tauri/OS, проверяется
там, где этот путь доступен; результат фиксирует фактическую OS/architecture/
session. Для остальных платформ сохраняются production code paths, общие traits,
compile checks и fake-platform tests, но не создаётся заявление о runtime support.

После функционального завершения приложения выполняется финальная
platform/release acceptance: реальные webview, capture, hotkey, permissions и
install/launch повторяются по полной матрице. До неё незапущенные platform rows
являются отложенным evidence, а не блокером следующего milestone.

## Стабильные команды

Проект предоставляет следующие команды:

```text
pnpm check
pnpm test
pnpm test:coverage
pnpm test:render
pnpm test:e2e:browser
pnpm test:e2e:tauri
pnpm test:perf
cargo test --workspace
cargo test --workspace --features fake-platform
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy --workspace --lib --bins --all-features -- -D clippy::unwrap_used -D clippy::expect_used
pnpm smoke:m01:x11
pnpm smoke:m01:portal:probe
pnpm smoke:m01:portal:screenshot
pnpm smoke:m01:portal:shortcuts
pnpm smoke:m01:portal:invalid-uri
pnpm smoke:m04:macos:screen
pnpm smoke:m04:macos:area
pnpm smoke:m04:macos:window
```

`pnpm check` включает Rust format, три CI-конфигурации Clippy с `-D warnings` и production-only gate против `unwrap()`/`expect()`; изменения Rust не передаются в CI без этого локального gate.

Каждая команда возвращает ненулевой exit code при провале и не изменяет tracked files.

## Локальные execution records

### Short arrow endpoint repair, Windows x64, 2026-08-22

Для `REQ-TOL-001` сначала добавлен scene regression для прямой стрелки длиной
4 px при номинальном закрытом наконечнике 9 px. Red-прогон focused
`document/scene.test.ts` дал ожидаемый 1 failure из 20: основание наконечника
оказалось в `x=5` вместо второй опорной точки `x=10`. После исправления focused
`scene` + `arrow-geometry` прошёл 27/27, `pnpm test` — 413/413, а
`pnpm test:render` — 13/13 без изменения существующих goldens. Регрессия
параметризована для `solidArrow` и outline `triangle`; длина и ширина закрытого
наконечника масштабируются одним коэффициентом до доступной длины route.

`pnpm check` успешно завершил lint, полный TypeScript/Vue build и typecheck,
затем остановился на repository-wide format gate из-за уже изменённого вне
этого repair файла `tests/e2e/specs/document-persistence-write.e2e.ts`.
Scoped Prettier для изменённых core/docs файлов, `pnpm docs:check` и
`pnpm test:boundaries` (7/7) прошли. Изменение renderer-neutral и не создаёт
новых browser, Tauri или platform-runtime claims.

### Windows x64, 2026-08-10

На commit `3dcfcc5`, Windows 10 Home 22H2 (build 19045), x86_64, Intel
i7-11700K успешно завершились `cargo test --workspace` (46/46) и
`pnpm test:render` (6/6). Это portable Rust и headless renderer evidence; эти
команды не создают отдельный artifact, evidence — terminal log прогона.

Первоначальный прогон не является release gate: на машине был Node `24.11.1`
при требуемом `22.23.1`, а Vite не собирался с deprecated
`lucide-vue-next@1.0.0`. После запуска с Node `22.23.1` и migration на
`@lucide/vue@1.31.0` завершились `pnpm typecheck`, `pnpm test` (123/123),
`pnpm test:render` (6/6) и `pnpm test:boundaries` (4/4). Browser harness
перенесён с POSIX env assignment на `.env.e2e` и запускает Vite как прямой
Node-process, поэтому один server переживает все WDIO workers на Windows,
Linux и macOS. Повторный `pnpm test:e2e:browser` прошёл M01 foundation/renderer,
M02 shell и M06 drawing specs; M05 spec остаётся failed из-за 0.2 px rounding
и недоступного Undo, а не из-за dev-server lifecycle. Полный `pnpm check`
пока блокируется только тремя существующими неотформатированными файлами:
`.github/workflows/ci.yml`, `.github/workflows/reference-perf.yml` и
`.prettierrc.json`.

### Arrow v6, Windows x64, 2026-08-13

На Windows 10 Home 22H2 build 19045, x86_64, Node `22.23.1`, pnpm `10.33.2`
и Rust `1.97.0` выполнен persisted arrow/rendering slice. Focused Vitest
(`arrow-geometry`, drawing preferences/factory, codec, scene, hit-test,
CanvasViewport, Canvas2D и CanvasKit) прошёл 92/92; `pnpm test` прошёл 197/197,
`pnpm test:render` — 6/6, `cargo test --workspace` — 77 passed и один
interactive Windows test ignored, `pnpm test:boundaries` — 7/7, `pnpm
docs:check` и `pnpm check:rust` прошли.

`pnpm check` успешно завершил lint, package/Vue/e2e typecheck и production Vue
build, затем остановился на repository-wide `prettier . --check`: 18
существующих tracked files не соответствуют текущему formatter, включая
workflow/config, unrelated Vue/platform/license files и long-table
`docs/TRACEABILITY.md`. Все изменённые TS/Vue-файлы этого slice отдельно прошли
scoped Prettier check; форматирование unrelated files не выполнялось.

### Arrow integration evidence, Windows x64, 2026-08-13

На Windows 10 Home 22H2 build 19045, x86_64, Node `22.23.1`, pnpm
`10.33.2`, Chrome `151.0.7922.109` и Rust `1.97.0` выполнена integration/
evidence-проверка arrow scope. Прямой render-harness прогон сначала дал
ожидаемые 3 failures из 9 из-за отсутствующих arrow PNG. После явного update
через PowerShell environment `CUTE_SCREEN_UPDATE_GOLDENS=1` focused suite и
стабильный `pnpm test:render` прошли 9/9. Шесть новых PNG покрывают persisted
straight/quadratic/elbow, solid/dashed и одинаковый complete endpoint set на
обоих концах: `none`, `lineArrow`, `solidArrow`, `triangle`, `circle`,
`diamond`. Harness декодирует PNG в RGBA, требует точного совпадения Canvas2D
preview/export и проверяет CanvasKit/Canvas2D по зафиксированному semantic
tolerance.

Все шесть PNG просмотрены в native resolution 360×390: в каждом видны 12
необрезанных строк (шесть solid и шесть dashed), все endpoint glyphs на обоих
концах, непрерывные quadratic/elbow body и согласованный CanvasKit/Canvas2D
результат. Проверка не ограничивалась существованием файлов.

Focused `browser-m06-drawing-tools.e2e.ts` прошёл 9/9, полный
`pnpm test:e2e:browser` — 5/5 specs и 27 scenarios. Chrome проверил пять
наблюдаемых controls без toolbar/document overflow на 1600×1000, 1280×720 и
1024×700 во всех сочетаниях RU/EN и light/dark; screenshots записаны в
`artifacts/browser-e2e/arrow-toolbar-*.png`. Тем же pointer flow подтверждены
active-tool persistence, отсутствие auto-selection, elbow middle-segment drag
одной command и undo/redo. `pnpm test` прошёл 206/206; `cargo test --workspace`
— 77 passed и один interactive Windows desktop test ignored.

`pnpm test:e2e:tauri` собрал debug/test-harness binary и обнаружил WebView2
runtime `151.0.4129.78`, но остался red: embedded WebDriver server не открыл
port 4445 за 60 секунд во всех 11 scenarios, включая прежние foundation и
renderer. Ни `tauri-arrow.e2e.ts`, ни M03 arrow write/reopen не начали test
body, поэтому WebView2 arrow и native persisted-reopen не считаются runtime
evidence. Логи: `artifacts/tauri-e2e/wdio*.log`; app-data failed scenarios
runner намеренно сохранил во временных каталогах.

Финальный `pnpm check` прошёл lint, полный TypeScript/Vue/E2E typecheck и
production Vue build, затем ожидаемо остановился на `prettier . --check`:
17 pre-existing unrelated files (workflow/config, `docs/BUILD_RELEASE.md`,
platform/font/license/store files и их tests) остаются неформатированными.
Scoped Prettier check всех файлов этого integration slice прошёл. Поскольку
aggregate не дошёл до последующих стадий, отдельно успешно выполнены
`pnpm docs:check`, `pnpm test:boundaries` (7/7) и `pnpm check:rust` (все четыре
Clippy/fmt конфигурации).

### Arrow repair, Windows x64, 2026-08-14

На Windows 10 Home 22H2 build 19045, AMD64, Node `22.23.1` и pnpm `10.33.2`
после repair selected-toolbar, rebased toolbar mutations и corrupt drawing
preferences focused core/Vue suite прошёл 77/77, а первый полный `pnpm test` —
220/220.

Отдельная user-reported repair для левого filled cap на заметно изогнутой
quadratic Arrow воспроизведена semantic scene-тестом: до исправления центр
основания cap расходился с trimmed body на 2,39 px, а две стороны closed cap —
примерно на 3 px. После использования общей trim-point и направления
anchor→trim join в scene объединённый focused core/renderer/Vue suite прошёл
114/114, `pnpm test:render` — 10/10, а повторный полный `pnpm test` — 221/221.
Новые Canvas2D и CanvasKit PNG визуально проверены; стык тела с жёлтым start cap
чистый и симметричный, endpoint styles и единый dashed path сохранены.

`pnpm typecheck` с production Vue build и полный `pnpm lint` прошли; scoped
Prettier для изменённых repair TS/Vue-файлов, `TESTING.md` и `ACCEPTANCE.md`, а
также `git diff --check` прошли. Полный Prettier-check `TRACEABILITY.md` по-прежнему
показывает существующее форматирование большой таблицы; файл не переформатирован
целиком вне scope.
Browser и Tauri suites не перезапускались, поэтому новых runtime-утверждений
этот repair не добавляет.

### Numbered marker alignment repair, Windows x64, 2026-08-14

На Windows 10 Home 22H2 build 19045, AMD64, Node `22.23.1` и pnpm `10.33.2`
номерная метка переведена с top/em-box offset на измеряемый visual baseline.
Red-first focused core/renderer suite воспроизвёл смещение Canvas2D: центр ink
цифры был `10.5` при центре bounds `32`. После исправления focused suite прошёл
39/39, `pnpm test` — 223/223, `pnpm test:render` — 10/10; `pnpm typecheck`,
`pnpm lint`, `pnpm docs:check`, `pnpm test:boundaries` (7/7), scoped Prettier
и `git diff --check` прошли. Полный `pnpm check` повторно прошёл lint,
typecheck и production Vue build, затем остановился на repository-wide
Prettier-check: 18 существующих unrelated workflow/config/docs/Vue/script/test
files остаются неформатированными; изменённые TS и относящиеся к repair docs
прошли scoped check.

Локальный Chromium-прогон Vite E2E harness при zoom 453% сохранён в
`artifacts/browser-e2e/numbered-marker-visual-center.png`. Pixel inspection
дал центр чёрного круга 426,5 screen px и центр белой цифры 424 px: -2,5
screen px, то есть -0,55 canvas px. Scene contract использует audited bundled
Roboto вместо отсутствующего Inter. Установленный Evergreen WebView2 имеет
версию `151.0.4129.78`, но реальный Tauri/WebView2 flow
не перезапускался. Aggregate `pnpm test:e2e:browser` до этого завис без spec-log
и был остановлен timeout через 184 секунды; он не считается passed evidence.

## Правило user-action

Acceptance criterion формулируется наблюдаемым результатом:

- плохо: «store содержит `cropOpen=true`»;
- правильно: «из чистого профиля пользователь выбирает Crop, видит overlay и может применить область»;
- плохо: «hotkey backend вернул `Ok`»;
- правильно: «при скрытом окне комбинация запускает выбор, а результат появляется в редакторе»;
- плохо: «export file существует»;
- правильно: «файл повторно декодируется, имеет ожидаемый формат, размер и pixels».

В `docs/TRACEABILITY.md` у требования могут быть несколько доказательств: core, browser, Tauri и system runtime.

## Clean-state и mount-flow

Обязательные тесты начинаются с пустого app data:

- первый запуск и создание settings/database;
- первый capture создаёт серию и документ;
- Crop получает размер из реально загруженного изображения, тест не вызывает `setFrameSize` вручную;
- toolbar получает defaults через production initialization;
- filmstrip появляется после первого capture;
- hotkey settings загружают backend capabilities до включения save;
- recovery запускается до открытия последнего документа.

Тестовые helpers не должны создавать state, которого пользовательский flow ещё не создал.

## Runtime gaps

Следующие границы нельзя закрыть только jsdom-тестом:

- ResizeObserver и реальные размеры canvas;
- CanvasKit/WebGL2 и context loss;
- Tauri window APIs, native decorations, pin и overlay;
- asset protocol, binary IPC и image decode;
- system clipboard;
- file/save dialogs;
- global shortcuts;
- XDG portals;
- Screen Recording permission и native AppKit selector на macOS;
- фактическая маршрутизация CoreGraphics/`SCStream`/`SCScreenshotManager`,
  system window picker и отсутствие selector pixels в результате на macOS;
- mixed-DPI и multi-monitor coordinates.

Для каждой границы в `docs/TRACEABILITY.md` указывается browser/Tauri/system proof.

## Fake platform

Generic CI использует `fake-platform` feature:

- fixed capture fixtures с известными dimensions/hash;
- детерминированные monitor layouts;
- programmable permission responses;
- hotkey conflict registry;
- fake open/save dialogs;
- temporary app data;
- deterministic clock и IDs, где это влияет на snapshots.

Fake backend тестирует orchestration, но не даёт статус platform support.

## Fixtures

Manifest `tests/fixtures/manifest.json` хранит ID, SHA-256, dimensions, format, expected decode behavior и источник/лицензию.

Обязательный набор:

- PNG/JPEG/WebP: 1×, 2×, alpha, ICC, EXIF rotation и разные DPI;
- SVG с безопасным content и SVG с запрещёнными script/external references;
- 4K screenshot;
- 8K screenshot;
- сверхширокий screenshot;
- truncated/corrupted image;
- document с 500 слоями;
- document с 1000 слоями и большим числом overlaps;
- library database с 1000 captures;
- monitor layouts с negative coordinates и mixed scale.

Большие fixtures могут загружаться по manifest URL/хешу в CI cache, но тест обязан проверять SHA-256. Маленькая синтетика не заменяет production-like fixture.

## Core invariants

## M06 drawing-tool evidence

The current M06 slice is required to keep draft input transient: component code
may invalidate only the overlay for pointer movement, and a completed gesture
must call exactly one `addLayer` command. Core tests cover schema v3 migration,
paint validation, no-op vector gestures, freehand simplification and transparent
shape stroke hit-testing. Chrome browser mode covers two persistent arrow
gestures, cancellation, all four creation tools and gradient defaults; its Vite
server must set `VITE_TEST_HARNESS=true`. This does not replace pending Tauri
flows, texture import/relink, or CanvasKit/Canvas2D/export parity goldens.

Property-based тесты покрывают:

- `screenToImage(imageToScreen(point)) ≈ point`;
- resize/rotate не создаёт NaN/Infinity;
- locked layer не меняется command-операциями;
- canvas dimensions не зависят от удаления/resize base image layer;
- base-layer transform/delete/flip не изменяет immutable original blob;
- horizontal либо vertical flip, применённый дважды, возвращает semantic
  equivalent document, включая crop;
- undo(apply(command)) возвращает эквивалентный документ;
- serialization round-trip сохраняет semantic document;
- v7 round-trip семантически стабилен, а v0-v6 возвращаются typed unsupported
  `olderSchema` без миграции или изменения raw JSON;
- crop остаётся внутри canvas и имеет положительный размер;
- hit-test order соответствует z-order и overlap cycling;
- repeat-area после monitor change либо валиден, либо требует нового выбора.

## Renderer golden tests

Goldens создаются для каждого LayerNode:

- default, selected-independent committed output;
- opacity 0/50/100;
- rotate/scale;
- 1× и 2× DPR;
- crop clipping;
- base image resized/deleted и horizontal/vertical canvas flip;
- shape solid/linear/radial gradient, pattern/texture fills, opacity и curated
  blend modes;
- marker blend modes;
- censor modes;
- text RU/EN, multiline, portable span/paragraph ranges и solid background;
- beautify/watermark;
- CanvasKit/Canvas2D parity с documented tolerance.

Обновление goldens выполняется отдельной явной командой и требует visual review. Обычный test command не перезаписывает snapshots.

Для M01 явная команда обновления — `pnpm test:render:update`; `pnpm test:render` только читает committed PNG.

## Vue и визуальные состояния

Компонентные тесты проверяют:

- empty/loading/disabled/error/success;
- accessible name и tooltip icon buttons;
- `focus-visible` и focus order;
- selected tool/object/frame различимы не только цветом;
- `aria-pressed`, `aria-selected`, label/input association;
- tool options не появляются одновременно в toolbar и layers panel;
- `Escape`, text-editing exceptions и shortcuts;
- computed visual state для toggles, а не только имя класса.

Для финальной platform/release acceptance platform visual snapshots создаются
отдельно для Linux, Windows и macOS shell layouts. Системные window controls
остаются native и не имитируются snapshot CSS.

## E2E suites

### UI-system evidence (2026-08-12, Windows, Chrome 151)

- `pnpm typecheck` — passed; production editor bundle uses named Naive UI
  imports (`dist/index.js` 681.38 kB, gzip 161.13 kB).
- `pnpm test` — 172 passed.
- `pnpm test:e2e:browser` — all five specifications passed, including M02
  responsive shell, M05 zoom/undo and M06 contextual controls.
- `pnpm test:perf` — 4 passed; no idle animation loop was introduced.
- `pnpm licenses list --prod --json` reports MIT for `naive-ui@2.44.1` and
  `katex@0.16.22`.

`pnpm test:e2e:tauri` was also run on Windows on 2026-08-12. Its foundation and
native-shell scenarios passed, but the suite remains red on pre-existing M03
persistence, M04 clean-profile mount and M01 scoped image-decode scenarios.
After that run the embedded WebDriver did not reliably reopen port 4445 for the
isolated M05 retry, so this is not claimed as completed UI runtime evidence.
The manual comparison of final screenshots with `prototype-html` likewise
remains a separate acceptance step; browser-mode screenshots do not substitute
for either proof.

### Browser mode

- capture result поступает из mocked adapter;
- все editor tools и contextual toolbar;
- undo/redo и overlap cycling;
- base-layer unlock/resize/delete и canvas flip;
- clipboard type dispatch, empty-state Open/Paste и active-document image paste;
- library/filmstrip lazy loading;
- export configuration;
- RU/EN и themes;
- keyboard-only flow.

### Real Tauri

- app boot с чистым app data;
- single-instance forwarding;
- asset URL или binary fallback реально декодируется;
- CanvasKit surface создаётся;
- capture orchestration с fake Rust backend;
- filesystem/SQLite/clipboard IPC;
- editor/pin/settings window lifecycle;
- export и повторное декодирование;
- diagnostics correlation ID.

Во время разработки эти тесты запускаются на текущей системе владельца; прогоны
на остальных webviews отложены до финальной platform/release acceptance. Tauri
tests выполняются последовательно там, где single-instance, fixed ports или
shortcuts могут конфликтовать.

`pnpm test:e2e:tauri` (`scripts/run-tauri-e2e.mjs`) собирает test-harness binary один раз, затем запускает отдельный wdio-прогон на каждый сценарий (`foundation`, `renderer-alpha`, `renderer-binary`, `renderer-corrupted`) с изолированным app data. Harness query передаётся приложению при старте через service-level `appArgs`/`env` embedded provider — in-session navigation и `beforeSession` не используются, потому что embedded `@wdio/tauri-service` спаунит процесс в `onPrepare`, а `tauri_plugin_single_instance` не допускает второй экземпляр в том же прогоне. macOS использует тот же embedded provider; WKWebView runtime evidence подтверждено локальным прогоном 2026-08-09 и описано в M01 evidence.

### System smoke

На текущей системе выполняются только применимые smoke-сценарии. Полное
повторение этого списка на всех platform rows — финальная acceptance, а не
условие закрытия промежуточной разработки.

- X11: real hotkey и frozen overlay;
- GNOME/KDE Wayland: real Screenshot и GlobalShortcuts portals;
- Wayland без shortcut portal: CLI fallback;
- Windows x64/ARM64: hotkey, overlay, mixed DPI;
- macOS Intel/Apple Silicon: Screen Recording permission; Area/Window native
  selector; CoreGraphics fallback на 12.0–12.2, `SCStream` на 12.3–13 и
  `SCScreenshotManager`/system window picker на 14+; Area frozen multi-display
  quick-mode, Window direct document, cancel, Retina и mixed-scale displays;
- install/update/uninstall на каждом артефакте.

macOS unit/contract suite обязана независимо от runtime проверить availability
routing по версиям 12.0, 12.2, 12.3, 13 и 14; преобразование AppKit logical
coordinates в physical multi-display bounds; что selector занимает каждый
`NSScreen.frame` и рисует frozen preview без CTM-flip (верх кадра остаётся
верхом изображения); terminal cancel и cleanup; выбор Area quick draft
против Window direct document. Эти tests и compile jobs не
дают статус runtime support: нужны реальные grant/deny и decoded-pixel smokes
на каждой API-ветке. Воспроизводимые команды — `pnpm smoke:m04:macos:screen`,
`pnpm smoke:m04:macos:area` и `pnpm smoke:m04:macos:window`; они пишут JSON
evidence и требуют повторный decode результата. Успех команды без decoded
pixels не даёт статус `supported`.

## Performance

Измерения используют versioned dataset и зафиксированный reference runner.

- 4K/500 слоёв: p95 frame ≤16,7 ms.
- 8K/1000 слоёв: p95 frame ≤33,3 ms.
- Idle: scheduler не создаёт новые frames без invalidation.
- Pointer-to-overlay latency: p95 ≤50 ms.
- Library 1000 captures: shell/первая страница появляется до полного metadata/thumbnail scan.
- Export выполняется вне blocking UI path и показывает progress после 100 ms.
- Memory после 20 циклов open/close возвращается в установленный budget без монотонного роста.

Trend benchmark запускается в PR, hard gate — на стабильном выделенном runner.

M01 `pnpm test:perf` выполняет 30 warmups и 120 измеряемых полных software-CanvasKit redraws для 4K/500 и 8K/1000 и пишет `artifacts/perf/m01-renderer.json` с runner identity и fixture SHA. Это только trend: software/headless CanvasKit никогда не сравнивается с product budget. Любое ненулевое число idle frames остаётся hard failure везде.

M05 `pnpm test:perf:reference` запускается только на designated self-hosted
Ubuntu 24.04/X11 reference host (i7-11700K, RTX 2070 SUPER, NVIDIA 595.84,
WebKitGTK 2.52.3, окно 1600×1000, DPR 1). Он выполняет три независимых
real-Tauri прогона; каждый содержит 30 warmups и 120 valid WebGL2
`EXT_disjoint_timer_query_webgl2` samples для 4K/500 committed scene. CanvasKit
fallback, SwiftShader/llvmpipe/software renderer, missing timer extension или
`GPU_DISJOINT` делают прогон infrastructure failure. Gate пройден только если
все три GPU p95 ≤16,7 ms, idle frames равны нулю и pointer-to-overlay p95 ≤50
ms. JSON/JUnit/logs/screenshot сохраняются как workflow artifact; M13 повторяет
этот gate на build candidate.

Linux system smoke пишет JSON в `artifacts/m01/`: commit SHA, OS/arch/session, portal и WebKitGTK versions, monitor layout, correlation ID и observable result. `portal-screenshot` и `portal-shortcuts` интерактивны; cancel записывается как ожидаемый outcome без error-log. Во время разработки эти локальные файлы являются evidence текущей системы и достаточны для local development acceptance. Для финального `verified`/`supported` они должны попасть в устойчивый CI/system-run artifact вместе с остальной платформенной матрицей.

Локальный GNOME Wayland прогон 2026-08-09 (SHA `7ff7d283`): `portal-probe`, `portal-invalid-uri` и `portal-screenshot` — success; `portal-shortcuts` — `shortcutUnavailable` на GNOME backend без GlobalShortcuts interface. JSON записаны в `artifacts/m01/`; cancel semantics и KDE Wayland остаются pending.

## Schema v7 contract evidence (2026-08-14)

На Windows 10 Home 22H2 build 19045, AMD64 red-first focused TypeScript suite
первоначально завершился 14/14 failures, а Rust schema-gate test не
скомпилировался без `OlderSchema`. После реализации:

- focused v7/codec/clipboard suite — 40/40;
- весь editor-core — 125/125;
- `cargo test --workspace` — 77 passed, один interactive Windows desktop test
  ignored; `pnpm check:rust` прошёл все feature/clippy gates;
- render harness — 10/10, boundaries — 7/7, lint и docs checks прошли.

Это contract evidence, не runtime evidence text editing/layout. Workspace
`pnpm typecheck` останавливается на renderer, который ещё обращается к удалённым
text fields. Workspace `pnpm test` имеет 228/232 passed; четыре ожидаемых
downstream Vue failures относятся к удалённым presets и legacy layer fixtures
без обязательных v7 bounds. Они должны быть исправлены в следующих
renderer/editor/UI slices, а не ослаблением v7 codec.

## Schema v7 renderer/layout evidence (2026-08-14)

На Windows 10 Home 22H2 build 19045, AMD64 renderer slice выполнен red-first:
focused core/layout прогон сначала упал на отсутствующем layout module и трёх
scene assertions, а render harness — на двух отсутствующих rich-text PNG.
После реализации:

- editor-core — 125/125, renderer — 33/33;
- `pnpm test:render` — 11/11, `pnpm test:boundaries` — 7/7;
- package typecheck `vue-tsc -b packages/editor-core packages/editor-renderer`
  и полный ESLint прошли;
- workspace `pnpm test` — 232/236: четыре оставшихся failures находятся только
  в последующих Vue consumers (`text-style-presets`, два document-session legacy
  fixtures и App text-background preset);
- workspace `pnpm typecheck` проходит editor-core/editor-renderer и
  останавливается в `editor-vue` на удалённых v7 полях/presets и legacy text
  creation contracts.

Детерминированный layout покрывает UTF-16-safe emoji traversal, mixed family,
size, color, weight, italic и strikethrough, fixed-width wrapping, paragraph
alignment, bullet metadata без добавления символа в content и visual-center
labels. Два новых 360×220 PNG декодированы и просмотрены: Text background,
Callout leader-line connector/markers и Numbered Marker badge сохраняют разные container
semantics. Canvas2D preview/export совпадают по RGBA; CanvasKit/Canvas2D
укладываются в существующий semantic tolerance. Это headless renderer evidence,
не browser/Tauri/contenteditable/IME acceptance.

Корректирующий прогон проверяет Cyrillic coverage через реальные CanvasKit glyph
IDs: Latin-only font data обязана завершить render явной ошибкой вместо `.notdef`
tofu. Harness передаёт CanvasKit и регистрирует для headless Canvas2D оба уже
аудированных Roboto subset (`latin` и `cyrillic`); в явно перегенерированных PNG
слово «справа» читается в обеих backend-ветках. Цветной emoji-шрифт не добавлялся,
его одинаковый fallback не считается доказательством emoji glyph coverage.

## M08 crop editor-core evidence (2026-08-15)

Windows 10 build 19045, x64; Node 22.23.1, pnpm 10.33.2; base SHA `5c08f63`.
Новый `crop-session.test.ts` был запущен до реализации и дал ожидаемые 18/18
failures из-за отсутствующего public crop-session API. После реализации и
добавления property regressions:

- focused crop suite — 23/23;
- весь editor-core — 160/160;
- `pnpm test` — 41/41 test files и 291/291 tests;
- package build/typecheck `pnpm exec vue-tsc -b packages/editor-core` прошёл;
- scoped ESLint и Prettier для core-файлов, а затем полный `pnpm check` прошли,
  включая repository formatting/docs, 7/7 boundary tests и все Rust
  fmt/Clippy feature combinations.

Core evidence покрывает canvas-only open/reopen при moved/resized/deleted base
layer, free/1:1/4:3/16:9/original presets, minimum/out-of-canvas constraints,
move, все edge/corner handles, keyboard nudge, reset, immutable cancel, один
`setCrop` apply с no-op history, source/layer/blob immutability и crop × canvas
flip undo/redo replay. Renderer/Vue, browser, real-Tauri и platform runtime в
этом slice не запускались и не заявляются.

## M08 precision-tool editor-core evidence (2026-08-15)

Windows 10 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. Новый
`precision-tools.test.ts` был запущен до реализации и дал ожидаемые 13/13
failures на отсутствующих публичных типах, фабриках и geometry API. После
реализации и расширения positive/negative matrix:

- focused precision suite — 23/23;
- весь editor-core — 22/22 test files и 183/183 tests;
- `pnpm test` — 42/42 test files и 314/314 tests;
- `pnpm build:packages` и отдельный
  `pnpm exec vue-tsc -b packages/editor-core` прошли;
- scoped ESLint/Prettier, `pnpm docs:check` и полный `pnpm check` прошли,
  включая workspace typecheck/build, repository formatting, 7/7 boundary tests
  и все Rust fmt/Clippy feature combinations.

Core evidence покрывает строгие typed v7 payloads и malformed rejection для
manual censor, spotlight, ruler и loupe; rectangle/freeform/ellipse/diamond/
circle geometry и hit testing; composite-below scene descriptors; ruler
distance/angle semantics с canvas-diagonal basis, pixel/percent length labels и
transient snapping guide; loupe source/destination separation и bounded settings; одну add/update
command с undo/redo и отсутствие selection data. Новые semantic scene nodes
являются только renderer-neutral handoff. Renderer implementation/goldens, Vue
tool lifecycle и loupe auto-selection, browser/Tauri и platform runtime в этом
slice не запускались и не заявляются.

## M08 precision renderer/export evidence (2026-08-15)

Windows 10 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. The red-first
renderer run failed because `precision-rendering` did not exist, the core crop
run failed 2/21 assertions because `outputBounds` did not exist, and the first
render-harness run failed on the four deliberately absent precision goldens.
After implementation and an intentional golden update:

- focused `precision-rendering.test.ts` — 9/9 tests;
- `pnpm exec vitest run --project core` — 22/22 files and 185/185 tests;
- `pnpm exec vitest run --project renderer` — 7/7 files and 43/43 tests;
- `pnpm test:render` — 1/1 file and 13/13 tests;
- `pnpm exec vue-tsc -b packages/editor-core packages/editor-renderer` — passed;
- `pnpm build:packages` — passed, including the editor Vue Vite build;
- scoped ESLint and Prettier over the changed core/renderer/harness files — passed;
- `pnpm check` — passed, including full lint/typecheck/package build, repository
  formatting, Markdown links, 7/7 boundary tests and every configured Rust
  fmt/Clippy feature combination;
- `git diff --check` — passed (line-ending conversion warnings only);
- `pnpm test` retry — 43/43 files and 325/325 tests. The immediately preceding
  run reached 42/43 files and 316/325 tests before one Vitest worker exited
  unexpectedly without an assertion failure; the clean retry is recorded, not
  substituted for the first observation.

Decoded PNG assertions cover crop dimensions and translated pixels, an effect
crossing the crop boundary, exact solid censor, deterministic image-space
pixelate blocks at export scales 1 and 2, toleranced blur, spotlight shapes and
feathering, ruler line/ticks and length-only badge, loupe clipping/border/shadow and
transparent-black out-of-canvas source behavior. Lower/higher test colours
prove composite-below sampling for censor and loupe, and overlay pixels are
excluded from export. Four visually inspected PNG goldens cover Canvas2D and
CanvasKit at scales 1 and 2.

Canvas2D blur is a deterministic separable box blur; CanvasKit uses its Gaussian
image filter. Per-backend PNG baselines remain exact, while cross-backend
semantic parity ignores per-channel deltas up to 24 and permits fewer than 9%
of channels beyond that threshold for blur and independent glyph edge
antialiasing. Solid censor pixels are exact on both backends. These checks are
headless; browser, Tauri/WebView, GPU, native Save As, JPEG/WebP and full stitch
orchestration were not run or claimed.

## Диагностика и incidents

- Frontend invoke, Rust command и long operation используют correlation ID.
- Runtime checklist сопоставляет browser console, Rust structured log, app version, platform и artifact SHA.
- Пустые `catch {}` блокируются lint.
- Unexpected error получает toast/dialog и log context.
- Incident не закрывается без regression test на уровне, где проявлялась ошибка.
- Postmortem сохраняется по `docs/retrospectives/_TEMPLATE.md` и обновляет requirement/ADR/test при необходимости.

## Schema v7 rich-text editing evidence (2026-08-14)

На Windows 10 Home 22H2 build 19045, AMD64 slice выполнен red-first. Первый
focused core-прогон не нашёл `rich-text-editing` module, первый controller-прогон
не нашёл `rich-text-editor`, а terminal empty bullet paragraph сначала был
отклонён codec как невалидный range. Первый component-прогон после появления
реализации дал 8/8 failures из-за Vue-proxy над controller с private state; после
перевода transient controller в `markRaw` и завершения DOM projection:

- focused core/Vue slice — 63/63;
- editor-core + renderer — 169/169;
- `pnpm test:render` — 11/11, `pnpm test:boundaries` — 7/7;
- package build/typecheck `vue-tsc -b packages/editor-core packages/editor-renderer`
  и полный ESLint прошли;
- workspace `pnpm test` — 257/261. Четыре ожидаемых downstream failures остались
  в task-4 consumers: `text-style-presets`, два legacy `document-session` fixtures
  без обязательных v7 bounds и App personal/background preset UI;
- workspace typecheck проходит editor-core/editor-renderer и останавливается в
  `editor-vue` на прежнем task-4 `EditorShell`/`text-style-presets` API удалённых
  v0-v6 fields и presets.

Core regressions покрывают границы surrogate pairs, forward/reverse selection,
split/merge spans, collapsed typing style, insert/delete/replace и paragraph
range normalization. Component/controller regressions покрывают selection sync,
отложенный IME reconcile, bullet Enter/empty-Enter/Backspace, plain-text-only
copy/cut/paste, Escape rollback и ровно одну update command на Text, Callout и
Numbered Marker. Это headless DOM evidence; runtime evidence фиксируется отдельно
ниже и не смешивается с real-Tauri.

## Schema v7 integration evidence (2026-08-14)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. Стабильный
`pnpm.cmd test:e2e:browser` прошёл 6/6 spec-файлов на Chrome
151.0.7922.138. Из-за неполного внешнего cache WebdriverIO команда запускалась с
process-local `CHROMEDRIVER_PATH` на уже установленный ChromeDriver
151.0.7922.109 той же ветки 7922; это восстановление тестовой инфраструктуры, а
не production requirement. Новый `browser-v7-rich-text.e2e.ts` прошёл 4/4 и
доказывает:

- range/caret formatting, mixed states и partial patch без clobber;
- bullet Enter, empty Enter и Backspace, composition/IME и plain-text-only paste;
- ровно один version-token/`EditorCommand` на commit и Escape rollback;
- visibility для Text/Callout/Numbered Marker, active edit и единственного
  selected text-bearing layer; при inline edit formatting controls живут в
  transient floating toolbar над editor, а нижний contextual toolbar не
  дублирует text strip;
- font family, preset/arbitrary size validation, alignment, text/background
  solid colors, None, padding/radius, callout bubble и numbered badge с
  disabled list/None/padding/radius;
- EN/RU accessible names, Escape/click-outside focus и однострочный 640 px
  overflow без horizontal scroll.

Отдельная ручная browser-skill проверка выполнена на текущей E2E-сборке в
in-app Chromium. На 1024×700 toolbar имеет высоту 32 px и утверждённый порядок
`color → font → size → bold → italic → strikethrough → list → alignment →
background`; на 640×700 он остаётся в одну строку, `scrollWidth == clientWidth`,
document не скроллится по горизонтали, а Bullet/Alignment/Background доступны
в именованном overflow dialog. Проверка выявила и закрыла утечку visually-hidden
`Text color` label за границы toolbar; исправленный UI повторно просмотрен на
обоих viewport. Screenshot был фактически снят и просмотрен в browser-skill
сессии, но отдельный repository artifact не сохранялся.

`pnpm.cmd test:e2e:tauri` остаётся отдельным недоступным слоем. Runner собрал и
запустил real `target/debug/cute-screen.exe` с WebView2 runtime 151.0.4129.78,
но до test bodies обнаружил отсутствие совместимого `msedgedriver` и начал
`Attempting to download msedgedriver 151.0.4129.78`; загрузка/установка запрещена
приёмочным scope. Порт 4445 не открылся, новый JUnit не создан, поэтому здесь нет
real-WebView2 утверждения и browser result его не заменяет.

Финальная stable matrix на той же Windows-системе: `pnpm.cmd check` прошёл lint,
typecheck/package builds, Prettier, docs, boundaries и все Rust clippy-профили;
`pnpm.cmd test` — 263/263, `pnpm.cmd test:render` — 11/11,
`pnpm.cmd test:perf` — 4/4, `cargo test --workspace` — 77 passed и один
интерактивный Windows desktop test ignored. `pnpm.cmd tauri build` создал
`target/release/cute-screen.exe`; `git diff --check` завершился с exit code 0.

## Text projection handoff repair evidence (2026-08-15)

Windows 10 Home 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. Две
регрессии выполнены red-first: Vue component сначала оставлял persisted Text в
renderer scene во время `contenteditable`, а renderer-neutral layout давал
разные baseline `36` и `38` для одной строки при разных glyph ink bounds. После
исправления:

- focused Vue/renderer slice — 39/39;
- `pnpm test` — 267/267;
- `pnpm test:render` — 11/11 после обновления двух rich-text goldens; Canvas2D и
  CanvasKit PNG декодированы и визуально просмотрены;
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` прошёл;
- `pnpm check` прошёл полностью: ESLint, typecheck/build, formatting, docs links,
  7/7 boundary tests, Rust fmt и четыре clippy feature combinations;
- `browser-v7-rich-text.e2e.ts` — 5/5 на Chrome 151.0.7922.138. Новый сценарий
  ждёт загрузки audited Roboto, сравнивает DOM projection и canvas pixel top-edge
  с допуском 1 canvas px, затем доказывает отсутствие persisted text pixels во
  время повторного редактирования и их восстановление после Escape.

Обычный browser runner сначала не стартовал, потому что пользовательский Vite
уже занимал `127.0.0.1:5173`. Для проверки без остановки чужого процесса тот же
WebdriverIO browser service и spec были запущены одноразово на `5174`; временный
config удалён, порт освобождён. Штатный `pnpm test:render:update` также не
переносим на Windows из-за POSIX-синтаксиса environment assignment; goldens
обновлены тем же render-harness с process-local PowerShell environment variable.
Это не заявляет real-Tauri/WebView2 acceptance.

## M08 Vue interaction evidence (2026-08-15)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2. The
Vue/component contract was exercised without browser, Tauri or native clipboard
claims.

- The red-first focused run failed 8/8 tests before the Vue implementation: crop
  commands/overlay, precision creation, guide lifetime, not-ready sampling and
  contextual settings were absent.
- `pnpm exec vitest run --project vue tests/unit/vue/m08-precision-interactions.test.ts`
  passed 18/18. It covers eight crop handles, transient drafts, presets/reset,
  nudge/apply/cancel/reopen, base resize/flip/removal independence, all four
  precision creation payloads, freeform censor, add/update command boundaries,
  selection and active-tool semantics, deterministic undo/redo, hold-only
  guides, image-space scene sampling, uppercase HEX/recent colours, clipboard
  failure recovery, pointer/keyboard cancel, EN/RU settings and disabled state.
- The full Vue project passed 13/13 files and 111/111 tests. Scoped `vue-tsc` and
  ESLint passed, and `pnpm --filter @cute-screen/editor-vue build` produced the
  package output successfully.
- `pnpm test` passed the combined core, renderer, Vue, fixture and fake-platform
  matrix: 44/44 files and 343/343 tests.
- `pnpm check` passed ESLint, package/desktop/test/E2E typechecks and builds,
  repository-wide Prettier, 34-file documentation link validation, 7/7 boundary
  tests, Rust formatting and all four clippy feature combinations.

Browser/Tauri keyboard routing, decoded-source production mount, native
clipboard writes, WebView/GPU readback and visual 1024 px acceptance remain for
their dedicated gates.

## M08 browser and real-Tauri acceptance evidence (2026-08-15)

Environment: Windows 10 Home 22H2 build 19045, AMD64; Node 22.23.1, pnpm
10.33.2; Chrome 151.0.7922.138; locally detected WebView2 runtime
151.0.4129.78.

- The focused
  `pnpm exec wdio run tests/e2e/wdio.browser.conf.ts --spec tests/e2e/specs/browser-m08-crop-precision.e2e.ts`
  run passed 5/5 scenarios after its final stabilization. It uses pointer,
  keyboard and labelled-control interaction rather than mutation helpers. The
  read-only harness snapshot supplies assertions only; it never calls
  `setFrameSize` or seeds a crop.
- Browser crop evidence covers decoded fixture/canvas dimensions of 400×300,
  a user-resized and then deleted unlocked base image, free/original/1:1/4:3/
  16:9 presets, a handle drag, rule-of-thirds/dim pixels, reset, Enter, Escape,
  undo, and vertical-before/horizontal-after crop flips. The product defect that
  rejected transform commits for an unlocked image layer was repaired.
- Precision evidence covers pointer creation of censor, spotlight, ruler and
  loupe; no auto-selection for the first three; loupe-only auto-selection; and
  persistent active-tool semantics. Whole-overlay pixel snapshots prove guides
  are absent without Alt, visible while held, cleared on keyup/window blur and
  absent from the document/committed scene.
- Eyedropper sampled the visible `#273D5A` scene at zoom, not its transient
  overlay, and exposed uppercase HEX, swatch, recent colour, pointer/keyboard
  cancel, not-ready and recoverable clipboard-error states. The successful
  browser clipboard bridge is test-only and is not native clipboard evidence.
- The six inspected screenshots are
  `artifacts/browser-e2e/m08-crop-resized-deleted-base.png` and
  `m08-toolbar-{1440x900,1024x700}-{en,ru}.png`, plus
  `artifacts/browser-e2e/m08-ruler-visual.png`. The responsive toolbars wrap
  without horizontal overflow; labels and focus semantics remain available in
  both locales. The ruler screenshot visibly includes the angled default
  pink-crimson line, perpendicular ticks, upright length-only badge and all six
  settings in the bottom toolbar.
- `pnpm test:render` passed 1/1 file and 13/13 tests. All four
  `precision-m08-scale-{1,2}-{canvas2d,canvaskit}.png` goldens were opened and
  visually inspected. `pnpm test` passed 44/44 files and 343/343 tests in the
  original M08 acceptance slice; the later focused ruler-extension Vue run
  passed 19/19.
- `pnpm check` passed lint, package/desktop/E2E typechecks and builds, formatting,
  34-file docs validation, 7/7 boundary tests and all configured Rust
  fmt/Clippy combinations before the final evidence-text update; it was rerun
  after documentation was finalized.
- The full browser command was observed honestly rather than promoted from the
  focused pass. Its latest pre-stabilization run completed 4/7 spec files and
  failed on an M06 pointer-action timeout, two M08 timing assertions later
  stabilized in the focused 5/5 run, and the independently reproducible M07
  rich-text top-edge regression (`3.847` canvas px). M05 was repaired and its
  focused browser spec passed 7/7. No M07 threshold was weakened in this slice.

### M08 ruler visual/persistence extension (2026-08-15)

The visual was independently implemented from the product contract and visual
observation of the old prototype/reference; no old implementation source was
copied or linked. `docs/TRACEABILITY.md` was updated before tests or production
code.

- The first focused core run failed 4/24 tests: visual defaults and required v7
  fields were absent, pixel labels were fractional, and styled updates were
  rejected. A second strictness-first run intentionally failed 1/24 until
  fractional thickness/font-size values were rejected. Final focused core+codec
  passed 34/34.
- The first focused renderer run failed 3/11 because the badge still contained
  the angle and the scale-1/2 pink-line/tick/no-dot pixels were absent. Final
  Canvas2D/CanvasKit semantics and pixel coverage passed 12/12.
- The first focused Vue run failed 3/19 because created rulers lacked visual
  fields and the new colour/thickness/label-size controls were absent. During
  the green pass, slider ArrowRight exposed an extra global nudge command; the
  slider keyboard target is now excluded from canvas shortcuts. Final focused
  Vue passed 19/19, including update/undo/redo and RU/EN/LayersPanel boundaries.
- Before the intentional golden update, ordinary `pnpm test:render` failed only
  its two M08 scale cases (the four Canvas2D/CanvasKit artifacts); the other
  11/13 tests passed. The same render harness was then run with process-local
  `CUTE_SCREEN_UPDATE_GOLDENS=1`, after which `pnpm test:render` passed 13/13.
  All four `precision-m08-scale-{1,2}-{canvas2d,canvaskit}.png` artifacts were
  opened and visually inspected for both horizontal and angled ruler cases.
- The first focused browser attempt stopped before mount because incremental
  workspace output was stale and lacked the new renderer export. A forced
  scoped package rebuild refreshed `dist`; the unchanged focused M08 command
  then passed 5/5 in Chrome 151 and produced the inspected
  `artifacts/browser-e2e/m08-ruler-visual.png`.
- Scoped `vue-tsc` passed, and final `pnpm test` passed 44/44 files and 348/348
  tests. The first `pnpm check` stopped on one missing type-only import in the
  new test; after adding it, the targeted test/E2E typechecks and the complete
  `pnpm check` passed. That complete check included lint, package/desktop/test/E2E
  typechecks and builds, repository-wide formatting, 34-file documentation link
  validation, 7/7 boundary tests, Rust formatting and all configured Clippy
  feature combinations. Final `git diff --check` is recorded in the handoff.

This extension adds no real-Tauri claim. The existing embedded-WebDriver port
4445 blocker remains the authoritative status until a test body actually runs.

## M08 cropped-viewport repair evidence (2026-08-15)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.138. `docs/TRACEABILITY.md` was updated before the repair tests or
production edits. No package was installed or downloaded.

- The first combined Vue/renderer command failed 5/56 tests: four exposed the
  full-canvas Fit/CSS size, missing crop-origin pointer translation and incorrect
  DOM-text offset; one exposed a live CanvasKit backing surface that remained at
  its initial size. The final unchanged focused command passed 56/56.
- Focused crop/precision core plus Canvas2D/CanvasKit renderer regression coverage
  passed 82/82. The live renderer test drove full→crop→full recreation, verified
  intrinsic and CSS scene/overlay sizes, disposal of replaced surfaces/contexts,
  image re-upload and font lifetime. `pnpm test:render` passed 13/13.
- The new browser scenario failed red-first at the visible cropped-surface aspect
  ratio (1/6 scenarios failed). The final focused browser spec passed 6/6 in
  Chrome 151 after applying an `x=60` crop through the visible Crop flow. It then
  created censor and ruler layers, sampled with the eyedropper, and created and
  reopened text through the cropped surface; only a read-only document snapshot
  was used to verify canvas-space coordinates.
- Scoped Vue/E2E typechecks passed. Final `pnpm test` passed 44/44 files and
  353/353 tests. The first full `pnpm check` stopped on one strict test-only
  emitted-event type; after that correction it reached the formatting gate and
  identified only the five newly edited repair files for scoped formatting.
  After scoped formatting, the complete `pnpm check` passed lint, all
  package/desktop/test/E2E typechecks and builds, repository-wide formatting,
  34-file documentation validation, 7/7 boundary tests, Rust formatting and all
  configured Clippy feature combinations. Formatting, docs and diff checks were
  then repeated after this final evidence update.

This repair does not add a real GPU/WebView claim. Per the known infrastructure
blocker, real-Tauri was not re-run; the embedded-WebDriver port 4445 status below
remains authoritative.

The clean-state Tauri specs are present as
`tauri-m08-crop-first-open.e2e.ts` and
`tauri-m08-eyedropper-clipboard.e2e.ts`. Production `App.vue` loads the persisted
document, decodes the source with binary fallback, assigns `sourceImage`, and
only then opens the `DocumentSessionController`; the crop spec starts from an
isolated empty app-data directory and invokes the production fake-capture
request without a frame-size helper.

Real-Tauri execution is blocked before either M08 test body. The debug
feature-gated binary built at `target/debug/cute-screen.exe`, and backend/frontend
logs show the fake-platform app and Tauri bridge became ready, but the service
raised `Failed to start embedded WebDriver ... port 4445 within 60000ms`.
Consequently clean-state WebView crop mount and system clipboard readback remain
pending. The runner was changed to invoke the already-installed local WDIO CLI
instead of nested Corepack, and `autoDownloadEdgeDriver: false` now prevents
future network downloads. Before that guard was added, the service silently
downloaded `msedgedriver 151.0.4129.78` to the user temp directory during the
attempt; no further download was authorized or performed. The saved gitignored
`artifacts/tauri-e2e/wdio.log` does not contain the embedded-WebDriver timeout
transcript, so it is not durable proof of that failure. The timeout was observed
in transient command output only; clean mount and native clipboard real-Tauri
evidence therefore remain pending. No log is created or reconstructed to replace
the missing transcript.

## M08 loupe/ruler transform and bounds repair evidence (2026-08-15)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.138. `docs/TRACEABILITY.md` was updated before the repair tests and
production changes. No package was installed or downloaded, and the approved
default ruler colour, thickness, font size and badge layout were not changed.

- Red-first command coverage failed 2/8 because strict v7 rejected the new
  partially out-of-canvas loupe fixture before horizontal/vertical flip replay.
  Red-first precision-core coverage failed 2/26 on that codec contract and the
  short-ruler visual bounds. Red-first renderer coverage failed 12/26: three
  transformed-ruler pixel comparisons and nine transparent loupe sample checks.
- The same `flipCanvas` command now mirrors `sourceRegion` on both axes and its
  command test proves undo/redo. Strict-v7 factory/codec coverage accepts only a
  bounded finite positive region that intersects the canvas, while rejecting
  non-finite, zero/negative, wholly disjoint and abusive-coordinate candidates.
- Canvas2D and CanvasKit decoded pixels cover circle/rectangle lenses at export
  scales 1 and 2. The complete lens sample is cleared to transparent black before
  only the source/canvas intersection is copied from the frozen composite below;
  Canvas2D committed-preview pixels are checked separately. The existing
  source/destination split and no-recursion ordering remain unchanged.
- Semantic world-endpoint tests cover a 120° ruler rotation and horizontal and
  vertical reflection. Exact backend pixel comparisons cover the transformed
  badge in Canvas2D and CanvasKit while line/ticks retain the layer transform.
  Core tests cover short-ruler creation, badge/tick hit area, font/thickness
  rebasing, stable world endpoints and command undo/redo.
- Focused final evidence passed 136/136 across the selected core/codec/scene,
  renderer and Vue files; full core passed 190/190, full renderer 61/61 and the
  focused M08 Vue suite 22/22. `pnpm test:render` passed 13/13 without a golden
  update. Final `pnpm test` passed 44/44 files and 371/371 tests.
- The focused M08 browser spec passed 7/7. The ruler scenario creates and selects
  the layer through visible controls, changes label size and thickness with real
  pointer drags, observes the selection-frame growth, and checks two-step
  undo/redo. `artifacts/browser-e2e/m08-ruler-bounds-after-style.png` was opened
  and visually inspected.
- `pnpm check` passed after an initial test-only readonly-fixture type error was
  repaired with immutable reconstruction. The successful gate includes lint,
  all configured TypeScript/E2E builds, repository formatting, 34-file docs
  validation, 7/7 boundary tests, Rust formatting and all configured Clippy
  feature combinations. Final docs formatting/link and `git diff --check` are
  repeated after this evidence update.

This repair adds no real GPU/WebView claim. The existing embedded-WebDriver port
4445 blocker remains the authoritative real-Tauri status.

## M08 locked precision controls and opaque eyedropper repair evidence (2026-08-15)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.138. `docs/TRACEABILITY.md` was updated before the repair tests and
production edits. `docs/milestones/` remains gitignored and was neither
force-added nor used as tracked evidence. No package was installed or
downloaded.

- The red-first focused Vue run completed 31 tests with six expected failures:
  four locked censor/spotlight/ruler/loupe cases exposed enabled contextual
  controls, alpha `128` emitted `#ABCDEF`, and the parent shell advanced to the
  clipboard/swatch/recent path for that semi-transparent sample. Final focused
  Vue passed 32/32, including the added selected read-only ruler regression.
- Range, select, colour and related precision controls now expose their native
  disabled/`aria-disabled` state and leave disabled controls outside sequential
  focus. Focus, keyboard and pointer attempts do not execute a command or mutate
  creation defaults/recent colours. A selected unlocked layer receives exactly
  one `updateLayer` command per completed interaction; with no selection the
  same toolbar changes only the defaults used by the next created layer.
- The red-first focused browser run passed six scenarios and failed the two new
  scenarios: locked Effect lacked `aria-disabled`, and the alpha harness still
  sampled `#273D5A`. The unchanged focused command then passed 8/8. Its locked
  scenario checks a stable document/version token through focus, keyboard and
  pointer attempts, verifies the unmodified creation default, unlocks the layer
  and observes exactly one version increment for the normal update.
- Eyedropper component and seeded browser coverage accepts only alpha `255`.
  Alpha `0` and `128` surface the existing recoverable “no opaque colour” state
  before clipboard, swatch or recent-colour mutation; alpha `255` still returns
  uppercase `#273D5A`. Existing zoom/crop mapping and transient-overlay
  exclusion scenarios remain in the same passing browser spec.
- `pnpm test:render` passed 13/13 without a golden update or renderer change.
  The first `pnpm test` attempt passed 43/44 files before one Vitest fork exited
  unexpectedly without an assertion failure; the unchanged rerun passed 44/44
  files and 381/381 tests.
- The first `pnpm check` reached formatting after lint and all TypeScript/E2E
  builds, then stopped only because the final `docs/TRACEABILITY.md` evidence
  edit needed Prettier. After formatting that tracked file, the complete
  unchanged gate passed lint, all configured TypeScript/E2E builds,
  repository-wide formatting, 34-file documentation link validation, 7/7
  boundary tests, Rust formatting and all configured Clippy feature
  combinations.

No Tauri run was attempted. Clean production decoded-source mount and native
clipboard readback remain pending behind the existing embedded-WebDriver port
4445 blocker. The `?m05=1`/M08 App harness results above are seeded interaction
coverage only. The previously recorded full-browser M06 timeout and M07
rich-text top-edge failure remain unresolved and are not promoted to a universal
browser pass.

## M08 generic ruler resize/transform repair evidence (2026-08-15, superseded)

This is historical evidence for legacy transform decoding and conservative
bounds. ADR-035 superseded generic non-image scaling on 2026-08-22; the current
ruler interaction changes factual endpoints with unit transform scale, as
recorded in the later image-only scale evidence section.

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.138. `docs/TRACEABILITY.md` was updated and the tests were authored
before production changes. No package was installed or downloaded. The M08 dirty
tree was preserved; `docs/milestones/` and `artifacts/` remain gitignored and
were not force-added.

- After correcting only new-test fixture/transform helpers, strict-v7 red failed
  because an endpoint-containing but badge/tick-incomplete `localBounds` decoded
  as editable. A later direct-save mutation check bypassed the shell canonicalizer
  and failed the focused Vue test on the new codec guard; restoring the production
  canonicalizer passed the unchanged target 1/1.
- Core coverage drives 5–9% strong scale-down, non-uniform scaling, 37° rotation,
  127°/−73° rotation with horizontal/vertical reflection, and proves that the raw
  scaled bounds are nonconservative while `rebaseRulerLayer` preserves factual
  world endpoints, rotation/reflection, selection geometry, badge hit and spatial
  broad phase. Strict v7 rejects derived-bound undercoverage without weakening the
  required colour/thickness/font-size payload.
- At the time, `EditorShell` applied the same canonical transform boundary to
  persisted ruler move, generic resize/rotate, LayersPanel rotation and canvas
  reflection. That generic resize UI path is no longer active; the retained
  coverage still protects legacy decoding and conservative bounds.
- The historical focused M08 browser spec passed 8/8 using a strong non-uniform
  ruler resize. It has since been replaced by the intrinsic endpoint scenario
  documented in the 2026-08-22 section; the old result is not a current UI
  requirement or a real-Tauri claim.
- `pnpm test:render` passed 13/13 without a golden update. `pnpm test` passed
  44 files and 387/387 tests. The approved `#E3488F`, ticks without dots and
  length-only upright badge were not changed.

Tauri was not run. The saved gitignored `artifacts/tauri-e2e/wdio.log` still
contains no timeout transcript, no replacement log was created, and durable
clean-mount/native-clipboard real-Tauri evidence remains pending.

## M08 loupe callout visual evidence (2026-08-15)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1 and pnpm 10.33.2. The
`REQ-TOL-011` and traceability rows were updated before test and production
changes. The Electron prototype was used only as UX reference; its code was not
copied into the Tauri/Vue implementation.

- Red-first focused execution failed all eight Canvas2D/CanvasKit connector
  pixel cases (circle/rectangle at scales 1/2) and the selected-loupe Vue
  overlay case. The remaining 59 focused tests passed.
- Final focused renderer/Vue execution passed 68/68. The renderer freezes the
  composite-below snapshot before drawing the derived connector, so the line
  and arrowhead cannot recursively enter the lens sample.
- `pnpm test:render` passed 13/13 after updating and visually inspecting the
  four M08 Canvas2D/CanvasKit scale-1/scale-2 PNGs. Connector colour follows the
  persisted border colour; the source marker and zoom/size chips are drawn only
  by the interaction overlay.
- `pnpm test` passed 44 files and 396/396 tests. `pnpm check` passed ESLint,
  package/app/test TypeScript builds, Prettier, Markdown links, 7/7 boundary
  tests and all four documented Rust clippy configurations.
- The repository's `pnpm test:render:update` command uses POSIX inline
  environment syntax and is not directly executable by `cmd.exe`. On Windows,
  the same render-harness command was run with
  `$env:CUTE_SCREEN_UPDATE_GOLDENS = '1'`; no alternate script was introduced.

## Browser E2E cropped-viewport stability evidence (2026-08-17)

- The aggregate Chrome 151 run reproduced three failed spec files before the
  repair. M05 compared a committed 100×80 crop surface with the 2560×1440
  document canvas and targeted a snap gesture without translating the crop
  origin. M06 targeted the elbow handle in full-canvas coordinates against the
  cropped scene backing store. M08 compared integer WebDriver viewport input
  with ideal fractional canvas coordinates; on Linux the reported example was
  `30.3125` for an ideal `30`.
- Browser coordinate helpers now map through the visible output bounds. The M08
  contract compares persisted canvas-space geometry with the point actually
  delivered after WebDriver's integer CSS-pixel quantization. Overlay assertions
  wait for the observable held/released frame, and the strong ruler resize waits
  for its single document version increment before checking the resulting scale.
- Focused Chrome 151 / Windows x64 results: M05 7/7, M06 9/9 and M08 8/8.
  `$env:CUTE_SCREEN_BROWSER_E2E_PORT = '5174'; pnpm test:e2e:browser` passed all
  7/7 spec files in 92 seconds. The configurable strict Vite port isolated the
  run from an existing local development server; CI retains port 5173 by default.
  The reported Linux runner has not been rerun locally.

## Hand cursor and tooltip repair evidence (2026-08-22)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1 and pnpm 10.33.2.

- The red-first focused Vue run failed 2/30: active Hand exposed no cursor
  feedback, and enabled tool buttons still had a duplicate native `title` while
  the global zero-padding popover override leaked into tooltips.
- The final focused cursor/tooltip run passed 30/30. Hand now exposes `grab`,
  changes to `grabbing` only between pointer-down and release/cancel, and does
  not add document state. Enabled tools use the padded custom tooltip; disabled
  tools retain their existing native explanatory title while the custom tooltip
  is disabled, so only one tooltip path is active.
- The related precision regression suite passed 64/64 and the complete Vue
  project passed 14 files and 140/140 tests. `pnpm test` passed 46 files and
  411/411 tests across the configured core, renderer, Vue, fixture and
  fake-platform projects.
- ESLint, the editor-vue production build, test typecheck, scoped Prettier,
  Markdown links, 7/7 boundary tests and `git diff --check` passed. The aggregate
  `pnpm check` passed lint/typecheck/build, then stopped at the repository-wide
  formatting gate on the pre-existing
  `tests/e2e/specs/document-persistence-write.e2e.ts`; that unrelated file was
  not modified in this repair.

This is component/build evidence. No browser screenshot or real-Tauri/WebView
claim is added.

## Image-only scale and intrinsic geometry resize evidence (2026-08-22)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.170. The schema remains v7 and the `EditorCommand` union and
`CanvasViewport` public props/emits were not changed. Existing dirty-tree work
was preserved and combined with this slice.

- The initial focused core gate failed 9/9 before `layer-resize.ts` existed.
  Final focused core passed 10/10, covering capability mapping, legacy
  normalization/idempotency, command rejection, internal clipboard
  normalization, pure canvas-reflection persistence and exact undo/redo.
- `DocumentSessionController` normalizes editable non-image scale before the
  command manager is exposed and immediately marks that normalized baseline as
  saved. Component coverage verifies `dirty === false`, no undo entry and no
  autosave solely for normalization.
- The final focused CanvasViewport suite passed 33/33. Non-image selection uses
  tool-owned bounds/points/endpoints/width handles and emits one `updateLayer`
  command on release; image selection retains eight transform handles. The
  detached rotate stalk is absent, inner corners resize where supported, outer
  corner zones rotate, locked layers expose only their frame, and the
  product-owned rotate cursor is toggled directly on the canvas without a Vue
  pointermove render loop. The Arrow move regression proves its committed ink
  preview, selection frame and floating formatting toolbar all read the same
  transient layer geometry; the toolbar host is updated directly during the
  pointer gesture. Shift/Alt and pointer-cancel paths are covered.
- `pnpm test` passed 47 files and 432/432 tests. `pnpm test:render` passed
  13/13 without a golden update. `pnpm docs:check`, `pnpm test:boundaries` and
  `pnpm check:rust` passed (34 Markdown files, 7/7 boundary tests and all
  configured Rust fmt/Clippy feature combinations).
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT = '5174'; pnpm test:e2e:browser` passed
  all 7/7 Chrome spec files. The M08 browser flow moves a ruler endpoint with
  unchanged thickness/font-size and exact undo/redo, and narrows text through
  its side handle with fixed spans, increased layout height and unit scale.
  Existing M05/M06 flows retain image resize, move, canvas flip, arrow geometry
  editing and z-order/layer interaction coverage.
- `pnpm test:e2e:tauri` built `target/debug/cute-screen.exe`, then every WDIO
  scenario failed before application interaction with `No "browserName"
defined in capabilities nor hostname or port found`. Consequently the
  real-WebView persistence reopen check for legacy normalization and pure flip
  remains pending; no Tauri behavioral pass is claimed.
- The aggregate `pnpm check` reached the repository-wide Prettier gate after
  lint, package/app/test builds and typecheck. All files in this change were
  formatted, but the gate still reports the pre-existing unmodified
  `tests/e2e/specs/document-persistence-write.e2e.ts`; that unrelated file was
  intentionally not rewritten.

## Eyedropper live-loupe evidence (2026-08-22)

Windows 10 22H2 build 19045, AMD64; Node 22.23.1, pnpm 10.33.2; Chrome
151.0.7922.170. The change is transient Vue UI only: schema v7, `EditorCommand`,
renderer/export and the persisted loupe tool are unchanged.

- The red-first focused Vue run passed the existing 34 cases and failed the two
  new live-loupe cases because no frame-coalesced preview or accessible card
  existed. The final focused run passed 36/36.
- Component coverage proves a 9×9 scene-only preview, highlighted centre,
  uppercase live HEX, alpha-unavailable state, right/left and below/above
  placement, viewport clamping, one read per animation frame, no repeated
  readback inside the same scene pixel and no pre-confirmation `colorSample`.
- The editor-vue production build and E2E TypeScript check passed. `pnpm test`
  passed 47 files and 434/434 tests; `pnpm test:render` passed 13/13 without a
  golden update.
- The focused Chrome M08 spec passed 8/8. The live eyedropper scenario covers
  alpha `0`/`128`/`255`, zoom, keyboard confirmation, cancel, not-ready and
  clipboard-error paths. EN 1280×800 and RU 1024×700 screenshots were opened
  and visually inspected; the card, grid, centre target, `#273D5A` swatch/HEX
  and localized hint stay legible and clear of bottom chrome.
- A repeated aggregate browser run passed all 7/7 spec files; M08 passed 8/8.
  An earlier aggregate attempt timed out in the unrelated ruler scenario, while
  both the focused run and the repeated aggregate completed that scenario.
- `pnpm test:e2e:tauri` did not reach any WebView test body: its build could not
  replace the in-use `target/debug/cute-screen.exe`, and the subsequent WDIO
  attempts reported no embedded-session capability. No real-Tauri/WebView or
  native-clipboard result is claimed.

## Loupe source-marker drag evidence (2026-08-22)

Windows x64 local workspace. The source-marker repair is limited to the
selected persisted loupe; document schema v7, renderer/export and creation
defaults are unchanged.

- The red-first Vue test failed because the drawn source marker had no hit-test
  gesture and emitted no `EditorCommand`.
- Final `pnpm vitest run --project vue tests/unit/vue/m08-precision-interactions.test.ts`
  passed 37/37. It drags the source marker while the Loupe tool remains active,
  verifies no new layer is created, and observes one `updateLayer` command that
  keeps source-region dimensions while moving its centre.
- During the drag, the non-reactive transient source region is rendered through
  the ordered Canvas2D scene, so its connector, lens sample and overlay marker
  use the same source centre in each frame; only pointer-up writes the command.
- Moving or resizing the lens uses that same ordered scene path. The generic
  overlay deliberately receives no loupe node, because it cannot provide the
  composite-below surface required to render the connector and lens together.
- The complete Vue project passed 14 files and 151/151 tests. JSDOM reports its
  known unimplemented canvas-context notices during unrelated tests, but they
  do not fail a test or produce an unhandled exception.
- `pnpm typecheck` and scoped Prettier verification passed. No browser or
  real-Tauri evidence is claimed for this focused interaction repair.

## Windows selector and standalone quick-capture repair (2026-08-23)

Windows 10 22H2 build 19045, AMD64. The repair is limited to native Windows
Area/Window selection, controller cancellation, editor visibility during
native capture and Tauri frontend packaging; document schema, `EditorCommand`,
immutable originals and renderer/export are unchanged.

- Red-first Rust compilation failed on the new moving-hint, dim-layer,
  crosshair and packaged-app-URL contracts before their helpers existed. The
  final focused Windows module run passed 13 tests with its one interactive
  DXGI probe explicitly ignored. A stray button-up without a preceding down is
  also ignored instead of terminating the selector.
- Physical Win32 input moved the cursor to two distant points and the camera
  hint followed in `artifacts/selector-follow-a2.png` and
  `artifacts/selector-follow-b2.png`. A 500×375 injected physical drag produced
  the DPI-adjusted 625×469 dashed selection in
  `artifacts/selector-drag-final2.png`; the desktop remained dimmed throughout.
  The hint has no Cancel button; Escape is the cancellation path.
- `GetCursorInfo` returned handle `0x10009`, exactly matching the loaded
  `IDC_CROSS` handle while the selector was active. Injected Escape then
  returned CLI JSON `outcome: cancelled` and removed the selector.
- The first standalone replay exposed `asset not found: index.html`, proving
  that redirecting a development build to the app protocol cannot substitute
  for embedded assets. Adding the standard `custom-protocol` Cargo feature,
  rebuilding `apps/desktop/dist` and compiling with that feature produced
  `artifacts/quick-capture-packaged-final.png`: the selected image, crop frame,
  annotation toolbars and Editor/Copy/Save/Close actions rendered without a
  running Vite server. Escape closed it and the CLI returned
  `outcome: cancelled`.
- `cargo test --workspace` passed 89 tests with the interactive DXGI probe
  ignored. `pnpm check:rust` passed formatting plus every configured Clippy
  feature combination, including `--all-features`; scoped Prettier,
  `pnpm docs:check` and `git diff --check` passed after the evidence update.

## Quick-capture overlay geometry repair (2026-08-23)

Windows 10 22H2 build 19045, AMD64; standalone Tauri custom-protocol build.
The change is limited to quick-mode viewport/chrome geometry and its crop
gesture boundary; normal editor Crop, document schema, renderer/export and
immutable originals are unchanged.

- The red-first layout test failed because no shared quick-capture geometry
  function existed. Final pure layout coverage maps source crop coordinates to
  the fitted frozen frame, moves both action/tool groups with the crop and
  flips actions right→left plus tools below→above at viewport collisions.
- CanvasViewport component coverage streams transient quick-frame bounds on
  pointermove and emits exactly one `setCrop` command on pointerup. The first
  full suite exposed an unintended normal-editor Crop commit; the behavior was
  narrowed to `quickFrameMode`, and focused normal/quick coverage then passed
  74/74.
- A physical Windows replay selected a 1501×850 area, opened the packaged
  quick surface and resized it to 1063×625. The frozen desktop fills the
  frameless viewport with no dotted workspace, padding or scrolling. Visual
  evidence in `artifacts/quick-layout-before-resize.png`,
  `artifacts/quick-layout-during-resize.png` and
  `artifacts/quick-layout-after-resize.png` shows actions following the right
  edge and annotation/context/history chrome following the bottom edge during
  the drag, not only after release. Escape returned CLI `outcome: cancelled`.
- Final `pnpm test` passed 49 files and 442/442 tests. `pnpm check` passed ESLint,
  TypeScript/package builds, repository-wide Prettier, Markdown links, 7/7
  boundary tests and every configured Rust fmt/Clippy feature combination.

## Quick-capture terminal-action repair (2026-08-23)

Windows 10 22H2 build 19045, AMD64. The change is limited to Area quick-mode
Copy/Save/Editor selection normalization and Close error handling; document
schema, renderer/export contracts and immutable originals are unchanged.

- The red-first Vue test failed to resolve the not-yet-created terminal-action
  module. Final coverage converts fractional transient crop edges such as
  `678.0000152587891` to bounded integer physical-pixel edges, and rejects
  invalid/non-finite selection geometry.
- The same normalized selection is now used for Canvas2D PNG extraction,
  immutable-source dimensions, quick-document rebasing and the
  `quick_capture_commit` IPC argument. This prevents the Tauri `expected u32`
  deserialization failure without allowing PNG/document/metadata dimensions to
  diverge.
- Close-path coverage proves that the visible Close button reaches the native
  window close call before a draft has mounted, starts close without waiting
  for `quick_capture_cancel` to settle, and still attempts close when that IPC
  rejects. A close failure remains a visible error rather than an unhandled
  Promise rejection.
- Focused quick terminal/layout/viewport coverage passed 40/40 before the
  explicit button-wiring regression was added; the final terminal-action file
  passes 5/5. The final full `pnpm test` run passed 50 files and 447/447 tests.
  `pnpm check` covers lint, typecheck, formatting, documentation, boundaries and
  Rust checks; no additional real-Tauri terminal-action evidence is claimed by
  this section.

## Production quick-capture lifecycle permission repair (2026-08-23)

Windows 10 22H2 build 19045, AMD64. The change is limited to production Tauri
capability scoping and the reusable quick-window lifecycle; document state,
immutable originals and export contracts are unchanged.

- The earlier close-path boundary required `core:window:allow-close` while the
  WebView destroyed itself. The reusable surface now presents and dismisses
  only through draft-checked native commands, so the WebView no longer owns
  close authority and that permission was removed again.
- The main and quick-capture windows continue to use separate production
  capabilities; the main window keeps its previous permissions.
- Final `pnpm test:boundaries` passed 8/8, the focused quick-capture terminal
  action suite passed 5/5 and `pnpm test` passed 50 files with 447/447 tests.
  `pnpm check` passed all configured frontend, documentation, boundary and Rust
  gates. `pnpm tauri build --debug --no-bundle` validated the production
  capability configuration and built `target/debug/cute-screen.exe`. No
  physical Escape/Copy runtime smoke is claimed by this section.

## Hidden quick-capture presentation handoff (2026-08-23)

Windows 10 22H2 build 19045, AMD64; standalone production custom-protocol
build. The change is limited to the Area quick-window lifecycle and its first
visible frame; document schema, editor commands, immutable originals and
renderer/export output are unchanged.

- Red-first Rust tests failed to compile before the hidden/unfocused window
  policy and active-draft presentation boundary existed. The red-first Vue
  test also observed action chrome in an idle prewarmed WebView.
- The native window is created hidden during Area preflight with background
  throttling disabled. It is not focused or shown by `QuickEditing`; the
  frontend loads the binary image, renders the committed scene and interaction
  overlay, waits for layout plus two animation frames, then presents through a
  command that rejects stale draft IDs. Terminal actions hide and reset the
  same WebView for the next capture.
- A physical Win32 drag against `target/debug/cute-screen.exe` sampled three
  small screen regions after mouse-up without retaining screen content. Across
  67 samples it produced two stable visual runs: the restored desktop beginning
  79 ms after mouse-up and the ready quick surface beginning 2252 ms after
  mouse-up. The only other runs were single-sample transition boundaries; no
  stable blank/loading surface or oscillation was observed. A separate window
  probe confirmed the visible `Cute Screen Quick Capture` surface.
- `cargo test --workspace` passed 91 tests with the interactive DXGI probe
  ignored. `pnpm test` passed 50 files and 449/449 tests. `pnpm check` passed
  lint, typecheck/builds, formatting, docs, boundary tests and all configured
  Rust Clippy feature combinations. `pnpm tauri build --debug --no-bundle`
  produced the standalone binary used by the physical replay.

## Resident quick-capture latency repair (2026-08-24)

Windows 10 22H2 build 19045, AMD64; standalone optimized Tauri
`custom-protocol` build. The change is limited to the resident Area quick-mode
handoff and its temporary preview transport; committed originals and exported
results remain PNG and continue through the normal repository transaction.

- Red-first Rust tests failed before process-start quick-window prewarm, DXGI
  pointer-resource acceptance, opaque top-down BMP encoding, transparent
  non-activating compositor pulse and memory-owned preview staging existed.
  The red-first Vue transport test observed an attempted empty asset URL before
  native memory previews selected the existing binary IPC path directly.
- DXGI duplication is prepared before the selector, but acquisition still
  occurs only after mouse-up, selector destruction, foreground restoration and
  DWM flush. The selector lifecycle itself therefore supplies a queued final
  compositor update instead of waiting up to two seconds for an unrelated next
  desktop present.
- The temporary full-desktop Area preview uses an uncompressed top-down BMP,
  remains in native memory and transfers as a binary Tauri response. It is not
  JSON/base64 and is discarded on cancel or after the final normalized PNG has
  been committed. Hashing is performed once at native import.
- Three optimized physical replays on a 2560×1440 framebuffer (2048×1152
  logical desktop at 125% DPI) measured 450, 460 and 472 ms from mouse-up to
  visible interactive chrome, down from 2252 ms. Native stage telemetry was
  14–17 ms for the final compositor frame, 4–6 ms for BMP encoding and 25–27 ms
  for memory import.
- A 1000 ms visual-state replay retained hashes only during sampling. It found
  one stable restored-desktop run through 474 ms, two single-sample transition
  boundaries, then one stable ready quick surface from 559 ms onward. Visual
  inspection confirmed a normally lit selected region, dimmed outside crop and
  fully positioned tool/action chrome; no selector contamination, blank WebView
  or oscillation appeared.

## Quick-capture first-frame placement and native dash repair (2026-08-24)

Windows 10 22H2 build 19045, AMD64. The change is limited to transient Area
selector/quick-mode chrome; document commands, immutable originals and export
bytes are unchanged.

- Red-first Vue tests failed because no stable-layout presentation gate
  existed. Red-first Rust compilation failed because the native selector had
  no explicit transparent background contract for dashed-pen gaps.
- The hidden quick WebView now refuses fallback toolbar dimensions and waits
  until the scene, action panel and tool group have positive measured sizes
  with identical geometry in two consecutive layout frames. Only then is its
  chrome marked ready and the native window presented; pre-layout default CSS
  positions remain invisible.
- The Windows GDI selector sets `TRANSPARENT` background mode before drawing
  the `PS_DASH` frame. This prevents the default opaque white background from
  filling the spaces between white strokes and making the in-drag frame appear
  solid.
- Focused red/green evidence: quick-layout Vitest 5/5 and the Windows native
  dash regression 1/1. Final `pnpm test` passed 50 files and 452/452 tests;
  `cargo test --workspace` passed 99 tests with one interactive DXGI test
  ignored; `pnpm check` passed lint, typecheck/builds, formatting, docs,
  boundary tests and configured Rust Clippy feature combinations.
  `pnpm tauri build --debug --no-bundle` produced
  `target/debug/cute-screen.exe`. Physical Win32 no-jump/dashed-drag visual
  replay remains pending.

## Tauri multi-WebView context-selection repair (2026-08-24)

Windows 10 22H2 build 19045, x64; Node 22.23.1, pnpm 10.33.2 and Rust 1.97.0.
The repair is limited to the test-driver bootstrap and does not disable the
production startup prewarm of the hidden `quick-capture` WebView.

- Linux CI run 32670839063 reached real Tauri E2E after the resident quick
  WebView was introduced. Only 3 of 14 isolated scenarios passed; the remaining
  scenarios timed out while looking for their main-window harness, including
  `tauri-renderer-corrupted.e2e.ts` with `M01 harness did not mount`.
- The embedded service defaults its logical label to `main`, but an initial
  WebDriver context may still point at another prewarmed WebView. The runner now
  explicitly calls `browser.tauri.switchWindow('main')` in its `before` hook,
  after the service has initialized and before any spec hook or selector runs.
- The red-first focused boundary run failed at module resolution before the
  main-window selector existed. The final focused run passed 2/2; the complete
  boundary suite passed 10/10. `pnpm exec tsc --noEmit -p
tests/e2e/tsconfig.json`, scoped formatting, `git diff --check` and the full
  `pnpm check` gate passed.
- This host cannot run the Linux WebKitGTK scenario. Run 32670839063 remains the
  failing reproduction; a post-repair `xvfb-run --auto-servernum pnpm
test:e2e:tauri` rerun is required before recording new real-WebKit evidence.

## Ubuntu X11 startup/dialog/quick-capture repair (2026-08-24)

Ubuntu 24.04.4 LTS, GNOME Shell 46, x86_64 X11. The repair is limited to
recoverable startup errors, native file-dialog scheduling, hidden WebKitGTK
quick-window presentation and X11 frozen-frame presentation. Document v7,
immutable originals and renderer/export output are unchanged.

- Red-first focused Vitest failed 4 cases: native `olderSchema` fell back to a
  generic message, the present-before-measure helper did not exist, five
  production commands still contained blocking dialog calls and the X11
  selector replayed a captured native image. The red-first Rust selector test
  failed to compile before the target-visual RGBA writer existed.
- Последующая пользовательская проверка с непрерывным движением выявила
  накопление следов X11 transient UI, которое одиночный синтетический переход
  не покрывал. Для `REQ-CAP-009` добавляется отдельный red-first damage test:
  старые рамка, badge и cursor hint должны восстанавливаться из frozen backing
  pixmap до отрисовки следующего состояния; XOR redraw запрещён.
- Final focused evidence passed 21/21 Vitest tests and the target-visual Rust
  pixel test. After the continuous-motion regression was added,
  `cargo test --workspace` passed 95/95. The first parallel
  `pnpm test` run lost one worker while Rust compiled concurrently; the isolated
  rerun passed 50/50 files and 454/454 tests. `pnpm check` passed lint,
  TypeScript/Vue builds, formatting, docs, 13/13 boundary tests and every
  configured Rust Clippy feature combination. `pnpm test:render` passed its
  13/13 renderer golden tests.
- `pnpm tauri build --debug --no-bundle` produced the embedded-frontend debug
  binary. A clean isolated profile accepted CLI Area; the X11 selector encoded
  its 2560×1440 canonical RGBA frame for root visual/depth in 376–382 ms in an
  unoptimized build, completed a 600×400 physical drag, then mapped the
  2560×1440 quick WebView. The frozen frame, crop, action bar and tool rail were
  visually inspected in `/tmp/codex-shot-2026-08-24_18-15-32.png`; Close
  returned terminal `cancelled` and did not materialize the draft.
- After the continuous-motion damage repair, the rebuilt packaged binary was
  exercised with 472 cursor-hint moves and 120 pressed-drag rectangle updates.
  The inspected `/tmp/codex-shot-2026-08-24_18-31-00.png` and
  `/tmp/codex-shot-2026-08-24_18-31-30.png` contain exactly one current
  transient visual and no accumulated trail. The selector reached its normal
  60-second cancellation boundary without an X11 drawing error.
- The locally installed Ubuntu package `gnome-shell 46.0-0ubuntu6~24.04.14`
  was inspected through its bundled `/org/gnome/shell/ui/screenshot.js`
  resource. GNOME keeps the captured stage as content and moves/resizes a
  retained selection widget for motion events. Cute Screen adopts only that
  architectural observation (immutable backing plus transient state), without
  copying or linking GPL implementation code.
- GNOME Open image remained responsive for more than one minute and cancelled
  normally after the command moved from `blocking_pick_file` to callback/async
  completion with the main window as parent. The historical
  `smoke:m04:x11:area` script still assumes pre-quick direct persistence and
  therefore cannot complete the current terminal draft contract; it is not
  recorded as a passing end-to-end run.
- Follow-up pointer-release smoke (2026-08-24): after `pnpm tauri build --debug
--no-bundle`, an isolated Ubuntu/GNOME X11 profile ran
  `target/debug/cute-screen capture --mode area --json`. `xdotool` issued only
  a `300,220 → 900,620` primary drag; the selector returned, and
  `Cute Screen Quick Capture` mapped at `2560×1440` before any `Enter` was
  injected. Escape produced typed terminal JSON `cancelled`; the profile was
  removed. The resident-editor regression additionally inspected X11 map state:
  `main` was `IsUnMapped` while `Cute Screen Quick Capture` was `IsViewable`.
- Resident-editor frozen-frame regression (2026-08-24): the first client-only
  gate was rejected by user runtime evidence because Mutter's separately owned
  `_MUTTER_FRAME_FOR` decoration remained visible as a blank grey editor window.
  The rebuilt isolated X11 debug smoke clicked the actual Capture button and
  confirmed the client became `IsUnMapped`, the linked Mutter frame was
  destroyed, and both remained absent through the then-configured 100 ms
  compositor-settle interval. The 2026-08-28 visibility follow-up below
  supersedes that boundary with 300 ms. After a post-map pointer move,
  `/tmp/cutescreen-frame-settled-selector-hint.png` shows the selector hint over
  the frozen VS Code desktop with no editor client, grey surface, title bar or
  shadow. Escape restored the client and created a new visible decoration.

## X11 resident quick-preview latency repair (2026-08-28)

Ubuntu 24.04.4 LTS, GNOME Shell 46, x86_64 X11; resident Tauri dev/Vite
process at a 2560×1440 physical framebuffer. `docs/TRACEABILITY.md` was updated
before the test and production change.

- The red-first focused Rust command failed to compile because the new
  `import_quick_rgba_preview` boundary did not exist. The unchanged focused
  test then passed and proves a top-down 32-bit BMP with exact BGR pixels,
  opaque alpha, empty asset URL and no source-root transport file.
- X11 Area now imports that BMP through native-owned memory after pointer
  release. Screen, Window, Active Window and Repeat retain their PNG path;
  Copy, Save and Editor still materialize the normalized final PNG through the
  existing quick-result transaction. No JSON/base64 image transport was added.
- The Electron prototype was inspected only to explain the perceived latency:
  it cropped the selection immediately and restored its resident editor,
  whereas the current product intentionally retains a full frozen desktop so
  the quick crop can expand. No implementation code was copied.
- Local replay measured 700 ms for the first observed mouse-up → viewable quick
  surface and 486 ms for the warm replay in the unoptimized dev/Vite process.
  Escape returned typed `cancelled` without materialization. A third automated
  attempt cancelled before presentation and is not reported as a latency
  failure or success. Repeated optimized-build measurement remains pending.
- `cargo test --workspace` and `cargo test --workspace --features x11-capture`
  each passed 102/102. Production-only all-features Clippy passed with
  `unwrap_used` and `expect_used` denied. `pnpm test` passed 51 files and
  457/457 tests. The first `pnpm check` reached repository formatting and
  stopped only because the new traceability row needed Prettier; the complete
  rerun then passed lint, package/app/test/E2E typechecks and builds,
  repository-wide formatting, 34-file documentation validation, 14/14 boundary
  tests and every configured Rust fmt/Clippy feature combination.

## X11 selector visibility follow-up (2026-08-28)

Ubuntu 24.04.4 LTS, GNOME Shell 46, x86_64 X11; resident Tauri dev/Vite
process at 2560×1440. This follow-up covers the user-reported delayed editor
silhouette, incomplete cursor camera and white-on-white Area frame.

- The red-first Rust tests initially failed because the 300 ms compositor
  boundary, two-stroke selection plan and complete camera geometry did not
  exist. The text-background regression was then reproduced physically as a
  black X11 `ImageText8` box and locked by a separate foreground/background
  color contract before its implementation.
- Native CLI, tray and hotkey ingress now perform the same post-hide X11 unmap
  gate that UI ingress already performs before `capture_request`. The old
  100 ms interval is rejected; client/frame absence must remain stable for
  300 ms before the frozen frame is acquired. A failed native wait restores
  the hidden editor and returns a typed capture failure.
- The selector draws a 4 px dark solid frame first and a 2 px white dashed
  frame above it. The pre-drag hint is an opaque rounded white card with dark
  text and an outlined camera body, top and centred lens.
- In a warm CLI replay, Area remained open for more than four seconds over
  Chrome without an editor client, grey compositor actor, frame or shadow.
  `/tmp/cutescreen-selector-predrag-final-2026-08-28.png` records the hint.
  A second replay dragged 600×650 physical pixels across the white Writer page;
  `/tmp/cutescreen-selector-white-page-drag-final-2026-08-28.png` shows the
  complete high-contrast border and dimension badge. Escape returned terminal
  JSON `cancelled` in both runs. Optimized, mixed-DPI and cross-monitor replay
  remain separate platform gates.
- `cargo test --workspace` and `cargo test --workspace --features x11-capture`
  each passed 107/107. `pnpm test` passed 51 files and 457/457 tests.
  `pnpm check` passed lint, package/app/test/E2E typechecks and builds,
  repository-wide formatting, 34-file documentation validation, 14/14
  boundary tests and every configured Rust fmt/Clippy feature combination.

## X11 selector Lucide camera follow-up (2026-08-28)

- The native X11 hint now uses the official 24×24 Lucide Camera SVG matched to
  the existing `@lucide/vue` 1.31.0 dependency. The vendored source URL and the
  complete ISC notice live beside the asset. Capture performs no network
  request and does not parse SVG while the selector is active.
- The red-first Rust test initially failed because the asset/decode boundary did
  not exist. Final tests prove the source remains a Lucide `camera` SVG and its
  pre-rasterized native derivative is bounded, opaque 24×24 RGBA. X11 uploads
  the derivative once to a pixmap and motion only copies that pixmap.
- Ubuntu 24.04/GNOME 46 X11 physical replay showed the Lucide camera inside the
  rounded pre-drag hint. Escape returned typed terminal JSON `cancelled`.
  Evidence: `/tmp/cutescreen-selector-lucide-camera-2026-08-28.png`.
- `cargo test --workspace` and `cargo test --workspace --features x11-capture`
  each passed 108/108. `pnpm check` passed lint, typechecks/builds, formatting,
  35-file documentation validation, 14/14 boundary tests and every configured
  Rust fmt/Clippy feature combination.

## macOS 12 startup without focus (2026-08-29)

macOS 12.7.6 (21H1320), x86_64 Intel, WKWebView 605.1.15. The repair is limited
to last-document / empty-profile launch leaving `loading` without a click,
Shift+Tab or other focus event, and to skipping the hidden `quick-capture`
WebView on the current Screen-only macOS backend. Area, Window, hotkey and
decoded-PNG Screen capture remain outside this record.

- Focused Vue: `app-startup.test.ts` 2/2; `App.test.ts` plus capture/store
  regressions 38/38. Isolated `App.test.ts` later 22/22, then 21/22 on a
  second pair with `m08-precision-interactions.test.ts` because one unrelated
  M02 Arrow default test hit the 5s timeout.
- `cargo test -p cute-screen-desktop --lib prewarm` 3/3, including
  `macos_screen_backend_does_not_prewarm_quick_capture`.
- `pnpm test` after `fixtures:generate:m01`: 458/463. The five failures were
  5s timeouts in unrelated M02/M08 Vue cases under full-suite load, not
  startup/mount. `cargo test --workspace` 108/108. Scoped Prettier/ESLint on
  the startup files and `cargo clippy -p cute-screen-desktop --lib
--all-targets -- -D warnings` passed. Full `pnpm check` was not rerun
  against the already dirty tree.
- `pnpm tauri dev` with the existing last document
  (`session.activeCaptureId` `01a0491c-f9eb-7251-9473-810f9456395b`, schema 7) left `loading` and mounted the persisted document without a click or
  Shift+Tab. Capture and Open image stayed available. CGWindow list had one
  `Cute Screen` window and no `Cute Screen Quick Capture`. Evidence:
  `artifacts/macos-startup/last-document.png`.
- The same command on a moved-aside app-local-data/cache profile left
  `loading` for the empty title «Сделайте первый снимок» with Capture and
  Open image available. Again no `quick-capture` window. Evidence:
  `artifacts/macos-startup/empty-profile.png`. The previous library was
  restored afterwards.
- This does not claim macOS Screen capture `supported`, Area/quick-mode, or
  Windows/Linux startup runtime.

## Editor shell height chain (2026-08-29)

macOS 12.7.6 (21H1320), x86_64, Node `22.23.1`, Chrome `150.0.7871.125`.
`.cs-editor-shell` no longer uses `100dvh`. `#app`, `.n-config-provider` and
the shell share `height: 100%` so the absolutely positioned workbench cannot
exceed the window.

- Focused `CUTE_SCREEN_BROWSER_E2E_PORT=5179 pnpm exec wdio run
  tests/e2e/wdio.browser.conf.ts --spec tests/e2e/specs/browser-shell.e2e.ts`
  passed 6/7. The 1024×700 case asserted `.n-config-provider` fills `#app`,
  `.cs-workbench` is not taller than `#app`, and filmstrip/rail/zoom stay
  inside `window.innerHeight`. Screenshot:
  `artifacts/browser-e2e/m02-ready-1024x700.png`.
- The remaining `loading` / recoverable-error / keyboard-focus case timed out
  at 30s after the layout cases; a later isolated retry was interrupted by
  unrelated HMR. That case is outside this height-chain change.
- `pnpm test:e2e:tauri` was not run on this machine.

## CI gates

### Каждый PR

- Markdown links/check;
- formatting, lint, TypeScript и Rust type checks;
- dependency/license/security audit;
- unit/property/component tests;
- renderer goldens;
- browser E2E;
- Linux fake-backend Tauri smoke;
- compile checks Windows/macOS и доступные ARM targets.

### Nightly

- На текущей системе: доступные real-Tauri, performance trends, large fixtures,
  memory/soak и system smokes.
- После функционального завершения: real-Tauri и system platform smokes на
  Linux, Windows и macOS.

### Versioned build

- полный test matrix;
- unsigned artifact install/launch smoke с ожидаемыми platform warnings;
- real capture/hotkey smoke;
- GitHub tag version-check: newer/equal/older, ETag 304, offline, timeout и rate limit;
- отсутствие updater/download/install кода и фоновых запросов без opt-in;
- SBOM, checksums и license report;
- заполненная traceability matrix без `planned`/`blocked` строк.
