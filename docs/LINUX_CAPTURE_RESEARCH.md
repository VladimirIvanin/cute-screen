# Linux: системный диалог и Capture unavailable

Исследование 2026-10-19, исходная ветка main обновлена fast-forward с `3304e55`
до `7856504`. Наблюдаемое окружение: Ubuntu 22.04.5 x64, GNOME, Wayland;
Screenshot portal сообщает version 2.

## Итог: встроенный клиент и причина наложения окон (2026-10-20, ADR-122)

На установленном GNOME 42.9 проверен встроенный Screenshot D-Bus через старое
имя совместимости `org.gnome.Screenshot`. Обычный sender получает AccessDenied,
но Shell этой версии разрешает клиенту с указанным именем разовый Screenshot.
Три вызова с `flash=false`: 142–164 мс; с полным декодированием PNG и освобождением
имени — 186–223 мс. Это время backend-прототипа, а не всего Quick UI.

В продукт добавлен собственный Rust-клиент, без GPL-кода, внешней утилиты и
расширения. Отдельное соединение занимает имя только на время снимка, DoNotQueue,
без замены владельца; занятое имя даёт Busy. Есть timeout/cancel, приватный PNG,
полное декодирование и закрытие соединения на всех исходах. Auto на GNOME ≤42
использует этот путь; установленный gnome-screenshot остаётся fallback технической
ошибки. Busy, отказ в доступе и отмена fallback не запускают. Современные GNOME/KDE
сохраняют portal. См. [ADR-122](DECISIONS.md#adr-122-встроенный-screenshot-client-для-старого-gnome).

Прямой одноразовый Mutter ScreenCast также проверен: frame 64–132 мс, Stop
успешен, но GNOME сохраняет sharing indicator минимум 5 секунд. Это видно в
установленном `ui/status/remoteAccess.js`; поэтому даже этот вариант отклонён.
Production ScreenCast не использует.

Замена безусловных 200 мс одним GTK hide + GdkDisplay.sync выявила реальный дефект:
в PNG попадало затухающее окно редактора поверх другого окна. В установленном
`ui/windowManager.js` destroy animation занимает 150 мс; Wayland roundtrip
подтверждает доставку unmap, а не завершение эффекта. Теперь после фактического
или совсем недавнего hide ждём только остаток защитного интервала 200 мс.
Если приложение уже скрыто, дополнительной паузы нет. Отдельный tray menu delay
сохранён.

Реальные два Area и reopen прошли в WebKitGTK без доступного helper, затем с
явным внешним helper. В production PNG число пикселей тестового пурпурного
маркера окна уменьшилось с 69 317 (red) до 17 (фон, green); новый initial frame
также проверен визуально. Старая рамка отсутствует, drafts различны,
сохранённый original/crop полностью декодирован. Debug click-to-reveal:
1131–1484 мс для встроенного пути и 1868–2306 мс для helper. Это отдельная
метрика с подготовкой Quick WebView; её нельзя подменять backend 142–164 мс.
Evidence: `artifacts/mutter-one-shot-2026-10-20`.

Ниже сохранены этапы исследования и первоначальные гипотезы. Их ограничения
уточнены результатом ADR-122 выше.

## Готовые решения и обсуждения задержки (2026-10-20)

По дополнительному запросу владельца проверены обсуждения и исходники проектов,
а не только описания приложений. Готовый drop-in helper для GNOME 42,
дающий внутреннюю Shell texture обычному приложению, пока не найден.

| Вариант                                                                                                      | Что реально делает                                                                                    | Применимость здесь                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Wayshot (Savalinn)](https://github.com/Savalinn/Wayshot)                                                    | Отдельный Shell extension отдаёт разовый снимок через D-Bus; MIT/Apache                               | Архитектурный пример; автор проверял GNOME 50, не 42                                                                                                                                                    |
| [Kapture helper](https://github.com/yeakiniqra/Kapture/tree/main/extension)                                  | Extension сам обрабатывает shortcut и передаёт PNG приложению; callable capture API не экспортируется | Metadata GNOME 45–50; готовым bridge для Cute Screen не является                                                                                                                                        |
| [ArrowShot](https://github.com/etiennasse/ArrowShot), [QuickSnap](https://github.com/SnowTimSwiss/QuickSnap) | Весь capture/selection работает внутри Shell                                                          | ArrowShot явно исключает ≤44; QuickSnap объявляет 46–50                                                                                                                                                 |
| [Allow gnome-screenshot](https://github.com/siddhpant/allow-gnome-screenshot)                                | Возвращает утилиту в allowlist GNOME 49                                                               | На GNOME 42 утилита уже разрешена; запуск/flash/re-encode это не ускоряет                                                                                                                               |
| [snapclip](https://github.com/gitoffmylibrary/snapclip)                                                      | Прямой Mutter ScreenCast: один PipeWire frame, затем Stop в finally; MIT                              | Автор заявляет около 0.2 с на GNOME 50; не наш прежний постоянный XDG session, но всё ещё ScreenCast. GUI требует GTK ≥4.14. Frame и Stop проверены; остающийся на 5 с indicator исключает этот вариант |
| Отдельная сборка gnome-screenshot без flash                                                                  | Shell D-Bus уже принимает flash=false; меняется внешний helper, продукт GPL-код не включает           | Возможный эксперимент на 42: убирает ожидание flash, но сохраняет startup и повторное PNG сохранение; пока не собирали                                                                                  |

Последний вариант описан в [обсуждении Ask Ubuntu](https://askubuntu.com/questions/854350/disable-gnome-screenshots-camera-flash-animation).
Его механизм подтверждается исходниками официального tarball 41.0 и Shell:
flash=true зашит в helper; при false Shell не ждёт Flashspot. Это не CLI-флаг
стандартной установленной утилиты. Готовый поддерживаемый no-flash пакет для
этого host не подтверждён. В [обсуждении GNOME](https://discourse.gnome.org/t/take-screenshot-in-gnome-environment-via-its-dbus-api/21144)
также разбирается прямой Screenshot API; доступность интерфейса сама по себе
не означает разрешение внешнего sender. Переход на X11 и unsafe_mode не нужны
для продолжения исследования и не выполнялись.

### Происхождение наших 200 мс

`git blame` связывает безусловный settle_wayland_capture_surfaces с коммитом
2cfb3aa2 от 2026-10-19 «Use reusable Wayland ScreenCast sessions for capture».
Это наш таймер после hide(), а не требование протокола. Он сохранился после
удаления ScreenCast. Отдельная задержка закрытия tray menu уже задана
TRAY_MENU_DISMISS_DELAY_MS=200, поэтому для tray эти паузы суммируются.
REQ-CAP-006 при этом обещает отсутствие дополнительной паузы для hotkey/CLI/UI.

Кандидат замены — завершить hide на GTK thread и дождаться compositor roundtrip,
а не фиксированного интервала. [GTK 3 Wayland backend](https://github.com/GNOME/gtk/blob/gtk-3-24/gdk/wayland/gdkdisplay-wayland.c)
реализует GdkDisplay.sync через wl_display_roundtrip. На idle GdkWaylandDisplay
здесь измерены 5.933/0.244/0.079/0.068/0.053 мс. Это проверка доступности API и
времени roundtrip, а не доказательство правильного unmap/capture в Tauri.
Первоначальная гипотеза чистого roundtrip позднее опровергнута native gate;
исправление описано в итоге ADR-122 выше. Аналогичная история
лишнего таймера есть у [Flameshot](https://github.com/flameshot-org/flameshot/discussions/3032):
maintainer подтвердил, что старый --delay 500 в shortcut больше не требовался.

## Задержка helper и встроенный захват GNOME (2026-10-20)

После замечания владельца проверен именно установленный GNOME Shell 42.9:
`ui/screenshot.js` и `misc/util.js` прочитаны из gresource libgnome-shell.so.
Сравнение с upstream 42.9 важно: Ubuntu содержит дополнительные изменения.
Встроенный ScreenshotUI вызывает `Shell.Screenshot.screenshot_stage_to_content`,
показывает texture внутри Shell и только после выбора кодирует/сохраняет PNG.
Это привилегированный внутренний API композитора, а не API внешнего Wayland-клиента.

Внешний gnome-screenshot 41.0 вызывает разрешённый для него Shell D-Bus Screenshot
с flash=true. Shell ожидает и сохранения, и завершения Flashspot (500 мс),
а helper затем читает и повторно сохраняет PNG. Три новых отдельных запуска:
D-Bus вызов через 234–245 мс, полностью декодированный промежуточный PNG через
464–490 мс, создание выходного файла через 796–801 мс, exit через 964–984 мс.
Это wall time helper, без времени нашего preflight/Quick WebView. Текущий
Wayland preflight дополнительно ждёт 200 мс после скрытия поверхностей.
Ранее записанные 1334–1427 мс также остаются фактическими отдельными замерами;
новые цифры не являются полным hotkey-to-visible latency gate.

Прямой внешний D-Bus Screenshot с flash=false проверен и получил AccessDenied
за 2 мс. Установленный Shell сверяет sender с allowlist системных компонентов.
Прямой доступ ordinary app к texture отсутствует. Быстрый разовый compositor
bridge потребовал бы отдельного GNOME Shell extension с собственным контрактом,
отменой и проверками по версиям; это возможное продолжение исследования, сейчас
не реализовано и не установлено. ScreenCast остаётся исключённым. Позднее проверено старое имя совместимости Screenshot (итог ADR-122 выше).
Unsafe_mode и чтение промежуточного cache-файла не используются. Исходники GPL изучены, код не копировался в продукт.

Evidence: `artifacts/capture-latency-2026-10-20/timing.json` — три процесса,
реальный GNOME D-Bus, полное декодирование каждого PNG 1920×1080. Профилирование
strace недоступно из-за ptrace restriction; приведённые измерения получены
через D-Bus monitor, наблюдение файлов и monotonic clock. Временные исходники
и PNG после исследования удалены.

Первичные источники:

- [GNOME Shell 42.9 screenshot UI и service](https://github.com/GNOME/gnome-shell/blob/42.9/js/ui/screenshot.js).
- [GNOME Shell 42.9 sender checks](https://github.com/GNOME/gnome-shell/blob/42.9/js/misc/util.js).
- [Оригинальный tarball gnome-screenshot 41.0](https://download.gnome.org/sources/gnome-screenshot/41/gnome-screenshot-41.0.tar.xz).

## Исторический helper-подход (2026-10-20, ADR-121, заменён ADR-122)

Пользователь отклонил постоянный GNOME-индикатор «Экран общедоступен» и уточнил,
что Ubuntu 24 раньше работала хорошо. ScreenCast удаляется полностью. Общий
Auto сохраняет Screenshot portal на современных desktop. GNOME ShellVersion
≤42 с установленным gnome-screenshot получает отдельный helper-процесс;
Screenshot без helper остаётся доступен с исходным системным подтверждением.
В wlroots без Screenshot возможен установленный grim; явный выбор доступен
в Settings. Необъявленный target, отмена и ошибка не запускают другой backend.

Реальный Ubuntu 22.04.5 / GNOME 42.9 / Wayland: официальный пакет Ubuntu
`gnome-screenshot 41.0-2` распакован для проверки без root, зависимости уже
доступны. Три запуска `gnome-screenshot --file <private path>` завершились
без запросов разрешения; 1920×1080 RGBA PNG полностью декодированы. Измерено
1348, 1427, 1334 мс. Утилита использует GNOME Shell screenshot API и идентичность
org.gnome.Screenshot, разрешённую GNOME Shell 42. Flash=true задан самой
утилитой; отдельного CLI-флага отключения/настройки нет. Вспышка принята владельцем.
Для новой dev-сборки helper установлен только в пользовательский каталог
~/.local/share/cute-screen/tools; wrapper в ~/.local/bin. GPL binary/copyright
находятся отдельно от исходников/bundle MIT-продукта. Системные пакеты не менялись.

Источники:

- [Flameshot Screenshot portal](https://github.com/flameshot-org/flameshot/blob/master/src/utils/screengrabber.cpp).
- [Spectacle: ImagePlatformKWin](https://github.com/KDE/spectacle/blob/master/src/Platforms/ImagePlatformKWin.cpp).
- [grim: compositor capture](https://github.com/emersion/grim/blob/master/main.c).
- [GNOME screenshot 41 original distribution](https://download.gnome.org/sources/gnome-screenshot/41/).
- [GNOME Shell 42 screenshot service](https://github.com/GNOME/gnome-shell/blob/gnome-42/js/ui/screenshot.js).
- [Portal 1.16 release notes: permission store](https://github.com/flatpak/xdg-desktop-portal/blob/1.16.0/NEWS).
- [GNOME 43 permission-aware screenshot backend](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/gnome-43/src/screenshot.c).

Постоянный индикатор был следствием lifetime сессии, а не чтения кадров в фоне.
Restore tokens не решают проблему старого GNOME backend: frontend ScreenCast
version=4 не доказывает поддержку persistence реализацией. В ADR-121 этот путь
не используется вообще. Ни KWin API, ни grim не являются GNOME fallback.

## Историческая стратегия ADR-118 (заменена ADR-121)

Владелец подтвердил: неинтерактивный Screenshot на этом host всё равно каждый
раз показывает «Дать доступ», а preview размыт. Установлены GNOME 42.9,
xdg-desktop-portal 1.14.4, backend GNOME 42.1; эта версия ещё не содержит
запоминания screenshot permission. Поведение согласуется с
[исходниками portal 1.14.4](https://github.com/flatpak/xdg-desktop-portal/blob/1.14.4/src/screenshot.c)
и [backend 42.1](https://github.com/GNOME/xdg-desktop-portal-gnome/blob/42.1/src/screenshot.c).
Обещание современных GNOME о запоминании доступа нельзя переносить на GNOME 42.

Динамический probe host: ScreenCast v4, Monitor/Window source mask 3,
pipewiresrc 0.3.48. ADR-118 заменяет Screenshot-only решение: одна разрешённая
Monitor session, короткий PipeWire consumer на каждый снимок, raw RGBA → PNG
без изменения разрешения. Встроенные проверки включают наличие элементов,
Monitor/Hidden cursor и валидность каждого frame. Нет fallback с повторными
Screenshot confirmations. Наследование GDK_BACKEND=x11 устранено в Linux entry
при Wayland-сессии. Владелец подтвердил отсутствие повторного запроса и хорошее
качество preview. После сообщения о задержке ADR-119 переводит Area preview
на несжатый memory-owned BMP и добавляет Settings «Выбрать экран»; отмена
выбора сохраняет старую сессию. Native latency/reselect пока pending.
Первый системный выбор монитора остаётся обязательным, после отзыва доступа
или перезапуска новая авторизация возможна. Видео и аудио не записываются.

## Почему появляется Capture unavailable

`src-tauri/src/platform/linux/portal.rs` передавал `Screenshot::request().send()`
в `portal_handshake` с лимитом 2 секунды. В закреплённой ashpd 0.13.13 этот
вызов ожидает не только D-Bus method reply: `Proxy::request` параллельно ждёт
`Request::prepare_response`, который читает пользовательский Response signal.
Синхронный `Request::response()` лишь извлекает уже полученный результат.
Поэтому комментарий об отсутствии таймаута selector не соответствовал коду.

Если пользователь отвечает дольше двух секунд, future уничтожается, код
возвращает `PortalUnavailable`, а capture orchestration преобразует его в
`unavailable`. Системный диалог при этом может остаться открыт: приложение
уже перестало ждать его ответ. Это установленная по исходникам причина;
production native воспроизведение исправленной сборки отдельно pending.

Исправление: оставить ограничение для probe и чтения capabilities, а весь
Screenshot request/response ждать без прикладного таймаута выбора пользователя.
Отмена и отказ в разрешении сохраняют разные terminal outcomes. Публичный API,
image transport и immutable originals не меняются.

Источники:

- [ashpd 0.13.13 ScreenshotRequest](https://docs.rs/ashpd/0.13.13/ashpd/desktop/screenshot/struct.ScreenshotRequest.html)
- [ashpd 0.13.13, исходники закреплённой версии](https://static.crates.io/crates/ashpd/ashpd-0.13.13.crate)
- [XDG Request: Response и Close](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Request.html)

## Первоначальный Screenshot-подход (заменён ADR-118)

Это customization dialog backend GNOME, который приложение запрашивает
через `interactive(true)`. Это отдельный этап от разрешения на доступ к экрану.
В [Screenshot API](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html)
`interactive` — hint, поэтому внешний вид и точное поведение определяет desktop.

Для GNOME возможен путь `interactive(false)` → полный frozen screenshot →
собственное выделение области → Quick Capture. После первого пользовательского
разрешения современные версии GNOME могут запомнить выбор; это подтверждает
[разработчик GNOME](https://discourse.gnome.org/t/take-screenshot-in-gnome-environment-via-its-dbus-api/21144/8).
Полное отсутствие системных запросов для любого desktop обещать нельзя.

Одной замены `true` на `false` недостаточно: прежний Wayland Area считал
полученный PNG уже выбранной областью. Без собственного этапа выделения
приложение начнёт ошибочно открывать весь desktop как Area. Кроме того, v2
не сообщает AvailableTargets: `target` и его bitmask добавлены только в v3.

По следующему запросу владельца принят ADR-117 взамен ADR-009 и обновлены
REQ-CAP-009/010/013. Реализованы full-frame Quick selection, capability gate,
скрытие main/settings и сохранение системных permission outcomes. Без native
geometry полный PNG вписывается в одну Quick surface: crop вычисляется прямо
в координатах картинки, без предположений о координатах desktop и DPI.
Repeat на Wayland открывает новое выделение. Interactive fallback отсутствует,
чтобы не возвращать окно настройки при ошибке. На v3 полный PNG запрашивается
только при advertised Screen; на v2 используется default desktop согласно API.
Mixed-DPI и поведение разных portal backends требуют отдельного runtime pass.

## Наблюдения за Linux-скриншотилками

- [Flameshot](https://github.com/flameshot-org/flameshot/blob/master/src/utils/screengrabber.cpp)
  запрашивает неинтерактивный screenshot portal, затем использует свой UI
  выделения. На X11 у него есть прямой fallback; на Wayland такой fallback
  не заменяет compositor capture.
- [Spectacle](https://github.com/KDE/spectacle) интегрирован с KDE/KWin.
  Его доступ к compositor API зависит от авторизации установленного приложения;
  этот путь не является общим решением для GNOME/Wayland.
- [grim](https://gitlab.freedesktop.org/emersion/grim) использует протоколы
  Wayland compositor. Наличие Wayland само по себе не гарантирует нужный
  screen-copy protocol; под GNOME нельзя подменять portal вызовом grim/X11.

GPL-исходники использованы только для наблюдения за UX и публичными протоколами;
код, зависимости и обходы compositor authorization из них не переносились.
