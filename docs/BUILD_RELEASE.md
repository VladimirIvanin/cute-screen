# CI-сборки и проверка версии через GitHub

## Версионный выпуск (ADR-095)

`release.yml` собирает семь установщиков: Linux x64/ARM64 DEB и AppImage,
Windows x64/ARM64 NSIS и один macOS universal DMG. Pull request, затрагивающий
release pipeline, запускает тот же dry run без публикации: это позволяет
проверить новый workflow до его появления в default branch. Manual dispatch
также создаёт только Actions artifacts. Tag push создаёт только **draft**.

1. В чистом checkout выполнить `pnpm release:version 1.2.3` с выбранным номером.
   Команда синхронизирует npm workspace, Tauri, Cargo, pinned path dependency
   и собственные Cargo.lock entries. `workspace:*` ссылки pnpm не содержат
   номера, поэтому pnpm-lock.yaml не переписывается ради повышения версии.
2. Проверить `pnpm release:check v1.2.3`, закоммитить metadata и провести CI.
3. После попадания commit в main создать и отправить новый tag `v1.2.3`.
   Workflow не повышает версии, не создаёт tags и не исправляет их автоматически.
4. Дождаться всех package/clean-install/Intel/quality gates и job draft.
5. Скачать файлы из draft, сверить SHA256SUMS и провести A14. Опубликовать
   вручную; не публиковать draft одновременно с работающим workflow.

До tag сборки preflight проверяет строгую stable SemVer без suffix/leading
zeroes, installer-compatible диапазон компонентов 0..65535, согласованность
всей metadata и принадлежность SHA истории main. CI переиспользуется через
workflow_call и проверяет тот же SHA. Его ошибка блокирует полный комплект
и draft; успешный compile не заменяет quality gate.

Installer assets называются `cute-screen-<version>-<os>-<arch>.<extension>`.
Рядом находятся SHA256SUMS, manifest.json, CycloneDX 1.6 SBOM, npm/Cargo/font
license report, copyright bundled Linux libraries, package verification и
clean-install reports, README с ограничениями. Все файлы кроме SHA256SUMS
покрываются checksums. SBOM — source dependency inventory; packagedFiles
отдельно фиксирует имена, размеры и хеши файлов в каждом пакете.
SBOM tool `@cyclonedx/cdxgen@12.8.6` имеет изолированный lockfile; build tooling
не становится production dependency desktop-приложения.

Draft имеет commit marker. При повторном запуске одинаковые assets пропускаются
по GitHub SHA-256 digest, недостающие добавляются. Конфликтующие assets не
перезаписываются: удалить незавершённый draft вручную и повторить workflow.
Published Release не изменяется; для исправления опубликованных bytes нужен
новый patch version/tag. Network failure может оставить неполный draft;
workflow сообщает ошибку и никогда не публикует его автоматически.

### Реальные пакеты и платформенные границы

Production build использует default features плюс Tauri custom-protocol,
locked dependencies и явные `--bundles`. Test-only features не разрешаются.
Служебный `desktop-ipc-codegen` требует отдельного `ipc-codegen` feature:
`pnpm ipc:codegen` и `pnpm ipc:check` включают его автоматически, production
packaging — никогда. Это исключает утечку helper в DEB/NSIS и ошибку universal
bundler, который объединяет только основной executable.
`pnpm release:verify <platform> <bundle-directory>` извлекает DEB/AppImage,
устанавливает NSIS во временный каталог или монтирует DMG read-only.
Hidden `--release-info` возвращает только metadata и хеши декодированных
embedded ресурсов; сверяются все bundled fonts/WASM/licenses с frontend.
`pnpm verify:release-boundary --packaged <binary> <platform>` проверяет уже
упакованный binary без пересборки; прежний default режима CI сохранён.

- Linux: native Ubuntu 22.04 runners, ELF/GLIBC <=2.35 для приложения и
  поставляемых библиотек; AppImage extraction fallback не требует FUSE.
  DEB устанавливается с одними declared dependencies в чистых 22.04/24.04
  контейнерах на обеих архитектурах. Обычный FUSE-запуск остаётся ручным.
  AppRun/GTK GDK_BACKEND lines попадают в report: при принудительном X11
  не обещать native Wayland. GNOME/KDE portals проверяются отдельно;
  X11 hotkeys не доказывают GlobalShortcuts portal support.
- macOS: Xcode 16.4, `MACOSX_DEPLOYMENT_TARGET=12.0`, Tauri minimum 12.0,
  universal Mach-O и ad-hoc `signingIdentity: "-"` до создания DMG.
  Codesign, embedded metadata и запуск проверяются из конечного DMG на ARM64
  и Intel. Objective-C availability helpers линкуются с compiler-rt из выбранного
  Xcode: Rust `-nodefaultlibs` не добавляет этот архив автоматически. Runtime
  отражён в SBOM/license report; Xcode version — в package verification.
  macOS 12.0 runtime не считается проверенным запуском на 15.
  Ad-hoc не заменяет Developer ID/notarization: для доверенной загрузки
  использовать системный Privacy & Security → Open Anyway, если ОС разрешает.
  Не отключать Gatekeeper/SIP глобально. Screen Recording/TCC, отказ и
  повторное разрешение проверяются при ручной приёмке установленного app.
- Windows: Windows Server 2025 x64 build не доказывает Windows 11 runtime.
  NSIS wrapper может быть x86 для ARM64; PE проверяется у установленного app.
  Сохраняются currentUser и autostart hooks. При отсутствии Evergreen WebView2
  downloadBootstrapper требует сети; fixed runtime не поставляется.
  SmartScreen может предупреждать, Smart App Control/managed policy может
  блокировать unsigned app. Универсальный обход блокировки не обещается.
  Проверять скачанный браузером installer с Mark-of-the-Web на Windows 11.

Первый полный GitHub run, ручные platform gates и опубликованные artifacts
фиксируются в TESTING.md; локальный helper test не заменяет эту проверку.
Проверка новой версии внутри приложения остаётся отдельным `REQ-REL-004`.
Tag может существовать при failed pipeline или ещё не опубликованном draft.

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

Baseline macOS 12.0 из ADR-038 задан и в `bundle.macOS.minimumSystemVersion`,
и в `.cargo/config.toml` через `MACOSX_DEPLOYMENT_TARGET`. Cargo-конфигурация
нужна для прямых `cargo test`/`cargo check` в CI: они не читают Tauri bundle
settings, а cc-rs без target может выбрать macOS 15.5 и отклонить
`CGWindowListCreateImage` как obsoleted. Явное значение переменной окружения
сохраняет приоритет над default Cargo. Это настройка сборки; она не подтверждает
runtime capture на новых macOS и не реализует ScreenCaptureKit routing из ADR-038.

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
чтобы single-instance dispatch не подключался к resident developer app. CLI
того же профиля сохраняет тот же identifier. Интерактивная physical проверка
Windows запускается через `CUTE_SCREEN_E2E_SCENARIOS=windows-capture-exclusion`;
обычный unattended suite её пропускает. Production identity не меняется.

## Принцип

Проект выпускает неофициальные unsigned/ad-hoc builds через draft GitHub Releases
по ADR-095. Нет Developer ID/Authenticode, notarization, Tauri updater или
автоматической установки обновлений.

GitHub Actions выполняет две независимые функции:

1. Создаёт проверенные versioned artifacts и draft Releases для Linux, Windows и macOS, включая ARM64.
2. Хранит Git tags `vX.Y.Z`, с которыми приложение может сравнить свою текущую SemVer.

Artifacts считаются тестовыми/неофициальными сборками. На macOS и Windows пользователь может увидеть Gatekeeper/SmartScreen warning, и это должно быть явно написано рядом с инструкцией скачивания.

## Матрица artifacts

| ОС      | Target                                         | Runner                  | CI artifact               |
| ------- | ---------------------------------------------- | ----------------------- | ------------------------- |
| Linux   | `x86_64-unknown-linux-gnu`                     | conservative Ubuntu x64 | `.deb`, `.AppImage`       |
| Linux   | `aarch64-unknown-linux-gnu`                    | native Ubuntu ARM64     | `.deb`, `.AppImage`       |
| macOS   | `x86_64-apple-darwin` + `aarch64-apple-darwin` | native Apple Silicon    | unsigned universal `.dmg` |
| Windows | `x86_64-pc-windows-msvc`                       | Windows x64             | unsigned NSIS `.exe`      |
| Windows | `aarch64-pc-windows-msvc`                      | Windows ARM64           | unsigned NSIS `.exe`      |

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

Linux x64 покрывается `quality-linux`: `pnpm check` собирает frontend и
выполняет Rust format/Clippy во всех предусмотренных конфигурациях, затем
запускаются Rust tests. Отдельный compile job для Linux x64 не требуется.
Unit/property/component suites запускаются один раз через `pnpm test:coverage`;
отдельный `pnpm test` дублировал бы те же проекты. Compile matrix содержит
Linux ARM64, Windows x64/ARM64 и macOS Intel/ARM64. Остальные gates сохранены.

Все Vitest projects наследуют `maxWorkers: 2` из `vitest.config.ts`.
Это общий бюджет параллельных процессов для unit, coverage, renderer и perf
gates: число CPU не учитывает память jsdom, native Canvas2D и CanvasKit.
Файлы сохраняют изоляцию; unhandled errors по-прежнему проваливают gate.
Для отдельного диагностического запуска число workers можно явно изменить
через `--maxWorkers`; CI использует общий default без override.

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

### `release.yml`

Trigger: manual dispatch, release-related PR либо tag `v*`.

1. Проверить SemVer tag и совпадение embedded version.
2. Выполнить обязательные test gates для того же commit SHA.
3. Собрать каждый target на native runner.
4. Проверить architecture и обязательные bundled resources.
5. Выполнить install/launch/fake-capture/export smoke.
6. Сформировать SHA-256 checksums, SBOM и license report.
7. Загрузить файлы как GitHub Actions artifacts с именем `cute-screen-<version>-<os>-<arch>`.
8. Сохранить test reports и предупреждение `UNSIGNED / UNOFFICIAL BUILD`.

Только tag push создаёт draft GitHub Release. Публикация ручная; updater
manifests отсутствуют. Подробный runbook и платформенные ограничения — выше.

## Контракт проверки версии

### Источники

- Current version: Tauri package/app metadata, получаемая через typed native adapter.
- Repository: compile-time `owner/repo`, задаваемый CI variable `CUTE_SCREEN_GITHUB_REPOSITORY`.
- Remote versions: публичный GitHub REST endpoint `GET /repos/{owner}/{repo}/tags?per_page=100`.
- При наличии `Link: rel=next` клиент следует максимум пяти страницам, чтобы ограничить запросы.
- Этот будущий контракт `REQ-REL-004` не реализован релизным workflow; наличие тега не гарантирует опубликованный Release или доступные binaries.

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
5. Tray, single-instance и CLI version/JSON.
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

- GitHub Actions retention может удалить CI artifacts; assets опубликованного GitHub Release от этого retention не зависят. Tag сам по себе не гарантирует binaries при failed workflow или неопубликованном draft.
- Для private repository без пользовательского GitHub token version check не поддерживается. План рассчитан на публичный repository.
- Unsigned Windows/macOS artifacts неизбежно могут вызывать OS warnings.
- Если в будущем потребуется официальный подписанный канал или auto-update, он проектируется отдельным ADR, а не добавляется скрыто в этот workflow.

## Перегенерация иконок

`pnpm icons:generate` воспроизводит SVG логотипа/редактора/favicon, отдельные
tray/template PNG и все bundle icons (PNG/ICO/ICNS) из единой геометрии в
`scripts/generate-brand-assets.mjs`. Команда использует существующие
`@napi-rs/canvas` и Tauri CLI; новые зависимости не требуются. `logo-mark.svg`
сохраняет выбранный монитор с ушами, прищурами и подставкой без фоновой плитки.
CLI запускается через текущий Node, без платформозависимого запуска pnpm shim.
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
GUI launch. Capture CLI и `--background` не открывают мастер. Для AppImage
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
