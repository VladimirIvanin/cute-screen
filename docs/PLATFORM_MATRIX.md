# Платформенная матрица

## Поддерживаемые цели

| Платформа       | Архитектура    | Захват                                | Горячие клавиши                        | Неофициальный CI artifact |
| --------------- | -------------- | ------------------------------------- | -------------------------------------- | ------------------------- |
| Linux X11       | x86_64         | `x11rb` adapter + собственный overlay | Tauri/global-hotkey                    | deb, AppImage             |
| Linux X11       | aarch64        | `x11rb` adapter + собственный overlay | Tauri/global-hotkey                    | deb, AppImage             |
| GNOME Wayland   | x86_64/aarch64 | XDG Screenshot portal                 | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| KDE Wayland     | x86_64/aarch64 | XDG Screenshot portal                 | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| wlroots Wayland | x86_64/aarch64 | Portal при наличии                    | Portal при наличии, иначе CLI fallback | deb, AppImage             |
| Windows         | x86_64         | Native adapter (M04) + overlay        | Tauri/global-hotkey                    | NSIS exe                  |
| Windows 11      | ARM64          | Native adapter (M04) + overlay        | Tauri/global-hotkey                    | NSIS exe                  |
| macOS           | Intel          | Screen capture adapter + overlay      | Tauri/global-hotkey                    | universal DMG             |
| macOS           | Apple Silicon  | Screen capture adapter + overlay      | Tauri/global-hotkey                    | universal DMG             |

Точные минимальные версии ОС фиксируются после runtime-проверки capture API и webview. Release baseline не повышается без ADR и CI-доказательства.

## Capture capabilities

| Возможность      | X11                                            | Wayland portal                                         | Windows               | macOS                   |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------ | --------------------- | ----------------------- |
| Area             | Custom frozen overlay                          | System selector                                        | Custom frozen overlay | Custom frozen overlay   |
| Screen           | Direct                                         | Portal target/capability                               | Direct                | Direct after permission |
| Window           | Direct/window list                             | Portal target/capability                               | Direct/window list    | Direct/window list      |
| Active window    | Window manager adapter                         | Portal when exposed, otherwise clear unavailable state | Native                | Native                  |
| Repeat last area | Stored physical/image geometry with validation | New portal interaction if silent reuse is unavailable  | Stored geometry       | Stored geometry         |
| Delay            | App countdown before backend invocation        | App countdown before portal                            | App countdown         | App countdown           |
| Cursor           | Capability-dependent                           | Portal-dependent                                       | Backend option        | Backend option          |

UI получает `CaptureCapabilities` и не показывает неподдерживаемый режим как рабочий. Если функция временно недоступна, control disabled с объяснением и доступной альтернативой.

## Hotkey behavior

| Сценарий                 | Требуемое поведение                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Комбинация свободна      | Сначала регистрируется новая, затем сохраняется и снимается старая        |
| Комбинация занята        | Новая не сохраняется, старая остаётся рабочей, показана ошибка            |
| Wayland portal доступен  | Открывается системный binding flow, сохраняется portal handle/token       |
| Portal не поддерживается | Показана точная команда и инструкция desktop environment                  |
| AppImage перемещён       | Fallback-инструкция обновляет абсолютный executable path                  |
| Приложение уже запущено  | CLI передаёт action single-instance процессу                              |
| Приложение не запущено   | Бинарник запускает минимальный capture lifecycle                          |
| Hotkey во время capture  | Повтор игнорируется либо ставится одна команда; параллельных overlays нет |

## Multi-monitor и DPI

Обязательные layouts:

- один монитор 100%;
- два горизонтальных монитора с отрицательной X-координатой;
- вертикально расположенные мониторы;
- primary 100% + secondary 150/200%;
- Retina/HiDPI macOS;
- монитор отключён после сохранения repeat-area;
- окно пересекает два монитора.

Хранятся logical и physical bounds с monitor ID/scale snapshot. Перед repeat-area геометрия валидируется и при необходимости ограничивается текущим monitor layout.

## Permissions и ошибки

### Linux

- Отмена portal считается ожидаемым результатом, а не ошибкой приложения.
- Недоступный portal backend диагностируется отдельным capability/error code.
- Приложение не устанавливает `grim`, `slurp` или desktop extensions.

### macOS

- Screen Recording permission проверяется до custom overlay.
- UI даёт кнопку перехода в System Settings и повторную проверку.
- Отказ не оставляет прозрачные окна или зависший capture session.

### Windows

- Локальный M01 smoke на Windows x64 подтвердил WebView2 runtime: asset decode,
  binary IPC/Blob fallback и typed error для corrupted PNG.
- CanvasKit/WebGL startup в проверенном WebView2 перешёл на Canvas2D fallback;
  это не подтверждает primary CanvasKit path для Windows.
- Mixed DPI, политика запуска в фоне, capture и hotkey остаются pending до M04
  system smoke.
- Повторная установка более новой CI-сборки не должна удалять shortcut configuration или library.

## Runtime evidence

Каждая platform-row получает:

- OS/version и architecture;
- desktop/session (`X11`, `GNOME Wayland`, `KDE Wayland`);
- app artifact SHA;
- capture action;
- hotkey/CLI activation;
- monitor layout;
- expected/actual result;
- ссылку на log/screenshot/test run.

Статус `supported` разрешён только после реального smoke, а не после успешной компиляции.

## M01 capability baseline

- `xcap` 0.9.7 отклонён из-за security advisories в dependency graph; решение и отдельный `x11rb` 0.14.0 boundary зафиксированы в ADR-019.
- Локальный Ubuntu/GNOME X11 controlled-window smoke подтвердил monitor enumeration, physical millimetres, coordinates, 96×64 RGBA capture и SHA-256. До появления устойчивой CI artifact URL это локальная диагностика, не статус `supported`.
- Локальный X11 portal probe увидел Screenshot v2 без `AvailableTargets` и без GlobalShortcuts. Это не evidence для GNOME/KDE Wayland; обе строки остаются `pending`.
- WebKitGTK 2.52.3, локальный Windows x64 / WebView2 smoke (2026-08-08) и
  локальный macOS 12.7.6 x64 / WKWebView 605.1.15 smoke (2026-08-09)
  подтвердили scoped asset decode, binary IPC fallback и typed error для
  corrupted PNG. Во всех трёх runtime CanvasKit/WebGL startup перешёл на
  Canvas2D fallback.
- Windows M01 Tauri E2E: `pnpm test:e2e:tauri` (2026-08-09, Windows x64 /
  WebView2) прошёл четыре per-scenario прогона — `tauri-foundation.e2e.ts`,
  `tauri-renderer-alpha.e2e.ts`, `tauri-renderer-binary.e2e.ts`,
  `tauri-renderer-corrupted.e2e.ts`; артефакты в `artifacts/tauri-e2e/junit-*`.
- macOS M01 Tauri E2E: `pnpm test:e2e:tauri` (2026-08-09, macOS 12.7.6 x64 /
  Intel i7-4770HQ / WKWebView 605.1.15, SHA `22119a9`) прошёл те же четыре
  per-scenario прогона; Canvas2D startup fallback, asset alpha decode, binary
  ICC fallback и corrupt error подтверждены; артефакты в
  `artifacts/tauri-e2e/junit-*`.

## CLI fallback contract (M04 dispatch pending)

- Установленный deb: `cute-screen capture --mode area`.
- AppImage: shell-quoted абсолютный путь из `current_exe`, затем те же аргументы `capture --mode area`; перемещение AppImage требует заново сформировать строку.
- M01 только фиксирует строку и capability state. Single-instance dispatch и выполнение capture реализуются в M04; отсутствие portal нельзя объявлять success.
