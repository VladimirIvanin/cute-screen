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
```

`pnpm check` включает Rust format, три CI-конфигурации Clippy с `-D warnings` и production-only gate против `unwrap()`/`expect()`; изменения Rust не передаются в CI без этого локального gate.

Каждая команда возвращает ненулевой exit code при провале и не изменяет tracked files.

## Локальные execution records

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
- Screen Recording permission на macOS;
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
- macOS Intel/Apple Silicon: permission, hotkey, overlay, Retina;
- install/update/uninstall на каждом артефакте.

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
Callout bubble/tail и Numbered Marker badge сохраняют разные container
semantics. Canvas2D preview/export совпадают по RGBA; CanvasKit/Canvas2D
укладываются в существующий semantic tolerance. Это headless renderer evidence,
не browser/Tauri/contenteditable/IME acceptance.

Корректирующий прогон проверяет Cyrillic coverage через реальные CanvasKit glyph
IDs: Latin-only font data обязана завершить render явной ошибкой вместо `.notdef`
tofu. Harness передаёт CanvasKit и регистрирует для headless Canvas2D оба уже
аудированных Roboto subset (`latin` и `cyrillic`); в явно перегенерированных PNG
слово «справа» читается в обеих backend-ветках. Цветной emoji-шрифт не добавлялся,
его одинаковый fallback не считается доказательством emoji glyph coverage.

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
  selected text-bearing layer;
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
