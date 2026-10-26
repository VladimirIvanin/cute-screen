# Скриншотилки Windows и macOS: подходы и тесты

Исследование 2026-10-26. Изучены исходники и тесты на зафиксированных commits,
а также выбранные issues. Чужие программы и их тесты локально не запускались.
Идея теста не считается подтверждением поддержки Cute Screen.
GPL/AGPL-код не переносился и не линковался; реализации и тесты Cute Screen
пишутся самостоятельно по нашим контрактам.

## Источники

| Проект                                                         | Платформа и snapshot                                                                  | Что действительно найдено                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Greenshot](https://github.com/greenshot/greenshot)            | Windows, `304e2727f94b9a197ac9ab19862147ad225c3a91`                                   | xUnit, настоящий clipboard, fixture-окна для Windows Graphics Capture, HDR/WARP, STA/UI dispatcher, hotkey validation                                                                                                      |
| [ShareX](https://github.com/ShareX/ShareX)                     | Windows, `f3ae963af1c03c242f58adf162d3dffc1d45c657`                                   | Явная physical-pixel геометрия frozen capture; PR CI собирает x64/ARM64 и несколько конфигураций. В просмотренном tree/PR workflow автоматическую behavioral suite не обнаружил; MonitorTest — пользовательский инструмент |
| [ShotMate](https://github.com/shimentosh/ShotMate)             | macOS, `d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2`                                     | Coordinator одной сессии, freeze перед активацией overlay, возврат фокуса, отмена при смене экранов, PNG + ленивый TIFF. Test target в просмотренном tree не найден                                                        |
| [BetterShot](https://github.com/KartikLabhshetwar/better-shot) | macOS, `0e005e9ce4bcf0c35f6672367e659039bbb85f90`                                     | Отдельные executable checks геометрии, frozen pixels, clipboard, recorder; opt-in native window capture integration. Основная LICENSE BSD-3-Clause, но содержит AGPL-компоненты и отдельные условия combined distribution  |
| [ScreenshotTool](https://github.com/danjboyd/ScreenshotTool)   | macOS/AppKit; также GNUstep Windows/Linux, `169f8b3ca336e50c57e7f488cd501d0895ff67cd` | XCTest probes поведения canvas/окон, цвета export, crop undo, fractional Fit; отдельный macOS runner. GNUstep runner изолирует классы процессами и отклоняет пропуски из-за отсутствия display                             |

## Что полезно Cute Screen

### 1. Проверять результат clipboard через чужой процесс и разные форматы

[Greenshot ClipboardTests](https://github.com/greenshot/greenshot/blob/304e2727f94b9a197ac9ab19862147ad225c3a91/src/Greenshot.Tests/Core/ClipboardTests.cs)
проверяют настоящий PNG/DIB/DIBV5, alpha и premultiplied pixels, сериализуют
clipboard tests и каждый раз устанавливают собственные данные.
[BetterShot ClipboardImageCheck](https://github.com/KartikLabhshetwar/better-shot/blob/0e005e9ce4bcf0c35f6672367e659039bbb85f90/Tests/ClipboardImageCheck.swift)
использует private pasteboard: PNG рядом с TIFF, TIFF-only, JPEG, удалённый file URL,
ошибка записи и повторный paste без перезаписи файла.

У нас `services/clipboard.rs` держит native owner живым и передаёт изображения
бинарно. В текущую доработку добавлен Windows native сценарий: production
Capture → аннотация → Copy → Quick закрыт → отдельный STA-процесс читает bitmap →
повторное декодирование PNG, размеры, непрозрачность и наличие аннотации.
Следующий полезный шаг: native round-trip alpha/полупрозрачных цветов, разные
clipboard formats и повторная вставка после следующего захвата на обеих ОС.
Тест непрозрачного screenshot не доказывает alpha interoperability.

### 2. Проверять каждый display scale, origin и пиксели после crop

[BetterShot FrozenScreenFrameCheck](https://github.com/KartikLabhshetwar/better-shot/blob/0e005e9ce4bcf0c35f6672367e659039bbb85f90/Tests/FrozenScreenFrameCheck.swift)
проверяет 1×/2×, отрицательные origins, top-left orientation, дробный crop,
выход за границу и равенство повторно декодированного PNG исходным frozen pixels.
[RegionGeometryCheck](https://github.com/KartikLabhshetwar/better-shot/blob/0e005e9ce4bcf0c35f6672367e659039bbb85f90/Tests/RegionGeometryCheck.swift)
отдельно проверяет local/global round-trip и resize через противоположную сторону.
[ShareX capture request](https://github.com/ShareX/ShareX/blob/f3ae963af1c03c242f58adf162d3dffc1d45c657/ShareX.ScreenCaptureLib/Presentation/RegionCapture/AvaloniaRegionCaptureRequest.cs)
явно разделяет bitmap и физические desktop bounds.

У нас уже есть logical/physical geometry и macOS unit cases отрицательного origin,
разных масштабов и вертикального расположения в `platform/macos/virtual_desktop.rs`.
Пробел — доказательство на настоящих экранах: Windows 100/125/150/200%, Retina + 1×,
экран слева/сверху, перенос редактора между экранами, unplug/sleep во время Quick,
затем decoded crop/export/clipboard без сдвига и лишних прозрачных полос.
[Greenshot #1360](https://github.com/greenshot/greenshot/issues/1360) описывает
ошибку только preview при переносе между экранами: правильный export сам по себе
не доказывает правильность preview. [ShareX #8908](https://github.com/ShareX/ShareX/issues/8908)
сообщает о проблеме на конфигурации из четырёх мониторов; причина по этому issue
не установлена.

[Greenshot WindowsGraphicsCaptureTests](https://github.com/greenshot/greenshot/blob/304e2727f94b9a197ac9ab19862147ad225c3a91/src/Greenshot.Tests/Core/WindowsGraphicsCaptureTests.cs)
создают fixture-окно и проверяют цвет реального захвата дочерней области;
отдельно проверяют repeated capture/device reuse и WARP fallback. Для нашего
physical smoke полезно собственное окно с известной сеткой цветов: декодировать
Area/Window/Screen и проверить содержимое, а не только размеры PNG. HDR и RDP
нуждаются в отдельных результатах. Наличие этих тестов не является основанием
менять выбранный в Cute Screen capture backend.

### 3. Проверять весь lifecycle горячей клавиши

[Greenshot #1119](https://github.com/greenshot/greenshot/pull/1119) выносит тяжёлый
capture из low-level keyboard hook; [#1140](https://github.com/greenshot/greenshot/pull/1140)
исправляет потерю hotkeys после Win+L. У нас Windows backend использует
RegisterHotKey через Tauri, поэтому копировать hook workaround оснований нет.
Нужны runtime сценарии lock/unlock, sleep/resume, конфликт регистрации,
удержание клавиши без повторного capture и быстрые повторные нажатия.
Текущий Busy-тест покрывает общий dispatcher и одну Quick surface, но вызывает
его с разными invocationSource; он не имитирует физический hotkey/tray click.

[BetterShot ShortcutRecorderFieldCheck](https://github.com/KartikLabhshetwar/better-shot/blob/0e005e9ce4bcf0c35f6672367e659039bbb85f90/Tests/ShortcutRecorderFieldCheck.swift)
проверяет Escape без изменения binding, repeat, потерю focus/window, modifiers,
Delete и сбалансированное включение/выключение recording. У нас есть транзакция
регистрации, rollback и отдельный recording mode. Стоит добавить native сценарий:
начать запись → уйти из Settings/закрыть окно → прежняя глобальная клавиша снова
работает; проверить RU/EN layout и macOS labels отдельно.

### 4. Freeze до показа overlay, затем вернуть пользователя в исходное приложение

[ShotMate coordinator](https://github.com/shimentosh/ShotMate/blob/d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2/ShotMate/Capture/CaptureCoordinator.swift)
сохраняет предыдущее приложение, получает frozen frames, затем активирует overlay;
при Copy/Cancel возвращает focus, при отмене Save dialog сохраняет аннотации.
Смена screen topology отменяет сессию. Это полезные наблюдаемые контракты,
а не предложение перенести весь coordinator.

[BetterShot #172](https://github.com/KartikLabhshetwar/better-shot/issues/172)
описывает исчезновение чужого меню при активации selector до capture. Для нас
нужен end-to-end: открыть меню чужого приложения → hotkey → в снимке есть меню →
Copy → немедленный Ctrl/Cmd+V в исходное приложение без дополнительного click.
Отдельно Cancel и закрытие исходного приложения во время capture. Отмена save
не должна уничтожать draft или молча материализовать результат.

### 5. Разрешения macOS проверять после login/restart и с постоянной identity

[ShotMate build notes](https://github.com/shimentosh/ShotMate/blob/d7c6e387f67aa1ce0cb5e9c3c028aba2094aaca2/README.md)
предупреждают о повторном TCC consent при ad-hoc rebuild; stable signing identity
нужна для воспроизводимых permission tests.
[BetterShot #171](https://github.com/KartikLabhshetwar/better-shot/issues/171)
содержит репорт отказа после login при ранее выданном разрешении, исправляющегося
relaunch. Указанное в issue объяснение про ранний cached denial — гипотеза автора.

Матрица для нашего подписанного build: never granted → deny → grant → capture;
revoke во время работы; повторный запуск, login launch и обновление приложения
с сохранённой identity. Чёрный wallpaper-only результат нельзя принимать за
успешный снимок чужого окна. Этот runtime в Windows/WSL не проверяется.

### 6. Не принимать пропуски desktop tests за поддержку платформы

[Greenshot InteractiveDesktopFact](https://github.com/greenshot/greenshot/blob/304e2727f94b9a197ac9ab19862147ad225c3a91/src/Greenshot.Tests/InteractiveDesktopFactAttribute.cs)
явно пропускает locked/inactive desktop.
[ScreenshotTool runner](https://github.com/danjboyd/ScreenshotTool/blob/169f8b3ca336e50c57e7f488cd501d0895ff67cd/Tools/run_tests.sh)
наоборот отклоняет отсутствие display в обязательном прогоне, изолирует defaults
и запускает классы последовательно отдельными процессами.
Для Cute Screen полезен строгий итог: unsupported/blocked/skipped с причиной,
отдельные результаты fake capture, private D-Bus и физической платформы.
Уже используем отдельные appData, fresh native binary, screenshots и JUnit;
обязательный native lane не должен становиться зелёным после пропуска всех cases.

Дополнительные полезные checks:
[fractional Fit](https://github.com/danjboyd/ScreenshotTool/blob/169f8b3ca336e50c57e7f488cd501d0895ff67cd/Tests/FitViewportRoundingProbe_test.m)
для half-point viewport и resize loops; проверка цвета/alpha после экспорта;
настоящая большая fixture для perf. Их stretched tiny bitmap проверяет геометрию,
но не служит performance evidence по нашим правилам.

## Приоритет проверок

| Приоритет | Сценарий                                                                         | REQ                                   | Где требуется запуск                      |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| P0        | Focus до первого Escape; Copy → paste в исходном приложении; меню в frozen frame | REQ-CAP-012, REQ-EXP-001, REQ-ACT-011 | Windows desktop и Mac                     |
| P0        | TCC deny/grant/revoke, login/relaunch/update signed identity                     | REQ-CAP-014                           | Mac                                       |
| P0        | Mixed DPI/Retina, negative origin, перенос окна; preview + decoded output        | REQ-CAP-012, REQ-EXP-001              | Несколько настоящих мониторов Windows/Mac |
| P1        | Hotkey после lock/sleep; recorder blur/close; конфликт и repeat                  | REQ-ACT-003/006/011                   | Windows/Mac native input                  |
| P1        | Clipboard alpha/format interoperability и повторная вставка                      | REQ-EXP-001                           | Windows/Mac clipboard readers             |
| P1        | Fractional Fit и resize loops без изменения document/history                     | REQ-EDT-001                           | Core/property + native WebView            |

Текущие результаты Cute Screen, включая portal cancellation/token и новые native
регрессии, фиксируются в [TESTING.md](TESTING.md). Запись экрана, OCR и scrolling
из изученных программ остаются вне scope продукта.
