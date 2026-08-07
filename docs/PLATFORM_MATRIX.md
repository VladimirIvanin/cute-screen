# Платформенная матрица

## Поддерживаемые цели

| Платформа       | Архитектура    | Захват                               | Горячие клавиши                        | Неофициальный CI artifact |
| --------------- | -------------- | ------------------------------------ | -------------------------------------- | ------------------------- |
| Linux X11       | x86_64         | Native backend + собственный overlay | Tauri/global-hotkey                    | deb, AppImage             |
| Linux X11       | aarch64        | Native backend + собственный overlay | Tauri/global-hotkey                    | deb, AppImage             |
| GNOME Wayland   | x86_64/aarch64 | XDG Screenshot portal                | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| KDE Wayland     | x86_64/aarch64 | XDG Screenshot portal                | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| wlroots Wayland | x86_64/aarch64 | Portal при наличии                   | Portal при наличии, иначе CLI fallback | deb, AppImage             |
| Windows         | x86_64         | Native/xcap adapter + overlay        | Tauri/global-hotkey                    | NSIS exe                  |
| Windows 11      | ARM64          | Native/xcap adapter + overlay        | Tauri/global-hotkey                    | NSIS exe                  |
| macOS           | Intel          | Screen capture adapter + overlay     | Tauri/global-hotkey                    | universal DMG             |
| macOS           | Apple Silicon  | Screen capture adapter + overlay     | Tauri/global-hotkey                    | universal DMG             |

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

- Проверяются WebView2 runtime, mixed DPI и политика запуска в фоне.
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
