# CI-сборки и проверка версии через GitHub

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
  `@fontsource/roboto@5.3.0` одобрен как bundled Roboto из ADR-025. Обновление
  версии или другой OFL-пакет требует отдельного license audit и новой точной
  записи в allowlist.
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
