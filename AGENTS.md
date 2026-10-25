# Cute Screen: правила работы в репозитории

Этот файл задаёт обязательные инженерные ограничения для людей и coding-агентов. Он не заменяет продуктовую и архитектурную документацию.

## Что прочитать перед изменениями

1. `docs/PRODUCT.md` — требования `REQ-*`.
2. `docs/DECISIONS.md` и `docs/ARCHITECTURE.md` — принятые ограничения.
3. `docs/TESTING.md`, `docs/TRACEABILITY.md` и `docs/ACCEPTANCE.md` — требуемые доказательства.
4. `docs/PLATFORM_MATRIX.md` и `docs/BUILD_RELEASE.md` — платформенные и сборочные гарантии.

## Неподвижные инварианты

- Vue не владеет глубоко реактивным scene graph и не перерисовывается на каждый `pointermove`.
- Любое изменение документа проходит через `EditorCommand` и поддерживает undo/redo.
- Оригинальные снимки неизменяемы; экспорт никогда не перезаписывает оригинал.
- Внутри приложения изображения не передаются через JSON/base64. Единственное
  исключение — уменьшенный внешний MCP ImageContent в stdio companion по ADR-154;
  оригинальные bytes и внутренний IPC остаются бинарными.
- `ToolRail` находится внизу; `ContextToolbar` над ним показывает defaults
  инструментов из REQ-EDT-015 и специальный режим Crop (ADR-069).
  Text/Callout показывают форматирование после размещения. В Quick Capture
  автоматические настройки не пересекают рамку; при нехватке места доступны
  кнопкой. ПКМ/Shift+F10/ContextMenu остаются дополнительным доступом к defaults.
  Стили экземпляров/групп редактируются единственной transient-панелью у
  выделения; inline text имеет собственную панель над текстом.
  Панель слоёв не дублирует tool options.
- Поведение после создания определяется таблицей в `docs/PRODUCT.md`: номера и штрихи сохраняют инструмент, однократные инструменты переходят в выбор созданного объекта.
- Wayland использует разовый XDG Screenshot, встроенный GNOME compatibility client или внешние системные helpers по ADR-122; ScreenCast не используется. Нельзя заявлять универсальную поддержку через X11-only hotkey backend.
- Пустые `catch {}` запрещены. Ожидаемая отмена должна быть отличима от ошибки.
- Eraser, автоматическая цензура, OCR, auto-series, scrolling capture и запись экрана не входят в продукт.
- GPL-код нельзя копировать или линковать. UX-наблюдения из GPL-проектов допустимы.

## Как вносить изменения

1. Добавить или уточнить строки `REQ-*` в `docs/TRACEABILITY.md` до реализации.
2. Для `editor-core` и Rust core сначала написать failing test для нового контракта.
3. Реализовать минимальный вертикальный срез вместе с loading, empty, disabled, focus, error и cancel состояниями.
4. Прогнать относящиеся к изменению стабильные проверки.
5. Зафиксировать фактические команды, платформу и артефакты проверки.
6. Обновить ADR, platform matrix и acceptance matrix, если поведение изменилось.

## Форматирование кода

- Использовать `eslint.format.config.js` для TypeScript, JavaScript и Vue;
  Prettier с `.prettierrc.json` — для CSS, JSON, YAML, Markdown и HTML.
- Не уплотнять функции, несколько инструкций или длинную Vue-разметку вручную
  в одну строку. При ширине 120 named imports/exports с двумя и более именами,
  объявления функций с двумя и более параметрами и списки `extends` имеют
  отдельную строку на элемент. Условия с тремя и более проверками разбиваются
  по проверкам. Существующие переносы объектов, массивов и вызовов сохраняются.
- Не запускать Prettier напрямую с `--ignore-path` в обход `.prettierignore`
  для исходников JS/TS/Vue: это снова склеит структурные переносы. Generated IPC
  bindings сохраняют формат генератора и исключены из ESLint-форматирования.
- После изменений запускать `pnpm format`, перед завершением —
  `pnpm format:check`. Проверка форматирования также входит в `pnpm check`.
- Rust форматировать через `cargo fmt --all`.

## Что не считается доказательством

- Наличие компонента, метода, store action или CSS-класса.
- Unit-тест платформенной функции, которую пользователь вызывает через реальный webview.
- Тест, заранее создающий состояние, которое production mount-flow должен создать сам.
- Проверка существования экспортированного файла без повторного декодирования.
- Успех на маленькой синтетической fixture вместо production-like данных.
- Ручная фраза «работает» без платформы, шага воспроизведения и результата.

## Команды проекта

Следующие команды считаются стабильным интерфейсом репозитория:

```text
pnpm check              # lint + typecheck + formatting check
pnpm test               # TypeScript/Vue unit and component tests
pnpm test:render        # renderer golden tests
pnpm test:e2e:browser   # WebdriverIO browser mode
pnpm test:e2e:tauri     # real Tauri webview
pnpm test:perf          # controlled performance suite
pnpm tauri build        # local platform build
cargo test --workspace  # Rust unit/integration tests
```

Если команда пока недоступна, это должно быть явно указано в описании изменения; нельзя заменять её незафиксированным локальным скриптом.

## Дисковая гигиена разработки

- При заметном росте workspace, перед созданием отдельного target и в конце
  тяжёлой задачи проверять `pnpm disk:usage`. Разбирать крупнейшие каталоги и
  убирать заброшенные временные файлы; фиксировать размер до/после. Размер
  полезного build cache сам по себе не является основанием для удаления.
- Обычная разработка использует один workspace `target/`. Не создавать
  `artifacts/<task>-target`, `target/<task>` и собственный `CARGO_HOME` на каждую
  задачу. При занятом executable сначала дождаться текущей сборки; если нужна
  изоляция, переиспользовать один `target/e2e-isolated` с сохранением его cache.
  Удалять только заведомо заброшенные отдельные targets; не удалять target
  другой активной задачи.
- Frontend/UI проверять через `pnpm dev` и относящиеся browser/component tests.
  Rust проверять минимальной подходящей командой `cargo check`/`cargo test`;
  `pnpm tauri dev` — для native разработки. Для локального standalone smoke
  использовать `pnpm tauri build --debug --no-bundle`. Полный release/package
  build нужен для проверки release/package контракта, а не после каждой UI-правки.
  Штатный `pnpm test:e2e:tauri` уже передаёт `--debug --no-bundle` и собирает
  свежий harness; нельзя подменять его старым бинарником ради экономии места.
- Сохранять полезный общий Cargo cache (`target/debug`, `deps`, `build`,
  `incremental`, release cache), `node_modules` и driver-cache: они ускоряют
  следующие запуски. Не отключать incremental и не менять Cargo profiles ради
  уменьшения папки. Не менять постоянно `RUSTFLAGS`, profiles и feature sets
  без необходимости: Cargo хранит разные варианты зависимостей.
- Временные browser/WebView profiles, pin-копии executable и временные configs
  должны иметь владельца и cleanup в `afterSession`/`finally`. Persistence group
  живёт до последнего reopen-сценария. Неуспешные appData сохранять только для
  диагностики, удалять после её завершения; не копить весь runtime в evidence.
- `pnpm clean:artifacts` сначала показывает список; `pnpm clean:artifacts --apply`
  удаляет только известные временные Chrome profiles, pin-бинарники и configs.
  Перед очисткой остановить тесты и свои временные приложения. Команда проверяет
  активные пути/ссылки/tracked artifacts, сохраняет reports, screenshots,
  failed appData и driver-cache. После аварийного завершения запускать её вручную.
- Cargo clean использовать для заведомо заброшенного отдельного target либо
  при доказанной поломке cache/явном запросе владельца. Для завершённой
  заброшенной изолированной сборки: `cargo clean --target-dir target/e2e-isolated`, сначала
  тот же вызов с `--dry-run` и проверкой абсолютного пути. Общий `target/debug`
  и `incremental` в обычный cleanup не включать. После clean ожидается холодная
  перекомпиляция. Внешний `CARGO_TARGET_DIR` проверять отдельно.
- В `artifacts/<task>/` оставлять краткий итог с command/platform/commit,
  нужные JSON/JUnit/log и выбранные screenshots. Заменённые успешные повторы,
  frontend-копии, тестовые библиотеки и скачанные временные инструменты удалять
  по завершении задачи. Для расследуемого сбоя оставить один актуальный комплект;
  спустя 7 дней пересмотреть необходимость хранения. Не удалять оригиналы
  пользователя, fixtures/goldens, исходники, `.git`, lockfiles и release evidence.
- `node_modules` и глобальные Cargo/pnpm stores не очищать автоматически.
  `pnpm store prune` относится к общему store, не к Rust `target`; не включать
  его в обычный test/build workflow. `.gitignore` не ограничивает размер файлов.
  Подробности и первоисточники: [BUILD_RELEASE.md](docs/BUILD_RELEASE.md).

## Правило изменения решений

Accepted ADR не редактируется задним числом. Создаётся новый ADR со статусом `accepted`, старый получает `superseded` и ссылку на замену. Новое решение обязано содержать проверяемое основание.
