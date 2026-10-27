# Стратегия тестирования

## Шрифты Canvas2D unit tests (2026-10-28)

Baseline `6a49290` + рабочая копия, macOS 12.7.6 Intel x86_64.
Text/ruler fixtures регистрируют встроенные Latin faces Roboto 400/600/700 normal
и PT Serif 700 italic под private aliases и выбирают их через font resolver.
Отсутствующий font asset завершает setup ошибкой. Generic families заменены
конкретными; проверки пикселей и допуски не изменены. Test kits исключены
из production TypeScript build, но проверяются через tests tsconfig.

`DISABLE_SYSTEM_FONTS_LOAD=1 pnpm exec vitest run --project renderer packages/editor-renderer/src/canvas2d-text-paint.test.ts packages/editor-renderer/src/precision-canvas2d.test.ts`:
2 files / 27 passed.
`DISABLE_SYSTEM_FONTS_LOAD=1 pnpm exec vitest run --project renderer`:
20 files / 200 passed. Это headless software evidence; повтор Linux CI
остаётся необходимым для подтверждения устранения исходного сбоя.

`pnpm exec tsc --noEmit -p packages/editor-renderer/tsconfig.json` и
`pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` — passed.
Полный `pnpm check` и browser/native suites не запускались: production renderer
не изменён. Краткий отчёт — `artifacts/canvas2d-test-fonts/summary.txt`.

## macOS smoke harness repair (2026-10-28)

Baseline ab7e88b, macOS 12.7.6 Intel x86_64, SDK 13.1, Rust 1.97.0.
`cargo test -p cute-screen-desktop --features platform-smoke --bin m04-platform-smoke macos_smoke_checks`:
2 passed (unexpected terminal outcomes, full PNG decode/dimension validation).
Первый повтор `pnpm smoke:m04:macos:screen` после AppKit-loop repair больше
не зависает на permission dispatch: native capture вернул timeout, smoke
сохранил JSON и завершился exit 1. Это подтверждает исправление false-success,
но не успешный capture. Timeout теперь содержит этап: shareableContent,
firstFrame или stopCapture. Повтор локализовал сбой: `firstFrame` (shareableContent
уже получен). Runtime Screen/Area/Quick WebView остаётся pending.

`cargo clippy -p cute-screen-desktop --features platform-smoke --bin m04-platform-smoke -- -D warnings`
и `pnpm format:check` — passed. Полный `pnpm check` не запускался.

`pnpm exec vitest run packages/editor-renderer/src/canvas2d-text-paint.test.ts packages/editor-renderer/src/precision-canvas2d.test.ts`:
27 passed; повтор с `DISABLE_SYSTEM_FONTS_LOAD=1` — 27 passed. CI run
40596405480 упал в Linux unit job; macOS Intel/ARM compile jobs прошли.
Renderer failure из CI локально не воспроизведён, допуски не ослаблялись.

`pnpm smoke:m04:macos:area` проверяет только native selector, сохраняет
выделенный crop в `artifacts/m04/macos-area.png` и проверяет full-frame/crop PNG
повторным decode. Это не Quick WebView/materialization evidence.
`pnpm smoke:m04:macos:area-cancel` требует Escape и ожидает именно cancelled;
permissionDenied/failed не считаются успешной отменой. После grant требуется
новый запуск команды/приложения.

## ScreenCaptureKit desktop (2026-10-28, ADR-157)

Baseline `58196e0781c11b321fe9ab8563c364cada7a9d0f` + рабочая копия,
Windows x64 / PowerShell / Rust 1.97.0. До реализации
`cargo test --package cute-screen-desktop --lib macos_ffi::tests` завершился
ожидаемым compile failure: отсутствовали NativeDesktopFrame и status mapping.
После реализации та же команда: 4 passed; `cargo test --workspace`:
208 passed, 1 existing ignored, doctests passed. Проверены ABI, exact BGRA length,
null/empty/overflow rejection, status distinction и atomic cancellation probe.

`cargo fmt --all`, `pnpm format` и полный `pnpm check`: passed, включая
lint/typecheck/format/docs, boundary tests, IPC/schema и все configured Clippy
passes. Первый check остановился на неверном ADR anchor; ссылка исправлена,
повторная полная команда завершилась с exit 0. Evidence — `artifacts/macos-sck/`.

Новые native contracts проверяют настоящие CoreGraphics bitmap helpers,
version routing и native waiter без запроса TCC. В macOS Intel/ARM CI добавлены
их запуск и legacy-SDK syntax check нового `.m`. Они ещё не запускались на Mac
в рамках этой сессии; Windows не компилирует этот Objective-C код.
Реальные grant/deny/relaunch, Screen/Area, Retina/mixed-scale, decoded exports
и завершение SCStream на macOS 12.7.6/14+ остаются pending. Чеклист — ACCEPTANCE.md.

## Portal lifecycle и screenshot research (2026-10-26, ADR-156)

Baseline `8fe6c91` (main после fast-forward), рабочая копия. Windows x64 /
WebView2 155.0.4283.62; Linux проверки — WSL Ubuntu 22.04 / Rust 1.97.0.
[Исследование Windows/macOS](SCREENSHOT_PROJECTS_RESEARCH.md) фиксирует upstream
commits, конкретные tests/issues, наши существующие контракты и pending проверки.
Чужие программы локально не запускались, GPL/AGPL-код не переносился.

- `cargo test --workspace` (Windows): 206 passed, 1 ignored. Новый portable
  ActivationTokens проверяет single-use, correlation scope и RAII cleanup.
- `cargo test -p cute-screen-portal --target x86_64-unknown-linux-gnu` (WSL):
  2 unit + 9 integration passed. Каждый integration case запускает собственный
  dbus-daemon, явно подключает обе стороны и завершает child. Пользовательская
  session bus и DBUS_SESSION_BUS_ADDRESS не подменяются. Red-first evidence
  сохранён до реализации; отдельный failing case выявил неверный mapping NotAllowed.
  Проверены Response до method reply, cancel до send/до reply/во время ожидания,
  Request.Close без Response, повторный capture, user cancel/error, permission
  denial, service disconnect, activation во время Bind, token и чужая session,
  Session.Closed, настоящий release/name reacquisition новым server connection.
  Ожидание человека дольше технического handshake timeout также проходит.
- `cargo clippy -p cute-screen-portal --target x86_64-unknown-linux-gnu --all-targets -- -D warnings`:
  passed. `cargo deny check licenses` (Windows): passed, включая gdkwayland.
- `pnpm test tests/unit/vue/quick-capture-actions.test.ts tests/unit/vue/quick-capture-action-controller.test.ts tests/unit/vue/brushes.test.ts tests/unit/vue/keyboard-shortcuts.test.ts tests/unit/vue/settings-locale.test.ts tests/unit/vue/window-capture-recovery.test.ts packages/editor-renderer/src/effect-cache.test.ts`:
  7 files / 42 passed. Дополнительно ранее прошли 71 focused unit tests и render blur/flip case.
- `CUTE_SCREEN_E2E_SCENARIOS=capture-lifecycle,blur-optimization,quick-chrome pnpm test:e2e:tauri`:
  fresh harness, external tauri-driver/EdgeDriver, native input. Blur optimization
  case прошёл: 4K source, live lower-layer changes, decoded export. Первый прогон
  UI cases выявил ошибки test selector и координат; вся команда тогда не прошла.
- `CUTE_SCREEN_E2E_SCENARIOS=capture-lifecycle,quick-chrome pnpm test:e2e:tauri`:
  capture-lifecycle 2/2 passed. Production Capture → Quick → Editor → Text → Shape
  → circle: после завершённой перерисовки текста изменяются только пиксели фигуры.
  Второй capture через dispatcher с hotkey/tray/CLI/UI invocationSource получает
  Busy и тот же draft ID; surface остаётся одна. Это проверка dispatcher, не
  физического нажатия четырёх источников. Annotated Quick Copy закрывает surface;
  отдельный Windows STA process читает системный bitmap, PNG декодируется заново:
  400×300, непрозрачный, содержит аннотацию. Скриншоты просмотрены.

Финальная проверка: `pnpm check` passed полностью (включая 113 boundary tests,
1 existing skipped case, IPC/schema и все configured Rust Clippy passes);
`cargo clippy -p cute-screen-desktop --target x86_64-unknown-linux-gnu --all-targets -- -D warnings`
в WSL passed. Native сценарии проверены отдельными прогонами:
`CUTE_SCREEN_E2E_SCENARIOS=capture-lifecycle,quick-chrome pnpm test:e2e:tauri` —
Quick chrome 7/7 passed в `native-validation.log`, общий exit 1 из-за одного capture failure;
`CUTE_SCREEN_E2E_SCENARIOS=capture-lifecycle pnpm test:e2e:tauri` — финальный
чистый прогон 2/2 passed, exit 0, `native-final-result.log`.
Не объявляется единый успешный combined run по сумме разных запусков.
Для drawing/chrome checks тест явно получает native focus; автоматическая
активация до первого клика этим не доказывается. Sampling test рисует три объекта
в разных местах и проверяет прирост layers: наложение жестов на прежнюю стрелку
раньше могло проверять перемещение вместо создания фигуры.

Диагностика native tests: geometry ID круга — `circle`; WebDriver element-click
offset считается от центра. Text baseline снимается после выхода из inline edit,
снятия выделения, fonts.ready и стабильных пикселей. Quick Escape без transient
panel по REQ-CAP-012 закрывает draft; старое ожидание Select исправлено.
Split pointer commands в Windows WebView2 дали lostpointercapture до pointerup;
release-путь проверяется непрерывным native action с read-only наблюдением chrome.

Private D-Bus доказывает protocol lifecycle, WSL compilation — Linux API integration.
Настоящие GNOME/KDE Wayland focus/Escape и закрытие реального portal dialog по MCP
cancel, physical mixed-DPI monitors/stylus, macOS TCC/signing и WKWebView остаются
pending в ACCEPTANCE/PLATFORM_MATRIX. Evidence: `artifacts/portal-lifecycle/`,
native screenshots/JUnit — `artifacts/tauri-e2e/`.

## Повторное копирование и несколько MCP-ключей (2026-10-25, ADR-155)

Linux x86_64 / WebKitGTK 2.52.6, baseline `91d5997` + working tree.
`cargo test --offline -p cute-screen-desktop --lib mcp::tests`: 10 passed;
перед реализацией новый credentials/legacy contract дал compile failure.
Проверены запись/чтение/удаление, Unix 0700/0600, запрет traversal, сохранение
legacy key вместе с recovery key, сериализация без raw secrets и независимый revoke.
`cargo test --offline --workspace`: 187 desktop + 1 main + 2 MCP framing +
1 stdio integration + 33 storage passed.

`pnpm exec vitest run --project vue tests/unit/vue/agent-settings.test.ts`:
7 passed: remount/open/copy без create, несколько ключей одного клиента,
revoke чужой строки сохраняет открытый config, MCP off сохраняет доступ к config,
retry повторяет чтение/copy. `pnpm typecheck`, targeted ESLint и
`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed.

`CUTE_SCREEN_E2E_SCENARIOS=mcp,mcp-reopen CUTE_SCREEN_E2E_DRIVER_PROVIDER=embedded pnpm test:e2e:tauri`:
5 + 2 passed. Fresh WebView/companion: Settings close/reopen возвращает прежний
config; два OpenCode grants одновременно проходят stdio get_status; отзыв первого
не ломает второй. После process restart открыт/скопирован тот же ID/config без
нового create; совпадает SHA-256 полного config, агент успешно аутентифицируется.
Предыдущие 4K import/edit/preview/Undo/export, capture/cancel и 15 profiles сохранены.
Диагностический native failure: selector `p[role=status]` находил Version вместо
copy status; исправлен scope на `.cs-agent-settings`. Скриншоты 820×720 dark
просмотрены после скрытия config; raw keys/appData в evidence не копируются.
Windows/macOS credential permissions и runtime не запускались.
Evidence: `artifacts/mcp-config-reopen-2026-10-25/`.

## Каталог MCP-клиентов (2026-10-25)

Linux x86_64 / WebKitGTK 2.52.6, baseline `c2a26cb` + working tree.
Профилей 15: прежние 6, Claude Desktop, VS Code/Copilot, Gemini CLI, Windsurf/Cascade,
Cline, Roo Code, Zed, Continue и ручной stdio. Официальные источники и форматы — MCP.md.

- `cargo test --offline -p cute-screen-desktop --lib mcp::tests`: 7 passed.
  Новые contracts сначала дали 3 failures, после реализации прошли: JSON roots,
  YAML metadata/scalars, Unicode/Windows paths, args boundaries, unknown-client rejection.
- `pnpm exec vitest run --project vue tests/unit/vue/agent-settings.test.ts`:
  4 passed; все 15 профилей меняют формат/инструкцию, скрывают предыдущий config и
  передают выбранный client в bridge; RU OpenCode и error/retry сохранены.
- `pnpm typecheck`, targeted ESLint и
  `cargo clippy --offline -p cute-screen-desktop --lib -- -D warnings`: passed.
- `CUTE_SCREEN_E2E_SCENARIOS=mcp CUTE_SCREEN_E2E_DRIVER_PROVIDER=embedded pnpm test:e2e:tauri`:
  4 passed, fresh GUI/companion. Каждый из 15 профилей сгенерирован через production
  Settings, затем разобран тестовым клиентом и использован для stdio initialize →
  get_status; ключ отозван. Также прошли 4K import/edit/preview/Undo/export, capture,
  cancel и singleton narrow navigation. Profile screenshots просмотрены при 820×720
  в dark theme; они сняты после отзыва ключа и скрытия config.

Embedded WebDriver 1.3.0 реализует option click как `el.click()` и не меняет native
select. После двух диагностических failures тест использует DOM input/change на
реальном select, вызывая production Vue handler; external provider сохраняет штатный
WebDriver selection. Это проверка конфигурационного flow в WebView, а не доказательство
trusted OS keyboard interaction. Сессии в самих 14 клиентских приложениях и их моделях,
Windows/macOS runtime не запускались. Новых зависимостей нет.
Evidence: `artifacts/mcp-client-profiles-2026-10-25/`.

## MCP для локальных агентов (2026-10-25, ADR-154)

Baseline `c2a26cb6925602138b6bbf3442c50510cefb6837`, рабочая копия.
Ubuntu 24.04.5 x86_64 / Linux 6.8.0-147 / WebKitGTK 2.52.6 /
Node 22.23.1 / pnpm 10.33.2 / Rust 1.97.0. Evidence:
`artifacts/mcp-2026-10-25/`; raw credentials и appData туда не копируются.

- `pnpm check`: passed; lint, typecheck, formatting, docs, boundaries, generated schemas/IPC
  и workspace Clippy. Существующие Vue lint warnings не объявляются новыми ошибками.
- `pnpm test`: 183 файла, 1642 tests passed. Новые core/session tests проверяют
  все семейства фабрик, atomic batch, crop→ruler update, Undo/Redo state epoch,
  повтор requestId, busy, save failure и независимость от UI card space.
- `pnpm test:render`: 30 файлов, 87 tests passed; Canvas2D/CanvasKit и decoded PNG.
- `cargo test --workspace`: desktop 181 + main 1, storage 33, MCP framing 2 и
  real stdio initialize/discovery 1 passed. Scoped cancellation сначала failed,
  после исправления не отменяет capture с другим correlation ID.
- `CUTE_SCREEN_E2E_SCENARIOS=mcp,mcp-reopen CUTE_SCREEN_E2E_DRIVER_PROVIDER=embedded pnpm test:e2e:tauri`:
  реальный WebKitGTK, freshly built/pinned GUI и companion. MCP scenario 3 tests,
  reopen 1 test passed. Конфиг получен из Settings; 4K import → текст/стрелка/crop →
  dedup/conflict → preview → Undo/Redo → decoded export; overwrite rejected,
  SHA-256 оригинала не изменился. Native jobs: delay cancellation и screen capture,
  переключение истории, region preview; затем полный restart и production restore.
  На 1024 px вход в overflow переключает уже открытые General Settings на Agents.
  Снимки экрана проверены визуально. Capture backend здесь fake-platform;
  физические XDG/GNOME/macOS/Windows capture не заявляются этим прогоном.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-activation-settings.e2e.ts`:
  Chrome 154, 2 tests passed; обе локали, темы и размеры Settings.
- `cargo check -p cute-screen-mcp --target x86_64-pc-windows-msvc`: passed;
  это cross-check console companion, не Windows GUI/runtime/package pass.
- `cargo deny check licenses`: licenses ok. rmcp 3.7.0 Apache-2.0 разрешён политикой.
- `pnpm tauri build --debug --no-bundle`: production debug GUI и companion собраны.
  `target/debug/cute-screen --startup-check`, `target/debug/cute-screen-mcp --self-check`
  и `target/debug/cute-screen --mcp-stdio --self-check`: exit 0, без открытия GUI.
- `pnpm mcp:schema:check`, `pnpm format`, `cargo fmt --all`, `git diff --check`:
  выполнены. Schema generator использует repository Prettier config, а не defaults.

Устранены найденные в native/tests сбои: преждевременный cancel_job, зависимость
агентских координат от активной UI-зоны, несовпадение crop/ruler preflight с
CommandManager. Test-driver masking скрывает ephemeral MCP keys; выбранные
screenshots не показывают конфигурацию с ключом.

**Не проверено:** установленные DEB/AppImage и Windows/macOS packages,
macOS universal runtime, cold autostart через установленный пакет и реальные
LLM-driven подключения всех пяти клиентов. Форматы пяти конфигураций проверены
Rust-тестом, стандартный MCP — реальным stdio клиентом; это не заменяет client smoke.
Release gates запускают packaged companion/self-check, включая AppImage dispatch
и обе архитектуры macOS. Полный release build ради UI не выполнялся.

Диск до задачи: target 131.738 GiB, artifacts 61.321 GiB. Промежуточно:
target 142.208 GiB, artifacts 62.031 GiB. Общий Cargo cache сохранён; отдельный
CARGO_HOME/target не создавался. Финально: target 147.420 GiB, artifacts 61.326 GiB. Удалены четыре собственных
диагностированных inactive failed profiles (156802758 bytes) и заменённые failure
screenshots; общий полезный cache и чужие artifacts сохранены.

## Бамп версии 0.1.15 (2026-10-25)

Ubuntu 24.04.5 x86_64, baseline `1438e76`, рабочая копия.
Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.15`: `0.1.14 → 0.1.15` в пяти файлах метаданных.
- `node scripts/release-assets.mjs version . v0.1.15`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.
- `pnpm format` и `pnpm format:check`: passed.

## Бамп версии 0.1.16 (2026-10-28)

Исправление Linux ARM64 packaging (та же рабочая копия): helper-модули
`macos_area_smoke` и `macos_smoke_checks` перенесены из `src/bin` в
`src/platform_smoke`, чтобы Tauri не пытался копировать несуществующие executable.
Новый boundary test до переноса: 1 failed / 13 passed, перечислены оба лишних файла.
После переноса `pnpm exec vitest run --project boundaries tests/boundaries/build-contract.test.ts`:
14 passed. Linux ARM64 `.deb` на этом macOS host не собирался; требуется CI package job.

`cargo test -p cute-screen-desktop --features platform-smoke --bin m04-platform-smoke macos_smoke_checks`:
2 passed после переноса модулей. `cargo metadata --no-deps --format-version 1 --locked --offline`:
только четыре явных bin targets. `cargo fmt --all`, `pnpm format` и
`pnpm format:check`: passed.

macOS 12.7.6 x86_64, Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.16`: `0.1.15 → 0.1.16` в пяти файлах метаданных.
- `node scripts/release-assets.mjs version . v0.1.16`: passed.
- `pnpm exec vitest run --project boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 34 tests passed.
- `pnpm format` и `pnpm format:check`: passed.

Изменены только версия приложения и release evidence; поведение приложения не менялось.

## Разделители непустых групп ToolRail (2026-10-25)

`REQ-EDT-008`, `REQ-UI-017`; та же Ubuntu 24.04.5 и baseline
`aa5bebc357a889b482087a4b8bbba6b8158747fe`, рабочая копия.
ToolRail сначала исключает пустые группы, затем рисует разделитель между
оставшимися. Quick с одним Select не имеет разделителя; полный Editor
сохраняет два разделителя. Порядок инструментов не меняется.

- `pnpm exec vitest run --project vue tests/unit/vue/quick-tools-settings.test.ts tests/unit/vue/quick-context-toolbar.test.ts`:
  2 files / 8 passed, 5.59 s. Проверка mounted Quick/Editor и скрытия всех
  перемещаемых инструментов через preferences action.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`: exit 0.

Native/core/renderer не менялись; повторные native/build/render/perf suites
не запускались. Дополнительные browser screenshots для этой условной
отрисовки не снимались.

## Панель быстрого режима: видимость и порядок (2026-10-25)

Ubuntu 24.04.5 LTS x86_64 / Linux 6.8.0-147-generic / Node 22.23.1 /
pnpm 10.33.2; baseline `aa5bebc357a889b482087a4b8bbba6b8158747fe`, рабочая копия.
`REQ-UI-017`, ADR-153. До реализации добавлена трассируемость; core/Rust
контракты не менялись.

- `pnpm install --frozen-lockfile`: восстановлены 7 недостающих локальных
  dependencies; lockfile не менялся. Первый focused запуск не стартовал из-за
  отсутствовавшего `@fontsource/press-start-2p`.
- `pnpm test`: 180 files / 1615 passed, 150.70 s. В jsdom остаются предупреждения
  canvas getContext; renderer suite использует собственный native canvas.
- `pnpm lint`: exit 0, 37 существующих warnings. `pnpm typecheck`: exit 0.
- `pnpm test:boundaries`: 16 files / 113 passed. При первой проверке выявлен
  лимит 500 строк workspace-bindings; catalog binding вынесен в отдельный модуль.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5184 pnpm test:e2e:browser --spec tests/e2e/specs/browser-quick-tools-settings.e2e.ts`:
  Chrome 154.0.8037.57 / WebDriver, 1 passed, 9.9 s. Trusted drag вверх/вниз,
  reorder активных и скрытых, Escape/outside cancel, reload, V, Enter/Space,
  Alt + стрелки, все инструменты скрыты кроме V. RU/EN × light/dark, viewport
  820×720; minimum 620×520 без горизонтального overflow. Четыре screenshots
  осмотрены; сохранены в `artifacts/quick-tools-settings/`.
- Existing regression: тот же browser command с двумя `--spec` для
  `browser-quick-tools-settings.e2e.ts` и `browser-activation-settings.e2e.ts`:
  2 files / 3 passed до добавления reorder; после reorder новый spec повторён.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`: exit 0.

Mounted Quick/Editor проверяет production preference mount, полный Editor
catalog и пользовательский порядок Quick между группами annotate/more.
Native preference adapter покрыт mock transport test, не runtime WebView.
`pnpm test:e2e:tauri`, Rust tests, render/perf и release build не запускались:
native/core/renderer контракты не менялись. Полный `pnpm check` не запускался,
его relevant frontend/format/docs/boundaries gates выполнены отдельно.
WebKitGTK/WebView2/WKWebView drag/relaunch остаются pending.

`pnpm disk:usage`: target 129.441 GiB до/после, artifacts 61.320 → 61.321 GiB;
новых targets нет. Общий cache сохранён, собственный диагностированный failure
PNG удалён; итоговые screenshots и краткие logs занимают менее 0.5 MiB.

## Rust audit: tokio и clipboard-win (2026-10-23)

Ubuntu 22.04.5 LTS x86_64, Rust/Cargo 1.97.0, cargo-deny 0.20.2 — официальный
musl-бинарник той же версии, что `CARGO_DENY_VERSION` в CI. Advisory DB
`84d943a6deeb`, 2026-10-23, «Assigned RUSTSEC-2026-0386 to tokio».
`git pull --ff-only` перемотал `main` с `4fe60ed` на `2a9efe4`.

- `tokio` `=1.53.1` → `=1.53.3` в `src-tauri/Cargo.toml` и
  `crates/cute-screen-storage/Cargo.toml`. SHA-256 crate
  `ce3335fa71841cda333a58d7615b03901380ecf09d59b3296d21f8bbac0dde4e`
  совпадает с `Cargo.lock`.
- `clipboard-win` `5.4.1` → `5.4.3` в `Cargo.lock`. SHA-256
  `052af7878466feccda12ba7a6a67d019d712f296809559b47c12c8cc196d3a9a`
  совпадает с `Cargo.lock`.
- `cargo check --workspace --locked` — exit 0, dev profile, 2 мин 38 с.
- `cargo deny check` — exit 0: advisories, bans, licenses и sources ok.
  Предупреждения о duplicate versions остаются разрешёнными настройкой
  `multiple-versions = "warn"`.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check` и
  `cargo fmt --all --check` — exit 0.

`clipboard-win` на этой машине не компилировался: зависимость Windows-only.
Hosted CI этим прогоном не подтверждается.

## Patch version 0.1.14 (2026-10-23)

macOS 12.7.6 x86_64, рабочая копия. `main` совпадает с `origin/main`
`1c2aad3` (0.1.13). Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.14`: `0.1.13 → 0.1.14` в package.json, Tauri config,
  Cargo workspace, точной storage dependency и двух записях Cargo.lock.
- `node scripts/release-assets.mjs version . v0.1.14`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.

## Patch version 0.1.13 (2026-10-22)

Ubuntu 22.04.5 x86_64, рабочая копия. `main` совпадает с `origin/main`
`fdb144fd6e627f977ce5de9baabc7a2c876736e6` (0.1.12).

- `pnpm version:bump 0.1.13`: `0.1.12 → 0.1.13` в package.json, Tauri config,
  Cargo workspace, точной storage dependency и двух записях Cargo.lock.
- `node scripts/release-assets.mjs version . v0.1.13`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.

## Patch version 0.1.12 (2026-10-21)

Baseline `4f01f011eb126073775fb2234d42ecccb7d6059b`, рабочая копия.
Windows 10 build 19045 / Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.12`: package, Tauri, Cargo workspace, точная storage
  dependency и две workspace entries в Cargo.lock синхронизированы.
- `node scripts/release-assets.mjs version . v0.1.12`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`: passed.

Изменена только версия и документация проверки. Native build и UI suites
не повторялись; установленное приложение этим изменением не обновляется.

## Patch version 0.1.11 (2026-10-21)

Baseline `89d86ce5e878087d870ad9d901114f6d3961f73c`, рабочая копия.
Windows 10 build 19045 / Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.11`: package, Tauri, Cargo workspace, точная storage
  dependency и две workspace entries в Cargo.lock синхронизированы.
- `node scripts/release-assets.mjs version . v0.1.11`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.
- `pnpm exec prettier --write` и `--check` для `docs/TESTING.md`,
  `docs/TRACEABILITY.md`, `package.json` и `src-tauri/tauri.conf.json`,
  затем `pnpm docs:check` и `git diff --check` по файлам бампа: passed.
  Полный `pnpm format` не запускался: в рабочей копии уже есть незафиксированные
  правки захвата.

Изменена только версия и документация проверки. Native build и UI suites
не повторялись; установленное приложение этим изменением не обновляется.

## Скорость PNG после захвата экрана (2026-10-21)

Windows 10 build 19045, debug-сборка, один кадр 1920×1080.
`cargo test -p cute-screen-desktop --lib desktop_capture_stage_timing -- --ignored --nocapture`
до смены сжатия: DXGI composed acquire 142 мс; PNG `Balanced` 1553 мс и
1 397 730 байт; `Fast` 951 мс; `Fastest` 329 мс и 1 996 170 байт; BMP 37 мс.
Захват области уже отдаёт BMP, поэтому экран ждал сжатие, а не кадр.
Capture PNG на Windows, X11 и macOS теперь использует `Compression::Fastest`.
Временный probe удалён. Пиксели по-прежнему проверяет
`encodes_top_down_bgra_as_opaque_rgba_png`.

## Windows screen capture и borderless-игра (2026-10-21, ADR-150)

Windows 10 build 19045, один монитор 1920×1080. Процесс `HOMM3 2.0.exe`,
окно `Heroes of Might & Magic III - HD Edition`, HWND `0x4034e`,
`WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN`, `WS_EX_TOPMOST`,
ровно bounds монитора. Cute Screen в этот момент был старым `target/debug`
процессом и в захвате не участвовал: probe вызывал DXGI-функции библиотеки.

До правки `cargo test -p cute-screen-desktop --lib homm3_compares_immediate_dxgi_with_composited_pulse -- --ignored --nocapture`:

- немедленный путь Screen: 2 073 600 / 2 073 600 пикселей с каналами ниже 8,
  центр `(0,0,0,0)`, файл `artifacts/homm3-capture-probe/immediate.png`;
- путь Area с compositor pulse и `DwmFlush`: 1 820 / 2 073 600 таких пикселей
  (0,1%), центр `(24,19,15,255)`, меню игры в `fresh.png`.

После перевода Screen/Active Window на тот же acquire повторный probe:
1 920 / 2 073 600 (0,1%), центр `(24,19,15,255)`, меню игры в
`artifacts/homm3-capture-probe/screen-after-fix.png`. Игровой probe из
исходников удалён. Постоянный контракт —
`area_uses_the_mounted_quick_surface_while_window_keeps_native_selection`.

Запущенный до правки `cute-screen.exe` эту библиотеку не подхватил.
Linux X11, Wayland и macOS не прогонялись: у них Area и Screen уже берут
один кадр, так что этот разрыв путей там не воспроизводится.

## Сохранение горячих клавиш GNOME (2026-10-22, ADR-151)

Ubuntu 22.04.5 x86_64 / GNOME Shell 42.9 Wayland. Рабочая копия.

- `cargo test -p cute-screen-desktop --lib shortcuts::gnome -- --test-threads=8`:
  7 passed. Постоянная запись читается обратно, pending-путь не создаётся,
  испорченный binding отвергается.
- `cargo test -p cute-screen-desktop --lib shortcuts::tests -- --test-threads=8`:
  6 passed.
- `pnpm exec vitest run --project vue tests/unit/vue/settings-recorder.test.ts --maxWorkers=1`:
  12 passed. «Сохранить» показывает новое сочетание без требования нажать его ещё раз.
- `cargo build -p cute-screen-desktop --lib --offline`: finished, warnings нет.

Проверка не запускала установленное приложение и не меняла пользовательские
custom-keybindings. Физический grab GNOME после «Сохранить» не подтверждён.

## Patch version 0.1.10 (2026-10-21)

Baseline `2a3d9f9ecdff19e3d9575f796082ab34f64b90b7`, рабочая копия.
Ubuntu 22.04.5 x86_64 / Node 22.23.1 / pnpm 10.33.2.

- `pnpm version:bump 0.1.10`: package, Tauri, Cargo workspace, точная storage
  dependency и две workspace entries в Cargo.lock синхронизированы.
- `node scripts/release-assets.mjs version . v0.1.10`: passed.
- `pnpm test:boundaries tests/boundaries/bump-version.test.ts tests/boundaries/release-assets.test.ts`:
  2 файла, 33 tests passed.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`: passed.

Изменена только версия и документация проверки. Native build и UI suites
не повторялись; установленное приложение этим изменением не обновляется.

## Linux native paint recovery (2026-10-21, ADR-149)

Baseline `88179370cb1ac361e2aa4053ca6c496e71a8cceb`, рабочая копия.
Paint recovery зафиксирован в `3767992895f26504ccdce6e9e4e0d4a5bffd6e0e`;
native gate дополнительно включает рабочие изменения runner scope и readiness.
Ubuntu 22.04.5 x86_64 / GNOME Shell 42.9 Wayland / AMD Lucienne, Mesa 23.2.1,
GTK3 3.24.33 / WebKitGTK 2.50.4 / wry 0.55.1 / Rust 1.97.0 /
NVM Node 22.23.1 / pnpm 10.33.2. Physical desktop 1920×1080 с fractional scale
125%, WebView DPR 2. Evidence — `artifacts/linux-hover-black-2026-10-21/`.

- Resident `/usr/bin/cute-screen` и установленный файл совпали по SHA256
  `f9d73076d1ef471857920f672797ac62b1411b45360e2ac8e006e203f4e99c6c`.
  WebKit/GPU overrides отсутствовали; GDK_BACKEND=wayland. GPU reset/crash
  в проверенном журнале не найден. Это не исключает rendering failure.
- ScreenshotWindow: 4 чёрных / 89 кадров, accessibility tree оставался живым.
  Screenshot desktop: 0 / 58 у установленного процесса; дополнительная серия
  дала 0 / 15. Пользователь подтвердил, что затем перестали мигать оба окна,
  включая новый процесс с копией документа. Нельзя приравнивать window snapshot
  к экранному compositor output или считать disappearance root-cause proof.
- `cargo test --workspace --lib linux_window_paint -- --nocapture`:
  до реализации 2 failed; после 2 passed. Event storm 2×1000 запросов не
  отодвигает follow-up, hidden/cancel/remap не оставляет redraw loop.
- Rust unit portions `cargo test --workspace`: 174 desktop + 1 main + 33 storage
  passed. Первый общий запуск завершился ошибкой doctest E0463 при пересборке
  зависимостей другим Cargo invocation; отдельный `cargo test --workspace --doc`
  затем passed. Финальный повтор `cargo test --workspace` завершился exit 0:
  208 unit tests и оба doctest targets; `rust-workspace.log`.
- `cargo clippy --workspace --lib --features fake-platform,test-harness -- -D warnings`
  passed. `pnpm lint`: exit 0, 37 прежних Vue warnings; `pnpm typecheck` passed.
  `pnpm test:boundaries tests/boundaries/tauri-runner.test.ts`: 2 passed.
- `GDK_BACKEND=wayland CARGO_BUILD_JOBS=4 CUTE_SCREEN_E2E_SCENARIOS=window-paint
pnpm test:e2e:tauri`: fresh debug/no-bundle, external tauri-driver 2.1.0 /
  WebKitWebDriver 2.50.4, реальная Wayland-сессия с GPU — 1/1 passed, 20.4 s.
  Три цикла resize/maximize/native-title и HTML tooltip hover/hide → второй GUI
  launch. 4K image ingress проходит production UI; 12 PNG повторно декодированы,
  не являются чёрными, документ после каждого цикла равен исходному.
  WebView snapshots не доказывают отсутствие редкого compositor flicker.
- Первый native запуск упал до scenario: test GUI делил activation endpoint
  с открытой установленной версией. Runner теперь задаёт XDG_SESSION_ID по
  временному profile; повтор прошёл при продолжающем работать installed process.
  Это отдельная воспроизводимая startup-ошибка, не доказанная причина hover bug.
- Для native gate PATH дополнен task-local WebKitWebDriver из уже имеющегося
  Ubuntu22 build image и `artifacts/tauri-e2e/driver-cache/bin`; TMPDIR —
  `artifacts/linux-hover-black-2026-10-21/native-tmp`. Пакеты host не менялись.
  Первый Docker build остановлен; окончательный native gate выполнен на host.
- `pnpm tauri build --debug --no-bundle --config src-tauri/tauri.dev.conf.json`
  passed; свежий standalone скопирован атомарно в обычный
  `artifacts/linux-dev/cute-screen-dev`. Identifier/library/activation scope
  отдельные; запуск — `pnpm start:linux:dev`. Release/package build не запускался.

Стабильные UI/renderer/export алгоритмы не менялись, их полные browser/render/
perf suites не повторялись. Windows/macOS и длительная ручная Wayland-проверка
после холодного запуска остаются pending. Защитный native redraw не объявляется
доказанным устранением исходного intermittent defect.

## Release tag и bump 0.1.9 (2026-10-21)

GitHub API и job logs подтвердили: Release run `39591853162` использует тег
`v0.1.8` → `0df49ac`, до ADR-148. Новый workflow с timeout 5 минут исполняет
старый source. CI run `39590240612` на `d2fdec4` прошёл: performance step
11:18:25–11:18:47 UTC, 5 files / 19 passed. Evidence:
[успешный CI job](https://github.com/VladimirIvanin/cute-screen/actions/runs/39590240612/job/119189545950),
[проверка тега](https://github.com/VladimirIvanin/cute-screen/actions/runs/39591853162/job/119233955055).

Ubuntu 22.04.5 x86_64 / Node 22.23.1 / pnpm 10.33.2: `pnpm version:bump 0.1.9`
синхронизировал пять файлов metadata. `node scripts/release-assets.mjs version . v0.1.9`
прошёл; `pnpm test:boundaries tests/boundaries/bump-version.test.ts
tests/boundaries/release-assets.test.ts` — 2 files / 33 passed. `CI=true pnpm test:perf
tests/harness/perf/sampling.test.ts --reporter=verbose` — 9/9 passed. Выполнены
`pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`.
Evidence — `artifacts/perf-ci-followup/`. Build/native suites для изменения
только version metadata не запускались; commit/tag/Release не создавались.

## Software perf без длинного CI sampling (2026-10-21, ADR-148)

Baseline `0df49acaa184d4700bcd721323fd70b32bf565dc`, рабочая копия.
Ubuntu 22.04.5 x86_64 / Linux 6.8.0-138, Ryzen 7 5700U, Node 22.23.1,
pnpm 10.33.2; shared host, Canvas2D/CanvasKit software. Системный Node 22.21.1
не проходит pinned engines; использован уже установленный NVM Node 22.23.1.
Evidence — `artifacts/perf-harness-safety/`.

- До реализации: `pnpm test:perf tests/harness/perf/composition.test.ts` оставался
  в native redraw loop после 180 s; собственный worker остановлен SIGTERM
  через 4m15s, 4K успел пройти, 8K не завершился. Это прерванный baseline,
  не successful run и не новый Vitest timeout failure. `/usr/bin/time -v`:
  max RSS 1 139 920 KiB, system CPU 176 s, около 57 млн minor page faults.
  Это согласуется с allocation churn; монотонная утечка этим не доказана.
- Red-first sampler: 8 failures (`sampling-red.log`): отсутствуют профиль,
  deadline, native memory diagnostics и yield; неверные durations принимаются.
  После добавлен также общий deadline warmup + measurements.
- `pnpm test:perf --reporter=verbose`: 5 files / 19 passed, Vitest 61.65 s
  (вся команда с fixtures 68.09 s). Composition 4K — 1.386 s, 8K — 17.560 s;
  sampler 8K — 17.062 s, 2 warmups / 8 measurements. RSS после warmups
  757 411 840 B, после measurements 758 108 160 B; sampled peak 804 978 688 B.
  Это короткая диагностика, не подтверждение leak acceptance после 20 reopen.
  Max RSS всей suite с legacy blur oracle — 1 942 524 KiB; сравнивать его
  с composition-only baseline как одинаковую нагрузку нельзя.
- `pnpm test:perf:trend tests/harness/perf/sampling.test.ts`: 9/9 passed;
  проверено включение 30/120 через настоящий CLI mode. Полный тяжёлый trend
  и designated reference GPU gate не запускались.
- `pnpm test:render tests/harness/render/composition.test.ts
tests/harness/render/composition-crop.test.ts tests/harness/render/tool-settings-large.test.ts
--maxWorkers=1 --reporter=verbose`: 3 files / 5 passed. Повторно декодированы
  PNG обоих backend при 1×/2×, production-like 4K/8K и enlarged tiny crop;
  originals, goldens и production renderer не менялись.
- `pnpm test packages/editor-renderer/src/effect-cache.test.ts
packages/editor-renderer/src/effect-worker.test.ts packages/editor-renderer/src/canvas2d-lifecycle.test.ts`:
  3 files / 20 passed. `pnpm test:boundaries`: 16 files / 113 passed.
- `pnpm lint`: exit 0, 37 существующих Vue warnings; `pnpm typecheck`,
  `pnpm docs:check`, `pnpm format`, `pnpm format:check` и `git diff --check`
  пройдены. Полный `pnpm check` с Rust gates, browser/native UI и release build
  не запускались: меняется только test harness/CI policy.

Disk baseline: `pnpm disk:usage` — target 50.484 GiB, artifacts 4.104 GiB.
Итоговый report — `disk-after.log`; общий Cargo cache и чужие artifacts сохранены.
Новые targets/profiles/tools не создавались, заменённый успешный sampler log удалён.

## Выбранные обводки (2026-10-21, ADR-147)

Baseline `6fae59d`, рабочая копия. Ubuntu 22.04.5 x86_64, установленный NVM Node 22.23.1 /
pnpm 10.33.2, Rust 1.97.0; Chrome 147.0.7727.101, WebKitGTK 2.50.4 / wry 0.55.1.
Evidence — `artifacts/circling-seeds/` и штатные browser/tauri-e2e reports.

- До реализации `pnpm test packages/editor-core/src/circling.test.ts`: 4 failed /
  1 passed. Три контракта обнаружили старые seeds/version и 41 вместо 65 команд
  прототипа; четвёртый failure был невалидным UUID новой fixture и исправлен.
  Дополнительный red assertion референсного овала обнаружил слишком малый
  вертикальный разнос концов; геометрия исправлена, порог не ослаблялся.
- Fixture `tests/fixtures/circling-v2.json` извлечена из исходного прототипа,
  production-код в её генерации не участвовал. Проверяются все координаты шести
  выбранных контуров с точностью 1e-10; дополнительный овал — полный winding и
  длинный верхний нахлёст. Core покрывает независимые циклы 4/3, codec/reopen,
  duplicate/reorder/history, style identity, bounds при 1:1/2:1/10:1/1:10 и
  stroke/interior hit testing. Vue pointer проверяет cancel/no-op/focus/read-only.
- Финальный focused core/Vue: 4 files / 46 passed. Полный
  `pnpm test --maxWorkers=1 --testTimeout=15000`: 179 files / 1609 passed.
- `pnpm test:render:update tests/harness/render/circling-seeds.test.ts
tests/harness/render/hand-drawn.test.ts tests/harness/render/golden-shapes.test.ts`:
  3 files / 7 passed. Затем обычный
  `pnpm test:render --maxWorkers=1 --testTimeout=15000`: 30 files / 87 passed.
  Все семь контуров декодированы и визуально осмотрены в Canvas2D/CanvasKit;
  PNG 1x/2x, совпадение preview/export 1x, screenshot composite поверх ui-4k.
  Обновлены ожидаемые hand-drawn/catalogue goldens, добавлены четыре новых.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser
--spec tests/e2e/specs/browser-hand-drawn.e2e.ts`: 2 passed. UI создаёт все
  варианты плюс первый повтор каждого цикла, подтверждает Select после создания
  и exact Undo/Redo. Harness m05 даёт interaction evidence, не clean capture.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser
--spec tests/e2e/specs/browser-shape-toolbar.e2e.ts`: 4 passed, включая смену
  всех видов выбранной фигуры, paint/history, trusted defaults и RU/EN × темы
  при 1024px. Metadata circling очищается или пересчитывается при смене вида.
- `DISPLAY=:98 CUTE_SCREEN_E2E_SCENARIOS=hand-drawn,hand-drawn-reopen
dbus-run-session -- pnpm test:e2e:tauri`: 2 сценария passed. Runner каждый раз
  собирает свежий debug/no-bundle harness в общем target. Trusted pointer создаёт
  выбранные обводки в Quick, передаёт все annotation payload в Editor, после
  relaunch сравнивает сохранённые seed/version/sequence и продолжает оба цикла.
  Capture fake-platform 400x300; это реальный WebView, не доказательство system capture.
  Использован cached tauri-driver 2.1.0; Xvfb :98 и временный WebKitWebDriver взяты
  из штатного `cute-screen-ubuntu22-build:local`, app и Cargo выполнялись на host.
- Первый native прогон ошибочно включал hash базового изображения в сравнение
  Quick/Editor (handoff штатно материализует source); assertion исправлен на
  все созданные аннотации. Финальный повтор прошёл и не использовал старый binary.
- `pnpm test:boundaries --maxWorkers=1 --testTimeout=30000`: 16 files / 113 passed.
  Под нагрузкой полного unit/native прогона стандартные AST scans с лимитом 5 s
  давали timeout; assertions/архитектурные бюджеты не менялись. Найденное
  complexity=21/20 устранено удалением ненужной передачи параметра в scene.

Windows WebView2 и macOS WKWebView не запускались. Новых dependencies/IPC нет,
прежняя геометрия обводок заменена по явному запросу владельца.

Финальный `pnpm check` passed, включая lint (37 существующих warnings), полный
TypeScript, format/docs, 113 boundaries, IPC codegen и четыре Rust Clippy gates.
Повтор на свободном host прошёл штатный 5 s лимит AST scans без изменения tests
или бюджетов. После записи evidence выполнены `pnpm format` и `pnpm format:check`.

Дисковая гигиена: workspace target 45.583 → 50.484 GiB после свежего native build,
IPC и четырёх Clippy feature gates; общий полезный Cargo cache сохранён.
`pnpm clean:artifacts` dry-run: 0 directories. Известные task-owned временные
артефакты удалены отдельно: failed fake appData после диагностики, временный
WebKitWebDriver и его symlink, заменённые диагностические logs/screenshot —
54 905 397 bytes. Xvfb container остановлен, runtime каталог пуст; cached
tauri-driver сохранён. Команды и размеры — disk-after.log / cleanup.json,
сводный результат — summary.json в `artifacts/circling-seeds/`.

## Округление Canvas2D golden карточек (2026-10-20)

Baseline `a472777`, Windows x64 / PowerShell и Ubuntu 22.04 x86_64 / WSL2,
Node 22.23.1, pnpm 10.33.2, `@napi-rs/canvas` 1.0.2. Evidence —
`artifacts/composition-golden/`. Linux использует те же исходники, fixtures,
шрифты и lockfile; временные Linux Node/native bindings подключены через
preload resolver без переустановки Windows node_modules.

До исправления focused Linux `composition.test.ts` воспроизводит обе ошибки
владельца: browser Canvas2D 16 каналов на 1× и 173 на 2×, maximumDelta=1
(`linux-before.log`). Диагностический проход всех пяти карточек на обеих
плотностях (`linux-diagnostic.log`, `differences.json`) показывает максимум
28/187 изменённых RGB-каналов, delta=1, ноль изменений alpha; все десять
CanvasKit PNG точные. Нативный Canvas2D даёт платформенные различия последнего
разряда в масштабированном снимке и footer; геометрия не меняется. Linux browser
PNG и committed golden визуально просмотрены.

Только этот вызов Canvas2D `assertGolden` явно разрешает delta≤1 при доле
изменённых каналов ≤0,00002 (0,002%); alpha сравнивается точно. Остальные
вызовы используют нулевые допуски. Пять проверок harness отклоняют delta=2,
превышение бюджета, изменение alpha и RGB-разницу без явного допуска.
Production renderer и committed PNG не менялись. Проверки размера decoded PNG,
исходного SHA-256, документа, точного Canvas2D preview/export и межbackend
parity сохранены.

- Focused `pnpm exec vitest run --project render-harness tests/harness/render/golden-assertion.test.ts tests/harness/render/composition.test.ts`
  — Windows и Linux, по 2 files / 7 passed (`windows-focused.log`, `linux-focused.log`).
- Полный `pnpm test:render` — Windows и Linux, по 29 files / 85 passed
  (`windows-render.log`, `linux-render.log`).
- `pnpm lint` — passed, 37 прежних Vue warnings; `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json`
  — passed (`lint.log`, `typecheck.log`).
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` — passed (соответствующие logs).
  Browser/Tauri/Rust не запускались:
  изменение затрагивает только headless test harness, без нового UI/native контракта.

## Общий магнит рамки (2026-10-20, ADR-146)

Windows x64 / PowerShell, Node 22.23.1, pnpm 10.33.2. Baseline `3665454`;
реализация вошла в `35ace42`, `c41c3e1` и последующие рабочие изменения.
Evidence — `artifacts/frame-snap/`.

- Red-first `pnpm test packages/editor-core/src/frame-snap.test.ts` — missing
  module до реализации. Core проверяет 6/14 CSS px при 50/100/200%, crop origin,
  независимые оси, обход, aspect и Alt. Vue проверяет обычную фигуру, группу,
  отражения, actual Fit scale, no-op/cancel, pointerup и Quick resize.
- Финальный focused `pnpm test` для frame-snap, selection-interactions,
  m08-precision-guides, canvas-viewport-transform, gradient-backdrop,
  m08-crop-interactions и gradient-move-snap — 8 files / 68 passed.
- Полный `pnpm test` — 178 files / 1600 passed. Ранний прогон обнаружил шесть
  ожиданий старого pointerup/modifier контракта; модификаторы теперь присутствуют
  и на отпускании. Alt guides и их lifecycle сохранены.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5195 pnpm test:e2e:browser --spec tests/e2e/specs/browser-frame-snap.e2e.ts --spec tests/e2e/specs/browser-gradient.e2e.ts`
  — Chrome 155.0.8059.85, 2/2 passed. Обычная фигура на 2560×1440 при Fit,
  held preview, resize до края, Ctrl, Escape, exact Undo/Redo; gradient regression.
  Дополнительно browser-emoji-resize проверяет четыре угла emoji, decoded pixel
  preview/commit parity, 4K image и ruler endpoint. Split actions используют один
  именованный pointer device: новый device отправлял отпускание с позиции (0, 0).
  Финальный отдельный `pnpm test:e2e:browser --spec tests/e2e/specs/browser-emoji-resize.e2e.ts`
  с теми же headless/port параметрами — 1 file / 6 passed.
- `CUTE_SCREEN_E2E_SCENARIOS=frame-snap CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle, external tauri-driver, WebView2 155.0.4283.62,
  1/1 passed. Production Capture → Quick: crop с ненулевым origin, move с
  удержанием, resize к полному canvas и Undo. После Editor handoff проверены
  материализованный кадр 329×247 и UI-open 3840×2160, trusted move/resize,
  Ctrl, Escape и Undo/Redo. Fit scale 0.28 и 2.46; JSON и screenshots сохранены.
- `pnpm test:boundaries` — 16 files / 112 passed / 1 existing skip. Новые
  функции укладываются в ограничения сложности/размера, зависимости ацикличны.
- `pnpm check` — passed: lint/typecheck/format/docs, boundaries, IPC codegen,
  frontend build, cargo fmt и все четыре clippy configurations. Rust source
  не менялся. `pnpm format` и финальный `pnpm format:check` выполнены отдельно.

Ранние native попытки попадали в занятые chrome участки рамки; финальная
проверка использует свободную левую сторону и верхний левый resize handle,
обычный native pointer input и видимые кнопки Undo. Browser input suites
запускались последовательно; прогон, пересечённый с format/HMR, заменён.
Схема, IPC, зависимости и immutable originals не меняются. WKWebView/WebKitGTK
на этом host не запускались; Windows evidence не является WebKit-pass.

Disk: target 51.594 → 51.854 GiB, существующий e2e-isolated cache сохранён.
Автоматическая проверка отклонила удаление трёх завершённых диагностических
appData и заменённых артефактов с причиной `blocked by policy`; они оставлены
в artifacts. Успешный runner удалил собственные runtime profile и pinned binary.

## Отмена маркера и таймаут pixel-reference (2026-10-20)

Windows 10 x64 / PowerShell, Node 22.23.1, pnpm 10.33.2. Исходный baseline
`366545441b8f6ca70a7af34f8f22a29787a6b650` с параллельными рабочими изменениями;
во время проверки изменения вошли в `35ace42`. Evidence —
`artifacts/unit-regressions-20261020/`.

- До исправления `pnpm test tests/unit/vue/highlighter-gesture.test.ts packages/editor-renderer/src/effect-cache.test.ts`
  — 3 failed / 8 passed. Все три отмены ожидали старый interactive redraw,
  хотя production вызывает settled `drawDocument`. Локально pixel-reference
  завершился в пределах общего таймаута; CI сообщил превышение 5 s.
- После исправления та же команда — 2 files / 11 passed. Тест ждёт Promise
  восстановления и сохраняет проверки Shift, отсутствия `addLayer` после
  отмены и последующего pointerup, неизменности слоёв документа.
- Только legacy-reference blur/pixelate получает 30 s: полное равенство RGBA,
  исходный размер сцены, transforms/seams/overlaps и 1×/2× сохраняются.
  Общий timeout, worker isolation и performance thresholds не меняются.
- Первый полный `pnpm test` — 178 files, 1598 passed / 1 failed за 544 s
  (`unit.log`). Исходные четыре падения устранены; оставшийся failure —
  Alt-направляющие в `m08-precision-guides.test.ts`. Отдельный повтор этого
  файла до дополнительной правки — 10/10 passed. Теперь жест начинается
  после `frameReady`, проверки показа обеих направляющих и их скрытия при
  keyup/blur сохранены. Три затронутых файла вместе — 21/21 passed
  (`targeted.log`).
- Финальный `pnpm test tests/unit/vue` — 97 files / 849 passed, 441.04 s
  (`vue.log`). Общий core/renderer/fixtures/fake-platform повторно не запускался:
  после первого общего прогона менялось только ожидание mount в Vue-тесте.
- `pnpm format`, `pnpm format:check`, ESLint трёх изменённых тестов,
  `pnpm docs:check` и
  `git diff --check` — passed.
- `pnpm disk:usage` — target 51.595 GiB, artifacts 12.669 GiB,
  node_modules 0.781 GiB (`disk-usage.log`). Задача не создаёт native targets
  и profiles; общий build cache и artifacts других задач сохранены.

## Крестик закрытия оформления (2026-10-20)

Windows x64 / PowerShell, baseline `366545441b8f6ca70a7af34f8f22a29787a6b650`
и рабочие изменения. Шрифтовой × заменён общим SVG `UiIcon.close`, 16×16,
по центру кнопки 30×30; поведение закрытия не менялось.

- `pnpm test tests/unit/vue/composition.test.ts` — 7/7 passed.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5198 pnpm test:e2e:browser --spec tests/e2e/specs/browser-appearance-colors.e2e.ts`
  — 1/1 passed, Chrome 155.0.8059.85. Заголовок просмотрен на screenshots
  `artifacts/browser-e2e/appearance-color-{ru,en}-{dark,light}.png`.
- `pnpm exec eslint packages/editor-vue/src/shell/composition/CompositionPanel.vue`
  и `git diff --check` — passed.
- `pnpm format` запускался; ошибки max-len в параллельных изменениях
  `canvas/frame-gesture.ts` и `tests/e2e/frame-snap.ts` вне этой правки.
  `pnpm format:check`: Prettier passed, ESLint failed на тех же трёх max-len.
- Native WebView, WKWebView и WebKitGTK для этой CSS/SVG-правки не запускались.

## Самопересечения свободного контура (ADR-145, 2026-10-20)

Windows x64; baseline `3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/blur-optimization/freeform-*`, `browser/freeform.*`,
`native/freeform.*` и общие blur acceptance logs.

- Red-first `pnpm test packages/editor-core/src/censor-freeform.test.ts`:
  3 failed / 1 passed — нулевая signed area, запрет самопересечения и evenodd hit-test.
- `pnpm test packages/editor-core/src/censor-freeform.test.ts packages/editor-core/src/precision-contracts.test.ts packages/editor-core/src/precision-geometry.test.ts tests/unit/vue/m08-precision-drawing.test.ts`
  — 4 files / 41 passed. Construction/codec, double winding, crossed lobes,
  strict invalid coordinates/zero edges; pointer closure точно в стартовой
  позиции для solid/blur/pixelate сохраняет исходный crossed path.
- `pnpm test:render tests/harness/render/censor-freeform.test.ts` — 2 passed:
  Canvas2D и CanvasKit, decoded lobes/nonzero center/outside при 1×/2×.
  Полный `pnpm test:render` после исправления — 28 files / 80 passed.
- Общий blur browser scenario — Chrome 155.0.8059.85, 1/1 passed; дополнен
  production созданием замкнутого crossed freeform в трёх режимах и Undo/Redo.
- Общий fresh WebView2 155.0.4283.62 / tauri-driver 2.1.0 scenario — 1/1 passed:
  те же freeform gestures, реальные effect modes зафиксированы в JSON,
  затем штатный Export с повторным декодированием PNG. Screenshots просмотрены.
- Финальные `pnpm format` и `pnpm check` — exit 0. Lint: 0 errors / 37 прежних
  warnings; typecheck, format:check, docs links, 112 boundary tests (1 skipped),
  IPC codegen check, frontend build, cargo fmt и все четыре clippy configurations
  прошли. `git diff --check` — exit 0. Evidence — `check-final.log`.

Новых полей schema/IPC нет, Canvas2D/CanvasKit fill rule уже был nonzero;
hit-test теперь совпадает с ним. WKWebView/WebKitGTK отдельно не запускались.

## Стыки экрана рамки (ADR-144, 2026-10-20)

Windows x64 / PowerShell; baseline `3f1eedc41dc08818da4300e7d32066f8ab21dd54`
с рабочими изменениями. Evidence — `artifacts/frame-seams/`.

- До реализации: `pnpm test packages/editor-core/src/composition/frame-backdrop.test.ts`
  — 4 failed; `pnpm test:render tests/harness/render/frame-seams.test.ts` — 5 failed.
- `pnpm test packages/editor-renderer/src packages/editor-core/src/composition tests/unit/vue/composition.test.ts`
  — 24 files / 229 passed. После добавления resource/cache contracts:
  `pnpm test packages/editor-core/src/composition packages/editor-renderer/src/composition tests/unit/vue/composition.test.ts`
  — 8 files / 35 passed, включая alpha gutter, cache invalidation/dispose и pixel budget.
- `CUTE_SCREEN_UPDATE_GOLDENS=1 pnpm test:render tests/harness/render/composition.test.ts`
  — 2 passed. Чистый прогон без update:
  `pnpm test:render tests/harness/render/composition tests/harness/render/frame-seams.test.ts`
  — 5 files / 13 passed. Телефон portrait/landscape, window/browser, обе темы,
  плотности 0.63/1/1.25/2, 4K PNG, crop/privacy, alpha/opacity/outerClip.
  Нормализация source rounding меняет sampling некоторых внутренних пикселей;
  goldens обновлены, до/после просмотрены. Неизменённые PNG при update не переписываются.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5193 pnpm test:e2e:browser --spec tests/e2e/specs/browser-frame-seams.e2e.ts --spec tests/e2e/specs/browser-frame-types.e2e.ts`
  — Chrome 155.0.8059.85, 2/2 passed. White/black screen fill: 0 changed channels
  при cover; contain сохраняет свободные поля, Undo/Redo и keyboard picker работают.
- `CUTE_SCREEN_E2E_SCENARIOS=frame-seams,composition,composition-reopen CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle harness, WebView2 155.0.4283.62, external tauri-driver
  2.1.0, 3/3 passed. UI-import opaque 3840×2160; четыре пары white/black:
  max RGBA difference 0 в preview и decoded PNG. Contain, export/copy,
  материалы, Undo/Redo и reopen прошли. Capture fake, DPR 1; версии и pixel
  reports записаны в JSON, native screenshots и export просмотрены.
- WKWebView/WebKitGTK не доступны на этом Windows host и остаются pending.
  Локальные software/perf measurements не подтверждают GPU SLA.

`pnpm test:perf tests/harness/perf/composition.test.ts` — 2 passed (4K/500 и
8K/1000); software/shared-host p95 17.0/835.3 ms — trend only, не GPU SLA.
`pnpm check` — passed целиком: lint/typecheck/format/docs, boundaries (112 passed,
1 existing skip), IPC, cargo fmt и все clippy variants. Усиленный повтор
`frame-seams` — 1/1 passed: явный выбор locale через production settings и
проверка нового mtime каждого PNG перед decode исключают чтение старого экспорта.
Итог, форматирование и disk usage — в README артефакта. Собственные profiles/pinned
harness удалены runner. Удаление диагностического профиля startup отклонено
автопроверкой (blocked by policy); профиль сохранён и отмечен в README артефакта.

## Кэш размытия и отражение холста (ADR-143, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/blur-optimization/` (команды, JSON, screenshots и PNG).

- До реализации зафиксированы traceability и failing pixel/cache contracts.
  Frozen legacy blur/pixelate сравнивается по decoded RGBA: прозрачность,
  повороты/отрицательный scale, края, свободный контур, перекрытия и 1×/2×.
  Flip regression использует настоящую команду отражения, non-origin crop,
  warmed/fresh renderer и Undo/Redo.
- `pnpm test` — 173 files / 1566 passed на промежуточной версии;
  финальные targeted renderer/censor regressions — 6 files / 52 passed.
- `pnpm test:render` — финально 27 files / 76 passed, включая blur/flip.
- `pnpm test:perf` — 4 files / 10 passed. Software Canvas2D на общем host:
  4K/500 и 8K/1000, 30 warmups / 120 samples. Старый/новый полный CPU kernel:
  596,9/259,5 мс и 3488,7/1046,3 мс. Дополнительные typed buffers kernel:
  285/1,76 MiB на 4K и 1139/3,52 MiB на 8K; canvas/input/cache отдельно.
  Warm scene p95 19,7/53,6 мс; движущаяся фигура с blur background
  102,2/319,1 мс. Повторная фильтрация статической цензуры — 0 пикселей;
  retained cache <=128 MiB, temporary group bytes после кадра — 0.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5198 pnpm test:e2e:browser --spec tests/e2e/specs/browser-blur-optimization.e2e.ts`
  — Chrome 155.0.8059.85, 1/1 passed. UI import реального 4K PNG, создание,
  перемещение/resize/strength, Escape, Undo/Redo, idle canvas; обычная залитая
  фигура перемещается при цензуре и blur background. После обоих отражений
  transform именно фигуры меняется; сцена обновляется до pointerup.
  На 50 trusted input events получено 38/41 публикация; p95 интервала
  публикаций 73,6/54,8 мс (это не точная input-to-photon latency).
- `CUTE_SCREEN_E2E_SCENARIOS=blur-optimization CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle, WebView2 155.0.4283.62 / tauri-driver 2.1.0,
  1/1 passed. Production fake Capture → Quick → Editor → picker 3840×2160;
  те же gestures/flip/history, затем штатный Export. PNG повторно декодирован:
  4186×2506. На 50 trusted events получено 33/29 публикаций; p95 интервала
  79,9/76,3 мс. Screenshots Chrome и WebView2 просмотрены; selected transform
  подтверждает движение фигуры, а не изображения под ней.

16,7/33,3 мс остаются продуктовыми бюджетами reference hardware. Эти software
и shared-host замеры их не подтверждают; отдельное точное измерение задержки
ввода и GPU reference run ещё необходимы. WKWebView/WebKitGTK не запускались.

## Отключение оформления (ADR-142, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/remove-appearance/`.

- `pnpm test tests/unit/vue/composition.test.ts` до реализации — 1 failed / 6
  passed: отсутствует Remove appearance (`red.log`). После реализации
  `pnpm test tests/unit/vue/composition.test.ts tests/unit/vue/numeric-control.test.ts tests/unit/vue/card-number.test.ts`
  — 3 files / 25 passed. UI apply → draft → remove создаёт ровно одну команду,
  Undo возвращает полный документ, Redo снимает оформление; empty/read-only
  disabled, interaction projection исключает card layers, merge сохраняет их.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition.e2e.ts --spec tests/e2e/specs/browser-composition-layout.e2e.ts`
  — Chrome 155.0.8059.85, 2/2 passed. Production frame/background/card arrow →
  remove с активным numeric draft; committed layers/canvas/crop прежние.
  Новая стрелка имеет content space; Undo/Redo полностью возвращают документ.
  Footer неподвижен после wheel, scroll body заканчивается выше него, Tab/Enter
  активирует кнопку. RU/EN × light/dark, width 1024; образцы теней остаются
  видимыми, нижние numeric controls доступны через scroll. Screenshots просмотрены.
- `CUTE_SCREEN_E2E_SCENARIOS=composition,composition-reopen CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle, WebView2 155.0.4283.62 / external driver, 2/2 passed.
  Fake Capture → Quick → Editor, UI import 4K, remove/draft/Tab/Enter/content
  arrow/Undo/Redo, decoded export без оформления 3840×2160. После Undo выполнены
  обычные copy/export/save/reopen с фоном и preset; screenshots просмотрены.
- `pnpm lint` — exit 0, 37 прежних warnings; `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  и `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` — exit 0.
- `pnpm format` и `pnpm format:check` — exit 0.
- `pnpm disk:usage`: target до задачи 44,865 GiB, существующий isolated cache
  переиспользован; новый target не создавался.

Новых core/schema/IPC нет. Полный `pnpm check` с Rust/IPC и WebKitGTK/WKWebView
этой UI-задачей не запускались; native capture использует fake-platform.

## Образцы теней на светлой площадке (ADR-141, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/shadow-presets-preview/`.

- `pnpm test tests/unit/vue/composition.test.ts` — 6 passed.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-layout.e2e.ts`
  — Chrome 155.0.8059.85, 1/1 passed, RU/EN × light/dark, viewport 1024×768.
  Основные controls помещаются без горизонтального overflow. Белые карточки
  32×22, площадка высотой 48; измеренная средняя яркость RGB под карточкой
  230,3 / 207 / 177 / 145,3. Между соседними образцами требуется разница >8.
  Существующие выбор пресетов, параметры, Escape и Undo/Redo также passed.
- `CUTE_SCREEN_E2E_SCENARIOS=composition,composition-reopen CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle, WebView2 155.0.4283.62 / external driver, 2/2 passed.
  Production fake Capture → Quick → Editor; пиксели образцов совпадают с browser.
  Export повторно декодирован; сохранение/перезапуск, фон и preset восстановлены.
  Screenshots обоих runtime просмотрены. Первый диагностический запуск дошёл
  до образцов, но остановился на последующем рисовании стрелки; удалена лишняя
  scrollIntoView из измерительного helper, повторный полный прогон passed.
- `pnpm lint` — exit 0 (37 прежних warnings); `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  и `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` — exit 0.
- `pnpm disk:usage`: target 44,865 GiB; существующий cache переиспользован,
  новый target не создавался.

Изменены только миниатюры пресетов: реальный renderer/export и значения пресетов
не менялись. WebKitGTK/WKWebView и физический захват этой проверкой не покрыты.

## Тёмный default рамок (ADR-140, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2, baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/frame-dark-default/`.

- `pnpm test packages/editor-core/src/composition/composition.test.ts` до реализации
  — 1 failed / 15 passed: ожидался dark, получен light (`red.log`). После изменения
  `pnpm test packages/editor-core/src/composition/composition.test.ts tests/unit/vue/composition.test.ts`
  — 22 passed. Проверены все starter defaults, roundtrip сохранённой light и preset.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec tests/e2e/specs/browser-frame-types.e2e.ts`
  — Chrome 155.0.8059.85, 1/1 passed: default dark, Light/Undo/Redo, смена frame.kind,
  RU/EN × light/dark при 1024 px.
- `CUTE_SCREEN_UPDATE_GOLDENS=1 pnpm test:render tests/harness/render/composition.test.ts`
  — обновлены эталоны рамок, 2/2 passed. После снятия update-переменной
  `pnpm test:render tests/harness/render/composition` — 4 files / 6 tests passed.
  Canvas2D/CanvasKit 1×/2×, decoded PNG/parity, исходник immutable;
  browser/window/phone screenshots просмотрены.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0.

Schema, native API и платформенные зависимости прежние. Native WebView и полный
Rust check для изменения core default не запускались.

## Миниатюра картинки фона (ADR-139, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence — `artifacts/background-thumbnail/`.

- `pnpm test tests/unit/vue/card-image-preview.test.ts tests/unit/vue/composition.test.ts`
  — 2 files / 7 tests passed: contain geometry, очистка старой миниатюры при
  ожидании замены, loading/error RU/EN и production composition regressions.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-fill.e2e.ts`
  — Chrome 155.0.8059.85, 1/1 passed: семь типов заливки, empty image,
  keyboard/Undo/Redo и RU/EN × light/dark. Загруженный preview проверен native.
- `CUTE_SCREEN_E2E_SCENARIOS=composition,composition-reopen CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle, WebView2 155.0.4283.62 / external driver, 2/2 passed.
  Production fake Capture → Quick → Editor; UI-импорт фона 3840×2160 и замена
  прозрачным PNG 64×64, Undo/Redo/cancel, save/relaunch после удаления catalogue
  rows. Preview 80×60, no overflow; alpha центра 255 и 63–64, прозрачный contain-margin 0.
  Оба screenshots просмотрены. Существующий export повторно декодирован.
- `pnpm lint` — exit 0 (37 прежних warnings); `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  и `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` — exit 0.
- `pnpm disk:usage`: target 44,865 GiB, до задачи 44,572 GiB; общий cache сохранён,
  новый target не создавался.

Новых native API нет. WebKitGTK/WKWebView, physical capture и полный Rust check
этой UI-задачей не проверялись.

## Общая палитра оформления (ADR-138, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2, baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Evidence: `artifacts/appearance-colors/`.

- `pnpm test tests/unit/vue/composition.test.ts tests/unit/vue/branding.test.ts tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/ui-controls.test.ts`
  — 4 files / 33 tests passed. Production session: палитра фона, сохранение alpha,
  одна команда, Undo, invalid HEX, Escape/focus и disabled.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec tests/e2e/specs/browser-appearance-colors.e2e.ts`
  и отдельный `--spec tests/e2e/specs/browser-composition-layout.e2e.ts` — оба passed,
  Chrome 155.0.8059.85. RU/EN × light/dark при 1024 px, custom HEX/alpha, Undo/Redo,
  invalid/cancel, геометрия, активация и отмена инструментальной пипетки.
  Compact gate допускает 1 CSS px дробной границы scroll-area: измеренное превышение
  0,297 px относится к нижнему border, controls полностью видимы на screenshot.
- `CUTE_SCREEN_E2E_SCENARIOS=composition,composition-reopen CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`
  — fresh debug/no-bundle harness, WebView2 155.0.4283.62 / external driver,
  2/2 passed. Production fake Capture → Quick → Editor, UI-импорт 3840×2160,
  цвет/alpha/Undo/Redo, custom HEX, Escape/focus, sampling activation/cancel,
  save/relaunch и decoded export. Все записанные pointer/keyboard/contextmenu
  события trusted. Обе геометрии: button 34×34, SVG 18×18, dx/dy 0, padding 0.
- `pnpm lint` — exit 0 (37 существующих warnings); `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json`
  и `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0.
- `pnpm disk:usage`: target 44,572 GiB после, предыдущий замер 44,310 GiB;
  общий cache сохранён, новый target не создавался.

Browser/native screenshots просмотрены. Chromium не подтверждает WebKitGTK/WKWebView;
эти платформы не запускались. Capture использует fake-platform. Полный Rust check
для этого UI-изменения не запускался.

## Клавиатурный lifecycle числовых полей (ADR-133, 2026-10-20)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2, baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` + рабочие изменения.
Логи задачи: `artifacts/numeric-keyboard/`.

- `pnpm test` — 169 files / 1543 tests passed (`unit-delivery.log`).
- `pnpm test tests/unit/vue/numeric-control.test.ts tests/unit/vue/numeric-shell.test.ts tests/unit/vue/numeric-preview.test.ts tests/unit/vue/shape-gradient.test.ts tests/unit/vue/card-number.test.ts tests/unit/vue/numbered-marker.test.ts tests/unit/vue/composition.test.ts tests/unit/vue/text-context-toolbar.test.ts tests/unit/vue/editor-settings.test.ts tests/unit/vue/callout-toolbar.test.ts`
  — после последнего подключения atomic preview 10 files / 74 tests passed
  (`targeted-delivery.log`). Покрыты caret/Enter/Tab/blur, repeat/Shift, границы,
  mixed/invalid, comma, малые дроби, safe integers, IME/window blur, смена
  контекста, сортировка точек, номер метки и общий inline Apply/Cancel draft.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5198 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-numeric-keyboard.e2e.ts --spec tests/e2e/specs/browser-numeric-appearance.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts --mochaOpts.grep "edits paint|previews gradient|commits on release"`
  — 3/3 passed (`browser-complete.log`), Chrome 155.0.8059.85. RU/EN ×
  light/dark при 1024 px, live pixels до keyup без document mutation,
  повтор и Shift с одним undo, точный redo, каретка/Tab/Escape, wheel,
  оформление и production slider drag/preview/commit. Для окружения PowerShell
  переменные заданы через `$env:`, без изменения конфигурации репозитория.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5198 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts`
  — 4/4 passed (`text-toolbar-complete.log`): текстовый background preview,
  handoff, responsive toolbar, Callout frame и номерная метка. Старый сценарий
  обновлён для существующих отдельных меню Text/Label выноски; её карточка
  больше не настраивается через отключённый text-background control.
- `CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated CUTE_SCREEN_E2E_SCENARIOS=numeric-keyboard pnpm test:e2e:tauri`
  — 1/1 passed (`native-complete.log`), freshly built debug/no-bundle harness,
  WebView2 155.0.4283.62, external driver, WDIO Tauri service 1.3.0.
  Production fake Capture → Quick → Editor: shape opacity в Quick, gradient
  opacity и оформление в Editor. Повтор/Shift, preview pixels до keyup,
  один undo/redo, invalid/caret/Tab/Escape проверены настоящим вводом.
  `numeric-quick-input.json` и `numeric-editor-input.json`: все keydown trusted.
  Просмотрены native Quick/Editor и browser screenshots с полем и объектом.
  Общий debug executable занят development-приложением; переиспользован
  предусмотренный AGENTS.md isolated cache, новый target не создавался.
- `pnpm format` — passed (`format.log`). Общий `pnpm check` — passed
  (`check-status.log`): lint/types/format/docs, boundaries 112 passed + 1 skipped,
  IPC и четыре штатных Rust clippy профиля.

Red-first evidence: `card-red.log`, `escape-priority-red.log`,
`shared-draft-red.log`, `atomic-preview-red.log`. Помимо общих обработчиков
исправлен window capture-Escape фоновой ошибки image drop: он больше не
перехватывает Escape у editable controls. Numeric preview внутри Apply/Cancel
не записывает неподтверждённое число в общий draft; отмена поля сохраняет
остальные подтверждённые параметры панели и их preview. Context cancellation
отличается от локальной отмены и не возобновляет старую проекцию.

Дисковая гигиена: workspace target 44.857 → 44.863 GiB, task evidence около
0.001 GiB. Полезные debug/isolated/release cache и зависимости сохранены.
Автоматическая проверка разрешений отклонила удаление пяти собственных failed
E2E profiles с причиной `blocked by policy`; они оставлены в runtime. Их точные
имена и результаты — `artifacts/numeric-keyboard/summary.json`; успешные
session profiles очищены штатным runner. Disk report — `disk-after.log`.

Первый native `gradient` gate остановился на прежнем magnet assertion до
числовых проверок (`native.log`); выделен независимый numeric-keyboard сценарий.
При повторе были занятый порт 4445 и неоднозначный drag в угол перенесённой из
Quick фигуры. Финальный сценарий создаёт градиент на свободном участке;
старый magnet assertion не ослаблялся. WebKitGTK/WKWebView и physical capture
для этого изменения не запускались.

## Ползунок связанных полей (ADR-136/137, 2026-10-20)

Windows x64, working copy; evidence — `artifacts/inset-slider/`.

- `pnpm test tests/unit/vue/composition.test.ts tests/unit/vue/numeric-control.test.ts`:
  21 passed. Production session проверяет transient keyboard preview четырёх
  сторон, один commit и Undo; общий control покрывает drag/cancel/disabled.
- HEADLESS=1, port5189,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-inset-slider.e2e.ts --spec tests/e2e/specs/browser-composition-layout.e2e.ts`:
  итог — `browser.log`. Новый сценарий держит pointer до проверки committed
  document, затем release/Undo/Redo/Escape, %/px и ArrowRight. RU/EN × themes
  при 1024 px: control до 68 px, ползунок ≥250 px под числом,
  horizontal overflow отсутствует; общий раздел <570 px.
- `pnpm test:e2e:tauri`, composition + composition-reopen, fresh debug/no-bundle,
  CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated,
  NODE_OPTIONS=--dns-result-order=ipv4first: тот же drag-flow в production
  Windows WebView2. Фактический итог — `native.log`.
- `pnpm format`, `pnpm format:check`, E2E typecheck и docs links — logs рядом.
  Core/renderer/schema/IPC не менялись. WebKitGTK/WKWebView не запускались.
  Финал: browser 2/2 passed (Chrome 155.0.8059.85), native composition + reopen
  2/2 passed (WebView2 155.0.4283.62 / tauri-driver 2.1.0). Held-drag screenshot
  просмотрен; native input trace — все события trusted. Format, format:check,
  E2E/unit typecheck и docs links passed. Новых render/release/GPU claims нет.

## Живой выделитель с оформлением (2026-10-20)

Windows 10 x64 (19045), Node 22.23.1 / pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54` с существующими локальными изменениями.
Evidence: `artifacts/highlighter-live/`.

- Red-first: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_BROWSER_E2E_PORT=5193`,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter-live.e2e.ts`:
  Tint не менял пиксели при удерживаемой кнопке, checksum 1522438899 до/после.
- Тот же сценарий с `CUTE_SCREEN_E2E_DISABLE_WATCH=1`: Chrome 155.0.8059.85,
  1/1 passed на fixture 2560×1440. Три эффекта, продолжение, Shift down/up,
  отсутствие нового слоя до pointerup, exact checksum области штриха после
  commit/Undo/Redo и Escape. События input — trusted. Область не включает
  несвязанные фон/тень; tolerance не используется.
- WebDriver sequence едина от down до up; RAF-наблюдатель читает пиксели и
  число слоёв между движениями. Раздельные команды с модификатором теряют
  capture даже на отдельном пустом canvas в ChromeDriver. Наблюдатель не
  подменяет input; object method сериализуется без внешнего `__name`.
- `pnpm test tests/unit/vue/highlighter-gesture.test.ts tests/unit/vue/highlighter-preview.test.ts tests/unit/vue/straight-strokes.test.ts tests/unit/vue/highlighter-background.test.ts`:
  4 files / 26 passed. Component покрывает Escape/blur/pointercancel;
  decoded Canvas2D PNG проверяет blend, повторный preview и восстановление backdrop.
- Browser `browser-straight-strokes.e2e.ts`: 5/5 passed, DPR 1/2 × Fit/1:1.
  Существующий `browser-highlighter.e2e.ts`: 1 passed / 1 failed;
  preview checksum 2500640380, committed 3415657837 в обычном Editor.
  В этом маршруте сохранён прежний HighlighterPreview.
- `pnpm check`: lint/typecheck/format/docs passed; boundaries — 111 passed,
  1 skipped, 1 failed. Четыре нарушения size/complexity относятся к параллельно
  изменённым composition controller, numeric draft и numbered-marker settings.
  IPC/Rust-часть общего gate этим запуском не достигнута.

- Native: `CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated`,
  `CUTE_SCREEN_E2E_SCENARIOS=highlighter`, `CUTE_SCREEN_E2E_DRIVER_PORT=4464`,
  `TAURI_WEBDRIVER_PORT=4465`, `pnpm test:e2e:tauri` — fresh debug/no-bundle,
  external tauri-driver 2.1.0 + WebView2 155.0.4283.62. Новый composition scenario
  passed для всех трёх эффектов с trusted pointer/Shift/Escape, transient layer
  counts, exact content-band preview/commit/Undo/Redo pixels. Source — fake
  opaque capture 400×300 через production Capture → Quick → Editor.
  `highlighter-live-native.json` содержит наблюдения между движениями.
- `CUTE_SCREEN_E2E_SCENARIOS=highlighter,straight-strokes pnpm test:e2e:tauri`
  с тем же общим isolated target: straight-strokes 1/1 passed. Существующий
  highlighter Quick smoke в начальном прогоне остановился на ожидании addLayer.
  Финальный highlighter suite: 2 passed / 1 failed; новая composition-проверка
  и UI matrix passed, старый Quick smoke ожидает numbered-marker cursor `none`,
  но получает `move` до проверки штриха.
  Browser/native UI matrix RU/EN × light/dark passed. Native instrumentation
  `__name` исправлен object method; временная ошибка numeric draft и конфликт
  параллельных native sessions потребовали повторить свежую сборку.

## Визуальный выбор рамки (ADR-135, 2026-10-20)

Windows x64; evidence — `artifacts/frame-tiles/`. Существующий working tree
с незавершёнными параллельными изменениями сохраняется. Schema/renderer не менялись.

- `pnpm test tests/unit/vue/composition.test.ts`: 5 passed (`unit.log`), включая
  production session: порядок разделов, отсутствие команды при открытии,
  один выбор — одна команда, title сохраняется, применимые поля, Undo/Redo,
  native radio disabled при read-only.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-frame-types.e2e.ts`:
  HEADLESS=1, port5189; keyboard ArrowRight, четыре типа, Undo/Redo и снимки
  1024 px RU/EN × themes. Фактический итог — `browser.log`; предыдущая
  layout regression прошла отдельно. Тест нажимает видимую плитку, не скрытый radio.
- `pnpm test:e2e:tauri`: composition + composition-reopen, fresh debug/no-bundle,
  CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated,
  NODE_OPTIONS=--dns-result-order=ipv4first. Native использует тот же UI flow,
  сохраняет trusted ArrowRight events и документ; итог — `native.log`.
  Результат: 2/2 passed, WebView2 155.0.4283.62, tauri-driver 2.1.0;
  `native-input.json` содержит два trusted ArrowRight keydown. Native screenshot
  просмотрен. Browser Chrome 155.0.8059.85: 1 passed, четыре RU/EN × theme
  screenshot просмотрены. После native прогона только selected CSS дополнен
  толщиной контура и жирностью; его финальная geometry проверяется browser-ом.
- Formatting/typecheck и disk usage — одноимённые logs. WebKitGTK/WKWebView
  не запускались; screenshots проверяются отдельно от наличия компонентов.

## Многослойная тень и независимый размер (ADR-134, 2026-10-20)

Windows x64, Node 22.23.1/pnpm 10.33.2; baseline
`3f1eedc41dc08818da4300e7d32066f8ab21dd54`, working copy.
Исследование и собственный рецепт: `docs/SHADOWS_RESEARCH.md`.
Evidence: `artifacts/appearance-compact/`.

- Red-first core: `pnpm test packages/editor-core/src/composition/composition.test.ts`:
  новая проверка размера 400% сначала падала (blur 30 вместо 180);
  `shadow-options-red.log`. Более ранний layered contract: 5 red failures.
- `pnpm test tests/unit/vue/composition.test.ts packages/editor-core/src/composition/composition.test.ts packages/editor-renderer/src/canvas2d-lifecycle.test.ts`:
  28 passed (`options-unit.log`). Codec/validation/defaults/undo, независимый размер,
  preview/Escape, cache reuse при alpha edit, освобождение при resize/dispose.
- `pnpm test:render tests/harness/render/composition.test.ts tests/harness/render/composition-shadow.test.ts tests/harness/render/composition-privacy.test.ts`:
  5 passed (`layered-render-final.log`). PNG повторно декодируется: 4K source,
  Canvas2D/CanvasKit 1×/2×, непрерывный профиль, прозрачный центр, хвост 400%,
  исходный SHA неизменен. Обновлены composition goldens; tolerances не менялись.
  Ранее обнаруженная Windows footer 2× разница: 8 channels, delta 1.
- HEADLESS=1, CUTE_SCREEN_BROWSER_E2E_PORT=5189,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-layout.e2e.ts`:
  1 passed (`browser-layered.log`), Chrome 155.0.8059.85. Production mount,
  inner viewport 1024×768, RU/EN × light/dark; main group <530 px, два ползунка
  и collapsed advanced видны, horizontal overflow отсутствует. Trusted input:
  density/size/undo/redo/Escape, spread, shift и reset.
- `pnpm test:perf tests/harness/perf/composition.test.ts`: 2 passed,
  30 warmups/120 measurements; 4K/500 annotations p95 105.3 ms,
  8K/1000 p95 377.1 ms. Shared Windows Canvas2D software, trend only,
  reference GPU budgets 16.7/33.3 ms остаются pending. JSON в
  `artifacts/composition/perf-{3840,7680}.json`, log `layered-perf.log`.
- Native: fresh `pnpm test:e2e:tauri` composition + composition-reopen,
  CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated,
  NODE_OPTIONS=--dns-result-order=ipv4first: 2/2 passed, WebView2 155.0.4283.62,
  external tauri-driver 2.1.0 (`native-layered.log`). Native PNG 4186×2506:
  red=52 вместо background=87 непосредственно под снимком, размер 400%,
  scale99/radius38/density83 (`native-shadow-pixel.json`). 43 keydown и 19
  pointerdown — все trusted. Size draft/cancel/commit/undo/redo и сохранение
  250% через restart подтверждены. `native-shadow.png` визуально проверен.
  Первое повторение выявило неверный порядок Undo в новом test block;
  блок исправлен, production command history не менялся.
- General check, formatting и final disk usage: `check.log`, `format.log`,
  `disk-final.log`. WebKitGTK/WKWebView и reference GPU runner не запускались;
  fake capture в native не доказывает physical capture.
  `pnpm check` прошёл lint/typecheck, но общий результат не green: параллельно
  меняемые numeric helpers нарушали formatting, затем отдельный
  `pnpm test:boundaries` показал четыре structure violations (controller.ts,
  use-numeric-draft.ts, numbered-marker-settings.ts). Финальные format/check
  прошли отдельно; 111 boundary tests passed, 1 failed, 1 skipped.
  Точный список — `check-remaining.log`; IPC/Rust — `check-ipc-rust.log`.

## Непрерывная тень снимка — предыдущий этап до ADR-134 (2026-10-20)

Уточнение владельца при scale 99%, radius 38, shadow 83%: под снимком была
светлая щель перед тенью. Общая сцена рисовала 12 прозрачных прямоугольников
с обводками и offsetY=5; внутренний участок между снимком и первой обводкой
не покрывался. Исправление: те же 12 контуров заполнены alpha strength/32,
перекрытие непрерывно заполняет смещённый силуэт. Новых primitives, schema,
IPC и dependencies нет; нулевой shadow остаётся пустым.

Evidence: `artifacts/appearance-compact/`, Windows x64, тот же baseline.

- `pnpm test packages/editor-core/src/composition/composition.test.ts`:
  red — 3 failures (none/browser/phone), coverage непосредственно под корпусом 0.
- `pnpm test:render tests/harness/render/composition-shadow.test.ts`:
  red — 2 failures, decoded delta на 1 px под краем 0. `shadow-before.png`.
- `pnpm test packages/editor-core/src/composition/composition.test.ts tests/unit/vue/composition.test.ts`:
  green — 18/18 passed (`shadow-core-green.log`).
- Decoded 4K input → 1600×1000 PNG, both backends at 1×/2×: connected shadow,
  monotonic samples at 1/8/16 px, unchanged background at 32 px, input hash retained.
  `shadow-render-green.log` — 2/2 passed. On/off Canvas2D and CanvasKit PNG retained;
  corrected Canvas2D PNG visually inspected.
- Composition goldens regenerated with
  `$env:CUTE_SCREEN_UPDATE_GOLDENS='1'; pnpm test:render tests/harness/render/composition.test.ts`.
  One existing footer Canvas2D 2× golden also differs by 8 channels ×1 on this
  Windows raster runtime; recorded with the regenerated outputs. No tolerance raised.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5189`, headless,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-layout.e2e.ts`:
  passed with actual scale 99%, radius 38 and shadow 83%, RU/EN × themes.
- Native composition scenario now exports this exact combination and decodes
  the pixel immediately below the body; `native-shadow.log` records the fresh run.
  Screenshot and `appearance-shadow-pixel.json` are retained from the native output.
  2/2 passed after correcting the Node-side helper import to the existing relative
  layout module. Decoded native PNG 4186×2506: at (2093,2324), red=63 versus
  unshadowed background=87. 31 keydown + 15 pointerdown recorded, all trusted.
  Screenshot inspected. WebKitGTK/WKWebView are not covered by the Windows run.
- Final `pnpm test:render tests/harness/render/composition.test.ts tests/harness/render/composition-shadow.test.ts tests/harness/render/composition-privacy.test.ts`:
  3 files / 5 passed (`shadow-render-final.log`), including updated goldens and
  censorship/blur privacy. No tolerance raised.

Disk after the builds: target 44.857 GiB (debug 17.178 / isolated 23.997 /
release 3.638); shared caches retained. Automatic approval review rejected cleanup
of the resolved instrumentation-failure profile with reason `blocked by policy`;
failed profiles remain diagnostic data, outside the compact evidence folder.

## Компактные фон и макет (2026-10-20, ADR-132)

Windows 10 x64; baseline `3f1eedc41dc08818da4300e7d32066f8ab21dd54`, changes
uncommitted. Node 22.23.1 / pnpm 10.33.2. Evidence: `artifacts/appearance-compact/`.

- `pnpm test tests/unit/vue/composition.test.ts tests/unit/vue/numeric-control.test.ts tests/unit/vue/branding.test.ts`:
  3 files / 12 passed. Production session: neutral open, linked/independent insets,
  one-command relink, shadow preview/Escape/commit/Undo/Redo. NumericControl covers
  pointercancel; branding regression remains green.
- PowerShell: `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'` and
  `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5189'`, then
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-layout.e2e.ts --spec tests/e2e/specs/browser-composition-fill.e2e.ts --spec tests/e2e/specs/browser-composition-compact.e2e.ts --spec tests/e2e/specs/browser-composition-sticky.e2e.ts --spec tests/e2e/specs/browser-composition.e2e.ts`:
  Chrome 155.0.8059.85, 5/5 passed. New layout scenario measures **inner viewport**
  1024×768 (window adjusted for Chrome chrome), common solid settings under 530 px,
  shadow bottom within scroll viewport, RU/EN × themes. Screenshot panel and canvas
  inspected in RU/dark and EN/light. Existing suites keep their outer-window sizing.
  Trusted keyboard edits slider, one Undo reverses its change; exact input remains
  transient until commit, Escape keeps panel open, relink restores with Undo.
- PowerShell: `$env:CUTE_SCREEN_E2E_SCENARIOS='composition,composition-reopen'`,
  `$env:CARGO_TARGET_DIR='D:/cutescreen/target/e2e-isolated'`,
  `$env:NODE_OPTIONS='--dns-result-order=ipv4first'`, then `pnpm test:e2e:tauri`:
  fresh debug/no-bundle harness, external tauri-driver 2.1.0 / WebView2
  155.0.4283.62, 2/2 passed. Native shadow draft/Escape/Enter/Undo/Redo,
  material save from collapsed Presets, import/gradient drag, clipboard bitmap,
  decoded exported PNG and persisted reopen. Native screenshot inspected.
  Fake capture is not evidence of physical capture. WebKitGTK/WKWebView remain
  unverified for this layout; renderer/schema/IPC were not changed.

Earlier browser attempts caught a malformed test selector, browser-only image-drop
feedback obscuring controls (fixed by the existing imageIngress harness), sticky
assertions targeting the removed section, and an over-tall first layout. The final
production geometry passes without hiding controls or rewriting document state.
The initial `pnpm check` found an unsupported testing-library `exact` query option;
removed it without changing the queried name. The full `pnpm check` then passed,
including 112 boundary tests (1 skipped), IPC consistency and all Rust clippy gates.

Owner follow-up: replaced inset unit select with visible `% / px` segments.
Repeated the same 12 component tests and the browser layout scenario: passed,
including keyboard selection, active state, Undo/Redo and RU/EN geometry. Native
input observation uses explicit window.document because a test-local document
variable otherwise becomes an inaccessible document2 closure in serialized code.

Disk before native: target 43.935 GiB (debug 16.251 / e2e-isolated 24.003 /
release 3.638). Reused e2e-isolated because the resident dev executable occupies
target/debug. Cleanup preview identified this task's abandoned 0.047 GiB Chrome
profile from the interrupted port-conflict attempt; `pnpm clean:artifacts --apply`
removed it. Cargo caches and the resident application were retained. Target after
native was 43.928 GiB (16.251 debug / 23.996 isolated); the final report is retained.

## Иконка оформления (2026-10-20)

Windows x64, HEAD `9ec157d`, рабочая копия: кнопка «Оформление» использует
Tabler `palette` через `UiIcon`.
`pnpm test --project vue tests/unit/vue/ui-icon.test.ts`: 130/130 passed,
включая новый знак (SVG, currentColor, accessibility и class/style fallthrough).
`pnpm format`, `pnpm format:check` и `pnpm typecheck` прошли.
Отдельная визуальная проверка в browser/native WebView не проводилась.

## Магнитное перемещение градиента (2026-10-20, ADR-131)

Windows x64, HEAD `445cf1740ded724c14febe2d21704f6eec462e12`, общая рабочая копия
с ранее выбранной иконкой градиента. Магнит относится к краям одной подложки,
имеет capture 6 / release 14 CSS px и transient state без таймеров.

- Red-first: `pnpm test --project core packages/editor-core/src/gradient-move-snap.test.ts`:
  6 failed до реализации отсутствующей функции.
- `pnpm test --project core --project vue packages/editor-core/src/gradient-move-snap.test.ts packages/editor-core/src/gradient.test.ts tests/unit/vue/gradient-backdrop.test.ts tests/unit/vue/canvas-viewport-transform.test.ts`:
  4 files / 33 passed. Capture/hold/release по осям, zoom 0.5/1/2, Crop origin,
  отражённые scales, guards, pointerup, Ctrl/Cmd, cancel/Escape, no-op и новый drag.
  JSDOM сообщает отсутствие Canvas getContext; это проверка контрактов, не renderer evidence.
- `CUTE_SCREEN_BROWSER_E2E_PORT=53195 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1
NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:browser --spec tests/e2e/specs/browser-gradient.e2e.ts`:
  Chrome 155.0.8059.85, 1/1 passed. Настоящие pointer/key events: создание подложки,
  перенос в угол, удержание при смещении курсора на 11 CSS px, отрыв на 20 px,
  Ctrl, Escape, одна undoable command, Redo и неизменные size/fill.
  Просмотрен `artifacts/gradient-magnet/browser-held.png`; document/input trace —
  `browser.json` и `browser-capture.json` в том же каталоге.
- `browser-gradient-placement.e2e.ts` в первом общем browser-прогоне: 2/2 passed,
  RU/EN × light/dark, 1024/640 px и прежние placement commands.
  Первый новый assertion исправлен на float tolerance 1e-8 для delta arithmetic;
  затем отдельный прогон выполнен после завершения package build.
- `pnpm test:boundaries`: 112 passed / 1 skipped после выделения gradient finish
  в отдельный модуль без повышения лимитов complexity/file size.
- `pnpm lint`, `pnpm typecheck`, `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  прошли; lint сохраняет 54 предупреждения вне изменённых файлов.
- Первый `pnpm test:e2e:tauri` не смог перезаписать занятый пользовательским
  приложением `target/debug/cute-screen.exe`; старый binary не использовался.
  Повтор с существующим `CARGO_TARGET_DIR=D:/cutescreen/target/e2e-isolated`,
  `CUTE_SCREEN_E2E_SCENARIOS=gradient,gradient-reopen`,
  `NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri` прошёл: 2/2.
  Свежий debug/no-bundle harness, external tauri-driver 2.1.0, WebView2 155.0.4283.62.
  Production Capture → Quick без Gradient → Editor → создание → перенос → reopen.
  Трасса подтверждает 20 trusted pointer events и 13 trusted keydown, все события
  настоящие. Capture использует fake-platform; это проверка взаимодействия WebView2.
  Просмотрен `artifacts/gradient-magnet/native-held.png`; native.json содержит
  before/snapped/released/bypassed и input trace, сохранены оба JUnit.
- Исправлена native-only сериализация наблюдателя событий: именованный callback
  попадал в WebDriver с недоступным esbuild helper __name. Observer теперь использует
  анонимный listener и AbortController для cleanup; product code не подменяется.
- Linux WebKitGTK и macOS WKWebView этим Windows прогоном не проверены.
  Native beforeBuild проверил новые Vue/core modules; Rust/schema/IPC не менялись.

## Иконка градиента: выбранный вариант 01 (2026-10-20)

Windows x64, HEAD `445cf1740ded724c14febe2d21704f6eec462e12`, изменения не закоммичены.
В `UiIcon gradient` подключён квадрат с затуханием слева направо; геометрия совпадает
с выбранным прототипом. Поведение Gradient и доступность только в Editor сохранены.

- `pnpm test --project vue tests/unit/vue/ui-icon.test.ts`: 128 passed.
- `pnpm test:boundaries`: 112 passed, 1 skipped.
- `pnpm icons:preview --port 53193 --strictPort`: gallery открыта в in-app browser.
- PowerShell: `CUTE_SCREEN_BROWSER_E2E_PORT=53194`, `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`,
  `CUTE_SCREEN_ICON_EVIDENCE=gradient-01`, `NODE_OPTIONS=--dns-result-order=ipv4first`;
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts --spec tests/e2e/specs/browser-gradient.e2e.ts`:
  Chrome 155.0.8059.85, 2 specs / 3 tests passed. Проверены actual UiIcon в обеих темах,
  размеры 16/18/20/24/32, DPR 1/2, отсутствие clipping при decode SVG и создание/редактирование
  подложки через production input; RU/EN × light/dark, 1024 px.
- Просмотрены `artifacts/custom-icons/gradient-01/gradient-family-dpr-{1,2}.png`
  и `artifacts/browser-e2e/gradient-ru-dark.png`: знак различим при 18 px,
  согласован с соседями; active и disabled сохраняют переход и контур.
- `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`
  прошли; lint сообщает 54 предупреждения вне изменённых файлов.
  Browser harness сообщает предупреждения об отсутствующем native image-drop/history bridge;
  это браузерный прогон, а не native verification.
- Native WebView, WebKit и сборки пакетов этим изменением не проверялись.
  Новый SVG использует прежний контракт примитивов/currentColor; Rust не изменялся.

## Windows dev capture и ручное оформление (2026-10-20)

Windows 10 Home x64 10.0.19045; baseline HEAD `06a59dbd557356c6a204f1aeeed380b8c3c36b9f`,
изменения не закоммичены. Node 22.23.1 / pnpm 10.33.2; Chrome 155.0.8059.85,
WebView2 155.0.4283.62, external tauri-driver. Evidence — `artifacts/dev-appearance/`.

- До исправления Editor хранил отрицательные desktop targets, хотя повторный
  native IPC возвращал Windows DXGI с доступными Area/Screen. Native backend был
  подключён. Причина первого transient отказа не сохранилась в boolean probe API.
- Red-first Vue: отсутствующий Layout до выбора пресета; затем
  `pnpm exec vitest run --project vue tests/unit/vue/composition.test.ts
tests/unit/vue/platform-capabilities.test.ts tests/unit/vue/app-startup.test.ts
--maxWorkers=1`: 3 files / 9 passed. Покрыты neutral/no-edit opening, первая
  ручная команда, Undo/Redo, bounded retry/error/coalescing/disposal.
- `CUTE_SCREEN_BROWSER_E2E_PORT=53170 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1
NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:browser --spec
tests/e2e/specs/browser-composition.e2e.ts --logLevel debug`: 1/1 passed.
  Production controls до пресета, Undo, RU/EN × light/dark при 1024 px.
- Production dev WebView2: fault injection одного отрицательного ответа на
  DesktopBridge boundary; последующий настоящий native IPC вернул targets и
  включил Capture. JSON — `webview-recovery.json`; persisted mount state не подставлялся.
- `cargo test --workspace compositor_runtime_probe_reads_the_visible_desktop --
--ignored --nocapture`: 1 actual compositor test passed, другие tests filtered.
- `CUTE_SCREEN_E2E_SCENARIOS=composition,composition-reopen,windows-capture-exclusion
NODE_OPTIONS=--dns-result-order=ipv4first pnpm test:e2e:tauri`: свежий debug/no-bundle
  harness, 3 scenarios / 3 tests passed. Native ручной inset до пресета и Undo,
  native image/material import, Copy и повторно декодированный PNG, persisted reopen.
  Отдельный physical Windows scenario без fake capture проверил hide/cancel/retry
  и точные desktop pixels без editor. Composition fixture использует fake capture;
  это не является доказательством physical capture само по себе.
- `pnpm check` passed, включая Rust feature/clippy gates. `pnpm format` выполнен;
  финальный format/docs gate фиксируется в том же evidence каталоге.
- Другие платформы этим Windows прогоном не проверялись. Release/package не собирался.

## Жест масштабирования интерфейса (2026-10-20, ADR-130)

Linux x86_64, HEAD `e50da83a869ed09778bd173e2de290c60a40c3d1`, общая рабочая
копия с несвязанными изменениями. Node 22.23.1 / pnpm 10.33.2 / Chrome 147.
Логи — `artifacts/interface-zoom/`.

- Red-first `CUTE_SCREEN_E2E_DISABLE_WATCH=1 CUTE_SCREEN_BROWSER_E2E_PORT=53148
CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec
tests/e2e/specs/browser-interface-zoom.e2e.ts`: оба trusted Ctrl+wheel над chrome
  и Settings дошли без preventDefault (`cancelled:false`, browser-red.log).
- После исправления та же команда с port 53149: 2/2 passed (browser-green.log).
  Сохраняются viewport, DPR, visualViewport scale и размеры controls; wheel над
  canvas меняет только editor zoom; обычный wheel прокручивает Settings.
  Синтетические gesturestart/change/end отменены общим entrypoint.
- Этот WebDriver Chrome не выполнял browser page zoom даже до исправления:
  red доказывает отсутствие cancellation, а не физический pinch. Linux WebKitGTK,
  Windows WebView2 и macOS WKWebView с настоящим трекпадом остаются pending.
- `pnpm test tests/unit/vue/canvas-viewport-transform.test.ts
tests/unit/vue/keyboard-shortcuts.test.ts --maxWorkers=1`: 2 files / 13 passed
  (tests.log). Проверены прежние viewport transforms и keyboard shortcuts.
- `pnpm typecheck`, targeted ESLint трёх файлов исправления и `pnpm docs:check`
  passed. `pnpm format` выполнен; результат общего `pnpm format:check` — format-check.log.
- Общий `pnpm lint` blocked сторонним unused `expect` в
  `tests/e2e/specs/browser-composition-gradient.e2e.ts` (lint.log).
  Rust/native/release сборки не запускались: изменение только в общем frontend.
- `pnpm disk:usage`: общий Cargo target 45.537 GiB; полезный cache сохранён.
  Собственные evidence занимают менее 0.1 MiB; временных profiles/targets нет.

## Публикационные карточки (2026-10-20, ADR-127)

HEAD `e50da83a869ed09778bd173e2de290c60a40c3d1`, общая рабочая копия с
ADR-128. Linux x86_64; Node 22.23.1 / pnpm 10.33.2; Chrome 147.
Native: Ubuntu 22.04 Docker `cute-screen-ubuntu22-build:local`, Rust 1.97.0,
WebKitGTK 2.50.4, Xvfb/D-Bus и external tauri-driver. Один общий `target/`.

- До реализации обновлены PRODUCT/TRACEABILITY и принят ADR-127.
  Red-first core/Rust: schema/layout/material APIs отсутствовали; дополнительно
  воспроизведены изоляция opacity подписи, отображение title/URL, abort до
  запуска resolver, внутренний radius браузера и неверный shadow radius телефона.
  Логи `artifacts/composition/*-red.log`; затем соответствующие контракты passed.
- `pnpm test`: 161 files / 1487 tests passed (`tests-3.log`). Проверены
  codec v8, нормализация v7, clipboard, EditorCommand/undo/redo, crop/flip/scopes,
  нейтральное создание и production session панели. Поздние targeted проверки
  года, геометрии и renderer allocation фиксируются отдельно в том же каталоге.
- `cargo test --workspace` в указанном Docker: 172 desktop + 1 binary +
  34 storage tests passed; doc-tests passed (`cargo-workspace-final.log`).
  Durable material переживает expiry/history/cache/reopen; удаление записи
  сохраняет preset/document owners, последний owner допускает физический cleanup.
- `pnpm test:render`: 63/65 passed; legacy shape catalogue и 2× shapes превысили
  wall-clock timeout при параллельной сборке. Штатный targeted повтор этих двух
  файлов: 5/5 passed (`render-full.log`, `render-retry.log`), goldens не ослаблены.
  Composition goldens 1×/2× Canvas2D/CanvasKit обновлялись отдельно;
  браузер, телефон, footer/freeform и alpha сравниваются после PNG decode.
  Privacy test сравнивает результат при полной замене цензурированного оригинала:
  blur/card loupe/export/thumbnail одинаковы. Censor композится до downsampling.
- `pnpm exec vitest run --project render-harness
tests/harness/render/composition-crop.test.ts`: passed. Tiny 100×100 crop
  исходной 8K сцены увеличен до 2160×2160; оба PNG декодированы, проверены
  размеры и пиксели выбранной области. Выделение offscreen ограничено crop;
  pixel-sampling effects сохраняют native-before-downsample обработку.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5191 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1
pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition.e2e.ts`:
  1 spec passed (`browser-final.log`). Production mount, neutral → manual browser,
  phone/freeform, handle gesture, card-space arrow; 1280/1024 px, RU/EN × themes.
  После ADR-129: `browser-auto-space-3.log` — passed; без mode controls создание
  на поле/снимке выбирает правильного владельца, card-стрелка перемещается поверх
  снимка. Финальные core/Vue/renderer contracts: 6 files / 19 tests passed
  (`auto-final-unit.log`); header/footer/bands отсутствуют среди starter buttons.
- `pnpm test:perf tests/harness/perf/composition.test.ts`: 2/2 passed;
  4K/500 и 8K/1000 source/layers, 30 warmups/120 samples, idle frames=0.
  Software Canvas2D native-resolution p95 348.46/1791.01 ms; gradient resolver
  105.68/153.08 ms. Это shared-host trend, reference GPU 16.7/33.3 ms pending.
  Существующий 8K/1000 CanvasKit baseline дважды превысил 120 s suite timeout
  при общей CPU нагрузке (`perf-baseline.log`, `perf-reference-retry.log`);
  этот gate не объявляется passed и его бюджеты не изменены.
- Отдельные регрессии по изображениям владельца: browser content не скругляется
  у title bar, outer clip сохраняет нижние углы; screen fill также обрезается
  внешним контуром. Phone shadow использует тот же radius, что корпус,
  в portrait/landscape. Core red→green и обновлённые обоими renderer PNG
  в `render-frame-final.log`; `browser-*.png` и `phone-*.png` осмотрены.

- После замечаний владельца добавлены регрессии: `latest-regressions.log` —
  20 core/Vue tests passed. Window/browser разделяют внешнее clipping;
  `render-window-final.log` — decoded 1×/2× Canvas2D/CanvasKit passed.
- Sticky summary разделов оформления: production wheel прокручивает «Макет»,
  затем «Фон»; заголовки закрепляются под шапкой в пределах своего details,
  закреплённый раздел сворачивается кликом. Chrome 147 / Linux, 1280×700:
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-sticky.e2e.ts`
  — до изменения failed, после passed (`sticky-red.log`, `sticky-green.log`);
  screenshot `artifacts/browser-e2e/composition-sticky-layout.png` осмотрен.
  Native sticky отдельно не перепроверялся; изменение только CSS панели.
- Визуальный выбор заливки: семь buttons с образцами, title/accessible name,
  aria-pressed и видимым названием вместо select; общий CardBackground для фона
  и полос. Production Chrome 147 / Linux, 1024×768, RU/EN × light/dark:
  все семь типов, Tab/Enter, Undo/Redo; повторены gradient drag и sticky scroll.
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-fill.e2e.ts
--spec tests/e2e/specs/browser-composition-gradient.e2e.ts
--spec tests/e2e/specs/browser-composition-sticky.e2e.ts` — 3/3 passed
  (`artifacts/composition/fill-browser.log`). Скриншоты `composition-fill-*.png`
  находятся в `artifacts/browser-e2e/`. Native после этой UI-замены не запускался;
  его сценарий обновлён на кнопки с data-card-fill.
- Compact gradient editor в dock: `compact-red.log` воспроизвёл наложение
  внутренних input на unit; стили native полей теперь ограничены cs-card-input.
  ShapeGradientEditor/SimpleColorPicker имеют opt-in compact, CardGradient его
  включает; палитра 8 колонок, 20 цветов + custom без горизонтального overflow.
  `pnpm test tests/unit/vue/shape-gradient.test.ts
tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/numeric-control.test.ts
tests/unit/vue/composition.test.ts` — 39/39 passed (`compact-component.log`).
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-compact.e2e.ts`
  — passed (`compact-browser-final.log`): production mount, geometry всех полей,
  ввод 55%, 100%, 359°, keyboard по 8 колонкам, custom HEX, RU/EN × themes,
  1024×768, Chrome 147/Linux. Получены четыре composition-compact-*.png;
  RU/dark визуально осмотрен.
  Drag gradient отдельно passed (`compact-browser.log`); сам первый compact-run
  в этом логе failed: WebDriver clearElement несовместим с controlled fields,
  финальный использует штатный trusted select-all helper. Для OS boundary
  включён существующий imageIngress harness; UI/document заранее не создаются.
  Full pnpm typecheck/lint passed; после уточнения browser helper E2E tsc passed
  (`compact-typecheck.log`, `compact-lint.log`, `compact-e2e-types.log`).
  Native/Rust/render/perf для этой UI-правки не перезапускались.
- Номера gradient handles: `point-labels-red.log` воспроизвёл выход text bounds
  за кружок. Общий класс нумерованных ручек убирает padding, центрирует текст,
  задаёт 24 px и 12 px/1 tabular numbers; используется на холсте и в freeform preview.
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-compact.e2e.ts
--spec tests/e2e/specs/browser-composition-gradient.e2e.ts` — 2/2 passed
  (`point-labels-browser.log`), Chrome 147/Linux, 1024×768: text bounds/центрирование
  при углах 0/45/90/180/270/359, numeric bounds, номера 1–16, прежний drag/undo.
  Screenshot `artifacts/browser-e2e/composition-point-labels.png` осмотрен:
  16 читается на холсте и в миниатюре. E2E tsc passed (`point-labels-types.log`).
  Native не повторялся для этой CSS/markup правки.
- Новый редактор подписей: плоский список и один editor без nested details,
  быстрые цвета сохраняют alpha, неактивные блоки не меняются; year refresh только
  для шаблона. `pnpm test tests/unit/vue/branding.test.ts
tests/unit/vue/composition.test.ts` — 5/5 passed (`branding-unit.log`), после
  синхронизации активного блока повторены 2/2 (`branding-unit-final.log`).
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-composition-branding.e2e.ts`
  — production add/text/palette/alpha/backplate/select/delete/undo/redo, 1024×768,
  RU/EN × themes passed (`branding-browser.log`). Финальный визуальный повтор —
  `branding-browser-final.log`, captures composition-signature[s]-*.png.
  Single-signature screenshot осмотрен: текст, font/size, палитра и alignment.
  pnpm typecheck прошёл package/app/Vue tests, затем остановился на параллельно
  изменявшемся browser-text-layout.e2e.ts:112 (TS2554); после исправления той
  рабочей копии E2E tsc и landing tsc passed (`branding-typecheck.log`,
  `branding-e2e-types.log`, `branding-landing-types.log`). Native не повторялся.
- `browser-composition-gradient.e2e.ts`: до исправления handle имел position=static;
  после shared styles и post-drag click guard — passed (`gradient-drag-green.log`).
  Во время удержания pointer меняется preview, committed stops неизменны; release
  сохраняет две точки и одну undo-команду. Unit red выявил второй commit от click,
  retargeted на track; новый pointerdown снова разрешает обычное добавление.
- Native production Quick → Editor → automatic card arrow → material/preset →
  full Copy/decoded PNG → relaunch/restore: 2/2 passed (`native-before-gradient.log`).
  После изменений gradient этот же gate повторён на свежем harness с общим
  browser/WebView pointer helper; его итог — `native.log`.
- Первый нативный Copy gate выявил bitmap=null на X11 без clipboard manager:
  временный arboard handle терял ownership при возврате команды. Owner теперь
  живёт до завершения event loop, native Copy/PNG подтверждены после исправления.
  Reopen spec отдельно исправил неверный combined CSS/text selector.
- Одновременные normal/native frontend builds однажды удалили asset во время
  generate_context. Финальный native запуск использует штатный
  `CUTE_SCREEN_FRONTEND_DIST=/source/artifacts/composition/frontend` и отдельный
  временный frontend config; Cargo target остаётся общим. Копия frontend удаляется
  после проверки. Binary всегда свежий и pin-ится штатным runner, stale binary не использован.

Точный итог native/check/format и disk hygiene —
`artifacts/composition/README.md`. Windows WebView2, macOS WKWebView и reference
GPU runner остаются pending. Native fake capture не доказывает OS capture.

## Панель и размещение градиента (2026-10-20, ADR-128)

Исходный HEAD `e50da83`, общая рабочая копия с параллельной публикационной
карточкой ADR-127. Host Linux x86_64, Node 22.23.1 / pnpm 10.33.2; Chrome 147.
Native gate — штатный Ubuntu 22.04 Docker / WebKitGTK 2.50.4 / Rust 1.97.0,
external tauri-driver, Xvfb/D-Bus. Источники UX — GRADIENT_CONTROLS_RESEARCH.md.

- Red-first `pnpm test packages/editor-core/src/gradient.test.ts --maxWorkers=1`:
  новый placeGradientLayer отсутствовал; затем 8/8 passed (core-red/core-green.log).
- `pnpm test packages/editor-core/src/gradient.test.ts
tests/unit/vue/gradient-backdrop.test.ts tests/unit/vue/shape-gradient.test.ts
tests/unit/vue/keyboard-shortcuts.test.ts tests/unit/vue/app-shell-layout.test.ts
--maxWorkers=1 --testTimeout=15000`: 5 files / 30 passed. Проверены bounds/fill,
  reflection/local origin, guards, no-op/commands/history, popup focus/Escape,
  arrow navigation, Ctrl/Cmd history из placement и прежний dialog guard.
- `CUTE_SCREEN_E2E_DISABLE_WATCH=1 CUTE_SCREEN_BROWSER_E2E_PORT=53147
CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser
--spec tests/e2e/specs/browser-gradient-placement.e2e.ts`: 2/2 passed.
  Все восемь действий с повтором/no-op/undo/redo; geometry и unchanged fill
  проверены после production input. DOM rectangles подтверждают отсутствие
  overlap/overflow и совпадение оси opacity label/field в RU/EN × две темы,
  640/1024 px; screenshots осмотрены.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-gradient.e2e.ts` в общем
  прогоне с новым spec: прежний creation/stops/text/RU/EN suite 1/1 passed.
  Начальный placement spec нашёл реальный Ctrl+Z dialog guard, исправленный
  узким history routing для placement buttons. Одновременный HMR другой задачи
  прервал один mount; финальный прогон использовал штатный disable-watch flag.
- `pnpm test:render tests/harness/render/gradient-backdrop.test.ts --maxWorkers=1`:
  2/2 passed, decoded Canvas2D/CanvasKit crop/alpha/export при 1×/2× без смены goldens.
- Архитектурные первые прогоны выявили нарушения в параллельном composition
  code; локальные helpers/переносы исправляют их без ослабления ratchets.
  Один последующий dependency scan превысил 15 s при общей нагрузке; повтор
  `pnpm test:boundaries --maxWorkers=1 --testTimeout=30000`: 112/112 passed.
- `CUTE_SCREEN_E2E_SCENARIOS=gradient,gradient-reopen TAURI_WEBDRIVER_PORT=4457
CUTE_SCREEN_E2E_DRIVER_PORT=4458 pnpm test:e2e:tauri` в штатном Docker image:
  2/2 passed на свежем debug/no-bundle. Quick → Editor, новый placement popup,
  fit width/stops/text/history, save → relaunch → select restored gradient →
  fit height → undo; independent defaults с тремя stops. Native build ждал
  Cargo lock общей активной сборки; отдельные target/cache не создавались.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed. Исправлены
  type-only import paths и shadow document в параллельных publication specs.
- `pnpm check` запускался последовательно после native. Первые snapshots
  поймали ещё изменявшийся код общей рабочей копии; окончательный результат
  и фактический лог — artifacts/gradient-ux/evidence.json и check-final.log.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`: финальные результаты
  сохранены в том же evidence. Формат JS/TS/Vue не менялся через Prettier override.

Актуальный итог, команды и disk hygiene — `artifacts/gradient-ux/evidence.json`.
Выбранные screenshot и логи хранятся там же. Native capture pixels — fake-platform;
этот gate проверяет WebView, не физический Screenshot backend. Windows/macOS pending.

## Градиентная подложка (2026-10-20, ADR-124/126)

`REQ-TOL-018`. Исходный HEAD `50ae833`, рабочее дерево с параллельной
рукописной линией ADR-125. Host Linux x86_64, Node 22.23.1 / pnpm 10.33.2,
Chrome 147. Native — штатный Ubuntu 22.04 Docker image, Rust 1.97.0,
WebKitGTK 2.50.4 / external tauri-driver 2.1.0 / Xvfb / D-Bus.

- Red-first `pnpm test packages/editor-core/src/gradient.test.ts`: сначала
  отсутствовал модуль; rotation, strict codec и legacy positive-width stroke
  contracts также сначала failed. Логи `artifacts/gradient/*-red.log`.
- Финальный `pnpm test packages/editor-core/src/gradient.test.ts
tests/unit/vue/gradient-backdrop.test.ts tests/unit/vue/shape-gradient.test.ts
tests/unit/vue/app-shell-layout.test.ts --maxWorkers=1 --testTimeout=15000`:
  4 files / 24 passed. Bottom-to-top defaults, stroke-free bounds, codec identity,
  commands/undo/redo, frame fit, Shift в pixel space, независимые preferences,
  preview/cancel/read-only, popup Escape/focus; Quick rail без Gradient и полный rail с ним.
- `pnpm test:render tests/harness/render/gradient-backdrop.test.ts`: 2 passed,
  Canvas2D/CanvasKit, crop и decoded alpha при 1×/2×, preview/export parity.
  Финальный повтор с `CUTE_SCREEN_GRADIENT_SOURCE=artifacts/hand-drawn/screenshot-source.png`
  прошёл 2/2 на настоящем снимке UI; composite PNG осмотрены. Источник не менялся.
- `CUTE_SCREEN_BROWSER_E2E_PORT=53147 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1
pnpm test:e2e:browser --spec tests/e2e/specs/browser-gradient.e2e.ts`: 1 passed;
  создание в Editor, fit, transition/stop, undo/redo, текст и RU/EN × light/dark
  при 1024 px. Caption настроен белым через обычные controls. Скриншоты осмотрены.
- `pnpm test:boundaries --maxWorkers=1 --testTimeout=15000`: 16 files / 112 passed.
  Первые size/complexity failures исправлены выделением helpers без ослабления ratchets.
- Полный `pnpm test --maxWorkers=1 --testTimeout=15000`: повтор 158 files /
  1455 passed. После него уточнено Editor-only availability и добавлен legacy
  stroke contract; финальные затронутые suites прошли 24/24 (см. выше).
- Полный `pnpm test:render --maxWorkers=1 --testTimeout=15000`: 60 passed,
  два тяжёлых catalogue tests превысили собственные 20/30 s при параллельной
  нагрузке. После снижения нагрузки `pnpm test:render
tests/harness/render/golden-shapes.test.ts tests/harness/render/shape-paint.test.ts
--maxWorkers=1`: 2 files / 5 passed без смены goldens/таймаутов; все
  62 renderer scenarios покрыты успешными проверками. Логи render-all/retry.
- Финальный `CUTE_SCREEN_E2E_SCENARIOS=gradient,gradient-reopen
TAURI_WEBDRIVER_PORT=4457 CUTE_SCREEN_E2E_DRIVER_PORT=4458 pnpm test:e2e:tauri`
  в штатном Docker image с D-Bus/Xvfb: 2/2 passed. Свежий debug/no-bundle,
  Quick без Gradient → Editor → создание/fit/transition/stops/history/text →
  autosave → relaunch; identity, редактирование и defaults с тремя stops сохранены; после reopen
  подложка выбрана на холсте, Full height изменяет область и undo её восстанавливает.
  Лог `native-editor-only.log`, выбранные native screenshots и decoded document.
  Предыдущий Quick-creation сценарий заменён после уточнения владельца;
  его text-colour click interception не относится к финальному Editor-only flow.
- `pnpm check` в том же Docker image: passed, включая lint/typecheck,
  format/docs/boundaries, IPC generation guard, Rust fmt и четыре Clippy gates.
  После усиления reopen-теста отдельно прошли `pnpm exec tsc --noEmit -p
tests/e2e/tsconfig.json` и `pnpm exec eslint tests/e2e/specs/tauri-gradient-reopen.e2e.ts`.
- `pnpm format` и `pnpm format:check`: passed. Изменения документации дополнительно
  проверены `pnpm docs:check`. Логи — artifacts/gradient.
- `pnpm dev --host 127.0.0.1 --port 53149 --strictPort`: HTTP 200, smoke остановлен.

Артефакты — `artifacts/gradient/`; итог check/format и дисковая гигиена фиксируются
в evidence.json. Capture pixels native harness — fake-platform; это WebView
input evidence, не системный Screenshot gate. Windows WebView2, macOS WKWebView
и физический Wayland input не проверялись.

## Рукописная линия (2026-10-20, ADR-125)

Исходный HEAD `50ae833`, рабочая копия с параллельной реализацией Gradient.
Frontend: Linux x86_64, Node 22.23.1 / pnpm 10.33.2, Chrome 147. Native:
штатный `cute-screen-ubuntu22-build:local`, Ubuntu 22.04 x86_64 / Rust 1.97.0,
WebKitGTK 2.50.4, Xvfb/D-Bus и external tauri-driver 2.1.0.

- Red-first `hand-drawn-line.test.ts`: 4 failed до реализации. Финальный
  `pnpm test packages/editor-core/src/hand-drawn-line.test.ts
packages/editor-core/src/hand-drawn.test.ts packages/editor-core/src/line.test.ts
tests/unit/vue/line-tool.test.ts`: 4 files / 33 passed. Проверены seeded cubic
  path, endpoints, hit testing, codec/reopen и legacy, style transfer без caps,
  seed получателя, независимые defaults без instance metadata и UI undo.
  После расширения mixed appearance assertions отдельно
  `pnpm test tests/unit/vue/line-tool.test.ts`: 9 passed; одно undo для группы,
  оба instance seeds сохранены.
- Полный `pnpm test --maxWorkers=1 --testTimeout=15000`: 158 files /
  1454 passed. Предыдущий незавершённый запуск получил SIGTERM без итогового
  отчёта и не считался pass.
- `pnpm test:render:update tests/harness/render/hand-drawn-line.test.ts`, затем
  `pnpm test:render tests/harness/render/hand-drawn-line.test.ts
tests/harness/render/hand-drawn.test.ts`: 4 passed. Четыре новых goldens для
  solid/dashed/dotted, толщин 2/5/10, Canvas2D/CanvasKit и decoded PNG 1×/2×.
  Preview совпадает с export 1×; backend delta при пороге 32 меньше 1% каналов.
  `pnpm test:render tests/harness/render/line.test.ts`: 1 passed на 4K UI fixture.
  Browser screenshot и новые goldens визуально осмотрены: одиночный плавный
  штрих, неизменные endpoints и сохранённый пунктир.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5187 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1
pnpm test:e2e:browser --spec tests/e2e/specs/browser-hand-drawn-line.e2e.ts
--spec tests/e2e/specs/browser-line.e2e.ts`: 2 specs / 3 passed. Production
  controls, серийное создание с разными seeds, переключение selection,
  undo/redo и прежние theme/locale/zoom сценарии линии. Отдельный порт нужен,
  поскольку обычный dev server занят другой задачей; первый конфликтный запуск
  не считался pass.

- `CUTE_SCREEN_E2E_SCENARIOS=hand-drawn-line,hand-drawn-line-reopen
pnpm test:e2e:tauri`: оба сценария passed на свежем debug/no-bundle binary.
  Real WebView input создаёт две линии в Quick; Quick → Editor сохраняет
  полные слои, relaunch сохраняет seed/version и отдельные defaults линии.
  Native gate использует fake-platform pixels 400×300; system capture не проверяет.
- Дополнительно production renderers экспортировали линии поверх настоящего
  browser screenshot 1280×761. Команда:
  `TSX_TSCONFIG_PATH=artifacts/hand-drawn-line/review-tsconfig.json node
--import ./node_modules/.pnpm/tsx@4.23.9/node_modules/tsx/dist/loader.mjs
artifacts/hand-drawn-line/review-export.mts`. Четыре PNG повторно декодированы:
  1280×761 / 2560×1522. Canvas2D preview = export 1×; backend delta при пороге
  32: 0.0134% / 0.2224% каналов. SHA-256 original не изменился. Оба backend
  визуально осмотрены.
- `pnpm format`, `pnpm format:check` и `pnpm docs:check` passed. Финальный
  `pnpm check` в штатном Docker image прошёл lint (88 baseline warnings)
  и весь typecheck, включая E2E. Первый typecheck обнаружил неуточнённый тип
  слоя в новом E2E helper; добавлен runtime guard ArrowLayer, повторный
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` passed.
- `pnpm test:render --maxWorkers=1 --testTimeout=15000`: 61 passed, один
  timeout 30 s в существующем catalogue test `shape-paint.test.ts`.
  Отдельный повтор `pnpm test:render tests/harness/render/shape-paint.test.ts
--maxWorkers=1` также превысил 30 s; assertions/goldens не менялись.
  Финальный полный повтор: 60 passed / 2 timeout — тот же catalogue test
  (30 s) и `golden-shapes.test.ts` scale 2 (20 s). Новые line goldens passed;
  общий render gate не считается зелёным.
- `pnpm test:boundaries --testTimeout=15000`: 110 passed / 2 failed.
  В параллельной реализации Gradient превышены file size limits
  EditorWorkspace/canvas-workspace-controller и complexity limits шести
  функций. Новые файлы линии не нарушают ratchets; limits не ослаблялись.
  Финальный `pnpm check` также завершился на этих двух boundary failures
  после успешных lint/typecheck/format/docs; IPC/Rust gates не достигнуты.

Evidence — `artifacts/hand-drawn-line/`. Новых target и зависимостей нет; системный Node и
общие Cargo/driver caches этой задачей не очищались. `pnpm disk:usage`: общий target
41.030 → 41.176 GiB после свежего native build; финальный shared-workspace
аудит — 40.680 GiB. Успешные profiles/pinned binary убраны штатными runner hooks.
Оставшийся Chrome profile первого прерванного запуска удалён после проверки
отсутствия процесса с этим user-data-dir. Активные артефакты другой задачи не удалялись.

## Две незамкнутые обводки и рукописные стрелки (2026-10-20, ADR-123)

Исходный HEAD `65f77b2`, рабочая копия с изменениями. Frontend: Linux x86_64,
Node 22.23.1 / pnpm 10.33.2; native/check: штатный Docker image
`cute-screen-ubuntu22-build:local`, Ubuntu 22.04 x86_64 / Rust 1.97.0,
WebKitGTK 2.50.4, Xvfb. Системный Node 22.21.1 не менялся.

- До реализации два core assertions failed: отсутствовали circling и appearance
  style channel. После референса владельца red-first проверки полного обхода
  и нахлёста дали 2 failed / 9 passed; отдельная проверка расстояния концов
  прямоугольника также сначала failed. Финальный core suite: 12 passed.
- `pnpm test --maxWorkers=1 --testTimeout=15000`: 155 files / 1435 passed.
  После финального выделения shared path types и style helpers отдельно выполнены
  `pnpm test packages/editor-core/src/hand-drawn.test.ts packages/editor-core/src/styles.test.ts
packages/editor-core/src/drawing.test.ts packages/editor-core/src/drawing-preferences.test.ts
tests/unit/vue/arrow-context-toolbar.test.ts tests/unit/vue/shape-context-toolbar.test.ts
tests/unit/vue/canvas-viewport-arrow.test.ts tests/unit/vue/canvas-viewport-tools.test.ts`:
  8 files / 80 passed. Дополнительный core контракт проверяет 72 сочетания:
  длины 8/1800, толщины 1/24, три траектории, все наконечники, поворот 37°,
  конечность координат, bounds и hit testing. Seed/codec/duplicate/resize/history,
  перенос стиля и независимая линия также проверены. Pointer cancellation
  проверен для marker/arrow/shape; resize стрелки использует её endpoint handle.
- `pnpm test:render --maxWorkers=1 --testTimeout=15000`: 19 files / 58 passed.
  Четыре catalogue goldens обновлены для 32 kinds / 33 presets, четыре новых
  hand-drawn goldens покрывают Canvas2D/CanvasKit и decoded PNG 1×/2×.
  Визуально осмотрены оба backend: полный контур, смещённые свободные концы,
  без заливки и вырезанного сектора; дуги и управляемые углы стрелок сохранены.
- `pnpm check` в штатном Docker image: passed, включая lint (88 baseline
  warnings), typecheck, format:check, docs, 112 boundary tests, IPC codegen
  и четыре Clippy feature gates. Архитектурный gate обнаружил цикл типов и
  превышение complexity; исправлены выделением path primitives и helpers,
  ratchets не ослаблялись.
- Browser gate: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser
--spec tests/e2e/specs/browser-hand-drawn.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts`.
  Chrome 147, Linux x86_64: hand-drawn 1/1 passed; catalogue 4/4 passed отдельным
  повтором после исправления старого Undo-ожидания cube → rectangularCircling.
  Проверяются создание
  через палитру, defaults/selection, переключение стрелки, seed, undo/redo,
  весь каталог и RU/EN × light/dark при 1024/1280 px.
- `CUTE_SCREEN_E2E_SCENARIOS=hand-drawn,hand-drawn-reopen pnpm test:e2e:tauri`:
  два passed на свежем debug/no-bundle harness, external tauri-driver 2.1.0 /
  WebKitWebDriver. Реальные WebView handlers создают обе фигуры и стрелку
  в Quick, включая кнопку defaults при компактной рамке. Quick → Editor,
  сохранение payload/seed/version и remembered appearance после relaunch passed.
  Capture pixels — fake-platform 400×300; это WebView evidence, не system capture.
  Embedded driver не доставлял pointer events; обход production handlers не применялся.
- Драйвер собран командой `cargo install tauri-driver --version 2.1.0 --locked
--debug --target-dir /source/target --root /source/artifacts/tauri-e2e/driver-cache`;
  сохранён полезный cache. Native run использует этот bin в PATH, Xvfb/D-Bus,
  bind mount passwd/group и временный HOME uid 1000. Других target не создавали.
- Дополнительный manual render gate на настоящем скриншоте интерфейса Chrome
  1280×761: `TSX_TSCONFIG_PATH=artifacts/hand-drawn/review-tsconfig.json node
--import ./node_modules/.pnpm/tsx@4.23.9/node_modules/tsx/dist/loader.mjs
artifacts/hand-drawn/review-export.mts`. Скрипт использует production renderer
  export routines с raster resource и сохраняет четыре PNG. Полный повторный
  decode: 1280×761 / 2560×1522; исходный SHA-256 не изменился, Canvas2D preview
  совпадает с export 1×. Между backend при пороге 32 отличаются 0% / 0.2852%
  каналов на 1×/2×. Экспорты обоих backend визуально осмотрены.

Первый полный прогон имел два timeout 5 s и старое ожидание последнего элемента
палитры (исправлено). Следующий поймал V8 SIGTRAP в app-arrow-actions: 1432 passed,
три не выполнены; этот запуск не считался pass. Финальные успешные команды выше
не меняют assertions; увеличены timeout и ограничены workers.

Evidence: `artifacts/hand-drawn` — итоговые logs, annotations.png, screenshot source,
четыре decoded exports, screenshot-exports.json и cleanup.json;
`artifacts/browser-e2e/hand-drawn.png`, `artifacts/tauri-e2e/hand-drawn-editor.png`,
`hand-drawn-reopened.png` и два JUnit. Дисковый аудит — disk-at-resume.log / disk-after.log. Изначально target
34.699 GiB / artifacts 4.052 GiB; после задачи target 39.763 GiB / artifacts
4.083 GiB. Удалены семь диагностированных task-owned profiles (371 442 140 bytes);
общий Cargo cache и driver-cache сохранены.
Windows WebView2, macOS WKWebView и физический Wayland capture для этой функции
остаются pending.

## Версия 0.1.7 (2026-10-20)

Исходный HEAD b9e1c54, рабочая копия с bump. Ubuntu 22.04.5 LTS x86_64,
штатный Docker image `cute-screen-ubuntu22-build:local`, Node 22.23.1,
pnpm 10.33.2, Rust 1.97.0. Host Node 22.21.1 отклонён engine guard до
изменения метаданных; команды ниже выполнены в контейнере с bind mount репозитория.

- `pnpm version:bump 0.1.7` синхронизировал пять файлов метаданных.
- `node scripts/release-assets.mjs version . v0.1.7` и
  `cargo metadata --locked --offline --no-deps --format-version 1` — passed.
- `pnpm test:boundaries --maxWorkers=1` — 16 files / 112 tests passed.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.

Изменены версия и документация; runtime/build suites не запускались.

## Встроенный GNOME Screenshot и исчезновение окна (2026-10-20, ADR-122)

Исходный HEAD 2136b7b, рабочая копия с изменениями. Ubuntu 22.04.5 x86_64,
GNOME 42.9 / Wayland, scale 1.25; Node 22.23.1 / pnpm 10.33.2 / Rust 1.97.0
из штатного `cute-screen-ubuntu22-build:local`. Host Node 22.21.1 не менялся.

- Red-first routing без установленного helper и UI-контракт встроенного метода
  сначала failed; после реализации passed. `cargo test --package
cute-screen-desktop --lib --locked`: 172 passed. Четыре относящихся Vue suite
  (`capture-source-settings`, `quick-capture-warmup`, `quick-capture-coordinator`,
  `quick-capture-actions`): 19 passed.
- `pnpm check`: lint (88 baseline warnings), typecheck и format:check passed.
  Docs gate выявил неверный ADR anchor; после исправления отдельно выполнены
  `pnpm docs:check`, `pnpm test:boundaries` (112 passed), `pnpm ipc:check`,
  `pnpm check:rust` (cargo fmt и четыре Clippy feature gates): passed.
  Production frontend не содержит `__cuteScreenE2eQuick`, warmupAt/recordReveal.
- `CUTE_SCREEN_E2E_SCENARIOS=wayland-single-shot,wayland-single-shot-reopen pnpm test:e2e:tauri`:
  два passed без gnome-screenshot в PATH/HOME; затем два passed с явным
  `CUTE_SCREEN_E2E_CAPTURE_METHOD=gnomeScreenshot`. Это свежий штатный debug
  harness, реальный GNOME Screenshot и WebKitGTK, без fake capture.
- Два разных Area drafts, crop=null при новом mount, reset перед warmup,
  overlay hidden до reveal, Busy при параллельном запросе, сохранённый crop
  863×486 полностью декодирован/opaque, выбранный метод сохранился при reopen.
  DOM PointerEvents доставляются в реальные production handlers; физическая
  мышь не является gate этих сценариев (подробности предыдущего раздела ниже).
- Проверка исключения окна сначала failed: 69 317 пурпурных пикселей маркера
  редактора попали в PNG через GNOME fade. GTK roundtrip этого не предотвращает.
  После ожидания остатка 200 мс от фактического hide — 17 фоновых пикселей
  на обоих снимках, и визуально чистый initial frame. Без недавнего hide пауза
  равна нулю; отдельный tray delay сохранён.
- Read-only timing facade: native debug click-to-reveal 1484/1131 мс,
  external helper 2306/1868 мс. Отдельный backend-прототип дал 142–164 мс
  (PNG decode + release 186–223 мс); это не время полного Quick UI.

- `pnpm tauri build --no-bundle --config src-tauri/tauri.dev.conf.json -- --locked`
  в штатном image: passed, оптимизированная сборка с dev identity без пакетов.
  Свежий binary атомарно обновлён в artifacts/linux-dev и запущен штатным
  `bash scripts/run-linux-dev.sh --background`.
- Обычный production CLI `capture --mode screen --json`: при занятом
  org.gnome.Screenshot — Busy / exit 75, владелец и число captures не изменились.
  После освобождения — два captured / exit 0 за 714/1193 мс (весь CLI с
  сохранением, не Area reveal). Сохранённый original повторно декодирован:
  1920×1080 RGBA, alpha 255, backend=gnomeShell. Screenshot D-Bus trace содержит
  false/false и ни одного ScreenCast call; после захвата legacy имя свободно.
  Последний original визуально проверен: затухающего редактора нет.

Runtime container использует реальные Wayland/D-Bus, workspace по одинаковому
абсолютному пути host/container, `TMPDIR=<workspace>/artifacts/mutter-one-shot-2026-10-20/native-tmp`
и отдельный frontendDist. Иначе GNOME вне контейнера пишет PNG в невидимый ему
container /tmp; диагностированный первый failure сохранён, успешный gate
проверяет правильное размещение.

Evidence: `artifacts/mutter-one-shot-2026-10-20`: red/green PNG и pixel counts,
native-no-helper.json, native-helper.json, warmup JSON, Rust/Vue logs,
run-native-e2e.sh и run-native-helper-e2e.sh. Ubuntu 24, KDE, wlroots, ARM64,
другие версии GNOME и mixed-DPI остаются native pending; сохранение portal
на современных desktop подтверждено routing contracts.

## Разовые Wayland-снимки, без sharing indicator (2026-10-20, ADR-121)

Исходный HEAD 54ddab2, рабочая копия с изменениями. Ubuntu 22.04.5 x86_64 /
GNOME 42.9 / Wayland, gnome-screenshot 41.0-2; Screenshot v2, portal 1.14.4.
Rust 1.97.0 / Node 22.23.1 / pnpm 10.33.2 из штатного Ubuntu 22 image.
Host Node 22.21.1 не подходит engine gate: для frontend проверок временно
использовался Node 22.23.1 из image; системная версия не менялась.

- Red-first `cargo test --workspace --locked platform::capture_method`: два
  новых routing assertions failed до реализации. Полный `cargo test --workspace
--locked`: 199 passed (167 desktop, 1 main, 31 storage). После финального
  refactor `cargo test --package cute-screen-desktop --lib --locked`: 167 passed.
- `pnpm test tests/unit/vue/capture-source-settings.test.ts tests/unit/vue/quick-capture-warmup.test.ts tests/unit/vue/quick-capture-coordinator.test.ts tests/unit/vue/quick-capture-actions.test.ts`:
  19 passed. Новый repeated-mount regression сначала failed: в native warmup
  попадал прежний ready document. После reset/nextTick/key/overlay guard — passed.
- `pnpm check`: passed в стандартном Docker image; lint 88 baseline warnings,
  typecheck, formatting, docs, 112 boundary tests, generated IPC и все четыре
  Clippy feature gates. После test-only warmup recorder отдельно проверены
  desktop Vue и E2E TypeScript, component suite и formatting.
- `pnpm build:linux:dev`: свежая debug/no-bundle сборка, без ScreenCast/GStreamer
  capture dependencies. Три standalone gnome-screenshot PNG полностью декодированы:
  1920×1080 RGBA, 1348/1427/1334 мс. Helper установлен отдельно в пользовательский
  каталог, официальный package checksum — helper-install.json; root install отсутствует.
- Production dev CLI `capture --mode screen --json`: captured, exit 0.
  Повторное декодирование сохранённого original — 1920×1080 RGBA. D-Bus monitor
  содержит GNOME Screenshot и не содержит ScreenCast calls.
- `CUTE_SCREEN_E2E_SCENARIOS=wayland-single-shot,wayland-single-shot-reopen pnpm test:e2e:tauri`:
  оба сценария passed в real GNOME/Wayland WebKitGTK, embedded driver. Fake capture
  выключен. Два PNG 1920×1080 получены настоящим helper; два разных production
  drafts с crop=null. После History сохранённый crop 863×486 полностью декодирован
  в WebView, все alpha=255. Повторный старт сохранил явный gnomeScreenshot выбор.
  Read-only test facade перед каждым native warmup записал document=null,
  ready=false, overlay=hidden. Визуально проверены первый и второй initial frames:
  старой рамки нет. Выбранные screenshots и JSON — в evidence.

Native тест использует DOM PointerEvents в настоящем WebView: embedded driver
не доставил drag на Wayland surface. Только pointer capture для синтетического
pointer на время gesture заменён no-op; production pointer handlers, EditorCommand,
PNG source, storage и повторный mount не подменялись. Это не gate физического
ввода мышью/keyboard activation. Rust/renderer/runtime frame assertions и
визуальные screenshots имеют отдельный scope; KDE/wlroots/Ubuntu 24/ARM64/
mixed-DPI на этом host не запускались. Auto для современного GNOME сохраняет
Screenshot portal по unit contract, а не по native Ubuntu 24 evidence.

Runtime container запускается с --network host, --security-opt apparmor=unconfined,
реальными XDG_RUNTIME_DIR/Wayland/D-Bus и read-only helper/schema/libhandy.
Workspace смонтирован и в /source (пути Cargo permission cache), и по тому же
абсолютному host path, который используется как workdir: GNOME Shell пишет
промежуточный PNG снаружи контейнера. CUTE_SCREEN_FRONTEND_DIST — абсолютный
путь <workspace>/artifacts/capture-variants-2026-10-19/frontend. Контейнерная
изоляция и путь /source без host alias ломали helper/permission cache; эти
неуспешные прогоны диагностированы и заменены актуальным успешным комплектом.
Первые локальные quality failures (max-len, ADR anchor, capture function size)
исправлены; итоговый pnpm check passed. Отдельные Cargo targets не создавались.

Evidence: artifacts/capture-variants-2026-10-19 — environment.json, check.log,
rust-tests.log/rust-final.log, vue-red.log/vue-tests.log, native-e2e.log,
wayland-single-shot.json, wayland-warmup.json, JUnit и выбранные PNG. Временный
frontend и диагностированные test profiles удалены после проверки; полезный
Cargo cache сохранён. Общий target вырос с 21.895 до 33.577 GiB после сборок и
четырёх Clippy feature gates; artifacts — с 3.904 до 3.908 GiB. Размеры и cleanup —
storage-before.json, storage-after.log и cleanup.json.

## Загрузки лендинга v0.1.6 (2026-10-19)

`REQ-WEB-006/007`. Исходный HEAD `f81426b`, Windows 10 x64 (19045),
Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.80. `git pull --ff-only`
подтвердил актуальный main. Локальный snapshot обновлён с v0.1.5 до v0.1.6;
test fixture использует версию snapshot, чтобы следующее обновление не требовало
ручной замены номера в helper.

- `node scripts/landing-release.mjs apps/landing/assets/release.json` — passed,
  live API выбрал полный stable v0.1.6, семь установщиков и SHA256SUMS.
- `pnpm test:boundaries` — 16 files, 111 passed / 1 skipped.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_LANDING_E2E_PORT=5321 pnpm test:e2e:landing`
  — build passed, 6 passed / 1 intentional no-JS skip.
- Та же команда с `CUTE_SCREEN_LANDING_NO_JS=1` — build passed,
  5 passed / 2 intentional JS-only skips. RU/EN, пять ширин 375–1440 px,
  семь точных ссылок, keyboard focus и рекомендации ОС/архитектуры.
- `pnpm exec eslint tests/boundaries/landing-downloads.test.ts` и
  `pnpm exec tsc --noEmit -p apps/landing/tsconfig.json` — passed.
- Hosted Pages run [39242048304](https://github.com/VladimirIvanin/cute-screen/actions/runs/39242048304)
  уже завершился success для `f81426b`. Повторный HTTP GET RU и EN подтвердил
  семь установщиков v0.1.6, release/checksums и отсутствие v0.1.5.
  Повторная публикация не требовалась.

Логи и hosted JSON — `artifacts/landing-v0.1.6/`; screenshots —
`artifacts/landing-e2e/{js,no-js}/`. Просмотрены RU 1440 px и EN 375 px
download screenshots: версия, колонки, текст и focus читаемы, overflow нет.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check`
— passed. Полный `pnpm check`, Rust и native WebView не запускались:
изменены только snapshot, boundary fixture и документация.

## Единая иконка толщины линии (2026-10-19)

Исходный HEAD `85aae8c`; Linux 6.8.0-138-generic x86_64, Node 22.23.1,
pnpm 10.33.2, headless Chrome/ChromeDriver 147.0.7727.101. Общий `strokeWidth`
заменяет одиночный штрих в controls стрелки/линии, фигуры и выноски;
линейка использует тот же источник. Изменена только презентация controls.

- `pnpm test` с фильтрами `tests/unit/vue/{ui-icon,arrow-context-toolbar,line-tool,shape-context-toolbar,callout-toolbar,ruler-toolbar,tool-formatting-toolbar}.test.ts`
  — 7 files / 154 passed; focus, Escape, mixed, disabled и изменение значений.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-m06-arrow-tools.e2e.ts --spec tests/e2e/specs/browser-line.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts`
  с `--mochaOpts.grep 'shows all five arrow controls|keeps settings and visible lines|edits paint and history|keeps editing and width controls'`
  — линия, фигура и выноска passed; стрелка достигла default timeout 30 s.
  Повтор только arrow spec с `--mochaOpts.grep 'shows all five arrow controls' --mochaOpts.timeout 120000`
  — 1/1 passed. Итого четыре выбранных сценария прошли.
  RU/EN × light/dark, 1024 px; линия/выноска также 50/100/200%.
  Просмотрены screenshots стрелки, линии, фигуры и выноски.
- Browser env: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`,
  `CUTE_SCREEN_BROWSER_E2E_PORT=5193`,
  `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt`.
  Первый запуск без системного CA bundle завершился до тестов с
  `SELF_SIGNED_CERT_IN_CHAIN`; TLS verification не отключалась.
- `pnpm lint` — exit 0, 85 warnings без errors; `pnpm typecheck` — passed.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`
  — passed. Логи, JUnit и выбранные screenshots — `artifacts/stroke-width-icon/`.

Native WebView и полный `pnpm check` в этой UI-правке не запускались;
Rust, IPC, scene graph и export не изменены. Отдельные Cargo targets не создавались;
shared cache сохранён. Временные Chrome profiles удалены штатным afterSession.

## Cross-platform test build BMP preview (2026-10-19)

`REQ-REL-001/002/003`. Исходный HEAD `2cc0336`.
Приложенный Windows CI log до исправления: `E0432`, `x11.rs` не может
импортировать `platform::preview`, скрытый Linux-only `cfg`.
X11 adapter намеренно компилируется с `cfg(test)` на всех ОС; pure-Rust BMP
helpers теперь имеют ту же доступность. GTK decoder test остаётся Linux-only.
Существующие `area_quick_preview_uses_a_memory_owned_top_down_bmp` и
`standard_xrgb32_encodes_directly_as_opaque_top_down_bmp` проверяют оба пути.

Локальная проверка: Linux 6.8.0-138-generic x86_64, Ubuntu 22.04 Docker image
`cute-screen-ubuntu22-build:local`, Rust 1.97.0, shared workspace `target/` и
Cargo cache. Node 22.23.1 / pnpm 10.33.2. Команды Rust запускаются через
тот же Docker invocation, что ниже в разделе ADR-120; логи находятся в
`artifacts/preview-cfg-fix/`.

- `cargo check --workspace --all-targets --locked` — passed.
- `cargo test --workspace --locked` — 198 passed: desktop 166, main 1,
  storage 31. Оба X11 BMP tests и full-resolution GTK decoder test прошли.
- `cargo fmt --all`, `pnpm format`, `pnpm format:check`, `pnpm docs:check`
  и `git diff --check` — passed.
- `pnpm disk:usage`: target 21.734 → 21.895 GiB, artifacts 0.437 GiB.
  Общий Cargo cache сохранён; отдельные targets не создавались.

Windows/macOS hosts и toolchains здесь недоступны; повтор compile matrix CI
остаётся необходимым подтверждением исходной Windows ошибки. Runtime capture,
платформенные capabilities и принятые ADR не меняются.

## Закрытие первого Wayland permission dialog (2026-10-19, ADR-120)

Ubuntu 22.04.5 x64 / GNOME Wayland; исходный HEAD `1f1008c`, реализация
и тесты вошли в `4925c12` во время проверки. Rust 1.97.0 выполняется в штатном
`cute-screen-ubuntu22-build:local`, с shared workspace `target/` и Cargo cache;
host development libraries отсутствуют. Node 22.23.1 / pnpm 10.33.2.

- До реализации: `cargo test --package cute-screen-desktop --lib --locked
linux_screencast::tests` — 5 passed / 2 expected failures: первый capture
  и reselect не ждали исчезновения диалога. `rust-before.log`.
- После реализации: `cargo test --package cute-screen-desktop --lib --locked`
  — 166 passed. Финальные regressions измеряют паузу от момента получения
  успешного ответа, cached future готов сразу даже с pending opener,
  cancel/permissionDenied тоже готовы сразу и сохраняют старую сессию.
  `rust-verified.log`.
- `cargo clippy --package cute-screen-desktop --lib --tests --locked -- -D warnings`
  — passed. `cargo fmt --all` — выполнен.
- `pnpm build:linux:dev` — passed. Обновлён
  `artifacts/linux-dev/cute-screen-dev`; `--version` возвращает 0.1.6,
  `ldd` не содержит missing libraries. SHA-256 — `dev-sha256.txt`.
- `pnpm docs:check`, `pnpm format`, `pnpm format:check` — passed.
- `pnpm disk:usage`: target 21.727 → 21.729 GiB, artifacts 0.437 GiB.
  Полезный общий cache сохранён; отдельные targets/profiles не создавались.

Docker invocation для Rust: `docker run --rm --user "$(id -u):$(id -g)"
--env CARGO_HOME=/build/cargo --env CARGO_BUILD_JOBS=4
--volume "$PWD:/source" --volume "$HOME/.cargo:/build/cargo" --workdir /source
cute-screen-ubuntu22-build:local`, затем перечисленные cargo commands.
Логи — `artifacts/wayland-consent-settle/`.

Пауза 350 мс применяется после новой авторизации/смены монитора перед
открытием PipeWire consumer. Unit tests проверяют порядок и отсутствие
повторной паузы; это не визуальное подтверждение отсутствия permission dialog.
Первый/повторный Area/Screen и немедленный capture после Settings reselect
на настоящем desktop остаются pending; установленный процесс использует
свою прежнюю сборку. KDE/wlroots/ARM64 этим прогоном не проверены.

## GStreamer/libunwind в Jammy CI (2026-10-19)

`REQ-REL-001/005`. Исходный HEAD `1f1008c8322359bf79f691fcd8e36bab414dcbc1`.
Host Linux x86_64; одноразовый Docker container
`cute-screen-ubuntu22-build:local` (Ubuntu 22.04 x64).
Node 22.23.1 из `/tmp/cute-screen-portal-research/node-v22.23.1-linux-x64/bin`,
pnpm 10.33.2. Host Node 22.21.1 сначала отклонён engine check;
затем команды выполнены с нужным Node в PATH.

В контейнере выполнены `apt-get update -qq` и
`apt-get install -y --no-install-recommends libc++-dev libc++abi-dev sudo`.
Это устанавливает LLVM `libunwind-14-dev` 1:14.0.0-1ubuntu1.1.
Исходный `apt-get -s install --no-install-recommends` с полным набором пакетов
из ARM64 compile job воспроизводит ровно
`libgstreamer1.0-dev : Depends: libunwind-dev` и exit 100.
Затем readonly-mounted production script запущен командой:

```sh
bash /tmp/install-deps.sh \
  build-essential curl file libayatana-appindicator3-dev librsvg2-dev \
  libssl-dev libwebkit2gtk-4.1-dev libxdo-dev wget xdg-utils \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev gstreamer1.0-pipewire
```

Исправленный installer завершился с exit 0 с первой попытки. Apt заменил
`libunwind-14-dev`, удалив зависящие `libc++-dev`/`libc++-14-dev`;
`libunwind8` сохранён. Установлены Ubuntu `libunwind-dev` 1.3.2-2build2.1,
GStreamer core dev 1.20.3 и plugins-base dev 1.20.1.
`pkg-config --modversion gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0`
возвращает 1.20.3 / 1.20.1 / 1.20.1.
Повторный `bash /tmp/install-deps.sh libgstreamer1.0-dev
libgstreamer-plugins-base1.0-dev gstreamer1.0-pipewire` — exit 0,
без установки/удаления пакетов. Контейнер удалён через `docker run --rm`.

- `bash -n scripts/ci-install-linux-tauri-deps.sh`: passed.
- `pnpm test:boundaries`: 16 files / 112 tests passed.
- `pnpm docs:check`, `pnpm format`, `pnpm format:check`: passed.

Логи — `artifacts/ci-jammy-libunwind/`. До/после: target 21.727 GiB,
artifacts 0.437 GiB; Cargo cache и profiles не менялись. Нового target нет.
Полный `pnpm check`, app build и UI/native suites не запускались:
изменены только apt installer и документация. Hosted ARM64 build/runtime
не проверены; нужен новый CI run. Ubuntu baseline, product behavior и ADR
не меняются. Конфликт пакетов описан в
[Ubuntu bug 1989124](https://lists.ubuntu.com/archives/ubuntu-openstack-bugs/2022-September/029754.html).

## Регрессии тестов после смены defaults (2026-10-19, ADR-116)

Windows 10 x64 / Chrome 155.0.8059.80, Node 22.23.1, pnpm 10.33.2.
Начальный HEAD `befc429`; финальные проверки исходников — `819412b`.
Изменены tests и четыре shape-catalogue PNG, production defaults сохранены.
Ожидания сохранённых объектов 3 px оставлены; восстановление preferences
проверяется выбором 6 px вместо начальных 8 px. Numeric rotation учитывает
stroke 4 px, mixed-line undo возвращает 4/7 px. В production-parent selection
сценарии снятие выделения идёт нажатием по фону: bounds стрелки 8 px покрывают
малый fixture canvas. Browser defaults используют постоянную toolbar;
один Escape закрывает вложенную панель и сохраняет активную стрелку.

- Первый `pnpm test`: 153 files / 1376 tests, шесть failures в четырёх Vue
  файлах; исправлены ожидания labels, mixed undo и пустой области.
  Прогон начат до правок, более поздние файлы уже читали обновлённые tests.
- Финальный `pnpm test`: 153 files / 1376 tests passed, 357,98 s;
  `artifacts/defaults-test-regressions/test-final.log`.
- `pnpm test:render`: до обновления goldens два ожидаемых failures каталога
  фигур; после обновления — 18 files / 52 tests passed. Canvas2D/CanvasKit
  PNG при scale 1/2 просмотрены; export повторно декодируется тестами.
- `$env:CUTE_SCREEN_UPDATE_GOLDENS='1'; pnpm test:render tests/harness/render/golden-shapes.test.ts`
  — 3 passed; обновлены только четыре PNG каталога фигур. Финальный обычный
  `pnpm test:render` выполнялся без update-переменной.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-lifecycle.e2e.ts --spec tests/e2e/specs/browser-tool-ux.e2e.ts --spec tests/e2e/specs/browser-m06-arrow-tools.e2e.ts --spec tests/e2e/specs/browser-line.e2e.ts`
  — lifecycle 2/2, arrow tools 4/4, line 2/2 passed; tool UX изначально выявил
  старый popover contract. После исправления отдельный запуск
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-ux.e2e.ts` — 5/5
  passed. Всего 13 browser-сценариев passed, RU/EN, light/dark, layout,
  native browser pointer/keyboard, preferences/reload и undo/redo.
- `pnpm lint`: passed, прежние 85 warnings. `pnpm typecheck` и
  `pnpm docs:check`: passed.
- `pnpm test:boundaries`: 111 passed / 1 skipped, 16 files.
- `pnpm format` и `pnpm format:check`: passed.

`pnpm disk:usage` во время финальных проверок и после них: target
24,798 → 24,798 GiB, artifacts 11,719 → 11,719 GiB. Временных Chrome profiles
после E2E нет. Промежуточные диагностические логи задачи удалены; полезные
build caches сохранены. Inventory — `disk.log` и `disk-final.log` в каталоге задачи.

Логи — `artifacts/defaults-test-regressions/`; browser screenshots/JUnit —
`artifacts/browser-e2e/`, lifecycle PNG — `artifacts/tool-lifecycle/`.
Native Tauri, Rust, capture backends и performance suite не запускались:
production implementation не изменена, новых native/platform claims нет.

## Windows GUI, Area и версия 0.1.6 (2026-10-18–19, ADR-115)

Windows 10 build 19045 x64, один экран 1920×1080 / DPR 1,
WebView2 и EdgeDriver 155.0.4283.62; Node 22.23.1, pnpm 10.33.2,
Rust 1.97.0. Исходники вошли в `7856504`; следующие изменения уточняют evidence.
Native сценарии запускались последовательно штатным `pnpm test:e2e:tauri`
с `CARGO_TARGET_DIR=target/e2e-isolated`, external provider и свежим debug harness.

До исправления физические нажатия на y=0/1 и в верхнем левом углу
не доходили до WebView; y=8 работал. Над WebView оставалось
`TAURI_DRAG_RESIZE_BORDERS`. EdgeDriver pointer actions обходили перехват,
даже с isTrusted=true. Новая регрессия использует SetCursorPos/mouse_event
и Escape через системный ввод; DOM служит только наблюдателем.

| Проверка                                                                                                              | Результат / evidence                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CUTE_SCREEN_E2E_SCENARIOS=windows-area-edges pnpm test:e2e:tauri`                                                    | Passed: четыре края, четыре угла, полный экран, Escape во время drag, повтор. `artifacts/windows-audit/edges-final.log`, `artifacts/tauri-e2e/windows-area-edges.json` и screenshots                                        |
| Quick chrome                                                                                                          | 7/7 passed, `artifacts/windows-audit/e2e.log`                                                                                                                                                                               |
| Quick Editor handoff                                                                                                  | Passed после исправления координат самой проверки; тот же log                                                                                                                                                               |
| Windows capture exclusion                                                                                             | Passed после восстановления topmost фоновой fixture; `artifacts/windows-audit/e2e-retry.log`                                                                                                                                |
| `cargo test --offline --workspace`                                                                                    | 180 passed, один interactive ignored; `artifacts/windows-audit/rust-workspace.log`                                                                                                                                          |
| Boundary executable/version/release assets                                                                            | 35/35 passed; `artifacts/windows-audit/release-contracts.log`                                                                                                                                                               |
| `pnpm version:bump 0.1.6`                                                                                             | package/Tauri/Cargo/Cargo.lock согласованы; release/tag/publish не выполнялись                                                                                                                                              |
| `pnpm.cmd tauri build --bundles nsis -- --locked`                                                                     | Passed; `artifacts/windows-audit/release-0.1.6.log`                                                                                                                                                                         |
| PE subsystem и `--startup-check`                                                                                      | Subsystem 2 / exit 0 у release и установленного executable                                                                                                                                                                  |
| NSIS `/S /UPDATE`, затем `/S`                                                                                         | Exit 0; обычная установка восстановила старый пустой ярлык, который update mode намеренно сохраняет                                                                                                                         |
| Установленный release: executable, Start Menu shortcut через ShellExecute, `--background`, foreground single-instance | Passed; отсутствие консоли проверено AttachConsole → ERROR_INVALID_HANDLE (6). Background не показывает основное окно; повторный запуск показывает окно того же PID. `artifacts/windows-audit/installed-startup-0.1.6.json` |

Два прежних pixel failures были дефектами проверки: handoff сравнивал
supersampled preview buffer с document coordinates, а WinForms fixture имела
TopMost=true без WS_EX_TOPMOST. Исправлены преобразование координат и native
topmost fixture; проверки пикселей/undo/redo сохранены.
Установленный executable отличается от root build только тремя байтами
штатного Tauri bundle marker `UNK` → `NSS`; остальное сравнивается побайтно.

Installer `target/release/bundle/nsis/Cute Screen_0.1.6_x64-setup.exe`, SHA-256:
`EA736A7B83A9F522D6B2088A60E07FE8B3ED4A6261469E192E6038EADF5906E1`.
Подпись отсутствует. PRO32 ID700022 на старом установщике 0.1.5 подтверждён
скриншотом пользователя; причина и результат проверки новой сборки неизвестны.
Карантин/настройки антивируса не менялись, внешняя отправка не выполнялась.

Windows 11, ARM64, несколько мониторов, mixed-DPI, HDR и RDP/смена дисплея
остаются pending. macOS/Linux native runtime этим Windows-прогоном не закрыт.
DXGI timeout → frame и Rotation 180° проверены unit-тестами, физические
повороты монитора здесь не проверялись. Windows/macOS отвергают публичные
capture/help/version; служебные startup/background/settings args сохранены.

При проверке Rust после перезапуска среды обнаружены corrupt .rmeta (E0786)
в `target/e2e-isolated`. После dry-run очищены только пакеты с доказанным
повреждением (1520 файлов / 594,8 MiB и 157 / 12,4 MiB). Затем инвентаризация
нашла ещё 122 .rmeta с нулевым заголовком; очищены outputs соответствующих
пакетов (3926 файлов / 1,4 GiB). Дополнительно восстановлены повреждённые
PDB двух macro-пакетов (72 файла / 35,1 MiB) и percent-encoding
(27 файлов / 933,2 KiB). Остальной cache сохранён.
`pnpm install --frozen-lockfile` применил уже зафиксированный Vitest patch;
после синхронизации полный boundary suite прошёл: 111 passed, один skipped.
Итоговый `pnpm check` на 0.1.6 целиком passed: lint, typecheck,
format:check, docs:check, boundaries, IPC и четыре Clippy-конфигурации.
Лог — `artifacts/windows-audit/check-verified-0.1.6.log`.
Повторный `cargo test --offline --workspace` на 0.1.6: 180 passed,
один interactive ignored; `artifacts/windows-audit/rust-workspace-0.1.6.log`.
`pnpm format`, `cargo fmt --all` и финальный `pnpm format:check` выполнены.
Диск до/после тяжёлой проверки: target 17,223 → 24,445 GiB,
artifacts 11,718 → 11,718 GiB. Рост — сохранённый build cache и NSIS output;
`artifacts/windows-audit/disk-before-release.log` и `disk-completed.log`.
Рекурсивное удаление завершённых диагностических профилей отклонено
автоматической проверкой разрешений (`blocked by policy`); эти профили оставлены.

## Wayland ScreenCast и dev desktop (2026-10-19, ADR-118/119)

Ubuntu 22.04.5 x64 / GNOME 42.9 / Wayland; portal 1.14.4, GNOME backend
42.1, Screenshot v2, ScreenCast v4, pipewiresrc 0.3.48. Ветка
`codex/fix-wayland-portal-timeout` перебазирована на `origin/main` (`fd23862`); rebase сохранил upstream тесты, goldens и evidence.
Полный check выполнен перед последним rebase; между 819412b и fd23862 изменились
только docs, production sources сборки совпадают.
Node 22.23.1, pnpm 10.33.2, Rust 1.97.0. Host GTK development packages
отсутствуют; Rust/check/native build выполняются в штатном Ubuntu 22.04 Docker
с рабочим деревом `/source`, shared Cargo registry/target и UID 1000.

Regression tests добавлены до реализации. Первый host запуск
`cargo test --workspace screenshot_response --locked` остановился до tests
на отсутствии GLib/GTK/WebKit development packages; наблюдаемый red test
этим запуском не подтверждён. Системные development packages не устанавливались.

До ADR-118 владелец проверил Screenshot-only dev: GNOME каждый раз просит
доступ, preview размыт. После ScreenCast + native Wayland dev он выполнил
повторный Area capture и подтвердил: «Повторного запроса нет, качество хорошее».
`/proc/<pid>/environ` подтвердил GDK_BACKEND=wayland. Затем владелец сообщил
задержку перед выделением на каждом capture. ADR-119 убирает PNG compression
и disk staging до selection; в новой сборке владелец подтвердил: выделение заметно быстрее; Settings
открывает выбор монитора, после отмены capture продолжает работать.

Проверки до последнего native прогона:

- `cargo test --workspace --locked` — итоговый прогон: 164 desktop + 1 main +
  31 storage = 196 passed. После ребейза Rust sources не менялись. Отдельный `cargo test --package cute-screen-desktop --lib --locked`
  — 164 passed: reselect cancel сохраняет сессию, reuse не авторизуется повторно,
  GNOME stable binding переживает reopen/cleanup, native BMP 2560×1440 повторно
  декодирован GdkPixbuf с сравнением каждого RGB pixel. PNG round-trip также
  сравнивает все pixels, stride/truncation/overflow и capability gates проверены.
- `pnpm test tests/unit/vue/capture-source-settings.test.ts tests/unit/vue/quick-capture-source.test.ts`
  — 2 files / 11 passed: unsupported hidden, pending, cancel, busy и retry.
- Ранее focused Quick source/coordinator/canvas/actions — 4 files / 32 passed;
  `pnpm test:boundaries` — 16 files / 112 passed.
- `pnpm check` для ADR-118 целиком passed, включая Clippy configurations.
  Итоговый прогон после ADR-119 целиком passed: lint/typecheck/format/docs,
  112 boundary checks, IPC codegen и четыре Clippy configurations. Clippy
  сначала обнаружил signed casts в новом BMP regression test; заменены
  проверяемыми conversions без изменения production поведения.
  Лог: `artifacts/linux-dev/verification/check-verified.log`.
- `pnpm build:linux:dev` после ADR-119 и ребейза — passed; executable
  `artifacts/linux-dev/cute-screen-dev`, версия 0.1.6, `ldd` без missing libraries.
  Dev identifier/library и activation socket отделены от установленной версии.

На host обнаружена GNOME stable binding к `/usr/bin/cute-screen` 0.1.5;
production preferences содержали Ctrl+Shift+2, dev preferences — пустые bindings.
Удалена только проверенная managed binding с этим executable, backup:
`artifacts/linux-dev/verification/removed-installed-shortcuts.json`.
Пакет автоматически не удалён: по просьбе владельца pkexec отменён,
предоставлена команда `sudo apt remove cute-screen`. Последующая проверка
`dpkg-query` подтвердила отсутствие установленного пакета.
GNOME capability теперь учитывает GSettings backend и не показывает ложный
unavailable fallback. Повторное назначение в Dev подтверждено чтением GSettings и preferences;
настоящий restart этого сочетания ещё pending.

Новая dev-сборка запущена, PID 150850, GDK_BACKEND=wayland. Повторные реальные
captures в этом процессе: authorization 0/5 ms, raw frame 52/169 ms, staging
593/824 ms от начала backend. Это не end-to-end latency до видимого выделения.
SHA-256 binary и ldd записаны в `dev-build.json` и `ldd-final.txt`; отсутствующих
shared libraries нет. Владелец подтвердил ускорение и Settings cancel. После повторного назначения
пользователь сообщил «вроде заработало»; прочитаны stable GNOME Capture Area
Ctrl+Shift+2 с command на dev executable и такой же binding в SQLite preferences.
Evidence: `gnome-binding-final.json`. Воспроизведение потери подтверждённого
stable binding и настоящий restart пока не подтверждены.

Логи — `artifacts/linux-dev/verification/`. KDE/wlroots, mixed-DPI,
Windows/macOS runtime и AppImage на чистой системе этим прогоном не проверены.
Unit/component checks не заменяют production WebView capture acceptance.

## Стартовая толщина линий (2026-10-18, ADR-116)

Windows x64, HEAD `3304e55` с рабочими изменениями. До реализации новые
factory assertions дали ожидаемые failures: arrow/line/shape/pencil ещё 3 px,
loupe border ещё 3 px. После изменения:

- `pnpm test packages/editor-core/src` — 49 files, 441 tests passed.
  Ожидания hit margin, mixed styles и fallback preferences обновлены под новые defaults.
- `pnpm test packages/editor-core/src/drawing.test.ts packages/editor-core/src/precision-contracts.test.ts tests/unit/vue/canvas-viewport-tools.test.ts tests/unit/vue/arrow-context-toolbar.test.ts tests/unit/vue/shape-context-toolbar.test.ts tests/unit/vue/m08-precision-drawing.test.ts tests/unit/vue/m08-precision-settings.test.ts`
  — 7 files, 73 tests passed.
- `pnpm lint` — passed, 85 warnings вне изменённых файлов.
- `pnpm docs:check` — passed.
- `pnpm typecheck` — package/frontend checks прошли; tests/e2e остановился на
  `tauri-windows-area-edges.e2e.ts:54`, TS2554 (Expected 1 arguments, but got 2).
  Файл уже имел сторонние рабочие изменения до этой задачи; он не изменялся.
- `pnpm format` и `pnpm format:check` — passed.

Rust/native runtime не запускались: изменены только общие defaults и их tests;
native capture/platform pass не заявляется.

## Дисковая гигиена разработки (2026-10-18, ADR-114)

Windows 10 Home x64 10.0.19045, Chrome 155.0.8059.80, Node 22.23.1,
pnpm 10.33.2, Rust 1.97.0; HEAD `3304e55` с рабочими изменениями.
Параллельно другая задача меняет Windows capture/startup и создаёт
`target/e2e-isolated`; её исходники и активный target сохранены.

Логический размер до/после (GiB, снимки при параллельной разработке):

| Каталог                     | До      | После   |
| --------------------------- | ------- | ------- |
| target                      | 159,961 | 7,378   |
| artifacts                   | 91,941  | 11,528  |
| artifacts/browser-e2e       | 42,058  | 0,029   |
| artifacts/tauri-e2e/runtime | 13,118  | около 7 |

До уточнения владельца `cargo clean --profile dev --target-dir D:\cutescreen\target`
после `--dry-run` удалил 69735 файлов / 103,7 GiB. В момент старта активная
компиляция завершилась, установленное приложение из AppData оставлено запущенным.
После уточнения общий полезный Cargo/incremental cache больше не очищается;
эксперимент с dev profile полностью убран, `Cargo.toml` не имеет diff.
Следующие сборки восстановят очищенный основной cache.

Штатным `cargo clean --target-dir <проверенный абсолютный путь>` удалены восемь
заброшенных отдельных targets: `target/{emoji-e2e,highlighter-e2e,quick-history-e2e,
shape-catalog-native,tray-locale-e2e}` и
`artifacts/{callout-target,ci-zip-target,window-capture-target}`.
`pnpm clean:artifacts` затем `pnpm clean:artifacts --apply` удалили 622 временных
каталога / 48,481 GiB: старые Chrome profiles, pin binary и frontend configs.
Перед удалением проверены canonical paths, tracked files и активные процессы.
После очистки dry-run: 0 каталогов / 0 GiB. Reports/screenshots, failed appData,
driver-cache, release output, исходники, fixtures, `.git` и пользовательская
библиотека сохранены. Free space D: вырос примерно с 28,9 до 224 GiB;
около 195 GiB фактически освобождено, с поправкой на параллельные записи.
Логические размеры учитывают hardlinks иначе, чем свободные блоки диска.

Проверки:

- `pnpm exec vitest run --project boundaries tests/boundaries/workspace-storage.test.ts`
  — 3 passed: независимые worker profiles, сохранение failure evidence,
  отказ от внешнего profile и отсутствие перехода по junction при измерении.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-foundation.e2e.ts`
  — 1 passed; после закрытия session её Chrome profile отсутствует.
- `cargo test --offline --locked --package cute-screen-storage` — 30 passed;
  Cargo metadata с `--locked --offline --no-deps` и `cargo fmt --all --check` — passed.
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` — passed.
- `pnpm lint` — 0 errors, 85 warnings в существующем workspace;
  ESLint по изменённым storage/E2E файлам — passed без warnings.
- `node --check scripts/workspace-storage.mjs` и
  `node --check scripts/run-tauri-e2e.mjs` — passed.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check` — passed.

Общие проверки не полностью зелёные: `pnpm test:boundaries` дал 110 passed,
1 skipped и 1 failed в `vitest-worker-diagnostics.test.ts`: worker-exit output
не содержит ожидаемый `code: 23`. `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
останавливается на параллельно добавленном `tauri-windows-area-edges.e2e.ts`
(TS2554, вызов с двумя аргументами вместо одного). Эти файлы не исправлялись
в рамках очистки. Полные `pnpm check`, native E2E, render/perf и platform builds
в этой задаче не запускались. Native pin/config cleanup проверен синтаксически;
новый real-WebView pass этим аудитом не заявляется.

Артефакты: `artifacts/storage-clean-preview.log`, `storage-clean-applied.log`,
`storage-after.tsv`, `storage-format.log`, `storage-format-check.log`,
`storage-lint.log`, `storage-boundaries.log`, `storage-cargo-metadata.json`.
Официальные рекомендации и команды — BUILD_RELEASE.md; обязательный процесс — AGENTS.md.

## Загрузки лендинга (2026-10-18, ADR-113)

Ubuntu 24.04.5 x86_64, Linux 6.8.0-147-generic, Node 22.23.1, pnpm 10.33.2,
Chrome 154.0.8037.57. REQ-WEB-005/006/007: snapshot v0.1.5 содержит семь
установщиков и SHA256SUMS; локальная сборка не требует сети. Проверки:

- `pnpm check` — passed: lint, desktop/tests/landing typecheck, formatting,
  docs links, 107 boundary tests, IPC generation check, Rust fmt и четыре Clippy profiles.
- `pnpm format` и `pnpm format:check` — passed; `git diff --check` — passed.
- `pnpm test:boundaries` — 14 files / 107 tests passed, включая 25 новых
  сценария ОС/архитектуры, denied/missing hints, mobile/iPad/ChromeOS/32-bit,
  SemVer, draft/prerelease/incomplete assets, API pagination/failure.
- `pnpm exec vitest run --project boundaries tests/boundaries/landing-downloads.test.ts --coverage --coverage.include=scripts/landing-release.mjs --coverage.include=apps/landing/assets/download-platform.ts --coverage.include=apps/landing/downloads-html.ts --coverage.reportsDirectory=artifacts/landing-downloads/coverage`
  — 25 passed; statements 92.72%, branches 95.57%, functions 100%.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:landing` — 6 passed,
  1 intentional no-JS skip; RU/EN, пять ширин 375/760/768/1024/1440,
  production recommendations x64/ARM64/universal, UA fallback без Client Hints, denial/unknown/32-bit,
  seven exact URLs, icons, anchor and keyboard focus.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_LANDING_NO_JS=1 CUTE_SCREEN_LANDING_E2E_PORT=5177 pnpm test:e2e:landing`
  — 5 passed, 2 intentional JS-only skips. Все ссылки работают без JS.
- `node scripts/landing-release.mjs artifacts/landing-downloads/live-release.json`
  — live GitHub API выбрал v0.1.5, 7 installers; build uses validated snapshot.
- `artifacts/landing-downloads/actionlint .github/workflows/deploy-pages.yml`
  — passed (actionlint 1.7.12).

Логи: `artifacts/landing-downloads/`. Production preview просмотрен интерактивно:
RU/EN desktop 1440×950, RU mobile 375×950, hero и download anchor, Linux links,
release/checksums/footer. Screenshots `hero-ru-{desktop,mobile}.png`,
`downloads-{ru,en}-desktop.png`, `downloads-ru-mobile.png`,
`downloads-ru-mobile-bottom.png`, `downloads-en-mobile-no-js.png` находятся
в том же каталоге. E2E screenshots разделены в `artifacts/landing-e2e/js/`
и `artifacts/landing-e2e/no-js/`. Проверены читаемость, focus, иконки,
отсутствие горизонтального overflow и доступность всех файлов на mobile.
Дополнительный red/green regression: явно 32-битный UA вместе с denied/empty
Client Hints сохраняет ссылку на список вместо x64; failing evidence:
`artifacts/landing-downloads/explicit-32bit-red.log`, затем 25 tests passed.
Первый прогон выявил неверный относительный SVG path RU из-за language-switch;
исправлено определение локали по html lang, последующие E2E passed.

Hosted Pages/workflow_run пока не запускался; GitHub deploy и native
install/capture/export не подтверждаются этими browser-проверками.
Safari/Firefox fallback покрыт входными данными в Chromium, отдельные браузеры
не запускались. Подбор x64 при неизвестном CPU — явное продуктовое решение.

## Установка pnpm в GitHub Actions (2026-10-18)

macOS 12.7.6 x86_64 (Darwin 21.6.0). Падение `Compile macOS Intel` на теге
`v0.1.5`: `corepack prepare` один раз не скачал `pnpm-10.33.2.tgz` после
`ENOTFOUND api.github.com`. Компиляция не начиналась.

В workflow pnpm ставит `pnpm/action-setup` v6.1.0
(`ea17c68df8912ef543352723c149a84f56e3d413`) после `actions/setup-node`.
Отдельный тест сценария не добавлялся: это шаг hosted runner, а не контракт
репозитория, который можно устойчиво проверить локально.

`pnpm exec prettier --write` для изменённых workflow и docs, затем
`pnpm exec prettier --check` по тем же файлам, `pnpm docs:check` и
`git diff --check`. Hosted runner этим прогоном не подтверждается.
Повторный запуск уже упавшего job `v0.1.5` читает workflow из тега и эту
замену не подхватывает.

## Версия 0.1.5 (2026-10-18)

macOS 12.7.6 x86_64 (Darwin 21.6.0), Node 22.23.1, pnpm 10.33.2.
`pnpm version:bump 0.1.5` обновил пять файлов метаданных;
`node scripts/release-assets.mjs version . v0.1.5` и
`cargo metadata --locked --offline --no-deps --format-version 1` — passed.
`pnpm test:boundaries --maxWorkers=1` — 13 files / 82 tests passed.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.
Изменены только версия и документация; runtime/build suites не запускались.

## Проверка `lipo` и сохранения `.app` в macOS release workflow (2026-10-18)

Red evidence: лог `Package macos-universal` на commit `f12695f` (`v0.1.4`):

- `pnpm tauri build --target universal-apple-darwin --bundles dmg -- --locked`
  успешно собрал universal Mach-O и DMG, после чего удалил промежуточный
  `target/universal-apple-darwin/release/bundle/macos/Cute Screen.app`
  (`Cleaning .../Cute Screen.app`);
- следующая строка
  `lipo -verify_arch x86_64 arm64 "target/universal-apple-darwin/release/bundle/macos/Cute Screen.app/Contents/MacOS/cute-screen"`
  упала с `unknown architecture specification flag: ... in specifying -verify_arch operation`,
  так как `lipo <input_file> -verify_arch <arch_type> ...` считает все аргументы
  после `-verify_arch` именами архитектур.

Исправление в `.github/workflows/release.yml`:

- сборка использует `--bundles app,dmg`, чтобы `Cute Screen.app` не удалялся
  после `bundle_dmg.sh` (`prepareReleaseAssets` для `macos-universal` по-прежнему
  собирает только `.dmg`);
- вызов исправлен на
  `lipo "target/universal-apple-darwin/release/bundle/macos/Cute Screen.app/Contents/MacOS/cute-screen" -verify_arch x86_64 arm64`.

Локальная проверка (macOS 12.7.6 x86_64, Darwin 21.6.0, Node 22.23.1, pnpm 10.33.2):

- Red/Green: `pnpm exec vitest run --project boundaries tests/boundaries/release-assets.test.ts`
  — 16/16 passed;
- `pnpm test:boundaries` — 13 files / 82 tests passed;
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.

## Версия 0.1.4 (2026-10-18)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2.
`pnpm version:bump 0.1.4` обновил пять файлов метаданных;
`node scripts/release-assets.mjs version . v0.1.4` и
`cargo metadata --locked --offline --no-deps --format-version 1` — passed.
`pnpm test:boundaries` — 13 files / 81 tests passed.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.
Логи и Cargo metadata: `artifacts/version-0.1.4/`.
Изменены только версия и документация; runtime/build suites не запускались.

## Диагностический patch для Vitest 4.x (2026-10-18)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2. Селектор patch изменён
на `vitest@4`, файл переименован в `patches/vitest-worker-diagnostics.patch`.
Содержимое и SHA-256 patch сохранены; зависимость остаётся Vitest 4.1.10.

- `pnpm install --lockfile-only --no-frozen-lockfile --offline`, затем
  `pnpm install --frozen-lockfile --offline` — passed.
- `pnpm test:boundaries` — 13 files / 81 tests passed, включая настоящие
  native exit 23 и SIGKILL и сохранение ненулевого exit у runner.
- В отдельной копии package manifests/lockfile/patches имя compiled chunk
  намеренно заменено на отсутствующее. После штатного обновления lockfile
  `pnpm install --frozen-lockfile --offline --ignore-scripts` завершился
  ошибкой `ERR_PNPM_PATCH_FAILED`. Диапазон 4 не отключает проверку применимости.

Логи: `artifacts/vitest-patch-range/` — `lockfile.log`, `install.log`,
`boundaries.log`, `incompatible-lockfile.log`, `incompatible-install.log`;
форматирование и docs checks — `format.log`, `format-check.log`, `docs-check.log`.
Другие версии 4.x не проверялись: смена hashed chunk может потребовать
адаптации patch. Production behavior и зависимости приложения не меняются.

## Версия 0.1.3 (2026-10-18)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2.
`pnpm version:bump 0.1.3` обновил пять файлов метаданных;
`node scripts/release-assets.mjs version . v0.1.3` и
`cargo metadata --locked --offline --no-deps --format-version 1` — passed.
`pnpm test:boundaries` — 13 files / 81 tests passed.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.
Логи и Cargo metadata: `artifacts/version-0.1.3/`.
Изменены только версия и документация; runtime/build suites не запускались.

## Наблюдаемость Vitest worker crash (2026-10-18)

Исходный [Release job](https://github.com/VladimirIvanin/cute-screen/actions/runs/39144900736/job/117726702110)
на commit `0c194cf` завершился с 152/153 files, 1368/1372 tests и
`Worker exited unexpectedly`. Присланный расширенный log обрывается до итогового
отчёта. Среди renderer suites отсутствует `tool-settings-rendering.test.ts`
с четырьмя tests; это кандидат, а не доказанная причина аварии. Exit signal,
OOM и native stack в доступных логах отсутствуют.

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2, Vitest 4.1.10:

- До patch: `pnpm test:coverage --reporter=verbose --reporter=json --outputFile=artifacts/coverage-worker-0.1.2/results.json`
  — 153 files / 1372 tests passed, 138.00 s, без unhandled errors.
- `pnpm exec vitest run --coverage --project renderer packages/editor-renderer/src/tool-settings-rendering.test.ts --reporter=verbose`
  — 12 последовательных прогонов по 4/4 passed; исходный crash не повторился.
- В локальном `cute-screen-ubuntu22-build:local`, Ubuntu 22.04, с теми же
  Node/pnpm выполнен тот же focused coverage с отдельным reportsDirectory:
  4/4 passed. Это container-проверка, а не новый hosted CI pass.
- Red: новый `vitest-worker-diagnostics.test.ts` запускает настоящий fork;
  исходный Vitest теряет signal/assigned file при SIGKILL. Green после pnpm
  patch: `pnpm test:boundaries` — 13 files / 81 tests passed. Native exit 23
  обходит Vitest process.exit guard через `process.reallyExit`; SIGKILL case
  выполняется только на Unix. Обе аварии сохраняют exit 1 у внешнего runner;
  обычные success/assertion failure не получают ложную worker error.
- `pnpm install --frozen-lockfile --offline` — passed; lockfile фиксирует
  patch hash, версии зависимостей не меняются.
- После patch в том же Ubuntu 22.04 container:
  `pnpm test:coverage --coverage.reportsDirectory=artifacts/coverage-worker-0.1.2/jammy-full-coverage`
  — 153 files / 1372 tests passed, 134.90 s, без unhandled errors.
- `pnpm lint` — passed с 85 warnings вне этой правки; `pnpm typecheck`,
  `pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check`
  — passed на Ubuntu 24.04.5. Native builds, Rust, render/perf harnesses и E2E
  в этом диагностическом срезе не запускались.

Артефакты: `artifacts/coverage-worker-0.1.2/` — `baseline.log`, `results.json`,
`spotlight/run-*.log`, `jammy-spotlight.log`, `diagnostic-red.log`,
`diagnostic-green.log`, `install.log`, `jammy-full.log`, `lint.log`,
`typecheck.log`, `format.log`, `format-check.log`, `docs-check.log`.
Patch устраняет потерю диагностики;
первопричина исходного CI crash остаётся неустановленной.

## Версия 0.1.2 (2026-10-18)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2.
`pnpm version:bump 0.1.2` обновил пять файлов метаданных;
`node scripts/release-assets.mjs version . v0.1.2` и
`cargo metadata --locked --offline --no-deps --format-version 1` — passed.
`pnpm test:boundaries` — 12 files / 78 tests passed.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` — passed.
Логи и Cargo metadata: `artifacts/version-0.1.2/`.
Изменены только версия и документация; runtime/build suites не запускались.

## macOS availability runtime link (2026-10-18)

Red evidence: пользовательский лог release run 39142547248,
job 117722198522 (`Package macos-universal`): arm64 release link завершился
undefined `__isPlatformVersionAtLeast` в `macos_window_capture.o` при
`-nodefaultlibs`. Это ошибка линковки, а не найденный test-only driver.

Исправление: macOS build script передаёт Clang `-fapple-link-rtlib`.
[Clang reference](https://clang.llvm.org/docs/ClangCommandLineReference.html#cmdoption-clang-fapple-link-rtlib)
определяет его как принудительное подключение builtins runtime;
[Darwin driver](https://clang.llvm.org/doxygen/Darwin_8cpp_source.html)
обрабатывает этот флаг и при `-nodefaultlibs`. Compile matrix теперь
выполняет настоящий production-feature `cargo build` и CLI `--help`
на macOS ARM64/Intel до release packaging.

Локальная платформа: Ubuntu 24.04.5 x86_64, Rust 1.97.0, Node 22.23.1,
pnpm 10.33.2. `pnpm test:boundaries` — 12 files / 78 tests passed;
`cargo test --workspace --locked` — 184 passed (desktop 152, IPC codegen 1,
storage 31). `cargo fmt --all`, actionlint всех workflows и
`pnpm docs:check` — passed.
Итог остальных локальных проверок записан в
`artifacts/macos-availability-link/validation.json`; docs log находится рядом.
Native macOS `cargo build`, `pnpm verify:release-boundary` и
`pnpm tauri build --target universal-apple-darwin --bundles dmg -- --locked`
здесь недоступны: Linux host не содержит Xcode/macOS SDK. Исправленная
линковка и DMG остаются pending до macOS CI; Linux тесты их не заменяют.
Browser/render/perf suites не запускались: editor и frontend не менялись.

## Fixtures отдельного Rust CI job (2026-10-18)

Ubuntu 24.04.5 x86_64, Rust 1.97.0, Node 22.23.1, pnpm 10.33.2.

- Public Jobs API подтвердил failure шага `Run Rust tests` в job 117717391316,
  run 39141737137, commit `fcbce59`. Metadata:
  `artifacts/ci-rust-fixtures/job-117717391316.json`. Полный hosted log требует
  авторизации; конкретный hosted assertion по public metadata недоступен.
- Red: `git archive HEAD` на `fcbce59` распакован в отдельный временный каталог
  без ignored generated fixtures. С общим `CARGO_TARGET_DIR` команда
  `cargo test --manifest-path "$clean/Cargo.toml" -p cute-screen-storage creates_deduplicated_capture_and_persists_the_document`
  завершилась exit 101: `production-shaped PNG fixture`, `NotFound` при чтении
  `tests/fixtures/generated/ui-4k.png`. Лог: `missing-fixture-red.log` в каталоге ниже.
- В том же clean snapshot выполнена штатная `pnpm fixtures:generate:m01`
  (7 fixtures), после чего та же Cargo-команда прошла 1/1 без изменения Rust code.
  Логи: `clean-generate.log`, `generated-fixture-green.log`.
- `cargo test --workspace` — 184 passed: desktop 152, IPC codegen 1, storage 31;
  `rust-workspace.log`. Рабочий checkout уже содержал generated fixtures.
- `cargo test --workspace --features fake-platform` — 187 passed: desktop 155,
  IPC codegen 1, storage 31; `rust-fake-platform.log`.
- `pnpm test:boundaries` — 12 files / 78 tests passed; `boundaries.log`.
- `artifacts/release-validation/actionlint -config-file artifacts/release-validation/actionlint.yaml`
  — passed; `actionlint.log`.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`, `git diff --check`
  — passed; `format-final.log`, `format-check.log`, `docs-final.log`, `diff-check.log`.

Логи: `artifacts/ci-rust-fixtures/`. Workflow теперь генерирует fixtures внутри
Rust job перед обоими Cargo suites. Повторный hosted run и Xvfb smoke в этом
срезе не запускались; runtime/application code не менялся.

## Версия 0.1.1 (2026-10-18)

Ubuntu 24.04.5 x86_64. Метаданные версии и команда `pnpm version:bump`.

- `node scripts/release-assets.mjs version . v0.1.1` — passed: package.json,
  Tauri config и Cargo workspace согласованы.
- `cargo metadata --format-version 1 --no-deps --locked --offline` — passed:
  desktop и storage имеют версию 0.1.1, lockfile принят без изменений.
- `pnpm version:bump 0.1.1` — passed на текущем checkout без изменения версии.
  CLI на временной копии пяти production metadata files обновил 0.1.1 → 0.1.2;
  release guard подтвердил результат. `production-metadata-smoke.json` в каталоге ниже.
- `pnpm exec vitest run --project boundaries tests/boundaries/bump-version.test.ts --coverage --coverage.include=scripts/bump-version.mjs --coverage.reportsDirectory=artifacts/version-0.1.1/coverage`
  — 17/17 passed, statements/lines 100%, branches 96.15%.
  Проверены CLI, повторное обновление, no-op, ошибки аргументов и рассогласованные
  файлы без записи, сохранение внешних зависимостей и приватных JS-пакетов.
- `pnpm test:boundaries` — 12 files / 78 tests passed.
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json`, `pnpm lint`, `pnpm format`,
  `pnpm format:check`, `pnpm docs:check`, `git diff --check` — passed.

Логи и Cargo metadata: `artifacts/version-0.1.1/`. Сборка установщиков и
runtime E2E для этого изменения не запускались.

## Разделение CI и короткий E2E smoke (2026-10-18, ADR-112)

Ubuntu 24.04.5 x64 / GNOME X11, Node 22.23.1, pnpm 10.33.2.

- Public Jobs API для runs 39133239285/39138163099: первый job failed после
  1h03m20s, из них browser E2E 41m44s; второй cancelled новым push на browser
  E2E. Metadata: `artifacts/ci-split/job-117692565494.json` и
  `job-117706857262.json`. Полные старые browser logs требуют GitHub login;
  конкретный assertion старого падения не установлен по public metadata.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5297 pnpm test:e2e:browser --spec tests/e2e/specs/browser-keyboard-shortcuts.e2e.ts --spec tests/e2e/specs/browser-activation-settings.e2e.ts`
  — 2 files / 3 tests passed за 9 секунд локально, Chrome 154.0.8037.57.
  Создание, undo/redo/duplicate и Settings. Лог: `artifacts/ci-split/browser-smoke.log`.
- Native smoke использует external tauri-driver 2.1.0 и WebKitWebDriver 2.52.6
  из `artifacts/spotlight-fix/tools/bin` и `tools/webkit/root/usr/bin` в PATH.
  `xvfb-run` локально отсутствует; запуск выполняется в настоящей GNOME X11
  session, а не выдаётся за hosted Xvfb pass.
- Первый `CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=m04-clean-profile-capture,document-write,document-reopen,result-export pnpm test:e2e:tauri`
  — export passed с повторным decode 4K/cropped PNG; три других сценария
  показали устаревшие popover/filmstrip selectors и зависимый reopen после
  незавершённой записи. Дополнительная попытка M03 выявила ошибку создания
  cylinder в старом UI-тесте; эти подробные сценарии оставлены без изменений
  в full suite для отдельного разбора, их pass не заявляется. Логи:
  `artifacts/ci-split/tauri-smoke.log`, `tauri-smoke-retry.log`,
  `tauri-smoke-contract.log`.
- Clean-profile capture обновлён: History вместо filmstrip, размер документа
  читается через `repository_open_last`, размер viewport canvas не выдаётся за
  исходные 400×300. После изменения этот сценарий passed через production
  Capture → Quick → Editor в `tauri-smoke-contract.log`.
- Финальный `CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=m04-clean-profile-capture,result-export pnpm test:e2e:tauri`
  с `XDG_SESSION_TYPE=x11`, `XDG_SESSION_ID=cutescreen-ci-final-smoke` и PATH
  выше — 2/2 files/tests passed; `artifacts/ci-split/tauri-final-smoke.log`.
  После свежей harness-сборки: export 26 s, capture 3 s локально.
- `pnpm test:boundaries` — 61/61 passed; `artifacts/ci-split/boundaries.log`.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`, `pnpm lint` — passed;
  lint содержит существующие warnings. Логи: `e2e-types.log`, `lint.log`
  в `artifacts/ci-split`.
- `artifacts/release-validation/actionlint -config-file artifacts/release-validation/actionlint.yaml`
  — passed для всех workflows, включая nested reusable calls и boolean input
  `full_e2e`; `artifacts/ci-split/actionlint.log`. Custom runner labels описаны
  в config; actionlint 1.7.12 проверен по SHA-256 при предыдущем изменении.

Новый hosted run и полные E2E suites в этом срезе не запускались.
В изменении CI не менялись unit/render/perf и Rust/application code; для workflow/tests
проверены smoke, E2E types, lint и boundary gates вместо повторной полной
runtime/platform acceptance. Полный `pnpm check` в этом срезе не запускался.

## Публикация Release assets (2026-10-18, ADR-111)

Ubuntu 24.04.5 x64, Node 22.23.1, pnpm 10.33.2. GitHub API заменён recording
stub только в publisher contract tests; реальные Release/assets не изменялись.

- `pnpm exec vitest run --project boundaries tests/boundaries/release-assets.test.ts --coverage --coverage.include=scripts/release-assets.mjs --coverage.include=scripts/publish-release.mjs --coverage.reportsDirectory=artifacts/release-validation/coverage`
  — 15/15 passed; statements 92.85%, branches 85.59%, lines 94.18%.
  Проверены strict tag и все три версии, пять platform manifests, один universal
  DMG, inventories, corruption, stale/extra files, moved tag, immutable release,
  API error, draft/retry, conflict preflight, повторное скачивание и skip
  идентичных файлов. Лог: `artifacts/release-validation/coverage.log`.
- `node scripts/release-assets.mjs version . v0.1.0` — passed на реальных
  package/Tauri/Cargo metadata checkout.
- `artifacts/release-validation/actionlint -config-file artifacts/release-validation/actionlint.yaml`
  — passed для всех workflows, actionlint 1.7.12; архив проверен по опубликованному
  SHA-256. Config перечисляет существующие custom self-hosted labels
  `cutescreen-reference` и `rtx-2070-super`. Лог: `artifacts/release-validation/actionlint.log`.
- `pnpm format` — passed; `.mts` declarations теперь форматируются ESLint,
  как TypeScript, без противоречащего схлопывания Prettier.
- `pnpm check` — passed: lint, TypeScript, formatting, docs links, boundary
  61/61, IPC bindings, Rust fmt и все Clippy configurations. Лог:
  `artifacts/release-validation/check.log`.

Hosted matrix, Windows/macOS installers и полная публикация через настоящий
GitHub API этим локальным прогоном не проверены. `pnpm test:render`,
`pnpm test:e2e:browser`, `pnpm test:e2e:tauri`, `pnpm test:perf`,
`pnpm tauri build` и отдельный `cargo test --workspace` в этом workflow-only
изменении не запускались; release workflow сохраняет прежние обязательные CI gates.

## Версия в настройках (2026-10-18, ADR-108)

Ubuntu 24.04.5 x64 / GNOME X11; Chrome 154.0.8037.57 и WebKitGTK 2.52.6.

- `pnpm test tests/unit/vue/app-version.test.ts tests/unit/vue/settings-navigation.test.ts`
  — 6/6 passed; `artifacts/settings-version-unit.log`. Native pending response,
  prerelease/build suffix, RU/EN, error → Retry и browser fallback без IPC.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5296 pnpm test:e2e:browser --spec tests/e2e/specs/browser-activation-settings.e2e.ts`
  — 2/2 passed; `artifacts/settings-version-browser.log`. Версия совпадает с
  tauri.conf.json в RU/EN × light/dark, 820×720 и 620×520, после перехода
  между General и Shortcuts. Просмотрены
  `artifacts/browser-e2e/settings-inline-ru-light-620.png` и
  `settings-inline-en-dark-820.png`: версия видима без обрезки.
- `CUTE_SCREEN_E2E_SCENARIOS=activation-settings XDG_SESSION_ID=cutescreen-settings-version pnpm test:e2e:tauri`
  — metadata assertion прошёл в настоящем Settings WebView; весь сценарий
  2/3 из-за повторного перехода в General до завершения save. Screenshot
  `artifacts/tauri-e2e/failure-opens-a-singleton-settings-window-through-CLI-and-assigns-through-the-real-recorder.png`
  просмотрен: Version 0.1.0 видна. Helper теперь ждёт enabled navigation и
  показ language select. Исходный лог: `artifacts/settings-version-native.log`.
- Повтор с `XDG_SESSION_ID=cutescreen-settings-version-retry` и той же
  `CUTE_SCREEN_E2E_SCENARIOS=activation-settings pnpm test:e2e:tauri`
  — 3/3 passed; `artifacts/settings-version-native-retry.log`. Проверены
  native metadata, повторный CLI вход, singleton, tray settings и физический
  X11 shortcut. Финальный `artifacts/tauri-e2e/settings-native-general.png`
  просмотрен: Version 0.1.0 видна под названием приложения.
- `pnpm check` — passed: lint (существующие warnings), typecheck, formatting,
  docs links, boundaries 45/45, IPC drift, frontend build, Rust fmt и четыре
  Clippy конфигурации; `artifacts/settings-version-check.log`.
  `pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check`
  — passed; финальные логи `artifacts/settings-version-format-final.log`,
  `artifacts/settings-version-format-check.log` и `artifacts/settings-version-docs.log`.

Проверка обновлений по сети не входит в этот срез. Windows/macOS runtime
не запускались. Установленный пакет не обновлялся.

## Захват без меню трея (2026-10-18, ADR-107)

Ubuntu 24.04.5 x64 / GNOME X11, 1920×1080 / WebKitGTK 2.52.6.
Evidence: `artifacts/tray-menu-capture/`.

- До реализации `cargo test -p cute-screen-desktop --lib tray_menu_delay_can_be_cancelled_before_the_backend_starts`
  — expected failure: Selecting вместо Delay (`red.log`).
- `cargo test --workspace` — passed: desktop 148, activation integration 1,
  storage 31, doc tests (`rust.log`). Два новых контракта проверяют 200 мс
  для всех пяти tray actions и отмену до backend без draft/document.
- `pnpm tauri build --debug --no-bundle --features test-harness --config src-tauri/tauri.test.conf.json`
  — passed (`native-build.log`). Fake capture не включён; приложение запущено
  с `--background`, отдельными CUTE_SCREEN_E2E_APP_DATA и XDG_RUNTIME_DIR,
  чтобы не менять установленный resident. SHA256 running ELF —
  `native-evidence.json`. После smoke временные app и xmessage закрыты.
- Native smoke: xmessage 800×700+1080+40, фон #245b92; настоящий GNOME tray
  открывается `xdotool mousemove --sync 1508 15 click 1`, затем native click
  Area (1480,62). До вызова открытое меню перекрывает sample 1420,100,175×230.
  После вызова production Quick показывает frozen desktop без меню;
  `inspect-frozen.py` читает кадр через binary IPC в реальном WebView,
  декодирует createImageBitmap и считает sample pixels. Все 40 250 равны
  [36,91,145,255] (`frozen-pixels.json`). Изображение через JSON не передаётся.
- После закрытия Quick настоящий tray → Screen (1480,98) сохраняет original
  1920×1080. Повторный PIL decode исходного PNG даёт те же 40 250 фоновых
  пикселей без меню (`screen-original.png`, `screen-decoded.json`).
  Снимки `menu-open.png` и `quick-frozen.png` просмотрены: меню сначала видно,
  в frozen frame его нет. Попытка materialize Area после нескольких тестовых
  gestures дала crop 1×1; она не считается доказательством Area original.
- `pnpm check` — passed (`check.log`): lint/typecheck/format/docs,
  boundaries 45/45, IPC drift, frontend build, Rust fmt и четыре Clippy
  конфигурации. `cargo fmt --all`, `pnpm format`, `pnpm format:check`
  — passed (`format.log`, `format-check.log`). `git diff --check` — passed.

Проверены реальный menu click, Area frozen pixels и Screen original.
Repeat/Window/Active Window, Windows/macOS/Wayland и нестандартная длительность
анимации других shells в этом smoke не проверялись. Пауза 200 мс является
ограниченным запасом на закрытие меню. Установленный пакет не обновлялся.

## Installed Area focus regression (2026-10-18, ADR-106)

Ubuntu 24.04.5 / GNOME X11 / WebKitGTK 2.52.6. Установленный `/usr/bin/cute-screen`
и resident `/proc/106340/exe` имеют одинаковый SHA256
`115b5752949e83f42494eb2344d902eedc7549dbac5171dfb6124c41ba7a161f`.
До правки `cute-screen capture --mode area --json` показывает Quick XID
83886884 с DEMANDS_ATTENTION, пока _NET_ACTIVE_WINDOW принадлежит Codex.
`xdotool key Escape` не отменяет захват. После отдельного windowactivate Quick
тот же Escape возвращает typed cancelled. Первоначальный UI/WebDriver pass
не подтверждал этот сценарий: switchWindow сам давал отсутствующий focus.

`pnpm smoke:installed:area-escape` на installed ELF воспроизводимо падает
до ввода Esc на native focus assertion; cleanup активирует Quick только
после failure. Лог `artifacts/installed-area-escape-red.log`, снимок JSON
`artifacts/installed-area-escape-red.json`. Новый regression не использует
WebDriver для выбора Quick.

- `CUTE_SCREEN_E2E_SCENARIOS=area-escape pnpm test:e2e:tauri`: fresh debug
  build, 2/2 passed. Добавленный background CLI smoke выполняется до любого
  WebDriver switch в Quick; native focus и три typed cancelled проверены.
  `artifacts/installed-area-escape-tauri.log`.
- `pnpm test tests/unit/vue/quick-capture tests/unit/vue/canvas-viewport-quick.test.ts tests/unit/vue/straight-strokes.test.ts`:
  78/78 passed. `artifacts/installed-area-escape-unit.log`.
- `cargo test --workspace --lib`: desktop 146/146, storage 31/31 passed.
  `artifacts/installed-area-escape-rust.log`. Нового core/IPC контракта нет;
  red-first доказательство native presentation — installed focus smoke выше.
- `pnpm build:linux:ubuntu22`: passed, свежие DEB/AppImage, ELF ABI и оба
  package CLI gates. `artifacts/installed-area-escape-package.log`.
- Извлечённый из нового DEB release ELF запущен с `--background`;
  `CUTE_SCREEN_AREA_ESCAPE_BINARY=/home/vladimir/remote/cutescreen/artifacts/installed-area-escape-deb/usr/bin/cute-screen pnpm smoke:installed:area-escape`:
  3/3 passed, включая начальное выделение с зажатой primary button. SHA256
  файла и resident process равны
  `69da0181798d6f4373a04dbe01687b4a1c73c0bd8837c68ac9484f448b141a81`.
  Это package payload smoke, не проверка `/usr/bin` после установки.
  `artifacts/installed-area-escape-deb-smoke.log`,
  `artifacts/installed-area-escape-deb.json`.

- Исправленный DEB установлен через `pkexec /usr/bin/dpkg -i` из
  `artifacts/ubuntu22/Cute Screen_0.1.0_amd64.deb`; exit 0,
  `artifacts/installed-area-escape-install.log`. Resident перезапущен точно
  как `/usr/bin/cute-screen --background` (PID 124925).
- `pnpm smoke:installed:area-escape` без override: 3/3 passed на `/usr/bin`.
  SHA256 установленного файла и `/proc/124925/exe` совпадает с новым DEB ELF
  выше. Во всех попытках _NET_ACTIVE_WINDOW совпал с Quick XID 83886083 до
  любых тестовых focus/click по Quick; Esc дал typed cancelled (CLI exit 130),
  окно скрыто. Фоновый resident оставлен запущенным.
  `artifacts/installed-area-escape-installed-smoke.log`,
  `artifacts/installed-area-escape.json`.
- `pnpm check` — exit 0: lint/typecheck/format/docs, boundaries 45/45, IPC
  codegen check, frontend build, Rust fmt и четыре Clippy конфигурации.
  `artifacts/installed-area-escape-check.log`. Финальные `pnpm format`,
  `pnpm format:check` и `git diff --check` фиксируются delivery-логами
  `artifacts/installed-area-escape-format.log` и
  `artifacts/installed-area-escape-format-check.log`.

Windows/macOS и Wayland runtime не запускались.

## Escape до первого выделения Area (2026-10-18)

Ubuntu 24.04.5 x64 / X11, WebKitGTK 2.52.6, Node 22.23.1 / pnpm 10.33.2.
Существующий контракт `REQ-CAP-011/012/014` восстановлен без изменений core,
Rust/IPC и accepted ADR. Initial Escape обрабатывается window capture listener,
зарегистрированным до mount canvas; editing gesture cancellation сохраняется.

- До исправления mounted production EditorShell с фокусом вне shell пропускал
  Escape: 1 failed / 5 passed. `artifacts/area-escape-unit-red.log`.
- `pnpm test tests/unit/vue/quick-capture tests/unit/vue/canvas-viewport-quick.test.ts tests/unit/vue/straight-strokes.test.ts`:
  78/78 passed. Проверены body/canvas/первый drag, cancel/retry, Quick actions,
  crop gestures и отмена незавершённых штрихов. `artifacts/area-escape-unit.log`.
- Native regression подтвердил Escape с repeat=true после hide/reopen Quick:
  событие было trusted, initial capture оставался Selecting. Диагностика до
  исправления repeat guard: `artifacts/area-escape-native-repeat-red.json`.
  Отдельный failing test guard — `artifacts/area-escape-repeat-red.log`.
  В selecting repeat разрешён, в editing остаётся подавленным.
- `CUTE_SCREEN_E2E_SCENARIOS=area-escape pnpm test:e2e:tauri`: fresh debug
  build и 1/1 passed в Tauri/Wry WebKitGTK, physical X11 capture 1920×1080.
  Без `.focus()` или клика по canvas первый trusted Escape закрывает selector;
  повторный capture → удерживаемый drag 200,200→700,500 → trusted Escape с
  repeat=true также удаляет draft. В обоих случаях Quick hidden, main visible,
  `repository_open_last` возвращает null. `artifacts/area-escape-tauri.log`,
  `artifacts/tauri-e2e/area-escape.json`; просмотрены screenshots
  `area-escape-initial.png` и `area-escape-drag.png` в том же каталоге.
- `pnpm check` — exit 0: lint/typecheck/format/docs, boundaries 45/45, IPC
  codegen drift check, frontend build, Rust fmt и все четыре Clippy конфигурации.
  `artifacts/area-escape-check.log`.
- `pnpm format`, `pnpm format:check` и `git diff --check` — passed.
  Логи: `artifacts/area-escape-format.log`,
  `artifacts/area-escape-format-check.log`.

Browser mode, Windows/WebView2, macOS/WKWebView и Wayland portal для этой правки
не запускались. Windows physical exclusion E2E больше не назначает DOM focus
перед Escape; его результат требует отдельного Windows runner.

## Исправление TypeScript architecture ratchets (2026-10-18)

Ubuntu 24.04.5 LTS x86_64, Linux 6.8.0-147-generic, Node 22.23.1,
pnpm 10.33.2. Поведенчески нейтральный рефакторинг по ADR-042:
preview helpers панели фигур вынесены в отдельный UI-модуль; eyedropper
сам предоставляет UI bindings; callout style и завершение штриха выделены
в функции; gradient payload отделён от dispatch; image E2E разбит на этапы
с прежними assertions и pixel tolerances. Бюджеты и exceptions не менялись.

Исходный `pnpm test:boundaries` воспроизвёл два падения из отчёта (семь
нарушений размеров/complexity/depth), а также независимый build-contract
failure: строковая capability reference перед inline test-harness. Тест
теперь выбирает test-harness по identifier и сохраняет проверки hide/show.

- `pnpm test:boundaries` — 10 files, 45/45 passed.
- `pnpm typecheck` — passed, включая package build и E2E TypeScript.
- `pnpm lint` — exit 0, 85 warnings, 0 errors.
- `pnpm test:render` — 18 files, 51/51 passed, goldens не обновлялись.
- Первый `pnpm test` — 151/152 files passed, 1362 passed / 1 failed. Единственное
  падение — `quick-capture-warmup.test.ts`, который вместе с QuickCaptureApp
  менялся параллельно вне этого рефакторинга. Повторный scoped запуск
  `pnpm test --project vue tests/unit/vue/quick-capture-warmup.test.ts` —
  5 passed / 1 failed: Escape из body не вызвал cancel. Затронутые этим
  рефакторингом core/renderer/Vue tests прошли. После обновления параллельной
  правки итоговый `pnpm test` — **152 files, 1365/1365 passed**;
  `artifacts/architecture-ratchets/unit-final.log`.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5191 pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-editing.e2e.ts`
  — Chrome 154.0.8037.57, 1/1 passed: восемь сочетаний 1024/1600 px × RU/EN ×
  light/dark, импорт 3840×2160, move/resize/rotate, Escape, undo/redo,
  numeric formatting и четыре прямых border corners. Screenshots и JUnit —
  `artifacts/browser-e2e/`; исходные assertions и допуски сохранены.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` — passed.

Логи: `artifacts/architecture-ratchets/`. Browser evidence не расширяет
платформенные гарантии; real Tauri и другие ОС этим рефакторингом не проверялись.

## Ссылка атрибуции Noto Emoji (2026-10-18, ADR-105)

Ubuntu 24.04.5 LTS x86_64/X11, Linux 6.8.0-147-generic, WebKitGTK 2.52.6,
Node 22.23.1, pnpm 10.33.2. Native host подключает scoped opener; Enter ссылки
не всплывает в Quick shortcut Copy. Document/core/desktop IPC не меняются.

- `pnpm test:boundaries tests/boundaries/tauri-capabilities.test.ts`: 2/2 passed;
  точный URL и оба окна, общая capability в production и native harness.
  До реализации новый контракт падал на отсутствующей capability.
- `pnpm test tests/unit/vue/emoji-tool.test.ts`: 6/6 passed. Новая регрессия
  сначала падала на всплытии Enter к window, затем проверила сохранение default
  activation, focus и отсутствие изменения документа.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed.
- `pnpm lint`: passed, 85 существующих warnings; scoped ESLint также passed.
- `cargo fmt --all --check`: passed. Новые Rust зависимости MIT/Apache-2.0;
  open/is-docker/is-wsl — MIT. Lockfile изменяет только новый dependency graph.

`PATH="$PWD/artifacts/noto-driver/bin:$PWD/artifacts/noto-driver/webkit/usr/bin:$PATH" CUTE_SCREEN_E2E_SCENARIOS=emoji-link pnpm test:e2e:tauri`:
1/1 passed, свежий test-harness binary, external tauri-driver 2.1.0 и
WebKitWebDriver 2.52.6. Production empty mount → Capture → Quick → выбор области →
Emoji picker → Editor handoff. Click и Enter из обоих окон имеют isTrusted=true;
recording xdg-open получил четыре точных URL. Чужой HTTPS URL, file URL и
вложенный upstream path отвергнуты без OS dispatch. Палитра остаётся открытой;
Enter больше не вызывает Quick Copy. Для стабильного native input сценарий
ждёт window focus и окончания анимации палитры.

Просмотрены artifacts/tauri-e2e/quick-noto-link.png (1920×1080) и
editor-noto-link.png (1280×800), включая видимый focus ring ссылки. Полный лог:
artifacts/noto-link-tauri.log; OS boundary: artifacts/tauri-e2e/emoji-link-dispatch.log.
Ранее embedded driver выявил Quick Enter/Copy conflict; итоговый pass получен
external driver после исправления propagation. Capture fake-platform 400×300;
это проверка UI/URL dispatch, не physical capture и не загрузка страницы браузером.
Windows/WebView2, macOS/WKWebView и Wayland этой правкой не проверялись.
Драйверы загружены локально в ignored artifacts/noto-driver, системные пакеты
и настройки браузера пользователя не менялись.

`pnpm check`: exit 0 — lint, полный typecheck, format:check, docs:check,
45/45 boundary tests, generated IPC check, Rust fmt и все четыре Clippy
конфигурации прошли. Rust этап ожидал Cargo lock параллельной сборки.
`pnpm format` выполнен; финальное форматирование и отдельный format:check
сохранены в artifacts/noto-link-format.log и artifacts/noto-link-format-check.log.
Логи unit, capabilities, scoped lint/types и общей проверки:
artifacts/noto-link-unit.log, noto-link-boundaries.log, noto-link-lint.log,
noto-link-types.log, noto-link-check.log. Renderer goldens, browser E2E,
performance suite и cargo test --workspace не запускались: artwork, scene,
commands, export и Rust core не менялись.

## Ubuntu 22.04 baseline (2026-10-18, ADR-104)

Host: Ubuntu 24.04.5 x64; проверяемая среда: Docker Ubuntu 22.04.5 x64,
glibc `2.35-0ubuntu3.14`, GTK `3.24.33-1ubuntu2.2`, WebKitGTK
`2.50.4-0ubuntu0.22.04.1` из Jammy updates. Новых Rust/core контрактов нет.

- Старый `target/release/cute-screen` от 2026-10-17: в Jammy с установленными
  GTK/WebKit `--help` падает на `GLIBC_2.39 not found`.
  `artifacts/compat-ubuntu22/jammy-runtime.log`.
- `pnpm check:linux:compat` — ожидаемый exit 1 на старом ELF; weak imports
  pidfd_spawnp/pidfd_getpid также требуют GLIBC_2.39.
  `artifacts/compat-ubuntu22/old-binary-gate.log`.
  `pnpm check:linux:compat /bin/true` — exit 0, maximum GLIBC_2.34.
- Дополнительный API diagnostic в настоящем Jammy WebKitGTK/Xvfb:
  `DISPLAY=:99 XAUTHORITY=/tmp/xvfb-run.Hegn7V/Xauthority WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 python3 -u /audit/webkit-api-probe.py`.
  `structuredClone`, `crypto.randomUUID`, `Intl.Segmenter`, ResizeObserver,
  inert, CSS :has, PNG Canvas.toBlob/createImageBitmap и module worker с
  OffscreenCanvas 2D/convertToBlob, FontFace/self.fonts — passed.
  Script/result: `artifacts/compat-ubuntu22/webkit-api-probe.py`,
  `artifacts/compat-ubuntu22/webkit-api-result.log`. Это focused API diagnostic
  с отключённой sandbox в root container, не production editor acceptance.
- `pnpm format` — exit 0. Первый `pnpm check`: lint, typecheck, format и docs checks
  прошли; boundaries — 42 passed / 2 failed на существующих file-size/complexity
  violations (ShapeFormattingToolbar, canvas-workspace-controller, styles,
  gesture-finish-controller, drawing-payload, image-editing). Rust portion после
  boundaries не запускалась. `artifacts/compat-ubuntu22/check.log`. Эти ratchets
  затем исправлены параллельной работой; её результаты — в разделе выше.

- `pnpm build:linux:ubuntu22` — exit 0 на окончательном Docker image.
  Первый прогон собрал release/DEB, но AppImage остановился на отсутствующем
  `/usr/bin/xdg-open`; добавлен `xdg-utils` в image, CI и DEB dependencies.
  Первый/финальный логи: `artifacts/compat-ubuntu22/build-first.log`,
  `artifacts/compat-ubuntu22/build.log`. Cargo/JS outputs отдельные; перед Rust
  build переиспользован только cache исходных crates, не host target.
- `pnpm check:linux:compat artifacts/ubuntu22-work/target/release/cute-screen`
  — passed, maximum GLIBC_2.34; прежнее требование GLIBC_2.39 отсутствует.
  DEB metadata требует libc6 >= 2.35, WebKitGTK 4.1 >= 2.40 и xdg-utils.
  Штатные `check-m04-deb.mjs` и `check-m04-appimage.mjs` — passed в Jammy.
- В отдельном Jammy container:
  `apt-get install --reinstall -y /tmp/cute-screen-final.deb && /usr/bin/cute-screen --help`
  — exit 0; зависимости устанавливаются через apt.
  `APPIMAGE_EXTRACT_AND_RUN=1 /tmp/CuteScreen.AppImage --help` — exit 0.
  Логи: `artifacts/compat-ubuntu22/deb-install-final.log`,
  `artifacts/compat-ubuntu22/appimage-jammy.log`. FUSE mount не проверялся.
- Финальный установленный DEB: обычный user uid 1000, Xvfb/X11, session D-Bus,
  штатная WebKit sandbox (без disable flag),
  `dbus-run-session -- timeout 12s /usr/bin/cute-screen show`.
  Окно `Cute Screen — Settings` 820×720 и WebKitWebProcess появились; процесс
  оставался запущенным до ожидаемого timeout exit 124. Это startup smoke,
  не visual/interaction acceptance. Логи: `artifacts/compat-ubuntu22/gui-launch-final.log`,
  `artifacts/compat-ubuntu22/gui-windows-final.log`. В минимальном container
  отсутствует accessibility bus (AT-SPI warning).
- Готовые `Cute Screen_0.1.0_amd64.deb` и `.AppImage` находятся в
  `artifacts/ubuntu22/`; `sha256sum -c SHA256SUMS` — оба OK.

ARM64 и physical GNOME/Wayland capture/clipboard не проверены.

## Пользовательский README и GitHub-шапка (2026-10-18)

`REQ-UI-013`, `REQ-ACT-006`, ADR-057. Windows x64, Node 22.23.1 / pnpm 10.33.2.
Изменены только документация, presentation assets и отдельный генератор шапок;
контракты core, Vue UI, Rust и платформ не менялись.

- `pnpm artwork:github` — passed: сохранённые PNG повторно декодированы,
  README 1280×480 / 41 456 bytes, Social preview 1280×640 / 43 000 bytes.
  Логотип загружается из существующего SVG; supplied toolbar 598×41 сохранён
  byte-for-byte и обрезается только clip-маской при композиции для удаления
  прямоугольных углов исходного screenshot.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check`,
  `pnpm exec eslint scripts/generate-github-artwork.mjs`, `git diff --check` —
  результаты в `artifacts/readme-verification.log`, форматирование —
  `artifacts/readme-format.log`. Полные runtime suites не запускались:
  приложение не изменялось.
- GitHub Markdown API отрендерил обе версии README. Локальный browser preview
  с приближёнными GitHub light/dark styles проверен в восьми сочетаниях
  EN/RU × light/dark × 375/1280 px. Оба изображения загружены во всех вариантах,
  шапка целиком помещается, горизонтального overflow страницы нет.
  Screenshots: `artifacts/readme-{en,ru}-{light,dark}-{375,1280}.png`;
  DOM metrics: `artifacts/readme-browser-qa.json`. PNG шапок просмотрены отдельно.
  Это проверка GFM и локального представления, а не опубликованной GitHub страницы.
- About description/topics и Social preview подготовлены для ручной настройки
  согласно уточнению пользователя; внешние настройки не менялись.

## Vite dev/E2E optimize-deps cache (2026-10-18)

Windows x64: запрос пользователя к `localhost:5173` с прежним hash Tauri core
воспроизвёл HTTP 504 Outdated Optimize Dep. E2E теперь использует собственный
cacheDir на порт. Существующий dev-сервер автоматически перечитал config.
Во время browser run на 5226 импорт из `src/desktop-bridge.ts` на 5173 сохранил
hash `c182b150` и HTTP 200; E2E писал в `.vite/cutescreen-e2e-5226`.
Наблюдение через `Invoke-WebRequest`: `artifacts/vite-cache-isolation.json`.
Уже открытая страница со старым import hash может потребовать reload.

`$env:CUTE_SCREEN_BROWSER_E2E_PORT='5226'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-visual.e2e.ts`:
Chrome 155.0.8059.80, 1/1 passed, прежняя матрица 12 сочетаний прошла с отдельным
кешем; `artifacts/callout-compact-cache-browser.log`. Scoped ESLint Vite config
passed. Финальное форматирование и проверка:
`artifacts/callout-compact-format-delivery.log`,
`artifacts/callout-compact-format-check-delivery.log`.
`pnpm format` exit 0; последний общий format:check exit 1 только на двух
параллельно изменяемых landing HTML (`apps/landing/index.html` и
`apps/landing/en/index.html`). `pnpm docs:check` passed, 38 документов.
Scoped форматирование затронутых Vite/callout/test/CSS/Markdown файлов:
`artifacts/callout-compact-format-scoped.log`.

## Иконки настроек выноски (2026-10-18)

Windows x64 / PowerShell, Node 22.23.1, pnpm 10.33.2. Панель использует
существующие UiIcon и ArrowStylePreview; CalloutMarkerPreview разделяется
между trigger и выбором наконечников. Document/core/IPC не меняются.

- `pnpm test tests/unit/vue/callout-toolbar.test.ts tests/unit/vue/text-context-toolbar.test.ts`:
  16/16 passed, `artifacts/callout-compact-unit.log`. Подсказки RU, смена значения,
  mixed, disabled, настройки, Escape и возврат focus.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5224'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-visual.e2e.ts --spec tests/e2e/specs/browser-callout-editing.e2e.ts`:
  Chrome 155.0.8059.80, 2/2 passed. Production drag → inline → Ctrl+Enter →
  selection показывает пять кнопок в одном ряду шириной менее 420 px во всех
  12 сочетаниях RU/EN × light/dark × 50/100/200% при окне 1024×700.
  Открытие Route, Escape/focus, прежние width controls, изменения наконечников,
  геометрии и оболочки, cancel/undo/redo прошли. Лог:
  `artifacts/callout-compact-browser.log`. Просмотрены
  `artifacts/browser-e2e/callout-icons-en-dark-50.png`,
  `callout-icons-ru-dark-200.png` и `callout-route-ru-light-100.png`.
- Прямые `pnpm exec vue-tsc --noEmit -p apps/desktop/tsconfig.json`,
  `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` и
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: exit 0,
  `artifacts/callout-compact-types.log`. Scoped ESLint изменённых компонентов
  и тестов exit 0. `pnpm format`: exit 0, `artifacts/callout-compact-format.log`.

`pnpm test:boundaries`: 42 passed / 2 failed,
`artifacts/callout-compact-boundaries-final.log`. Перенесено точечное разрешение
геометрического SVG из CalloutEndpointSettings в общий CalloutMarkerPreview;
icon-system boundary прошёл. Остаются прежние file-size/complexity violations
в ShapeFormattingToolbar, canvas-workspace-controller, styles,
gesture-finish-controller, drawing-payload и image-editing.

Native: `$env:CUTE_SCREEN_E2E_SCENARIOS='callout-editing'; $env:CUTE_SCREEN_E2E_DRIVER_PORT='5804'; $env:TAURI_WEBDRIVER_PORT='5805'; $env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/callout-target'; $env:CUTE_SCREEN_FRONTEND_DIST='D:/cutescreen/artifacts/callout-compact-frontend'; pnpm test:e2e:tauri`.
Свежая сборка passed, WebView2 155.0.4283.45 / external driver запустился,
но сценарий упал до новой проверки toolbar: Callout editor не появился после
drag. Лог: `artifacts/callout-compact-native.log`; failure PNG просмотрен.
Повтор `& ./artifacts/callout-compact-native-runtime.ps1` использовал тот же
свежий pinned binary и отдельные app data/UDF, полный env сохранён в скрипте.
Лог: `artifacts/callout-compact-native-retry.log`; timeout на предшествующем
resize Quick crop (`crop.x > 0`). Поэтому native layout/handoff для этой правки
не подтверждены. Это fake capture, не проверка physical capture.

Первый `pnpm check` прошёл lint (0 errors / 85 warnings), но остановился на
отсутствующих generated renderer declarations во время typecheck;
`artifacts/callout-compact-check.log`. Повтор `pnpm check` прошёл lint, полную
сборку/typecheck, format:check и docs:check, затем остановился на тех же двух
architecture boundary checks (42 passed / 2 failed), без затронутых callout
файлов в violations; `artifacts/callout-compact-check-final.log`.
`pnpm format` passed, `artifacts/callout-compact-format-final.log`.
Linux/WebKitGTK и macOS/WKWebView для этой правки не запускались.

## Выноска: принятая карточка с точкой (2026-10-18, ADR-055)

`REQ-EDT-008`, `REQ-TOL-007`: пользователь выбрал вариант 01. Общий `UiIcon`
теперь использует `calloutGeometry`; gallery и landing получают тот же рисунок.
Доступное имя, shortcut O и поведение инструмента сохранены. Windows x64,
PowerShell, Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.80.

- `pnpm icons:landing` — exit 0, обновлён только callout SVG.
- `pnpm test tests/unit/vue/ui-icon.test.ts tests/unit/vue/quick-context-toolbar.test.ts`
  — 2 files / 110 tests passed; `artifacts/custom-icons/callout-adopted-unit.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5198'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; $env:CUTE_SCREEN_ICON_EVIDENCE='callout-adopted'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts`
  — 2/2 passed; `artifacts/custom-icons/callout-adopted-browser-final.log`.
  Первый запуск выявил устаревший shortcut L для лупы; helper исправлен на Z
  в соответствии с текущим product mapping. Финальный прогон проверяет Callout
  по O, RU/EN × light/dark, disabled пустого editor, keyboard focus, SVG raster
  16/18/20/24/32 px и DPR 1/2 без clipping.
- Просмотрены `artifacts/custom-icons/callout-adopted/callout-family-dpr-1.png`,
  `callout-family-dpr-2.png` и `editor-ru-dark.png`: карточка и связь различимы
  при 18 px, вес согласован с соседними Tabler, active/focus/disabled читаемы.

- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='custom-icons'; $env:CUTE_SCREEN_ICON_EVIDENCE='callout-adopted'; $env:CUTE_SCREEN_E2E_DRIVER_PORT='5662'; pnpm test:e2e:tauri`
  — exit 0, 1/1 passed, свежая debug-сборка и pinned test binary,
  WebView2 155.0.4283.45 / external driver. Production Capture → Quick → Editor:
  новая иконка, выбор по O, RU/EN × light/dark, trusted keyboard, pencil/marker,
  sampling и undo/redo. `artifacts/custom-icons/callout-adopted-tauri.log`;
  просмотрены `native-quick.png` и `native-editor-ru-dark.png` в evidence folder.
  Fake capture и изолированный профиль не подтверждают physical capture.
- `pnpm lint` — exit 0, warnings без errors. `pnpm format`, `pnpm format:check`
  — exit 0; журналы `artifacts/custom-icons/callout-adopted-format-final.log`,
  `callout-adopted-format-check.log` и `callout-adopted-lint.log`.
- `pnpm test:boundaries` — exit 1, 41 passed / 3 failed. Файлы вне этой замены:
  новый параллельный `CalloutMarkerPreview.vue` требует SVG boundary allowlist;
  size ratchets в canvas-workspace-controller/ShapeFormattingToolbar и
  complexity/depth в styles/gesture-finish-controller/drawing-payload/image-editing.
  Журнал: `artifacts/custom-icons/callout-adopted-boundaries.log`.
- `pnpm check` — exit 1 на тех же трёх boundary gates вне файлов замены
  иконки; lint, typecheck, format:check и docs:check passed до этого шага.
  `artifacts/custom-icons/callout-adopted-check.log`. Последующие IPC/Rust gates
  этой командой не запускались.

WebKitGTK/WKWebView и физический захват для этой замены не проверялись.

## Компактная ширина выноски (2026-10-18, ADR-103)

Windows 10 x64 / PowerShell, Node 22.23.1, pnpm 10.33.2.

- `pnpm test tests/unit/vue/text-context-toolbar.test.ts tests/unit/vue/callout-toolbar.test.ts`:
  14/14 passed. Hidden numeric field, минимум, commit/cancel, focus return,
  auto/manual, взаимоисключение popover и read-only:
  `artifacts/callout-width-unit-final.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5194'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-visual.e2e.ts`:
  Chrome 155.0.8059.80, 1/1 passed, все 12 сочетаний RU/EN × light/dark ×
  50/100/200%, окно 1024×700. Проверены bounds toolbar/dropdown и отсутствие
  перекрытия inline текста. PNG `artifacts/browser-e2e/callout-ru-light-200.png`
  просмотрен: dropdown над toolbar, текст полностью виден.
  Лог: `artifacts/callout-width-browser-visual-final.log`.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-visual.e2e.ts --spec tests/e2e/specs/browser-callout-editing.e2e.ts`
  с портом 5193: editing 1/1 passed, включая width 300, отмену 720,
  auto-size, route/card и undo/redo; visual первоначально обнаружил overlap
  при 200%. Пояснение/отступы сокращены, финальная матрица выше прошла.
  Повтор visual сначала завершился на WDIO timeout: timeout вынесен
  из тела теста в `.timeout(180_000)`. Логи: `artifacts/callout-width-browser.log`,
  `artifacts/callout-width-browser-visual.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5194'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-layout.e2e.ts`:
  2/2 passed: подписи по обе стороны target, soft wrapping, reopen, ширина
  720 px, undo/redo и mixed font metrics. Лог: `artifacts/callout-width-browser-layout.log`.
- `pnpm lint` passed (0 errors / 85 existing warnings), `pnpm typecheck`
  passed; после выделения E2E helper отдельно `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  passed. Логи: `artifacts/callout-width-lint.log`, `callout-width-types.log`,
  `callout-width-e2e-types-final.log`. `pnpm docs:check` passed.
- `pnpm test:boundaries`: 42 passed / 2 failed на существующих ограничениях
  размера/сложности canvas-workspace-controller, ShapeFormattingToolbar,
  styles, gesture-finish, drawing-payload и image-editing. Новый width helper
  вынесен отдельно, затронутые width-файлы не входят в итоговые violations:
  `artifacts/callout-width-boundaries-final.log`.

Native: `$env:CUTE_SCREEN_E2E_SCENARIOS='callout-editing'; $env:CUTE_SCREEN_E2E_DRIVER_PORT='5694'; $env:TAURI_WEBDRIVER_PORT='5695'; $env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/callout-target'; $env:CUTE_SCREEN_FRONTEND_DIST='D:/cutescreen/artifacts/callout-width-frontend'; pnpm test:e2e:tauri`.
Первый WebView2 155.0.4283.45 / external tauri-driver прогон passed 1/1:
production Capture → non-origin Quick → drag Callout → width/manual/cancel/auto
→ Editor handoff; trusted pointer/keyboard/contextmenu проверены существующим
сценарием (`artifacts/callout-width-native.log`). После финального compact hint
сборка passed, но перенос test helper совпал с загрузкой spec и дал duplicate
editorRect; helper исправлен, E2E tsc passed. Повтор на том же свежем pinned
binary: `artifacts/callout-width-native-runtime.ps1` — 1/1 passed, с отдельными
app data/UDF и сохранённым полным env. Логи: `artifacts/callout-width-native-final.log`,
`artifacts/callout-width-native-verified.log`; runtime evidence —
`artifacts/callout-width-webview/`, screenshot — `artifacts/tauri-e2e/callout-width-auto.png`.
Итоговый native PNG просмотрен: выровненная строка controls, компактный dropdown
и подпись выноски видны одновременно.
Linux/WebKitGTK и macOS/WKWebView для этой правки не запускались. Capture
fake-platform проверяет UI lifecycle, физический захват не заявляется.
`pnpm format` и `pnpm format:check` после изменений: логи
`artifacts/callout-width-format-complete.log` и `artifacts/callout-width-format-check-complete.log`.

## Миниатюра «Авто» у выноски (2026-10-18)

Windows x64 / PowerShell. Изменён только геометрический preview attachment
в `CalloutRouteSettings.vue`: карточка, соединитель с точкой и отдельная
контурная искра вместо двух стрелок. Размер preview остаётся 40×28 CSS px;
контракт общих 24×24 UiIcon и галерея не меняются.

- `pnpm test tests/unit/vue/callout-toolbar.test.ts tests/unit/vue/ui-icon.test.ts`:
  110/110 passed, exit 0, `artifacts/callout-auto-icon/unit.log`.
- `pnpm exec eslint packages/editor-vue/src/shell/components/CalloutRouteSettings.vue`:
  exit 0.
- `pnpm exec vitest run --project boundaries tests/boundaries/editor-core.test.ts`:
  5/5 passed, exit 0, `artifacts/callout-auto-icon/icon-boundary.log`.
- `pnpm test:boundaries`: exit 1, общие architecture/formatting timeout и шесть
  существующих нарушений размера/сложности в других файлах;
  `artifacts/callout-auto-icon/boundaries.log`.
- `pnpm format` и `pnpm format:check`: exit 0;
  `artifacts/callout-auto-icon/format.log` и `format-check.log`.
- `pnpm check`: lint, typecheck, format и docs прошли; exit 1 на общей
  architecture boundary (file-size ratchet и перечисленные выше нарушения
  сложности), `artifacts/callout-auto-icon/check.log`. Rust-этап не выполнялся.

Визуальная проверка: `pnpm icons:preview --mode e2e --port 5218 --strictPort`,
IAB, 1280×720, `/?m05=1` → Callout → ПКМ → Route. Просмотрены исходная
миниатюра `artifacts/callout-auto-icon/before.png`, итоговая EN/dark
`after-dark.png`, RU/light `after-light-ru.png`, RU/dark `after-dark-ru.png`
и настоящий keyboard focus `after-focus.png`. Искра отделена от карточки,
штрихи не обрезаны, соседние фиксированные стороны различимы. Left → Auto
сохраняет выбранное состояние; Tab/Shift+Tab показывает focus outline.
Тестовый документ монтируется штатным browser harness, выноска заранее
не создавалась; проверялся popover defaults. Browser engine version не снята.
Native Capture → Quick → Editor, 1024 px, DPR 2 и WebKit/WKWebView для этой
локальной правки не запускались и остаются pending.

## Chrome во время изменения Quick-рамки (2026-10-18, ADR-102)

Windows 10 x64, PowerShell, Node 22.23.1, pnpm 10.33.2.
`pnpm test tests/unit/vue/canvas-viewport-quick.test.ts tests/unit/vue/quick-capture-layout.test.ts tests/unit/vue/quick-context-toolbar.test.ts tests/unit/vue/quick-capture-warmup.test.ts`:
42/42 passed (`artifacts/quick-frame-unit-final.log`). Resize start/end,
pointercancel/Escape/blur, no annotation/full-editor signal и initial selection
mount покрыты. `pnpm lint` — 0 errors / 85 warnings
(`artifacts/quick-frame-lint.log`); app vue-tsc и E2E tsc passed
(`artifacts/quick-frame-app-types.log`, `artifacts/quick-frame-e2e-types.log`).

Native команда: `CUTE_SCREEN_E2E_SCENARIOS=quick-chrome`,
`CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e`,
`CUTE_SCREEN_FRONTEND_DIST=D:/cutescreen/artifacts/quick-frame-frontend`,
`CUTE_SCREEN_E2E_DRIVER_PORT=5784`, `TAURI_WEBDRIVER_PORT=5785`,
`pnpm test:e2e:tauri`: 7/7 passed на WebView2 155.0.4283.45 / external
tauri-driver, fresh pinned binary. Лог `artifacts/quick-frame-native-final.log`.
Production Capture → Quick, trusted pointer, held resize до узкой области,
hidden Actions/ToolRail/defaults, release, одна Undo/Redo, Escape без закрытия,
прежние palette/settings/selection/Copy и Quick → Editor прошли.
Просмотрены `artifacts/tauri-e2e/quick-frame-during-resize.png` и
`artifacts/tauri-e2e/quick-frame-after-resize.png`: рамка и badge видны в обоих,
chrome отсутствует при удержании и возвращается после него.
Первый run (`artifacts/quick-frame-native.log`) имел 6/7 passed: новый тест
автоматически release-ил pointer перед assertion; исправлен на `perform(true)`.
Это fake-platform UI evidence, не physical capture; отдельный browser run,
Linux/WebKitGTK и macOS/WKWebView для этой правки не запускались.
`pnpm format` passed (`artifacts/quick-frame-format.log`), docs links passed
(`artifacts/quick-frame-docs.log`). `pnpm check` остановился на параллельно
изменённом `tests/e2e/specs/browser-callout-visual.e2e.ts:46` (max-len 136/120),
до typecheck/format/Rust stages: `artifacts/quick-frame-check.log`.
Финальные `pnpm format` и `pnpm format:check` passed
(`artifacts/quick-frame-format-final.log`, `artifacts/quick-frame-format-check.log`).
`pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` и scoped ESLint пяти
затронутых TS-файлов passed (`artifacts/quick-frame-test-types.log`,
`artifacts/quick-frame-scoped-lint.log`).

## Общая тема окна настроек (2026-10-18)

Windows 10 x64, PowerShell, Node 22.23.1, pnpm 10.33.2.
`pnpm test tests/unit/vue/settings-locale.test.ts tests/unit/vue/settings-navigation.test.ts`:
8/8 passed; сохранённые light/dark при mount/remount, live preference,
system media change, освобождение listener и прежняя навигация/recorder.
Лог: `artifacts/settings-theme-unit.log`.
Целевой ESLint SettingsApp и обоих тестов passed:
`artifacts/settings-theme-lint.log`. `pnpm format` passed;
`pnpm format:check` прошёл Prettier, но нашёл два нарушения отступов
в стороннем `tests/unit/vue/app-shell-layout.test.ts` (72, 80).
Логи: `artifacts/settings-theme-format.log`, `artifacts/settings-theme-format-check.log`.

Native command: `CUTE_SCREEN_E2E_SCENARIOS=editor-settings`,
`CUTE_SCREEN_E2E_DRIVER_PORT=5664`, `TAURI_WEBDRIVER_PORT=5665`,
`CARGO_TARGET_DIR=D:/cutescreen/artifacts/window-capture-target`,
`CUTE_SCREEN_FRONTEND_DIST=D:/cutescreen/artifacts/settings-theme-frontend`,
`pnpm test:e2e:tauri`. Отдельный frontend/target и порт обходят занятые
параллельными задачами default build/driver. Лог: `artifacts/settings-theme-native.log`.
Первый запуск подтвердил dark атрибут после production открытия, затем упал
на `__name` в добавленной nested callback проверки цветов; callback исправлен.
Повторная сборка (`artifacts/settings-theme-native-final.log`) остановилась
на отсутствующих generated package outputs во время параллельной очистки.
`vue-tsc --noEmit -p apps/desktop/tsconfig.json` passed; проверка tests/tsconfig
обнаружила стороннее расхождение CaptureOutcomeV2 в public-api-contract.test.ts:21
(`artifacts/settings-theme-types.log`).

Финальная проверка: `& ./artifacts/settings-theme-native.ps1` — 2/2 passed
на WebView2 155.0.4283.45 / external tauri-driver, 2026-10-18 13:17 MSK.
Это повтор WDIO на свежем pinned binary из успешной штатной сборки
(`artifacts/settings-theme-native-retry.log`), после startup timeout драйвера;
исходники приложения с момента сборки не менялись. Точный bootstrap/env
сохранён в указанном PowerShell artifact, отдельные app data/UDF и порт 5684.
Исполняемая команда: `node node_modules/@wdio/cli/bin/wdio.js run tests/e2e/wdio.tauri.conf.ts --spec tests/e2e/specs/tauri-editor-settings.e2e.ts`.
Лог: `artifacts/settings-theme-native-verified.log`; backend/frontend/worker,
JUnit и screenshots — `artifacts/settings-theme-webview/`.
Проверены actual computed colors, dark native color-scheme, live light/dark,
singleton, раздел и тема после повторного открытия, прежний capture/cleanup.
Во вспомогательном тесте устранены чтение footer до snapshot и обращение
к закрытому current handle: возврат идёт по сохранённому main handle.
PNG general dark и live light просмотрены; Linux/macOS runtime pending.
Финальный `pnpm format` passed (`artifacts/settings-theme-format-final.log`);
`tsc --noEmit -p tests/e2e/tsconfig.json` passed (`artifacts/settings-theme-e2e-types.log`).
Финальный `pnpm format:check` прошёл Prettier, но остановился на стороннем
EmojiFormattingToolbar.vue:270 (`vue/max-attributes-per-line`), появившемся
после общего format; `artifacts/settings-theme-format-check-final.log`.
Полный `pnpm check` не подтверждён: запуск остановлен до package cleanup,
чтобы не пересечься с native build; целевые результаты приведены выше.

## Подпись открытия изображения (2026-10-18)

Windows x64, PowerShell: удалено многоточие в общем RU/EN переводе openImage,
который используют кнопка, tooltip, accessible name и пустой холст.
`pnpm test --project vue tests/unit/vue/app-content-actions.test.ts tests/unit/vue/app-arrow-actions.test.ts`:
2 файла, 21/21 passed; jsdom сообщает об отсутствующем Canvas getContext.
Native export selectors обновлены; browser и real WebView для этой текстовой
правки не запускались. `pnpm format` выполнен, но завершился ошибкой из-за
16 max-len нарушений в других файлах; лог `artifacts/open-image-label-format.log`.
`pnpm format:check` остановился на форматировании `apps/desktop/src/styles.css`;
лог `artifacts/open-image-label-format-check.log`. Целевой ESLint четырёх
изменённых TS-файлов и Prettier check четырёх изменённых документов прошли.

## Линия (2026-10-18, ADR-100)

Windows 10 Home x64, Node 22.23.1, pnpm 10.33.2. Текущее дерево содержит
параллельные правки других инструментов, Quick actions и native capture.

- Red-first: `pnpm exec vitest run --project core packages/editor-core/src/line.test.ts`
  ожидаемо упал до появления line module; `artifacts/line-red.log`.
- `pnpm test packages/editor-core/src/line.test.ts packages/editor-core/src/arrow-geometry.test.ts packages/editor-core/src/drawing.test.ts packages/editor-core/src/drawing-preferences.test.ts packages/editor-core/src/styles.test.ts packages/editor-core/src/document/codec.test.ts tests/unit/vue/line-tool.test.ts tests/unit/vue/tool-ux.test.ts`:
  88/88 passed, `artifacts/line-regression-final.log`. Проверены серии, undo/redo,
  5°/8° hysteresis, Shift, Alt, короткий жест, Escape/blur/pointercancel,
  independent defaults, physical L/Z, locked/read-only, codec/clipboard/duplicate,
  старые arrows без наконечников и world-space endpoint повёрнутого слоя.
- `pnpm test:render tests/harness/render/line.test.ts`: 1/1 passed;
  `artifacts/line-render-final.log`. Реальный screenshot hero-admin.png помещён
  на 3840×2160 backing; horizontal/vertical/diagonal × solid/dashed/dotted.
  Повторно декодированы оба backend PNG; Canvas2D preview/export exact,
  CanvasKit semantic parity. Просмотрены `artifacts/line/4k-canvas2d.png` и
  `artifacts/line/4k-canvaskit.png`.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_BROWSER_E2E_PORT='5209'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-line.e2e.ts --mochaOpts.timeout=180000`:
  2/2 passed на Chrome 155.0.8059.80; `artifacts/line-browser-acceptance.log`.
  Trusted pointer input, серии, изменение endpoint и стиля, короткий жест,
  Escape, L/Z, RU/EN × light/dark × 1024 px и zoom 50/100/200%.
  Просмотрен `artifacts/browser-e2e/line-1024-ru-dark.png`: controls, подсказка
  и линия видны вместе; popover остаётся внутри viewport.
- `pnpm test:perf`: 6/6 passed, `artifacts/line-perf.log`.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed;
  `artifacts/line-e2e-types-final.log`. `pnpm docs:check`: passed,
  `artifacts/line-docs.log`.
- `pnpm format`, `pnpm format:check`, `pnpm check`, `pnpm typecheck` выполнены.
  Общие gates менялись вместе с параллельными emoji/Quick actions правками:
  format отмечал max-len в emoji, typecheck — QuickCaptureActions/history icon
  и ещё не реализованный saveToHistory в другом тесте. Первая сборка столкнулась
  с удалением package outputs параллельной сборкой; повтор собрал свежий binary.
  Логи: `artifacts/line-format-final.log`, `artifacts/line-format-check.log`,
  `artifacts/line-check-final.log`, `artifacts/line-typecheck-rerun.log`,
  `artifacts/line-test-types.log`.

Native Windows WebView2 155.0.4283.45, external tauri-driver 2.1.0 / service 1.3.0:
`$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='line,line-reopen'; pnpm test:e2e:tauri`
— 2/2 passed, exit 0; `artifacts/line-native-focused.log`. Production Capture →
non-origin Quick → Editor → relaunch восстановил шесть semantic lines, Dotted,
width 6 и выключенное выравнивание; Arrow defaults остались 3 px. Native pointer
isTrusted=true; verified endpoint edit, cancellation and final decoded system
clipboard PNG with actual red annotation pixels. Просмотрены
`artifacts/tauri-e2e/line-quick-defaults.png` и `artifacts/tauri-e2e/line-reopened.png`.

Диагностические неуспехи сохранены в line-native*.log: неверный старт crop gesture,
выбор области без учёта crop/chrome, сравнение handoff без integer-pixel rounding
и чтение harness snapshot до mount. Исправлены только сценарии: native focus,
ожидание готовой области/документа и правильное сравнение округлённого crop.
Одновременные чужие native runners и build-directory locks давали отдельные
помехи; успешный финальный прогон использовал свежий pinned binary и один driver.

Дополнительно `pnpm exec vue-tsc --noEmit -p apps/desktop/tsconfig.json` passed
(`artifacts/line-app-types-final.log`). Tests typecheck дошёл до отдельного
CaptureOutcomeV2/public-api-contract расхождения из Quick history правки;
`artifacts/line-tests-types-final.log`. Scoped ESLint: 0 errors / 24 existing
ArrowFormattingToolbar attribute-order warnings, `artifacts/line-scoped-lint.log`.
Финальный `pnpm format` passed (`artifacts/line-format-final.log`).
Финальный `pnpm check` прошёл lint и сборку пакетов, затем остановился на
`tests/boundaries/public-api-contract.test.ts:21`: CaptureOutcomeV2 расходится
с отдельным контрактом Quick history; `artifacts/line-check-complete.log`.
Финальный `pnpm format:check` passed — `artifacts/line-format-check-result.log`;
Markdown links — `artifacts/line-docs-complete.log` (passed).
Иконка landing генерируется общим `node scripts/generate-landing-icons.mjs`;
`artifacts/line-landing-icons.log`.

Дополнительный mounted regression `pnpm exec vitest run --project vue
tests/unit/vue/line-tool.test.ts` — 8/8 passed
(`artifacts/line-mixed-green.log`). Сначала `line-mixed-red.log` воспроизвёл
неверную толщину при смешанном выделении; теперь толщина и стиль показывают
смешанные значения независимо, групповая правка отменяется одним undo.

Уточнение компактной панели по отзыву пользователя: magnet/magnet-off через
UiIcon, кнопка 32 px без подписи и постоянной инструкции. `pnpm exec vitest run
--project vue tests/unit/vue/line-tool.test.ts tests/unit/vue/ui-icon.test.ts` —
114/114 passed (`artifacts/line-magnet-unit.log`). Browser line suite — 2/2 passed
(`artifacts/line-magnet-browser.log`), включая RU/EN, light/dark и 1024 px;
просмотрен `artifacts/browser-e2e/line-compact-ru-dark.png`. `pnpm format` и
`pnpm format:check` — passed (`artifacts/line-magnet-format.log`,
`artifacts/line-magnet-format-check.log`).
macOS
WKWebView и Linux WebKitGTK не проверены; fake capture не является physical
platform capture evidence.

## Углы рамки изображения (2026-10-18, ADR-097)

Windows x64, Node 22.23.1, pnpm 10.33.2. Перед исправлением
`pnpm exec vitest run --project core packages/editor-core/src/document/scene/image-paint.test.ts`
дал 3 failed / 4 passed; новый decoded renderer regression — 2 failed.
Логи: `artifacts/image-square-core-red.log`, `artifacts/image-square-render-red.log`.
После исправления `pnpm exec vitest run --project core --project render-harness packages/editor-core/src/document/scene/image-paint.test.ts tests/harness/render/image-border-corners.test.ts`
дал 9/9 passed. Round/bevel/miter в persisted payload не меняются; в сцене miter.
Реальный source `ui-4k.png` декодируется обоими backend, рамка 26/32 px,
radius 0/80, четыре внешних угла и точное Canvas2D preview/export RGBA equality.
PNG: `artifacts/image-square/{canvas2d,canvaskit}-{26,32}-{0,80}.png`;
нулевые и положительные углы проверены по pixels, Canvas2D 26/0 просмотрен.

`pnpm test:render`: 49 passed / 2 failed, оба failures в параллельной работе
`emoji-assets.test.ts` (asset provenance и Canvas2D scratch surface); image
regressions прошли. Лог: `artifacts/image-square-render.log`.
`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: exit 0.
Финальный focused run после форматирования и исправления type-only аргумента
test harness: 9/9 passed (`artifacts/image-square-focused-final.log`).
Browser: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_BROWSER_E2E_PORT=5316`,
`CUTE_SCREEN_E2E_DISABLE_WATCH=1`;
`pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-editing.e2e.ts`:
1/1 case passed, внутри все 8 сочетаний 1024/1600 × RU/EN × light/dark.
Chrome 155.0.8059.80, production G import, максимальный radius → рамка 32 →
radius 0, четыре corner pixels, undo/redo и точное восстановление исходного
документа. Лог: `artifacts/image-square-browser.log`; screenshots
`artifacts/browser-e2e/image-edit-*-radius-zero.png`, 1024-en-light просмотрен.

`pnpm test` остановлен после обнаруженного failure в
`tests/unit/vue/app-shell-layout.test.ts` (Quick chrome contract), без общего
итогового счётчика; это не успешный full-unit gate.
Лог: `artifacts/image-square-unit.log`. Первый `pnpm lint` имел 2428 errors
в текущем дереве; `pnpm format` исправил доступное форматирование, но завершился
с 16 max-len errors в параллельных emoji/CanvasWorkspace/contracts правках.
Scoped ESLint formatting четырёх затронутых TS-файлов — exit 0.
Логи: `artifacts/image-square-{lint,format,scoped-format}.log`.
`vue-tsc --noEmit -p tests/tsconfig.json` первоначально также обнаружил
отсутствующий typefaces аргумент нового renderer test (исправлен) и отдельный
CaptureOutcomeV2 mismatch в `public-api-contract.test.ts`. Повторный typecheck
оставил только этот посторонний mismatch (`artifacts/image-square-test-types-final.log`).
Scoped обычный ESLint — exit 0 (`artifacts/image-square-scoped-lint.log`).
`pnpm check` завершился на lint: 16 errors / 85 warnings в текущих сторонних
правках; `pnpm format:check` — на изменённом параллельно
`apps/desktop/src/styles.css`. Логи: `artifacts/image-square-{check,format-check}.log`.
Финальный `pnpm format:check`: Prettier passed, ESLint formatting остановился
только на двух indent errors в параллельно изменённом
`tests/unit/vue/app-shell-layout.test.ts:72,80`.
Лог: `artifacts/image-square-format-check-final.log`.
`pnpm docs:check`: 38 Markdown files passed (`artifacts/image-square-docs-final.log`).

Native команда: `CUTE_SCREEN_E2E_SCENARIOS=content-image-tool`,
`CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e`,
`CUTE_SCREEN_FRONTEND_DIST=D:/cutescreen/artifacts/image-square-frontend`,
`CUTE_SCREEN_E2E_DRIVER_PORT=5772`; `pnpm test:e2e:tauri`.
Свежие packages/frontend и debug Tauri build прошли; binary закреплён runner.
Первый runtime start остановлен занятым другим сценарием портом 4445 после
30 s ожидания; WebView2 assertions не запускались. Лог: `artifacts/image-square-tauri.log`.
Повтор той же команды после освобождения порта, с
`CUTE_SCREEN_E2E_DRIVER_PORT=4444`, снова успешно собрал и закрепил binary.
WebView2 155.0.4283.45 создал session, но до первого действия теста получил
`no such window / web view not found`; 0 passed / 1 failed.
Captured backend log `artifacts/tauri-e2e/wdio-2026-10-18T10-06-25-506Z.log`
содержит первичный `bind() returned an error` / 0x2740 (10048).
Одновременно стартовал другой native run (launcher `10-06-25-488Z`);
его отдельный backend также сообщил migration failure. Чужие процессы и
профили не очищались. Лог повтора: `artifacts/image-square-tauri-retry.log`;
профиль сохранён runner в `artifacts/tauri-e2e/runtime/cute-screen-e2e-image-ingress-e40DK7`.
Image assertions и trusted input не достигнуты: real-WebView проверка остаётся
pending из-за startup/environment failure. Build success не считается runtime pass.

## Свёрнутый эффект выделителя (2026-10-18, ADR-095)

Windows 10 19045 x64, Node 22.23.1, pnpm 10.33.2; Chrome 155.0.8059.80,
WebView2 155.0.4283.45, WDIO service/Rust plugins 1.3.0, external tauri-driver 2.1.0.

- `pnpm exec vitest run --project vue tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/tool-ux.test.ts`:
  51/51 passed. Ручные режимы и Авто, loading/fallback, mixed/disabled/legacy,
  живые цвет/интенсивность (включая 0%), доступное описание и Escape/focus.
  Лог: `artifacts/highlighter-collapsed-vue-final.log`.
- Browser UI: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_BROWSER_E2E_PORT=5294`,
  `CUTE_SCREEN_E2E_DISABLE_WATCH=1`;
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter.e2e.ts --mochaOpts.grep="keeps straight separators" --mochaOpts.timeout=180000`.
  RU/EN × light/dark × 1024/1280: три ручных режима и Авто; кнопка 36 px,
  sample 36×24 px, отсутствие clipping, trusted pointer input. Декодированные
  screenshots подтверждают затемнение светлого и осветление тёмного фона.
  Лог: `artifacts/highlighter-collapsed-browser-matrix-final.log`.
- Native: PowerShell `$env:CUTE_SCREEN_E2E_SCENARIOS='highlighter'`,
  `$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'`,
  `$env:CUTE_SCREEN_FRONTEND_DIST='D:/cutescreen/artifacts/highlighter-collapsed-frontend'`,
  `$env:CUTE_SCREEN_E2E_DRIVER_PORT='5760'`; `pnpm test:e2e:tauri`.
  Свежая сборка, isolated profile, production Capture → Quick → Editor: 2/2 passed.
  Новый UI case проверяет RU/EN × light/dark в Editor 1024 px и fullscreen Quick,
  включая штатную кнопку Settings при скрытой автоматической строке. Второй case
  проверяет рисование, точный preview/commit checksum, палитру, undo/redo и trusted
  contextmenu/Escape. Лог: `artifacts/highlighter-collapsed-tauri-final.log`;
  повтор после ожидания menu animation — `artifacts/highlighter-collapsed-tauri-verified.log`.
- Просмотрены browser `highlighter-1024-ru-{light,dark}*` и native
  `highlighter-{editor,quick}-ru-{light,dark}*` PNG в `artifacts/browser-e2e` и
  `artifacts/tauri-e2e`. Снимки показывают controls вместе с canvas;
  `*-sample.png` дополнительно декодируются в тесте для проверки яркости.
- Начальный native run ожидал автоматически видимую строку при full-frame crop;
  после штатного открытия Settings тест исключает inert/aria-hidden экземпляр.
  Browser drawing regression обнаружил разные pointer sources при удержании и
  отпускании. Сценарий теперь использует один ID и сохраняет preview/commit PNG.
  Однако browser drawing case остаётся красным: checksum 2500640380 / 3415657837.
  Лог: `artifacts/highlighter-collapsed-browser-drawing-final.log`; это не успешный
  browser preview/commit gate. Native checksum проходит; renderer в этой правке не менялся.
- E2E TypeScript: `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0,
  `artifacts/highlighter-collapsed-e2e-typecheck-final.log`. Форматирование и общие
  проверки: `pnpm format`, `pnpm format:check`, `pnpm check`; логи
  `artifacts/highlighter-collapsed-{format-final,format-check-final,check-final}.log`.
  Итог общего gate оценивается отдельно от целевых UI/Vue/native проверок.
  Все три общие команды завершились с exit 1 на параллельных правках Line/emoji
  и продолжающихся правках документации: max-len/structural-lines и общий
  Prettier gate вне файлов выделителя. Целевые ESLint/format checks проходят;
  `artifacts/highlighter-collapsed-focused-format.log`.

macOS/WKWebView и Linux/WebKitGTK не проверены; fake capture не доказывает
физический platform capture. Document schema, IPC и renderer не менялись.

## Отступ кнопки на пустом холсте (2026-10-18)

Windows x64, Chrome 155.0.8059.80. Кнопка открытия изображения имеет отступ
16 px от описания; иконка кнопки 18×18, иконка состояния 32×32.
`pnpm format`, `pnpm format:check` и `pnpm docs:check` — exit 0. Browser smoke:
`$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_BROWSER_E2E_PORT='5197'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep='renders loading and recoverable error states' --mochaOpts.timeout=120000`
— 1/1 passed. Первый запуск без timeout override превысил 30 s; повторный
сценарий завершился за 20.3 s. Логи: `artifacts/empty-state-browser.log`,
`artifacts/empty-state-browser-rerun.log`. Просмотрен screenshot
`artifacts/browser-e2e/m02-empty-focus-1024x700.png`: EN/dark, кнопка отделена
от описания, первый Tab фокусирует Capture. Browser mock сообщает об отсутствии
native file drop; это отдельное ограничение browser mode. Tauri не запускался:
в workspace уже выполнялся другой native runner. WebView2/macOS/Linux evidence
для этой правки pending. Итог форматирования: `artifacts/empty-state-format.log`
и `artifacts/empty-state-format-check.log`.

## Изолированный снимок окна (2026-10-18, Windows, ADR-091)

Windows 10 Home 19045 x64, WebView2 155.0.4283.45, interactive desktop 1920×1080.

- Red-first `cargo test -p cute-screen-desktop --lib window_selection` упал
  на отсутствующих Candidate/Rect/Selection. Финальные 7/7 passed:
  `artifacts/window-capture-core-final.log`. Отдельный red-first тест независимой
  Windows Window/Desktop capability: `artifacts/window-capture-capability-red.log`.
  Финальный `cargo test --workspace`: desktop 141 passed / 1 interactive probe
  ignored, storage 30 passed, integration 1 passed;
  `artifacts/window-capture-rust-workspace-final.log`.
- `pnpm exec vitest run --project vue tests/unit/vue/window-capture-recovery.test.ts`:
  3/3 passed: unavailable → explicit Area/focus, RU invalidTarget/Escape,
  quiet cancellation/listener cleanup; `artifacts/window-capture-vue-final.log`.
  Focused Vue + build-contract suite: 16/16 passed;
  `artifacts/window-capture-focused-final.log`.
- Свежая локальная `pnpm tauri build --debug --no-bundle` внутри stable runner
  и `pnpm test:e2e:tauri` с `CUTE_SCREEN_E2E_SCENARIOS=window-capture`,
  `CUTE_SCREEN_FRONTEND_DIST=D:/cutescreen/artifacts/window-capture-frontend`,
  `CARGO_TARGET_DIR=D:/cutescreen/artifacts/window-capture-target`,
  `CUTE_SCREEN_CAPTURE_DEBUG=1`, `CUTE_SCREEN_E2E_DRIVER_PORT=5660`: passed.
  External driver, отдельный профиль, реальный WinForms target и перекрывающее
  magenta-окно, native SendInput; fake pixels запрещены сценарием.
  Проверены Escape → повтор, initial hover, click, быстрые Tab/Shift+Tab/Enter,
  EN/dark и RU/light, production document mount и доступность Copy.
  Три PNG повторно декодированы через binary transport: 1386×893,
  контрольные pixels за перекрытием `[37,71,105,255]`, без magenta и selector.
  Лог `artifacts/window-capture-native-final.log`, результаты
  `artifacts/tauri-e2e/window-capture-decoded.json`, снимки
  `window-selector-{cancel,capture,keyboard,ru-capture}.png` и
  `window-editor-{capture,keyboard,ru-capture}.png` в той же папке.
- Native прогон выявил и закрепил исправления: WGC frame-pool пересоздаётся
  при отличии первого ContentSize от initial item.Size; Shift читается из
  очереди сообщений GetKeyState. Runner pin-ит свежий binary; frontendDist
  в Tauri override задаётся относительным путём, отдельный driver port избегает
  занятого 4444. Первые build/startup failures не считаются capture evidence.
- `pnpm test` запускался, но общий suite не завершён успешно: failures в
  preview-resolution/loupe-connector/m08-precision-guides и повторяющийся
  jsdom canvas output; собственный зависший запуск остановлен.
  `artifacts/window-capture-tests.log`. Browser-shell smoke остановился на
  ожидании highlighter toolbar, вне Window (`artifacts/window-capture-browser.log`).
  Area exclusion smoke получил pixels другого запущенного Cute Screen поверх
  fixture; это не Window evidence и не успешный Area regression smoke.

`cargo fmt --all` и `cargo clippy --workspace --all-targets -- -D warnings` — exit 0.
Ранние `pnpm format`/`pnpm format:check` прошли; заключительный повтор застал
новые параллельные line-tool изменения: max-len в drawing/keyboard-controller/
pointer-move-controller и parsing error в drawing-schema.ts. Эти общие gates
в финальном состоянии не считаются passed. Логи
`artifacts/window-capture-{format,format-check,clippy-final}.log`.
`pnpm check`: lint, typecheck, format и docs passed, остановка на architecture
boundaries. Новый event listener перенесён в platform/tauri facade; повторный
focused Vue + architecture suite даёт 8 passed / 2 failed, только сторонние
size/complexity budgets ShapeFormattingToolbar, drawing-payload и image-editing.
Логи `artifacts/window-capture-check-final.log` и
`artifacts/window-capture-boundaries-final.log`. Полный check не считается passed.
Отдельные `pnpm check:rust` (все четыре feature-конфигурации Clippy),
`pnpm ipc:check`, `pnpm exec vue-tsc --noEmit -p apps/desktop/tsconfig.json`
и `pnpm docs:check` — exit 0. App types проверены до последней параллельной
line-tool правки. Логи `artifacts/window-capture-{rust-gates,ipc,app-types,docs}-final.log`.
Scoped ESLint для Window UI/adapter/native E2E/runner —
`artifacts/window-capture-scoped-lint-final.log`.

Pending: Windows 11, DPI 125/150/200%, отрицательные координаты и несколько
мониторов, физические tray/hotkey/CLI/Alt+Tab, close/resize/error recovery;
macOS Intel/Apple Silicon по трём API-диапазонам (compile и runtime), Linux X11
с compositor/без и GNOME/KDE Wayland с Window target/без. Rust cfg(test) X11
не заменяет Linux runtime. Наличие platform code не расширяет эти гарантии.

## Два режима карандаша и краткие подсказки (2026-10-18, ADR-094)

Windows x64, Node 22.23.1, pnpm 10.33.2. Доступны pen/stabilized; старые brush
payload читаются для undo/read-only. Editable session выполняет одну проверяемую
миграцию, сохраняет samples/spans/appearance/transforms и пересчитывает bounds.

- Red-first `pnpm exec vitest run --project core packages/editor-core/src/brush-migration.test.ts`:
  10/10 failed до реализации; `artifacts/brush-retirement-red.log`.
- `pnpm test packages/editor-core/src/brush-migration.test.ts packages/editor-core/src/brushes.test.ts packages/editor-core/src/straight-stroke.test.ts tests/unit/vue/brushes.test.ts tests/unit/vue/tool-formatting-toolbar.test.ts tests/unit/vue/document-session.test.ts`:
  63/63 passed; `artifacts/brush-retirement-unit.log`.
- Расширенный `pnpm test` с `tests/unit/vue/ruler-toolbar.test.ts` и
  `tests/unit/vue/tool-ux.test.ts`: 100 passed / 1 failed; единственный failed —
  параллельно изменяемый mixed-shape gradient UI, вне карандаша.
  `artifacts/brush-retirement-unit-final.log`.
- Финальный `pnpm test tests/unit/vue/brushes.test.ts tests/unit/vue/document-session.test.ts packages/editor-core/src/brush-migration.test.ts`:
  33/33 passed; `artifacts/brush-retirement-migration-final.log`. Legacy/v2/v3,
  hidden/locked, invalid correction fallback, pen pressure, stale/tampered command,
  один undo/redo, save/retry/reopen/handoff и mounted legacy/unified preferences
  с сохранением 80% проверены. Defaults не создают document history.
- `pnpm test:render tests/harness/render/golden-brushes.test.ts`: 3/3 passed;
  `artifacts/brush-retirement-render.log`. 1200 samples на 3840×2160;
  повторно декодированы Canvas2D preview/export и CanvasKit export.
- Browser Chrome 155.0.8059.80: первый полный повтор дал 10 passed / 2 failed.
  Все drawing/Shift cases и ruler tooltip прошли. Две причины в тестах исправлены:
  legacy preference fixture оставляла более приоритетное unified хранилище;
  tooltip selector выбирал скрытый предыдущий tooltip Naive UI.
  `artifacts/brush-retirement-browser-final.log`. Снимки двух кистей RU/EN ×
  light/dark при 1024 px — `artifacts/browser-e2e/brushes-1024-*.png`;
  RU/dark просмотрен, панель и видимые штрихи помещаются в viewport.
- Follow-up той же browser-команды с `--mochaOpts.timeout=120000 --mochaOpts.grep='restores expressive|keeps.*tooltips'`:
  3/3 passed; `artifacts/brush-retirement-browser-followup.log`. Восстановление
  80% и точные RU/EN tooltip pencil/marker/ruler подтверждены. Среда:
  `CUTE_SCREEN_BROWSER_E2E_PORT=5197`, `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`,
  `CHOKIDAR_USEPOLLING=1`, `CHOKIDAR_INTERVAL=600000`.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed;
  `artifacts/brush-retirement-e2e-types-final.log`. Scoped ESLint по всем файлам
  этой правки — exit 0, два warning о существующих ariaLabel;
  `artifacts/brush-retirement-scoped-lint-final.log`.
  Полный `pnpm typecheck` блокировался
  параллельными ошибками типов ShapeGradientEditor/gradient paint;
  `artifacts/brush-retirement-typecheck.log`. В финальной проверке Vue tests
  ошибок migration/session нет; сторонние ошибки —
  `artifacts/brush-retirement-vue-types-final.log`.
- `pnpm check`, `pnpm format`, `pnpm format:check` выполнены; общие прогоны
  блокируются форматированием параллельных изменений callout/shape/history.
  Логи: `artifacts/brush-retirement-check-final.log`,
  `artifacts/brush-retirement-format.log`, `artifacts/brush-retirement-format-check.log`.
  Финальный `pnpm format:check`: Prettier passed, ESLint-format failed только на
  пяти ошибках в `tests/e2e/callout-editing.ts` и
  `tests/e2e/specs/browser-callout-empty.e2e.ts`;
  `artifacts/brush-retirement-format-check-final.log`.
  `pnpm docs:check` passed. `pnpm test:boundaries`: 38 passed / 5 failed:
  BrandMark inline SVG, существующие size/complexity gates в shape/image и
  таймауты обхода репозитория; `artifacts/brush-retirement-boundaries.log`.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='brushes,brushes-reopen,straight-strokes,straight-strokes-reopen,ruler-shift'; pnpm test:e2e:tauri`:
  fresh build failed до запуска WebView2. Финальная причина — TS2883 в
  `ShapeGradientEditor.vue`, inferred export ссылается на внутренний GradientStop.
  Это параллельная доработка фигур; не изменялась ради обхода проверки.
  `artifacts/brush-retirement-native-final.log`. Native Quick → Editor → reopen
  и миграция в настоящем WebView остаются pending; старый binary не запускался.

Окончательные browser/native результаты и границы платформ — PLATFORM_MATRIX.md.

## Заливка и пунктир фигур (2026-10-18, ADR-092)

Windows 10 x64, Node 22.23.1, pnpm 10.33.2. Исходное дерево содержит параллельные
изменения выносок/кистей/native selection; они сохранены.

- Red-first shape scene: 12 expected failures / 21 cases до реализации,
  `artifacts/shape-stroke-red.log`. Дополнительный snapshot test сначала
  провалился на mutable dash: `artifacts/shape-snapshot-red.log`.
- `pnpm test tests/unit/vue/shape-gradient.test.ts tests/unit/vue/shape-context-toolbar.test.ts`:
  18/18 passed на первом срезе, `artifacts/shape-vue.log`.
- `pnpm test:render tests/harness/render/shape-paint.test.ts`: 2/2 passed,
  `artifacts/shape-render-final.log`. Schema v7 round-trip, каталог всех фигур
  при трёх stroke styles и multi-stop alpha, decoded preview/export exact для
  Canvas2D, межbackend semantic tolerance. Оба PNG просмотрены:
  `artifacts/shape-paint/catalogue-{canvas2d,canvaskit}.png`.
- Browser: `pnpm test:e2e:browser --spec tests/e2e/specs/browser-shape-paint.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts`,
  headless Chrome 155.0.8059.80, отдельный свободный port. Новый gradient scenario
  прошёл RU/EN × light/dark × 1024/1280; полный итог —
  `artifacts/shape-browser-final.log`. PNG `shape-paint-gradient.png` просмотрен.
  Первый прогон выявил floating point ожидание 0.5 vs 0.49999999999999994;
  исправлено только сравнение точности координаты в тесте.

- Итоговый целевой `pnpm test` (shape-gradient, shape-context-toolbar, tool-ux,
  shape-stroke): 4 files / 74 tests passed, без unhandled errors;
  `artifacts/shape-focused-final.log`. Canvas mock для gradient draft дополнен
  createLinearGradient. Повторный gradient suite — 8/8,
  `artifacts/shape-gradient-focus-final.log`.
- Полный `pnpm test:render --testTimeout=30000`: 15 files / 46 passed,
  `artifacts/shape-render-suite-final.log`. Прежние shape goldens сохранены:
  ellipse contour явно закрыт, устранив seam от round cap.
- Изолированная browser проверка в `artifacts/shape-validation`: новый gradient
  scenario прошёл восемь сочетаний и zoom 50/100/200 с проверкой data-zoom;
  `artifacts/shape-snapshot-browser.log`. После длительной паузы окружения
  старый regression отдельно повторён: 4/4 passed,
  `artifacts/shape-snapshot-browser-regression.log`. PNG gradient, RU/light и
  zoom-200 просмотрены; панель и изменяемая фигура видны вместе.
- `pnpm format` выполнен; после исправления max-len новых тестов
  `pnpm format:check` passed, `artifacts/shape-format-check-final.log`.
- Последний `pnpm check` прошёл lint и package/frontend compilation, затем
  остановился на четырёх TS7006 в стороннем
  `tests/e2e/specs/tauri-quick-editor-handoff.e2e.ts` (157, 166, 175, 178):
  `artifacts/shape-check-verified.log`. Отдельный E2E typecheck после исправления
  нового export-read теста прошёл: `artifacts/shape-e2e-typecheck-final.log`.

Для согласованной native проверки текущие исходники скопированы в ignored
`artifacts/shape-validation`; зависимости установлены
`pnpm install --offline --frozen-lockfile --ignore-scripts`. Feature source files
сверены с основным деревом. Причины изоляции: конкурентное удаление package dist
и HMR во время проверок. Исходное дерево и параллельные изменения не откатывались.
Снимок не наследует directory override Rust, поэтому задан
`RUSTUP_TOOLCHAIN=1.97.0-x86_64-pc-windows-msvc`; без него GNU build требовал
отсутствующий dlltool. Native runner всегда собирает свежий binary и закрепляет
его копию перед запуском. Команда:
`CUTE_SCREEN_E2E_SCENARIOS=shape-paint,shape-paint-reopen pnpm test:e2e:tauri`,
`CARGO_TARGET_DIR=D:/cutescreen/target/shape-catalog-native`.

Native: 2 scenarios / 2 tests passed, WebView2 155.0.4283.45, external
tauri-driver, Windows x64. `artifacts/shape-native-pass.log`, pinned binary
`artifacts/shape-validation/artifacts/tauri-e2e/runtime/cute-screen-e2e-binary-u6kuQG/cute-screen.exe`.
Проверены trusted pointer input, non-origin crop, Quick → Editor, три точки,
alpha/position/angle/reverse, dashed/dotted и undo/redo, clipboard export с
повторным native чтением, восстановление двух фигур и defaults после relaunch,
создание третьей фигуры в пустой области. Native PNG editor-gradient и reopened
просмотрены. Это fake-platform capture в настоящем WebView2, без расширения
гарантий physical capture.

Подготовка native теста уточнена по фактическим failures: Quick явно получает
native focus; drag захватывает угол рамки при Windows scaling; handoff ожидает
production `.cs-canvas-ready`; после relaunch новая фигура рисуется в пустой
области, а не поверх handle сохранённого объекта. Эти изменения относятся к
сценарию, synthetic state/PointerEvent не добавлялись.

Общий первоначальный `pnpm test`: 144 files, 1267 passed / 3 failed, плюс
неполный canvas mock и timeout запуска worker после длительной паузы окружения
(`artifacts/shape-full-test.log`). Source/cache менялись во время этого прогона:
один тест видел новый тест добавления точки со старой версией компонента.
Целевой повтор после завершения изменений — 74/74, затем gradient — 8/8.
Изолированный полный повтор остановлен после двух renderer timeouts default 5 s;
`artifacts/shape-snapshot-full-test.log`. Их отдельный повтор стабильной командой
`pnpm test packages/editor-renderer/src/precision-canvas2d.test.ts packages/editor-renderer/src/preview-resolution.test.ts --testTimeout=30000`
— 25/25 passed, `artifacts/shape-renderer-timeout-recheck.log`. Общий unit gate
не объявляется зелёным; приведены фактические результаты отдельных прогонов.

## Живой взгляд бренда (2026-10-18, ADR-093)

После пользовательского review темп замедлен: приветствие 1500 ms,
сглаживание слежения 300 ms, возврат 500 ms. Повторная проверка на Windows x64,
Chrome 155.0.8059.80:

- `pnpm test tests/unit/vue/brand-eyes.test.ts`: 11 passed;
  `artifacts/brand-eyes-slower-unit.log`. Проверяется и медленная смена
  направления при слежении, и остановка RAF после успокоения.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_BROWSER_E2E_PORT='5299'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-brand-eyes.e2e.ts`:
  1 passed, RU/EN × light/dark; `artifacts/brand-eyes-slower-browser.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_LANDING_E2E_PORT='5300'; pnpm test:e2e:landing --mochaOpts.grep 'animates the inline brand'`:
  сборка и 1 scenario RU/EN passed; `artifacts/brand-eyes-slower-landing.log`.
- Scoped ESLint контроллера и unit-теста passed;
  `artifacts/brand-eyes-slower-lint.log`.
- `pnpm format` и `pnpm docs:check`: passed;
  `artifacts/brand-eyes-slower-format.log`, `artifacts/brand-eyes-slower-docs.log`.

Native WebView и WebKit/Safari с новыми длительностями отдельно не прогонялись;
native-доказательства ниже относятся к предыдущему темпу того же контроллера.

Windows x64, Node 22.23.1, pnpm 10.33.2; browser Chrome 155.0.8059.80.
Параллельные изменения рабочего дерева сохранены. Пасхалка использует один
DOM-only контроллер и generated inline SVG, без изменений scene/document/IPC.

- `pnpm icons:generate`: passed; `artifacts/brand-eyes-generate.log`.
  Generated Vue и RU/EN SVG используют прежнюю геометрию. Статические native
  assets сохранены без diff; повторная упаковка ICNS восстановлена из исходных
  байтов, поскольку изменение системной иконки не входит в этот срез.
- `pnpm test tests/unit/vue/brand-eyes.test.ts tests/unit/vue/app-arrow-actions.test.ts`:
  2 files / 22 tests passed; `artifacts/brand-eyes-tests-final.log`.
  Проверены приветствие/слежение/limits, ранний уход и re-entry, sleep/wake rAF,
  touch/reduced motion, live preference, blur/hidden/pagehide/cancel, dispose
  и настоящий TopBar mount/unmount. jsdom сообщает об отсутствующем Canvas2D
  в существующих editor fixtures; suite успешен, unhandled errors нет.
- `pnpm build:landing` и `pnpm build:frontend`: passed;
  `artifacts/brand-eyes-build-landing.log`, `artifacts/brand-eyes-build-frontend.log`.
  Landing JS — 4,31 kB, gzip 1,52 kB; E2E проверяет единственный небольшой bundle
  без Vue/Tauri/editor entry.
- `pnpm exec tsc --noEmit -p apps/landing/tsconfig.json` и
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed;
  `artifacts/brand-eyes-landing-types.log`, `artifacts/brand-eyes-e2e-types.log`.
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json`: passed;
  `artifacts/brand-eyes-vue-types-final.log`. В новом тесте тип container
  уточнён до HTMLElement; runtime 22-test result от этого не меняется.
- `pnpm test:boundaries tests/boundaries/editor-core.test.ts --testTimeout 30000`:
  5 passed; `artifacts/brand-eyes-boundaries.log`. Только generated BrandMark
  исключён из запрета inline SVG для UiIcon; отдельный тест проверяет общую
  геометрию с root logo и обоими HTML, не расширяя исключение на UI-иконки.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_LANDING_E2E_PORT='5294'; pnpm test:e2e:landing`:
  4 passed / 1 intentionally skipped no-JS case; `artifacts/brand-eyes-landing.log`.
  Реальный pointer проверяет оба направления приветствия, следование над
  названием, один pointerenter и возврат глаз, RU/EN, размеры и ссылки.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_LANDING_E2E_PORT='5298'; $env:CUTE_SCREEN_LANDING_NO_JS='1'; pnpm test:e2e:landing --mochaOpts.grep 'without JavaScript'`:
  1 passed; `artifacts/brand-eyes-no-js-final.log`. Chrome preference отключает
  JavaScript страницы: SVG 31 px виден, hover статичен, Tab/Enter переходят
  на главную, работают язык и якорь. Для ссылки меню viewport расширяется
  до 1440 px, поскольку mobile CSS скрывает этот пункт.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_BROWSER_E2E_PORT='5297'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-brand-eyes.e2e.ts`:
  1 passed / все RU/EN × light/dark; `artifacts/brand-eyes-browser-final.log`.
  Initial 30-second timeout был слишком коротким для четырёх последовательных
  вариантов; только лимит нового сценария увеличен до 120 seconds.
  Browser-only Tauri adapters печатают предупреждения; native evidence это
  не заменяет. Снимки `artifacts/brand-eyes/editor-{ru,en}-{light,dark}.png`
  и `artifacts/landing-e2e/brand-{ru,en}.png` просмотрены.
- Дополнительный размерный review: `node artifacts/brand-eyes/review.mjs`,
  `artifacts/brand-eyes/size-review.png` и `.json`; PNG просмотрен.
  16/20/24/30/31/32/36 px, светлый/тёмный фон и крайние смещения сохраняют
  силуэт/прищуры. Neutral raster отличается от compound-path baseline максимум
  на 2–3/255 в канале из-за композитинга antialiasing.

Первый `pnpm test:e2e:tauri` остановился до запуска на сторонних TS2883/TS2345
в `ShapeGradientEditor.vue`; `artifacts/brand-eyes-native.log`.
Повтор `$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='brand-eyes'; pnpm test:e2e:tauri`
также остановился до runtime: остался сторонний TS2883 при генерации декларации
`ShapeGradientEditor.vue`; `artifacts/brand-eyes-native-final.log`.
После исправления стороннего типа свежая native сборка прошла, но Windows
`tauri.cmd` вернул ошибку после линкования (`artifacts/brand-eyes-native-retry.log`).
`pnpm tauri` переведён на прямой Node CLI. Повторный `pnpm test:e2e:tauri`
успешно собрал и закрепил новый binary, затем внешний драйвер потерял окно до
первого действия (`artifacts/brand-eyes-native-verified.log`).

Финальная runtime-проверка того же свежего pinned binary прошла: Windows
WebView2 155.0.4283.45, external tauri-driver/EdgeDriver, 1 case / обе темы,
trusted pointerenter, приветствие в обе стороны, слежение над названием,
один вход, limits и возврат. `artifacts/brand-eyes-native-final-runtime.log`;
`artifacts/brand-eyes/native-{light,dark}.png` просмотрены.
В диагностике исправлен только E2E observer: именованная стрелочная функция
внутри сериализуемого execute превращалась в ссылку на отсутствующий `__name`.
Использован EventListenerObject; код приложения не менялся.
`artifacts/brand-eyes-native-diagnostic.log` сохраняет исходную ошибку helper.
Повторная компиляция для этой проверки не требовалась: использован binary
из успешной сборки выше, а не прежний установленный editor.

Параметры финального запуска (`pnpm exec wdio run tests/e2e/wdio.tauri.conf.ts --spec tests/e2e/specs/tauri-brand-eyes.e2e.ts`):

- `CUTE_SCREEN_WDIO_APP_BINARY=D:/cutescreen/artifacts/tauri-e2e/runtime/cute-screen-e2e-binary-JK6iZJ/cute-screen.exe`;
- `CUTE_SCREEN_E2E_SCENARIO=brand-eyes`, `CUTE_SCREEN_E2E_DRIVER_PROVIDER=external`,
  `CUTE_SCREEN_E2E_HARNESS_QUERY=?m04=1`;
- свежий GUID-каталог `artifacts/brand-eyes/native-profile-*` как
  `CUTE_SCREEN_E2E_APP_DATA`, его `webview2/` как `WEBVIEW2_USER_DATA_FOLDER`;
- `CUTE_SCREEN_WDIO_ARTIFACTS=D:/cutescreen/artifacts/brand-eyes/native-final`,
  TEMP/TMP — `D:/cutescreen/artifacts/tauri-e2e/runtime`, driver-cache добавлен в PATH.

`pnpm test:boundaries tests/boundaries/tauri-runner.test.ts --testTimeout 30000`:
2 passed; `artifacts/brand-eyes-runner-contract.log`. Неуспешная сборка
по-прежнему не запускает старый binary.

Ранние `pnpm check` и formatting gates останавливались на параллельных
shape/callout изменениях; `artifacts/brand-eyes-check.log`,
`artifacts/brand-eyes-format-final.log`, `artifacts/brand-eyes-format-check.log`.
Финальные `pnpm format`, `pnpm format:check` и `pnpm docs:check` passed:
`artifacts/brand-eyes-format-complete.log`,
`artifacts/brand-eyes-format-check-complete.log`, `artifacts/brand-eyes-docs-final.log`.
Scoped ESLint всех файлов этого среза passed, `artifacts/brand-eyes-lint-final.log`;
исправленный helper — `artifacts/brand-eyes-helper-lint.log`.
Отдельная проверка типов helper passed: `pnpm exec tsc --ignoreConfig --noEmit --target ES2023 --module ESNext --moduleResolution Bundler --skipLibCheck --types 'node,@wdio/globals/types' --lib 'DOM,ES2023' tests/e2e/brand-eyes.ts`,
`artifacts/brand-eyes-helper-types.log`.
Последний повтор `pnpm check` прошёл lint (только сторонние warnings), но
остановился при сборке history/highlighter workers: Vite не нашёл несколько
внутренних модулей `editor-renderer/dist` (`UNRESOLVED_IMPORT`),
`artifacts/brand-eyes-check-final.log`. Повтор общего E2E typecheck в том же
состоянии outputs также сообщил об отсутствующем `@cute-screen/editor-renderer`
и связанных сторонних implicit-any; `artifacts/brand-eyes-e2e-types-final.log`.
Ранние успешные typechecks и сборки выше не подменяют этот итог общего gate.
WebKit/Safari/WKWebView и Linux runtime пока pending.

## Подписи кнопок и крестик истории (2026-10-18)

Windows x64, Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.80.
В истории «Очистить»/«Хранение», в editor settings «Настройки приложения»
без многоточий в RU/EN. UiIcon close — 18×18 CSS px, кнопка — 32×32.

- `pnpm test tests/unit/vue/history-popover.test.ts tests/unit/vue/editor-settings.test.ts`:
  12/12 passed; confirmation/commit/cancel/error/retry, disabled и pending.
  Лог: `artifacts/history-labels-vue.log`.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: exit 0;
  `artifacts/history-labels-e2e-types.log`. Scoped ESLint по затронутым Vue/TS
  и selectors: exit 0, один прежний stub warning; `history-labels-lint.log`.
- Browser: `CUTE_SCREEN_BROWSER_E2E_PORT=5274`,
  `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_E2E_DISABLE_WATCH=1`;
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-history.e2e.ts --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep 'compact recent history|overflow menu|localized menu|opens from Enter|persists preferences'`:
  7 passed, expanded history matrix превысила прежние 30 s без failed assertion.
  После установки timeout 120 s:
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-history.e2e.ts --mochaOpts.grep 'keeps the popover bounded'`:
  1/1 passed. Итого все 8 выбранных cases прошли. Логи:
  `artifacts/history-labels-browser.log`, `history-labels-browser-matrix.log`.
  Проверены RU/EN × light/dark на 1024 px, дополнительные desktop sizes,
  размеры/центрирование крестика, click/Escape/focus и подтверждение очистки.
  Просмотрены `artifacts/browser-e2e/history-dark-ru-1024.png`,
  `history-light-en-1024.png`, `topbar-menu-1024-ru-dark.png`.
- PowerShell: `$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='history-settings,editor-settings'; pnpm test:e2e:tauri`:
  exit 1 до запуска сценариев. Свежий beforeBuildCommand блокируется TS2883
  в текущем `ShapeGradientEditor.vue`: inferred component type ссылается на
  GradientStop через renderer/node_modules. Лог: `artifacts/history-labels-native.log`.
  Native сценарии обновлены, но WebView2 evidence для этой правки pending;
  старый executable не использовался. Установлен external tauri-driver 2.1.0,
  WDIO service/Rust plugins 1.3.0. Linux/macOS runtime не проверялись.
- `pnpm format`: exit 1, шесть max-len errors в текущих shape-gradient/paint/
  context-toolbar/tool-ux изменениях; `artifacts/history-labels-format.log`.
  `pnpm check`: exit 1 на lint, те же ошибки и unused `_record` в
  `document-session.test.ts`; `artifacts/history-labels-check.log`.
  Эти файлы вручную в рамках правки не менялись.
- Финальный `pnpm format:check`: exit 1, Prettier passed; шесть max-len errors
  в текущих shape-stroke/validation/gradient/callout-editing/shape-paint файлах,
  вне правки. Лог: `artifacts/history-labels-format-check.log`.
  Отдельные Prettier и ESLint-format по затронутым файлам — exit 0;
  `history-labels-scoped-prettier.log`, `history-labels-scoped-format.log`.
  `pnpm docs:check`: exit 0, 38 Markdown files; `history-labels-docs.log`.

## Выноска: empty, curve и Alt removal (2026-10-18, ADR-090)

Windows x64, Node 22.23.1 / pnpm 10.33.2. Во время работы в общем checkout
появились независимые изменения кистей и линейки; они не откатывались.

- Red-first: `pnpm exec vitest run --project core packages/editor-core/src/callout-revision.test.ts`
  — 11 ожидаемых failures до реализации, `artifacts/callout-revision-red.log`.
- Итоговый focused core/Vue: `pnpm exec vitest run --project core packages/editor-core/src/callout-revision.test.ts packages/editor-core/src/callout-editing.test.ts packages/editor-core/src/callout-geometry.test.ts --project vue tests/unit/vue/callout-toolbar.test.ts tests/unit/vue/text-context-toolbar.test.ts tests/unit/vue/rich-text-editing-component.test.ts tests/unit/vue/m08-precision-guides.test.ts --maxWorkers=1 --testTimeout=30000`
  — 7 files / 76 tests passed после последнего исправления Alt, без unhandled errors,
  `artifacts/callout-revision-focused-release.log`.
- Дополнительный red-first для measured accent: fixed attachment detour менял
  направление касательной с учётом реальной ширины текста. Red log:
  `artifacts/callout-revision-measured-accent-red.log`; исправленный core — 12/12.
- `pnpm test:render --maxWorkers=1 --testTimeout=30000` — 15 files / 46 tests passed. Новый 2560×1440 test повторно
  декодирует Canvas2D/CanvasKit PNG с пустой/изогнутой выноской; сохранённая пустая
  карточка с padding 256 не оставляет пикселей. Preview/export Canvas2D совпадают.
  Четыре стороны акцента проверяются пикселями. Log:
  `artifacts/callout-revision-render-final.log`.
- Production browser Chrome 155.0.8059.80: `pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-editing.e2e.ts --spec tests/e2e/specs/browser-callout-empty.e2e.ts --spec tests/e2e/specs/browser-callout-layout.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts --mochaOpts.timeout=180000`
  при `CUTE_SCREEN_BROWSER_E2E_PORT=5277`, HEADLESS=1, DISABLE_WATCH=1 —
  4 specs / 5 tests passed. Проверены production создание, пустой commit/reopen,
  bend/straighten, адресное Alt removal, Escape/release Alt/drag cancellation,
  undo/redo, измеренный перенос и width UI. RU/EN × light/dark × zoom 50/100/200,
  1024 px — все 12 сочетаний passed. Log:
  `artifacts/callout-revision-browser-complete.log`.
  Просмотрены screenshots `artifacts/browser-e2e/callout-endpoints-controls.png`,
  `callout-line-controls.png`, `callout-route-controls.png`, `callout-remove-step-preview.png`,
  `callout-empty-captioned.png`, `callout-ru-dark-200.png` в том же каталоге.
- Первый `pnpm test --maxWorkers=2` на общем меняющемся checkout:
  134 files passed / 7 failed, 1210 tests passed / 15 failed, 2 unhandled errors.
  Log: `artifacts/callout-revision-unit.log`. Падения касались history/m08/shape/
  ui-icon и 5 s timeouts. Два Alt guide failures были регрессией лишнего
  invalidation: обновление removal preview ограничено выделенными callout,
  выполняется после обработки keyboard state и при blur. Повторный
  `pnpm exec vitest run --project vue tests/unit/vue/m08-precision-guides.test.ts tests/unit/vue/rich-text-editing-component.test.ts --maxWorkers=1 --testTimeout=30000`
  — 31/31 passed, `artifacts/callout-revision-alt-regression.log`.
  Два unhandled errors относились к синтетическому
  lostcapture без координат в callout component fixture; fixture исправлена,
  повторные 21 editing tests и focused 66 проходят без unhandled errors.
  Повтор `pnpm test --maxWorkers=2 --testTimeout=30000` был остановлен после
  `Timeout terminating forks worker` для `preview-resolution.test.ts` и отсутствия
  итогового отчёта; завершённым прогоном он не считается. Частичный log:
  `artifacts/callout-revision-unit-complete.log`. Чужие процессы не останавливались.

WebKitGTK/macOS и physical capture этим изменением не подтверждаются.

Первый native build создал свежий executable (`Finished dev`, 5m32s), затем
Windows tauri.cmd wrapper вернул ошибку с обрезанным командным путём; launcher
правильно отказался запускать бинарник после nonzero build exit. Log:
`artifacts/callout-revision-native.log`. Runner теперь вызывает установленный
Tauri JS CLI через `process.execPath` без cmd wrapper; стабильная pnpm-команда,
проверка build exit и pinning свежего executable сохраняются.
Boundary fixture обновлена для прямого JS CLI: `tauri-runner.test.ts` — 2/2 passed.

WebView2 155.0.4283.45, external tauri-driver 2.1.0: два production native
сценария `callout-editing,callout-editing-reopen` — 2/2 passed после последней
изоляции Alt refresh, `artifacts/callout-revision-native-release.log`.
Команда: `pnpm test:e2e:tauri`, `CUTE_SCREEN_E2E_SCENARIOS=callout-editing,callout-editing-reopen`,
`CARGO_TARGET_DIR=D:/cutescreen/artifacts/callout-target`, `CARGO_BUILD_JOBS=4`,
`TAURI_WEBDRIVER_PORT=4497`. Fresh build/pinned executable подтверждён launcher.
Quick использует fake capture 400×300, реальную боковую ручку обрезки
(crop x=48, width=352), затем полноценные pointer/key/contextmenu события.
Все записанные `isTrusted` равны true (1 contextmenu, 92 keydown, 71 pointer): `artifacts/tauri-e2e/callout-crop-input.json`,
`callout-input-trust.json`. Верхний угол у y=1 попадал в native resize border;
этот неуспешный setup сохранён в `artifacts/callout-revision-native-complete.log`.
Просмотрены native `callout-remove-step-preview.png`, `callout-reopened.png`, `callout-empty.png`.

Итоговые общие проверки: `pnpm format` и `pnpm format:check` — passed;
`pnpm docs:check` — 38 Markdown files passed; E2E `tsc --noEmit` — passed.
`pnpm check` прошёл lint и package build, остановился на независимой TS2379
в `apps/desktop/src/App.vue:523` (`WindowCaptureRecovery.session` и undefined),
`artifacts/callout-revision-check-complete.log`.
`pnpm test:boundaries --maxWorkers=1 --testTimeout=30000` — 41 passed / 3 failed:
Tauri facade imports App/WindowCaptureRecovery, размер ShapeFormattingToolbar,
complexity drawing-payload и image-editing helper. Callout и runner violations
отсутствуют; log `artifacts/callout-revision-boundaries-complete.log`.

## Диапазоны оформления изображения (2026-10-18, ADR-089)

Windows x64, Node 22.23.1, pnpm 10.33.2. Radius больше не ограничен 128 px:
максимум — половина короткой стороны localBounds; border width 0–32 px.
Renderer и формат v7 не менялись. Это круг для квадрата и капсула для
прямоугольника, а не новая эллиптическая маска.

- Red-first `pnpm exec vitest run --project vue tests/unit/vue/app-content-actions.test.ts`:
  2 failed / 8 passed, оба новых случая получили max=128 вместо 1080/1920;
  `artifacts/image-limits-red.log`.
- `pnpm test tests/unit/vue/app-content-actions.test.ts tests/unit/vue/image-toolbar.test.ts`:
  16/16 passed, `artifacts/image-limits-tests-final.log`. Проверены square/landscape
  4K, максимумы слайдеров, отсутствие document mutation до keyup, один undo
  на каждый параметр и точный redo. Numeric/palette/Escape/disabled regressions сохранены.
- `pnpm test:render tests/harness/render/image-gesture-preview.test.ts`:
  2/2 passed, `artifacts/image-limits-render.log` (неизменённый gesture/render путь).
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed,
  `artifacts/image-limits-types-final.log`; scoped ESLint passed,
  `artifacts/image-limits-scope-lint.log`.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-editing.e2e.ts`:
  1/1 passed, все 8 сочетаний 1024/1600 × RU/EN × light/dark;
  Chrome 155.0.8059.80, `CUTE_SCREEN_BROWSER_E2E_PORT=5192`,
  `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CHOKIDAR_USEPOLLING=1`,
  `CHOKIDAR_INTERVAL=600000`. Лог — `artifacts/image-limits-browser-final.log`.
  Production G + non-origin crop; radius=1080 и border=32, visible pixels,
  held move/resize/rotate, cancel и undo/redo. Снимки —
  `artifacts/browser-e2e/image-edit-{width}-{locale}-{theme}-border-settings.png`.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e';
$env:CUTE_SCREEN_E2E_SCENARIOS='content-image-tool'; pnpm test:e2e:tauri`:
  fresh build + 1/1 native scenario passed; `artifacts/image-limits-native.log`.
  WebView2 155.0.4283.45 / external tauri-driver, binary
  `artifacts/tauri-e2e/runtime/cute-screen-e2e-binary-lkP8qX/cute-screen.exe`.
  Production G в Quick/Editor, non-origin crop, held gestures, cancel,
  максимальный radius, border=32, undo/redo, paste/drop и decoded clipboard PNG.
  Видимые снимки — `artifacts/tauri-e2e/image-edit-{quick,editor}-border-settings.png`.
- `pnpm format` и `pnpm format:check`: passed,
  `artifacts/image-limits-format-final.log`, `artifacts/image-limits-format-check-complete.log`.
  `pnpm check` остановился на стороннем `no-unused-vars` для `common` в
  `packages/editor-core/src/document/scene/text.ts:203`; `artifacts/image-limits-check-final.log`.

Первый browser запуск выявил неверное ожидание самого теста: английский summary
форматирует 1080 как `1,080`. Проверка исправлена с учётом разделителей RU/EN.

## Управляемые выноски (2026-10-18, ADR-087)

Windows 10 x64, Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.80.
Исходное рабочее дерево содержало параллельные изменения; они сохранены.

- Red-first: новый `callout-editing.test.ts` — 5/5 ожидаемых failures до
  реализации. Дополнительный diagonal rounding test сначала падал; после
  исправления `pnpm exec vitest run --project core packages/editor-core/src/callout-editing.test.ts`
  — passed. Добавлены red-first regressions для двух новых изгибов без петли
  и переноса legacy-оформления: `artifacts/callout-step-red.log`,
  `artifacts/callout-legacy-style-red.log`. Дополнительные red-first проверки
  схлопывания сегмента и подхода к закреплённой стороне после переноса через
  цель — `artifacts/callout-collapse-red.log`, `artifacts/callout-attachment-red.log`.
  Итоговый core suite — 12/12; с geometry/styles — 26/26 passed,
  `artifacts/callout-core-final.log`.
- `pnpm test --maxWorkers=2` — 140 files / 1201 tests passed, exit 0;
  `artifacts/callout-full-test-final.log`. В jsdom есть сообщения о Canvas2D
  без установленного canvas package; итог suite успешный, unhandled errors нет.
- `pnpm test:render` — 14 files / 41 tests passed, exit 0;
  `artifacts/callout-render-final.log`. Новая матрица пяти оболочек и пяти
  конечных меток проверяет оба backend, production codec round-trip и повторное
  декодирование PNG; Canvas2D preview/export совпадают по пикселям. Дополнительная
  схема магазина и карточки экспортирована в `artifacts/callout/examples.png`
  и просмотрена; это renderer fixture, а не пользовательское исследование.
- Focused core/Vue: 6 files / 52 tests passed; отдельный новый toolbar suite
  проверяет пять групп, route insertion, выбор оболочки, Escape/focus и disabled.
  Legacy layout fixtures явно используют прежний style; новый factory проверен
  отдельно. Log `artifacts/callout-focused-final.log`.
- Native выявил повторное добавление crop offset в canvas context menu.
  Mounted Quick regression сначала упал (`artifacts/callout-context-crop-red.log`),
  затем общий pointer mapper исправил цель ПКМ. Повторный
  `pnpm exec vitest run --project vue tests/unit/vue/tool-ux.test.ts tests/unit/vue/callout-toolbar.test.ts`
  — 33/33 passed, `artifacts/callout-context-final.log`; старые menu fixtures
  используют CSS coordinates с учётом фактических размеров canvas.

Browser команда:
`$env:CUTE_SCREEN_BROWSER_E2E_PORT='5267'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_E2E_DISABLE_WATCH='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-editing.e2e.ts --spec tests/e2e/specs/browser-callout-layout.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts`.
Результаты — `artifacts/callout-browser-final.log`; screenshots
`artifacts/browser-e2e/callout-card.png`, `callout-editing.png` и
`callout-{en,ru}-{light,dark}-{50,100,200}.png`.
Все 3 specs / 4 cases passed. Дополнительно
`pnpm test:e2e:browser --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts --mochaOpts.grep 'keeps Callout card'`
— 1/1 passed, `artifacts/callout-rich-text-browser.log`. Этот прогон выявил
и проверил исправление владения вложенной палитрой и порядка наложения:
родительское Callout меню не закрывается и не перекрывает ввод HEX.

Первый native запуск стабильной командой остановился до тестов:
`failed to remove D:\cutescreen\target\debug\cute-screen.exe`, OS error 5.
Занятый editor не завершался. Повторный native запуск использует отдельный
CARGO_TARGET_DIR. Итоговая команда:
`$env:CUTE_SCREEN_E2E_SCENARIOS='callout-editing,callout-editing-reopen'; $env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/callout-target'; $env:CARGO_BUILD_JOBS='4'; $env:TAURI_WEBDRIVER_PORT='4497'; pnpm test:e2e:tauri`.
Оба сценария passed на WebView2 155.0.4283.45 / external tauri-driver 2.1.0,
`artifacts/callout-native-final.log`. Закреплён свежесобранный binary
`artifacts/tauri-e2e/runtime/cute-screen-e2e-binary-Z2iQn8/cute-screen.exe`.
Проверены production capture → Quick non-origin crop → inline text → cancel
held target drag → перенос карточки без переноса цели → ступень → наконечник
и оболочка → undo/redo → ПКМ по цели → Editor handoff → отдельный launch.
После перезапуска проверены saved manual route/card и default Ring/None.
Все зарегистрированные keydown/contextmenu имеют isTrusted=true:
`artifacts/tauri-e2e/callout-input-trust.json`. Снимки `callout-card.png`,
`callout-editor-handoff.png`, `callout-reopened.png` просмотрены. Это fake-platform
capture в настоящем WebView2; физический захват этим прогоном не доказывается.
Предварительные отказы на неверном crop gesture и селекторе context menu
сохранены в `artifacts/callout-native-{frame-gesture,context-selector}.log`.
`pnpm format` passed. `pnpm check` прошёл lint, typecheck, format:check и
docs:check, затем остановился на boundaries. Callout preview зарегистрирован
в разрешённом каталоге геометрических миниатюр. Повторный `pnpm test:boundaries`:
41 passed / 2 failed; оба failures относятся к параллельным изменениям:
прямой Tauri import в `apps/desktop/src/App.vue` и размеры/вложенность функций
`tests/e2e/image-editing.ts`. Логи — `artifacts/callout-check-final.log` и
`artifacts/callout-boundaries-final.log`; последующие IPC/Rust gates этой командой
не выполнялись.
Отдельно `CARGO_TARGET_DIR=D:/cutescreen/artifacts/callout-target pnpm ipc:check`
и `cargo fmt --all --check` passed; логи — `artifacts/callout-ipc-final.log`,
`artifacts/callout-rust-format.log`.
Linux/WebKitGTK, macOS/WKWebView и пользовательская проверка пяти UX-заданий
не запускались; автотесты не доказывают интуитивность интерфейса.

## Захват и перенос выделения (2026-10-17–18, ADR-085)

Windows 10 x64, Node 22.23.1, pnpm 10.33.2. REQ-EDT-019 проверяется
через DOM-free geometry, mounted Vue и создание объектов в production mount.

Red-first evidence: `artifacts/selection-red.log` (ещё нет resolver),
`artifacts/selection-metric-red.log` (неравные CSS scales),
`artifacts/selection-index-red.log` (1000 чтений scene array при локальном query).
После реализации `pnpm test -- packages/editor-core/src/selection-target.test.ts
packages/editor-core/src/hit-test.test.ts --maxWorkers=2` — 28/28 passed,
`artifacts/selection-core-final.log`. Проверены 6 CSS px, zoom 25/100/400,
straight/quadratic/elbow, caps, freehand, shapes, effects, rotation/reflection,
приоритеты пересечений и spatial-index parity. Локальный query после построения
индекса не читает scene array.

Финальные focused core/Vue regressions — 52/52 passed,
`artifacts/selection-regressions-final.log`, и drawing — 9/9 passed,
`artifacts/selection-drawing-final.log`: первый padded drag, click/jitter,
пустота рамки, geometry handle, фиксированный multi-move, cancel/Escape,
creation/read-only, selection grip через EditorShell и image preview.
`pnpm test:render --maxWorkers=2` — 12 files / 35 tests passed,
`artifacts/selection-render.log`. `pnpm typecheck` passed,
`artifacts/selection-typecheck.log`.

Browser: `CUTE_SCREEN_BROWSER_E2E_PORT=5194`,
`CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_E2E_DISABLE_WATCH=1`,
`pnpm test:e2e:browser --spec tests/e2e/specs/browser-selection-interactions.e2e.ts`.
Опциональное отключение file watching предотвращает HMR во время удержания
указателя, когда соседние задачи редактируют тот же checkout. Первый прогон
с HMR: 7/12 passed, три потери browsing context и две cancel assertions
в двух tests; лог `artifacts/selection-browser-concurrent-edits.log`.
Окончательный результат: Chrome 155.0.8059.80, 12/12 passed,
RU/EN × light/dark × 25/100/400%, `artifacts/selection-browser-final.log`.
Скриншоты `artifacts/browser-e2e/selection-*-{arrow,small}.png`;
EN/light/25 и EN/dark/400, RU/light/100 просмотрены.

Native: `CUTE_SCREEN_E2E_SCENARIOS=selection-interactions`,
`CARGO_TARGET_DIR=target/highlighter-e2e`, `pnpm test:e2e:tauri`.
External tauri-driver/WebView2 155.0.4283.45; отдельный профиль, production
Capture → изменение рамки указателем → Quick non-origin crop → Editor.
Первый test обнаружил неверное предположение fixture о начальном crop;
теперь non-origin crop создаётся жестом пользователя. Сборочные повторы
были нужны из-за параллельных правок типов/кодировки и EBUSY frontend dist;
логи `artifacts/selection-native-{build-retry,build-lock,initial-crop}.log`.
Окончательный результат: 1/1 passed, `artifacts/selection-native.log`.
Trusted pointer/keyboard проверяют initial padded drag, jitter, frame move,
endpoint, Escape, undo/redo и grip 28×28 с ArrowRight в обоих окнах.
Hover assertion ждёт native pointer event, без synthetic input. Скриншоты
`artifacts/tauri-e2e/selection-{quick,editor}-{arrow,small}.png` просмотрены.
Native матрица всех zoom/theme/locale комбинаций отдельно не прогонялась;
полная матрица выше относится к Chrome. После native pass удалена лишняя
отрисовка до cancel; её проверяют финальные guide regressions.
Fake capture внутри настоящего WebView не доказывает physical screen capture.

Общий `pnpm test --maxWorkers=4`: 137 files, 1178 passed / 8 failed,
6 unhandled errors, `artifacts/selection-unit-final.log`. Три guide failures
вызваны лишней отрисовкой перед cancel и исправлены (финальные focused 52/52).
Остальные failures относятся к меняющимся Callout defaults/layout/toolbar;
unhandled errors — неполный Canvas2D mock нового Callout preview. Полный suite
не объявляется green. `pnpm format` выполнялся; текущие общие check/format
имеют failures в параллельно меняющихся Callout файлах, включая CRLF и parser
errors. Логи `artifacts/selection-{check,format,format-check}.log`.
Scoped ESLint новых interaction-файлов passed,
`artifacts/selection-scoped-lint.log`; `pnpm docs:check` passed,
`artifacts/selection-docs-check.log`.
Linux/WebKitGTK, Wayland и macOS/WKWebView остаются pending.

## Компактные настройки изображения и gesture preview (2026-10-17–18, ADR-086)

Windows x64; Chrome 155.0.8059.80. Рабочее дерево изменяется параллельно;
существующие правки сохранены. Изменение использует прежние image controls,
NumericControl и ordered scene, без новых IPC/schema fields.

- Red-first: `pnpm exec vitest run --project vue tests/unit/vue/image-scene-preview.test.ts`
  — 2 failed: base/content не входили в scene preview. Дополнительный red для
  нажатия в resize hit area воспроизвёл scale 0.99953125 вместо исходного 1.
  Логи `artifacts/image-settings-red.log`, `artifacts/image-settings-resize-red.log`.
- Финальный scoped Vue:
  `pnpm exec vitest run --project vue tests/unit/vue/image-toolbar.test.ts tests/unit/vue/image-scene-preview.test.ts tests/unit/vue/app-content-actions.test.ts tests/unit/vue/canvas-viewport-transform.test.ts tests/unit/vue/selection-toolbar-position.test.ts`
  — 5 files / 34 tests passed. Проверены три summaries, range/percent routing,
  one commit, Escape/focus, palette/HEX/eyedropper, mixed/disabled, ordered
  base/content, no-op resize press и существующие transform/layout contracts.
  Лог `artifacts/image-settings-focused-2.log`.
- `pnpm test:render` — 12 files / 35 tests passed. Новый 4K test сравнивает
  held pointerdown/move/resize/rotate, committed и повторно декодированный PNG
  по всем RGBA bytes; включает отражение, opacity, скругление, рамку и верхнюю
  фигуру. Undo/redo/cancel восстанавливают scene/document. Просматриваемые PNG:
  `artifacts/image-settings/{base,content}-rotate-decoded.png`.
  Лог `artifacts/image-settings-render.log`.
- `pnpm test` на изменявшемся дереве: 136 files, 1172 passed / 7 failed.
  Старые expectations открытых image sliders и ранняя загруженная версия resize
  исправлены и проверены scoped run выше. Остальные failures относятся к
  selection-overlay-resolution, m08-precision-guides и m08-precision-drawing;
  общий green этим прогоном не заявляется. Лог `artifacts/image-settings-test.log`.
- Первый `pnpm check` остановился на lint параллельно редактируемых canvas/UI
  файлов (в основном CRLF/LF); не подтверждает общие gates.
  Лог `artifacts/image-settings-check.log`. Итоговые проверки фиксируются ниже.

Browser/native development: исправлены сами тесты — Naive UI input заполняется
trusted Ctrl+A + typing вместо WebDriver clear(), LayersPanel opacity не
подменяет slider внутри dialog, координаты после undo берутся с актуального
canvas. Native execute не содержит вложенного named helper, вызывавшего
`__name is not defined`. Browser HMR однажды потерял BiDi context из-за внешней
правки App.vue; повтор выполняется с `CHOKIDAR_USEPOLLING=1` и
`CHOKIDAR_INTERVAL=600000`, чтобы не перезагружать сцену в середине жеста.
Предыдущие диагностические логи сохранены под `artifacts/image-settings-*`.

### Browser и performance

- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5191'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CHOKIDAR_USEPOLLING='1'; $env:CHOKIDAR_INTERVAL='600000'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-editing.e2e.ts`
  — 1 spec passed, восемь сочетаний 1024/1600 × RU/EN × light/dark. Production
  G import 3840×2160, crop (300,200), реальные mouse/keyboard events; полные
  canvas hashes совпадают на pointerdown и после held→commit→undo→redo.
  Проверены move/resize/rotate, Escape, numeric commit/focus, embedded palette
  без horizontal overflow. Лог `artifacts/image-settings-browser-9.log`.
  Снимки `artifacts/browser-e2e/image-edit-*-{move,resize,rotate}-held.png`
  и `image-edit-*-border-settings.png`; просмотрены RU dark 1600 и EN light 1024.
- `pnpm test:perf` — 2 files / 6 tests passed; лог
  `artifacts/image-settings-perf.log`. Это существующие software gates,
  не новое обещание GPU/frame-time бюджета на всех платформах.

Новый decoded render artifact `artifacts/image-settings/content-rotate-decoded.png`
просмотрен: изображение, рамка, скругление и перекрывающая фигура присутствуют.
Native итог и общие финальные gates записываются отдельно ниже.

### Нулевое перемещение и сборка

WebView2 выявил отдельный no-op риск: `translate + current - start` терял
точность дробной позиции даже при `current === start`. Red-first regression
проверяет сохранение исходного transform по ссылке; move preview теперь сначала
вычисляет delta, а нулевое движение возвращает исходный transform. Group preview
прибавляет ту же заранее вычисленную разность, что committed command.

- `pnpm exec vitest run --project vue tests/unit/vue/image-scene-preview.test.ts tests/unit/vue/image-toolbar.test.ts tests/unit/vue/app-content-actions.test.ts`
  — 3 files / 19 tests passed после исправления; red/green логи
  `artifacts/image-settings-fractional-{red,green}.log`.
- `pnpm exec vitest run --project render-harness tests/harness/render/image-gesture-preview.test.ts`
  — 2/2 passed после изменения арифметики; лог `artifacts/image-settings-render-final.log`.
- Native повтор не использует старый binary после failed build. В процессе
  параллельных правок восстановлен существующий `toLocal` port в PointerDownContext
  и исправлены только четыре строки смешанной Windows-1251/UTF-8 кодировки
  в CalloutFormattingToolbar и selection-actions-controller. После этого
  отдельная сборка столкнулась с конкурентной очисткой dist renderer-пакета.
  Диагностика сохранена в `artifacts/image-settings-tauri-6.log`,
  `image-settings-tauri-7.log` и `image-settings-tauri-verified.log`.

### Итоговые runtime results

Повторная browser matrix после fractional-transform fix — 1 spec passed,
все восемь сочетаний, 6m54s; лог `artifacts/image-settings-browser-complete.log`.
Общий timeout увеличен до 600s для загруженного общего workspace.

Windows WebView2 155.0.4283.45 / external tauri-driver 2.1.0: 1/1 passed,
26s; `artifacts/image-settings-native-acceptance.log`. Production Capture →
Quick → G import 4K → Editor → G import, move/resize/rotate held frames,
Undo/Redo, Escape, radius commit, border palette, paste/drop, cancel/error
и Copy с native PNG decode проверены. Просмотрены
`artifacts/tauri-e2e/image-edit-editor-border-settings.png` и
`image-edit-editor-rotate-held.png`; картинка остаётся видимой при повороте.

Native проверка использует средние RGBA блоков 8×8 с допуском 2/255:
высокочастотная fixture имеет различия native resampling/readback до 53/255
на отдельных пикселях при неизменной geometry. Это не допуск document/export:
геометрия, history, browser pixels и decoded render/export проверяются точно.
Native тест ждёт стабильных pixels перед каждым действием; Quick → Editor
resource handoff может завершиться между жестами без изменения документа.

Полный `pnpm test:e2e:tauri` успешно собрал и закрепил binary
`artifacts/tauri-e2e/runtime/cute-screen-e2e-binary-x4vF6g/cute-screen.exe`
с итоговой image реализацией (`image-settings-tauri-last.log`). После уточнения
только тестового pixel comparator сценарий повторён на этом binary командой
`node node_modules/@wdio/cli/bin/wdio.js run tests/e2e/wdio.tauri.conf.ts --spec tests/e2e/specs/tauri-content-image-tool.e2e.ts`
с новым изолированным appData/WebView2 profile, `content-image-tool`,
`?m04=1&m08=1`, fake capture и external provider. Повтор общей сборки текущего
дерева остановился на новых обязательных `ariaLabel` props в параллельно
редактируемом CalloutFormattingToolbar; лог `artifacts/image-settings-tauri-complete.log`.
Общий build-pass для этого меняющегося дерева не заявляется.

`pnpm format` и `pnpm format:check` выполнены: Prettier passed, общий ESLint
format-check остановился на 35 max-len в других параллельных изменениях.
Последний `pnpm check` остановился на lint (включая новые CRLF); логи
`artifacts/image-settings-format-final.log`, `image-settings-format-check.log`,
`image-settings-check-final.log`. Scope formatter новых image E2E files прошёл;
`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` также прошёл после финального
наблюдательного comparator (`artifacts/image-settings-final-types.log`).
Общий unit/check green не заявляется.

## Отступы верхних действий (2026-10-17)

Windows 10 x64, Chrome 155.0.8059.80. Изменение только CSS верхней панели.

- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`, `CUTE_SCREEN_BROWSER_E2E_PORT=5189`;
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep 'keeps the primary flow visible|keeps capture, copy and export reachable'`:
  1024 px passed; 1600 px остановился до screenshot на отсутствующем
  `.cs-context-toolbar .cs-highlighter-toolbar`, вне изменённой верхней панели.
- С теми же переменными
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep 'fits localized menu labels'`:
  passed, RU/EN × light/dark × 1024/1600 px. Снимки
  `artifacts/browser-e2e/topbar-menu-{width}-{locale}-{theme}.png`;
  RU dark 1600 и RU light 1024 просмотрены, значки отделены от подписей,
  компактные кнопки не переполняют панель.
- `pnpm format` выполнен; завершился на трёх сторонних style errors:
  `browser-image-editing.e2e.ts:18`, `image-gesture-preview.test.ts:40`,
  `image-scene-preview.test.ts:38`.
- `pnpm format:check` выполнен: общий gate остановился на форматировании
  параллельно изменяемых `ACCEPTANCE.md`, `PLATFORM_MATRIX.md`, `TESTING.md`.
  Лог: `artifacts/topbar-spacing-format-check.log`. После записи evidence
  изменённые здесь CSS и Markdown отформатированы отдельно.

Real WebView, Linux и macOS для этого CSS-изменения не запускались.

## Белое окно «Хранение…» из истории (2026-10-17)

Windows 10 x64, Node 22.23.1, pnpm 10.33.2. Причина: отдельный
`settings_open_history` оставался синхронным IPC и создавал WebView2 на UI thread.
Он переведён в async, как `open_activation_settings`; IPC shape не меняется.

- Red-first: `cargo test -p cute-screen-desktop --lib storage_settings_ipc_returns_a_future`
  — compilation failed E0277: `Result<(), CommandErrorV1>` is not a future.
  После async fix та же команда — 1 passed, exit 0.
- `pnpm test -- tests/unit/vue/history-popover.test.ts tests/unit/vue/activation-settings.test.ts tests/unit/vue/settings-recorder.test.ts`
  — exit 0, 3 files / 26 tests passed.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`, scoped ESLint native spec
  и launcher, `pnpm docs:check`, `git diff --check` — exit 0.
- Первый native build остановился на `color.mixed: boolean | undefined`
  в параллельно изменённом ImageFormattingToolbar; добавлен `?? false`.
  Второй build пересёкся с очисткой package outputs другим check и не разрешил
  editor-renderer. Ни один не использовал stale binary; повторный запуск ниже.
- `pnpm format` выполнен; первый проход остановился на двух сторонних style
  errors в browser-image-editing и image-scene-preview. Итоговые gates ниже.

Логи: `artifacts/history-settings-{rust-red,rust-green,vue,e2e-types,lint,docs,diff-check,format}.log`;
неуспешные сборки — `history-settings-native.log` и `history-settings-native-final.log`.
Linux/macOS runtime и physical capture этим исправлением не проверяются.

Финальный native результат:
`$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='history-settings'; pnpm test:e2e:tauri`
— exit 0, 1 scenario / 1 test passed, WebView2 155.0.4283.45,
external tauri-driver 2.1.0 / EdgeDriver. Обычный empty-editor mount,
RU History → Storage → загруженные controls/report; General → повторный
Storage переключает singleton на History. Два закрытия кнопкой Settings,
повторное создание окна, Escape истории и возврат фокуса passed.
Снимок `artifacts/tauri-e2e/history-settings-native.png` просмотрен.
Лог — `artifacts/history-settings-native-pass.log`; worker/backend/frontend/JUnit
— `artifacts/tauri-e2e/`. Первые два runtime-прогона дошли до успешных
Settings assertions, но упали на дополнительном toggle истории; финальный
сценарий проверяет предусмотренное закрытие истории через native Escape.
Toggle истории этим исправлением не изменяется.

`pnpm check` — exit 1 на 13 сторонних lint errors (irregular whitespace
EditorWorkspace и три image tests). `pnpm format` повторён, общий
`pnpm format:check` — exit 1 на сторонних image/selection test styles.
Scoped ESLint-format нового native spec и launcher — exit 0;
финальный E2E TypeScript — exit 0. Логи — `history-settings-check.log`,
`history-settings-format-final.log`, `history-settings-format-check.log`,
`history-settings-scoped-format.log`, `history-settings-e2e-types-final.log`.
Общий gate не объявляется успешным на параллельно изменяемом дереве.

Последний повтор `pnpm format` и `pnpm format:check` — exit 0;
логи `history-settings-format-completion.log` и
`history-settings-format-check-completion.log`. `pnpm docs:check`,
`git diff --check` и `cargo fmt --all --check` также exit 0.
Предыдущий `pnpm check` остаётся recorded failure, полного повторного pass нет.

После обновления журнала `pnpm format:check` повторён ещё раз — exit 1:
606 CRLF/style errors в параллельно изменённых `overlay-controller.ts` и
`layer-controller.ts`. Лог — `history-settings-format-check-last.log`.
Это supersedes успешный format snapshot выше для общего дерева;
native/focused результаты исправления хранения сохраняются.

## Дроп настроек редактора (2026-10-17, ADR-083)

Windows 10 x64, Node 22.23.1, pnpm 10.33.2; Chrome 155.0.8059.80.
Существующие и параллельно поступающие изменения в рабочем дереве сохранены.

- `pnpm test` — exit 0, 130 files / 1128 tests passed. В журнале есть warning
  Vitest о завершении numeric-control worker; итог suite успешный.
- Финальный regression после исправления Escape:
  `pnpm exec vitest run --project vue tests/unit/vue/editor-settings.test.ts tests/unit/vue/content-image-import.test.ts`
  — 2 files / 16 tests passed. Восемь settings tests проверяют live/persisted
  preferences, disabled, pending/double-open, native error/retry, focus,
  Quick и приоритет dialog над фоновым import error. Ранее scoped shell suite
  из шести файлов прошёл 67/67.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5182'; $env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --spec tests/e2e/specs/browser-crop-apply.e2e.ts --mochaOpts.grep 'switches locale|light theme|overflow menu|localized menu|opens from|persists preferences|image actions from settings|Crop confirmation'`
  — 2 specs / 10 tests passed. Проверены RU/EN × light/dark × 1024/1600,
  Enter/Space/Tab/Escape/outside, native-disabled пояснение, reload, short
  viewport scroll, нарисованная стрелка → Flip → Undo/Redo и Crop regression.
- После исправления narrow-width SVG отдельный повтор
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep 'localized menu'`
  с теми же переменными — 1/1 passed. Все восемь снимков проверяют видимость
  primary SVG и отсутствие обрезанных подписей; просмотрены RU dark 1024 и
  EN light 1600. Артефакты `artifacts/browser-e2e/topbar-menu-*.png`.
- Реальный WebView2 первым вызовом воспроизвёл deadlock синхронной команды
  открытия Settings: после клика зависли UI и следующий `list_windows` IPC.
  Прогон остановлен; stale binary не использован. Установленный Tauri 2.11.5
  документирует именно этот Windows deadlock в WebviewWindowBuilder.
  `open_activation_settings` переведён в async без смены IPC shape.

Логи: `artifacts/editor-settings-tests.log`,
`artifacts/editor-settings-focused-final.log`,
`artifacts/editor-settings-import-regression.log`,
`artifacts/editor-settings-browser-verified.log`,
`artifacts/editor-settings-browser-icons.log`.
Первоначальные browser failures сохранены отдельно; старый общий shell case
с Highlighter использует ready fixture без document session и не входит в
финальный focused pass. Native result и финальные gates фиксируются ниже.

### Native result и gates

`$env:CARGO_TARGET_DIR='D:/cutescreen/target/highlighter-e2e'; $env:CUTE_SCREEN_E2E_SCENARIOS='editor-settings'; pnpm test:e2e:tauri`
— exit 0, 1 scenario / 1 test passed в настоящем WebView2 155.0.4283.45,
external tauri-driver 2.1.0 / EdgeDriver. Проверены trusted Enter, native open,
singleton, сохранение раздела при повторном вызове и создание нового Settings
после закрытия. Просмотрены `artifacts/tauri-e2e/editor-settings-ru-dark.png`
и `editor-settings-native-window.png`; лог —
`artifacts/editor-settings-tauri-isolated.log`, worker/JUnit/backend/frontend —
`artifacts/tauri-e2e/`. Root target/debug был занят другим dev-процессом;
его не останавливали. Неудачная сборка отказалась проверять stale executable.

`cargo fmt --all --check`, scoped ESLint-format изменённых UI-файлов,
`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`, `pnpm docs:check` и
`git diff --check` — exit 0. Общие format/check повторялись на изменяемом
параллельно дереве; предыдущий `pnpm check` остановился на lint новых
pointer controllers (четыре max-len и unused LayerNode), без ошибок settings.
Последний `pnpm check` — exit 1 на 13 lint errors в параллельно изменяемых
selection/canvas файлах и комментарии selection в EditorWorkspace. Общий
gate не объявляется успешным. Последний результат хранится в
`artifacts/editor-settings-completion-check.log`; `pnpm format` остановился
на трёх style violations тех же параллельных изменений. Финальная проверка
форматирования — `artifacts/editor-settings-completion-format-check.log`.

Финальный `pnpm format:check` — exit 1: 643 style errors в продолжающихся
canvas/selection изменениях (включая CRLF). Повтор scoped ESLint-format
settings UI/tests — exit 0; `pnpm docs:check` и `git diff --check` — exit 0.
Это не считается full-check pass для общего рабочего дерева.

Linux/Wayland/WebKitGTK и macOS/WKWebView в этом изменении не проверялись.
Native сценарий не меняет capture backend; настройки сохраняют прежний
native singleton и IPC shape. Render/perf suites для UI-панели не запускались.

## Пипетка до наведения на холст (2026-10-17)

Windows 10 x64; Chrome 155.0.8059.80. `REQ-TOL-012`: удалена
автоматическая инициализация preview в центре canvas. Активация сохраняет
keyboard focus, но ждёт pointermove или Arrow key; pointerleave очищает target
и отменяет pending preview. Никаких изменений document/history/clipboard при
активации нет.

- Red-first: `pnpm test -- tests/unit/vue/m08-precision-guides.test.ts` —
  2 failed / 8 passed: карточка была видна сразу при активации и active mount.
- `pnpm test -- tests/unit/vue/m08-precision-guides.test.ts tests/unit/vue/m08-precision-drawing.test.ts tests/unit/vue/tool-ux.test.ts tests/unit/vue/canvas-viewport-quick.test.ts tests/unit/vue/m08-crop-interactions.test.ts`
  — 65/65 passed. Включены повторная активация, выход указателя, zoom без
  target, ArrowRight, palette routing, cancel/error и alpha sampling.
- `pnpm format` — exit 0.
- Первые два `pnpm test:e2e:browser --spec tests/e2e/specs/browser-m08-8.e2e.ts`
  прошли проверки пипетки, но остановились позже в общем helper смены языка:
  `.cs-settings-popover` оставался после Escape. В этом сценарии меню языка
  теперь явно закрывается повторным кликом trigger; helper и production
  settings не изменялись.

Логи: `artifacts/eyedropper-activation-{red,unit,format,browser,browser-retry}.log`.
Снимки `artifacts/browser-e2e/eyedropper-{before,on}-canvas.png` просмотрены:
после клика инструмента карточки нет; после входа на canvas виден `#273D5A`.

- Финальный browser run (порт 5189, headless Chrome):
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-m08-8.e2e.ts` — exit 0,
  1/1 passed, включая EN/1024 px RU, pointer entry/leave/reentry, повторную
  активацию, keyboard preview, clipboard/recent и cancel/error.
- Первый `$env:CUTE_SCREEN_E2E_SCENARIOS='m08-eyedropper-clipboard'; pnpm test:e2e:tauri`
  остановился до теста: Rust не мог удалить занятый resident-приложением
  `target/debug/cute-screen.exe` (os error 5). Повторный прогон использует
  `$env:CARGO_TARGET_DIR='target/highlighter-e2e'`, не останавливая dev.

Browser final log: `artifacts/eyedropper-activation-browser-final.log`.

- Изолированный native прогон с тем же фильтром — exit 0, 1/1 passed:
  Windows WebView2 155.0.4283.45, внешний tauri-driver/EdgeDriver, production
  Capture → Quick → Editor с fake-platform кадром. Проверены hidden/visible
  состояния карточки, pointerleave/reentry, повторная активация, ArrowRight,
  `isTrusted=true` для pointermove/keydown и системный clipboard `#7F7F7F`.
  Лог — `artifacts/eyedropper-activation-native-isolated.log`, worker/backend/
  frontend/JUnit — `artifacts/tauri-e2e/`. Native снимки
  `eyedropper-before-canvas.png` и `eyedropper-on-canvas.png` просмотрены.
- Первые `pnpm check` прогоны остановились на сторонних параллельных изменениях:
  форматирование нового `browser-png-export.test.ts`, затем исчезнувший build
  output `@cute-screen/editor-renderer` во время Vite worker build. Lint и
  первый typecheck прошли; после окончания native build запущен последовательный
  повторный `pnpm check`.

- Последний `pnpm check` прошёл lint/typecheck/format/docs, но остановился
  на boundaries: сторонний direct Tauri import в `apps/desktop/src/App.vue`
  и превышение размера canvas controller. Обработчик pointerleave вынесен
  в `workspace-interaction-contexts.ts`, лимит не менялся. После переноса
  `pnpm test -- tests/unit/vue/m08-precision-guides.test.ts` — 10/10 passed;
  `pnpm test:boundaries` — 42/43 passed, остаётся только direct Tauri import
  в параллельно изменённом `App.vue`, вне исправления пипетки.
  Логи: `artifacts/eyedropper-activation-{check-retry,unit-final,boundaries-final}.log`.
  Общий `pnpm check` не считается passed; до IPC/Clippy этот прогон не дошёл.
- Финальные `pnpm typecheck` и `pnpm format:check` — exit 0 после переноса
  обработчика; логи `artifacts/eyedropper-activation-typecheck-final.log` и
  `artifacts/eyedropper-activation-format-check-final.log`.

Linux/macOS runtime для этого исправления не проверялись.

## Windows cold capture / Editor (2026-10-17, ADR-082)

Windows 10 x64 10.0.19045 / WebView2 155.0.4283.45; Node 22.23.1,
pnpm 10.33.2. Проверен запущенный пользователем dev-процесс, затем собственные
dev restarts с журналом и локальным WebView2 debugger. Исходные изменения сохранены.

- До исправления: после physical Area → Editor main и Quick оба оставались
  hidden. Обычный Tauri show/CLI show не возвращал main. Прямой Win32 hide
  расходился с Tao VISIBLE flag. Settings продолжал открываться.
- Запись первого Area после запуска: viewport менялся 800×600 → 1904×1072 →
  1920×1080; layout-ready появлялся со scene 1901×1069, затем scene становился
  1920×1080. Запись — `artifacts/dev-capture-startup/cold-frames-before.json`.
- Red-first Vue regression упал без selection-layout measurement; Rust contract
  не компилировался без framework-hide callback. После реализации focused Vue
  layout/warmup — 21/21 passed, Windows hide — 2/2 passed.
- `$env:CUTE_SCREEN_E2E_SCENARIOS='windows-capture-exclusion'; pnpm test:e2e:tauri`
  — passed: настоящий DXGI, external tauri-driver/EdgeDriver, три capture,
  две trusted Escape/cancel/retry и physical pointer selection → Editor.
  Native visibility проверяется до switchWindow(main), чтобы драйвер не
  маскировал регрессию. Pixel samples frozen desktop равны RGB 37/71/105.
- Повторный native прогон — exit 0, 1/1 passed; после handoff также проверен
  RGBA 37/71/105/255 на canvas редактора. Просмотрен
  `artifacts/tauri-e2e/windows-physical-editor-handoff.png`.
- Финальный cold dev replay: первый layout-ready имеет scene ровно
  1920×1080 при viewport 1920×1080; промежуточный 99% Fit остаётся скрытым.
  `cold-frames-after.json`, `quick-final.png`, `handoff-after.json` и
  `editor-final.png` в `artifacts/dev-capture-startup/`. Один клик Editor дал
  main=true, Quick=false; выбранный документ 1050×570 смонтирован.
- `pnpm test` — 128 files / 1113 tests passed; `pnpm check` — exit 0,
  включая lint, typecheck, format, docs, boundaries, generated IPC и четыре
  Rust Clippy configurations. `cargo fmt --all` — exit 0. Логи —
  `tests.log`, `check-final.log`, `format-complete.log` в том же каталоге.
- `cargo test --workspace` — exit 0: desktop 133 passed / 1 ignored,
  integration 1 passed, storage 30 passed; `rust-final.log`.
- Обычный `tauri dev` восстановлен на `127.0.0.1:5173`, без diagnostic port;
  новый resident process оставлен до первого Area capture.

Логи и red/green evidence — `artifacts/dev-capture-startup/`, native worker,
backend/frontend/JUnit — `artifacts/tauri-e2e/`. Mixed-DPI/multi-monitor,
Linux/Wayland/macOS runtime для этого изменения не проверялись.

## Вставка изображений (2026-10-17, ADR-081)

Windows 10 x64 10.0.19045, Node 22.23.1, pnpm 10.33.2, Cargo 1.97.0.
Chrome 155.0.8059.80; настоящий Tauri WebView2 155.0.4283.45 с external
tauri-driver/EdgeDriver. Существующие незакоммиченные изменения сохранены.

- Red-first: `cargo test -p cute-screen-desktop --lib imported_image_serializes_the_frontend_contract`
  упал с `resourceToken = Null`; после camelCase fix тот же тест passed.
  Core placement сначала failed без реализации, затем 4/4 passed.
- `pnpm test` — 128 files / 1111 tests passed; среди них shared ingress,
  stale session, duplicate request, cancel, decode error, selection и undo/redo.
- `pnpm test:render` — 11 files / 33 tests passed.
- `pnpm test:boundaries` — 10 files / 43 tests passed. Первоначальные нарушения
  размеров/complexity устранены разделением controller/contracts/feedback;
  лимиты не повышались.
- `pnpm check` — exit 0: lint/typecheck/format/docs/boundaries/generated IPC,
  Rust fmt и все четыре конфигурации Clippy. Существующие Vue lint warnings
  остаются; для Windows исправлены Linux-only import и needless return в
  shortcuts, без изменения поведения. `pnpm format` и `cargo fmt --all` — exit 0.
- После локализации image controls focused Vue/import/transport/actions —
  3 files / 21 tests passed; повторный browser ingress — 3/3 passed.
- `cargo test --workspace` — passed: desktop 132 passed / 1 ignored,
  integration 1 passed, storage 30 passed. Включены serde contract, window-bound
  одноразовый drop, bounded reader, safe SVG/EXIF и повторный decode записанного PNG.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-image-ingress.e2e.ts`
  — 3/3 passed: PNG/JPEG/WebP/SVG × RU/EN × light/dark, 1024 px, небольшой
  прозрачный PNG без upscale, drop после zoom/pan/non-origin crop, панели и
  multiple-file rejection. Browser использует отдельный тестовый OS adapter,
  production editor выполняет decode, geometry и команды.
- `$env:CUTE_SCREEN_E2E_SCENARIOS='content-image-tool,content-image-reopen,content-image-empty'; pnpm test:e2e:tauri`
  — 3 scenarios / 3 tests passed. Production Capture → Quick → Editor,
  4K file import, реальный native bitmap clipboard, один Undo/Redo, ошибки и
  отмена, drop, Copy и повторное декодирование clipboard PNG; trusted KeyV.
  После перезапуска восстановлены шесть content images. Отдельный empty drop
  создал документ с locked base layer. Capture backend — fake-platform.

Логи: `artifacts/image-import-{tests,render,boundaries,rust-tests,browser}.log`,
`artifacts/image-import-tauri-final.log`; backend/frontend/worker/JUnit —
`artifacts/tauri-e2e/`. Просмотрены четыре browser RU/EN × light/dark снимка,
crop-drop и native Quick/Editor/reopened/empty PNG.

Финальный gate: `artifacts/image-import-check-final.log`; повторные Rust/Vue/
browser проверки — `artifacts/image-import-{rust,focused,browser}-final.log`.
Усиленный native Copy ждёт `Result copied` и сверяет размеры повторно
декодированного PNG с canvas; лог — `artifacts/image-import-tauri-verified.log`.
Этот повторный native прогон завершился exit 0, 3/3 scenarios passed;
`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0.

Границы доказательств: native picker получает тестовый selection result,
drop поступает через test-only OS boundary с реальным window-bound grant.
Это проверяет Rust command/serde/storage/transport/WebView decode, но не
автоматизирует системный chooser или физическое перетаскивание из Проводника.
Нативный Save As с импортированной композицией, Linux/Wayland/macOS остаются
pending. Системный clipboard и trusted keyboard в WebView2 проверены.

## Таймер итога действия (2026-10-17)

Windows 10 x64 (10.0.19045), Node 22.23.1. `REQ-UI-014`: успех и отмена
скрываются через 3 секунды; ошибка остаётся до Escape, повтора или нового
действия. Предыдущий таймер не снимает следующее действие.

- `pnpm exec vitest run --project vue tests/unit/vue/shell-store.test.ts tests/unit/vue/app-content-actions.test.ts`
  — 2 files / 23 tests passed. Store покрывает открытие изображения, отмену,
  удержание ошибки и смену действия. Mounted shell нажимает «Open image…» и
  проверяет, что текст `Image opened` исчезает из DOM после 3 секунд.
- `pnpm exec eslint` по изменённым TypeScript-файлам — exit 0.
- Prettier для изменённых docs/TS — exit 0.

Нативный file dialog в уже запущенном `tauri dev` не прогонялся: строка тоста
по-прежнему приходит из `openImage`, а срок жизни задаёт shell store.

## Публичный лендинг (2026-10-17)

### Снимок админки в hero; мобильный вариант без изображения

Windows 10 x64 / Chrome 155.0.8059.80. PNG пользователя 1919×943 px (239380
байт) скопирован без изменения в `apps/landing/assets/hero-admin.png`. Старый
HTML/CSS-макет демонстрации удалён. `pnpm test:e2e:landing` — 3 passed:
production build под `/cute-screen/`, RU/EN при viewport 375/760/768/1024/1440
px; hero скрыт до 760 px, на 768/1024 px снимок доступен внутренней
прокруткой, на 1440 px показан целиком. Нет горизонтального overflow страницы,
все 16 SVG загружены; якорь, языковые и GitHub-ссылки и клавиатурная прокрутка
ToolRail работают. Просмотрены полные снимки
`artifacts/landing-e2e/hero-shot-ru-1440.png`,
`artifacts/landing-e2e/hero-shot-ru-375.png` и
`artifacts/landing-e2e/hero-shot-en-760.png`.
Подпись «Одна картинка. И всё понятно.» и английский эквивалент удалены;
подсказка прокрутки показывается только до 1050 px. После изменения
`pnpm format` и `pnpm format:check` — exit 0. Общий `pnpm check` в предыдущем
прогоне остановился на lint из-за CRLF-ошибок в других файлах editor-vue;
после этого полного прогона не повторялся.

Уточнение контента: RU/EN блок об оформлении удалён как описание ещё не
реализованной возможности; возле GitHub оставлена подпись «Открытый код.» /
«Open source.». Поиск подтвердил отсутствие блока, его CSS и ссылки на
sparkles.svg; строка о последнем штрихе внутри вымышленного проекта сохранена.
`pnpm build:landing` и `pnpm format` — exit 0 на Windows; поведение редактора
не менялось. Форматирование проверяется `pnpm format:check`.

### Переработанная версия

Windows 10 x64 / Chrome 155.0.8059.80, Node 22.23.1. `pnpm test:e2e:landing`
теперь сначала строит production artifact и запускает его через `vite preview`
на 5176, отдельно от dev-сервера 5175. Три сценария passed:

- RU/EN × точные viewport 375/768/1024/1440 px через `setViewport`, DPR 1:
  все 16 описаний и SVG загружены, основной demo целиком внутри viewport,
  аннотации внутри поверхности, надпись не пересекает рамку, desktop scripts
  отсутствуют. Название бренда не дублируется в main.
- Tab → видимый skip link → Enter, языковые ссылки в обе стороны, GitHub href
  и отсутствие ложных controls в иллюстрации.
- Новый ToolRail 595×46 px: CSS clip углов 16 px; горизонтальная прокрутка
  с клавиатуры на viewport 375 px.

Просмотрены все восемь полных снимков
`artifacts/landing-e2e/redesign-{ru,en}-{375,768,1024,1440}.png`.
Лог — `artifacts/landing-e2e/redesign-e2e.log`. `pnpm icons:landing` экспортирует
оригинальные UiIcon через Vue SSR при разработке; финальный сайт содержит
только HTML/CSS, PNG и внешние локальные SVG, без base64 и Vue runtime.
Focused ESLint и `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0.
`pnpm format`, `pnpm format:check`, `pnpm docs:check` и `git diff --check` —
exit 0; логи format/format-check — `artifacts/landing-e2e/redesign-format*.log`.
Публикация GitHub Pages и native editor runtime не запускались.

### Первоначальная версия

Windows / Chrome 155.0.8059.80: pnpm build:landing собрал независимый статичный
artifact с RU index.html, EN en/index.html и локальными hashed assets; оба маршрута
проверены с base path /cute-screen/.

- pnpm test:e2e:landing — 3 passed: RU desktop, RU на 375/768/1024/1440 px и EN
  на 1024 px. Проверены anchor, RU/EN links, GitHub link, отсутствие client code,
  keyboard path, local images, отсутствие горизонтального overflow страницы и
  non-focusable статичная демонстрация.
- Просмотрены artifacts/landing-e2e/ru-1440.png, ru-375.png и en-1024.png.
- pnpm format:check, pnpm docs:check и git diff --check — exit 0.
- pnpm check дошёл до check:rust, но остановился на существующих ошибках
  src-tauri/src/services/shortcuts/operations.rs: unused Duration и
  clippy::needless_return на строке 307. Лендинг этих файлов не меняет.

## Rust audit: zip и local path version (2026-10-17)

Windows 10 x64 (10.0.19045), Rust/Cargo 1.97.0, cargo-deny 0.20.2.
Исходный CI log блокировался на RUSTSEC-2026-0367/0368/0369 (`zip 6.0.0`)
и `bans`; local path dependency без версии нарушала `wildcards = "deny"`.
Storage обновлён до `zip =9.0.4`, неиспользуемая desktop-зависимость удалена,
локальный storage dependency закреплён на `=0.0.0`. Policy не ослаблялась.

Из-за занятого общего Cargo cache использованы отдельные переменные для
проверочных команд (не глобальные настройки):

```powershell
$env:CARGO_HOME = "$PWD/artifacts/ci-zip-offline-home"
$env:CARGO_TARGET_DIR = "$PWD/artifacts/ci-zip-target"
```

Registry archives скопированы из cache; четыре недостающих архива скачаны
с static.crates.io и проверены по SHA-256 из Cargo.lock. Advisory DB получена
обычным cargo-deny fetch до offline-прогона: commit `999ec89`, 2026-10-17.
Остановлены только собственные ожидающие cache команды; resident app и
чужие Rust-проверки не останавливались.

- До обновления `cargo test -p cute-screen-storage --locked` — 30 passed,
  включая recovery round-trip с production-shaped PNG 3840×2160;
  `artifacts/ci-zip-storage-before.log`.
- `cargo deny --offline --locked check` — exit 0: advisories/bans/licenses/sources
  ok; `artifacts/ci-zip-deny-offline.log`. Duplicate warnings остаются
  разрешёнными настройкой `multiple-versions = "warn"`.
- После заполнения отдельного cache обычный `cargo deny check` — exit 0,
  все четыре gates ok; `artifacts/ci-zip-deny-final.log`.
- `cargo test --workspace --offline --locked` — 160 passed, 1 ignored
  (существующий compositor runtime probe); recovery ZIP с новой версией
  экспортирован и повторно импортирован с проверкой blob checksum.
  Лог: `artifacts/ci-zip-workspace-offline.log`. Существующий warning об unused
  `Duration` в shortcuts/operations.rs не относится к зависимости и сохранён.
- `cargo clippy -p cute-screen-storage --all-targets --offline --locked -- -D warnings`
  — exit 0; `artifacts/ci-zip-clippy.log`.
- `cargo fmt --all --check`, `pnpm docs:check`, `git diff --check` — exit 0.
- `pnpm format` и `pnpm format:check` — exit 0;
  `artifacts/ci-zip-format.log`, `artifacts/ci-zip-format-check.log`.

Hosted CI, Linux/macOS runtime и bundle install этим прогоном не подтверждаются.

## Первый показ Windows Area (2026-10-17)

Windows 10 build 19045 x64. Контракт проверен без визуального replay:
первый кадр вспышки обычного окна длится один present и не фиксируется
unit-тестом.

- `cargo test -p cute-screen-desktop --lib windows_platform::tests::` —
  21 passed, 1 ignored (`compositor_runtime_probe_reads_the_visible_desktop`).
  Placement-флаги скрытого Quick окна не содержат `SWP_SHOWWINDOW` и
  `SWP_ASYNCWINDOWPOS`; точка попадает в полный rect монитора под курсором.
- `pnpm exec vitest run --project boundaries tests/boundaries/build-contract.test.ts` —
  13/13 passed. Windows present коммитит bounds до `set_fullscreen` и `show`.
- Локальный `pnpm run tauri dev` пересобрал `cute-screen-desktop` и запустил
  `target/debug/cute-screen.exe`. В этом прогоне осталось прежнее
  предупреждение `unused import: std::time::Duration` в
  `services/shortcuts/operations.rs`.

## Удаление повторных CI-проверок (2026-10-17)

Windows 10 x64 (10.0.19045), Node 22.23.1, pnpm 10.33.2.
Удалены повторные `pnpm test`, Rust format/Clippy и Linux x64 compile job:
их проверки остаются соответственно в `pnpm test:coverage` и `pnpm check`.

- `pnpm format` и `pnpm format:check` — exit 0; логи:
  `artifacts/ci-cleanup-format.log`, `artifacts/ci-cleanup-format-check.log`.
- `pnpm test:boundaries` — 10 files / 43 tests passed; лог:
  `artifacts/ci-cleanup-boundaries.log`.
- `pnpm docs:check` — проверены ссылки и anchors 37 Markdown files.
- Python/PyYAML 6.0.3 разобрал оба workflow без ошибок. Сопоставление package
  scripts подтвердило одинаковый набор проектов у `test` и `test:coverage`,
  а `check:rust` сохраняет frontend build, format и четыре Clippy-вызова.
- `git diff --check` — exit 0.

Hosted CI не запускался локально. Пять оставшихся compile targets,
Linux quality/runtime и все release guarantees требуют GitHub Actions;
эта проверка YAML не подтверждает native runtime или сборку bundles.

## Пропорции указателя лупы (2026-10-17, ADR-079)

Linux x86_64/X11, Node 22.23.1, pnpm 10.33.2. Логи —
`artifacts/loupe-pointer/`; browser PNG — `artifacts/browser-e2e/loupe-settings-pointer-*`;
визуальная матрица — `artifacts/loupe-pointer/visual/`.

- До renderer changes `pnpm exec vitest run --project renderer packages/editor-renderer/src/loupe-connector.test.ts`
  — 81 failed / 2 passed (`red.log`): прежние 3 px / 8–12 px не соответствуют
  новому контракту. После реализации focused geometry/Canvas2D/CanvasKit —
  118/118 passed (`renderer.log`).
- После добавления light/dark × 50%/100% та же dedicated suite — 91/91 passed
  (`renderer-final.log`). Geometry покрывает 16/64/256/512/2048 px;
  повторно декодированные 1600×1000 PNG покрывают circle/rectangle,
  64/512 px, border 0/3/8/64 и export 1×/2×. Проверены толщина shaft,
  enlarged head, preview/export parity, source внутри линзы и snapshot-before-connector.
  Отдельные 256/512 px PNG на светлом/тёмном фоне просмотрены при 50%.
- `pnpm test` — 125 файлов / 1084 проверки passed (`unit.log`), до добавления
  восьми дополнительных visual cases; финальная dedicated suite выше включает их.
- `pnpm test:render` первоначально обнаружил два ожидаемых mismatch M08
  (`render.log`). `pnpm test:render:update -t 'matches cropped M08 precision goldens'`
  обновил только четыре precision PNG; все четыре просмотрены.
  Повторный `pnpm test:render` — 11 файлов / 33 проверки passed (`render-final.log`).
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5196 pnpm test:e2e:browser --spec tests/e2e/specs/browser-loupe-settings.e2e.ts`
  — Chrome 154.0.8037.57, 1/1 passed (`browser.log`, повтор `browser-final.log`): trusted creation, size
  256/512, border 8/0, numeric preview Escape и undo/redo size/border,
  прежняя RU/EN × light/dark × 1024/1280 matrix. Просмотрены pointer 256/512 PNG.
  Первая попытка на cropped 160×120 fixture не могла принять 512 px
  (`browser-small-fixture.log`); spec переведён на существующий 2560×1440 harness.
- `pnpm check` — exit 0 (`check.log`): lint с существующими warnings,
  typecheck, format, docs, boundaries, IPC и четыре Rust clippy configuration.
  `pnpm format` выполнен (`format.log`, `format-last.log`),
  `pnpm format:check` — exit 0 (`format-check.log`). После добавления native
  диагностики повторный check обнаружил лимит функции 124/120 строк
  (`check-boundary-failure.log`); диагностика выделена в отдельный helper.
  Финальный `pnpm check` — exit 0 (`check-final.log`), включая исправленный
  architecture gate. Отдельная повторная architecture suite — 7/7 passed
  (`boundaries-final.log`).

- `XDG_SESSION_ID=loupe-pointer PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=loupe-settings pnpm test:e2e:tauri`
  — build successful, Wry 0.55.1 / WebKitGTK, external tauri-driver; 0/1,
  первоначальный drag не создал слой в Quick, до нового pointer helper
  (`native.log`, сохранённый `native-first-failure.png`). Повтор с
  `XDG_SESSION_ID=loupe-pointer-recheck` и явной проверкой active Loupe также
  остановился до создания (`native-recheck.log`): start hit-test вернул
  `.cs-canvas-stage`, end — canvas; active tool Loupe, fake source 400×300,
  viewport 1920×1054. Это не pass нового native size/border/cancel/undo контракта.
  Browser evidence не заменяет native. Physical capture, Windows/macOS и Wayland
  для этого изменения не проверялись.

## Однозначное выделение пресетов (2026-10-17)

Linux x86_64, Node 22.23.1, pnpm 10.33.2; логи — `artifacts/preset-focus/`.

- До исправления `pnpm exec vitest run --project vue tests/unit/vue/popover-control-focus.test.ts`
  — 10 failed / 1 passed: первый пресет получал focus вместо выбранного
  значения либо поля (`red.log`).
- `pnpm exec vitest run --project vue tests/unit/vue/popover-control-focus.test.ts tests/unit/vue/tool-formatting-toolbar.test.ts tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/ruler-toolbar.test.ts tests/unit/vue/numeric-control.test.ts`
  — 5 файлов / 36 passed (`focused.log`). Открытие не создаёт change/commit;
  проверены selected, custom/mixed, palette fallback и Escape focus return.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5297 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-preset-focus.e2e.ts`
  — 1/1 passed (`browser-final.log`), Chrome 154.0.8037.57. Trusted ruler creation,
  pointer/Enter reopen, 4 px / 24 px, custom 5 px, Escape, RU/EN × light/dark
  при 1024 px на документе 2560×1440. Просмотрены
  `artifacts/browser-e2e/preset-focus-ru-light-4.png`,
  `preset-focus-ru-dark-24.png`: первый пресет без ложной подсветки, панели
  внутри viewport. Первый browser прогон использовал detached WebDriver element
  после remount; повторно найденный элемент проходит проверку фокуса.
- `pnpm test` — 122 файла passed / 1 failed, 994 passed / 1 failed (`unit.log`):
  существующий `highlighter-preview.test.ts` превысил 5000 ms на illuminate/DPR 2.
  `pnpm exec vitest run --project vue tests/unit/vue/highlighter-preview.test.ts tests/unit/vue/popover-control-focus.test.ts`
  — повтор 2 файла / 17 passed (`focused-final.log`).
- Scoped ESLint изменённых исходников и тестов passed с двумя прежними ariaLabel
  warnings (`scoped-lint.log`); `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  passed (`e2e-types.log`). Первичный `pnpm typecheck` обнаружил неверный test-only
  toolSettings для loupe и параллельные history test types; fixture исправлена.
  `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` passed (`test-types-final.log`).
- `pnpm format` выполнен (`format-final.log`), `pnpm format:check` passed
  (`format-check.log`). Первичный `pnpm check` остановился на параллельной
  длинной строке `browser-history.e2e.ts` (`check.log`). Финальный повтор
  прошёл lint, typecheck, format и docs, затем остановился на architecture
  size budget параллельного `HistoryPopover.vue`: 556 > 500 строк
  (`check-final.log`, boundaries 9 файлов / 42 checks passed, 1 failed).
  IPC и Rust части общего gate после этой остановки не запускались.

Native WebView, Windows/macOS и Wayland runtime не запускались. Renderer,
document/history contracts и IPC не меняются; render/perf/Rust suites отдельно
не запускались.

## Понятные настройки линейки (2026-10-17, ADR-076)

Linux x86_64/X11, Node 22.23.1, pnpm 10.33.2. Логи — `artifacts/ruler-ux/`.

- До реализации `pnpm exec vitest run --project core packages/editor-core/src/ruler-measurement.test.ts`
  — ожидаемый red: 8 failed / 1 passed (`red.log`). Финальная focused core suite:
  11/11 passed (`core-final.log`): три базы, cropped scene, значения >100%, rotation/reflection,
  codec v7, legacy derived badge normalization, locked/hidden crop и exact undo/redo.
- `pnpm test` — 120 файлов / 977 проверок passed (`unit-complete.log`). После последней
  косметической правки размеров crop
  `pnpm exec vitest run --project vue tests/unit/vue/ruler-toolbar.test.ts` — 6/6 passed
  (`vue-dimensions-final.log`): атомарный режим/defaults, locked/read-only copy, Escape/focus,
  legacy preferences и дробная область без округления модели. Clipboard failure покрыт
  существующим `tool-formatting-toolbar.test.ts`; после выделения child component три
  focused Vue файла — 16/16 passed (`component-boundaries.log`).
- `pnpm test:render` — 10 файлов / 32 проверки passed (`render.log`).
  Новый `pnpm exec vitest run --project renderer packages/editor-renderer/src/precision-canvas2d.test.ts`
  — 22/22 passed (`renderer-third.log`): 2560×1440 document, crop 1200×800, три базы,
  повторное декодирование PNG и byte-for-byte parity с preview. Первоначальный медленный
  глубокий compare заменён на `Buffer.compare` без изменения pixel contract.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5291 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-ruler-toolbar.e2e.ts`
  — 2/2 passed (`browser-dimensions.log`), Chrome 154.0.8037.57: trusted pointer creation,
  четыре режима, crop, undo/redo, RU/EN × light/dark при 1024 px на 2560×1440 fixture.
  Значение/база не обрезаны и находятся в одной строке. Просмотрены RU/light меню,
  RU/dark закрытая панель и отдельный toolbar crop.
  PNG: `artifacts/browser-e2e/ruler-ux-{ru,en}-{light,dark}-{menu,closed,toolbar}.png`.
- `XDG_SESSION_ID=ruler-ux PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=ruler-toolbar,ruler-toolbar-reopen pnpm test:e2e:tauri`
  — 2 native scenarios passed (`tauri.log`), Wry 0.55.1/WebKitGTK: production
  Capture → Quick → Editor, четыре режима, crop, exact undo/redo, отдельный restart
  с сохранёнными документом и defaults. Просмотрен native Editor crop menu; после
  просмотра длинные дробные размеры в UI сокращены до двух знаков и проверены Vue/browser.
  PNG: `artifacts/tauri-e2e/ruler-ux-{quick,editor}-closed.png`,
  `ruler-ux-editor-crop-menu.png`, `ruler-ux-reopened.png`.
- `pnpm test:perf` — 2 файла / 6 проверок passed (`perf.log`), существующие CPU/4K/8K
  contracts; новый GPU frame-budget claim не делается.
- `pnpm test:boundaries` — 10 файлов / 43 проверки passed (`boundaries-final.log`).
  Исходный `pnpm check` выявил собственные превышения размера компонента и сложности
  reducer; выделены RulerMeasurementSettings и useRulerMeasurement, reducer разделён.
- `pnpm format` запускался после изменений. Общий `pnpm check` повторён: последняя
  остановка в lint на параллельно добавляемых `apps/desktop/src/history/*`
  (`check-complete.log`); это не успешный полный gate. `pnpm typecheck` собрал core/renderer/editor-vue, затем остановился на новых history
  imports (`naive-ui`, `@cute-screen/editor-renderer`) и implicit any в previews
  (`typecheck-final.log`). `pnpm format:check` также остановился на параллельных
  history-файлах (`format-check.log`); собственные ruler paths прошли scoped ESLint
  с двумя прежними ariaLabel warnings (`scoped-lint.log`).
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` passed (`e2e-types.log`).
  Последующие Rust/IPC части полного check после lint не выполнялись.

Native источник — fake 400×300: physical capture, Windows/macOS, Wayland portal runtime
и native large-image evidence этим изменением не заявлены. Полные Rust unit tests и
platform bundles отдельно не запускались; native runner собрал debug test harness.

## Shift для линейки (2026-10-17, ADR-074)

Linux 6.8.0-142-generic x86_64, Node 22.23.1, pnpm 10.33.2.
Логи — `artifacts/ruler-shift/`.

- До реализации `pnpm exec vitest run --project vue tests/unit/vue/ruler-shift.test.ts`
  — ожидаемый red: 6 failed / 2 passed (`red.log`). Core geometry не менялась.
- `pnpm test` — исходный полный прогон: 116 файлов / 935 проверок passed (`unit.log`). Новый input
  contract проверяет восемь направлений, нулевой жест, crop edge, обе Shift,
  Shift/Alt priority и configured step, key-only preview, оба endpoints,
  финальную pointerup-точку и Escape/blur/pointercancel. Существующие history
  tests проверяют exact undo/redo. После исправления только TS casts новая
  focused suite `pnpm exec vitest run --project vue tests/unit/vue/ruler-shift.test.ts tests/unit/vue/m08-precision-guides.test.ts tests/unit/vue/m08-precision-history.test.ts`
  повторена: 3 файла / 34 проверки passed (`focused-final.log`).
- `pnpm test:render` — 10 файлов / 32 проверки passed (`render.log`), включая
  существующие decoded ruler pixels/export и большие 4K/8K fixtures.
  Renderer и persisted geometry contract не менялись.
- `pnpm test:boundaries` — 10 файлов / 43 проверки passed (`boundaries.log`).
- `pnpm check` — исходный полный прогон passed: lint (68 прежних warnings, 0 errors), typecheck,
  format/docs, architecture boundaries, IPC и все Rust fmt/clippy profiles
  (`check.log`). `pnpm format` запускался после изменений; финальная
  `pnpm format:check` прошла (`format-check.log`).
- `pnpm test:perf` — 2 файла / 6 проверок passed (`perf.log`); существующие
  software CPU/4K/8K contracts, без нового GPU frame-budget claim.
- Расширенный native повтор прошёл input/history, но обнаружил ложный dirty
  badge после redo к сохранённой версии (`tauri-save-red.log`). SQLite revision 4
  содержала все четыре ruler; геометрия сохранена. Red-first regression
  `pnpm exec vitest run --project vue tests/unit/vue/document-session.test.ts`
  воспроизвёл `core.dirty: false` при `saveState: dirty` (`save-red.log`).
  `DocumentSession.redo` теперь использует `replayed.dirty`, как undo,
  и не запрашивает повторную запись уже сохранённой версии.
  `pnpm exec vitest run --project vue tests/unit/vue/document-session.test.ts tests/unit/vue/ruler-shift.test.ts`
  — 2 файла / 32 проверки passed (`save-green.log`); повтор native после
  исправления прошёл, включая исчезновение save badge (`tauri-final.log`).
- Промежуточный повтор общего `pnpm check` после исправления session остановился на
  параллельных изменениях Settings: обязательный prop `ShortcutRow.state`
  ещё не передавался из `SettingsApp.vue` (`check-settings-intermediate.log`). Промежуточный
  `pnpm test` — 115 файлов / 931 проверка passed, 2 файла / 8 проверок failed
  в `activation-settings.test.ts` и `settings-navigation.test.ts`
  (`unit-settings-intermediate.log`). Эти файлы и Settings менялись параллельно в общей
  рабочей копии; изменения линейки/session в failed suites не участвуют.
  Поздний `pnpm check` снова остановился на текущих Settings/recorder:
  unused `props`, mutation `state` prop и форматирование новых tests
  (`check-settings-lint-intermediate.log`, 29 errors / 68 warnings на момент запуска).
  Последний полный `pnpm test` после обновления Settings прошёл:
  118 файлов / 948 проверок (`unit-final.log`). Последний общий check
  прошёл lint и package build, затем остановился на исчезнувшем
  `@cute-screen/editor-renderer` и производных implicit-any в старом
  `tauri-quick-editor-handoff.e2e.ts` (`check-final.log`). Во время сбоя
  наблюдался второй параллельный `build:packages`/typecheck, обновлявший общий
  `dist`; это не подтверждает новый type defect. После восстановления outputs
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` прошёл
  (`e2e-typecheck-final.log`). Финальный общий `pnpm check` не объявляется
  полностью зелёным; первоначальный полный green сохранён в `check.log`.
  Форматирование файлов функции отдельно проверено командой
  `pnpm exec eslint --config eslint.format.config.js packages/editor-vue/src tests/e2e/ruler-shift.ts tests/e2e/specs/browser-ruler-shift.e2e.ts tests/e2e/specs/tauri-ruler-shift.e2e.ts tests/e2e/wdio.browser.conf.ts scripts/run-tauri-e2e.mjs tests/unit/vue/ruler-shift.test.ts tests/unit/vue/document-session.test.ts tests/unit/vue/m08-precision-guides.test.ts`
  — passed (`format-feature.log`).
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5281 pnpm test:e2e:browser --spec tests/e2e/specs/browser-ruler-shift.e2e.ts`
  — Chrome 154.0.8037.57: 5 scenarios passed (`browser-final.log`), обе Shift,
  key-only preview по изменению overlay pixels без pointermove, endpoints,
  undo/redo, Escape draft и tooltip RU/EN; endpoint resize явно выбирает Select
  и сохраняет ID, число слоёв и неподвижный конец. DPR 1/2 × Fit/1:1 на документе
  2560×1440. PNG — `artifacts/browser-e2e/ruler-shift-*.png`.
  Первый headed run прошёл без дополнительного cancel assert (`browser.log`);
  расширенный headed повтор прерывался внешним window blur (input trace в
  `browser-debug.log`). Итоговый headless run изолирует focus на общем desktop;
  production blur cancellation остаётся включённой.
- `XDG_SESSION_ID=ruler-shift PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=ruler-shift pnpm test:e2e:tauri`
  — 1 scenario passed (`tauri-final.log`), Wry 0.55.1/WebKitGTK: production
  Capture → Quick → Editor, обе Shift, key-only preview, endpoint resize,
  undo/redo и Escape без закрытия Quick. PNG —
  `artifacts/tauri-e2e/ruler-shift-{quick,editor}{,-45}.png`.
  Просмотрены browser DPR2 Fit и native Quick 45°.
- Native source — fake 400×300: physical capture, Windows/macOS,
  Wayland portal runtime и native 4K/8K в этом изменении не запускались.

## Меню других действий (2026-10-17)

Linux x86_64, Chrome 154.0.8037.57, Node 22.23.1, pnpm 10.33.2.
Логи: `artifacts/topbar-menu/`; screenshots:
`artifacts/browser-e2e/topbar-menu-{1024,1600}-{ru,en}-{light,dark}.png`.

- `CUTE_SCREEN_BROWSER_E2E_PORT=5276 pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep 'fits localized|places the overflow|switches locale|capture, copy'`
  — 4/4 passed. Новая проверка покрывает восемь комбинаций ширины окна,
  локали и темы: реальные bounds текста внутри пунктов, bounds меню внутри
  viewport, появление hover tooltip и его исчезновение при открытии меню,
  отсутствие дублирующего native title, закрытие повторным кликом.
  Смена языка/темы и доступность основных действий проверены существующими
  сценариями. Просмотрены screenshots 1024/RU/light и 1600/RU/dark.
- `pnpm test --project vue tests/unit/vue/app-arrow-actions.test.ts`
  — 11/11 passed, включая disabled capture и routing действий TopBar.
- В in-app Chromium дополнительно открыт `/?m05=1`: активные flip actions
  полностью помещаются в светлое меню; смена темы не оставляет tooltip над ним.
- Полный `browser-shell.e2e.ts` до добавления новой проверки дал 6 passed,
  1 failed: ожидание `.cs-context-toolbar .cs-highlighter-toolbar` в первом
  сценарии. Остальные сценарии, включая меню, прошли.
- `pnpm check` прошёл lint и package build, затем остановился на TS7053
  в параллельно добавленном `tests/unit/vue/ruler-shift.test.ts` (строки
  27/44/55/68). Дальнейшие части общего gate этим запуском не подтверждены.
- `pnpm format` и `pnpm format:check` выполнены; Prettier passed, ESLint
  formatting остановился на параллельных изменениях
  `canvas/keyboard-controller.ts` и `canvas/pointer-down-controller.ts`.
  Отдельные lint и ESLint-format checks изменённых `TopBar.vue` и
  `browser-shell.e2e.ts` прошли. `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`,
  `pnpm docs:check` и `git diff --check` passed.

Это исправление CSS/tooltip существующего UI-контракта; renderer/core/IPC и
принятые ADR не меняются. Native WebView и Windows/macOS здесь не проверялись.

## Прямые участки через Shift (2026-10-17, ADR-073)

Linux x86_64, Chrome 154.0.8037.57, Node 22.23.1, pnpm 10.33.2.
Логи и decoded PNG: `artifacts/straight-strokes/`.

- До реализации `pnpm test --project core packages/editor-core/src/straight-stroke.test.ts`
  дал ожидаемый red: новый DOM-free модуль отсутствовал (`red.log`).
- `pnpm test` — 115 файлов / 913 проверок passed (`unit-all.log`).
  Focused core/brushes/Vue input — 4 файла / 42 проверки passed, включая
  coalesced samples, отпускную точку, отмену, две одновременно зажатые Shift,
  codec/style/resize/history и восемь направлений (`focused-final.log`).
- `pnpm test:render` — 10 файлов / 32 проверки passed (`render.log`).
  Новый decoded contract проверяет три pencil brushes и marker при scale 1/2,
  цельный alpha на стыках и Canvas2D preview/export equality. CanvasKit
  проходит существующий semantic tolerance. PNG `ink-{1,2}-{canvas2d,canvaskit}.png`
  сохранены; просмотрен `ink-2-canvas2d.png`. Production-like UI fixtures 3840×2160 и 7680×4320 содержат
  12000 samples на каждый из четырёх штрихов и шесть spotlight apertures;
  экспорт повторно декодирован и сравнен по полному pixel checksum.
  Метрики и SHA-256 исходников — `render-4k.json`, `render-8k.json`.
- `pnpm test:perf` — 2 файла / 6 проверок passed (`perf.log`).
  Новый CPU contract обрабатывает 12000 raw samples при 4K/8K;
  input и geometry timings для трёх кистей записаны в `perf-{3840,7680}.json`.
  Это CPU/software evidence; новый GPU frame-budget claim не делается.
- `pnpm check` прошёл: lint (68 существующих warnings, 0 errors), typecheck,
  format/docs, 43 architecture checks, IPC и все Rust fmt/clippy configurations
  (`check.log`). Повтор `pnpm test:boundaries` — 43/43 (`boundaries-final.log`).
- `CUTE_SCREEN_BROWSER_E2E_PORT=5274 pnpm test:e2e:browser --spec tests/e2e/specs/browser-straight-strokes.e2e.ts --spec tests/e2e/specs/browser-brushes.e2e.ts`
  — 2 specs / 6 scenarios passed (`browser-final.log`). Trusted pointer/key
  input проверяет marker и три pencil brushes, Shift до старта и посреди
  gesture, обе Shift, undo/redo, Escape constrained draft, DPR 1/2 × Fit/1:1
  на 2560×1440 document и RU/EN tooltip при 1024 px. Existing brush settings,
  freehand creation и cancel также passed. PNG `straight-strokes-{1,2}-{fit,actual}.png`
  находятся в `artifacts/browser-e2e/`.
- `XDG_SESSION_ID=straight-strokes PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=straight-strokes,straight-strokes-reopen pnpm test:e2e:tauri`
  — 2 сценария / 2 проверки passed (`tauri.log`), Wry 0.55.1/WebKitGTK с
  external WebKitWebDriver. Production Capture → Quick → Editor: marker и все
  три кисти, обе Shift, undo/redo, Escape во время constrained stroke без
  закрытия Quick, затем restart и восстановление шести pencil v3 и двух marker.
  Native fake source — 400×300; physical capture и native 4K/8K не проверялись.
  Просмотрены `artifacts/tauri-e2e/straight-strokes-quick.png` и
  `straight-strokes-reopened.png`; settings открываются видимой кнопкой при
  свёрнутой автоматической строке, cancel не оставляет draft в документе.
  Windows/macOS/Wayland portal runtime остаются отдельными gates.
- Native constrained Escape выявил более ранний window Close listener Quick:
  `escape-red.log` воспроизводит закрытие draft вместо отмены штриха. Capture-phase
  canvas-controller handling теперь потребляет Escape только активного pencil/marker draw.
  `pnpm test --project vue tests/unit/vue/straight-strokes.test.ts tests/unit/vue/quick-capture-warmup.test.ts`
  — 14/14 passed (`escape-green.log`); `escape-window-red.log` фиксирует regression при
  window-targeted input. Отмена начального Area selection сохранена.

Первый native build столкнулся с очисткой `editor-core/dist` другим build
(`tauri-build-conflict.log`); последующие package builds запускались последовательно.
Крошечная старая m05 fixture 160×120 с crop 100×80 при Fit × DPR 2 превышает
существующий лимит renderer scale 16. Shift matrix использует существующую
2560×1440 viewport fixture. Параллельный native launch прерывал browser gesture
через штатный blur/cancel; итоговые native/browser прогоны разделены.

## Прямые разделители тулбаров (2026-10-17)

`REQ-UI-001`: Shape и Highlighter используют UiSeparator вместо боковых рамок
скруглённых кнопок. Browser/WebView checks измеряют линии после применения CSS:
1×21 CSS px, radius 0, центрирование, отсутствие боковой рамки кнопки,
декоративность без focus/pointer target и отсутствие выхода панели за viewport.
Проверены остальные toolbar borders: Text groups, Censor effects, Crop и custom
colour area уже прямые; ToolRail и Arrow уже используют общий компонент.

Платформа: Linux x64/X11, Chrome 154.0.8037.57. Логи и копии скриншотов:
`artifacts/toolbar-separators/`.

- `pnpm exec vitest run --project vue tests/unit/vue/shape-context-toolbar.test.ts tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/arrow-context-toolbar.test.ts tests/unit/vue/quick-context-toolbar.test.ts`
  — 4 файла, 29/29 passed (`components.log`).
- `pnpm check` — exit 0 до параллельных правок straight-stroke: lint, typecheck,
  format, docs, boundaries, IPC и Rust checks (`check.log`).
- Финальный `pnpm check` в общем workspace — exit 1 (`check-final.log`):
  lint, typecheck, format и docs passed, boundaries 41/43. Новые параллельные
  правки карандаша добавили цикл freehand → constrained-freehand → freehand
  и complexity 21/20 в freehand и drawing-schema. IPC/Rust в этом повторе
  не запускались после остановки gate; production-файлы разделителей не менялись.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5184 pnpm test:e2e:browser --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts --spec tests/e2e/specs/browser-highlighter.e2e.ts --mochaOpts.grep 'edits paint|keeps straight separators'`
  — 2/2 passed (`browser-stable.log`), RU/EN × light/dark × окна 1024/1280 px.
  Проверены selection toolbar фигур, defaults выделителя, открытие панелей,
  возврат focus по Escape, палитра, сохранение undo/redo в сценарии фигур.
- `XDG_SESSION_ID=toolbar-separators-isolated CARGO_TARGET_DIR=/home/vladimir/remote/cutescreen/target PATH="/home/vladimir/remote/cutescreen/artifacts/spotlight-fix/tools/bin:/home/vladimir/remote/cutescreen/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=toolbar-separators pnpm test:e2e:tauri`
  — 1/1 passed (`tauri-geometry.log`), из той же копии. Настоящий wry 0.55.1
  WebView: production fake Capture → Quick → материализованный Editor,
  Shape и Highlighter, включая явную кнопку Settings при скрытых defaults.
  Четыре просмотренных скриншота — `native/separators-{quick,editor}-{shape,highlighter}.png`.
  Windows/macOS этим прогоном не подтверждены.

Browser matrix выполнена в `/tmp/cutescreen-toolbar-separators-qa`: копия
исходников с изменениями этой задачи и исходными незакоммиченными изменениями.
Поздние параллельные правки карандаша исключены только из копии, поскольку Vite
перезагрузил основной runner посреди проверки. Зависимости подключены ссылками;
только в копии server.fs.allow разрешает workspace и общий dependency root для
fonts. Основные исходники и конфигурация Vite этим не изменены. SHA-256 четырёх
изменённых production-файлов — `source-sha256.txt`; они совпадают с копией.

Просмотрены полные desktop/minimum-size screenshots и crops всех восьми
сочетаний каждой панели. Нет скобок, перекосов или обрезанных toolbar controls;
радиусы кнопок и читаемость линий сохранены. Матрица —
`browser/{shape,highlighter,palette}-{1024,1280}-{en,ru}-{light,dark}.png`;
контактные листы — `shape-review.png`, `highlighter-review.png`.

Полные исходные E2E запускались отдельно и не объявляются зелёными:
`browser.log` содержит сбои создания/повторного создания фигур и выноски,
preview checksum выделителя; `tauri.log` — release средней кнопки в cursor
scenario и WebKit color-input normalization `#369` вместо `#336699`.
Повтор в основном workspace (`browser-geometry.log`) прерван hot reload от
параллельной правки. Первый запуск копии потребовал workspace dependency links
и Vite fs.allow (`browser-isolated*.log`); после настройки matrix прошла.

Первый `pnpm format` прошёл (`format.log`); повтор застал новую строку 132
символа в параллельно изменённом core codec (`format-final.log`). После следующих
параллельных правок общий `pnpm format` снова прошёл (`format-after-docs.log`). Scoped lint
и formatter checks изменённых здесь JS/TS/Vue проходят (`scoped-lint.log`,
`scoped-format.log`); E2E typecheck — `e2e-types.log`.
Итоговые `pnpm format` и `pnpm format:check` проходят (`format-complete.log`,
`format-check.log`).

## Кнопки формы фонаря (2026-10-17, ADR-072)

Linux x86_64/X11, Chrome 154.0.8037.57, Node 22.23.1, pnpm 10.33.2.
Логи — `artifacts/spotlight-shapes/`.

- `pnpm test --project vue tests/unit/vue/tool-formatting-toolbar.test.ts tests/unit/vue/m08-precision-history.test.ts`
  — 2 файла / 11 проверок passed: прямое изменение формы активной области,
  независимость областей, locked/unlock, одна command и undo.
- `pnpm test` — 113 файлов / 886 проверок passed (`unit-all.log`).
- `CUTE_SCREEN_BROWSER_E2E_PORT=5259 pnpm test:e2e:browser --spec tests/e2e/specs/browser-spotlight-preview.e2e.ts`
  — 2/2 passed. Defaults на 2560×1440 document при окне 1024×800:
  RU/EN × light/dark, три icon buttons, один pressed, локализованные title,
  Tab/Space и минимум 36×36 CSS px без overflow. Pointer creation и изменение
  формы выбранного слоя проверяют payload, undo/redo, move и cancel.
  Просмотрены `artifacts/browser-e2e/spotlight-shapes-ru-{light,dark}.png`:
  selected/focus видны, группа помещается над ToolRail без обрезки.
- `pnpm build:packages`, `pnpm lint`, `pnpm typecheck` — passed;
  lint — 68 существующих warnings, 0 errors.
- `XDG_SESSION_ID=spotlight-shape-buttons PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=spotlight-preview pnpm test:e2e:tauri`
  — 1/1 passed, Wry 0.55.1/WebKitGTK. Production Capture → Quick → Editor:
  создание фонаря, прямой Rectangle → Ellipse, точный undo/redo и прежний
  preview/move/cancel contract в обеих поверхностях. Просмотрен
  `artifacts/tauri-e2e/spotlight-editor-shapes.png`; native source — fake 400×300.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` — passed.
  Renderer/core/Rust не менялись; renderer goldens, perf, полный `pnpm check`
  и release bundles для этого UI-среза не запускались.

## Чёткие края фонаря по умолчанию (2026-10-17, ADR-071)

Linux x86_64/X11, Chrome 154.0.8037.57, Node 22.23.1, pnpm 10.33.2.
Артефакты и логи: `artifacts/spotlight-default/`.

- `pnpm format`, `pnpm build:packages`, `pnpm lint`, `pnpm typecheck` — passed;
  lint содержит 68 существующих warnings, без errors.
- `pnpm test` — 113 файлов / 886 проверок passed (`unit.log`).
- `CUTE_SCREEN_BROWSER_E2E_PORT=5257 pnpm test:e2e:browser --spec tests/e2e/specs/browser-creation-settings.e2e.ts --spec tests/e2e/specs/browser-spotlight-preview.e2e.ts`
  — spotlight-preview passed: pointer creation создаёт `feather: null`, панель
  показывает Sharp; preview/move/undo/redo/cancel также прошли. Общий
  creation-settings остановился на существующей проверке `.n-tooltip` Text.
  Повтор только creation-settings на порту 5258 дал ту же ошибку;
  полного RU/EN × light/dark pass для этого сценария нет.
- Просмотрены `artifacts/browser-e2e/creation-settings-spotlight-en-light.png`
  и `creation-settings-spotlight-ru-light.png`: панель показывает Sharp/Чётко,
  controls помещаются над ToolRail. Английская dark-проверка также прошла;
  до русской dark-комбинации общий сценарий не дошёл.
- `XDG_SESSION_ID=spotlight-default-edges PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=spotlight-preview pnpm test:e2e:tauri`
  — 1/1 passed в Wry 0.55.1/WebKitGTK: production Capture → Quick → Editor,
  новый слой в обеих поверхностях имеет `feather: null`, панель — Sharp,
  gesture preview, move, undo/redo и cancel проходят. Fake capture — 400×300;
  этот прогон подтверждает native UI, а не physical capture или large-image parity.
  Лог — `tauri.log`, screenshots — `artifacts/tauri-e2e/spotlight-*.png`.
- `pnpm docs:check`, `pnpm format:check` — passed. Rust/renderer код не менялся;
  `pnpm check`, `pnpm test:render`, `pnpm test:perf`, `cargo test --workspace`
  и release build для этого изменения не запускались.

## Контекстные настройки инструментов (2026-10-17, ADR-069)

Linux x86_64/X11, Node 22.23.1, pnpm 10.33.2, Chrome 154.0.8037.57,
Tauri/Wry 0.55.1 и WebKitGTK. Изменения ограничены presentation/defaults routing;
document v7, IPC и renderer geometry сохранены.

- `pnpm test` — 113 файлов / 884 проверки passed. После уточнения скрытой
  Quick строки focused lifecycle/context/layout regressions — 48/48;
  повторная активация того же инструмента закрывает вложенные меню — 59/59
  lifecycle/tool-ux после добавления двух регрессий. Финальная проверка возврата
  keyboard focus при удалении старого defaults control — 60/60.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-creation-settings.e2e.ts`
  с `CUTE_SCREEN_BROWSER_E2E_PORT=5246` — passed. Production shell монтирует
  документ 2560×1440 через существующий m05viewport harness; все девять
  defaults проверяются горячими клавишами при 1024 px в RU/EN и light/dark.
  Tooltip Text (T)/Текст (T), отсутствие нижней панели до клика по canvas и
  появление inline toolbar проверяются вводом. Визуально проверены снимки
  `artifacts/browser-e2e/creation-settings-{en,ru}-{light,dark}.png`.
- `XDG_SESSION_ID=context-settings-quick PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=creation-settings pnpm test:e2e:tauri`
  — 1/1 passed. Production Capture → Quick → Editor, реальные pointer gestures:
  внешнее размещение всей группы при маленькой рамке, фиксация chrome во время
  resize, сворачивание settings при полном frame и первый штрих после
  outside-dismiss. Native smoke использует существующий fake-capture source
  400×300 при полноэкранном CSS viewport; он подтверждает native input/layout,
  а не реальный захват desktop или обработку больших native изображений.
  Большой документ проверен отдельно browser matrix.
- Итоговый browser contract: `CUTE_SCREEN_BROWSER_E2E_PORT=5245 pnpm test:e2e:browser --spec tests/e2e/specs/browser-creation-settings.e2e.ts --spec tests/e2e/specs/browser-tool-lifecycle.e2e.ts --spec tests/e2e/specs/browser-brushes.e2e.ts`
  — 3 specs / 4 scenarios passed. Дополнительно loupe — 1/1,
  shape toolbar — 4/4 и arrow tools — 4/4 passed в focused прогонах.
- Расширенные legacy E2E не полностью зелёные: browser tool-settings
  останавливается на move/resize aperture; highlighter — на preview/commit
  checksum. Native tool-lifecycle keyboard прошёл в обоих WebViews, X11
  context-menu часть остановилась на document focus. В quick-chrome не
  открылся вложенный custom picker, остальные тесты этого прогона каскадно
  потеряли чистый draft. Эти результаты не объявляются успешными и не
  подтверждают sampling/parity в полном native legacy suite.
- Первый browser matrix выявил обрезку RU numbered-marker defaults на узком
  окне; max-width теперь ограничен родительской строкой, группы переносятся.
  Старые configure-only assertions перенесены на persistent defaults.
  Расширенный highlighter E2E пока не проходит строгое сравнение preview/commit;
  диагностика зафиксировала дополнительные driver pointerup в (0, 0).
  Попытки стабилизации input не считаются renderer evidence.

Native PNG в `artifacts/tauri-e2e/creation-settings-quick-outside.png`,
`creation-settings-quick-manual.png`, `creation-settings-quick-first-stroke.png`
и `creation-settings-editor.png` просмотрены. Автоматическая строка находится
вне рамки; явная панель доступна кнопкой и не требует дополнительного клика
перед рисованием. Windows/macOS/Wayland runtime не запускались.

Итоговый `pnpm check` прошёл полностью: lint, typecheck, formatting/docs,
43 architecture checks, IPC codegen check и все Rust fmt/clippy configurations.

Первоначальные `pnpm check` остановились на budgets параллельного Settings
кода и на добавленной строке в createWorkspaceCore; оба участка разделены
на небольшие функции, последующий architecture suite — 43/43. Первый native
build остановился на Rust-ошибке is_err_or в shortcuts/operations.rs; после
исправления повторный native build и новый сценарий прошли.
Предыдущие неуспешные попытки и итоговые логи сохраняются в
`artifacts/contextual-tool-settings/`.

## Измеряемые подписи выносок (2026-10-17, ADR-065)

Linux x86_64/X11, Node 22.23.1, pnpm 10.33.2, Chrome 154.0.8037.57.
Core red-first regressions initially failed four assertions: supplied metrics,
left placement, padded gap and missing width grip. Final geometry also checks
world-coordinate preservation under rotation and measured spatial-index hits.

- `pnpm test` — 110 files / 848 tests passed. The final controller extraction
  was followed by 31/31 focused Vue tests and 43/43 architecture boundary tests.
- `pnpm test:render` — 8 files / 26 tests passed. New callout tests round-trip
  v7, decode Canvas2D/CanvasKit PNGs, inspect label pixels and verify exact
  Canvas2D preview/export pixel identity. Existing goldens are unchanged.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5231 pnpm test:e2e:browser --spec tests/e2e/specs/browser-callout-layout.e2e.ts --spec tests/e2e/specs/browser-callout-visual.e2e.ts --spec tests/e2e/specs/browser-text-layout.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-editing.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts`
  — 5 specs / 13 scenarios passed; exercises production drag creation on both sides, 480 px wrapping, stable
  commit/reopen, 720 px manual width, direct grip resize, popup focus/Escape and
  atomic undo/redo. Mixed font sizes retain the label's vertical center.
  Visual evidence covers 1024 px × RU/EN × light/dark × 50/100/200% zoom.
- `XDG_SESSION_ID=callout-layout-final PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=callout-layout pnpm test:e2e:tauri`
  — 1/1 passed in real Tauri/Wry/WebKitGTK with native creation, reopen,
  numeric input, popup focus/Escape, grip resize and undo/redo. The first
  shared-session attempt collided with the running application's activation
  endpoint; an isolated embedded-driver attempt opened the app but did not
  deliver the creation drag. The external driver passed without closing the
  user's editor. Windows/macOS/Wayland were not run.

The measured projection now supplies paragraph struts from the largest span and
proportional line heights on child spans. Width popup input receives focus after
its measured placement becomes visible. Browser text-layout's palette regression
now opens tool defaults through the ADR-063 right-click entry point.
Source changes preserve existing keyboard-shortcut work. Schema v7, IPC and
original image storage are unchanged. Build commands must run sequentially because
`build:packages` cleans shared outputs. Existing jsdom canvas warnings and
CanvasKit externalization/bundle-size notices do not constitute test failures.

Evidence is collected in `artifacts/callout-layout/`; browser and native PNGs
were visually inspected, including 1024 px RU/dark/100%, EN/light/200%, and the
selected left callout with its outer width grip.

Final `pnpm check` passed (lint, typecheck, format/docs, 43 boundary tests,
IPC generation check and all Rust fmt/clippy configurations). `pnpm tauri build
--debug --no-bundle` passed and restored the production executable after native
harness testing. Final `pnpm format`, `pnpm format:check` and `pnpm docs:check`
are retained with the other logs.

## Физические буквенные shortcuts редактора (2026-10-16, ADR-064)

Ubuntu 24.04.5 LTS x86_64, Node 22.23.1, pnpm 10.33.2, Vitest 4.1.10:
`pnpm vitest run --project vue tests/unit/vue/keyboard-shortcuts.test.ts tests/unit/vue/tool-ux.test.ts tests/unit/vue/app-content-actions.test.ts`
— 3 files / 40 tests passed. Проверены `KeyZ` с русскими `я/Я`, Arabic `key`
при `KeyV`, priority `code`, ASCII fallback при пустом/`Unidentified` code,
Ctrl/Cmd history/open/duplicate/copy/cut/paste/style clipboard, editable target,
IME и `defaultPrevented`. Mounted shell отдельно проверяет русский Undo/Redo,
Duplicate, text cut и style clipboard.

Chrome 154.0.8037.57 на Linux x86_64:
`CUTE_SCREEN_BROWSER_E2E_PORT=5197 pnpm test:e2e:browser --spec tests/e2e/specs/browser-keyboard-shortcuts.e2e.ts`
— 1/1 passed. Настоящий browser keyboard input создаёт Arrow, отменяет,
возвращает и дублирует его. Нелатинский `key` при фиксированном `code` проверен
изолированно в component/unit-среде: WebDriver не переключает системную раскладку
без изменения пользовательской сессии. Real Tauri и системные RU/EN раскладки,
Windows/WebView2, macOS/WKWebView и Wayland этим срезом не запускались; новых
platform claims нет.

## Диагностика Vitest workers (2026-10-16)

`REQ-REL-001/002/003/005`. Платформа: Ubuntu 24.04.5 LTS x86_64,
Linux 6.8.0-142-generic, Node 22.23.1, pnpm 10.33.2, Vitest 4.1.10;
`os.availableParallelism()` = 16, 16 GiB RAM. Без явного предела Vitest
этой версии запускает до 15 fork workers. jsdom, native Canvas2D и WASM
используют память одновременно; V8 coverage увеличивает стоимость тестов.

До изменения конфигурации:

- `pnpm test` — 109 files / 831 tests passed, 28.49 s.
- `pnpm test:coverage` — exit 1: 11 failed files, 17 test timeouts по 5000 ms;
  98 files / 814 tests passed, 44.85 s. В том числе два случая
  `highlighter-preview.test.ts`, но также mounted-shell tests в других файлах.
- `pnpm test:coverage --maxWorkers=2` — exit 0: 109 files / 831 tests passed,
  88.05 s, без unhandled errors и без увеличения timeout.

В [CI run 38952953949](https://github.com/VladimirIvanin/cute-screen/actions/runs/38952953949/job/117148635896)
публичные check annotations также фиксируют два timeout в
`highlighter-preview.test.ts` при density 2. Это другой запуск, чем исходный
фрагмент с `Worker exited unexpectedly`: локально аварийный выход процесса
не воспроизведён. Stack Vitest не содержит exit signal/имя worker, поэтому
OOM либо native crash по этому фрагменту не доказаны. Полные CI logs через
REST требуют repository admin access (403); публичные annotations сохранены.

Общий default `maxWorkers: 2` ограничивает нагрузку для всех Vitest projects;
изоляция файлов, timeout и fail-on-unhandled-error сохраняются.
Артефакты диагностики: `artifacts/vitest-worker/baseline.log`,
`coverage-baseline.log`, `coverage-two-workers.log`, `github-annotations.json`.

После изменения default, без CLI-override:

- `pnpm test` — exit 0: 109 files / 831 tests passed, 67.84 s.
- `pnpm test:coverage` — exit 0: 109 files / 831 tests passed, 84.47 s;
  unhandled errors отсутствуют.
- `pnpm test:render` — exit 0: 7 files / 24 tests passed, 7.24 s;
  committed goldens не обновлялись.
- `pnpm test:perf` — exit 0: 1 file / 4 tests passed, 69.47 s;
  production-shaped 4K/500 и 8K/1000 CanvasKit redraws. Software trends не
  подтверждают GPU/product performance budgets.
- `pnpm test:boundaries` — exit 1: 9 files / 42 tests passed, один architecture
  test failed: `packages/editor-vue/src/shell/workspace/keyboard-controller.ts:244`
  имеет complexity 22 при лимите 20. Во время проверки в workspace параллельно
  появились правки keyboard shortcuts; в изменении Vitest этот файл не
  редактировался. Остальные boundary contracts прошли.
- `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check` — exit 0;
  lint содержит 63 warnings без errors.

Логи финальных suites — `artifacts/vitest-worker/*-fixed.log`,
статические проверки — `format.log`, `lint.log`, `typecheck.log`, `docs-check.log`
в том же каталоге; финальная проверка форматирования — `format-check.log`.
Unit/coverage/lint/typecheck завершились до появления параллельных keyboard
правок и не подтверждают эти более поздние изменения. Новый CI run не запускался;
эффект изменения на hosted runner пока не подтверждён. Более низкая параллельность увеличивает время
локального прогона в обмен на ограничение одновременной нагрузки.

Runtime продукта, document schema и платформенные capability не меняются;
новый ADR и native E2E для этой настройки не требуются.

## Курсор номерных меток (2026-10-16)

`REQ-TOL-006`, `REQ-UI-005`: Linux x86_64, Chrome 154.0.8037.57,
Node 22.23.1, pnpm 10.33.2. Команда
`CUTE_SCREEN_BROWSER_E2E_PORT=5198 pnpm test:e2e:browser --spec tests/e2e/specs/browser-creation-cursors.e2e.ts`
— 1/1 passed. Через production mount и pointer input проверены немедленный
crosshair, hover над объектами, middle-pan и возврат креста для Pencil,
Highlighter и Numbered marker; Hand/Select сохраняют свои курсоры.
`pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` — exit 0
(lint содержит существующие warnings). Логи — `artifacts/numbered-cursor/`.
Screenshot `artifacts/browser-e2e/creation-cursors-numbered-marker-cursor.png`
просмотрен: инструмент активен, панели видимы. Browser screenshot не содержит
системный pointer; cursor проверен computed style. Интерактивная проверка
выбора Numbered marker также вернула `crosshair`.

Полный `browser-highlighter.e2e.ts` после успешной cursor matrix упал на
preview/committed checksum Highlighter (`verifyHighlighter`, sceneChecksum);
его успех не заявляется. Native WebView и другие платформы не запускались.
Архитектурное решение и persisted document не менялись, новый ADR не требуется.

## Панель текста: curated fonts и palette (2026-10-16, ADR-061)

Платформа: Ubuntu 24.04.5 LTS x86_64, Linux 6.8.0-142-generic, X11;
Chrome 154.0.8037.57, native WebKitGTK 605.1.15, Node 22.23.1, pnpm 10.33.2.

Команды и фактические результаты:

- `pnpm format` — passed; `pnpm format:check` — passed после записи evidence.
- `pnpm test --maxWorkers=2` — 106 files, 788/788 passed. Обычный полностью
  параллельный запуск ловил 5-second timeout в unrelated mounted/perf tests;
  повтор с двумя workers стабилен. Лог `artifacts/text-toolbar-2026-10-16/unit.log`.
- `pnpm exec vitest run --project vue tests/unit/vue/text-context-toolbar.test.ts
tests/unit/vue/text-font-picker.test.ts --project renderer
packages/editor-renderer/src/canvas2d-text-paint.test.ts` — 15/15 passed.
  Mixed/disabled controls, palette Apply/Cancel, load/error/retry, keyboard,
  Unicode-safe sample, local face cache и focus return проверены.
- `pnpm test:render` — 7 files, 24/24 passed; 4 новых goldens:
  `tests/goldens/m01-renderer/text-fonts-{latin,cyrillic}-{canvas2d,canvaskit}.png`.
  В каждом изображении все 12 families, regular и B/I. Preview/export
  повторно декодируются и сравниваются. Visual QA обнаружил tofu вместо цифр
  у Cyrillic в headless Canvas2D: resolver теперь передаёт ordered subset family
  list. CanvasKit делит смешанный fragment по script. Оба набора PNG просмотрены.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5185 pnpm test:e2e:browser --spec
tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts --spec
tests/e2e/specs/browser-v7-rich-text-editing.e2e.ts --spec
tests/e2e/specs/browser-text-fonts.e2e.ts` — 3 specs / 7 scenarios passed.
  Проверены range formatting, one-command commit, undo, все 12 family через
  меню, binary PNG decode и 12 combinations locale/theme/width. Дополнительный
  повтор font spec — 2/2 passed: Enter/Home в меню и стабильный screenshot.
  Для contenteditable используется native typing в production mount-focus;
  WebDriver addValue мог кликнуть по перекрывающему popover после auto-size.
  Артефакты: `artifacts/browser-e2e/text-toolbar-*.png`, `text-font-menu.png`.
- `pnpm audit:licenses`,
  `pnpm --filter @cute-screen/editor-vue exec node ../../scripts/check-js-licenses.mjs`
  — passed. Точные Fontsource 5.3.0 OFL exceptions добавлены после проверки
  metadata/licenses; Roboto Slab использует Apache-2.0. Copyright notices и полные
  license texts поставляются в `apps/desktop/public/font-licenses.txt`.
- `pnpm audit:security` — exit 0, high/critical отсутствуют; отчёт содержит
  одну low severity запись. `pnpm check:rust` — passed (fmt и все clippy variants); `pnpm ipc:check` — passed.
- `pnpm check` проходит lint/typecheck/format/docs, но architecture boundary
  останавливается на ранее изменённом `packages/editor-core/src/styles.ts`:
  complexity 23 при лимите 20. TextFontPicker boundary исправлен; оставшаяся
  ошибка относится к параллельному изменению кистей и здесь не переписана.
- `CUTE_SCREEN_E2E_SCENARIOS=v7-rich-text,quick-chrome pnpm test:e2e:tauri`
  собрал свежий test binary; первый запуск конфликтовал с существующим activation
  endpoint. Повтор с отдельным `XDG_RUNTIME_DIR=$(mktemp -d
/tmp/cs-text-runtime.XXXXXX)` запустил WebKitGTK: panel mount/no-overflow прошли,
  но scene click не создал contenteditable; Quick specs остановились на tool
  configure/right-click/selection. Отдельный v7 повтор с native pointer actions
  дал тот же missing-editor result. Native edit, fonts и Quick handoff остаются
  непроверенными; успешный Chrome не подменяет native evidence.

Viewport screenshots дополнительно осмотрены через интерактивный браузер.
Меню ограничено 480 px по высоте, все text groups остаются целыми; экран и
originals не меняются от открытия меню/наведения. Ожидание последнего font-ready
frame добавлено в Copy/Quick PNG перед encoding. Windows/macOS/Wayland не запускались.

## Live preview фона текста и встроенная палитра (2026-10-16)

Ubuntu 24.04.5 LTS x86_64, Linux 6.8.0-142-generic, Chrome 154.0.8037.57,
Node 22.23.1 и pnpm 10.33.2.

- `pnpm exec vitest run --project vue tests/unit/vue/numeric-shell.test.ts
tests/unit/vue/text-context-toolbar.test.ts tests/unit/vue/ui-controls.test.ts`
  — 14/14 passed. Mounted editor подтверждает немедленный preview готового Blue
  и пользовательского `#FF7556` при нулевых padding/radius, неизменность document
  и defaults до Apply, Cancel и один undoable commit. RU nested palette возвращает
  focus к «Свой цвет», затем к «Фон» по Escape.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5187 pnpm test:e2e:browser --spec
tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts` — 1 spec / 4 scenarios
  passed. При 1024×700 browser проверяет готовый и HEX preview, отсутствие history
  до commit, границы embedded palette и всех её кнопок/inputs внутри text dialog,
  Escape и возврат focus. Скриншот
  `artifacts/browser-e2e/text-background-palette-preview.png` просмотрен: палитра
  остаётся в ширине диалога; вертикальная прокрутка сохраняет доступ к нижним
  секциям. Первый запуск на порту 5173 не стартовал, потому что порт уже был занят.
- `CUTE_SCREEN_E2E_SCENARIOS=v7-rich-text pnpm test:e2e:tauri` собрал свежий
  fake-platform/test-harness binary, но не открыл WebDriver session: на хосте нет
  `tauri-driver` и `WebKitWebDriver`, соединение с `127.0.0.1:4445` отклонено.
  Сценарий содержит те же native assertions и screenshot
  `artifacts/tauri-e2e/text-background-palette-preview.png`, но runtime evidence
  этим запуском не получено.
- `pnpm format && pnpm format:check` и `pnpm docs:check` — passed. `pnpm check`
  останавливается в lint на 32 ошибках indentation нового, несвязанного
  `tests/unit/vue/keyboard-shortcuts.test.ts`; targeted ESLint затронутых файлов
  проходит без errors. Отдельный `pnpm typecheck` собирает пакеты, затем
  останавливается на TS2589 в том же новом keyboard-shortcuts test.

## Применение кропа и его панель (2026-10-16)

`REQ-TOL-013`, `REQ-EDT-005/006`, `REQ-UI-005`. Linux x86_64, Node 22.23.1,
pnpm 10.33.2, Chrome 154.0.8037.57; native WebKitGTK 2.52.6 / wry 0.55.1,
external tauri-driver 2.1.0. Логи и просмотренные скриншоты —
`artifacts/crop-apply/`.

- Red-first: `pnpm exec vitest run tests/unit/vue/m08-crop-interactions.test.ts`
  воспроизвёл отсутствие `selectTool` после Enter (`vue-red.log`).
- `pnpm test --maxWorkers=2 --testTimeout=15000` — 103 files / 750 tests,
  exit 0 (`unit.log`). Проверены transient drag, единая command, переход в Select,
  повторное открытие/reset/cancel, undo/redo и disabled nested controls.
  Первые общие прогоны выявили старое ожидание активного Crop и таймауты 5 s
  в несвязанных numeric/highlighter тестах; ожидание обновлено, timeout последнего
  прогона явно увеличен для нагруженного общего workspace.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5195 pnpm test:e2e:browser --spec tests/e2e/specs/browser-crop-apply.e2e.ts --spec tests/e2e/specs/browser-m08-1.e2e.ts --spec tests/e2e/specs/browser-m08-2.e2e.ts --spec tests/e2e/specs/browser-m08-3.e2e.ts --spec tests/e2e/specs/browser-crop-cursors.e2e.ts`
  — 5 files / 7 scenarios, exit 0 (`browser.log`). Сразу после Apply/Enter
  проверены Select, отсутствие crop shade и размеры видимого cropped viewport;
  дополнительных Cancel/Select перед проверкой нет. Enter на Cancel не создаёт
  command. Проверены annotations, non-origin crop, reset, cancel, undo/redo,
  все восемь курсоров, Tab/focus-visible и RU/EN × light/dark × окна
  1213×724 / 1024×700: четыре control heights равны 32 px, центры совпадают
  с допуском 1 px, panel/controls внутри окна и выше ToolRail. Восемь
  `crop-toolbar-*.png` и `crop-applied.png` просмотрены.
  Ранние прогоны выявили ошибку test helper: document coordinates вычислялись
  через dense preview backing size. Helper теперь использует document canvas
  dimensions и ждёт стабильного layout. Старый base-resize сценарий задевал
  transient formatting panel у нижнего угла; gesture перенесён на доступный
  верхний угол без программной подготовки состояния.
- `XDG_SESSION_ID=crop-apply-e2e PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=m08-crop-first-open pnpm test:e2e:tauri`
  — 1/1, exit 0 (`native.log`). Production fake Capture → Quick → Editor
  открывает первый decoded 400×300 document; проверены Enter, Apply, Cancel,
  Reset, Undo/Redo, non-origin viewport и отсутствие crop overlay.
  Скриншот `native-applied-1024x700.png` просмотрен.
  Embedded попытка не открыла driver session (`native-embedded-failed.log`);
  external попытка в общей desktop session столкнулась с activation endpoint
  запущенного приложения (`native-shared-session-failed.log`). Изоляция
  `XDG_SESSION_ID` устранила конфликт без остановки пользовательского editor.
- `pnpm check` — exit 0 (`check.log`): lint, typecheck, format/docs, 43 boundary
  tests, IPC и Rust fmt/clippy. Существующие lint warnings и предупреждения
  CanvasKit externalization / bundle size остаются.
- `pnpm tauri build --debug --no-bundle` — exit 0 (`build-production.log`):
  после native suite восстановлен обычный executable без fake-platform/test-harness.
- Финальные `pnpm format`, `pnpm format:check`, `pnpm docs:check` — exit 0;
  `format.log`, `format-check.log`, `docs.log`.

Физический capture, Windows/WebView2 и macOS/WKWebView этим исправлением не
перепроверены; native подтверждение относится к fake capture и реальному Linux
WebView. Renderer/export contracts и document schema не менялись.

## Линейка: границы холста и подгонка после crop (2026-10-16, ADR-059)

Ubuntu 24.04.5 x86_64/X11, Node 22.23.1, pnpm 10.33.2.
Логи — `artifacts/ruler-bounds/`.

- Red-first `pnpm exec vitest run --project core packages/editor-core/src/layer-resize.test.ts`:
  endpoint 900 вместо 400 (`resize-red.log`), после crop длина 300 вместо 80
  (`crop-red.log`). Mounted-shell Escape regression сначала выполнял лишний
  move commit (`escape-red.log`). Начальный импорт ещё отсутствующего helper
  зафиксирован отдельно в `core-red.log`.
- Focused core/Vue — 29/29 (`badge-green.log`), включая 1000 property cases
  rotated/reflected non-origin crops вплоть до 1 px, locked ruler, точный
  apply/revert и history, endpoint/cancel/keyboard. Property test поймал
  floating-point отказ подгонки; исправление — `property-green.log`.
- `pnpm test --maxWorkers=2` — 103 files / 750 tests (`unit-controlled.log`).
  `pnpm test:render` — 5 files / 20 tests (`render.log`), goldens не менялись.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5213 pnpm test:e2e:browser --spec tests/e2e/specs/browser-ruler-bounds.e2e.ts`
  — Chrome 154.0.8037.57, 2/2 при 1280 и 1024 px (`browser-stable.log`).
  Реальные pointer inputs, документ неизменен до release, move/endpoint clamp,
  Escape, crop сокращает существующую линейку, один Undo/Redo восстанавливает
  область и точную геометрию. Screenshots
  `artifacts/browser-e2e/ruler-bounds-{1280,1024}-{moving,endpoint,crop-draft,cropped,redo}.png`
  просмотрены; подпись после crop читаема внутри изображения.
- `mkdir -p artifacts/ruler-bounds/runtime` и `chmod 700 artifacts/ruler-bounds/runtime`;
  `XDG_RUNTIME_DIR="$PWD/artifacts/ruler-bounds/runtime" PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_SCENARIOS=ruler-bounds pnpm test:e2e:tauri`
  — external tauri-driver 2.1.0, WebKitGTK 2.52.6 / wry 0.55.1, 1/1
  (`native-observed.log`). Production fake Capture → Quick → Editor; те же
  pointer/crop/history проверки. Pointer `isTrusted=true`, конечные client
  coordinates записаны в лог. Native moving/endpoint/cropped screenshots
  `artifacts/tauri-e2e/ruler-bounds-*.png` просмотрены.
- `pnpm check` — exit 0 (`check-verified.log`): lint (60 warnings, 0 errors),
  TypeScript, format/docs, boundaries, generated IPC, frontend и Rust fmt/clippy.

Промежуточные неуспехи сохранены: `browser.log` — shadowed DOM identifier
в test helper; `browser-debug.log` — обнаруженная production Escape regression;
`browser-final.log` содержит HMR EditorWorkspace во время жеста. До учёта badge
скриншот показывал обрезанную подпись после crop. `native.log` остановлен после
ошибки activation socket занятого developer app; отдельный runtime решает
изоляцию без остановки этого приложения. `native-isolated.log` — неуспешная
попытка с y=289 вместо верхнего края; финальный повтор с observation pointer
прошёл все исходные assertions. `unit-final.log` содержит renderer timeouts
при параллельных сборках и промежуточный crop UI failure; controlled repeat
прошёл 750/750. Первый `check-final.log` встретил параллельно редактируемый
crop E2E typecheck; итоговый `check-verified.log` — passed.

Native source fixture 400×300; physical capture, Wayland/mixed-DPI, Windows
WebView2 и macOS WKWebView этим изменением не проверены. В canvas меньше badge
ограничиваются endpoints, размер текста не меняется. Схема документа и IPC
сохранены. Undo подтверждённого crop восстанавливает исходную геометрию;
расширение рамки само по себе не восстанавливает ранее сокращённую длину.

## Security audit Vue и source-map-js (2026-10-16)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2; baseline commit
`de5e7d0d9de558f71442425bdf83b1d00b0867c1`, логи —
`artifacts/security-deps-20261016/`.

До обновления `pnpm audit:security` воспроизвёл exit 1: две high и одна low.
Vue и compiler-sfc обновлены с 3.5.41 до 3.5.42 во всех workspace manifests,
source-map-js — с 1.2.1 до 1.2.2 во всех lockfile paths. Advisories:
[Vue SSR XSS](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) и
[source-map-js DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Команды обновления: `pnpm update -r vue@3.5.42 @vue/compiler-sfc@3.5.42`,
затем `pnpm update -r source-map-js --depth Infinity`.

- `pnpm install --frozen-lockfile` — exit 0 (`install-frozen.log`).
- `pnpm audit:security` — exit 0: high/critical отсутствуют (`audit.log`).
  `pnpm audit --prod --json` — exit 1 из-за оставшейся low в KaTeX 0.16.22,
  GHSA-238p-pmpm-9mq7 (`audit.json`). Порог CI high сохранён.
- `pnpm audit:licenses` — exit 0 (`licenses.log`).
- `pnpm test` — 101 files / 733 tests passed (`unit.log`).
- `pnpm test:render` — 5 files / 20 tests passed, goldens не менялись (`render.log`).
- `pnpm check` — exit 0 (`check.log`): lint (60 warnings, 0 errors),
  TypeScript/package builds, format/docs, boundaries 43/43, generated IPC,
  frontend build, Rust fmt и все clippy configurations. Сохранились
  предупреждения CanvasKit browser externalization и bundle >500 kB.
- `pnpm format` и `pnpm format:check` — exit 0 (`format-final.log`,
  `format-check-final.log`); финальный `pnpm audit:security` — exit 0
  (`audit-final.log`).

Native capture, platform support и acceptance статусы этим dependency update
не переобъявляются проверенными; real-WebView и packaged build smoke не выполнялись.

## Фонарь: устаревшие dist и live preview (2026-10-16)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2; evidence:
`artifacts/spotlight-fix/`. В checkout остались outputs августа:
`editor-core/dist/document/scene.js` и `render-scene.js`. Vite выбирал старый
файловый модуль вместо актуального `document/scene/index.js`; новый массив
apertures попадал в старый single-aperture validator. `browser-red.log`
содержит фактический `RangeError: __spotlight-draft__.aperture.shape is invalid`.
Исправлены очистка/forced emission пакетов и desktop source aliases.

- `pnpm exec vitest run --project boundaries tests/boundaries/package-build.test.ts`:
  red до cleanup helper (`build-red.log`), после — 2/2 (`build-green.log`).
  `pnpm test:boundaries` — 43/43 (`boundaries-final.log`).
- `pnpm test --maxWorkers=2` — 101 files / 733 tests (`unit.log`).
- `pnpm test:render --maxWorkers=2` — 5 files / 20 tests (`render.log`), включая
  production-shaped 4K/8K source, составную маску и повторно decoded PNG;
  goldens не менялись. Метрики и pixel checksums — `artifacts/tool-settings/`.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5207 pnpm test:e2e:browser --spec tests/e2e/specs/browser-spotlight-preview.e2e.ts`
  — Chrome 154.0.8037.57, 1/1 (`browser-verified.log`). Проверены пиксели во время
  создания и move, неизменность layers до release, undo/redo, aperture drag/Escape.
- `PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_SCENARIOS=spotlight-preview pnpm test:e2e:tauri`
  — external tauri-driver 2.1.0, WebKitGTK 2.52.6 / wry 0.55.1, 1/1
  (`native-trusted.log`; финальный beforeSuite repeat — `native-suite.log`).
  Production fake Capture → Quick → Editor, тот же
  pixel contract в обоих окнах, pointer `isTrusted=true`. Capture fixture —
  400×300; большие реальные изображения проверяет отдельный render harness,
  физический capture этим сценарием не подтверждается. Скриншоты
  `artifacts/tauri-e2e/spotlight-{quick,editor}-{creating,moving,cancelled}.png`
  и browser counterparts просмотрены.
- `cargo test --workspace --features test-harness profile_identity_components_never_start_with_a_digit`
  — red на `profile.7580720c0ed134e1` (`profile-red.log`); после префикса `p`
  `cargo test --workspace --features test-harness e2e_paths` — 3/3 (`profile-green.log`).
  `cargo test --workspace` — 129 tests passed (`rust.log`).
- `pnpm check` — exit 0 (`check-verified.log`), включая fmt/clippy всех конфигураций.
- `pnpm tauri build --debug --no-bundle` — exit 0 (`build-production.log`),
  обычный Linux binary `target/debug/cute-screen` без test-harness/fake-platform.
  `pnpm format`, `pnpm format:check` и `pnpm docs:check` — exit 0;
  `format-delivery.log`, `format-check-delivery.log`, `docs.log`.

Первые native попытки выявили гонку config/service before-hooks и invalid D-Bus
profile ID. Выбор main перенесён в первый beforeSuite. Embedded driver 1.3.0
создаёт только synthetic MouseEvent, поэтому этот сценарий требует external
provider. Первое external выполнение остановлено при зависшем старом before hook;
затем helper исправлен для WebKit (`__name` у вложенного именованного callback).
В ранних browser helpers уточнены skipRelease, стабильный pointer ID и сравнение
layers без document timestamp. `browser-final.log` — неуспешный параллельный
UI запуск; финальный изолированный повтор — `browser-verified.log`.
Первый typecheck потребовал `.d.mts` для cleanup helper; отдельный format запуск
нашёл max-len в новом helper, строка разбита. Эти неуспехи сохранены в логах.
Windows/WebView2 и macOS/WKWebView этим исправлением повторно не проверялись.

## CI: driver cache и macOS deployment target (2026-10-16)

Ubuntu 24.04.5 x86_64, Node 22.23.1, pnpm 10.33.2.
Логи: `artifacts/driver-cache-fix/`.

- `pnpm exec vitest run --project boundaries tests/boundaries/tauri-driver-cache.test.ts`
  запущен в изолированном temp workspace без `artifacts`: скопированы package.json,
  vitest.config.ts, тест и cache helper, node_modules подключён symlink.
  До правки — `ENOENT` в `mkdtemp`, после — 1/1 passed; `artifacts` не создаётся.
  Логи `isolated-before.log` и `isolated-after.log`.
- `pnpm exec vitest run --project boundaries tests/boundaries/build-contract.test.ts`:
  новая macOS baseline regression до `.cargo/config.toml` — 1 failed / 12 passed
  (`macos-baseline-before.log`). Проверяется согласованность direct Cargo и
  Tauri baseline 12.0. Native Xcode 16.4 Intel/ARM compile остаётся pending:
  на текущем Linux host нет macOS SDK. Runtime capture не проверялся.
- `pnpm test:boundaries` — 9 files / 41 tests passed (`boundaries.log`).
- `pnpm lint` — exit 0, 60 существующих warnings (`lint.log`).
- `pnpm typecheck` — exit 0 (`typecheck.log`).

Первый общий boundary/lint запуск был заблокирован отсутствующим локальным
`@stylistic/eslint-plugin`; `pnpm install --frozen-lockfile` восстановил пакет
без изменения lockfile (`install.log`). После восстановления проверки повторены.

## Резкость подписи линейки (2026-10-16, ADR-058)

Windows x64 / PowerShell, Node 22.23.1, pnpm 10.33.2.
Причина: scene и annotation draft имели backing store в document pixels,
который CSS растягивал при zoom/HiDPI. Canvas2D viewport теперь использует
bounded density `max(1, zoom × DPR)`. Export scale задаётся независимо;
Quick crop учитывает плотность, сохраняя исходные physical dimensions.

- Red-first `pnpm exec vitest run --project renderer packages/editor-renderer/src/preview-resolution.test.ts`:
  3/3 failed до появления `setPreviewScale`. После реализации — 3/3 passed.
  Preview/draft pixels при 1.3125×, 2×, 4× совпадают с decoded scaled PNG;
  обычный экспорт побайтно неизменен при смене preview density.
- `pnpm test --maxWorkers=4` — 101 files / 733 tests passed,
  `artifacts/ruler-unit-final.log`. Первый прогон: 731/732; старое ожидание
  document-resolution scene в Quick заменено на density-aware проверку.
- Дополнительный pixel/controller повтор — 16/16,
  `artifacts/ruler-focused-final.log`: document coordinates и sampling с non-origin
  crop, 9×9 magnifier в document pixels при DPR 2, pixel budget, mounted Quick redraw.
  NAPI canvas fixture помечена `markRaw`, чтобы Vue ref не proxy-ировал native handle.
  Marker blend/cancel и decoded Quick crop при density 1/2 — в unit suite.
- `pnpm test:render --maxWorkers=2` — 5 files / 20 tests passed,
  `artifacts/ruler-render.log`; goldens не обновлялись.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5187'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-ruler-resolution.e2e.ts`
  — Chrome 155.0.8059.79, 2/2 passed, `artifacts/ruler-browser.log`.
  Реальный pointer создаёт ruler при 160%, длина сохраняется при 1:1 и undo/redo.
  Скриншоты `artifacts/browser-e2e/ruler-dpr-{1,2}-{angled,100}.png` просмотрены.

Первый `pnpm test:e2e:tauri` остановился на `os error 5`: resident
`target/debug/cute-screen.exe` был занят. Изолированный target:
`CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e`, `CARGO_BUILD_JOBS=4`,
`CUTE_SCREEN_E2E_SCENARIOS=ruler-resolution`. Первый isolated scenario обнаружил
неверное ожидание zoom controls в Quick; helper использует фактический масштаб
Quick и обычные controls в editor. Следующий повтор остановился на создании
линейки. После переноса gesture в центр видимой поверхности и проверки target
`CANVAS` финальный repeat прошёл 1/1 в WebView2 155.0.4283.45 через external
tauri-driver 2.1.0. Log: `artifacts/ruler-tauri-repeat.log`; screenshots
`artifacts/tauri-e2e/ruler-{quick,editor}-{angled,100}.png` просмотрены.
Production fake Capture → Quick (zoom 3.6) → Editor (160%/100%), trusted pointer,
измеренная длина и undo/redo подтверждены. Это не physical capture evidence.

`pnpm check` — exit 0 (`artifacts/ruler-check.log`), включая Rust checks;
`pnpm test:perf --maxWorkers=2` — 4/4 passed (`artifacts/ruler-perf.log`),
без заявления GPU/reference hardware guarantee. `pnpm tauri build --debug --no-bundle`
— exit 0, `artifacts/ruler-build.log`, итоговый `target/debug/cute-screen.exe`.
`pnpm format` и `pnpm format:check` — отдельные финальные логи
`artifacts/ruler-format-final.log` и `artifacts/ruler-format-check.log`.

Расширенный browser run (`artifacts/ruler-browser-final.log`) подтвердил
исходный ruler regression, non-origin crop и lifecycle precision tools:
3/3 spec files passed. Дополнительный rich-text spec сначала остановился на
synthetic `pointerdown`/`setPointerCapture`: helper больше не приравнивает bitmap
pixels к document coordinates, учитывает crop и кликает по тексту обычным pointer.
Повтор — 3/3 passed, `artifacts/ruler-text-browser-final.log`. Метрики committed text raster
также переводятся из backing pixels обратно в document coordinates.

Linux/WebKitGTK, macOS/WKWebView и physical mixed-DPI не проверены.
На предельном zoom pixel budget допускает растяжение bounded bitmap (ADR-058).

## Единое числовое поле (2026-10-16)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2. Общий NumericControl
использует одну рамку NInput высотой 32 px с quaternary −/+ внутри prefix/suffix.
Команды, draft, parsing и preview controller не меняются; ADR-030/054 сохраняются.
Логи: `artifacts/numeric-field/`.

- `pnpm test tests/unit/vue/numeric-control.test.ts tests/unit/vue/numeric-shell.test.ts`
  — exit 0, 8/8 (`unit.log`): точный ввод, comma/invalid, keyboard, preset,
  mixed, disabled/read-only и commit/cancel.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5196 pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-settings.e2e.ts`
  — exit 0, 1/1 (`browser.log`), Chrome 155.0.8059.79: создание объектов через UI,
  ввод размера, оба stepper, Escape, 1024/1280 × RU/EN × light/dark.
  Layout assertion проверяет общую высоту и нахождение кнопок внутри поля.
  Просмотрены `artifacts/browser-e2e/tool-settings-1024-ru-dark.png` и
  `tool-settings-1280-en-light.png`: ровное поле рядом с пресетами, линейка видна.
  Финальный повтор с сохранённой matrix измерения и element screenshots — exit 0,
  1/1 (`browser-complete.log`); `numeric-field-1024-ru-dark.png` просмотрен.
  Первый расширенный повтор превысил WDIO wrapper timeout 30 s
  (`browser-final.log`); timeout перенесён на Mocha test registration.
  Следующий повтор остановился на старом aperture move до numeric-проверки
  (`browser-verified.log`): screenshot показал прежнюю ellipse. Перед drag
  добавлено ожидание завершения закрытия popover; production timing не менялся.
- `CARGO_TARGET_DIR=D:/cutescreen/target/shape-catalog-native CARGO_BUILD_JOBS=4 CUTE_SCREEN_E2E_SCENARIOS=tool-settings pnpm test:e2e:tauri`
  (env заданы PowerShell) — exit 0, 1/1 (`native.log`), WebView2 155.0.4283.45,
  external tauri-driver 2.1.0. Production fake Capture → Quick с non-origin crop
  → Editor: ввод размера, −/+, Escape в обоих окнах; pointer/keyboard trusted.
  Просмотрены `artifacts/tauri-e2e/tool-settings-{quick,editor}-numeric-label.png`.
- `pnpm format` — exit 0 (`format.log`). Первый `pnpm check` остановился
  на architecture budget 124/120 строк в расширенном E2E helper (`check.log`);
  шаги проверки размера вынесены в отдельную функцию. Повтор `pnpm check`
  — exit 0 (`check-final.log`): lint, types, formatting, docs, boundaries 40/40,
  IPC, frontend build и Rust fmt/clippy. Последующая правка — только этот отчёт
  и статус traceability; `pnpm format`, `pnpm format:check` сохраняют итоговые
  логи `format-delivery.log`, `format-check.log`.

WebKitGTK/WKWebView и physical capture этим визуальным изменением не проверены.

## Поворот вокруг центра элемента (2026-10-16)

Windows x64 / PowerShell, Node 22.23.1, pnpm 10.33.2. Evidence:
`artifacts/center-rotation/`; screenshots — `artifacts/browser-e2e/center-rotation-*`
и `artifacts/tauri-e2e/center-rotation-{quick,editor}-*`.

UX сверено по официальным руководствам:
[Illustrator](https://helpx.adobe.com/illustrator/desktop/manage-objects/arrange-objects/rotate-objects.html)
описывает поворот вокруг центра как для жеста, так и для числового поля;
[Figma anchor point](https://help.figma.com/hc/en-us/articles/41352588622615-Move-a-layer-s-anchor-point)
задаёт центр как исходную точку вращения. Код сторонних редакторов не использован.
Прежний gesture вычислял угол относительно центра, но менял rotation без
компенсации translation, поэтому рисунок вращался относительно local origin.

- Red-first `pnpm test packages/editor-core/src/layer-rotation.test.ts tests/unit/vue/canvas-viewport-tools.test.ts`
  — core helper ещё отсутствовал, Vue показал translateX=10 вместо 30 (`red.log`).
  `pnpm test tests/unit/vue/numeric-preview.test.ts` — числовой preview также
  оставлял прежнюю translation (`numeric-red.log`).
- После исправления focused команда с тремя файлами — 20/20 (`green.log`);
  затем добавлен preview/cancel/click regression; финальный focused повтор —
  21/21 (`focused-final.log`).
- `pnpm build:packages` и `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  — exit 0 (`build-packages.log`, `e2e-types.log`). Первый browser запуск
  обнаружил stale package dist без нового export (`browser.log`), после сборки
  повтор с тем же product code прошёл.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5201'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-center-rotation.e2e.ts`
  — exit 0, 1/1, Chrome 155.0.8059.79 (`browser-retry.log`). Новые Shape/Arrow:
  Shift 90°, неподвижный центр, transient preview, numeric 180°/Escape/Enter,
  undo/redo. Просмотрены pointer и numeric screenshots.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='center-rotation'; pnpm test:e2e:tauri`
  — exit 0, 1/1 (`native.log`), WebView2 155.0.4283.45, external tauri-driver 2.1.0.
  Production fake Capture → Quick → Editor, Shape/Arrow в обоих окнах;
  числовой угол в editor, pointer/keyboard `isTrusted=true`. Просмотрены
  Quick committed и editor numeric preview screenshots. Physical capture,
  WebKitGTK и WKWebView этим сценарием не проверены.
- `pnpm test:render` — exit 0, 5 files / 20 tests (`render.log`). Renderer origin
  и persisted document v7 не менялись.
- `pnpm test` — 731/732, 100/101 files (`test.log`): единственный сбой
  `canvas-viewport-quick.test.ts` ожидал scene 100×100, получил 200×200 при DPR 2.
  Он относится к параллельной правке preview resolution; rotation regressions
  прошли. `pnpm format` первоначально сообщил четыре max-len ошибки в
  параллельно изменяемых eyedropper-controller/scene-preview-resolution test
  (`format.log`).
- Повтор `pnpm test` — 729/732 (`test-final.log`), три 5 s timeout в
  app-arrow-actions, numeric-shell и highlighter-preview при параллельных
  проверках workspace. `pnpm test --maxWorkers=2` — exit 0, 101 files / 733 tests
  (`test-controlled.log`); timeout assertions и product code ради этого не менялись.
- `pnpm check` сначала остановился на max-len в параллельно изменяемом
  browser-tool-settings; выполнен только перенос условия. Следующий прогон
  (`check-final.log`) прошёл lint/types/format/docs и остановился на функции
  tool-settings.ts длиной 124 при лимите 120. После её независимого разбиения
  `pnpm test:boundaries` — 40/40 (`boundaries-final.log`), полный `pnpm check`
  — exit 0 (`check-verified.log`): включая IPC, frontend build и Rust fmt/clippy.
- `pnpm format` — exit 0 (`format-verified.log`); заключительные команды
  после записи результатов: `pnpm format` и `pnpm format:check`, логи
  `format-complete.log` и `format-check-complete.log`.

## Переключение панели лупа ↔ фонарь (2026-10-16)

Windows x64, Node 22.23.1, pnpm 10.33.2. Evidence/logs:
`artifacts/selection-toolbar-switch/`; screenshots сохраняются shared helper
в `artifacts/browser-e2e/loupe-settings-selected-*.png` и
`artifacts/tauri-e2e/loupe-settings-{quick,editor}-selected-*.png`.

Red-first: mounted-shell pointer clicks меняют selected IDs на фонарь, но
панель остаётся Loupe. Ошибка `spotlight rendering requires an ordered Canvas2D surface`
прерывает Vue update; browser повторяет ту же ошибку в настоящем Canvas2D
(`red.log`, `browser-red.log`). Precision preview ошибочно шёл через overlay.
После исправления `pnpm test tests/unit/vue/selection-toolbar-switch.test.ts`
— exit 0, 2/2 (`green.log`): повторные лупа ↔ фонарь и лупа ↔ цензура,
правильная панель и отсутствие команд на click.

Shared E2E создаёт оба объекта через UI, дважды переключает выделение,
меняет dim до 80% только у фонаря и возвращается к лупе. Просмотрен browser
`loupe-settings-selected-spotlight.png`: выделен фонарь, видны его controls.
Первый green browser прошёл переключения, но упёрся в 30 s wrapper timeout
при расширенной layout matrix: timeout перенесён с тела callback на сам Mocha test,
чтобы WebdriverIO прочитал его до запуска. Product timeouts не менялись.
Итоговые результаты:

- `pnpm test` — exit 0, 98 files / 711 tests (`test.log`).
- `pnpm check` — exit 0 (`check.log`): lint/types/format/docs, 40/40 boundaries,
  IPC, frontend build, Rust fmt/clippy. После этого только перенос import
  наверх файла и корректировка Mocha timeout в двух E2E specs.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5195 pnpm test:e2e:browser --spec tests/e2e/specs/browser-loupe-settings.e2e.ts`
  — exit 0, 1/1 (`browser-final.log`), Chrome 155.0.8059.79.
- `CARGO_TARGET_DIR=D:/cutescreen/target/shape-catalog-native CARGO_BUILD_JOBS=4 CUTE_SCREEN_E2E_SCENARIOS=loupe-settings pnpm test:e2e:tauri`
  (env заданы PowerShell) — первый запуск exit 1 до нового regression:
  исходный drag лупы не создал слой (`native.log`, `native-first-failure.png`).
  Панель defaults корректна; повтор (`native-retry.log`) дал тот же результат.
  После ожидания закрытия configure/leave animations и stable canvas создание
  прошло, но клик теста за краем маленькой линзы не выбирал её (`native-final.log`).
  Координата исправлена на центр создания. Финальный запуск — exit 0, 1/1
  (`native-verified.log`), WebView2 155.0.4283.45, external tauri-driver 2.1.0:
  production fake Capture → Quick → Editor, повторное переключение выделения
  и изменение dim только у фонаря в обоих окнах. Contextmenu/keydown trusted.
  Просмотрены Quick и editor `selected-spotlight.png`: панель соответствует
  рамке фонаря, лупа остаётся на canvas. Это fake-platform, не physical capture.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — exit 0 (`e2e-types.log`).
- `pnpm format`, `pnpm format:check` — exit 0 (`format.log`, `format-check.log`).

WebKitGTK/WKWebView и physical capture не проверены.

## Компактные настройки лупы (2026-10-16)

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2;
Chrome 155.0.8059.79, WebView2 155.0.4283.45, external tauri-driver 2.1.0.
Evidence/logs: `artifacts/loupe-settings/`; screenshots:
`artifacts/browser-e2e/loupe-*` и `artifacts/tauri-e2e/loupe-settings-*`.

- `pnpm test` — 708/709; оставшийся тест ожидал прежние постоянные подписи.
  После адаптации `pnpm test tests/unit/vue/m08-precision-history.test.ts tests/unit/vue/m08-precision-settings.test.ts`
  — exit 0, 9/9; `unit-final.log`. Locked/unlock сохраняет disabled,
  отсутствие history/default leakage и один command после unlock.
  Итоговый полный `pnpm test` — exit 0, 97 files / 709 tests (`test-final.log`).
- `pnpm check` сначала выявил inline SVG вне разрешённых icon boundaries:
  миниатюра формы заменена CSS-контуром. Повтор — exit 0 (`check-final.log`),
  до последнего изменения CSS палитры; 40/40 boundaries, lint/types/format/docs,
  IPC, build и Rust fmt/clippy.
  Итоговый повтор с финальной палитрой — exit 0 (`check-verified.log`).
- `CUTE_SCREEN_BROWSER_E2E_PORT=5195 pnpm test:e2e:browser --spec tests/e2e/specs/browser-loupe-settings.e2e.ts`
  — exit 0, 1/1 (`browser-final.log`); defaults, создание, numeric cancel,
  focus, size/shape/border/shadow и Undo/Redo, 1024/1280 × RU/EN × light/dark.
  Просмотр снимка выявил horizontal overflow в border palette; общий button
  style заменён оформлением shape popover. Финальный тест дополнительно
  проверяет `scrollWidth <= clientWidth`: exit 0, 2/2 вместе с
  `browser-m08-3.e2e.ts` (`browser-verified.log`). Просмотрен
  `loupe-1024-ru-dark-loupeBorderWidth.png`: все цвета и numeric entry видимы,
  popup остаётся рядом с toolbar, результат лупы виден на canvas.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='loupe-settings'; pnpm test:e2e:tauri`
  — exit 0, 1/1 (`native.log`), production Capture → Quick → Editor.
  Настройки defaults, рисование, cancel, shape/border/shadow и Undo/Redo
  проверены в обоих окнах, contextmenu/keydown имеют `isTrusted=true`.
  Capture использует fake-platform, профиль изолирован. Повтор после финального
  CSS — exit 0, 1/1 (`native-final.log`); просмотрены native Quick border и
  editor compact screenshots: палитра помещается, линза и connector видимы.
- `pnpm format`, `pnpm format:check` — exit 0
  (`format-final.log`, `format-check-final.log`).

Исходные browser failures относились к лишнему Escape и неверному WebDriver
selector в новом тесте; исправлены без изменения production keyboard handling.
WebKitGTK/WKWebView, physical capture и mixed-DPI не проверены.

## Принятая иконка лупы B1 (2026-10-16, ADR-055)

Пользователь выбрал B1: пунктирная рамка области, круглая линза и ручка.
Каноническая `loupeGeometry` используется через прежнее имя `UiIcon` в shell
и dev gallery; остальные кнопки zoom, доступные имена и команды сохранены.
Геометрия нарисована локально по пользовательскому визуальному референсу;
сторонние SVG не копировались. Новое архитектурное решение не требуется.

Windows x64, PowerShell, Node 22.23.1, pnpm 10.33.2,
Chrome 155.0.8059.79. Evidence: `artifacts/custom-icons/loupe-adopted/`;
логи — `artifacts/custom-icons/loupe-*.log`.

- До замены: `CUTE_SCREEN_BROWSER_E2E_PORT=5199`,
  `CUTE_SCREEN_ICON_EVIDENCE=loupe-before`,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts`
  — exit 0, 2/2; предыдущий production screenshot сохранён в `loupe-before/`.
- `pnpm format` — exit 0; `pnpm test tests/unit/vue/ui-icon.test.ts`
  — exit 0, 70/70: существующий полный SVG-контракт и fallthrough.
- Та же browser-команда с `CUTE_SCREEN_ICON_EVIDENCE=loupe-adopted` — exit 0,
  2/2: gallery, DPR 1/2, обе темы, raster decode без clipping при
  16/18/20/24/32 px, keyboard focus и disabled; выбор L в editor RU/EN.
  Просмотрены `loupe-dpr-1.png` и `editor-ru-dark.png`: выбранный рисунок
  сохраняется в 18 px и согласован по толщине с соседними иконками.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='custom-icons'; $env:CUTE_SCREEN_ICON_EVIDENCE='loupe-adopted'; pnpm test:e2e:tauri`
  — exit 1; изолированный повтор без изменения source/assertions также exit 1.
  Обе свежие сборки запускаются в WebView2 155.0.4283.45 через external
  tauri-driver 2.1.0 (версия из `cargo install --list`; `--version` драйвер
  не поддерживает). Оба запуска останавливаются на `pencil stroke did not commit`
  в Quick до выбора лупы и handoff. Логи `loupe-native.log`,
  `loupe-native-recheck.log`; просмотрен и сохранён `native-first-failure.png`.
  Dedicated native выбор лупы/Quick → Editor остаётся pending; browser pass
  не подменяет этот gate. Production pencil/controller в этой правке не менялись.
- Итоговые format/check: pending.

Browser не подтверждает WebView2, WebKitGTK/WKWebView или физический capture.

## Принятая иконка «Скрыть данные»: шахматная мозаика (2026-10-16)

По выбору пользователя `privacy` использует собственную геометрию вместо
Tabler ScanEye. После просмотра screenshot-editor references и двух уточнений
принята крупная сетка 3×3: пять клеток `currentColor` 100%, четыре — 15% через
`fill-opacity`. Все клетки заполнены; root сохраняет fill none и stroke 1.8.
Предыдущая 4×4 сетка с уровнями 30/65/100% отвергнута как малоконтрастная.
Это визуальная замена в рамках ADR-055: API, tool commands и document не меняются.

Windows x64, Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.79.
Evidence: `artifacts/custom-icons/censor-adopted/`; команды и версии runtime —
в соседних `censor-adopted-*.log`. Снимок замечания пользователя сохранён как
`low-contrast-user-feedback.png`.

- Финальный SVG catalog: 70/70, включая классы, attrs, currentColor и конечную
  числовую `fill-opacity` в (0, 1].
- Browser `pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts`
  с `CUTE_SCREEN_BROWSER_E2E_PORT=5198`, `CUTE_SCREEN_ICON_EVIDENCE=censor-adopted`
  — 2/2: DPR 1/2, обе темы, выбор Hide data/Скрыть данные, disabled пустого editor,
  keyboard focus и отсутствие clipping при 16/18/20/24/32 px. Финальный DPR 1
  render просмотрен; клетки заметно крупнее и контрастнее начального варианта.
- Общие `pnpm test` (97 files / 709 tests) и `pnpm check` — exit 0 при
  подключении мозаики, до последней коррекции контраста. После коррекции:
  SVG 70/70, browser 2/2, `pnpm format`, `pnpm format:check` — exit 0.
- `python -X utf8 .../skill-creator/scripts/quick_validate.py .agents/skills/cutescreen-icons`
  — valid. Системная cp1251 без `-X utf8` не декодирует русскоязычный skill.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='custom-icons'; $env:CUTE_SCREEN_ICON_EVIDENCE='censor-adopted'; pnpm test:e2e:tauri`
  — exit 1, WebView2 155.0.4283.45. Первый запуск остановился на pencil stroke
  в Quick (`censor-adopted-native-first.log`). Изолированный повтор прошёл
  drawing/sampling/history и выбор цензуры с новой SVG, но перед handoff настройки
  цензуры перекрыли Select: fieldset top 8 px, click point (677,85),
  `element click intercepted` (`censor-adopted-native.log`). Failure screenshot
  просмотрен и сохранён в evidence. Это отдельный Quick layout defect;
  полный native handoff для финальной мозаики остаётся pending.

WebView2 не подтверждает WebKitGTK/WKWebView и физический capture.

## Принятая иконка фонаря «Встык» (2026-10-16, ADR-055)

Пользователь выбрал чистое прямоугольное окно на равномерной штриховке 45°,
без зазора между штрихами и контуром. `spotlight` переведён с Tabler Focus2
на каноническую `spotlightGeometry`; dev preview использует ту же геометрию.
API, доступное имя, CSS-размер и поведение инструмента сохранены.

Windows x64, Node 22.23.1, pnpm 10.33.2, Chrome 155.0.8059.79.
Evidence: `artifacts/custom-icons/spotlight-adopted/`; журналы команд —
`artifacts/custom-icons/spotlight-adopted-*.log`.

- `pnpm exec vitest run --project vue tests/unit/vue/ui-icon.test.ts` — 70/70.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5198 CUTE_SCREEN_ICON_EVIDENCE=spotlight-adopted pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts`
  (переменные заданы PowerShell) — 2/2: реальный UiIcon, обе темы, DPR 1/2,
  выбор фонаря в RU/EN, disabled пустого editor и keyboard focus.
  Raster checks 16/18/20/24/32 px: stroke не обрезан, SVG не пуст.
  Галерея и production editor screenshots сохранены; RU/dark screenshot просмотрен.
- `pnpm test` — 97 files / 709 tests, exit 0.
- `pnpm format`, `pnpm format:check` — exit 0.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='custom-icons'; $env:CUTE_SCREEN_ICON_EVIDENCE='spotlight-adopted'; pnpm test:e2e:tauri`
  — exit 0, 1/1, WebView2 155.0.4283.45. Production Capture → Quick → Editor:
  выбор фонаря с новой SVG, рисование marker/pencil, пипетка, trusted keyboard,
  undo/redo. Native Quick screenshot просмотрен; RU/EN × light/dark сохранены.
  Захват использует fake-platform, профиль изолирован; stale binary не используется.
- `pnpm check` — exit 0: lint (warnings без errors), typecheck, formatting,
  Markdown links, boundaries 40/40, IPC, frontend build, Rust fmt/clippy.

WebView2 не подтверждает WebKitGTK/WKWebView или физический захват.

## Карандаш, составной фонарь и линейка (2026-10-16, ADR-056)

Windows NT 10.0.19045 x64, Node 22.23.1, pnpm 10.33.2; Chrome
155.0.8059.79 и WebView2 155.0.4283.45. Evidence root:
`artifacts/tool-settings/`; browser/native screenshots находятся соответственно
в `artifacts/browser-e2e/tool-settings-*` и `artifacts/tauri-e2e/tool-settings-*`.

Core red-first: отсутствующий resolver/операции областей и непривязанный endpoint
давали failing tests до реализации. `tool-settings-redesign.test.ts` проверяет
веса сглаживания, 0/100%, короткие пути, pressure/endpoints, границы кисти,
codec областей, добавление/изменение/удаление/resize и оба конца линейки.
Дополнительные regression tests подтверждают одинаковый smoothed scene/hit path
и диапазон углового шага 1…90° в factory/codec (`angle-red.log`, `angle-green.log`).
Mounted-shell tests проверяют numeric cancel/focus, mixed, locked/read-only,
history-neutral clipboard success/failure, одну команду и undo областей.
Разнородное выделение arrow/pencil в обоих порядках покрыто регрессией:
показываются общие свойства вместо панели первого слоя.

- `pnpm test` — 97 files / 709 tests, exit 0 (`test-final.log`), включая
  mixed-selection regression, rotated union и независимые слои фонаря.
- `pnpm format`, `pnpm check` — exit 0 (`format-final.log`, `check-final.log`).
  Check включает lint/typecheck, format/docs, 40 architecture tests, IPC drift
  и четыре Rust/clippy конфигурации. Итоговый E2E typecheck после уточнения
  test coordinates — exit 0 (`e2e-typecheck.log`).
- `pnpm test:render` — 5 files / 20 tests, exit 0 (`render-final.log`).
  Golden precision PNG обновлены намеренно: мягкость применяется к объединённой
  маске. Canvas2D и CanvasKit сравнивают decoded pixels при 1×/2×, пересечения
  и дублированные области не меняют coverage. Прежний golden сохранён как
  `precision-before.png` для визуального сравнения.
- `pnpm test:perf` — 4/4, exit 0 (`perf.log`);
  `artifacts/perf/m01-renderer.json` содержит 30 warmups / 120 measurements.
  Это software harness, не подтверждение GPU frame budget.
- Дополнительно реальные UI fixtures 3840×2160 и 7680×4320: 12 000 sampled points,
  шесть областей. SHA-256 decoded export совпадает с preview. `4k.json`/`8k.json`
  содержат исходный hash, timing и pixel hash; это отдельное доказательство
  корректности больших данных, не подмена контролируемого performance suite.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5186'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-settings.e2e.ts`
  — exit 0, 1/1 за 15.8 s (`browser-final.log`): создание трёх инструментов,
  move/resize второй области, форма только выбранной области, удаление/undo,
  clipboard failure, Alt для обоих endpoints, 1024/1280 × RU/EN × light/dark.
  Browser m08-3 и m08-6 также прошли (`browser.log`). Первый длительный timeout
  совпал с паузой машины; свежий независимый прогон воспроизведён успешно.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='tool-settings'; pnpm test:e2e:tauri`
  — exit 0, 1/1 за 13.2 s (`native.log`). Чистый профиль, настоящий production
  Capture → Quick с non-origin crop → Editor, те же действия, native clipboard;
  pointerdown/keydown имеют `isTrusted=true`. Capture использует fake-platform.

Повтор с `CUTE_SCREEN_E2E_SCENARIOS='tool-settings,tool-settings-reopen'` —
2 scenarios / 2 tests, exit 0 (`native-persistence.log`): после отдельного native
launch создаются pencil с brush/6 px/smoothing 75% и spotlight с dim 80%; шаг
линейки остаётся 30°. Runner разделяет изолированные persistence groups,
не только прежний m03. Первоначальный повтор выявил ошибку настройки профилей
runner; параллельные Chrome и WebView2 input также мешали жестам. Успешный
повтор выполнен последовательно, с одним общим выделенным профилем двух launches.

Первый общий browser suite: 21/23 files; два сбоя воспроизведены отдельно.
Выявлено перекрытие ToolRail большой selection-панелью image: нижний предел
панели теперь учитывает rail, `browser-regressions.log` подтверждает исправление.
Crop assertion сравнивал pixels overlay при fit zoom с document coordinates:
helper нормализует только geometry bounds, сами pixel counts остаются исходными.
`browser-crop-final.log` — exit 0. Все 23 browser specs покрыты общим прогоном
и успешными focused повторами двух исправленных сценариев; общий исходный
`browser-suite.log` сохраняет exit 1, не выдаётся за единый зелёный прогон.

`CUTE_SCREEN_E2E_SCENARIOS=''` + `pnpm test:e2e:tauri` выполнил всю unattended
matrix: 22 scenarios, 16 passed / 6 failed (`native-suite.log`, exit 1).
Во время него обнаружен второй `run-tauri-e2e.mjs` из параллельной задачи:
`concurrent-runners.log` фиксирует PID/command/start time. Чужие процессы не
останавливались. Новый тест также уточнён: coordinates в Quick рассчитываются
из фактического crop, non-origin crop явно проверяется до рисования.
После освобождения runner выполнен повтор
`CUTE_SCREEN_E2E_SCENARIOS='tool-settings,tool-settings-reopen,shape-defaults-placement,quick-editor-handoff,shape-toolbar,arrow'`
со стабильной `pnpm test:e2e:tauri`: **6 scenarios / 7 tests, exit 0**
(`native-retry.log`). Таким образом, все 22 сценария имеют успешное выполнение,
но не в одном общем прогоне. Новый reopen дополнительно читает сохранённый
документ с двумя составными фонарями; writer дожидается завершения autosave.

Начальные check выявили превышение complexity в projection группового toolbar
и layout; heading/ограничение rail выделены в самостоятельные функции без
ослабления architecture budgets. `boundaries-final.log` — 40/40, exit 0.
WebKitGTK/WKWebView, physical capture и mixed-DPI в этом срезе не проверены.

## Проектные UI-иконки рядом с Tabler (2026-10-16, ADR-055)

Windows NT 10.0.19045 x64, PowerShell 7.6.5, Node 22.23.1, pnpm 10.33.2.
Смысловые `marker/pencil/eyedropper` используют собственные SVG через тот же
`UiIcon`; прочий каталог сохраняет Tabler. Геометрия, CSS-размеры и состояния
проверяются отдельно от узнаваемости. Первый вертикальный вариант выделителя и
пипетки отвергнут при review. Затем пользователь уточнил референсы выделителя:
вертикальное скошенное перо вверх, короткая обойма и широкие округлые плечики,
без внутренних штрихов и дополнительного следа. Карандаш сохраняет остриё,
пипетка — выбранную пользователем наполненную диагональную трубку с округлой
грушей, обоймой и круглым нижним концом. Локальные solid parts наследуют
currentColor; root SVG сохраняет fill none и stroke 1.8.

Evidence root: `artifacts/custom-icons/`.

- Первый `pnpm format`, `pnpm format:check`, `pnpm check` — exit 0; логи `format.log`,
  `format-check.log`, `check.log`. Check включает lint, typecheck, format/docs,
  9 boundary files / 40 tests, IPC drift и четыре Rust clippy configurations.
  Existing Vue lint warnings и CanvasKit build warnings сохраняются.
  После финальной визуальной правки общий повтор `pnpm check` остановился на
  47 lint errors в параллельно изменяемых `editor-core` freehand/spotlight,
  codec и layer-resize; `check-final.log`. Последний `pnpm format` также не
  завершился из-за max-len в новом `tool-settings-redesign.test.ts`;
  `format-final.log`. Эти core-файлы не менялись в работе над иконками.
- `pnpm test` — exit 0, 94 files / 693 tests; `test.log`.
  После правки геометрии `pnpm test tests/unit/vue/ui-icon.test.ts` — exit 0,
  70/70: SVG-контракт и class/style fallthrough всех 35 смысловых имён.
  Лог — `unit-icons.log`.
  Повтор всего `pnpm test` на новой общей рабочей копии — 90/95 files и 690/695
  tests passed, пять failures и один unhandled error в spotlight/freehand
  контракте; `test-final.log`. Проход первого полного прогона не заявляется
  как success этой более поздней рабочей копии.
  Последний `pnpm format:check` также завершился exit 1 на параллельных изменениях
  `shell.css` и `styles/tool-formatting-toolbar.css`; `format-check-final.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5198'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-custom-icons.e2e.ts`
  — exit 0, 2/2, Chrome 155.0.8059.79; `browser-after.log`.
  `after/gallery-dpr-{1,2}.png` просмотрены: реальные `UiIcon`, light/dark,
  размеры 16/18/20/24/32 CSS px и состояния кнопок. `after/raster-checks.json`
  содержит 30 повторных SVG decode/raster проверок в расширенном viewBox:
  непустая геометрия, нет выхода обводки за исходную область. Это не автоматическое
  доказательство семантики. `after/editor-{en,ru}-{light,dark}.png`,
  `empty-disabled.png`, `gallery.json` фиксируют реальный shell, наследование
  цвета и размеры; проверены настоящий Tab focus и disabled.
- `$env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; $env:CARGO_BUILD_JOBS='4'; $env:CUTE_SCREEN_E2E_SCENARIOS='custom-icons,highlighter'; pnpm test:e2e:tauri`
  — dedicated `custom-icons` passed 1/1 внутри WebView2 155.0.4283.45 через
  external tauri-driver 2.1.0. Обычный Capture создаёт fake-platform Quick session,
  затем Editor handoff: uppercase HEX #7F7F7F, два типа штрихов, повторное
  создание, native keyboard (`isTrusted`), focus и undo/redo. Далее editor
  переключается RU/EN × light/dark. `after/native-quick.png`, `native-editor.png`,
  `native-editor-{en,ru}-{light,dark}.png` и `native-empty-disabled.png` просмотрены.
  Общий запуск завершился exit 1: дополнительный highlighter scenario один раз
  не дождался commit первого штриха после закрытия palette/numeric controls
  (`highlighter-toolbar.ts`, ожидание layer count). Лог — `tauri-after.log`.
  Повтор той же стабильной команды с `CUTE_SCREEN_E2E_SCENARIOS='highlighter'`
  прошёл exit 0, 1/1, без изменения source или assertions:
  `tauri-highlighter-recheck.log`. Проверены настройки, preview/commit,
  native context menu, palette и история в Quick и editor. Первый сбой сохранён
  как ограничение устойчивости combined suite, а не скрыт успешным повтором.
  После утверждения финальной геометрии повтор с `CUTE_SCREEN_E2E_SCENARIOS='custom-icons'`
  остановлен до старта runtime: `pnpm build` получил TS2322/2339/2344 в новых
  spotlight apertures/Rect/JsonObject контрактах editor-core; `tauri-final.log`.
  Stale binary не запускался. Поэтому native screenshots относятся к предыдущей
  геометрической редакции, а final native visual pass остаётся pending.
- Финальные отдельные проверки иконок: `pnpm test tests/unit/vue/ui-icon.test.ts`
  — 70/70; targeted ESLint и ESLint-format — exit 0 (`lint-icons.log`,
  `format-icons-check.log`), `pnpm docs:check` — exit 0 (`docs-final.log`).
  Чтение union в тестах теперь не зависит от LF/CRLF и положения следующей
  декларации. `pnpm test:boundaries` в поздней рабочей копии проверяет icon
  boundary успешно, но общий gate останавливает complexity 23/20 в параллельно
  изменённом `shell/tools/context-schema.ts`; `boundaries-final.log`.
- `python C:/Users/Vladimir/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/cutescreen-icons`
  с `PYTHONUTF8=1` — exit 0; `skill-validation.log`. Навык локальный, `.agents/`
  gitignored. Инструкции связывают реальные source/tests/preview и источники
  подходов; сторонние SVG и scripts не копировались.

Исходные browser screenshots — `before/`, неудачный вертикальный вариант —
`rejected-upright/`. До замены сохранены также native empty и первый рабочий
Quick/editor flow. Диагностические прогоны до стабилизации теста встречали
несогласованный locale прогретого Quick и конкурентную native session;
`tauri-before-diagnostic.log` / `tauri-before.log`. Поэтому они не подтверждают
полную native матрицу «до». Финальный dedicated тест проходит один production
capture lifecycle, а RU/EN × light/dark переключает в editor. Live-синхронизация
preferences уже прогретого Quick не заявляется как новое поведение.

Production frontend build не содержит `icons-preview.html`, `icon-workbench`
или текста gallery; основной HTML entry её не импортирует. App/tray icons,
document/renderer contracts и binary image transport не изменялись. Physical
mixed-DPI, Linux WebKitGTK и macOS WKWebView остаются pending для этого среза.

## Иконка Shape circle-square (2026-10-16)

Windows x64 / PowerShell: `pnpm test tests/unit/vue/ui-icon.test.ts` — 36/36,
`pnpm format` — exit 0. Общий mapping `shape` использует `IconCircleSquare`
из установленного Tabler. Browser и real-WebView визуальная проверка этой
замены не проводилась.

## Числовые параметры, пресеты и live preview (2026-10-16)

Windows NT 10.0.19045 x64, PowerShell 7.6.5, Node 22.23.1, pnpm 10.33.2.
Общий numeric adapter заменяет поля параметров редактора; navigation zoom
не изменён. Исследование и контракт — ADR-054. Актуальная документация
[Spectrum Slider](https://spectrum.adobe.com/web/rsp/components/slider)
сохраняет editable value и mixed state; прежний `/page/slider/` при прямом
запросе сейчас возвращает 404, но доступен в поисковом индексе.

- `pnpm format`, `pnpm format:check`, `pnpm check` — результаты финального
  прогона записаны в `artifacts/numeric-controls/format.log`, `format-check.log`
  и `check-complete.log`.
- `pnpm test` — 94 files, 659/659 tests. Adapter/controller и mounted shell
  проверяют запятую/точку, ошибку диапазона/шага, mixed, disabled/read-only,
  клавиатуру/Shift/Home/End, отмену и отсутствие повторных команд. Inline text
  сохраняет rich-text state, диапазон и границу document commit. Лог — `test-final.log`.
- `pnpm test:render` — 18/18, четыре файла. Новый 4K test использует каталог
  31 фигуры, display projection мультивыбора и один batch. Декодированные RGBA
  последнего preview, committed render и PNG export совпадают без различий;
  undo возвращает исходный документ. Лог — `render-final.log`.
- `pnpm test:perf` — 4/4. Это controlled CanvasKit/software trend suite,
  не доказательство аппаратного GPU budget. Лог — `perf.log`, JSON отчёт —
  `artifacts/perf/m01-renderer.json`.
- Browser: Chrome 155.0.8059.79, отдельный Vite port 5197.
  `CUTE_SCREEN_BROWSER_E2E_PORT=5197 pnpm test:e2e:browser` с `--spec` для
  `browser-shape-toolbar`, `browser-highlighter`, `browser-tool-ux`,
  `browser-v7-rich-text-editing`, `browser-v7-rich-text-toolbar`,
  `browser-m06-content-tools` и `browser-m08-3` (`tests/e2e/specs/*.e2e.ts`).
  Итоговый отдельный прогон — 7/7 spec files, 21/21 tests passed,
  `browser-isolated.log`. Ранние повторы — `browser-final.log`,
  `browser-shape-final.log`, `browser-text.log`, `browser-recheck.log`.
  Trusted pointer удерживает opacity slider: пиксели меняются при неизменном
  committed document, pointerup совпадает с последним preview, undo/redo и
  Escape восстанавливают ожидаемое состояние. Проверяются RU/EN, light/dark,
  1024 px, компактные группы и расположение панели. Inline size input сохраняет
  focus/selection при каждом preview; фон текста использует общий Apply/Cancel.
- Real Windows WebView2 155.0.4283.45, tauri-driver 2.1.0:
  `CARGO_TARGET_DIR=target/shape-catalog-native`
  `CUTE_SCREEN_E2E_SCENARIOS=shape-toolbar,highlighter,v7-rich-text,quick-chrome`
  `pnpm test:e2e:tauri` — первый прогон 4/4 spec files, 9/9 tests (`tauri.log`).
  Production Capture → Quick → Editor использует fake capture и обычный mount,
  настоящий native pointer/keyboard, non-origin crop и отдельный test profile.
  Изолированный Cargo target сохраняет запущенную пользовательскую debug app.
  Screenshots: `artifacts/tauri-e2e/numeric-quick-opacity-preview.png`,
  `numeric-editor-opacity-preview.png`, `quick-native-tool-settings.png`.

Дополненный native прогон (`tauri-final.log`) не полностью зелёный:
highlighter 1/1 и Quick 4/6 прошли, Quick sampling/tool-switch и создание
стрелки дали failures. Shape scenario прервался на конфликте native driver
port (`bind 0x2740`, затем `UND_ERR_SOCKET`). Отдельный повтор (`tauri-recheck.log`)
прошёл numeric opacity в Quick/editor, затем выявил гонку ожидания каталога:
DOM уходящего popover ещё существовал при `aria-expanded=false`.
Helper теперь ожидает состояние trigger и видимую сетку. Inline background
в том же повторе — 1/1 passed после исправления test focus перед Ctrl+Enter:
padding/radius видимы с текущим zoom, Cancel полностью восстанавливает фон,
Apply не меняет history, завершение текста даёт одну команду.
Screenshot — `artifacts/tauri-e2e/numeric-text-background-preview.png`.
Сбои общей Quick suite не переобъявляются прошедшими по первому запуску.
Следующий shape-only запуск (`tauri-shape-final.log`) не достиг runtime:
параллельная сборка обновила shared `apps/desktop/dist` во время Rust embedding
(`failed to read asset ...src-BFMT04cO.css`). Runner отказался тестировать старый
binary. В это время работал другой `tauri-custom-icons` WDIO; его процессы и
изменения не останавливались и не откатывались. Изолированный Cargo target
защищает binary, но не обеспечивает изоляцию общего frontend output.

Финальный отдельный повтор после завершения параллельных сборок:
`CARGO_TARGET_DIR=target/shape-catalog-native`
`CUTE_SCREEN_E2E_SCENARIOS=shape-toolbar pnpm test:e2e:tauri` — 1/1 passed
за 32.8 s (`tauri-shape-isolated.log`). Полный production Capture → Quick →
Editor, opacity pixels/draft/history, defaults и каталог 31 формы прошли.
Таким образом, numeric shape и inline background имеют финальное runtime
evidence; два failures отдельной общей Quick suite остаются открытыми.

Исправления найдены этими прогонами: numeric WebDriver input теперь использует
native Ctrl+A/keys; preview rich text восстанавливает DOM selection и возвращает
focus точному полю; текстовые popover измеряются общей placement системой и
не уходят под нижнюю rail; повторный пресет не создаёт команду. После добавления
новых файлов запущенный ранее Vite сохранял отрицательный resolve cache:
перезапуск конфигурации восстановил HTTP 200 для `numeric-presentation.ts` и
`ContextToolbar.vue` без изменения импортов.

Inline background отрисовывается отдельной CSS поверхностью за текстом:
padding расширяет только фон, сохраняя origin, DOM range и layout текста.
Placement учитывает этот дополнительный отступ. Mounted test проверяет оба
параметра, Cancel, повторное открытие с исходными значениями и общий Apply
без document command до завершения text draft. Контекстная отмена сбрасывает
также локальный invalid input, у которого ещё нет display projection.

Linux/macOS/WebKit runtime для numeric-среза не запускался. Physical capture,
native Save dialog и аппаратный GPU performance этим evidence не подтверждаются.
Результаты предыдущих платформенных срезов на эти controls не переносятся.

## Привязка вложенных настроек фигуры (2026-10-16, ADR-053)

Windows x64 / PowerShell, Chrome 155.0.8059.79. Regression создаёт сноску через
drag и ввод текста, затем открывает Shape через trusted ПКМ. До исправления
«Наложение» было в 231.39 CSS px от trigger: `artifacts/shape-defaults-red.log`
и `shape-defaults-unit-red.log`. После исправления зазор около 11.45 px;
переключение appearance/stroke/appearance, Escape/focus и неизменность документа
проходят. Реальные bounds и screenshots —
`artifacts/browser-e2e/callout-shape-defaults-{0,1,2}-*-placement.{json,png}`.

Команды в основном workspace:

```powershell
pnpm format
pnpm exec vitest run --project vue tests/unit/vue/preview-placement.test.ts
$env:CUTE_SCREEN_BROWSER_E2E_PORT='5194'
pnpm test:e2e:browser --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts --mochaOpts.grep 'nested shape defaults'
pnpm check
pnpm test --maxWorkers=2
$env:CARGO_TARGET_DIR='D:\cutescreen\target\highlighter-e2e'
$env:CARGO_BUILD_JOBS='4'
$env:CUTE_SCREEN_E2E_SCENARIOS='shape-toolbar,arrow,highlighter'
pnpm test:e2e:tauri
```

Focused geometry — 5/5 passed (`shape-defaults-focused.log`); browser regression
passed (`shape-defaults-browser-first.log`, повторно в `shape-defaults-browser-regression.log`).
Расширенный первый browser run: highlighter, m06-arrow-tools и tool-ux passed,
catalogue failed из-за клика во время анимации. Shared catalogue helper теперь
дожидается завершения animation перед следующим кликом.

В workspace одновременно вносились другие UI-изменения: Vite фиксировал HMR
EditorWorkspace/CanvasViewport/rich-text-editor во время повторных browser runs.
Общая native-сборка остановилась до запуска WebView на TS2379 в новом
NumericControl.vue (`unit`, `placeholder`, `max`); последующий typecheck также
зафиксировал TS2375 в numeric-preview-controller.ts. Общий boundaries повтор
отказал на длине use-editor-workspace.ts, а не на preview-placement.
Эти прогоны не объявляются зелёными. Логи — `artifacts/shape-defaults-{tauri,
typecheck-final,boundaries,browser-final,test-final}.log`. Для изолированной
проверки создан временный worktree от `507521c5b84f027e385779ebbbc9d140beccc172`
с изменением preview-placement и его shared regression helpers/specs.

Изолированная проверка от указанного HEAD: `pnpm install --frozen-lockfile`,
`pnpm format`, `pnpm test --maxWorkers=2` — 91 файл / 646 tests passed;
`pnpm test:boundaries` — 9 файлов / 40 tests passed. SHA-256 проверяемых файлов
сохранены в `artifacts/shape-defaults-isolated/source-hashes.json`.
Implementation, geometry test, shared placement helper, новый native spec и
scenario registry совпадают с main по SHA-256. Общий browser spec в main
дополнительно содержит параллельный numeric test, которого нет в baseline.

Для MSVC в worktree явно задан
`RUSTUP_TOOLCHAIN=1.97.0-x86_64-pc-windows-msvc`: основной D:\cutescreen имеет
directory override, а новый worktree первоначально выбрал GNU и отказал без
dlltool. После выбора MSVC native `shape-toolbar,arrow` прошёл: 2 scenarios /
3 tests, WebView2 155.0.4283.45. Production fake Capture → Quick → Editor
включал новый callout/defaults regression, весь каталог и Arrow focus/history.
Просмотрены обе native appearance PNG. Зазор — 7.89 px в Quick и 14.39 px
в editor. Логи — `artifacts/shape-defaults-isolated/{tauri-final,test,boundaries}.log`,
PNG/JSON — `artifacts/shape-defaults-isolated/tauri-e2e/callout-shape-*`.

Отдельный повтор регрессии зарегистрирован как `shape-defaults-placement`:

```powershell
$env:RUSTUP_TOOLCHAIN='1.97.0-x86_64-pc-windows-msvc'
$env:CARGO_TARGET_DIR='D:\cutescreen\target\shape-catalog-native'
$env:CARGO_BUILD_JOBS='4'
$env:CUTE_SCREEN_E2E_SCENARIOS='shape-defaults-placement'
pnpm test:e2e:tauri
```

Отдельный native regression — 1/1 passed за 6 s; лог
`artifacts/shape-defaults-isolated/tauri-regression.log`. Browser повтор в
изолированном baseline сначала дал 8 passed / 1 failed: legacy paint test
не нашёл HEX field после клика до завершения появления палитры. Helper теперь
дожидается animation перед Custom colour; не относящиеся к placement изменения
палитры и NumericControl в изолированную проверку не переносились.
Универсальный shape-toolbar helper для старого baseline использует прежние
подписи пресетов; main workspace параллельно обновляет их на aria-label.

Итоговый focused browser replay — 2 files / 7 tests passed, Chrome 155:
новый callout/defaults regression, весь каталог и пять tool-ux tests.
Команда: `CUTE_SCREEN_BROWSER_E2E_PORT=5196 pnpm test:e2e:browser --spec
'tests/e2e/specs/browser-{shape-toolbar,tool-ux}.e2e.ts' --mochaOpts.grep
'nested shape defaults|every catalogue|consistent tool UX'` (переменная в
PowerShell задавалась через `$env:`). Лог —
`artifacts/shape-defaults-isolated/browser-regression-final.log`.
В основном workspace `pnpm format`, `pnpm format:check`, `pnpm docs:check`
и `git diff --check` прошли; логи — `shape-defaults-format-final.log`,
`shape-defaults-format-check.log`, `shape-defaults-docs-check.log` в artifacts.
Итоговый `pnpm check` в isolated worktree завершился с exit 0, включая lint,
typecheck, format/docs/boundaries, IPC codegen и все четыре Rust clippy variants.
Лог — `artifacts/shape-defaults-isolated/check-final.log`. Временный worktree
после проверки архивируется; artifacts сохранены в основном workspace.

## Компоновка палитры и custom swatch — Windows x64, 2026-10-15

`REQ-EDT-008/015/016`, `REQ-UI-001/003/006/007`: drawing palette использует
два полных ряда по десять образцов; highlighter — один ряд из восьми. Custom
action отделён справа. Цветные круги 20 px находятся в hit areas 26 px;
фактический промежуток между кругами 10 px, до custom — 23 px. Selection ring
имеет свободное место. Плавные radial gradients рисуются только во внутреннем
круге; фон самой кнопки прозрачен. Embedded shape stroke/fill popovers имеют
ширину 366 px и сохраняют viewport constraints и preview placement.

- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter.e2e.ts --spec tests/e2e/specs/browser-tool-ux.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts`
  — exit 0, 3 files / 9 tests, Chrome 155.0.8059.79. Проверены actual grid rows,
  расстояния и viewport fit, selection/defaults/embedded, Custom HEX,
  keyboard/focus, Undo, закрытие без скачка и RU/EN × light/dark.
  Лог — `artifacts/palette-layout-browser.log`; геометрия —
  `artifacts/browser-e2e/{arrow,highlighter}-preset-palette-layout.json`.
- `pnpm test tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/shape-context-toolbar.test.ts tests/unit/vue/arrow-context-toolbar.test.ts tests/unit/vue/ui-controls.test.ts tests/unit/vue/tool-ux.test.ts`
  — exit 0, 5 files / 56 tests; `artifacts/palette-layout-tests.log`.
- `pnpm check` — exit 0, `artifacts/palette-layout-check.log`.
- `CUTE_SCREEN_E2E_SCENARIOS=highlighter,arrow,shape-toolbar CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e CARGO_BUILD_JOBS=4 pnpm test:e2e:tauri`
  — настоящий WebView2 155.0.4283.45: highlighter 1/1 и arrow 2/2 passed,
  включая actual row/gap/fit measurements и закрытие без скачка. Shape scenario
  остановился на первом gesture до проверки палитры;
  `artifacts/palette-layout-tauri.log`.
- Повтор `CUTE_SCREEN_E2E_SCENARIOS=shape-toolbar` с теми же Cargo env после
  ожидания `.cs-canvas-ready` в общем draw helper — exit 0, 1/1 passed.
  Production fake capture → Quick → Editor, embedded stroke/fill, Custom HEX,
  defaults и каталог фигур; `artifacts/palette-layout-shape-tauri.log`.

Просмотрены browser `arrow-preset-palette-open.png`, `palette-en-light.png`
и `palette-en-dark.png`, native `arrow-preset-palette-open.png` и
`highlighter-editor-preset-palette-open.png`. Полный unit suite 644/644 ранее проверил исправление
leave transition; после изменения компоновки повторён затронутый component slice.
Linux/WebKitGTK и macOS/WKWebView этим Windows evidence не подтверждаются.

## Закрытие цветовой палитры — Windows x64, 2026-10-15

`REQ-EDT-008/015/016`, `REQ-UI-003/006/007`: `usePreviewPopover` сохраняет
последние измеренные координаты при закрытии. До исправления browser regression
зафиксировал скачок на 419.27 CSS px к `(0, 0)` во время leave transition;
`artifacts/palette-dismissal-red.{log,json}`. После исправления все записанные
browser и Quick/editor WebView2 кадры показывают смещение 0 px.

- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter.e2e.ts --spec tests/e2e/specs/browser-tool-ux.e2e.ts`
  — exit 0, 2 files / 6 tests, Chrome 155.0.8059.79. Проверены selection palette
  стрелки, preset/custom commit, Escape, click outside, focus и Undo.
  Лог — `artifacts/palette-dismissal-browser.log`.
- `CUTE_SCREEN_E2E_SCENARIOS=highlighter,arrow CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e CARGO_BUILD_JOBS=4 pnpm test:e2e:tauri`
  — WebView2 155.0.4283.45, external tauri-driver. Highlighter 1/1 прошёл через
  production fake capture → Quick → Editor; четыре способа закрытия проверены
  в обоих окнах. Arrow в этом прогоне остановился до открытия палитры на первом
  gesture. Лог — `artifacts/palette-dismissal-tauri-second.log`.
- Повтор `CUTE_SCREEN_E2E_SCENARIOS=arrow` с теми же Cargo env — exit 0,
  2/2 tests. Helper ждёт `.cs-canvas-ready` и стабильный Fit перед первым
  gesture; затем проверены selection palette, preset/Escape, focus и Undo.
  `artifacts/palette-dismissal-arrow-tauri.log`; native
  `arrow-preset-palette-open.png` просмотрен, смещение при закрытии — 0 px.
- `pnpm test` — exit 0, 91 files / 644 tests;
  `artifacts/palette-dismissal-tests.log`.
- `pnpm check` — exit 0, включая lint/types/format/docs/boundaries/IPC и Rust
  fmt/clippy; `artifacts/palette-dismissal-check.log`.
- После адаптации test callback повторно прошли `pnpm lint` и
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`; логи
  `artifacts/palette-dismissal-{lint,e2e-types}.log`.

`palette-dismissal.ts` начинает rAF-замер перед реальным input и сохраняет JSON
для каждого закрытия: `artifacts/browser-e2e/*-palette-dismissal.json` и
`artifacts/tauri-e2e/*-palette-dismissal.json`. Просмотрены browser
`arrow-preset-palette-open.png` и native `highlighter-editor-preset-palette-open.png`.
Первый native прогон выявил test-only `__name is not defined`: вложенную функцию
заменили object method, который не требует внешнего transpiler helper при
сериализации callback в WebView. Он не доказывает ошибку продукта;
лог — `artifacts/palette-dismissal-tauri-first.log`.

Linux/WebKitGTK, macOS/WKWebView и physical capture этим срезом не проверялись.
ADR и platform capture capabilities сохраняются.

## Курсоры crop handles — Windows x64, 2026-10-15

`REQ-TOL-013`, `REQ-UI-005`: hover и pointerdown используют общий crop hit testing;
cursor state не попадает в документ/history. Shared E2E helper проверяет восемь
направлений resize и move в центре на полной рамке и preset 1:1.

- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-crop-cursors.e2e.ts`
  — exit 0, 1/1 test, Chrome 155.0.8059.79;
  `artifacts/crop-cursor-browser.log`.
- `pnpm exec vitest run tests/unit/vue/m08-crop-interactions.test.ts tests/unit/vue/canvas-viewport-transform.test.ts tests/unit/vue/canvas-viewport-tools.test.ts`
  — exit 0, 3 files / 24 tests; `artifacts/crop-cursor-tests.log`.
- `pnpm lint`, `pnpm typecheck` — exit 0;
  `artifacts/crop-cursor-{lint,typecheck}.log`.
- `CUTE_SCREEN_E2E_SCENARIOS=m08-crop-first-open,highlighter CARGO_TARGET_DIR=target/highlighter-e2e pnpm test:e2e:tauri`
  — exit 0, 2 scenarios / 2 tests, WebView2 155.0.4283.45. Production fake capture
  → Quick → Editor, crop matrix на полной рамке и 1:1, Escape/Enter/Undo и
  регрессия stroke cursor. Лог — `artifacts/crop-cursor-tauri.log`, screenshot —
  `artifacts/tauri-e2e/m08-crop-first-open-1024x700.png`.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` — exit 0;
  `artifacts/crop-cursor-{format,format-check,docs}.log`.

Linux/WebKitGTK, macOS/WKWebView и physical capture этим срезом не проверены.

Предварительный browser-m08-1 replay остановился на старом pixel-bound assertion:
overlay white maxX 534 вместо ожидаемых 356. Полная cursor matrix прошла до этой
проверки. Сценарий не изменён; cursor contract проверен отдельным focused spec.
Полный browser suite зелёным не объявляется.

## Курсор Pencil / Highlighter — Windows x64, 2026-10-15

`REQ-TOL-003/004`, `REQ-UI-005`: общий E2E helper проверяет `crosshair` сразу
после выбора обоих инструментов и наведения на изображение, `grabbing` при
удержании средней кнопки, возврат креста после отпускания, переключение на
Hand/Select и крест во время и после штриха Highlighter.

- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter.e2e.ts`
  — exit 0, 1/1 test, Chrome 155.0.8059.79. Лог:
  `artifacts/stroke-cursor-browser.log`. Порт 5173 был занят; использован штатный
  override конфигурации. Исправлена тестовая последовательность middle-down:
  каждый новый pointer action явно начинает движение на canvas.
- `pnpm test -- --project vue` — exit 0, 91 files / 644 tests; стабильная команда
  запускает также core/renderer/fixtures/fake-platform. Лог:
  `artifacts/stroke-cursor-tests.log`.
- `pnpm lint`, `pnpm typecheck` — exit 0; логи
  `artifacts/stroke-cursor-{lint,typecheck}.log`.
- `CUTE_SCREEN_E2E_SCENARIOS=highlighter CARGO_TARGET_DIR=target/highlighter-e2e pnpm test:e2e:tauri`
  — exit 0, 1/1 test; настоящий WebView2 155.0.4283.45, Capture → Quick → Editor
  с fake-platform. Курсоры проверены в обоих окнах. Hand проверяется только
  в editor, поскольку Quick не показывает этот инструмент. Лог:
  `artifacts/stroke-cursor-tauri.log`; screenshots/documents:
  `artifacts/tauri-e2e/highlighter-{quick,editor}-{modes.png,document.json}`.
- `pnpm format`, `pnpm format:check`, `pnpm docs:check` — exit 0; логи
  `artifacts/stroke-cursor-{format,format-check,docs}.log`.

Linux/WebKitGTK и macOS/WKWebView этим прогоном не проверены.

## ToolRail без дополнительной стрелки — Windows x64, 2026-10-15

`REQ-EDT-015`, `REQ-UI-001/006/007`, ADR-052. Удалены дополнительная кнопка
`⌄` и её CSS; обработчики ПКМ/Shift+F10/ContextMenu на самой кнопке сохранены.
Windows 10 x64 / PowerShell, Chrome 155.0.8059.79, настоящий WebView2
155.0.4283.45, внешний tauri-driver; WDIO service/Rust plugins 1.3.0.

- `pnpm exec vitest run tests/unit/vue/tool-ux.test.ts`: 27/27 passed.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5194`,
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-ux.e2e.ts`:
  5/5 passed, включая ПКМ defaults, nested controls, history, persistence и
  RU/EN light/dark при 1024 px.
- `CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e`,
  `CARGO_BUILD_JOBS=4`, `CUTE_SCREEN_E2E_SCENARIOS=quick-chrome`,
  `pnpm test:e2e:tauri`: 6/6 passed. Production fake capture → Quick → Editor;
  trusted ПКМ/Escape, focus, eyedropper, Copy и повторный capture сохранены.

`pnpm format` и `pnpm check` завершились с exit 0; общий check включает
lint/types/format, docs, 40 boundary tests, IPC и Rust fmt/clippy gates.
Логи команд: `artifacts/toolrail/{format,check,unit,browser,tauri}.log`.
Просмотрены `artifacts/browser-e2e/tool-ux-1024-ru-dark.png` и
`artifacts/tauri-e2e/quick-tabler-pencil.png`: отдельной стрелки в rail нет.
Это проверка UI в настоящем Windows WebView2 с fake-platform capture;
physical capture и Linux/macOS этим прогоном не подтверждаются.

## Выделитель и двухуровневые палитры — Windows x64, 2026-10-15

`REQ-TOL-004`, `REQ-EDT-008/015/016/017`, ADR-051. Windows 10 Home
10.0.19045 x64, Chromium 155.0.8059.79 и настоящий WebView2 155.0.4283.45.
WDIO service и Rust plugins 1.3.0; Windows external tauri-driver/EdgeDriver.

- Уточнение названия normal-эффекта: «Окрасить» / Tint и подсказка о
  полупрозрачном цвете поверх изображения и текста. Повторно выполнены
  `pnpm exec vitest run tests/unit/vue/highlighter-toolbar.test.ts tests/unit/vue/tool-ux.test.ts`
  и форматирование; лог — `artifacts/highlighter/tint-rename-tests.log`.
- Red-first `highlighter.test.ts`: resolver, распределение яркости, прозрачность,
  legacy defaults, style clipboard и сохранение marker intent в document codec.
- Red-first mounted-shell regression обнаружил четыре ненужных reset при
  annotation/undo/redo/crop. Multi-source watch сравнивает отдельно document ID
  и image identity; после исправления этот сценарий проходит без reset.
- Focused core/Vue: 9 файлов / 83 теста проходят. Команда — `pnpm exec vitest run`
  с core highlighter/drawing/drawing-preferences и Vue highlighter-background,
  highlighter-preview, highlighter-toolbar, tool-ux, canvas-viewport-tools,
  image-transport. Лог: `artifacts/highlighter/focused-final.log`.
- Preview tests сравнивают полные RGBA с committed render и повторно декодированным
  PNG, проверяют чёрные/белые пиксели текста, повторные кадры без накопления alpha
  и восстановление при cancel. Highlighter Canvas2D/CanvasKit goldens просмотрены.
- `pnpm test:e2e:browser --spec tests/e2e/specs/browser-highlighter.e2e.ts`
  прошёл: native browser gesture, точный preview/commit checksum, пресеты,
  Custom colour, defaults через ПКМ, undo/redo, RU/EN и обе темы.
- `browser-highlighter-background.e2e.ts` проверяет production Worker на 4K/8K
  terminal-like screenshot с текстом и светлой боковой панелью. После переноса
  decode/resize в Worker — 239 / 383 ms elapsed, 7 / 25 UI frames, 0 / 0 long tasks.
  Результат — `artifacts/highlighter/background-performance.json`. Предыдущий
  main-thread createImageBitmap resize дал long task 129 ms на 8K и исключён.
- `CARGO_TARGET_DIR=D:/cutescreen/target/highlighter-e2e`,
  `CUTE_SCREEN_E2E_SCENARIOS=highlighter`, `pnpm test:e2e:tauri` — 1/1 passed:
  production fake capture → Quick drawing → materialized editor drawing.
  Автоподбор доступен в обоих окнах; contextmenu и Escape имеют isTrusted=true.
  Логи — `artifacts/highlighter/tauri-isolated.log` и повторный
  `tauri-isolated-final.log` на последней версии.
- Дополнительные native scenarios `shape-toolbar` и `arrow` проходят: 1 + 2 tests.
  Новая палитра сохраняет прежние 32 px trigger / 21 px swatch и separator у стрелок.
  Логи — `artifacts/highlighter/tauri-regressions.log` (shape passed; первоначальная
  arrow assertion использовала старый selector), `tauri-arrow-final.log` (2/2 passed).
- `cargo test --workspace`: 134 passed / 1 interactive ignored;
  `pnpm test:perf`: 4/4 passed. Логи — `rust-tests.log`, `perf.log` в той же папке.

Просмотрены `artifacts/browser-e2e/highlighter-{en,ru}-{light,dark}.png`,
`artifacts/tauri-e2e/highlighter-{quick,editor}-modes.png` и оба highlighter golden.
Browser M05 SVG fixture отзывает собственный Blob URL и показывает штатный fallback
анализа; runtime анализ исходника подтверждён native capture и отдельным Worker E2E.
Нативная сборка использует отдельный Cargo target, поскольку другой запущенный
экземпляр держал `target/debug/cute-screen.exe`; stale binary не запускался.

Общие проверки выполнены с текущими параллельными изменениями репозитория:
`pnpm format`, `pnpm format:check`, `pnpm docs:check`, `pnpm check`,
полный `pnpm test` (91 файл / 644 теста) и
`pnpm test:render` (3 файла / 17 тестов) завершились с exit 0.
Последние логи — `artifacts/highlighter/{format,check,test,render}.log`.
Расширенный browser replay на порту 5187 включал highlighter, shape-toolbar,
m06-arrow-tools, tool-ux, shell и m06-content-tools: 5/6 spec files прошли.
Единственный failure — новый catalogue test не нашёл `[data-shape-id="arrowLeft"]`;
этот прогон не объявляется полностью зелёным. Лог —
`artifacts/highlighter/browser-regressions.log`. Более ранние unit/render failures
параллельных изменений устранены и не являются результатом последних прогонов.
Linux/macOS и physical capture этим fake-platform Windows прогоном не подтверждаются.

## Расширенные фигуры и панели вне объекта (2026-10-15, ADR-051)

Windows x64 / PowerShell, Chrome 155.0.8059.79 и настоящий WebView2 155.0.4283.45 с внешним tauri-driver. Capture использует fake-platform; physical capture, Linux/macOS и вся release matrix этим прогоном не подтверждаются.

Каталог содержит 30 shape kinds и rounded-rectangle preset. Shared geometry используется для SVG миниатюр, scene и contour hit testing. Vector composition применяет opacity/blend один раз, включая внутренние линии; открытые braces не имеют заливки. Палитра имеет семь колонок 32×32 / 20×20, условную строку размеров и не закрывает объект при доступном свободном месте. Bounds сохраняются и при скрытой selection-панели во время defaults; повторный показ восстанавливает visibility даже при прежних координатах.

Выполненные команды:

```powershell
pnpm build:packages
pnpm format
pnpm check
pnpm test --maxWorkers=2
pnpm test:render
$env:CUTE_SCREEN_BROWSER_E2E_PORT='5191'
pnpm test:e2e:browser --spec 'tests/e2e/specs/browser-{shape-toolbar,tool-ux}.e2e.ts'
Remove-Item Env:CUTE_SCREEN_BROWSER_E2E_PORT
$env:CARGO_TARGET_DIR='D:\cutescreen\target\shape-catalog-native'
$env:CARGO_BUILD_JOBS='4'
$env:CUTE_SCREEN_E2E_SCENARIOS='shape-toolbar,arrow,document-write,document-reopen'
pnpm test:e2e:tauri
Remove-Item Env:CUTE_SCREEN_E2E_SCENARIOS
Remove-Item Env:CARGO_BUILD_JOBS
Remove-Item Env:CARGO_TARGET_DIR
pnpm format:check
```

Unit/component: 91 files / 642 tests, exit 0; renderer: 3 files / 17 tests, exit 0. Native: четыре сценария / пять tests, exit 0 — Capture → Quick → Editor, 31 вариант через controls, nested Escape/focus/Undo/Redo, видимость объекта для Shape/Arrow/defaults и сохранённый cylinder при повторном запуске с тем же выделенным профилем. Итоговый browser прогон — 2 files / 8 tests, exit 0: весь каталог, 1024 px, RU/EN light/dark, defaults без изменения selection, Arrow, multi-selection style paste, nested focus, history и отсутствие перекрытия объекта. Итоговые pnpm check, pnpm format:check и pnpm docs:check завершились с exit 0.

Новые renderer goldens в `tests/goldens/m01-renderer/shape-catalogue-*` покрывают 1×/2×, декодирование экспорта, все формы, кривые, внутренние линии, заливки и независимую composition opacity. После включения round stroke caps обновлены только эти новые goldens: 175 changed channels на 1× и 609 на 2× относительно первоначального варианта; прежние goldens не перезаписаны. Просмотрены catalogue CanvasKit PNG и `artifacts/tauri-e2e/shape-expanded-native-catalogue.png`.

Red-first: `artifacts/shape-catalog-core-red.log` фиксирует отказ прежнего codec на новых kinds и ложный fill hit в прозрачном углу triangle. Локальный старый `dist/document/codec.js` перекрывал новый каталог `codec/index.js`; удалены только шесть устаревших игнорируемых generated codec/scene файлов, затем выполнен `pnpm build:packages`. Ошибка ручного NPopover trigger и неверного overlap alignment воспроизведена browser прогоном и исправлена отдельными кнопками и `top-start` для x/y верхнего левого угла.

Логи: `artifacts/shape-catalog-{format,check,test,render-final,browser,tauri}.log`; профильная регрессия повторного показа панели — `shape-catalog-selection-regression.log`, 25/25. Новый личный навык `C:/Users/Vladimir/.codex/skills/cutescreen-ui/SKILL.md` проверен `python -X utf8 .../skill-creator/scripts/quick_validate.py .../cutescreen-ui`: valid. UTF-8 mode нужен Windows validator, использующему системную кодировку при чтении.

## Quick → Editor и отмена palette eyedropper (2026-10-15)

Windows 10 Home 19045 x64 / PowerShell, WebView2/EdgeDriver 155.0.4283.45,
external tauri-driver 2.1.0, WDIO/service 9.30.1/1.3.0. Native capture adapter
здесь fake-platform; physical capture и Linux/macOS этим срезом не проверяются.

Quick commit раньше сохранял rendered scene как immutable source, одновременно
сохраняя editable layers. Native red regression переносит non-origin crop и
стрелку через один клик Editor, затем Delete: пиксель остался
`[217,78,83,255]` вместо frozen `[127,127,127,255]`.
`artifacts/quick-editor-handoff/native-red2.log`, `red-evidence.json` и
`red-after-delete.png` фиксируют дефект. Теперь materialized source кодируется
из frozen image, а composited scene остаётся результатом Copy/Save. Три PNG
regressions повторно декодируют сохранённый source и output для editor/copied/saved.

Palette sampling отменяется по явному `selectTool`, включая тот же tool,
keyboard и ПКМ; watcher одного activeToolId этого не покрывает. При старте
пипетки configure popover закрывается, чтобы не перекрывать ToolRail; target
defaults сохраняется отдельно до получения образца. Mounted regressions
проверяют отмену без document mutation и следующий настоящий drawing gesture,
а также применение образца к defaults без изменения существующей стрелки.
Первый прогон до исправления дал 3 failing regressions:
`artifacts/eyedropper-tool-switch/unit-red.log`.

`pnpm format` прошёл; `pnpm test` — 85 files / 578 tests, exit 0
(`artifacts/eyedropper-tool-switch/unit-final.log`). `pnpm check` — exit 0,
включая lint/types/format, 40 boundary tests, docs/IPC и Rust fmt/clippy gates
(`artifacts/quick-editor-handoff/check-final.log`). Runtime тесты не подставляют
документ: Capture → Quick mount, resize/draw через trusted native input,
Editor → Delete/Undo/Redo. Наблюдение document/pixels не передаёт image bytes.
Test-only capability `core:window:allow-set-focus` позволяет явно фокусировать
окно перед input при работающем resident developer app.

Промежуточные native failures сохранены: busy executable при сборке
(`native-final.log`), antialiased edge comparison и перекрытие ToolRail
configure popover (`native-final2.log`). Пробу пикселя перенесли с первого
полупрозрачного края на насыщенный внутренний пиксель; проверка полного
исчезновения ink после Delete остаётся точной.

Финальная native команда:

```powershell
$env:CUTE_SCREEN_E2E_SCENARIOS='quick-editor-handoff,quick-chrome'
pnpm test:e2e:tauri
```

Exit 0: handoff 1/1 + Quick chrome 6/6. Один Editor click открыл main и скрыл
Quick за 228 ms, materialized canvas 320×240 из crop (80,60). Насыщенный пиксель
стрелки `[229,72,77,255]` сохранился после handoff; Delete восстановил
`[127,127,127,255]`, Undo вернул ink, Redo снова чистый source. Пипетка
проверена после palette через click/keyboard/ПКМ с повторным выбором Arrow
и переключением на Shape; следующий drag создал аннотацию в обоих WebView.
Соседние native проверки покрывают trusted nested SVG controls, focus,
non-origin selection position, Copy и Escape/restart.

Лог `artifacts/quick-editor-handoff/native-green3.log`, замеры
`handoff-evidence.json` и screenshots `handoff-{quick-before,editor-before-delete,editor-after-delete}.png`
в той же папке сохранены отдельно от перезаписываемого runner output.
Просмотрены before/after удаления и
`artifacts/eyedropper-tool-switch/eyedropper-switch-{editor,quick}.png`:
после отмены sampling видны созданные аннотации, лупа отсутствует. Новый ADR
не требуется: source fix восстанавливает уже принятый immutable-source контракт.

## Компактная панель фигур (2026-10-15)

Платформа: Windows 10 Home 19045 x64 / PowerShell, Chrome 155.0.8059.79,
real WebView2/EdgeDriver 155.0.4283.45, external tauri-driver.

Выполненные команды:

```powershell
pnpm format
pnpm check
pnpm format:check
pnpm test
pnpm test:render
pnpm exec vitest run --project boundaries --project vue tests/boundaries tests/unit/vue/shape-context-toolbar.test.ts tests/unit/vue/tool-ux.test.ts tests/unit/vue/quick-capture-source.test.ts
$env:CUTE_SCREEN_BROWSER_E2E_PORT='5187'
pnpm test:e2e:browser --spec 'tests/e2e/specs/browser-{shape-toolbar,tool-ux,m06-content-tools}.e2e.ts'
pnpm test:e2e:browser --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts
Remove-Item Env:CUTE_SCREEN_BROWSER_E2E_PORT
$env:CUTE_SCREEN_E2E_SCENARIOS='shape-toolbar'
pnpm test:e2e:tauri
Remove-Item Env:CUTE_SCREEN_E2E_SCENARIOS
```

Результаты: unit/component 85 files / 574 tests; render 2 files / 13 tests;
focused Vue/boundaries 12 files / 72 tests; browser 3 files / 12 tests;
native 1 file / 1 test. Заключительный browser shape-only прогон с общими
fullscreen coordinates — 2/2. `pnpm check` завершился с exit 0, включая 40/40
boundary tests, IPC drift check и Rust formatting/clippy во всех configured modes.
Логи: `artifacts/shape-{format,check,test,render,focused,browser,browser-final,tauri}.log`.
Native input сохраняет `isTrusted=true` для Escape и ПКМ; production capture
создаёт source/session, canvas gesture создаёт shape, Editor материализует его.
Проверяются независимый HEX `#336699`, corner radius 12, stroke 8, opacity 75%,
multiply, undo/redo и defaults следующей фигуры. DOM execute используется для
наблюдения snapshot/геометрии, не для подстановки документа или input.

Просмотрены `artifacts/browser-e2e/shape-{en,ru}-{light,dark}.png`,
`artifacts/browser-e2e/shape-fill.png`,
`artifacts/tauri-e2e/shape-editor-compact.png` и
`artifacts/tauri-e2e/shape-quick-fill.png`. Меню ограничены доступной высотой,
прокручиваются внутри; screenshots ждут завершения popover enter transition.
В fullscreen WebView pointer coordinates вычисляются из фактического CSS rect;
общий handoff helper для пустого capture здесь не используется, поскольку
тест намеренно переносит выделенную аннотацию. Capture adapter в этом сценарии
fake-platform; physical capture, Linux/macOS и release matrix не заявляются.

## Стрелки: выделение, меню и Quick position (2026-10-15)

Windows 10 Home 19045 x64 / PowerShell, WebView2/EdgeDriver 155.0.4283.45,
tauri-driver 2.1.0, WDIO/service 9.30.1/1.3.0. Проверена dirty working copy,
включая параллельно разрабатываемую панель фигур; эти изменения сохранены.

`REQ-EDT-005/008/015/016`, `REQ-TOL-001`, ADR-050: display overlay редактора
и Quick рисуется в CSS pixels × DPR, ограничен видимой частью canvas. Pixel
tests проверяют пунктир при zoom 2 / DPR 2 и bounded allocation для 8K/zoom 4
со scroll и non-origin output. Corner cursor — Tabler `rotate-clockwise`.
Caps/path имеют миниатюры, mirrored tail, локализованные accessible names,
disabled/focus/Escape. `UiSeparator` используется в Arrow toolbar и ToolRail.

Geometry regression сначала воспроизвёл top/bottom insets 6/10 px; после
устранения позднего CSS override — 5/5 px, включая border. Separator прямой,
21 px, центр совпадает со swatch. `padding-{red,measured-red,green}.log`
и `arrow-toolbar-geometry.json` фиксируют замеры.

Quick повторно вычитал crop из координат полного frozen frame. Теперь
selection toolbar использует правильный output и фактический CSS scale.
Дополнительно исправлен ранний выход после crop drawing, скрывавший selection
frame/handles: `quick-frame-red.log` падает на отсутствии пикселей; финальные
9/9 focused geometry/pixel tests проходят (`quick-position-unit.log`).

`pnpm test` — 84 files / 570 tests, exit 0 (`unit-final.log`).
`pnpm test:render` — 13/13, exit 0 (`render.log`).
`CUTE_SCREEN_BROWSER_E2E_PORT=5190 pnpm test:e2e:browser` с `--spec`
`browser-tool-ux.e2e.ts`, `browser-m06-arrow-tools.e2e.ts` и
`browser-m05-editor-foundation.e2e.ts` — 3 files / 16 tests, exit 0
(`browser-final.log`). Проверены UI matrix, creation, menu, Undo и transforms.

Native `CUTE_SCREEN_E2E_SCENARIOS=arrow,quick-chrome,m05-viewport pnpm
test:e2e:tauri`: Arrow 2/2 и viewport 1/1 прошли. Первая Quick regression
неверно читала скрытый a11y text через getText; заменена наблюдением textContent.
Повторный startup показал обычный binary вместо harness: backend отклонил
`--e2e-harness-query` после параллельной замены target/debug. Runner теперь
копирует успешно собранный binary в уникальный runtime directory и проверяет
test-only argument до запуска драйвера. Resident app не завершалась.

`CUTE_SCREEN_E2E_SCENARIOS=quick-chrome pnpm test:e2e:tauri` с закреплённым
binary — 5/5, exit 0 (`tauri-quick-pinned.log`). Настоящий pointer resize
создаёт non-origin Quick frame; затем обычный drag создаёт стрелку. Панель
сравнивается с bounds синих пикселей selection overlay, меню открывается и
Escape оставляет Quick открытым. Также проходят trusted ПКМ/keyboard,
handoff, Copy и cancel/restart. Screenshot `quick-arrow-selection-position.png`
просмотрен: панель над стрелкой, actions и rail внутри viewport.

Логи и копии основных screenshots — `artifacts/arrow-menus/`; исходные native
JUnit/backend/frontend logs — `artifacts/tauri-e2e/`. Это настоящий Windows
WebView с fake capture; Linux/macOS/WebKit, mixed-DPI и физический capture
этим изменением не перепроверены. Навык `webkit-ui` дополнен проверкой insets,
разделителей и координат Quick; UTF-8 `quick_validate.py` проходит.

`pnpm format` прошёл (`format-final.log`), отдельный `pnpm format:check`
прошёл (`format-check-final.log`), однако последующие `pnpm check` во время
параллельной записи shape-файлов повторно обнаруживали CRLF в
`shape-toolbar.ts`, `browser-shape-toolbar.e2e.ts`, `tauri-shape-toolbar.e2e.ts`.
Boundary gate отдельно даёт 38/40: новый ShapeFormattingToolbar ещё не внесён
в parameter-preview allowlist, а shape-изменения `context-schema.ts` и
`drawing-payload.ts` превышают complexity ratchet. Эти ошибки не исправлялись
в рамках стрелок и не считаются успешным общим check; `check-final.log` и
`boundaries.log` сохраняют точные причины. Rust checks этого финального
`pnpm check` не достигнуты; Rust source в этом изменении не менялся.

## Windows: след editor при захвате (2026-10-15)

Windows 10 Home 19045 x64 / PowerShell, WebView2 и EdgeDriver 155.0.4283.45,
external tauri-driver 2.1.0. Native main hide выполняется на owning thread без
DWM transition, с visibility check и `DwmFlush` до DXGI. Начальная selecting
фаза обрабатывает Escape до вложенного canvas handler.

`windows-capture-exclusion` проходит production Capture с настоящим DXGI,
контрольным fullscreen WinForms desktop и заметным marker поверх editor.
Три цикла capture → trusted Escape → retry: 27/27 decoded scene pixels равны
`[37,71,105,255]`; marker/editor отсутствуют. Просмотрены
`artifacts/tauri-e2e/windows-capture-before-0.png` и
`windows-capture-after-2.png`; числа — `windows-capture-exclusion-pixels.json`.
Физический сценарий интерактивный, Windows-only и запускается явным фильтром:

```powershell
$env:CUTE_SCREEN_E2E_SCENARIOS='windows-capture-exclusion,quick-chrome,document-write,document-reopen,renderer-alpha'
pnpm test:e2e:tauri
```

Лог — `artifacts/capture-exclusion/tauri-profile-isolated.log`. Test-harness
single-instance identifier включает hash абсолютного E2E profile: resident
developer app и разные профили не принимают команды друг друга; persistence
pair использует один профиль/identifier. GUI fixture явно показывается после
hidden-console startup. До этой изоляции прогоны попадали в resident app и
не считаются evidence; build failures из-за locked EXE также сохранены в каталоге.
Resident executable был переименован внутри `target/debug`, без завершения app.

Rust red/green — `rust-red.log`, `rust-green.log`, `identity-{red,green}.log`;
mounted selecting Escape red/green — `escape-{red,green}.log` (3/3 green).
Полная final platform matrix, mixed-DPI и Window target этой проверкой не покрыты.

Итог native — exit 0, 5 scenarios / 8 tests. `pnpm test` — exit 0,
81 files / 553 tests (`unit-final.log`); `cargo test --workspace` — exit 0,
134 passed / 1 ignored (`rust-final.log`). SHA256 test binary, base commit,
dirty flag и platform записаны в `artifacts/capture-exclusion/native-evidence.json`;
critical before/after PNG, pixel JSON и JUnit скопированы в тот же каталог.

`pnpm format` и `pnpm check` — exit 0 (`format-complete.log`,
`check-complete.log`): lint/typecheck/format/docs, 40 boundary tests, IPC,
Rust fmt и четыре Clippy feature configurations. `pnpm tauri build --debug
--no-bundle` — exit 0 (`production-build.log`), собран обычный
`target/debug/cute-screen.exe` без test-harness. Финальная проверка форматирования
сохраняется в `format-check-final.log`. Большие renderer/browser/perf suites
повторно не запускались: renderer и document geometry не менялись.

## Marker: иконка brush (2026-10-15)

Windows x64 / PowerShell: `REQ-EDT-008` — общий `UiIcon` использует Tabler
`brush` для маркера в editor и Quick Capture.
`pnpm exec vitest run --project vue tests/unit/vue/ui-icon.test.ts
tests/unit/vue/quick-context-toolbar.test.ts` прошёл 39/39;
лог — `artifacts/marker-icon/vue-tests.log`.
`pnpm typecheck`, `pnpm format` и `pnpm format:check` прошли.
Native E2E для этой замены не запускался.

## Callout: иконка stroke-dynamic (2026-10-15)

Windows x64 / PowerShell: `REQ-EDT-008` — общий `UiIcon` использует Tabler
`stroke-dynamic` для выноски. Обновлены существующие SVG assertions в Vue и
Quick Capture E2E. `pnpm exec vitest run --project vue
tests/unit/vue/ui-icon.test.ts tests/unit/vue/quick-context-toolbar.test.ts`
прошёл 39/39; лог — `artifacts/callout-icon/vue-tests.log`. Первый запуск выявил
старое ожидание `text-caption` в toolbar test; после обновления тесты прошли.
`pnpm typecheck`, `pnpm lint`, `pnpm format` и `pnpm format:check` прошли.
Native E2E для этой замены не запускался.

## Итог UX tools/styles и real WebView (2026-10-15)

Windows x64 / PowerShell, Node 22.23.1, pnpm 10.33.2, Tauri 2.11.5,
WDIO 9.30.1, tauri-service/plugins 1.3.0, tauri-driver 2.1.0,
WebView2/EdgeDriver 155.0.4283.45. Изменения проверяются в dirty checkout;
не относящиеся к UX параллельные formatting/toolchain изменения сохранены.

`pnpm test:e2e:tauri` — exit 0, 15 scenarios / 18 tests
(`artifacts/tool-ux/tauri-final-accepted.log`). Проверены foundation/shell, arrow,
rich text, большой viewport, document persistence, clean capture, Quick chrome,
crop first-open, native eyedropper clipboard, alpha/EXIF/corrupted assets и
binary fallback. Quick chrome 4/4 проверяет настоящие ПКМ/keyboard
(`isTrusted=true`), nested SVG controls, layered Escape, Tab, Editor handoff,
Copy и cancel/restart. JUnit и backend/frontend logs — `artifacts/tauri-e2e/`.

`pnpm test:e2e:browser` — exit 0, 17/17 spec files
(`artifacts/tool-ux/browser-release.log`). `pnpm test:render` — 13/13
(`render-complete.log`, PNG/pixel decode assertions). Остальные итоговые логи:
`unit-accepted.log`, `check-final-accepted.log`, `rust-accepted.log`,
`tauri-final-accepted.log` в `artifacts/tool-ux/`.

`pnpm test` — 81 files / 552 tests, exit 0 (`unit-accepted.log`).
`cargo test --workspace` — 132 passed / 1 ignored, exit 0 (`rust-accepted.log`).
`pnpm check` — exit 0 (`check-final-accepted.log`: lint/typecheck/format/docs,
40 boundary tests, IPC check, Rust fmt и четыре Clippy feature configurations).
Дополнительный browser style clipboard/multiselect сценарий — 4/4 tool UX tests,
`browser-style-transfer.log`: native copy → multi-selection → paste → one Undo.
`pnpm test:perf` — 4/4, exit 0 (`perf-accepted.log`), отдельно от E2E и сборок;
4K/500 и 8K/1000, 30 warmups / 120 measurements, zero idle frames.
Это controlled software trend evidence, не новый native GPU budget claim.

Финальный native прогон включает проверку width 10 px / Elbow после перезапуска
приложения. `driver-cache-proof.json`: exit 0, downloads before/after 19/19.
После teardown listener 4444/4445 отсутствует; Windows profile cleanup имеет
ограниченные retries при кратковременном EBUSY chrome_debug.log.
`acceptance.json` содержит base commit, dirty-tree пометку, SHA256 binary,
версии, fixture IDs, команды, exit codes и pending platform checks.

Просмотрены native screenshots `quick-native-tool-settings.png`,
`m05-viewport-fit-webview.png`, `m08-crop-first-open-1024x700.png`,
`m08-eyedropper-native-clipboard.png`. В большом viewport виден исходник вместо
missing-image placeholder; панель Quick и вложенные controls внутри viewport.
Browser screenshots `tool-ux-1024-{en,ru}-{light,dark}.png` сохранены после
закрытия меню и окончания анимаций; все четыре screenshots просмотрены.

Дополнительные найденные причины и исправления:

- Windows library/cache явно читают test-only app data override. EdgeDriver
  получает `tauri:options.webviewOptions.userDataFolder`: одного env override
  недостаточно, driver иначе создаёт временный UDF на каждую session.
  APPDATA/LOCALAPPDATA также не заменяют Tauri Known Folders. Production paths
  и asset scope сохранены.
- Fake capture PNG теперь opaque `#7F7F7F`: прежняя fixture записывала `0x7f`
  также в alpha. Red/green Rust decode test — `fake-capture-{red,green}.log`.
  Test capability получил production `allow-show`; иначе успешный capture
  сопровождался ошибкой восстановления main window.
- M05 SVG fixture использует Blob URL, разрешённый production CSP. Decode
  завершается до document mount; большой viewport fixture не обрезан. Native
  test проверяет пиксель `[39,61,90,255]`, Quick handoff — opaque scene pixel.
- Runtime/TEMP/TMP WDIO находятся в `artifacts/tauri-e2e/runtime`. Кэш драйвера
  добавляется только в PATH дочернего runner. Patch
  `patches/@wdio__tauri-service@1.3.0.patch` распознаёт строку версии
  `Microsoft Edge WebDriver` и CRLF из `where`; без этого driver скачивался
  заново для каждого сценария, что привело к ENOSPC системного диска.
  Старые Temp-копии сохранены; новые запуски используют каталог артефактов.
- Dispose старого image resource с тем же ID больше не удаляет новую texture
  из backend cache. Red/green pixel test — `resource-race-{red,green}.log`.
  Resize fit объединяется через animation frame; pointer helpers ждут
  стабильных CSS/backing bounds. Два resize события дают один fit за frame.

REQ-EDT-002/003/015/016/017, ADR-048: creation policies, явные цели
defaults/selection/inline, configure tools, object/empty-canvas menu, floating
formatting, mixed/locked batch, session style clipboard и v3 preferences.
Core contracts — `styles.test.ts`, `tool-preferences.test.ts`; mounted shell —
`tool-ux.test.ts`; browser — `browser-tool-ux.e2e.ts`. Покрыты content/geometry,
undo/redo, RU physical shortcuts, texture resolver, cancel text, per-type memory
и disabled reasons. Pan/scroll positioning меняет DOM без Vue render на каждый
pointermove. Document v7 и существующие updateLayer/batch сохранены.

Локальное Windows evidence использует fake-platform capture. Linux/macOS,
mixed DPI, physical capture/permissions и native Save PNG dialog/redecode
остаются pending; browser mode их не заменяет. Controlled perf выполнен
отдельно после остановки E2E. Последующая профильная проверка defaults и
повторного использования driver — `tauri-final-accepted.log`.

## Промежуточная диагностика Windows harness (2026-10-15)

Платформа: Windows x64, WebView2 Evergreen/EdgeDriver `155.0.4283.45`,
`tauri-driver 2.1.0`, Tauri `2.11.5`, WDIO `9.30.1`, tauri-service/plugins `1.3.0`.
Восстановлен production mount-flow реального binary; установка WebKit на Windows
не требуется. Windows использует external provider, другие ОС сохраняют embedded.

Причины и исправления:

- Ошибка worker «No browserName ...» была вторичной: launcher удалял browserName
  и падал на EdgeDriver check до назначения endpoint. Включено автоматическое
  получение подходящего EdgeDriver; установлен официальный tauri-driver.
- Embedded 1.3.0 исполняет pointer/keyboard через DOM dispatch и не создаёт
  contextmenu. Native-input acceptance на Windows использует external provider;
  тест наблюдает `isTrusted=true` для contextmenu и keydown.
- Window labels переключаются через `browser.tauri.switchWindow/listWindows`,
  поскольку внешние handles отличаются от Tauri labels. Встроенный HTTP server
  отключается только при test-harness external provider, исключая конфликт портов.
- pnpm patch `patches/@wdio__native-core@1.1.0.patch` убирает cmd-wrapper для exe
  и завершает только дерево собственного driver PID. Два последовательных
  сценария больше не оставляют tauri-driver/msedgedriver и listener 4444/4445.
- Runner останавливается при failed fixtures/build и не запускает stale binary;
  subprocess regression tests проверяют оба отказа (2/2).
- Test-only tracing делает ошибки embedded startup видимыми. Quick layout
  измеряет только нижний defaults toolbar, configure panel ограничена viewport
  и остаётся интерактивной у верхнего края.
- Rust asset URL использует WebView2 HTTP mapping и кодирует Windows separators.
  Два failing URL tests зафиксированы до исправления; transport tests 8/8 green.
  Windows-запуск локального IPC formatter через node вместо cmd shim также
  проверен red/green Rust test.

Фактическая команда PowerShell:

```powershell
$env:CUTE_SCREEN_E2E_SCENARIOS='quick-chrome,renderer-alpha'
pnpm test:e2e:tauri
```

Результат: exit 0, Quick chrome 4/4 (ПКМ, nested SVG stroke controls, layered
Escape, trusted keyboard, Tab focus, Editor handoff, Copy, cancel/restart),
затем alpha transport 1/1 через scoped asset и CanvasKit texture. Лог:
`artifacts/tool-ux/tauri-native-success.log`; JUnit и captured logs:
`artifacts/tauri-e2e/`. Скриншот `quick-native-tool-settings.png` сохранён и
просмотрен: панель и вложенные stroke controls видимы внутри viewport.
`pnpm test` — 81 files / 544 tests; focused layout 8/8 и tool UX 15/15.
Это scoped native evidence с fake-platform capture, не physical capture и не
полная Tauri/platform matrix. Полный native suite, другие ОС, mixed DPI и native
Save PNG dialog/redecode остаются pending до отдельного подтверждения.

В пользовательский каталог установлен skill `tauri-webview-testing`;
`python -X utf8 .../skill-creator/scripts/quick_validate.py .../tauri-webview-testing`
прошёл. Навык содержит проверенные причины, выбор provider, scoped cleanup,
production mount-flow и требования к native-input evidence.

## Иконка Select pointer-2 (2026-10-15)

Windows 10 x64, PowerShell: `pnpm test --project vue tests/unit/vue/ui-icon.test.ts
tests/unit/vue/quick-context-toolbar.test.ts` — passed, 39/39. Runtime SVG
assertion кнопки Select проверяет `tabler-icon-pointer-2`.
Лог: `artifacts/select-pointer-2-tests.log`. `pnpm format` остановился на шести
ошибках `@stylistic/max-len` в существующих `selection-actions-controller.ts`,
`tool-settings-validation.ts` и `tool-style-defaults.ts`. Финальный
`pnpm format:check` также не прошёл: 953 ошибки в текущем рабочем дереве,
включая CRLF и длину строк. Логи: `artifacts/select-pointer-2-format.log` и
`artifacts/select-pointer-2-format-check.log`. Визуальный browser/Tauri smoke
для этой замены не запускался.

## Цель

Тестовый harness должен доказывать пользовательское действие в подходящей среде. Unit-тест механизма не заменяет проверку реального Tauri webview, а ручной smoke не заменяет детерминированную проверку core.

## Форматирование исходников

`pnpm format` применяет Prettier для CSS/JSON/YAML/Markdown/HTML и затем ESLint
Stylistic 5.10.0 (MIT) для JS/TS/Vue. `pnpm format:check` проверяет оба набора
без записи и входит в `pnpm check` и CI. Ширина строки — 120, отступ — 2 пробела,
окончания — LF. Generated IPC bindings сохраняют Prettier-контракт генератора.

`eslint.format.config.js` и `scripts/eslint-readability.mjs` задают структурные
переносы: named imports/exports с двумя и более именами, объявления функций с
двумя и более параметрами, несколько базовых интерфейсов в `extends`, условия с
тремя и более проверками. В каждом случае элементы располагаются по одному на
строку. Короткие вызовы/callbacks остаются компактными; существующие переносы
объектов, массивов и вызовов не схлопываются. Блоки со скобками многострочные,
допускается одна инструкция на строку. Длинные строки данных, URL, комментарии
и значения HTML-атрибутов освобождены от жёсткого лимита длины.

В VS Code JS/TS/Vue использует ESLint с layout-only fixes, остальные поддерживаемые
языки — Prettier. Расширения рекомендованы через `.vscode/extensions.json`;
Prettier исключает JS/TS/Vue через `.prettierignore`, поэтому повторное сохранение
не отменяет структурные переносы. Rust проверяется отдельно через `cargo fmt`.

Регрессии: `tests/boundaries/formatting-contract.test.ts` проверяет примеры со
скриншотов, Vue script/template, сохранение комментариев и повторное применение
форматирования без изменений. Команда: `pnpm test:boundaries`.

Финальная проверка структурных правил 2026-10-15, Windows 10 build 19045 x64,
Node 22.23.1 / pnpm 10.33.2: `pnpm format`, `pnpm format:check`, `pnpm typecheck`,
`pnpm docs:check` и `git diff --check` — passed. Все 8 formatting regressions
прошли; логи — `artifacts/formatting-style-check.log` и
`artifacts/formatting-regressions.log`. Общий `pnpm test:boundaries` на момент
проверки: 36/37, оставшийся failure — function size/complexity/depth в текущих
изменениях tool UX. Последний `pnpm check` остановился на неиспользуемой `props`
в `workspace-bindings.ts`; последующие IPC/Rust gates в этом прогоне не запускались.
Это tooling evidence, runtime/platform guarantees не меняются.

Первоначальная проверка Prettier 2026-10-15: Windows 10 build 19045 x64, Node 22.23.1,
pnpm 10.33.2. Выполнены `pnpm format`, `pnpm format:check` (passed),
`pnpm docs:check` (34 Markdown-файла) и `git diff --check` (passed).
`pnpm check` остановился на ESLint: неиспользуемые `floatingArrowToolbarSchema`
и `toolConfigureArrowSchema` в текущем `EditorWorkspace.vue`.
`pnpm test:boundaries` — 28/29: оставшаяся ошибка относится к лимитам длины,
сложности и вложенности функций в текущих изменениях инструментов/стилей.
Runtime/platform guarantees от настройки форматирования не меняются.

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

ADR-148: `pnpm test:perf` выполняет короткий software smoke: 2 warmups и
8 measurements на 4K/500 и 8K/1000 для CanvasKit, composition и blur; каждый
отчёт помечен `profile: smoke`. `pnpm test:perf:trend` явно включает прежние
30 warmups / 120 measurements с `profile: trend`. Короткие quantiles нельзя
сравнивать с прежним 120-sample baseline или product budget. CanvasKit пишет
`artifacts/perf/m01-renderer.json`, composition и blur — собственные JSON с
fixture SHA, runner, counts, elapsed и memory snapshots/RSS. Sampler отдаёт
event loop между кадрами и ограничивает warmup + measurement цикл 30 s для
smoke / 120 s для trend; perf-файлы идут последовательно. Budget failure
содержит сценарий/фазу/RSS и не выдаёт частичный успешный report. Один native
вызов не прерывается кооперативным budget; CI step ограничен 5 минутами.
Ненулевые переданные idle frames остаются hard failure; синтетический ноль
в CPU harness не доказывает idle production scheduler. Его проверяет reference
и отдельные scheduler tests. RSS диагностический: bounded LRU и освобождение
temporary/prepared surfaces проверяются отдельно.

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

## X11 selector-to-ready-quick handoff (2026-08-30)

Historical evidence only. ADR-039 supersedes this design: X11 Area must not
retain a native selector or perform a selector-to-WebView handoff. The old
runtime samples explain why the product contract was replaced, but they no
longer qualify as acceptance evidence.

## X11 command-to-selector latency repair (2026-08-30)

Historical Area timing evidence only; ADR-039 changes the target metric to
command → single Quick surface `IsViewable`. The capture-exclusion repair from
this work remains active: a visible editor must disappear before root capture,
an already hidden process skips a new settle interval, and a recently hidden
surface waits only the remaining compositor interval.

## X11 unified Quick selection surface (2026-08-30)

Ubuntu 24.04 / GNOME 46 / X11, x86_64, 2560×1440. The ADR-039 traceability gate
was added before implementation.

- Red-first Vue coverage failed because the first Quick drag did not create a
  crop command. It now emits exactly one `setCrop`, rejects a click with no
  area and preserves the scene canvas DOM node across `selecting → editing`.
  A separate component test first reproduced the accidental main-editor
  ToolRail/Zoom branch and now requires all editor chrome to remain absent in
  selecting.
- Red-first Rust coverage failed to compile until full-frame drafts carried a
  pending-selection state and exposed explicit validated confirmation. Commit
  rejects an unconfirmed draft. A second red-first settle test protects rapid
  repeated capture from Mutter's recently hidden fade actor.
- Startup latency had two additional red-first gates. Vue now maps the
  non-focusable GTK warmup before binary decode so WebKit allocation overlaps
  image work. The common X11 TrueColor/xRGB32 test then required direct opaque
  top-down BMP encoding, avoiding the former native → RGBA → BGRA pair of
  full-frame pixel loops while retaining the generic fallback and cursor path.
- Boundary coverage rejects any call from X11 Area to native
  `select_frozen_target` and rejects retained X11 selector handoff calls from
  the Tauri host. Window target remains native; Wayland remains portal-owned.
- Resident GNOME/X11 runtime replay showed one 2560×1440 Quick top-level XID,
  `0x42000fc`, before and after a physical `300,250 → 1000,700` drag. Selecting
  contained only frozen desktop, dim/crosshair and the hint. Editing kept the
  exact 700×450 dash on the same surface and added tools/actions. Escape hid
  the same XID and the waiting CLI returned typed `cancelled`. A 10 ms focus
  sampler measured command → focused selecting at 723 ms from the visible
  editor and 607 ms from the hidden resident dev/debug process; the earlier
  sequential/generic path measured about 1.56 s and 1.15 s respectively.
- Final automatic evidence: `cargo test --workspace` passed 119/119; `pnpm
test` passed 474/474; `pnpm test:boundaries` passed 18/18; `pnpm lint`, all
  TypeScript/Vue package and app typechecks, `pnpm docs:check`, `cargo fmt` and
  every configured Clippy feature gate passed. `pnpm tauri build --debug
--no-bundle` produced `target/debug/cute-screen` with the embedded frontend.
  Focused Prettier and `git diff --check` passed every file changed by this
  contract. Repository-wide `pnpm format:check` remains red only on the two
  unrelated pre-existing worktree files `TopBar.vue` and `shell/types.ts`.

## X11 resident quick-preview latency repair (2026-08-28)

Ubuntu 24.04.4 LTS, GNOME Shell 46, x86_64 X11; resident Tauri dev/Vite
process at a 2560×1440 physical framebuffer. `docs/TRACEABILITY.md` was updated
before the test and production change.

Historical timing evidence: ADR-039 moved BMP import before the single Quick
surface becomes visible, so the mouse-up-to-second-window interpretation below
no longer describes current X11 Area behavior.

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

Историческое evidence, superseded ADR-039. Native Area selector, его hint
renderer и vendored camera assets удалены 2026-08-31; текущий X11 Area hint
проверяется только внутри mounted Quick WebView.

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

## Windows unified Quick selection surface (2026-08-30)

Windows x64. The change is limited to Area capture presentation: Area and its
editor now share one fullscreen Quick surface. Window capture retains the
native selector and direct-document flow; immutable originals, materialization
and export contracts are unchanged.

- Red-first `cargo test -p cute-screen-desktop
windows_platform::tests::area_uses_the_mounted_quick_surface_while_window_keeps_native_selection`
  failed because `FrameForQuickSelection` did not exist. After implementation it
  passed: Area freezes the full DXGI virtual desktop and marks the draft pending,
  while Window alone keeps `SelectThenFrame`.
- `build-contract.test.ts` verifies that the Windows Area capture route cannot
  call `select_on_virtual_desktop` or define a separate `area_geometry` path.
  It also pins prepared duplication → registered transparent compositor pulse →
  `DwmFlush` → output acquisition. Shared Vue coverage keeps the mounted
  `CanvasViewport`, emits one `setCrop`, changes only `selecting → editing`, and
  now mounts the real pending Quick session to prove Pinia reaches `ready` and
  removes `.cs-loading`.
- Red-first interactive Rust probe initially received a correctly sized but
  all-zero first DXGI frame on a controlled non-black desktop. The first repair
  attempt failed with Win32 error 1407 because Area no longer created the native
  selector class. After `CompositorPulse::show` registered that class and the
  Area route used the fresh-frame sequence, the same ignored runtime probe
  passed with non-zero visible-desktop pixels.
- `pnpm tauri build --debug --no-bundle` produced the standalone binary used for
  the repair replay.
- Windows 10 Home 22H2 build 19045 x64, single 2560×1440 physical display at
  125% scale: Area opened directly as one fullscreen `Cute Screen Quick Capture`
  HWND `0x4078C`. No second Cute Screen/selector HWND appeared. The selecting
  screenshot contains the actual frozen desktop rather than a black frame. The
  same HWND remained after an injected `420,300 → 1400,900` drag; the existing
  surface showed the expected 1225×750 physical crop, preserved its frozen
  pixels/dashed frame, added tools/actions and did not show
  `Подготавливаем редактор…`. Escape removed the Quick window. Evidence:
  `artifacts/windows-area-repair/selecting.png` and
  `artifacts/windows-area-repair/editing.png`.
- Cross-monitor bounds remain a separate runtime gate.
- Windows Editor handoff red-first evidence: a regular (non-quick)
  `CanvasViewport` emitted no `frameReady`, so the focused component regression
  failed with `frameReady = undefined`. The persisted document was already
  visible in main, but `quick_capture_commit` timed out waiting for an event the
  main renderer could never emit. The repair emits readiness after every
  completed document render, lowers the Windows Quick window before the native
  mount wait, and prevents post-hide fullscreen mutation.
- Windows 10 dev replay without CLI `--json`: after one UI Automation Invoke of
  `Редактор`, main became visible at 104 ms and Quick became invisible at 163 ms.
  Three seconds later only main remained visible and the resident process was
  alive. The former failed replay retained both HWNDs and showed a 654×487 Quick
  window after the materialized fallback. Evidence:
  `artifacts/windows-area-repair/editor-handoff-one-click.png`.
- Final stable checks for this slice: `cargo test --workspace` passed 123 tests
  with the interactive DXGI probe ignored; `pnpm test` passed 55 files and
  476/476 tests; the ignored interactive DXGI probe passed separately.
  `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, focused
  `build-contract.test.ts` 12/12 and `pnpm check:rust` passed;
  `pnpm tauri build --debug --no-bundle` passed.
  Repository-wide `pnpm check` remains blocked by pre-existing Prettier drift in
  39 untouched files. Full `pnpm test:boundaries` also retains one unrelated
  failure in `editor-core.test.ts` because its regex no longer finds the current
  `IconName` declaration; 19/20 boundary tests passed.

## Rust/Tauri core refactor evidence (2026-08-30)

Portable evidence этого изменения не заменяет platform runtime smoke:

- Linux/X11, Debian-based build host: `cargo test --workspace --locked
--no-fail-fast` — quick commit/cancel barrier,
  degraded post-commit handoff, storage fresh/legacy/damaged/future fixtures,
  recovery faults и async single-owner worker;
- macOS-portable tests проверяют ABI size/alignment, opaque-context atomic
  cancellation и virtual desktop geometry для negative origins, Retina/
  mixed-scale, horizontal/vertical cross-monitor selection. Objective-C bridge
  по-прежнему требует отдельной сборки и runtime replay на macOS;
- focused Vue coverage проверяет frontend phase projection
  `selecting → editing → preparing → committing → committed`, возврат в
  `editing` при materialization failure и exactly-one prepare/commit invoke;
- `pnpm test:boundaries` проверяет, что X11/Windows Area production routes не
  вызывают native Area selector, а Window routing и compositor pulse остаются;
- `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings`
  является gate; workspace дополнительно запрещает excessive function length,
  cognitive complexity и excessive argument counts (изолированные legacy X11
  window loop и declarative Tauri builder документированы локальным `expect`).
- На том же host успешно выполнены `pnpm check`, `pnpm test` (478 tests),
  `pnpm test:render` (13 tests), `pnpm test:e2e:browser`, `pnpm test:perf` и
  `pnpm tauri build`; release artifacts: `Cute Screen_0.0.0_amd64.deb` и
  `Cute Screen_0.0.0_amd64.AppImage` в `target/release/bundle`.
- Focused real-Tauri/WebKitGTK сценарий `m04-clean-profile-capture` проходит
  новый `Area → Quick editing → durable commit → main editor` lifecycle. Полный
  `pnpm test:e2e:tauri` пока не является зелёным evidence: Arrow, rich text,
  viewport и post-handoff Crop/Eyedropper gesture scenarios нестабильны на
  WebKitGTK. Capability regression, запрещавший `event.listen` для тестового
  Quick WebView, исправлен; platform evidence Windows/macOS/Wayland остаётся
  обязательным отдельно.

## TypeScript/Vue architecture refactor evidence (2026-08-31)

Ubuntu 24.04.4 LTS, Linux `6.8.0-138-generic` x86_64, X11,
WebKitGTK `605.1.15`, Node `22.23.1`, pnpm `10.33.2`. Это evidence
поведенчески нейтрального рефакторинга по ADR-042; оно не расширяет platform
support claims и не заменяет Windows/macOS/Wayland runtime matrix.

- `pnpm check` прошёл полностью: lint, TypeScript builds/typechecks, formatting,
  Markdown links, 6 boundary files / 29 tests, IPC/build contracts и все
  настроенные Rust fmt/Clippy feature combinations. AST architecture guard
  подтвердил package/domain direction, отсутствие циклов и root-barrel imports,
  platform import boundaries и бюджеты 500/600/120/20/4. Все три temporary
  allowlist в `config/typescript-architecture.json` пусты.
- `pnpm test` прошёл 75 files / 478 tests; `cargo test --workspace` прошёл
  123 tests. Вместе с 29 boundary tests это 507 TypeScript scenarios против
  исследованного baseline 494; skipped tests не добавлялись.
- `pnpm test:render` прошёл 2 files / 13 tests без изменения golden files.
  `pnpm test:e2e:browser` прошёл 16/16 spec files. `pnpm test:perf` прошёл
  4/4 controlled software metrics; pointer path остаётся transient и не создаёт
  document command до завершения gesture. `pnpm ipc:check` прошёл без изменения
  generated DTO или wire payloads.
- Полный `pnpm test:e2e:tauri` был выполнен на текущем host. Прошли foundation,
  shell, clean-profile capture и четыре renderer transport/decode сценария.
  Семь interactive WebKitGTK scenarios остались красными: embedded WebDriver
  отправляет canvas action как Mouse Events без Pointer Events; viewport fit и
  post-handoff keyboard scenarios также сохраняют известный platform blocker.
  Для проверки на regression тот же `arrow`, `m05-viewport`,
  `m08-crop-first-open` и `m08-eyedropper-clipboard` набор был собран и запущен
  из snapshot `81d1ca8` непосредственно до Vue decomposition: результаты и
  строки падения идентичны. Production fallback, synthetic event substitution,
  skip или ослабление assertions не добавлялись. Логи и failure screenshots
  находятся в `artifacts/tauri-e2e`.
- `pnpm tauri build` прошёл. Собраны
  `target/release/bundle/deb/Cute Screen_0.0.0_amd64.deb` и
  `target/release/bundle/appimage/Cute Screen_0.0.0_amd64.AppImage`. Новых
  production dependencies, schema/preferences migrations и golden updates нет.

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

### Capture brand and dedicated tray icon, Ubuntu X11, 2026-10-15

`REQ-ACT-006`, `REQ-UI-013`, ADR-047. Host: Ubuntu 24.04.5 LTS,
Linux 6.8.0-142, x86_64, GNOME/X11, 1920×1080. Before implementation,
`cargo test -p cute-screen-desktop --lib tray_icon::tests -- --nocapture`
failed both contracts against the previous PNG before the new solid-cat
assets were generated.
The final tests decode embedded PNGs through the same Tauri loader used at startup,
check the gap between cat ears, a large solid silhouette, absence of capture
corners and transparent surroundings in the macOS template. This is asset evidence, not
Windows/macOS native rendering evidence.

Commands and results:

- `pnpm icons:generate` — regenerated app/editor/favicon SVG, all bundle PNG,
  ICO/ICNS, and separate tray/template PNG from the shared generator.
- `pnpm test` — passed: 77 files, 517 tests.
- `cargo test --workspace` — passed: desktop 104, storage 21; both tray tests pass.
- `pnpm check` — passed: lint, TypeScript/Vue, format, docs, 6 boundary files /
  29 tests, IPC drift check, frontend build, Rust fmt and all four Clippy gates.
- Pillow reopened and decoded `icon.ico` (256×256), `icon.icns` (1024×1024),
  `32x32.png` and `128x128.png`; the final PNG generation uses the same pipeline.
- GNOME StatusNotifierWatcher registered the real resident application's item;
  its IconName resolves to the generated tray PNG, and the 16 px panel screenshot
  shows the solid white cat silhouette without corners or a coloured tile.
- `com.canonical.dbusmenu.GetLayout` exposed the real capture/Open Editor/Quit
  items; the Open Editor `clicked` event opened a mapped 1280×800 Cute Screen
  window. This exercises the published menu API, not a physical panel-menu click.
- Browser review at 1280×720 showed the 30 px logo in light and system/dark themes;
  production output emits a separate `brand-*.svg` asset via `?no-inline`, keeping
  it compatible with the existing CSP. Browser-only startup reports missing
  native `invoke`; this review covers the brand chrome, not capture functionality.

Visual artifacts: `artifacts/branding/icon-review.png` contains app 128/32/48 px
and tray 16/20/24/32 px on light/dark backgrounds;
`artifacts/branding/gnome-tray.png` is the actual GNOME panel region.
Native screenshot helper: `/home/vladimir/.codex/skills/screenshot/scripts/take_screenshot.py`
with `--mode temp --region 1560,0,360,34`.
Windows notification-area, macOS light/dark/Retina and physical tray-menu click
remain pending. No new platform support claim or packaged installer smoke.

## Quick Capture chrome и Tabler Icons (2026-10-15)

Платформа: Ubuntu 24.04.5 LTS x86_64, X11, Node 22.23.1, pnpm 10.33.2;
Chrome 154.0.8037.57 и Tauri/WebKitGTK 605.1.15. Срез реализует ADR-043:
quick mode не возвращает canvas actions/fallback toolbar; full editor
сохраняет flip commands/history; 34 semantic icons переходят на Tabler MIT.

- `pnpm check` — passed, включая TS/Vue builds, lint, formatting, docs,
  29 boundary tests, generated IPC и все Rust Clippy gates. После добавления
  native scenario отдельно повторены E2E typecheck, ESLint и formatting.
- `pnpm test` — passed, 77 files / 517 tests. Включены 34 SVG checks,
  caller-class preservation и quick/full-editor context/history tests.
- `pnpm audit:licenses` — passed; `@tabler/icons-vue@3.49.0` и
  `@tabler/icons@3.49.0` имеют MIT. Lucide production dependency удалена.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5187 pnpm test:e2e:browser` — 14/16 files
  passed. M06 direct text не открыл contenteditable; M08 non-origin crop
  завис на pointer gesture. На исходном `HEAD` в отдельном `/tmp` snapshot
  M06 также воспроизводит pointer timeout. Focused M08 в рабочем дереве
  отдельно дал geometry mismatch, а исходный HEAD прошёл 1/1 дважды.
- В чистом snapshot исходного HEAD с наложенными только production changes
  этого среза (без параллельных branding edits), `pnpm install --offline
--frozen-lockfile`, `pnpm build:packages` и
  `CUTE_SCREEN_BROWSER_E2E_PORT=5195 pnpm test:e2e:browser --spec
tests/e2e/specs/browser-m08-2.e2e.ts --spec
tests/e2e/specs/browser-m06-content-tools.e2e.ts` — passed, 2 files / 6 tests.
  Полный browser suite нельзя объявлять зелёным на основании focused replay.
  Последующий полный прогон в том же неизменяемом snapshot дал 13/16 files:
  M05 move/undo timeout, M06 drawing timeout/text-tooltip interception и v7
  text selection timeout; M08 прошёл. Различающиеся failures и baseline M06
  подтверждают нестабильность suite, но не доказывают каждый failure как
  pre-existing; эти полные прогоны остаются failed evidence.
- `CUTE_SCREEN_E2E_SCENARIOS=m04-clean-profile-capture pnpm test:e2e:tauri`
  успешно собрал test binary, но обычный запуск завершился до WebDriver из-за
  уже работающего single-instance app. Повтор внутри `dbus-run-session` с
  отдельным временным `XDG_RUNTIME_DIR` — passed 1/1: production Area request
  с fake-platform → Quick → Select без flip/пустой панели → Pencil settings
  → Editor и первый document frame.
- Расширенный native probe подтвердил Copy и Escape/restart (2 tests passed),
  но synthetic WebDriver drag не создал аннотацию: Undo остался disabled и при
  element-relative, и при viewport coordinates. Этот probe не является
  доказательством physical gesture. Shipping quick-chrome scenario ограничен
  tool settings, keyboard focus, Editor/Copy/Escape/Close.
- Финальный `CUTE_SCREEN_E2E_SCENARIOS=quick-chrome pnpm test:e2e:tauri`
  внутри изолированной D-Bus session — passed 3/3: tool settings и Tab focus,
  handoff в Editor, Copy до закрытия surface, Escape/restart и Close. Native
  gesture не включён в зелёное evidence. Исходный failed drag probe сохранён
  в `artifacts/ui-tabler/tauri-drag-probe.log`.

Ручная приёмка первого physical Area drag, drawing → handoff и Save PNG
с настоящим file dialog/cancel/redecode остаётся pending; unit/controller
coverage этих действий не подменяет platform smoke. Backend/capture support
и renderer parity не расширяются этим изменением. В рабочем дереве параллельно
менялся branding; его изменения сохранены.

Скриншоты: `artifacts/tauri-e2e/quick-tabler-pencil.png` (реальная Quick WebView),
`artifacts/browser-e2e/m02-ready-1024x700.png` и
`artifacts/browser-e2e/m02-ready-light-1600x1000.png` (browser shell). Визуальная
проверка: единый контур/толщина, Text/Callout/Numbered Marker различимы,
существующие размеры и расположение controls сохранены.

Логи этого среза сохранены в `artifacts/ui-tabler/`: `check.log`, `unit.log`,
`licenses.log`, `browser-full.log`, `browser-isolated-full.log`,
`browser-isolated-focused.log`, `browser-baseline.log`,
`tauri-mount.log`, `tauri-chrome.log` и `tauri-drag-probe.log`.
Дополнительные скриншоты real WebView: `artifacts/tauri-e2e/quick-tabler-select.png`
(Select без панели), `artifacts/tauri-e2e/quick-tabler-focus.png` (keyboard focus).

### Follow-up: резкость Quick рамки и размера (2026-10-15)

Приложенный владельцем кадр показал растяжение всего UI bitmap: frozen image
400×300 отображалась в 1440×1080 CSS px, но overlay backing оставался 400×300.
Обратный font scale сохранял размер букв, однако они растеризовались до CSS
увеличения. Quick adapter теперь использует отдельный document-space backend
preview и visible overlay с backing `client rect × DPR`; frame/handles/badge
рисуются после display transform. `CropController` определяет visual scale по
document dimensions, а не новому overlay backing. Resize invalidates overlay
без сброса viewport или history. Scene и export не меняют resolution.

- `pnpm check` — passed, включая boundary/IPC/Rust gates.
- `pnpm test` — passed, 78 files / 522 tests. Focused
  `quick-overlay-resolution.test.ts` + `canvas-viewport-quick.test.ts` — 14/14:
  native raster pixels one-CSS-pixel edge при DPR 1/2, constant badge/dash
  scale, non-origin bounds, clearing и повторный document draw без сброса
  high-resolution overlay.
- `CUTE_SCREEN_E2E_SCENARIOS=quick-chrome pnpm test:e2e:tauri` внутри
  `dbus-run-session` с отдельным `XDG_RUNTIME_DIR` — passed 3/3, тот же
  Ubuntu/X11/WebKitGTK. Production Quick mount дополнительно проверяет
  `overlay.width/height === round(client rect × DPR)` перед handoff.
  Screenshot review: пунктир и handles теперь тонкие и резкие, `400 × 300`
  читается при исходном display scale.

Before/after: `artifacts/ui-tabler/quick-before.png` и
`artifacts/ui-tabler/quick-after.png`. Логи: `sharp-check.log`, `sharp-unit.log`,
`sharp-focused.log`, `sharp-tauri.log` в той же папке. Retina DPR 2 имеет
deterministic raster/controller evidence; physical mixed-DPI replay остаётся
pending. Полные browser failures предыдущего среза не переобъявляются зелёными
и не перезапускались ради этого Quick-only fix. Native Save dialog и physical
drag acceptance остаются открытыми, как указано выше.

## Монитор с кошачьими прищурами — 2026-10-16

`REQ-ACT-006`, `REQ-UI-013`, ADR-057. Windows 10 build 19045 x64;
Node 22.23.1, Python 3.14.0 / Pillow 12.0.0, Rust 1.97.0.

- До генерации `cargo test -p cute-screen-desktop --lib tray_icon::tests -- --nocapture`
  упал 0/2: старый template имел alpha 255 вместо прозрачных глаз, а в новом
  месте внешнего контура старый tray имел alpha 0 вместо тёмного цвета.
- `pnpm icons:generate` — passed. Общая геометрия выбранного монитора с ушами,
  двумя прищурами и подставкой обновила root logo, editor brand, favicon,
  tray/template и PNG/ICO/ICNS. `logo-mark.svg` сохраняет самостоятельный SVG
  без плитки. Запуск Tauri CLI через текущий Node работает на Windows без
  попытки выполнить pnpm shim как native executable.
- `cargo test --workspace` — passed: desktop 114, storage 20, binary/doc tests.
  Новые контракты повторно декодируют настоящие embedded tray PNG, проверяют
  оба глаза, белые stem/foot, внешний контур, template alpha и прозрачный фон.
- `cargo fmt --all` — passed. Целевые ESLint и formatting checks генератора — passed.
- `pnpm build:frontend` — passed; существующее предупреждение bundle >500 kB.
  Production `brand-DJhADi5n.svg` содержит точную выбранную геометрию.
- `python -X utf8 artifacts/branding/applied-logo-20261016/verify-generation.py`
  — passed: 66 декодированных PNG/ICO/ICNS изображений/кадров, 61 generated file.
  После повторного `pnpm icons:generate` decoded RGBA идентичны; SVG/PNG/ICO
  побайтово воспроизводимы. ICNS container ordering Tauri CLI может различаться,
  поэтому его сравнение выполнено по всем декодированным кадрам, не только bytes.
  `logo.svg`, frontend brand, favicon и foundation равны; `logo-mark.svg`
  совпадает по path с одобренным концептом. Отчёт: `verification.json` ниже.
- `pnpm docs:check` — passed, относительные ссылки/anchors в 34 Markdown files.
- `pnpm format` выполнен, но завершился ошибкой: 27 max-len ошибок в других
  изменяемых файлах editor-core/editor-vue. Лог: `artifacts/branding/logo-apply-format.log`.
- `pnpm check` остановился на lint: 365 errors / 60 warnings в текущем workspace;
  полный check не объявляется пройденным. Лог: `artifacts/branding/logo-apply-check.log`.
- `pnpm format:check` запускался; общий результат и оставшиеся ошибки сохраняются
  в `artifacts/branding/logo-apply-format-check.log`. Проверки новых брендовых
  исходников/документов выполняются отдельно, без заявления общего pass.

Пакеты запускались через штатный pnpm 10.33.2 (cmd либо Node entry point из
Corepack cache); это те же scripts package.json, без замены стабильных команд.

Артефакты `artifacts/branding/applied-logo-20261016/`:
`tray/` и `app/` — SVG/PNG в 16/18/20/22/24/32 при 100/125/150/200%, чёрный,
белый и штатный варианты на трёх фонах; каждый PNG повторно декодирован.
`tray/pixel-details.png` и app sheet просмотрены; прищуры и подставка сохранены.
`tray/report.json` содержит 13 консервативных edge-contact warnings на некоторых
маленьких размерах; они не являются автоматическим доказательством обрезки.
Native tray и реальные DPI этими листами не подтверждены.
`decoded-bundle-icons.json` и `verification.json` фиксируют размеры и SHA-256;
`generate.log` — повторную генерацию. Исторический GNOME smoke старого кота
не переносится на новую геометрию. Новый Windows/GNOME/KDE/macOS native tray,
light/dark/Retina/HiDPI и packaged-app smoke остаются pending; platform support
не расширен. Для отображения новых embedded assets нужен перезапуск новой сборки.

## Различимые кисти (2026-10-16, ADR-060)

`REQ-TOL-003`, `REQ-EDT-002/005/006/015`, `REQ-OUT-003`. Linux x86_64/X11,
Node 22.23.1, pnpm 10.33.2, Chrome 154.0.8037.57; native wry 0.55.1 и
external WebKitGTK driver из `artifacts/spotlight-fix/tools/`. Логи —
`artifacts/brushes/`; PNG — `artifacts/browser-e2e/brushes-*` и
`artifacts/tauri-e2e/brushes-*`.

Исследование: прежний resolver различал три brush только множителями
1/0.65/1.5 и рисовал pencil отдельными line nodes. Excalidraw использует
[perfect-freehand](https://github.com/steveruizok/perfect-freehand), разделяющий
streamline, smoothing и thinning. В core закреплён MIT `perfect-freehand@1.2.3`.

- Red-first: `pnpm exec vitest run --project core packages/editor-core/src/brushes.test.ts`
  — 5 failures / 1 pass до реализации (`core-red.log`).
- Финальный core + decoded brush goldens: `pnpm exec vitest run --project core packages/editor-core/src/brushes.test.ts --project render-harness tests/harness/render/golden-brushes.test.ts`
  — 13/13 (`ink-final.log`). Проверены RMS шума ≤50% при 65%, raw endpoints,
  constant width, настоящее/имитируемое pressure, короткие штрихи, dots/arcs/corners,
  прозрачные петли, bounds/resize/rotation/reflection, strict codec, clipboard,
  legacy upgrade одной command и точный Undo/Redo. При 12 000 samples — один node.
- Mounted Vue: `pnpm exec vitest run --project vue tests/unit/vue/brushes.test.ts`
  — 6/6 (`vue-focused.log`). Empty coalesced fallback, frozen settings/pen source,
  release endpoint без pressure=0, Escape/pointercancel, одна command, disabled
  correction и отдельная память 80%/20% через production defaults pipeline.
  Тридцать pointermove не вызывают render каждого Vue component на каждом событии.
  Дополнительно `tool-formatting-toolbar.test.ts` прошёл в `brush-focused.log`.
- `pnpm test:render` до параллельного расширения text fonts — 22/22; новый
  `golden-brushes.test.ts` сравнивает Canvas2D/CanvasKit при 1×/2×. Decoded
  preview/export совпадают; alpha собственного пересечения остаётся ~128/255.
  Backend semantic comparison допускает rounding ≤2 levels, каждый backend
  дополнительно сравнивается с собственным exact golden. Старые goldens не менялись.
  4K/8K `tool-settings-large.test.ts` использует UI PNG и 12 000 samples;
  decoded SHA-256 preview/export совпадает, scene содержит один pencil node.
  Timings и hashes — `artifacts/tool-settings/4k.json` и `8k.json`; это software
  correctness evidence, не GPU performance claim.
- `pnpm test:perf` — 4/4 (`perf.log`), controlled software suite.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5221 pnpm test:e2e:browser --spec tests/e2e/specs/browser-brushes.e2e.ts --spec tests/e2e/specs/browser-tool-settings.e2e.ts`
  — 2/2 (`browser.log`). Три кисти, Undo/Redo, отмена, четыре compact controls,
  RU/EN × light/dark при 1024 px; screenshots просмотрены. Начальный timeout
  устранён ожиданием окончания закрытия popover в helper; отмена держит pointer
  через `perform(true)`, иначе WebDriver сам отпускал кнопку до Escape.
- `XDG_SESSION_ID=brushes-e2e PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_DRIVER_PROVIDER=external CUTE_SCREEN_E2E_SCENARIOS=brushes,brushes-reopen pnpm test:e2e:tauri`
  — оба сценария passed (`native.log`). Чистый профиль, production fake Capture →
  Quick → Editor, три кисти в обеих WebView, Undo/Redo/Cancel; отдельный запуск
  восстановил шесть штрихов и expressive default. Перед вводом после handoff
  helper ждёт enabled Pencil; ожидания одного стабильного canvas недостаточно.
- `pnpm tauri build --debug --no-bundle` — exit 0 (`build-production.log`),
  обычная production сборка без fake-platform/test-harness.
- `pnpm audit:licenses` — exit 0 (`licenses.log`), MIT dependency разрешена;
  `pnpm audit:security` — exit 0, один low advisory (`security.log`).

Границы общих проверок в общем изменяемом workspace:

- Первый `pnpm test --maxWorkers=2` после исправления ожиданий — 765/765.
  Промежуточный прогон после параллельных text-font изменений: 783 passed,
  1 failure в `text-context-toolbar.test.ts` (background focus), `unit.log`.
  Финальный `pnpm test --maxWorkers=2` — 106 files / 788 tests, exit 0
  (`unit-final.log`).
- Последний `pnpm test:render` — 23 passed, 1 failure в кириллическом сценарии
  `golden-text-fonts.test.ts`, `render.log`. Brush goldens прошли отдельно.
- `pnpm format`, `pnpm check`, `pnpm format:check` запускались. Последний check
  остановился на max-len в `TextFontPicker.vue`, `golden-runtime-test-kit.ts`
  и `golden-text-fonts.test.ts`; эти параллельные изменения не исправлялись
  в задаче кистей. Логи — `format.log`, `check.log`, `format-check.log`.
  `ink-lint.log` содержит отдельный lint изменённых модулей кистей.

Windows/WebView2, macOS/WKWebView и физический планшет не проверялись.

Финальное уточнение: `browser-final.log` — 1/1 с обновлёнными миниатюрами,
`native-final.log` — повтор обоих production сценариев с `isTrusted` именно
canvas pointerdown, оба passed. `e2e-typecheck.log` — exit 0.
`typecheck-final.log` останавливается только на `exact` в ByRoleOptions
параллельного `text-context-toolbar.test.ts`; package/frontend build прошли.
Последний `pnpm format` после обновления общего workspace оставил один max-len
в `golden-text-fonts.test.ts`; прежние три строки уже исправлены параллельно.

Финальный `pnpm format:check` — exit 0 (`format-check.log`), `pnpm docs:check` —
exit 0 (`docs.log`), `git diff --check` — exit 0. Повтор общего `pnpm check`
(`check-final.log`) остановился на структурных переносах и max-len в новом
параллельном `browser-text-fonts.e2e.ts`. Повтор `pnpm test:render`
(`render-final.log`) — 23/24, тот же кириллический text-font failure.
Кисти во всех этих прогонах прошли; незавершённые проверки текстовой задачи
не считаются доказательством неработоспособности кистей и не объявляются passed.

## Панель «Скрыть данные» (2026-10-16)

`REQ-TOL-008`, `REQ-EDT-008/015/016/017`, `REQ-UI-006`. Linux x86_64,
Node 22.23.1, pnpm 10.33.2; Chrome 154.0.8037.57; WebKitGTK 605.1.15.

QA inventory: три видимых эффекта и их selected/mixed states; две формы с
пояснениями; visual presets, нестандартное значение, точный ввод и slider;
цвет/палитра/eyedropper routing; переключение меню, Escape и возврат фокуса;
locked/read-only/empty/loading; defaults/configure/selection; atomic group
update, draft cancel, undo/redo; доступность Select и Quick → Editor.
Off-happy-path: mixed effects без параметра; отмена незавершённого ввода
без изменения defaults/history; переход locked во время открытого меню.
Функциональные checks — censor-toolbar Vue, существующие M08 и browser/native
сценарии. Visual checks — полные подписи/миниатюры, отсутствие clipping и
доступность controls в RU/EN × light/dark × DPR 1/2 × 1024×700/1440×900.

Evidence: `artifacts/censor-toolbar/`, включая browser toolbar/preset screenshots
и `native-quick.png`, `native-editor.png`. Начальный общий запуск unit/render
совпадал с другими CPU-heavy jobs и дал timeouts; rich-text golden менялся в
параллельной задаче. Повтор с ограниченным числом workers: `pnpm test --maxWorkers=2`
— 108 files / 802 tests passed; `pnpm test:render --maxWorkers=1` — 7 files /
24 tests passed, включая decoded precision PNG на 1×/2×.

`CUTE_SCREEN_BROWSER_E2E_PORT=5203 pnpm test:e2e:browser --spec tests/e2e/specs/browser-m08-3.e2e.ts --spec tests/e2e/specs/browser-m08-5.e2e.ts`
— 2/2.
`CUTE_SCREEN_BROWSER_E2E_PORT=5205 pnpm test:e2e:browser --spec tests/e2e/specs/browser-censor-toolbar.e2e.ts`
— финальные 5/5: вся visual matrix плюс lifecycle, Tab → Enter на пресете,
точный ввод, cancel, undo/redo, solid colour и configure → Select. Скриншоты
светлой/тёмной темы и native surfaces просмотрены; в тёмной теме исправлен
контраст текста активного пресета.

Focused Vue: четыре затронутых файла — 20/20; после исправления Enter и
focus — `pnpm exec vitest run --project vue tests/unit/vue/censor-toolbar.test.ts --maxWorkers=1`
8/8. Enter на preset обрабатывается локально до числового commit-handler,
повторная native activation подавляется. UI icon boundary расширен ровно на
два компонента параметрических previews, аналогично существующим previews
стрелок/фигур; общие UI icons продолжают проходить через UiIcon.
Финальные `pnpm format`, `pnpm format:check` и общий `pnpm check` — exit 0.
Последний включает lint/typecheck, docs/format/boundaries, IPC и Rust fmt/clippy;
исходные unrelated lint warnings остаются warnings, новых lint errors нет.

`CUTE_SCREEN_E2E_SCENARIOS=censor-toolbar CUTE_SCREEN_E2E_DRIVER_PROVIDER=embedded pnpm test:e2e:tauri`
— WebKitGTK 1/1, production Capture → Quick → Editor, preset/region menus и
возврат в Select. Финальный повтор без override:
`CUTE_SCREEN_E2E_SCENARIOS=censor-toolbar pnpm test:e2e:tauri` — exit 0, 1/1. Встроенный driver проверяет реальные WebViews с DOM input;
это не доказательство физических PointerEvent-жестов. Попытка external provider
не создала WebDriver session (`No browserName ... nor hostname or port found`),
до test body. Сценарий использует штатный platform default: embedded на Linux,
external на Windows. Физический capture и Windows/macOS этим прогоном не подтверждаются.

Для controlled numeric inputs browser-сценарий использует существующий
`setNumericInput` (Ctrl+A → typing). WebDriver clearElement/setValue вызывал
промежуточный сброс поля и дописывал цифры к старому значению; это не использовалось
как доказательство обычного пользовательского ввода.

## Text sizing, wrapping and focus repair (2026-10-16, ADR-062)

Platform: Ubuntu 24.04.5 LTS, x86_64, X11; Linux 6.8.0-142-generic;
Node 22.23.1, pnpm 10.33.2; Chrome 154.0.8037.57. Research articles and upstream
issues are linked in [TEXT_LAYOUT_RESEARCH.md](TEXT_LAYOUT_RESEARCH.md).
No third-party editor implementation was copied. Concurrent Censor toolbar and
numbered-marker cursor changes in the working tree were preserved.

Red-first evidence in `artifacts/text-layout/`:

- `red-renderer.log`: two failures exposed isolated-character width sums and
  splitting combining/ZWJ graphemes.
- `red-core.log`: resize ignored supplied real-font text-height metrics.
- `red-focus.log`: deferred blur committed a draft after focus had returned.
- `red-faces.log`: opening a non-Roboto document did not preload its B/I faces.

The repair uses the shared renderer line layout for DOM soft breaks, real
browser-font bounds on creation/style/clipboard paste and resize, an initial
480 document-px cap, and unrestricted subsequent manual width. Soft breaks keep
source whitespace and UTF-16 offsets. Existing autoSize mode is preserved.
Cyrillic/Latin CanvasKit measurement now resolves the same subset chunks used
for drawing. `styles.ts` was split into focused helpers; architecture budgets
were not increased. The only updated golden is `rich-text-v7-canvas2d.png`:
whole-fragment kerning changes subpixel alignment. Before/after PNGs were viewed
(`rich-text-before.png`, `rich-text-after.png`); CanvasKit golden is unchanged.

Verification commands and artifacts:

- `pnpm format` — `format-final.log`; `pnpm check` — `check-final.log`, including
  formatting, typecheck, architecture, IPC, Rust format and Clippy configurations.
- `pnpm test --maxWorkers=2` — `unit-final.log`, 805/805. The final family-preload
  regression also passed in `fonts-final.log` (12/12 focused tests).
- `pnpm test:render --maxWorkers=1` — `render-final.log`, 24/24, including all
  12 real Fontsource faces, Latin/Cyrillic, B/I and decoded Canvas2D/CanvasKit PNG.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5185 pnpm test:e2e:browser --spec tests/e2e/specs/browser-text-layout.e2e.ts --spec tests/e2e/specs/browser-text-fonts.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-editing.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts --spec tests/e2e/specs/browser-m08-2.e2e.ts`
  — `browser-final.log`, 5/5 files, 12/12 scenarios. Covers long unbroken
  Cyrillic, measured widths for all fonts, soft-line reopen, range formatting,
  IME/paste, mixed container semantics, crop/width reflow, undo/redo, and
  RU/EN × light/dark × 640/1024/1440 toolbar geometry. The new layout spec also
  uses a 2560×1440 canvas and stretches beyond the initial 480 px.
- Screenshots reviewed: `artifacts/browser-e2e/text-long-word.png`,
  `text-manual-width.png`, `text-background-fit-{640,1024,1440}.png` and the
  existing twelve theme/locale/width text-toolbar screenshots. Inline toolbar
  now uses viewport bounds instead of shrinking to the width of a tiny image.
- `pnpm audit:licenses` — `licenses.log`, permissive policy passed for 21
  production packages. `pnpm audit:security` — `security.log`, exit 0 at the
  configured high threshold; one low advisory remains. No dependencies changed.

After the final document-family B/I preload change, the new four layout scenarios
passed again (`browser-fonts-final.log`). The twelve-family roundtrip hit the
30-second Mocha deadline while unit/typecheck/Clippy ran concurrently, without
an assertion failure. An isolated stable-command rerun of
`browser-text-fonts.e2e.ts` passed 2/2 in 18.6 seconds
(`browser-fonts-isolated.log`). `pnpm check` completed successfully, including
all 43 boundary tests; the final unit run passed 805/805. Existing lint warnings,
jsdom canvas-not-implemented notices and bundle-size warnings remain diagnostic.

Initial browser attempts captured a deferred-blur regression and toolbar width
being constrained by a 100 px crop. They also saw HMR resets while concurrent
workspace changes rewrote CanvasWorkspace; those attempts were not counted as
passing evidence. Synthetic unit blur events were replaced with actual DOM
`blur()` so focus state matches production.

`XDG_RUNTIME_DIR=$PWD/artifacts/text-layout/runtime XDG_SESSION_ID=cutescreen-text-layout CUTE_SCREEN_E2E_SCENARIOS=v7-rich-text pnpm test:e2e:tauri`
ran the actual Tauri test build with isolated runtime/activation state
(`tauri.log`). WebKitGTK reported 605.1.15: toolbar mounted and did not scroll,
but the embedded driver's canvas gesture did not create contenteditable (0/1).
`tauri-driver` and `WebKitWebDriver` were absent from PATH. This is not native
text-editing acceptance. Windows, macOS, Wayland, physical capture and cross-DPI
runtime smoke were not run for this follow-up.

## Жизненный цикл инструментов и панелей (2026-10-16, ADR-063)

Платформа: Linux x86_64, Node 22.23.1, pnpm 10.33.2, Chrome 154.0.8037.57.
Evidence directory: `artifacts/tool-lifecycle/`.

Из production mount + creation gestures проверяются пустой canvas/background,
одиночный/мультивыбор, modifiers/pan/zoom, defaults только по configure,
повторный вызов, hotkey со сфокусированной кнопки defaults, owner-aware teleport,
последовательный Escape и внешний focus. Inline text проверяет click destination,
IME, deferred fonts, последний navigation intent, смену документа и отмену
existing/new text; чистые UI-переходы не создают command/history.
Defaults и selection используют прежние preferences и one-command style pipeline.

Команды и результаты:

- `pnpm format` — `format.log`; `pnpm format:check` — `format-check.log`.
- `pnpm check` — `check-final.log`, passed: lint/typecheck/format/docs,
  architecture boundaries 43/43, IPC check, Rust format и четыре Clippy configs.
- `pnpm test --maxWorkers=1` — `unit-final.log`, passed: 109/109 файлов, 831/831 тестов.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-lifecycle.e2e.ts --spec tests/e2e/specs/browser-tool-ux.e2e.ts --spec tests/e2e/specs/browser-tool-settings.e2e.ts --spec tests/e2e/specs/browser-censor-toolbar.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts --spec tests/e2e/specs/browser-shape-toolbar.e2e.ts`
  — `browser-all.log`, 6/6 файлов, 20/20 сценариев. Включает реальные browser
  pointer/keyboard, creation, toolbar geometry, RU/EN × light/dark, censor DPR 1/2,
  mixed/container semantics и history. Старые проверки входа в defaults переведены
  на ПКМ; проверки сохранения выделения при configure заменены очисткой selection
  при неизменном документе. Arrow geometry берётся из document dimensions,
  не из renderer backing pixels; inset сравнивается с subpixel tolerance.
- Screenshots просмотрены: `browser-selected.png`, `browser-deselected.png`,
  `browser-text-switch.png`. На пустом canvas отсутствуют selection frame,
  selection toolbar и нижний defaults chrome; ToolRail остаётся доступным.

Red-first: `red.log` — 10/11 новых сценариев воспроизводили прежнее поведение.
`cancel-existing-red.log` отдельно воспроизвёл потерю выбора при отмене текста,
открытого через Text tool; исправлено сохранением existing ID при cancel.
После focus changes проверка background outside dismissal обновлена: Escape
возвращает focus, outside pointer сохраняет focus цели клика. Промежуточный
параллельный unit-прогон получил один 5 s timeout в content-image test во время
native build; проверки не ослаблялись, финальный прогон выполняется с одним worker.
Предупреждения jsdom canvas, существующие ESLint warnings и bundle size не скрыты.

### Настоящий Tauri: диагностика и исправление конфигурации

Ubuntu 24.04.5 / X11, WebKitGTK 2.52.6, wry 0.55.1, external tauri-driver.
Первоначальный `tauri-final.log` (embedded, 0/2) воспроизводил ограничения
`tauri-plugin-wdio-webdriver 1.3.0`, а не ошибку открытия defaults в редакторе:
`dispatch_pointer_event` создаёт MouseEvent без contextmenu/PointerEvent;
`dispatch_key_event` для специальных клавиш, включая F10, не передаёт shiftKey.
Драйверы отсутствовали в PATH, но уже находились в `artifacts/spotlight-fix/tools/`.

В runner для tool-lifecycle явно выбран external provider. После handoff тест
ждёт enabled Arrow и document.hasFocus, затем начинает ввод; стабильные размеры
canvas сами по себе не подтверждают готовность нового окна. Keyboard contract
прошёл в обеих WebViews (`tauri-external-focus.log`, 1/2 всего).

Оставшийся отказ ПКМ локализован записью настоящих событий:
right pointerdown → right mousedown → contextmenu → **left mouseup → left click**
по Arrow, все isTrusted=true. Лишний левый click выполнял предусмотренную
контрактом повторную активацию и закрывал defaults. `skipRelease` не помог;
прямая W3C action chain дала тот же результат (`tauri-external-balanced.log`,
`tauri-external-actions.log`, `native-input-webdriver.json`). Поэтому это не
исправляется подавлением обычных click в продукте.

На Linux с XDG_SESSION_TYPE=x11 runner выбирает contextInput=x11: установленный
системный xdotool делает настоящий ПКМ в центре кнопки в сфокусированном окне.
Остальные pointer/keyboard действия остаются WebDriver. На других системах
сохраняется contextInput=webdriver. Для диагностики можно явно задать
CUTE_SCREEN_E2E_CONTEXT_INPUT=x11 или webdriver; x11 требует xdotool и X11.
Driver provider и context input выводятся в лог. Новых package dependencies нет.

Команды follow-up из корня репозитория:

- `XDG_RUNTIME_DIR="$PWD/artifacts/tool-lifecycle/runtime" XDG_SESSION_ID=cutescreen-tool-lifecycle-external PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_SCENARIOS=tool-lifecycle pnpm test:e2e:tauri`
  — `tauri-verified.log`, 2/2; automatic external/X11 mode. Первый успешный прогон с
  явным CUTE_SCREEN_E2E_CONTEXT_INPUT=x11 — `tauri-external-x11.log`, 2/2.
- Native проверяет Shift+F10/reopen/Escape/hotkey в Quick и Editor, production
  handoff, ПКМ, вложенный stroke menu, создание стрелки и снятие выделения пустым
  кликом. isTrusted=true проверяется у keyboard/contextmenu/canvas pointerdown.
  `native-input.json` сохраняет последовательность событий, focus и enabled/pressed
  состояния. Native screenshots просмотрены: `native-quick-keyboard.png`,
  `native-editor-keyboard.png`, `native-editor-selected.png`, `native-editor-deselected.png`.
- `pnpm exec eslint scripts/run-tauri-e2e.mjs tests/e2e/specs/tauri-tool-lifecycle.e2e.ts tests/e2e/tool-lifecycle.ts`
  — `diagnosis-lint.log`; `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`
  — `diagnosis-typecheck.log`.
- `pnpm exec vitest run --project boundaries tests/boundaries/tauri-runner.test.ts`
  — `diagnosis-runner.log`, 2/2: failed fixture/build не запускает старый binary.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-lifecycle.e2e.ts`
  — `browser-diagnosis.log`, 2/2 после изменения общего input helper.
- `pnpm format` — `diagnosis-format.log`; `pnpm format:check` — `diagnosis-format-check.log`;
  `pnpm check` — `diagnosis-check.log`.

Скриншоты и логи — `artifacts/tool-lifecycle/`; стандартные failure screenshots —
`artifacts/tauri-e2e/`. Windows/macOS, Wayland, physical capture и mixed-DPI native
input не запускались. Document v7, binary image transport и IPC не менялись.

## Номерная метка и внешняя подпись — 2026-10-17 (ADR-066/067/068)

Платформа: Ubuntu 24.04.5, Linux 6.8.0-142 x86_64 / X11, Intel i7-11700K.
Browser: Chrome 154.0.8037.57. Native: настоящий Tauri/wry 0.55.1 / WebKitGTK,
external driver; источник Capture — fake-platform, окна и production mount/handoff
настоящие. Windows/macOS, Wayland, physical capture и mixed-DPI не запускались.
Artifacts находятся в `artifacts/numbered-marker/`; прежние изменения Text,
Callout и physical shortcuts сохранены.

Уточнение пользователя заменило custom text внутри badge внешней подписью:
номер всегда внутри, multiline caption справа с gap 8 px и вертикальным центром.
Номер и caption перемещаются одним слоем; caption не увеличивает badge и не
меняет sequence. Пустой commit/Remove label удаляют только подпись. Числовая
подпись тоже допустима и не перенумеровывает объект. v7/IPC не расширены:
первый paragraph существующего label содержит номер, следующие — caption.
Открытие старых документов не создаёт EditorCommand и не меняет bounds.

Команды и результаты из корня репозитория:

- `pnpm check` — `check.log`, passed: lint/typecheck/format/docs,
  boundaries 43/43, IPC, Rust format и четыре Clippy configurations.
- `pnpm test --maxWorkers=1` — `unit.log`: 112/112 файлов, 863/863 теста.
  Includes max+1, hidden/locked/duplicates, safe integers, manual next/reset,
  cancellation without consumption, edit/undo/redo, mixed/read-only, separate
  caption, renumber preserving caption and empty caption retaining the marker.
- `pnpm test:render` — `render.log`: 9/9 файлов, 30/30 тестов. Все четыре формы,
  1/10/100, font 16/48, multiline Cyrillic; white number pixels внутри safe rect,
  black caption pixels внутри отдельной внешней области. Оба PNG backend
  повторно декодированы; Canvas2D preview/export совпадают пиксельно.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-numbered-marker.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts`
  — `browser.log`, 2/2 файлов, 10/10 сценариев. Marker harness 2560×1440;
  production controls/pointer/keyboard, no state injection for marker creation.
  Проверяет cancellation, manual 10→11, edit 100/undo, external caption/remove,
  caption hit/drag together/undo, independent badge/label colours, nested font
  menu and focus, overlay pixels после square/blue→diamond/red, cursor none,
  pan/settings hiding, zoom 50/100/200, RU/EN × light/dark × 640/1024/1440.
- Дополнительный прогон `CUTE_SCREEN_BROWSER_E2E_PORT=5186 pnpm test:e2e:browser --spec tests/e2e/specs/browser-numbered-marker.e2e.ts --spec tests/e2e/specs/browser-creation-cursors.e2e.ts --spec tests/e2e/specs/browser-v7-rich-text-toolbar.e2e.ts --spec tests/e2e/specs/browser-tool-lifecycle.e2e.ts`
  — `browser-regressions.log`: marker 6/6, cursors 1/1 и lifecycle 2/2 прошли.
  Старые rich-text assertions требовали общую панель и disabled padding у метки;
  они обновлены под специализированную панель без этих controls и затем прошли
  в финальном `browser.log` (4/4). Параметры и ожидания Text/Callout сохранены.
- `XDG_RUNTIME_DIR="$PWD/artifacts/numbered-marker/runtime" XDG_SESSION_ID=cutescreen-numbered-marker PATH="$PWD/artifacts/spotlight-fix/tools/bin:$PWD/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CUTE_SCREEN_E2E_SCENARIOS=numbered-marker pnpm test:e2e:tauri`
  — `tauri.log`: 1/1 scenario. Capture → Quick: создать 1, Next=2;
  handoff Editor: Next=2, создать 2, изменить на 7, undo→2; добавить caption,
  убедиться, что Number=2, undo убирает только caption. Test binary собран штатно.

Red-first артефакты: `caption-red.log` (не было контракта отдельной подписи),
`cancel-red.log` (pointerdown раньше уже добавлял слой при последующей отмене).
Один промежуточный full unit run завершил 111 файлов и получил unexpected
worker exit (`unit-worker-exit.log`); финальный полный прогон выполнен отдельно
от browser/native build и прошёл без ослабления проверок. Первый native запуск
без drivers в PATH не создал session (`tauri-no-drivers.log`); использованы уже
имеющиеся локальные executables, повторный production WebView flow прошёл.

Визуально просмотрены `caption-beside-number.png`, `external-caption.png`,
`inline-label.png`, `native-editor.png`, `ru-light-1024.png`, `ru-dark-640.png`.
Caption находится снаружи, toolbar не закрывает редактируемый текст, panel groups
переносятся без horizontal overflow. В palette browser тестах выбор scoped к
активному dialog: предыдущая palette может оставаться в DOM во время fade-out.
Обычные jsdom Canvas warnings, существующие lint warnings и bundle-size warning
не скрывались. Perf/заключительные format команды записаны ниже.

- `pnpm test:perf` — `perf.log`, 4/4; 30 warmups + 120 measurements на scenario,
  idleFrameCount=0. Отчёт скопирован в `perf.json`.
  Software CanvasKit p95: 4K/500 — 174.81 ms, 8K/1000 — 339.47 ms.
  Это trend/evidence harness, не подтверждение production GPU frame budget.
- `pnpm format` — `format.log`; `pnpm format:check` — `format-check.log`.
  Заключительный `pnpm check` — `check.log` (после записи verification docs).

## Глобальные сочетания и автозапуск (2026-10-17, ADR-070)

Host: Ubuntu 24.04.5 LTS, x86_64, X11; настоящий Tauri / WebKitGTK 605.1.15,
Chrome 154. Num Lock включён, активна RU layout. Результаты и логи собраны в
`artifacts/activation-settings/`; UI screenshots — `activation-settings.png`
и `activation-settings-native.png` в browser/tauri-e2e artifacts.

- `pnpm test`: 113 файлов, 886 проверок. Включены 10 Settings tests: consent
  default/confirm/cancel, installer choice, recorder/blur/IME/AltGr/repeat,
  сохранение старого назначения и persistence error, loading/retry,
  portal configuration, ожидаемая отмена и переход к system approval в первом
  запуске без преждевременного изменения выбора автозапуска. Red regression:
  `activation-approval-red.log`.
- `cargo test --workspace`: 124 desktop, 1 IPC codegen и 21 storage test.
  Shortcut tests проверяют staged replacement, conflict, дубли и persistence
  rollback; Gio memory-backend — foreign paths, staging/cancel, restart cleanup
  и external changes. Desktop Exec, TryExec, Windows quoting и moved path
  проверяются отдельно. `activation-path-red.log` фиксирует падение до
  исправления TryExec escaping; `activation-path-green.log` — успешный повтор.
  Отдельный red/green regression сохраняет Super chords для Linux: Windows-only
  запрет системных Win-комбинаций не распространяется на X11/GNOME.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5197 pnpm test:e2e:browser --spec tests/e2e/specs/browser-activation-settings.e2e.ts`:
  first-run checkbox, отказ, recorder, conflict/cancel/remove и отсутствие overflow.
  Используется явный `settingsHarness=1`, это UI fixture bridge.
- `TAURI_WEBDRIVER_PORT=4545 CUTE_SCREEN_CAPTURE_DEBUG=1 CUTE_SCREEN_E2E_SCENARIOS=activation-settings,activation-reopen,activation-capture pnpm test:e2e:tauri`:
  финальный прогон: 3/3 файлов, 4/4 сценариев; отдельный singleton Settings
  через repeated CLI, назначение из recorder,
  physical X11 activation из скрытого Editor и relaunch до открытия Settings.
  `activation-capture` не включает fake-capture flag: реальный frozen desktop
  не меньше 1280×720, физический drag → Editor, `Image.decode()` оригинала
  через binary IPC. Размер декодированного PNG совпадает с подтверждённой областью;
  JSON evidence содержит только размеры/диагностику, без image bytes/base64.
  Локальный frozen frame — 1920×1080, выбранная область и decoded PNG — 980×551.
  После скрытия Editor тест ждёт native unmap перед системным нажатием.
- `pnpm check`, `pnpm format`, `pnpm format:check`, `cargo fmt --all`:
  финальные логи сохраняются рядом с evidence. Check включает четыре Clippy
  configurations, IPC freshness, lint/typecheck/docs/boundaries/format.
- `NSISDIR=/tmp/cutescreen-nsis-validation/root/usr/share/nsis /tmp/cutescreen-nsis-validation/root/usr/bin/makensis -WX -V3 /tmp/cutescreen-nsis-validation/activation-hook-smoke.nsi`:
  hooks компилируются без warnings в standalone syntax harness. NSIS 3.09
  распакован из Ubuntu packages в `/tmp`, система не устанавливалась/не менялась.
  Полный NSIS installer на Windows этим не проверен.

Промежуточные native failures отражены в диагностических логах: test config
не разрешал закрытие Settings, обращение WebDriver к уже закрытому окну,
раннее отображение prewarmed Quick и input до native focus/окончательного resize.
Проверка теперь выбирает живой main context, ждёт frozen frame/layout и native
focus, использует X11 geometry. Падение с произвольным минимальным размером crop
заменено точным сравнением подтверждённой области и повторно декодированного PNG;
минимальный размер настоящего frozen desktop проверяется независимо.

Pending: Ubuntu 22.04/24.04 Wayland/GSettings, GNOME 48+/KDE portal configure,
permission revocation/restart; Windows 10/11 full installer/runtime и system
startup disable; macOS 12/13+ обеих архитектур; физическая RU/EN/AltGr/Caps/hold
матрица на всех ОС; реальный logout/login, upgrade и оба consent choices.
MSVC cross-check в Linux не прошёл инфраструктурно: bundled SQLite требует
отсутствующий `lib.exe`; Apple SDK в окружении отсутствует. Наличие кода,
serializer/memory tests и NSIS syntax harness не заменяет эти доказательства.

Локальная пакетная сборка: `pnpm tauri build --debug --bundles deb` — passed,
`target/debug/bundle/deb/Cute Screen_0.0.0_amd64.deb`; `dpkg-deb --field`
подтвердил package cute-screen, version 0.0.0, architecture amd64. Это debug
DEB без test-harness; release/AppImage/NSIS/DMG builds и установка/login acceptance
не подменяются этим результатом. Визуально проверен Settings screenshot после
исправления контраста native select; системный GTK appearance больше не
перекрывает цвета элементов.

## Навигация настроек и запись сочетаний в строке (2026-10-17, ADR-075)

Среда: Ubuntu 24.04.5 x86_64, X11, Chrome 154.0.8037.57 и Tauri
WebKitGTK 605.1.15. Логи этой работы — `artifacts/settings-ux/`.

- Red-first: `cargo test -p cute-screen-desktop --lib settings_entry_points_select --no-default-features`
  остановился на отсутствующем settings_query (`rust-red.log`); mounted
  settings-navigation tests до реализации — 3 failures (`vue-red.log`).
- `pnpm exec vitest run --project vue tests/unit/vue/activation-settings.test.ts tests/unit/vue/settings-navigation.test.ts tests/unit/vue/settings-recorder.test.ts`:
  25/25. Проверяются production mount, immediate recorder, Esc/focus, Tab/blur,
  delayed lease/probe, unchanged/duplicate bindings, ошибки probe/storage,
  menu keyboard navigation, timeout и показ staged GNOME combination.
- `pnpm test`: 118 файлов, 951 проверка, passed (`test.log`).
- `cargo test --workspace`: passed (`cargo-test.log`), включая новый entry-point
  contract и существующие transaction/GNOME ownership tests.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5234 pnpm test:e2e:browser --spec tests/e2e/specs/browser-activation-settings.e2e.ts`:
  сценарии consent/assign/conflict/cancel/menu и RU/EN × light/dark ×
  820×720/620×520. Размер browser chrome компенсируется, так что проверяются
  именно размеры viewport. Screenshot names: `settings-inline-*`,
  `settings-general.png`, `settings-actions.png`, `settings-candidate.png`.
- Native entry: `settings_runtime_dir=$(mktemp -d /tmp/cs-settings-ux.XXXXXX)`
  затем `XDG_RUNTIME_DIR="$settings_runtime_dir" TAURI_WEBDRIVER_PORT=4545 CUTE_SCREEN_CAPTURE_DEBUG=1 CUTE_SCREEN_E2E_SCENARIOS=activation-settings,activation-reopen,activation-capture pnpm test:e2e:tauri`.
  Выделенный runtime изолирует activation socket от обычного экземпляра;
  app-data остаётся изолированным штатным runner. Реальное DBusMenu выбирается
  по PID, проверяет единственный пункт настроек и вызывает его через Event.

Промежуточные ограничения отражены в `native-first.log` и
`native-shared-runtime.log`: capture test кликал disabled footer до завершения
сохранения; теперь он ждёт доступности кнопки. При параллельно открытом обычном
экземпляре общий XDG_RUNTIME_DIR приводил к activation endpoint unavailable;
выделенный временный runtime не требует закрытия пользовательского приложения.
Browser и native input suites запускаются последовательно.

Windows/macOS и GNOME/KDE Wayland runtime в этой работе не проверяются;
mounted portal/manual/GNOME UI и Rust memory-backend tests не заменяют эти
проверки. Автозапуск, login и установка не получают новых supported claims.

Финальный native прогон с выделенным runtime: **3/3 spec, 5/5 сценариев**
passed (`artifacts/settings-ux/native.log`). Frozen desktop 1920×1080;
выбранная область 419×577 совпала с повторно декодированным PNG
(`artifacts/tauri-e2e/activation-capture-decoded.json`, invocationSource hotkey,
terminalOutcome captured). Просмотрены `settings-native-recording.png` и
`settings-native-general.png`: recorder у выбранного действия, постоянная
навигация и footer, General открывается из настоящего tray DBusMenu.

`pnpm check` — passed (`check.log`): lint/typecheck/format/docs/boundaries,
IPC freshness и четыре Clippy-конфигурации. `pnpm format`,
`pnpm format:check` и `cargo fmt --all` выполнены; финальная проверка Markdown
links — `pnpm docs:check`. Browser — 2/2 сценария, восемь сочетаний
locale/theme/viewport, включая проверку видимости всего inline editor.
Просмотрены native и browser screenshots; нативный checkbox получил явные
border/checked/focus состояния, чтобы GTK appearance не скрывал рамку.
Меню допускает стрелки, Escape с возвратом фокуса и Tab к следующей строке.

`pnpm tauri build --debug --no-bundle` — passed (`build.log`): обычный Linux
debug executable `target/debug/cute-screen`, без test-harness features.
Сборка не подтверждает установку пакета или release/platform support.

## Форма скрытия данных только до рисования (2026-10-17, ADR-077)

Linux x86_64 / X11, Node 22.23.1, pnpm 10.33.2, Chrome 154.0.8037.57.
Evidence — `artifacts/censor-toolbar/creation-only-*`.

- Red-first `pnpm exec vitest run --project vue tests/unit/vue/censor-toolbar.test.ts --maxWorkers=1`:
  6 failed / 7 passed до изменения production code (`creation-only-red.log`).
- `pnpm exec vitest run --project vue tests/unit/vue/censor-toolbar.test.ts tests/unit/vue/m08-precision-drawing.test.ts tests/unit/vue/m08-precision-history.test.ts tests/unit/vue/m08-precision-settings.test.ts --maxWorkers=1`:
  4 файла / 34 проверки passed (`creation-only-vue.log`). Rectangle/freeform,
  mixed group, locked/read-only, прямой no-op resolver, меню/focus/Escape,
  эффект, параметр и undo/redo без изменения geometry.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5227 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-censor-toolbar.e2e.ts`:
  9/9 passed (`creation-only-browser.log`). Trusted pointer drawing обеих форм,
  сохранность предыдущего объекта и undo/redo; RU/EN × light/dark при 1024 px,
  прежняя defaults/menu matrix при 1024/1440 px и DPR 1/2. Просмотрены PNG
  `creation-only-ru-light-rectangle.png` и `creation-only-ru-dark-freeform.png`.
- `pnpm format` выполнен. Общий `pnpm check` прошёл lint, typecheck, format/docs,
  затем остановился на двух boundary checks параллельной работы над линейкой:
  `ToolFormattingToolbar.vue: 546 > 500` и complexity 21/20 в precision-ruler
  (`creation-only-check-shared-failure.log`). Ограничения не ослаблялись.
- Последний `CUTE_SCREEN_E2E_SCENARIOS=censor-toolbar pnpm test:e2e:tauri`
  в общем checkout не дошёл до WebView: Rust history.rs из параллельной работы
  не собирался (E0277/E0499/E0502, `creation-only-tauri.log`). Старый binary
  не использовался. Ранее external WebKit Actions доставлял MouseEvent без
  PointerEvent; input trace сохранена. X11 route использует системный xdotool,
  требует trusted pointerdown и не подменяет DOM события или scene graph.

Для отделения результата от параллельных изменений создана временная рабочая
копия от `647cc8a5d10b858604a2007ba62d3b7cc908bb85`. Три production-файла
CensorFormattingToolbar/precision-censor/censor-toolbar.css, censorSchema и
четыре test-файла совпадают с общим checkout: SHA-256 и сравнение —
`creation-only-isolated-sources.json`. В копии повторные Vue checks — 34/34
(`creation-only-isolated-vue.log`). Native input в изолированной копии также не доставил pointerdown
(только trusted mousedown/pointerup/mouseup); это не считается доказательством
рисования. Native regression получает явный pending только при отсутствии
pointerdown; ошибки geometry/effect/undo по-прежнему проваливают проверку.
Результаты общего checkout не заменяются изолированными.

Изолированная native-команда:
`XDG_RUNTIME_DIR=/home/vladimir/remote/cutescreen/artifacts/censor-toolbar/runtime XDG_SESSION_ID=cutescreen-censor-isolated PATH="/home/vladimir/remote/cutescreen/artifacts/spotlight-fix/tools/bin:/home/vladimir/remote/cutescreen/artifacts/spotlight-fix/tools/webkit/root/usr/bin:$PATH" CARGO_TARGET_DIR=/home/vladimir/remote/cutescreen/target CUTE_SCREEN_E2E_SCENARIOS=censor-toolbar pnpm test:e2e:tauri`.
Лог — `creation-only-isolated-tauri.log`, input trace —
`creation-only-native-quick-rectangle-input.json`.

Финальная изолированная native-команда — exit 0: 1 UI scenario passed
(Capture → Quick → Editor, меню/presets/focus/Select), новый pointer creation
scenario — 1 pending из-за отсутствия pointerdown. Это не native acceptance
рисования. Лог и trace выше; native PNG меню также сохранены как
`creation-only-isolated-native-quick.png` / `creation-only-isolated-native-editor.png`.

Финальные общие `pnpm format` / `pnpm format:check` блокируются длинными строками
параллельной работы в history/previews.ts, history/thumbnail.worker.ts и
RulerMeasurementSettings.vue (логи `creation-only-format*.log`). Собственные
TS/Vue файлы прошли focused ESLint formatting check. Markdown отформатирован
штатной командой; границы архитектуры и форматирование не ослаблялись.

Повторный browser smoke после сохранения финального native pending-контракта:
`CUTE_SCREEN_BROWSER_E2E_PORT=5227 CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-censor-toolbar.e2e.ts --mochaOpts.grep 'chooses shapes only before pointer creation in en/light'`
— остановился до canvas mount на параллельном изменении App.vue: обращение
к `navigator.language` из template вызывает render error (`creation-only-browser-final.log`).
Ранний полный 9/9 browser pass остаётся отдельным evidence snapshot; последнее
состояние общего App не объявляется прошедшим browser acceptance. Последний
format:check также включает длинную строку в новом history/HistoryPopover.vue.
Временная рабочая копия после сохранения PNG/logs/source hashes архивирована.

## Компактная история снимков · ADR-078 · 2026-10-17

Платформа: Ubuntu 24.04.5 x86_64, Linux 6.8.0-142, X11,
Chrome 154.0.8037.57 и настоящий Tauri WebKitGTK 605.1.15.
Исходные изображения проходят binary IPC; scene и SQLite не подготавливаются
через test facade для native acceptance. Подменяется только capture backend:
он отдаёт production-like `ui-4k.png` (3840×2160). Это evidence редактора,
хранения и переключения, а не физического захвата экрана.

- `pnpm test --maxWorkers=1`: 122 файла / 984 проверки passed.
- `pnpm test:render`: 11 файлов / 33 проверки passed. Новый decoded PNG test
  проверяет crop 2048×1024 → 256×128 и пиксели цензуры на 4K source.
- `pnpm test:perf`: 2 файла / 6 проверок passed. Controlled software CanvasKit
  results сохранены отдельно; это не reference-hardware acceptance ADR-020.
- `cargo test --workspace`: desktop 125, codegen 1 и storage 31 passed.
  Новые contracts: cursor pagination, last opened, viewport, legacy consent,
  count/age/byte limits, shared blobs, incomplete legacy reference index,
  stale cleanup plans, revision previews и recovery на трёх persistent boundaries.
  SQLite catalog fixture содержит 1000 кадров с общим реальным 4K blob;
  после очистки проверяется metadata-only page даже без source files.
  Byte-boundary fixture проверяет metadata accounting; physical unlink/recovery
  проверяется отдельными тестами на настоящих файлах.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 pnpm test:e2e:browser --spec tests/e2e/specs/browser-history.e2e.ts`:
  3 passed. Дополнительно тот же browser command с
  `--spec tests/e2e/specs/browser-activation-settings.e2e.ts`: ещё 2 passed.
  Каталог 1000 записей, ≤18 mounted cards, worker previews, keyboard/
  Escape/focus, settings/legacy cancel, RU/EN, dark/light,
  1600×1000, 1280×720 и 1024×700. Это browser fixture bridge.
- Native-команда: `CUTE_SCREEN_E2E_SCENARIOS=history,history-reopen,history-delete pnpm test:e2e:tauri`.
  Общий isolated profile проходит production Capture → Quick → Editor,
  реальный X11 pointer/keyboard, сохранение, binary previews, защиту,
  переключение, fresh Undo, relaunch и preview/cancel/delete до пустого экрана.
  Soak выполняет 20 warmup + 200 переключений через UI и измеряет суммарный
  RSS приложения и его дочерних процессов; это не жёсткий лимит RSS.

Артефакты: `artifacts/history/` (команды, red/green и fault evidence),
`artifacts/browser-e2e/history-*.png`,
`artifacts/tauri-e2e/history-native.png` и `history-soak.json`.
Просмотрены browser и native screenshots. Ранние замечания других срезов о
несобирающемся history.rs относятся к промежуточному состоянию checkout.
Полные существующие browser/native suites этим focused прогоном не объявляются
прошедшими. Windows/macOS/Wayland runtime для нового среза остаётся pending.
M09 целиком не завершён: series management/search и pin windows вне среза.

Финальные `pnpm check` и `pnpm format:check` passed; Rust Clippy прошёл
обычную, fake-platform/test-harness, x11-capture и all-features конфигурации.
`pnpm tauri build` создаёт Linux DEB и AppImage; итоговый лог сохраняется рядом
с остальными evidence. Финальный native run: 3/3 passed, включая изменённый
crop, custom zoom 110%, прокрутку и восстановление после relaunch.
За 200 переключений после 20 warmup суммарный RSS: 1208.7 МиБ → 1173.8 МиБ,
максимум 1363.2 МиБ. Это отдельная process metric, а не обещание RSS ≤256 МиБ.
Управляемые budgets проверяются LRU contracts и виртуализацией; allocator,
CanvasKit/WebKit, активный документ и переходы учитываются отдельно.
Исправлены поздний Fit поверх custom zoom (red/green) и возврат фокуса после
Escape во время асинхронного изменения защиты. У history-soak отдельный
таймаут 300 s; проверки и количество переключений не ослаблялись.

## История: overflow, крупные карточки и очистка (2026-10-17)

Среда: Linux x86_64, Chrome 154.0.8037.57. Контракт REQ-LIB-002/011/012/013,
уточнение UI в рамках ADR-078 без изменения storage/IPC/schema.

- `pnpm test --project vue tests/unit/vue/history-popover.test.ts tests/unit/vue/history-navigation.test.ts tests/unit/vue/history-document-loader.test.ts`:
  3 files / 9 tests passed. Все cursor-страницы, active/protected исключения,
  включение старых снимков в ручной preview, cancel без commit, focus на Cancel,
  успешное удаление, пустой plan, повторный review после ошибки commit и
  Escape при задержанном ответе защиты без возврата фокуса в скрытую карточку.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5198 pnpm test:e2e:browser --spec tests/e2e/specs/browser-history.e2e.ts`:
  4/4 passed; browser harness 1000 записей; две колонки, крупное превью, bounded menu у
  четырёх карточек, отсутствие горизонтального overflow, ArrowDown на два,
  прямой замок, preview/Cancel/commit 997 снимков и сохранение трёх исключений.
  RU/EN, light/dark, 1024×700, 1280×720, 1600×1000. Отдельная проверка
  прокрутки на неполную строку исключает пустой низ виртуального списка.
- Интерактивно открыты история, меню правой карточки и RU confirm в in-app
  browser, проверены screenshot и возврат к карточкам по Cancel.
- Скриншоты: `artifacts/browser-e2e/history-menu-{0,1,4,5}.png`,
  `history-clear-confirm-ru.png`, `history-cleared-ru.png`,
  `history-{light,dark}-*.png`; логи: `artifacts/history-ui/`.

Native и полный gate фиксируются ниже по фактическому завершению; browser
harness не доказывает native удаление файлов или platform capture.

Нативная команда для UI-среза:
`CUTE_SCREEN_E2E_SCENARIOS=history,history-reopen,history-delete pnpm test:e2e:tauri`.
Linux/X11, WebKitGTK 605.1.15, isolated profile и fake-platform capture через
настоящие Quick/Editor WebViews. Preview/Cancel нулевого и непустого плана,
прямое снятие/возврат защиты, explicit delete active/protected и пустая история.
Ранний прогон passed 3/3; повтор выявил гонку Escape во время protect (фокус
не возвращался к trigger). Убрана блокировка Escape для pending protection;
отдельный компонентный regression использует задержанный storage response.
Подтверждённый commit остаётся защищён от закрытия до результата.

Финальный повтор после исправления гонки: native 3/3 passed (history с
20 warmup + 200 switches, reopen и delete); browser 4/4 passed;
component/navigation/loader 3 files / 9 tests passed. `pnpm check` passed:
lint (существующие warnings), typecheck, format:check, docs links,
boundaries 10 files / 43 tests, IPC check и четыре Rust Clippy конфигурации.
Логи финального состояния — `artifacts/history-ui/{unit,browser,native,check}.log`.
Этот срез не заявляет отдельный `pnpm test:render`, полный `pnpm test`,
release `pnpm tauri build` или Windows/macOS/Wayland runtime.

## История: корзина вместо единственного пункта меню (2026-10-17)

REQ-LIB-002/013, REQ-UI-006: прямая корзина рядом с замком открывает прежний
preview/confirm; промежуточное меню и его позиционирование удалены. Cancel/Escape
возвращают focus к той же корзине. Белые Tabler SVG не имеют дополнительной
обводки или фильтра; контраст даёт отдельная мягкая тёмная подложка под значком.

Linux x86_64 / Chrome 154.0.8037.57:

- `pnpm test --project vue tests/unit/vue/history-popover.test.ts tests/unit/vue/ui-icon.test.ts`:
  2 files / 92 tests passed.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5198 pnpm test:e2e:browser --spec tests/e2e/specs/browser-history.e2e.ts`:
  4/4 passed; прямая корзина у четырёх карточек, Cancel/Escape/focus,
  очистка всех страниц и protected/active exclusions, RU/EN × light/dark.
- `pnpm check` passed. Последующее изменение подложки затрагивает только CSS;
  browser suite повторён после него. Скриншоты просмотрены:
  `artifacts/browser-e2e/history-direct-delete.png` и `history-dark-ru-1024.png`.
- Native-команда `CUTE_SCREEN_E2E_SCENARIOS=history,history-reopen,history-delete pnpm test:e2e:tauri`
  сначала остановилась до тестов: сервис не создал WebDriver session на
  `127.0.0.1:4445`. Это не assertion failure и не успешная native проверка.

Логи этого уточнения: `artifacts/history-ui-direct/`. Storage, IPC и schema
не менялись. Windows/macOS/Wayland runtime не запускались.

Повтор с отдельным activation scope:
`XDG_SESSION_ID=cutescreen-history-ui-e2e CUTE_SCREEN_E2E_SCENARIOS=history,history-reopen,history-delete pnpm test:e2e:tauri`.
Startup, history previews, protection/Escape и reopen прошли, но во время soak
WebDriver потерял соединение (`ECONNREFUSED`); delete затем не показал карточку.
Полный native gate этого уточнения не пройден. Лог сохранён как
`artifacts/history-ui-direct/native-isolated.log`; это ограничение проверки,
а не доказательство native удаления. Итоговые browser 4/4 и format:check passed.

## Полоса меню и first-run настройки (2026-10-17)

ADR-080. Windows 10, Chrome через Vite e2e harness на `127.0.0.1:5174`.

- `cargo test --manifest-path src-tauri/Cargo.toml --lib app_menu_is_not_an_in_window_title`:
  1 passed. Меню приложения ставится только для macOS; Windows и Linux не
  получают внутриоконную полосу «Cute Screen».
- `pnpm exec vitest run --project vue tests/unit/vue/activation-settings.test.ts tests/unit/vue/settings-navigation.test.ts`:
  2 files / 13 tests passed.
- Browser `/?settings=general&settingsHarness=1&firstRun=1` при 820×560 и 640×560:
  галочка автозапуска по центру строки, сноска об истории с тем же левым
  отступом, что и заголовок (24 px и 16 px). Нативной полосы меню в браузере нет;
  её отсутствие в окне Tauri проверяется перезапуском приложения. WebKit не
  проверялся.

## Export полного редактора — ADR-083 (2026-10-17)

Windows x64, настоящий WebView2 155.0.4283.45, external tauri-driver + EdgeDriver,
WDIO service/Rust plugins 1.3.0. Тестовый target отделён от resident developer
executable; app data и WebView profile изолированы штатным runner.

- До реализации `desktop-export.test.ts` воспроизвёл `export is not available yet`
  (4 failures). Затем native сценарий выявил `Canvas PNG encoding is unavailable`:
  default scratch surface в WebView2 является OffscreenCanvas, требующим
  convertToBlob. Renderer regression также сначала упал с этой ошибкой.
- `pnpm exec vitest run --project renderer --project vue packages/editor-renderer/src/browser-png-export.test.ts tests/unit/vue/desktop-export.test.ts`:
  2 files / 6 tests passed. Проверены raw bytes, cancel до write, retry и typed error.
  Лог: `artifacts/export-focused.log`; Offscreen red: `artifacts/export-offscreen-red.log`.
- `cargo test -p cute-screen-desktop --lib result_export -- --nocapture`: 3 passed.
  Обрезанный PNG с читаемым header сначала ошибочно заменял destination; regression
  упал до добавления полного decode. Теперь вход полностью декодируется до записи,
  результат — после неё. Логи: `artifacts/export-rust-red.log`, `artifacts/export-rust.log`.
- `pnpm test`: 130 files / 1128 tests passed (`artifacts/export-unit.log`).
- `cargo test --workspace`: 167 passed, 1 ignored (`artifacts/export-rust-workspace.log`).
- `pnpm test:render`: 11 files / 33 tests passed (`artifacts/export-render.log`).
- `pnpm ipc:check`: passed (`artifacts/export-ipc.log`).
- `pnpm check`: lint, typecheck, format and docs passed; boundaries stopped at an
  existing unrelated size violation in `canvas-workspace-controller.ts`, 503 > 500.
  Export changes do not touch that file. 42 boundary tests passed / 1 failed;
  remaining Rust stages were run separately. Log: `artifacts/export-check.log`.

Native command (PowerShell):

```powershell
$env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/ci-zip-target'
$env:CUTE_SCREEN_E2E_SCENARIOS='result-export'
pnpm test:e2e:tauri
```

Final native run: 1/1 passed. Production Open image reads ui-4k.png, creates a real
persisted document and decodes it; a native pointer adds a numbered marker.
Exported 3840×2160 PNG is decoded and its full RGBA hash equals the committed
scene. Save As cancellation preserves the existing output. After square crop,
reopening Crop and changing zoom, decoded 2160×2160 pixels equal the corresponding
region of the first export. Source metadata remains unchanged. Export files and
editor screenshot were visually inspected via image viewer.

Artifacts: `artifacts/export-native.log`, initial native failure in
`artifacts/export-native-red.log`, `artifacts/tauri-e2e/junit-result-export-0-0.xml`,
`artifacts/tauri-e2e/tauri-result-export.e2e-0-0.log`, and
`artifacts/tauri-e2e/result-export/{full,cropped,editor}.png`.
Only the OS picker selection is substituted by a test-only native boundary;
rendering, binary IPC, atomic writer, filesystem and repeat decode stay real.
This does not claim manual OS Save As interaction, Linux/macOS runtime evidence,
JPEG/WebP or quality/scale settings. PNG 1× is the implemented output path.

`pnpm check:rust` также passed: frontend build, cargo fmt check и все четыре
Clippy-конфигурации штатной команды (`artifacts/export-rust-check.log`).

## Имя PNG: дата и время (2026-10-17)

Windows 10 x64, build 19045. Общий native formatter подключён к editor Export
и Quick Save PNG: `Скриншот YYYY-MM-DD HH-MM-SS.png`, Local::now при открытии
диалога. Используется локальное календарное время, секунды и ведущие нули;
двоеточия заменены дефисами для Windows.

`cargo test -p cute-screen-desktop --lib export_filename -- --nocapture`:
1/1 passed. Contract сначала не компилировался без formatter, затем проверил
точное имя `Скриншот 2026-01-02 03-04-05.png` на фиксированную дату.
Логи: `artifacts/export-filename-red.log`, `artifacts/export-filename-test.log`.
`cargo fmt --all` выполнен. Это проверка имени и компиляции native call sites;
новый runtime-прогон системного Save As для этой правки не выполнялся.

## Настраиваемое имя PNG — ADR-084 (2026-10-17)

Актуальное имя по умолчанию: `YYYY-MM-DD_HH-MM-SS_Скриншот.png`, без пробелов,
с датой первой для сортировки по имени. General → PNG filename / Общие → Имя PNG
содержит draft шаблона, native preview, Save, Cancel/Escape и Reset. Расширение
добавляется отдельно. Шаблон сохраняется в SQLite key export.filename.v1,
оба native Save As читают его при открытии; schema документа не меняется.

Windows 10 x64 build 19045, WebView2 155.0.4283.45, external tauri-driver +
совместимый EdgeDriver, service/Rust plugin 1.3.0:

- `cargo test -p cute-screen-desktop --lib export_filename -- --nocapture`:
  3/3 passed, до реализации contract не компилировался. Проверены leading zero,
  custom template, whitespace/path/unknown-token rejection и SQLite reopen;
  invalid save сохраняет предыдущий шаблон.
- `pnpm exec vitest run --project vue tests/unit/vue/export-filename-settings.test.ts tests/unit/vue/settings-navigation.test.ts tests/unit/vue/activation-settings.test.ts`:
  3 files / 18 tests passed: draft preview, save/reload, RU validation, Escape,
  load/save retry и защита от запоздалого preview.
- `pnpm typecheck`: passed, включая frontend, Vue tests и WDIO specs.
- `cargo clippy -p cute-screen-desktop --lib --features fake-platform,test-harness -- -D warnings`:
  passed. `cargo fmt --all` выполнен.

```powershell
$env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/ci-zip-target'
$env:CUTE_SCREEN_E2E_SCENARIOS='export-filename-settings,result-export'
pnpm test:e2e:tauri
```

Оба native сценария passed (2/2). Первый проходит production Open image →
Settings → General, отклоняет пробелы, отменяет draft, сохраняет
`{date}_{time}_Работа`, закрывает/заново открывает Settings и восстанавливает
значение. Reset отменён без потери custom template. Экспорт сохраняет файл с
именем `YYYY-MM-DD_HH-MM-SS_Работа.png`; PNG повторно декодирован как 3840×2160.
Второй сценарий повторно проверяет annotations/crop/cancel и RGBA parity.
RU/EN screenshots просмотрены: поле, подпись, помощь и preview помещаются.
OS picker selection подменён test-only native boundary; manual OS dialog,
Quick Save dialog interaction и Linux/macOS runtime заново не проверялись.

Логи: `artifacts/export-filename-settings-{rust,vue,typecheck,clippy,native}.log`,
red contract — `artifacts/export-filename-settings-red.log`.
Native artifacts: `artifacts/tauri-e2e/export-filename-settings/`, включая
settings-en.png, settings-ru.png и фактический PNG с configured filename.

Общие `pnpm lint` и `pnpm test:boundaries` в этом прогоне заблокированы текущими
параллельными правками вне filename scope: CRLF/line-length, Tauri import в
App.vue, размер canvas-workspace-controller (512 > 500), complexity/depth в
pointer-selection-controller и SelectionFormattingToolbar. Новые filename files
не перечислены среди нарушений. Логи: export-filename-settings-lint.log и
export-filename-settings-boundaries.log в artifacts/. Docs links passed.

Final follow-up gates: `cargo test --workspace` passed (170 passed, 1 ignored),
`pnpm ipc:check` passed, scoped ESLint for the filename feature passed,
`git diff --check` passed. `pnpm format` / `pnpm format:check` were run; the
remaining failures are line-length/CRLF violations outside the filename files.
Logs: export-filename-settings-workspace.log, export-filename-settings-ipc.log,
export-filename-settings-scoped-lint.log, export-filename-settings-final-format.log
and export-filename-settings-format-check.log in artifacts/. General check is
not claimed green. No new filename source is listed in these style/boundary failures.

## Панели настроек обходят системный chrome (2026-10-17)

Windows x64, Node 22.23.1, pnpm 10.33.2. Исправление реализует существующий
контракт REQ-UI-001 и REQ-EDT-015/016: верхний sibling `.cs-topbar` ограничивает
доступную область selection toolbar и вложенных popovers; нижний chrome
учитывается по измеренным controls. ResizeObserver следит за размерами chrome,
viewport и панели, без реактивного scene graph и pointermove render-loop.
Нового архитектурного решения и изменения document/command contracts нет.

- Red-first: `pnpm exec vitest run --project vue tests/unit/vue/selection-toolbar-position.test.ts`
  воспроизвёл два пересечения с topbar (top 26/19 вместо >=62 CSS px).
- `pnpm exec vitest run --project vue tests/unit/vue/selection-toolbar-position.test.ts tests/unit/vue/preview-placement.test.ts tests/unit/vue/tool-ux.test.ts tests/unit/vue/popover-control-focus.test.ts tests/unit/vue/selection-toolbar-switch.test.ts tests/unit/vue/quick-context-toolbar.test.ts`
  — 6 files / 59 tests passed; верхний край, маленькое выделение, изменение высоты
  header, non-origin crop и Quick без header, нижние defaults/history/zoom.
  Лог: `artifacts/toolbar-chrome-focused-tests.log`.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_BROWSER_E2E_PORT='5189'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-selection-toolbar-chrome.e2e.ts`
  — Chrome 155.0.8059.80, 4/4 passed, 1024 px RU/EN light/dark. Создание стрелки
  обычным WebDriver pointer input; измерены selection toolbar и Stroke popover,
  Escape/focus return и неизменность документа при просмотре настроек.
  Лог: `artifacts/toolbar-chrome-browser.log`; screenshots:
  `artifacts/browser-e2e/toolbar-chrome-{en,ru}-{light,dark}-{selection,popover}.png`.
  RU/dark selection и popover визуально просмотрены.
- Дополнительный `pnpm test:e2e:browser --spec tests/e2e/specs/browser-tool-ux.e2e.ts`
  при тех же env — 3 passed / 2 failed. Два старых сценария ожидают
  `.cs-tool-configure-popover-host` после ПКМ Arrow; действующий ADR-069 и
  `openToolConfigure` фокусируют уже видимую нижнюю defaults-панель. Снимок
  подтверждает видимую defaults-панель, а не потерю координат popup.
  Лог: `artifacts/toolbar-chrome-tool-ux.log`.
- Scoped ESLint затронутых компонентов/helper и тестов passed:
  `artifacts/toolbar-chrome-lint.log`; `pnpm docs:check` passed.
- Общий `pnpm test` выявил failure в существующем новом core
  `selection-target.test.ts` (callout connectors/spotlight); прогон остановлен,
  полный suite не объявляется passed. Лог: `artifacts/toolbar-chrome-tests.log`.
- Первый `pnpm typecheck` и native build остановились на TS2379 в соседнем
  `ImageFormattingToolbar.vue` (`mixed: boolean | undefined`). Пока шёл этот
  срез, рабочая копия получила исправление `?? false`; native повтор запущен.
  Логи: `artifacts/toolbar-chrome-typecheck.log`, `artifacts/toolbar-chrome-tauri.log`,
  `artifacts/toolbar-chrome-tauri-retry.log`.

Linux/WebKitGTK и macOS/WKWebView в этом срезе не проверялись.

Повтор native `CUTE_SCREEN_E2E_SCENARIOS=selection-interactions` с
`CARGO_TARGET_DIR=D:/cutescreen/target/shape-catalog-native` собрал приложение и
запустил WebView2 155.0.4283.45, но остановился на старом предположении crop.x > 0
(фактически 0) до действий с панелью. Для этого исправления добавлен отдельный
стабильный scenario `selection-toolbar-chrome`: production Capture → Quick →
Editor → рисование стрелки → панель → Stroke → Escape. Он не требует состояния
из соседнего selection suite.

`pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` повторно passed после окончания
пересборки package outputs (`artifacts/toolbar-chrome-e2e-typecheck-final.log`).
`pnpm format` и `pnpm format:check` запускались; общий formatting gate остаётся
failed на соседних image-editing/image-gesture-preview/image-scene-preview tests.
Затронутые здесь файлы проходят scoped ESLint; лог общего gate:
`artifacts/toolbar-chrome-format-check-latest.log`.

Финальная native проверка:
`$env:CUTE_SCREEN_E2E_SCENARIOS='selection-toolbar-chrome'; $env:CARGO_TARGET_DIR='D:/cutescreen/target/shape-catalog-native'; pnpm test:e2e:tauri`
— Windows x64 / WebView2 155.0.4283.45, external provider, 1/1 passed.
Production Capture → Quick → Editor без предсозданного document state, обычный
pointer drag стрелки у верхнего края, bounds selection и Stroke, Escape/focus,
неизменность committed document. Fake-platform capture не доказывает physical
screen capture. Лог: `artifacts/toolbar-chrome-tauri-focused.log`, screenshot:
`artifacts/tauri-e2e/toolbar-chrome-{selection,popover}.png`; оба просмотрены.

Последний `pnpm format:check`: Prettier passed; ESLint formatting failed на
CRLF/LF в соседних canvas/selection-interactions файлах (1608 diagnostics),
не относящихся к этому исправлению. Точный список:
`artifacts/toolbar-chrome-format-check-final-result.log`. Последний
`pnpm docs:check` passed; scoped ESLint этого исправления также passed.

## Локаль native tray (2026-10-17/18, ADR-088)

Windows x64, PowerShell, Tauri 2.11.5, WDIO service/plugin 1.3.0,
external tauri-driver / WebView2. tauri-driver найден в cargo/bin; его
--version не поддерживается (usage exit 1), обновление toolchain не выполнялось.

- Red-first: cargo test -p cute-screen-desktop tray_localizes_every_item_and_preserves_shortcuts
  — expected compile failure до tray_text; artifacts/tray-locale/red-rust.log.
- Mounted Settings regression до исправления: ожидался ru, получен en;
  artifacts/tray-locale/red-vue.log.
- pnpm exec vitest run --project vue tests/unit/vue/settings-locale.test.ts
  tests/unit/vue/desktop-ui-preferences.test.ts tests/unit/vue/activation-settings.test.ts
  tests/unit/vue/settings-recorder.test.ts tests/unit/vue/settings-navigation.test.ts
  tests/unit/vue/editor-settings.test.ts — 36/36 passed; vue-final.log.
  Проверены persistence/theme, remote updates без echo, очередь RU/EN/RU,
  failed save и retry.
- pnpm format выполнен; общий ESLint formatter blocked на соседних max-len
  нарушениях. Scoped formatter затронутых файлов passed; format.log и scoped-format.log.
- pnpm check blocked на существующих сторонних lint/CRLF/max-len нарушениях:
  1793 errors / 82 warnings; check.log. pnpm typecheck прошёл app compilation,
  но остановился на tests/unit/vue/callout-toolbar.test.ts: unsupported exact
  в ByRoleOptions; typecheck.log. Общий зелёный gate не заявляется.

Native команда: $env:CARGO_TARGET_DIR='target/tray-locale-e2e';
$env:CUTE_SCREEN_E2E_SCENARIOS='tray-locale,tray-locale-reopen'; pnpm test:e2e:tauri.
Выделенный target не перезаписывает developer executable. Runner создаёт
isolated profile и повторно использует его для process restart. Лог сборки и
сценариев: artifacts/tray-locale/native.log. Результат дополняется после прогона.

Дополнительные результаты 2026-10-18:

- cargo test --workspace — 173 passed, 1 interactive ignored; rust-workspace.log.
- cargo clippy --workspace --all-targets --features fake-platform,test-harness -- -D warnings
  — passed; clippy.log. cargo fmt --all выполнен.
- Updated adapter suite — 3/3 passed, включая damaged native preference repair;
  adapter-final.log (вместе с остальными целевыми файлами: 37 уникальных tests).
- Scoped ESLint всех затронутых исходников/tests — passed; lint-scoped-final.log.
- pnpm docs:check — passed, 38 Markdown files; docs-check.log.
- E2E TypeScript check после восстановления package outputs — passed;
  e2e-typecheck-final.log. Предыдущий параллельный check пересёкся с clean-package-outputs;
  его missing-module сообщения не считаются результатом финального check.
- pnpm format:check — Prettier passed, ESLint failed на сторонних CRLF/format
  нарушениях (2508 diagnostics); format-check.log. Изменённые здесь файлы
  проверены отдельно; глобальный gate остаётся blocked.
- Boundary gate: 37 passed / 6 failed, включая два timeout под нагрузкой и
  существующие SVG/file-size/complexity нарушения. Добавленный direct Tauri
  import из main перенесён в platform facade. Повторный focused Tauri boundary
  указывает только существующий apps/desktop/src/App.vue; tauri-boundary-final.log.

Первый native прогон: все RU/EN/RU MenuItem checks и editor sync прошли;
tray-locale остановился при повторном switchWindow без ожидания создания
Settings. Тест исправлен ожиданием listWindows (production flow сохранён).
tray-locale-reopen прошёл 1/1: startup snapshot содержит все восемь русских
пунктов до frontend hydration. Settings screenshot просмотрен через image viewer.
Повторная сборка остановилась на соседнем CalloutFormattingToolbar ariaLabel
контракте; stale binary не запускался (native-final.log). Последний повторный
прогон: artifacts/tray-locale/native-verified.log.

Итоговый native прогон 2026-10-18: tray-locale и tray-locale-reopen — 2/2
passed, Windows x64 / WebView2 155.0.4283.45, external provider. Сборка текущих
исходников успешна, отдельный executable и профиль. Production Settings select
RU → EN → RU проверяет actual MenuItem::text всех восьми пунктов, editor sync,
Settings reopen и process restart с русским startup snapshot. Артефакты:
artifacts/tray-locale/native-verified.log, artifacts/tauri-e2e/tray-locale.json,
artifacts/tauri-e2e/tray-locale-reopen.json и tray-locale-settings-ru.png.
Открытый native popup визуально не проверялся; Linux/macOS pending.

Последний pnpm format:check: Prettier passed; осталась одна сторонняя
max-len ошибка в packages/editor-vue/src/shell/workspace/tool-style-defaults.ts:72
(130 > 120). Полный лог: artifacts/tray-locale/format-check-verified.log.
Финальный scoped ESLint исправления — passed (lint-verified.log),
cargo fmt --all --check и повторный docs:check также passed.

## Эмоджи Noto 2D — 2026-10-18

Платформа: Windows, Node 22.23.1, pnpm 10.33.2. Browser: Chrome
155.0.8059.80. Контракт: REQ-TOL-014, REQ-EDT-002/003/006/015/018, ADR-101.

- До core implementation запущен `pnpm exec vitest run --project core
packages/editor-core/src/emoji.test.ts`: red (отсутствовал новый модуль).
  После реализации — 3 passed: placement/non-origin bounds, versioned resource
  scene/codec/history, замена и intrinsic resize.
- `node scripts/vendor-noto-emoji.mjs`: 100 Noto 2D SVG из commit
  e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e. XML/DOCTYPE удалены, namespace
  entities раскрыты для portable decode. Изменения описаны в NOTICE; SHA-256
  файлов закреплены manifest.json. Apache 2.0 и NOTICE входят в frontend build.
- `pnpm test:render`: **18 files / 51 tests passed**. Включает pixel decode всех
  100 SVG и повторное декодирование PNG после renderer export с non-origin crop
  и rotation; decoded pixels совпадают с preview.
- `pnpm exec vitest run --project vue tests/unit/vue/app-shell-layout.test.ts
tests/unit/vue/emoji-tool.test.ts`: **2 files / 10 tests passed** после
  обновления Quick tool list. Включает successful placement → Select,
  replacement/undo/redo без изменения defaults, RU search/physical E/Escape,
  read-only, malformed preferences, loading/stale cancel и retry после decode error.
  Лог: artifacts/emoji-ui-final.log.
- `CUTE_SCREEN_BROWSER_E2E_PORT=5189 pnpm test:e2e:browser --spec
tests/e2e/specs/browser-emoji.e2e.ts`: **4 passed**, RU/EN × light/dark,
  1024 px и production mount на 2560×1440 document. Реальные pointer/keyboard
  events isTrusted=true, все 100 локальных SVG декодируются, поиск RU/EN,
  два уровня Escape/focus, replacement и undo/redo. Лог:
  artifacts/emoji-browser.log; screenshots:
  artifacts/browser-e2e/emoji-{en,ru}-{light,dark}-{selected,palette}.png.
  Скриншоты палитры визуально просмотрены; grid имеет собственный scroll,
  быстрый ряд начинается с галочки и заканчивается четырьмя указателями.
- `pnpm format`: passed после исправления переносов. `pnpm exec vue-tsc -b
packages/editor-core packages/editor-renderer packages/editor-vue` и
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: passed.
- `pnpm check`: остановился на tests/boundaries/public-api-contract.test.ts:21
  (несовместимые CompatibilityCaptureOutcomeV2 / generated CaptureOutcomeV2,
  document/completion/history). Лог: artifacts/emoji-check.log. Это не объявляется
  успешным общим check.
- Первый `CUTE_SCREEN_E2E_SCENARIOS=emoji,emoji-reopen pnpm test:e2e:tauri`
  остановился до test bodies: запущенный target/debug/cute-screen.exe заблокировал
  замену executable (Windows os error 5). Лог artifacts/emoji-tauri.log.
  Пользовательское приложение не останавливалось. Повторный запуск использует
  CARGO_TARGET_DIR=D:/cutescreen/target/emoji-e2e и отдельный frontendDist;
  итог будет записан отдельно. Browser evidence не заменяет real-WebView.

Уточнение палитры: область результатов имеет постоянную высоту 252 CSS px,
включая пустую выдачу; короткие категории выравниваются к верхнему краю.
Повторный browser-прогон после изменения: **4 passed** (RU/EN × light/dark,
1024 px), artifacts/emoji-browser-height.log. Проверяются x/y/width/height
палитры при 100 элементах, категории Work/Работа (20), поиске молнии (1)
и отсутствии результатов (0), допустимое отличие не более 1 CSS px.

Полный `pnpm test`: **151 files passed / 1 failed, 1347 tests passed / 1 failed**,
artifacts/emoji-all-tests.log. Единственный сбой — устаревший Quick tool list
в app-shell-layout.test.ts; список обновлён, его повторный профильный прогон
вместе с emoji-tool.test.ts дал 10 passed (emoji-ui-final.log).

Первый изолированный real-WebView запуск собрал приложение, но EdgeDriver
не создал первую сессию: `session not created: Chrome instance exited`.
Зависимый reopen не имел сохранённого документа. Лог:
artifacts/emoji-tauri-isolated.log. Это startup failure, а не native pass.

Финальная проверка после исправления постоянной высоты и разделения emoji
controller/state:

- `pnpm exec vitest run --project vue tests/unit/vue/emoji-tool.test.ts
--project boundaries tests/boundaries/typescript-architecture.test.ts`:
  5 emoji UI tests passed; acyclic boundary passed. В итоговых двух boundary
  failures остались ShapeFormattingToolbar size и сторонние functions в
  styles/gesture-finish/drawing-payload/image-editing. Новые emoji файлы,
  CanvasWorkspace и workspace-bindings violations устранены. Лог:
  artifacts/emoji-refactor.log.
- `CUTE_SCREEN_E2E_SCENARIOS=emoji,emoji-reopen CARGO_TARGET_DIR=target/emoji-e2e
CUTE_SCREEN_FRONTEND_DIST=artifacts/emoji-native-frontend
CUTE_SCREEN_E2E_DRIVER_PORT=4474 TAURI_WEBDRIVER_PORT=4475 pnpm test:e2e:tauri`:
  **2 scenarios / 2 tests passed**, Windows WebView2 155.0.4283.45, external
  native input. Quick non-origin crop → emoji insertion/replacement/history →
  Editor handoff → second emoji → persistence/restart. Проверены все 100 SVG,
  RU/EN search, Escape/focus и одинаковая геометрия палитры при 100/20/1/0
  результатах. Export PNG повторно декодирован; RGBA SHA-256 совпал с preview
  1:1. Native capture fixture 400×300; большой 2560×1440 документ покрыт browser
  mount, а не объявляется native capture evidence. Лог:
  artifacts/emoji-tauri-complete.log; screenshots emoji-{quick,editor}-{work,empty,
  palette,selected}.png, emoji-reopened.png и emoji-export.png в artifacts/tauri-e2e.
  Work и empty screenshots просмотрены визуально.
- Промежуточный native замер попал в opening animation: перед geometry snapshot
  добавлено ожидание завершения анимации. Промежуточный export hash сравнивал
  preview Fit 252% с PNG 1×; финальный тест явно включает 1:1, проверяет размеры
  перед сравнением SHA-256. Продуктовый export не менялся для обхода проверки.
- Повторный `pnpm check`: тот же CaptureOutcomeV2 type-contract error вне emoji,
  artifacts/emoji-check-final.log. `pnpm exec tsc --noEmit -p
tests/e2e/tsconfig.json`: passed после финальных правок теста.
- Финальный browser-прогон после разделения controller/state и добавления
  Work/empty screenshots: **4 passed**, artifacts/emoji-browser-verified.log.
  Scoped ESLint новых emoji sources/tests: passed, artifacts/emoji-lint-final.log.
  Логи заключительных `pnpm format` и `pnpm format:check`:
  artifacts/emoji-format-complete.log, artifacts/emoji-format-check-complete.log.

## Компактные Quick actions и история — 2026-10-18 (ADR-096)

Платформа: Windows 10 Home 10.0.19045 x64; WebView2/Edge 155.0.4283.45,
external tauri-driver + EdgeDriver, WDIO service/plugin 1.3.0. Отдельные app data,
WebView2 profile и `CARGO_TARGET_DIR=D:/cutescreen/target/quick-history-e2e`;
пользовательский запущенный editor не останавливался.

- Red-first `cargo test -p cute-screen-desktop --lib quick_commit_persists_the_frontend_document_and_reports_completion`
  сначала упал на отсутствующем History. После реализации проверяет editor/history,
  failed document rollback, retry, persisted capture, release и повторный commit.
- `cargo test --workspace`: 172 passed, 1 ignored (включая storage), exit 0.
  Artifact: `artifacts/quick-history-rust.log`.
- Focused `pnpm exec vitest run --project vue` для quick-capture-action-controller,
  actions-ui, source, actions, warmup, capture-request, layout и ui-icon:
  8 files / 153 tests passed, exit 0 (`artifacts/quick-history-focused-verified.log`).
  После уточнения направления tooltip: layout 19/19 passed
  (`artifacts/quick-history-layout-final.log`).
- `pnpm exec vue-tsc --noEmit -p apps/desktop/tsconfig.json` и
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`: exit 0.
  `pnpm ipc:check` и `pnpm docs:check`: exit 0. Scoped ESLint для новой панели,
  controllers и новых tests: exit 0. Логи имеют prefix `artifacts/quick-history-`.
- `$env:CUTE_SCREEN_E2E_SCENARIOS='quick-history,quick-history-reopen,quick-chrome'; pnpm test:e2e:tauri`:
  History + restart на high-entropy 3840×2160 native fake frame прошли через
  обычный production mount и native pointer input. Проверены non-origin crop,
  pencil и inline Text без отдельного подтверждения, кнопки 36×36, панель 46 px,
  отсутствие main после History, единственная карточка и редактируемые слои после
  restart. Чистый original 3074×1730 сравнивается по decoded RGBA SHA-256 с crop
  исходной fixture. Production Export PNG затем повторно декодируется: размеры
  те же, 2156 pixels отличаются из-за annotations. Picker подменяется только
  существующей test-harness границей; storage, codec, renderer и file write настоящие.
  Лог: `artifacts/quick-history-native-complete.log`.
  Artifacts: `artifacts/tauri-e2e/quick-actions-compact.png`,
  `quick-history-before.png`, `quick-history-opened.png`, `quick-history-reopened.png`,
  `quick-history-export.png`, `quick-history-decoded.json`, `quick-history-crop.json`.
- `$env:CUTE_SCREEN_BROWSER_E2E_PORT='5189'; pnpm test:e2e:browser --spec tests/e2e/specs/browser-shell.e2e.ts --mochaOpts.grep='keeps capture|switches locale'`:
  2/2 passed (Chrome 155); это регрессия основного editor при 1024 px и переключении
  RU/EN/light/dark, не доказательство native capture.

Первый native прогон выявил перекрытие History старой portal note; исправлено
измеряемым размещением note и пассивным pointer-events. Native gestures ждут
готовую видимую Quick surface, активный Pencil и commit штриха перед Text.
Для Fit 50% drag начинается внутри видимой части corner handle (1 CSS px).
Промежуточный 400×300 smoke проверял clipboard preview; финальная приёмка использует
4K fixture и отдельный production PNG export 1×.

Общий workspace во время проверки содержит другие незавершённые изменения:
`pnpm test` завершился 1335 passed / 5 failed: quick tool list без Line/Emoji,
emoji High voltage lookup и три 5-second CanvasKit loupe timeouts.
`pnpm test:boundaries`: финально 42 passed / 2 failed — size/complexity в
ShapeFormattingToolbar, styles, gesture-finish, drawing-payload и image-editing;
новых Quick files среди violations нет (`artifacts/quick-history-boundaries-final.log`).
`pnpm check` первоначально остановился на lint соседних изменений. Финальные
lint и typecheck прошли, включая compatibility CaptureCompletion в editor-vue;
последняя попытка остановилась на форматировании TRACEABILITY.md после его
повторного изменения. Документ затем отформатирован. Общие test/format/type
логи сохранены в artifacts; зелёный полный workspace не заявляется. Физический capture, Linux/Wayland/WebKitGTK,
macOS/WKWebView и отдельная native RU/EN/light матрица остаются непроверенными;
это fake-platform capture в настоящем Windows WebView2.

Финальный native результат: 3 scenarios / 8 tests passed, exit 0 (2 History/restart
на 4K + 6 quick-chrome regressions). `pnpm format` и отдельный `pnpm format:check`
после реализации прошли; `cargo fmt --all` и повторный `cargo test --workspace`
также exit 0 (172 passed, 1 ignored; `artifacts/quick-history-rust-final.log`).

## Актуализация лендинга (2026-10-18)

Windows 10 x64 / PowerShell, Node 22.23.1, pnpm 10.33.2. RU/EN: 18 карточек,
актуальные описания, Emoji и общий экспорт UiIcon; hero screenshot сохранён.

- `pnpm icons:landing`: exit 0, 19 SVG (18 инструментов и Check).
- `$env:CUTE_SCREEN_E2E_SCENARIOS='landing-assets'; $env:CARGO_TARGET_DIR='D:/cutescreen/artifacts/callout-target'; $env:CUTE_SCREEN_FRONTEND_DIST='D:/cutescreen/artifacts/landing-refresh/frontend'; $env:TAURI_WEBDRIVER_PORT='4457'; pnpm test:e2e:tauri`:
  fresh build + external driver / WebView2 155.0.4283.45, 1/1 passed. Штатный
  Open image с 4K fixture создал editor document; все 18 кнопок доступны.
  Снимок 665×46 повторно декодирован; просмотрены
  `artifacts/landing-refresh/editor-toolrail.png` и `toolrail.png`.
  Лог: `artifacts/landing-refresh/native.log`.
- По последующему уточнению пользователя использован его готовый screenshot
  `localhost_5173_editor_.png`, 598×41. SHA-256 источника и landing asset совпал:
  `d3cdd7f50e047905130b8396e5cfd99fbd5076a624db80c7db360183396b07be`.
  Изображение не перерисовано; CSS `inset(0 round 12px)` скрывает только наружные
  углы. Иконки, active state и внутренний фон сохранены.
- `$env:CUTE_SCREEN_BROWSER_E2E_HEADLESS='1'; $env:CUTE_SCREEN_LANDING_E2E_PORT='5321'; pnpm test:e2e:landing`:
  Chrome 155.0.8059.80, 4 passed / 1 no-JS-only skipped, exit 0.
  Лог: `artifacts/landing-refresh/landing-js.log`.
- С теми же параметрами и `$env:CUTE_SCREEN_LANDING_NO_JS='1'; pnpm test:e2e:landing`:
  4 passed / 1 JS-only skipped, exit 0;
  `artifacts/landing-refresh/landing-no-js.log`.
- Обе локали проверены на 375/760/768/1024/1440 px: все 18 карточек с корректными
  SVG, без page overflow; mobile toolbar прокручивается клавиатурой, размер
  asset 598×41, clip 12 px, language/skip links и focus работают без JS.
  Просмотрены RU/EN 1440 и RU 375 screenshots в `artifacts/landing-refresh/js/`.
- Первый расширенный icon assertion ошибочно ожидал исходные SVG paths:
  исправлен для hash-named production assets, затем оба режима прошли полностью.
  Общий typecheck обнаружил `cacheDir: undefined` в соседнем Vite изменении:
  условное включение свойства сохраняет изоляцию caches и exact optional types.

`pnpm format` — exit 0. Финальный `pnpm check` прошёл lint, полный typecheck,
format:check и docs:check (38 Markdown files), затем остановился на прежних
architecture budgets: boundaries 42 passed / 2 failed, exit 1.
Нарушения относятся к размерам/сложности ShapeFormattingToolbar, styles,
gesture-finish-controller, drawing-payload и image-editing; landing files в
списке отсутствуют. Лог: `artifacts/landing-refresh/check.log`.
IPC/Rust gates после этого fail-fast шага не выполнялись; native/core/IPC
контракты и renderer geometry этим изменением не меняются.

## macOS Screen без следа редактора и зависшего preflight (2026-10-18)

Платформа: macOS 12.7.6 x64, CLT SDK 13.1, WKWebView Safari 17.6, один Retina
дисплей 1440×900 pt (2880×1800 px), `pnpm tauri dev` (debug).

До исправления:

- CLI `target/debug/cute-screen capture --mode screen --json` при скрытом
  Editor трижды вернул `failed`; dev log:
  `capture preflight rejected (...): Err(Elapsed(()))`. С видимым Editor тот же
  вызов — `captured`.
- Захват, начатый при скрытом Editor и продолженный после `cute-screen show`,
  сохранил PNG с видимым окном Cute Screen поверх Cursor: async Tauri `hide()`
  не дожидался `orderOut`.
- Декодированные оригиналы имели 3016×1886 и 3104×1974 px при экране
  2880×1800: `CGRectNull` охватывал окна за краями дисплея, поля белые.

Red-first: `capture_preflight_skips_a_suspended_macos_editor` (E0432 до
реализации), `screen_bounds_cover_exactly_the_displays` (E0061/E0599). После:
`cargo test -p cute-screen-desktop --lib` — 155 passed.

Native replay после пересборки: два CLI Screen подряд (первый при скрытом
Editor, второй при показанном после первого) — оба `captured`, без preflight
timeout. `sips` decode обоих оригиналов: 2880×1800; просмотренный downscale
совпадает с эталонным `screencapture -x` (Cursor), окна Cute Screen нет.
Каждый CLI-вызов занимал около 24 с, PNG появлялся в конце: debug-профиль без
оптимизации зависимостей; release-замер не выполнялся.

Также: `cargo fmt --all`, `pnpm format`, `pnpm format:check`, `git diff --check`,
`vue-tsc -p apps/desktop`, `pnpm docs:check`, eslint изменённых TS/MJS,
vitest `window-capture-recovery` и `tauri-capabilities` (5 passed),
`cc -fsyntax-only -DCUTE_SCREEN_MACOS_SDK=130000` обоих `.m` — exit 0.
Не выполнялись: `pnpm test:e2e:tauri` на macOS и release build.

## Плавная автокоррекция (2026-10-18, ADR-113)

Ubuntu 24.04.5 x64, Node 22.23.1, pnpm 10.33.2; Chrome 154.0.8037.57.
Логи — `artifacts/brush-smoothing/`.

- Red-first `pnpm test packages/editor-core/src/brushes.test.ts`: 2 новых
  проверки v2/v3 failed (0,387 rad > 0,18), остальные 11 passed; `red.log`.
- `pnpm test`: 153 files / 1372 tests passed; `unit-all.log`. Существующие
  jsdom canvas warnings не превратились в failures.
- После выделения modern resolver:
  `pnpm test packages/editor-core/src/brushes.test.ts packages/editor-core/src/straight-stroke.test.ts packages/editor-core/src/brush-migration.test.ts packages/editor-core/src/tool-settings-redesign.test.ts tests/unit/vue/brushes.test.ts`
  — 55/55 passed; `unit-final.log`. Endpoints/pressure, 0%, pen, RMS,
  samples immutability, Shift, migration, history и mounted settings.
- `CUTE_SCREEN_UPDATE_GOLDENS=1 pnpm test:render tests/harness/render/golden-brushes.test.ts`
  обновляет только brush goldens и добавляет rounded-ink; `render-update.log`.
  Затем `pnpm test:render tests/harness/render/golden-brushes.test.ts tests/harness/render/straight-strokes.test.ts`
  — 6/6 passed без update; `render.log`. PNG повторно декодированы;
  Canvas2D preview/export идентичны, CanvasKit в semantic tolerance.
  Visual review: `tests/goldens/m01-renderer/rounded-ink-canvas2d.png` —
  одинаковые samples, слева pen, справа stabilized, 3 px / 65%.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5298 pnpm test:e2e:browser --spec tests/e2e/specs/browser-brushes.e2e.ts --spec tests/e2e/specs/browser-straight-strokes.e2e.ts`
  — 2 files / 7 tests passed; `browser.log`. Trusted pointer, Undo/Redo/Cancel,
  Shift, DPR 1/2 × Fit/1:1, compact RU/EN × light/dark.
- Дополнительный loop test сначала прерван Vite reload во время выделения
  helper (`browser-loops.log`). Повтор без изменения исходников:
  `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5298 pnpm test:e2e:browser --spec tests/e2e/specs/browser-brushes.e2e.ts`
  — 3/3 passed; `browser-final.log`. Production pointer создаёт две петли
  на 2560×1440, 6 px; screenshot `artifacts/browser-e2e/rounded-loops-2560.png`
  просмотрен при 1280×900: плавные стыки справа, canvas и controls не обрезаны.
- `pnpm test:perf tests/harness/perf/straight-strokes.test.ts` — 2/2 passed;
  `perf.log`, timings в `artifacts/straight-strokes/perf-{3840,7680}.json`.
  12 000 input samples, stabilized geometry 17,81/7,55 ms. Это CPU correctness
  evidence при локальном прогоне, не контролируемый GPU frame budget.
- Первый `pnpm check` выявил complexity 21/20 в resolver (`check.log`);
  modern v2 вынесен в helper без ослабления boundary gate.

Native `pnpm test:e2e:tauri`, `pnpm tauri build` и отдельный
`cargo test --workspace` в этом TS geometry срезе не запускались.

Финальный `pnpm check` — passed: lint, TypeScript, format, docs links,
61 boundary checks, IPC codegen check, production frontend build, Rust fmt
и все Clippy configurations; `artifacts/brush-smoothing/check-final.log`.
`pnpm format` и `pnpm format:check` повторены после записи evidence;
логи `format-evidence.log` и `format-check.log` в той же директории.

## Ресайз эмоджи за нижний левый угол (2026-10-20)

`REQ-TOL-014/015`, `REQ-EDT-005/006`, ADR-035. Исходный HEAD `54ddab2`
после `git fetch origin && git pull --ff-only`. Ubuntu 22.04.5 x86_64,
Linux 6.8.0-138-generic, Node 22.23.1 из
`/tmp/cute-screen-portal-research/node-v22.23.1-linux-x64/bin`, pnpm 10.33.2,
headless Chrome/ChromeDriver 147.0.7727.101. Начальный shell Node 22.21.1
был отвергнут engine check; последующие pnpm команды используют pinned Node.

Причина: emoji image node игнорировал localBounds.x/y, которые меняются при
ресайзе за левую/верхнюю сторону. Преобразуется полное локальное начало
с rotation/reflection. Связанные исправления: size control сохраняет центр
после такого ресайза; image projection корректно обрабатывает ненулевое
локальное начало при rotation/scale. У shape, text, censor, spotlight и loupe
проекции уже учитывают локальную геометрию; pencil/marker и ruler используют
свои points/endpoints. Arrow/callout имеют semantic handles; numberedMarker
не имеет generic resize. Persisted schema и EditorCommand не изменены.

- Red-first: `pnpm test --project core packages/editor-core/src/emoji.test.ts`
  — 26 failed / 11 passed; аналогичный focused image-paint run — 1 failed /
  7 passed. После исправления и добавления четырёх Alt centre contracts оба
  файла — 49 passed. Логи red-core, red-image, green-core.
- `pnpm test:render tests/harness/render/emoji-assets.test.ts` — после исправления
  6 passed: all 100 SVG decode, каждый угол, rotation/reflection, ожидаемые pixels
  и повторное декодирование экспортированного PNG. В red-render три offset
  cases провалились по pixels; четвёртый достиг 5 s test timeout при дорогом
  сравнении typed arrays. Сравнение decoded buffers теперь использует
  Buffer.equals, без изменения проверяемого равенства.
- Browser env: `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1`,
  `CUTE_SCREEN_BROWSER_E2E_PORT=5193`,
  `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt`.
  `pnpm test:e2e:browser --spec tests/e2e/specs/browser-emoji-resize.e2e.ts --mochaOpts.timeout 120000`
  — первоначальная regression sw failed по pixels во время preview (MAE 5.99
  при допуске <1); после исправления четыре угла passed. Настоящий trusted
  pointer, 2560×1440 документ, 100% viewport; preview transient, commit, exact
  undo/redo и сравнение рисунка с независимо отрисованным SVG. Позднее сценарий
  дополнен изменением размера через панель после corner resize.

- `pnpm test` — 154 files, 1416 passed / 5 failed. Один failure — 5 s timeout
  app-arrow-actions; `pnpm test tests/unit/vue/app-arrow-actions.test.ts --testTimeout 20000`
  — 11 passed. Остальные четыре — параллельно изменяемые capture-source-settings
  (`bridge.available is not a function`), вне resize-правки; общий pass не заявляется.
- `pnpm test:render` — 18 files, 55 passed / один 5 s timeout 4K golden-brushes.
  `pnpm test:render tests/harness/render/golden-brushes.test.ts --testTimeout 20000`
  — 4 passed, включая decode parity двух backends. Assertions не ослаблялись;
  timeout увеличен только аргументом повторного запуска на загруженном host.
- `pnpm test:boundaries` — 110 passed / два 5 s timeout architecture scans;
  `pnpm test:boundaries --testTimeout 20000` — 16 files / 112 passed.
- `pnpm lint` — exit 0, 85 existing warnings. `pnpm docs:check` — passed.
  `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json` — passed.
- `pnpm typecheck` успешно собрал editor-core, editor-renderer и editor-vue,
  затем заблокирован параллельной правкой CaptureSourceSettings/capture-source:
  generated desktop-ipc ещё не экспортирует LinuxCaptureMethod/LinuxCaptureMethods.
  Отдельный `pnpm exec vue-tsc --noEmit -p tests/tsconfig.json` показывает только
  те же ошибки в settings и capture-source-settings.test, без resize diagnostics.
  Общий typecheck pass не заявляется.

- Финальный `pnpm test:e2e:browser --spec tests/e2e/specs/browser-emoji-resize.e2e.ts --mochaOpts.timeout 120000`
  — **6 passed**, 1 min 41 s: четыре угла + изменение размера в панели,
  отдельный production G-import 3840×2160 → SW resize с pixel preview/commit
  parity и exact undo/redo, отдельный ruler endpoint resize с неподвижным
  противоположным концом и сохранением style/history.
- Дополнительный browser audit (`--spec browser-image-editing.e2e.ts`,
  `browser-m08-2.e2e.ts`, `browser-m08-4.e2e.ts`, `browser-m08-6.e2e.ts`)
  — 2 passed / 2 failed. Non-origin crop/text resize и precision cancel passed.
  Восьмикомбинационный 4K image formatting suite достиг общего timeout 600 s;
  ruler style suite остановился на thickness slider (строка 52), до ресайза.
  Эти два широких сценария не считаются passed; короткие resize regressions
  выше проходят отдельно, без изменения проверяемого production пути.
- Финальные formatting и disk commands: см. логи artifacts/resize-corners.
  Фокусные lint/type checks не подменяют упомянутые общие failures.
  Native Tauri/WebKitGTK, WebView2, WKWebView, Rust, полный `pnpm check`,
  release/package build и perf suite в этой DOM-free geometry правке не
  запускались. Параллельные изменения Rust в том же workspace не относятся к ней.
  Evidence: `artifacts/resize-corners/`; screenshots `emoji-resize-{sw,nw,ne,se}.png`
  первоначально в artifacts/browser-e2e. Просмотрены sw и nw: рисунок внутри
  рамки, selection toolbar над объектом.

## Восемь креативных гарнитур (2026-10-20, ADR-131)

Платформа: Ubuntu 22.04.5 x86_64, desktop Wayland с XWayland, Chrome
147.0.7727.101 (headless), WebKitGTK 2.50.4. Node 22.23.1 / pnpm 10.33.2;
проверки используют установленный Node через
`PATH=/home/ivaninvladimir/.nvm/versions/node/v22.23.1/bin:$PATH`.
Baseline commit: `e50da83`, рабочая копия содержит параллельные изменения.
Артефакты: `artifacts/creative-fonts/`; native screenshots/export —
`artifacts/tauri-e2e/creative-fonts-*`.

- До изменения каталога `pnpm exec vitest run --project vue
tests/unit/vue/text-font-picker.test.ts` — red: ожидалось 20, получено 12
  (`red-picker.log`). После реализации picker и license-policy — 8/8 passed
  (`unit.log`).
- `pnpm exec vitest run --project render-harness
tests/harness/render/golden-text-fonts.test.ts` — 4/4 passed
  (`fonts-final.log`): исходный SHA-256 Germanica, OFL notice, полный русский
  алфавит с Ё/ё и Latin/digits по glyph IDs без fallback, decoded goldens
  20 семейств в Canvas2D/CanvasKit regular и B/I. Четыре goldens обновлены
  профильным запуском с `CUTE_SCREEN_UPDATE_GOLDENS=1`; изображения просмотрены.
- `pnpm run licenses` — 28 production packages разрешены (`licenses.log`).
  Команда `pnpm licenses` без `run` попадает во встроенную pnpm CLI,
  поэтому для repository script использован явный `run`.
- `pnpm test:render` — 63 passed / 4 timed out (`render.log`). Повтор
  `pnpm exec vitest run --project render-harness
tests/harness/render/shape-paint.test.ts tests/harness/render/numbered-marker.test.ts
tests/harness/render/golden-brushes.test.ts --maxWorkers 1 --testTimeout 120000`
  — 9 passed, один timeout (`render-retry.log`). У shape-paint собственный
  предел 30000 ms, который CLI не заменяет; отдельный повтор также превысил
  его (`shape-isolated.log`). Продуктовые goldens для шрифтов прошли.
- `pnpm exec tsc --noEmit -p tests/e2e/tsconfig.json`, профильный ESLint и
  `pnpm docs:check` прошли (`e2e-typecheck.log`, `lint-focused.log`, `docs-check.log`).
- Выполнен `pnpm format`. Первая общая `pnpm format:check` застала 18 ошибок
  структурных переносов в параллельно добавленных branding files; файлы
  шрифтов прошли профильное форматирование. Финальный статус записан ниже.

Первый browser запуск застал временно отсутствующий CardBranding.vue; первый
`pnpm check` и native build остановились на двух ошибках ariaLabel в новом
CardBrandingEditor.vue. Два вызова SimpleColorPicker исправлены через явный
`v-bind` для ariaLabel. Одна повторная native-сборка пересеклась с очисткой
package outputs другой сборкой и не разрешила editor-renderer в workers;
повтор запущен после завершения очистки. Старый executable не использовался.

Старые browser-сценарии уточнены для production-flow: responsive проверка
сначала размещает текст; финальный font menu открывается на новом draft;
короткий measured-width sample не достигает wrap cap у пиксельной гарнитуры.
Длинный текст и реальные переносы остаются в отдельных layout/native проверках.

Размер до: target 45.537 GiB (debug 43.217, release 2.320), artifacts
4.095 GiB, node_modules 0.631 GiB. Использован общий target без отдельного
Cargo home/target. Полезный cache и чужие активные приложения не удалялись.

Финальные профильные результаты:

- `pnpm exec vitest run --project vue tests/unit/vue/text-font-picker.test.ts
tests/unit/vue/rich-text-editor.test.ts tests/unit/vue/text-layout.test.ts
--project boundaries tests/boundaries/js-license-policy.test.ts` — 18/18 passed
  (`unit-final.log`). До CSS исправления две regression проверки падали
  (`red-font-family-css.log`): unquoted Press Start 2P отвергается CSS parser.
  Общая функция сериализует family одним quoted CSS string для menu, root и
  inline spans; исходное имя в документе не меняется. Новый branding select
  также использует общий каталог вместо отдельного списка из 12 значений.
- `CUTE_SCREEN_BROWSER_E2E_HEADLESS=1 CUTE_SCREEN_BROWSER_E2E_PORT=5187
pnpm test:e2e:browser --spec tests/e2e/specs/browser-text-fonts.e2e.ts
--spec tests/e2e/specs/browser-text-layout.e2e.ts --mochaOpts.timeout 90000`
  — 2 specs / 6 tests passed (`browser-confirmed.log`): все 20 family,
  B/I, keyboard, undo/redo, PNG decode, measured width, wrapping/reopen и
  RU/EN × light/dark × 640/1024/1440. Метрики отдельно прошли после CSS fix
  (`browser-metrics-final.log`); responsive отдельно — `browser-responsive.log`.

Native export проверяет полноразмерный 3840×2160 PNG и наличие добавленных
пикселей в bounds каждого из восьми текстов относительно неизменённой 4K
fixture; повторный запуск обязан дать тот же SHA-256 decoded RGBA. Это не
зависит от масштаба viewport и DPI. Образцы 48 px размещены в двух колонках
без перекрытия точек создания: длинный пиксельный текст при 64 px иначе открывал
редактирование прежнего объекта. Native selection использует trusted Ctrl+A
в существующем contenteditable; browser-only bookmark helper с вложенным
`__name` не сериализуется в WebKit.

- `PATH=/home/ivaninvladimir/.nvm/versions/node/v22.23.1/bin:$PWD/artifacts/tauri-e2e/driver-cache/bin:$PWD/artifacts/creative-fonts/tools/usr/bin:$PATH
XDG_SESSION_ID=cute-screen-creative-fonts
CUTE_SCREEN_E2E_SCENARIOS=creative-fonts,creative-fonts-reopen
pnpm test:e2e:tauri` — 2 scenarios / 2 tests passed (`tauri-complete.log`).
  Штатный runner собрал свежий debug/no-bundle harness, pinned executable
  и удалил успешную persistence group после relaunch. Native WebKitGTK/wry
  0.55.1: восемь UI-created text layers, mixed Cyrillic/Latin, 48 px B/I,
  wrapping, undo/redo, autosave, relaunch и идентичные decoded RGBA exports.
  Временный WebKitWebDriver 2.50.4 извлечён из официального Ubuntu пакета
  без системной установки; после проверки удалён вместе с диагностическими
  appData неуспешных попыток. Browser-specific `__name` callback и
  перекрывающиеся 64 px test samples исправлены только в сценарии.
- Native screenshots `creative-fonts-editor.png`, `creative-fonts-reopened.png`
  и два 4K export PNG просмотрены. `artifacts/creative-fonts/specimen.png`
  показывает восемь regular faces с названиями; это иллюстрация, не замена E2E.
- Финальный `pnpm check` прошёл lint, весь typecheck, format:check и docs:check,
  затем остановился на timeout 5000 ms архитектурного ratchet test
  (`check-final.log`: 112 passed / 1 timeout).
  `pnpm exec vitest run --project boundaries --testTimeout 30000 --maxWorkers 1`
  — 113/113 passed (`boundaries-final.log`). IPC/clippy tail общей команды
  из-за ранней остановки не выполнялся; Rust исходники задачей не менялись.
- Диск после сборок: target 45.583 GiB (debug 43.263, release 2.320),
  прирост общего target около 47 MiB; полезный cache сохранён (`disk-after.log`).

Ограничения общего workspace: полный `pnpm test:render` имеет timeout
shape-paint вне шрифтовых тестов; `pnpm check` имеет описанный ratchet timeout.
Профильные шрифты, browser и native проверки прошли. Windows/macOS для этого
изменения не запускались. Схема документа и IPC этим расширением не менялись.

## OpenCode MCP profile — 2026-10-25

Linux x86_64, baseline `c2a26cb` + working tree. Новый Rust contract test сначала
упал (`type` = null), затем прошёл после добавления OpenCode JSON `mcp` profile.
`cargo test --offline -p cute-screen-desktop --lib mcp::tests` — 5 passed;
`pnpm exec vitest run --project vue tests/unit/vue/agent-settings.test.ts` — 3 passed.
`pnpm exec vue-tsc --noEmit -p apps/desktop/tsconfig.json` и targeted ESLint — passed.
Проверены command array, пути с пробелами/Unicode, environment, enabled и выбор
OpenCode в RU settings. Формат сверён с официальной стабильной документацией
<https://opencode.ai/docs/en/mcp-servers/>. Реальный OpenCode/runtime smoke и
платформы Windows/macOS для этого профиля не запускались. Логи:
`artifacts/opencode-2026-10-25/`.
