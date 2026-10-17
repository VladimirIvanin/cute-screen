# Стратегия тестирования

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
