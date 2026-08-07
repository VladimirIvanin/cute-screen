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
pnpm smoke:m01:x11
pnpm smoke:m01:portal:probe
pnpm smoke:m01:portal:screenshot
pnpm smoke:m01:portal:shortcuts
pnpm smoke:m01:portal:invalid-uri
```

`pnpm check` включает Rust format и все три CI-конфигурации Clippy с `-D warnings`; изменения Rust не передаются в CI без этого локального gate.

Каждая команда возвращает ненулевой exit code при провале и не изменяет tracked files.

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

Property-based тесты покрывают:

- `screenToImage(imageToScreen(point)) ≈ point`;
- resize/rotate не создаёт NaN/Infinity;
- locked layer не меняется command-операциями;
- undo(apply(command)) возвращает эквивалентный документ;
- serialization round-trip сохраняет semantic document;
- migrations идемпотентны относительно текущей версии;
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
- marker blend modes;
- censor modes;
- text RU/EN и multiline;
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

Platform visual snapshots создаются отдельно для Linux, Windows и macOS shell layouts. Системные window controls остаются native и не имитируются snapshot CSS.

## E2E suites

### Browser mode

- capture result поступает из mocked adapter;
- все editor tools и contextual toolbar;
- undo/redo и overlap cycling;
- clipboard type dispatch;
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

Tauri tests выполняются последовательно там, где single-instance, fixed ports или shortcuts могут конфликтовать.

### System smoke

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

M01 `pnpm test:perf` выполняет 30 warmups и 120 измеряемых полных software-CanvasKit redraws для 4K/500 и 8K/1000 и пишет `artifacts/perf/m01-renderer.json` с runner identity и fixture SHA. Бюджеты становятся blocking только при `CUTE_SCREEN_REFERENCE_RUNNER=1`; любое ненулевое число idle frames остаётся hard failure везде.

Linux system smoke пишет JSON в `artifacts/m01/`: commit SHA, OS/arch/session, portal и WebKitGTK versions, monitor layout, correlation ID и observable result. `portal-screenshot` и `portal-shortcuts` интерактивны; cancel записывается как ожидаемый outcome без error-log. Эти локальные файлы становятся milestone evidence только после загрузки в CI/system-run artifact с устойчивой ссылкой.

## Диагностика и incidents

- Frontend invoke, Rust command и long operation используют correlation ID.
- Runtime checklist сопоставляет browser console, Rust structured log, app version, platform и artifact SHA.
- Пустые `catch {}` блокируются lint.
- Unexpected error получает toast/dialog и log context.
- Incident не закрывается без regression test на уровне, где проявлялась ошибка.
- Postmortem сохраняется по `docs/retrospectives/_TEMPLATE.md` и обновляет requirement/ADR/test при необходимости.

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

- real-Tauri suite на Linux, Windows и macOS;
- performance trends;
- large fixtures;
- memory/soak;
- scheduled system platform smokes на доступных runners.

### Versioned build

- полный test matrix;
- unsigned artifact install/launch smoke с ожидаемыми platform warnings;
- real capture/hotkey smoke;
- GitHub tag version-check: newer/equal/older, ETag 304, offline, timeout и rate limit;
- отсутствие updater/download/install кода и фоновых запросов без opt-in;
- SBOM, checksums и license report;
- заполненная traceability matrix без `planned`/`blocked` строк.
