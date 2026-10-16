# CI-сборки и проверка версии через GitHub

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

Проект не создаёт официальный канал релизов. Нет code signing, notarization, GitHub Releases, Tauri updater или автоматической установки обновлений.

GitHub Actions выполняет две независимые функции:

1. Создаёт проверенные versioned artifacts для Linux, Windows и macOS, включая ARM64.
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

Запускается на pull request и branch push:

- Markdown links/docs consistency;
- formatting, lint, TypeScript и Rust checks;
- dependency/license/security audit;
- unit/property/component tests;
- renderer goldens;
- browser E2E;
- Linux fake-platform Tauri smoke;
- compile checks Windows/macOS и ARM targets.

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

### `build-artifacts.yml`

Trigger: manual dispatch либо tag `v*`.

1. Проверить SemVer tag и совпадение embedded version.
2. Выполнить обязательные test gates для того же commit SHA.
3. Собрать каждый target на native runner.
4. Проверить architecture и обязательные bundled resources.
5. Выполнить install/launch/fake-capture/export smoke.
6. Сформировать SHA-256 checksums, SBOM и license report.
7. Загрузить файлы как GitHub Actions artifacts с именем `cute-screen-<version>-<os>-<arch>`.
8. Сохранить test reports и предупреждение `UNSIGNED / UNOFFICIAL BUILD`.

Workflow не создаёт GitHub Release и не прикладывает updater manifests.

## Контракт проверки версии

### Источники

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
5. Tray, single-instance и CLI version/JSON.
6. Fake capture → editor → export.
7. Real platform capture/hotkey smoke на доступном runner.
8. Повторный запуск сохраняет library/settings.
9. Удаление не очищает пользовательскую библиотеку без отдельного выбора.
10. Downloaded file совпадает с опубликованным checksum.

## Supply chain без официальной подписи

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

- GitHub Actions retention может удалить старые artifacts; version tag останется, но это не обещание долгосрочной загрузки binary.
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
