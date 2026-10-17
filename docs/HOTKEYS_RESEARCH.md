# Глобальные сочетания и запуск при входе

Исследование 2026-10-17. Native runtime support подтверждается отдельно от
изучения документации, исходников, компиляции и UI-тестов. Изменяемая ветка
upstream не является зафиксированной зависимостью проекта.

## Документация ОС

- [XDG GlobalShortcuts](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html):
  session-scoped BindShortcuts, фактический trigger_description,
  ShortcutsChanged; ConfigureShortcuts доступен начиная с версии 2.
  Session handle не является постоянным restore token.
- [GNOME 48](https://release.gnome.org/48/developers/): появление GlobalShortcuts.
  Ubuntu version не заменяет probe текущего session/backend.
- [GNOME 42 schema](https://raw.githubusercontent.com/GNOME/gnome-settings-daemon/gnome-42/data/org.gnome.settings-daemon.plugins.media-keys.gschema.xml.in)
  и [GNOME 46 schema](https://raw.githubusercontent.com/GNOME/gnome-settings-daemon/gnome-46/data/org.gnome.settings-daemon.plugins.media-keys.gschema.xml.in):
  custom-keybindings и relocatable name/binding/command. Приложение владеет
  только собственными путями, не обнуляет чужой список.
- [Gio.Settings](https://docs.gtk.org/gio/class.Settings.html): schema lookup,
  writability, delay/apply и sync. Запись binding не доказывает успешный grab
  compositor; для GNOME предусмотрен одноразовый проверочный CLI-вызов.
- [XDG Autostart](https://specifications.freedesktop.org/autostart/latest/)
  и [Desktop Entry](https://specifications.freedesktop.org/desktop-entry/latest-single/):
  пользовательский XDG_CONFIG_HOME/autostart, Hidden, TryExec и отдельные
  правила экранирования Exec. Нельзя использовать временный AppImage mount path.
- [Microsoft RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey):
  регистрация, WM_HOTKEY, MOD_NOREPEAT, конфликты, системные Win chords,
  зарезервированный F12 и особое поведение Print Screen.
- [Microsoft Run keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys)
  и [Startup apps](https://support.microsoft.com/en-us/windows/experience/startup-boot/configure-startup-applications-in-windows):
  per-user Run при входе, отсутствие гарантии немедленного запуска, управление
  средствами ОС. StartupApproved не является API для записи приложением.
- [Apple SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice)
  и [register](<https://developer.apple.com/documentation/servicemanagement/smappservice/register()>):
  macOS 13+, mainApp, состояние разрешения и переход в Login Items.
- [Apple login launch event](https://developer.apple.com/documentation/coreservices/1556410-launch_apple_event_constants/keyaelaunchedasloginitem)
  и [системные screenshot chords](https://support.apple.com/en-gb/102646):
  фоновый login lifecycle отделён от обычного запуска; Cmd+Shift+3/4/5
  не предлагаются приложением автоматически.

## Изученные программы и библиотеки

| Источник                                                                                                                                                                                                                                                                                | Snapshot                                 | Наблюдение                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [ShareX HotkeyManager](https://github.com/ShareX/ShareX/blob/7223e5363b365cdff5fb2b5448bc51083d3f1108/ShareX/HotkeyManager.cs)                                                                                                                                                          | 7223e5363b365cdff5fb2b5448bc51083d3f1108 | Действия, статусы регистрации, повторная попытка; transactional ordering проектируется самостоятельно       |
| [Spectacle settings](https://github.com/KDE/spectacle/blob/96e96f75d52c585f549a8b1f22226b0e8680686a/src/Gui/SettingsDialog/ShortcutsOptionsPage.cpp)                                                                                                                                    | 96e96f75d52c585f549a8b1f22226b0e8680686a | Отдельный экран, применение и отмена                                                                        |
| [Flameshot](https://github.com/flameshot-org/flameshot/blob/4bc3acacf0ddafe1782147389988c82698ee8158/src/core/globalshortcutfilter.cpp), [руководство](https://flameshot.org/docs/guide/key-bindings/)                                                                                  | 4bc3acacf0ddafe1782147389988c82698ee8158 | Трей, CLI и системные shortcuts; жёсткие Print Screen registrations не принимаются за универсальное решение |
| [Greenshot autostart](https://github.com/greenshot/greenshot/blob/5ad497af154cc891fd881f17e83445fc9b104953/docs/autostart.md)                                                                                                                                                           | 5ad497af154cc891fd881f17e83445fc9b104953 | Разделение installer choice, per-user Run и повторного запуска                                              |
| [ksnip macOS handler](https://github.com/ksnip/ksnip/blob/df69d12a08f0b941d70d3638721bbc7d7464f76a/src/gui/globalHotKeys/keyHandler/MacKeyHandler.cpp)                                                                                                                                  | df69d12a08f0b941d70d3638721bbc7d7464f76a | Наличие platform handler не доказывает поддержку: macOS registerKey возвращает false                        |
| [ShotMate hotkeys](https://github.com/shimentosh/ShotMate/blob/d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2/ShotMate/Hotkey/GlobalHotkeyManager.swift), [login](https://github.com/shimentosh/ShotMate/blob/d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2/ShotMate/Settings/LaunchAtLogin.swift) | d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2 | Carbon и фактический SMAppService status; проект не используется как доказательство зрелости всех платформ  |
| [Tauri global-hotkey Windows](https://github.com/tauri-apps/global-hotkey/blob/b4185ab2f37b62e4d1bd2b8410fcf93e338f55fc/src/platform_impl/windows/mod.rs)                                                                                                                               | b4185ab2f37b62e4d1bd2b8410fcf93e338f55fc | RegisterHotKey + MOD_NOREPEAT                                                                               |
| [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts/blob/772133d9dbe800fdac0473226822994c5c162c58/Sources/KeyboardShortcuts/HotKey.swift)                                                                                                                             | 772133d9dbe800fdac0473226822994c5c162c58 | Carbon registration, конфликт, key-down/key-up                                                              |

GPL-источники использованы для UX-наблюдений, код не копировался и не линковался.
В проекте зафиксирован permissive tauri-plugin-global-shortcut 2.3.2:
2.4.x требует Tauri 2.12 и несовместим с текущим pin 2.11.5. Rust plugin
доступен только Windows/macOS; Linux не проходит через его X11 backend.

## Выбранный UX

Первый ordinary GUI launch предлагает заранее включённый флажок автозапуска,
но изменение ОС выполняется только по подтверждению. Windows делает это в
NSIS; отказ, обновление и повторный запуск не заменяются новым default.
Холодный capture CLI не открывает мастер. Затем предлагается area shortcut
Ctrl+Shift+2 / Cmd+Shift+2 и recorder собственных клавиш.

Один Settings WebView обслуживает tray, native app menu и CLI. Native backend
проверяет регистрацию; GNOME читает известные конфликты и требует проверочного
нажатия. Portal остаётся системным редактором назначений. Нельзя обещать
полный каталог конфликтов или имя процесса-владельца на всех ОС.

## UX записи в строке (2026-10-17, ADR-075)

- [GNOME: Set keyboard shortcuts](https://help.gnome.org/gnome-help/keyboard-shortcuts-set.html):
  выбор действия сразу ведёт к вводу клавиш, Esc отменяет запись.
- [Apple: Use macOS keyboard shortcuts](https://support.apple.com/en-gb/guide/mac-help/-mchlp2262/mac):
  новое сочетание вводится рядом с текущим назначением.
- [VS Code: Keyboard shortcuts](https://code.visualstudio.com/docs/configure/keybindings):
  действия и назначения представлены списком; запись показывает распознанные
  клавиши, изменение и удаление — отдельные операции.

Вывод для Cute Screen: кнопка явно включает клавиатурную запись без второго
клика; поле результата не похоже на назначение мыши. Draft и обратная связь
находятся у действия, сохранение явное. Проверка/удаление раскрываются через
вертикальное троеточие. Навигация слева раскрывает наличие общих настроек.
Это UX-наблюдения; сторонний код и библиотеки не заимствуются.
