# Linux: системный диалог и Capture unavailable

Исследование 2026-10-19, исходная ветка main обновлена fast-forward с `3304e55`
до `7856504`. Наблюдаемое окружение: Ubuntu 22.04.5 x64, GNOME, Wayland;
Screenshot portal сообщает version 2.

## Итог ручной проверки и новая стратегия

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
