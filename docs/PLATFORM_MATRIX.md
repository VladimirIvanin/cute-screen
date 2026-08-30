# Платформенная матрица

## Поддерживаемые цели

| Платформа       | Архитектура    | Захват                                                                                                    | Горячие клавиши                        | Неофициальный CI artifact |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| Linux X11       | x86_64         | `x11rb` visible drawable + target-visual frozen overlay; local compositor/quick runtime passed 2026-08-24 | Tauri/global-hotkey                    | deb, AppImage             |
| Linux X11       | aarch64        | `x11rb` visible drawable + собственный frozen overlay; compositor runtime re-smoke pending                | Tauri/global-hotkey                    | deb, AppImage             |
| GNOME Wayland   | x86_64/aarch64 | XDG Screenshot portal                                                                                     | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| KDE Wayland     | x86_64/aarch64 | XDG Screenshot portal                                                                                     | XDG GlobalShortcuts или CLI fallback   | deb, AppImage             |
| wlroots Wayland | x86_64/aarch64 | Portal при наличии                                                                                        | Portal при наличии, иначе CLI fallback | deb, AppImage             |
| Windows         | x86_64         | DXGI/D3D11 frozen Area Quick surface; single-HWND/pixel replay passed; cross-monitor smoke pending        | Tauri/global-hotkey                    | NSIS exe                  |
| Windows 11      | ARM64          | DXGI/D3D11 frozen Area Quick surface; native Window selector; runtime smoke pending                       | Tauri/global-hotkey                    | NSIS exe                  |
| macOS           | Intel          | Native AppKit Area/Window; CG 12.0–12.2, intended SCKit 12.3+ routing; runtime smoke pending              | later slice: Tauri/global-hotkey       | universal DMG             |
| macOS           | Apple Silicon  | Same versioned native adapter as Intel; compile/CI until owner runtime                                    | later slice: Tauri/global-hotkey       | universal DMG             |

macOS deployment baseline зафиксирован ADR-038 как 12.0. Остальные точные
минимальные версии ОС фиксируются во время финальной runtime-проверки capture
API и webview. Release baseline не повышается без ADR и CI-доказательства.

## Capture capabilities

| Возможность      | X11                                            | Wayland portal                                         | Windows                                     | macOS                        |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- | ---------------------------- |
| Area             | One fullscreen Quick surface: select → edit    | System selector                                        | One fullscreen Quick surface: select → edit | AppKit; frozen quick-mode    |
| Screen           | Root or Composite Overlay Window               | Portal target/capability                               | DXGI virtual screen                         | Direct after permission      |
| Window           | Direct/window list                             | Portal target/capability                               | Direct/window list                          | Native; direct document      |
| Active window    | Window manager adapter                         | Portal when exposed, otherwise clear unavailable state | Native                                      | Not advertised (later slice) |
| Repeat last area | Stored physical/image geometry with validation | New portal interaction if silent reuse is unavailable  | Stored geometry                             | Not advertised (later slice) |
| Delay            | App countdown before backend invocation        | App countdown before portal                            | App countdown                               | App countdown                |
| Cursor           | Capability-dependent                           | Portal-dependent                                       | Backend option                              | Not advertised               |

Area является единственной capture action, которая заканчивается в quick-mode.
На X11/Windows/macOS quick surface сохраняет frozen desktop и physical
selection coordinates; macOS Area использует единый frozen multi-display
frame. Wayland сначала завершает системный XDG selector, затем показывает
только возвращённый fragment на нейтральном фоне; рамку можно перемещать и
уменьшать внутри fragment, но нельзя расширять за его границы. Screen, Window,
Active Window и Repeat продолжают direct-to-editor flow.

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
- On composited X11, `_NET_WM_CM_Sn` selects the Composite Overlay Window as
  the frozen source. A non-composited session uses root; an active compositor
  with no usable Composite 0.3 overlay fails instead of returning a known
  incomplete root frame. The selector converts canonical RGBA into the target
  root visual/depth instead of replaying the Composite Overlay Window image.
  After Area confirmation, the same canonical RGBA becomes a top-down 32-bit
  BMP held by native memory transport; full-desktop PNG compression and disk
  staging are outside the mouse-up presentation path. Local GNOME X11
  compositor/quick runtime passed on 2026-08-28; mixed-DPI, cross-monitor and
  repeated optimized latency evidence remain pending.
- UI capture waits for the hidden main client and its Mutter frame before the
  request crosses into native capture. CLI, tray and hotkey ingress enforce the
  same gate in the native orchestration path. A visible client/frame must remain
  absent for 300 ms before root acquisition; an already-hidden resident process
  skips a newly-started settle interval, while a just-hidden Quick surface waits
  only its unexpired remainder so Mutter's fade actor cannot enter the frame.
- X11 Area decodes the captured root into owned binary transport before its
  first visible frame, then maps one prewarmed fullscreen Quick WebView. The
  same scene and overlay canvas own both the initial crosshair/dim/dashed crop
  gesture and subsequent annotation state. No native Area selector, retained
  overlay, second top-level XID or reveal-time window replacement is allowed.
  The native selector code remains available only for Window target. Resident
  GNOME 46/X11 runtime evidence on 2026-08-30 kept XID `0x42000fc` across a
  physical `300,250 → 1000,700` drag and showed the same 700×450 dash before
  adding Quick tools/actions; Escape returned typed `cancelled`. Direct xRGB32
  → top-down BMP staging and overlapped GTK warmup reduced the resident
  dev/debug command → focused selecting measurement to 723 ms from a visible
  editor and 607 ms from an already-hidden process.

### macOS

- Screen Recording permission проверяется до Screen snapshot. Отказ —
  typed `permissionDenied`, без прозрачных окон и без overlay.
- UI объясняет переход в System Settings (`Privacy_ScreenCapture`) и Retry.
- Deployment baseline — macOS 12.0. Native AppKit selector обслуживает Area и
  Window. Intended pixel routing: legacy CoreGraphics fallback на 12.0–12.2,
  one-shot `SCStream` на 12.3–13, `SCScreenshotManager` и system window picker
  на 14+; API availability проверяется во время выполнения.
- Area использует frozen multi-display frame и quick-mode. Window создаёт
  direct document без quick-mode.
- Локальный macOS 12.7.6 x64 startup smoke (2026-08-29) подтвердил только
  Screen-only поведение существующего среза и отсутствие prewarmed
  `quick-capture` окна; он не подтверждает новую Area/Window архитектуру.
- macOS Area follow-up (2026-08-29) исправляет два code-level дефекта,
  обнаруженных по первому визуальному кадру: AppKit menu-bar constraint для
  borderless selector и преждевременный reveal hidden WKWebView до готового
  composited chrome. Frontend 15/15, native bridge 16/16 и boundary 15/15
  прошли; runtime visual status остаётся pending до перезапуска локального
  `tauri dev` и проверки полного menu bar плюс первого видимого quick-frame.
- Intel и Apple Silicon делят один versioned adapter. Compile evidence идёт
  через CI `macos-15` / `macos-15-intel`; runtime support Area/Window не
  заявляется до реальных decoded-pixel smokes на ветках 12.0–12.2, 12.3–13 и
  14+.

### Windows

- Windows backend uses DXGI Desktop Duplication plus a D3D11 CPU-readable
  staging texture for every attached output. It assembles one physical
  virtual-desktop frame under a per-monitor-v2 DPI context. Screen and Active
  Window are direct snapshots. Area prepares duplication after the editor is
  hidden, registers/shows a transparent non-activating compositor pulse, waits
  for `DwmFlush`, then acquires one full frozen frame and opens the prewarmed
  fullscreen Quick WebView directly in `selecting`; the first crop and later
  annotation chrome share its mounted scene/overlay hosts. Window alone keeps
  the native selector, foreground
  restore, transparent compositor pulse, DWM flush and final acquire/crop. A
  pointer-only update is retried only when
  it has no desktop resource; protected-content masking and rotated outputs fail
  explicitly, and there is no GDI fallback. Unit assembly/crop and
  a local interactive-desktop compositor probe pass on Windows x64 (2026-08-12);
  the Task Manager/topmost-window pixel smoke is still required before a
  `supported` claim.
- Windows 10 build 19045 x64 repair replay (2026-08-30) kept fullscreen Quick
  HWND `0x4078C` before and after the first drag, showed no native Area selector
  HWND and preserved visible frozen desktop pixels while changing the same
  surface from selecting hint to a 1225×750 physical crop with tools/actions.
  The loading overlay was absent and Escape removed the Quick window.
  Cross-monitor validation remains pending.
- Локальный M01 smoke на Windows x64 подтвердил WebView2 runtime: asset decode,
  binary IPC/Blob fallback и typed error для corrupted PNG.
- Повторная локальная regression-проверка 2026-08-10 на Windows 10 Home 22H2
  (build 19045), x86_64, commit `3dcfcc5`: `cargo test --workspace` прошёл
  46/46, `pnpm test` прошёл 123/123 и `pnpm test:render` прошёл 6/6 при Node
  `22.23.1`. Migration на `@lucide/vue@1.31.0` сняла production-build blocker;
  browser harness больше не зависит от POSIX shell syntax и сохраняет Vite
  server между spec workers. M01/M02/M06 browser specs прошли, M05 остаётся
  failed на UI rounding/interactability assertions. Это portable
  Rust/headless/browser coverage без WebView2 или native-capture claim и не
  меняет статус platform support.
- CanvasKit/WebGL startup в проверенном WebView2 перешёл на Canvas2D fallback;
  это не подтверждает primary CanvasKit path для Windows.
- M08 Windows browser acceptance (2026-08-15, Chrome 151.0.7922.138) passed its
  focused 8/8 crop/precision scenarios and visually inspected 1440×900 and
  1024×700 EN/RU screenshots plus the ruler visual/default-settings artifact.
  This is browser evidence only. The feature-gated
  real-Tauri binary built, but `@wdio/tauri-service` timed out waiting 60 seconds
  for its embedded WebDriver on port 4445 before the test body. Therefore the
  clean decoded-source crop mount and native clipboard readback remain pending.
  This does not claim a full browser-suite or real-Tauri pass, and the saved
  gitignored `artifacts/tauri-e2e/wdio.log` does not contain the timeout
  transcript; durable real-Tauri evidence remains pending. No Windows/WebView2
  support claim is added.
- Mixed DPI, политика запуска в фоне, capture и hotkey остаются pending до M04
  system smoke.
- Повторная установка более новой CI-сборки не должна удалять shortcut configuration или library.

## Runtime evidence

Во время разработки runtime evidence собирается только на текущей системе
владельца проекта. Другие строки matrix получают code/compile/fake-platform
coverage, но остаются без runtime support claim. Полный список ниже обязателен
для финальной platform/release acceptance после функционального завершения
приложения.

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

## M01/M04 capability baseline

- `xcap` 0.9.7 отклонён из-за security advisories в dependency graph; решение и отдельный `x11rb` 0.14.0 boundary зафиксированы в ADR-019.
- Локальный Ubuntu/GNOME X11 controlled-window smoke подтвердил monitor enumeration, physical millimetres, coordinates, 96×64 RGBA capture и SHA-256. До появления устойчивой CI artifact URL это локальная диагностика, не статус `supported`.
- Локальный X11 portal probe увидел Screenshot v2 без `AvailableTargets` и без GlobalShortcuts. Это диагностика dbus на X11-сессии, не substitute для Wayland runtime.
- Локальный Ubuntu 24.04 / GNOME Wayland smoke (2026-08-09, SHA `7ff7d283`, xdg-desktop-portal 1.18.4, gnome portal 46.2): Screenshot portal v2 подтвердил interactive area capture (640×360 RGBA, decoded PNG SHA-256 `361b7fa2…`); `availableTargets: 0` (monitor/window target через portal v3 недоступен); GlobalShortcuts portal backend отсутствует → hotkey capability `unavailable`, CLI fallback. Evidence: `artifacts/m01/portal-probe.json`, `portal-screenshot.json`, `portal-shortcuts.json`, `portal-invalid-uri.json`. Статус GNOME Wayland capture — локальная диагностика, не `supported` без CI artifact URL. KDE Wayland и полный shortcut bind/activate cycle остаются pending.
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
- Linux M01 Tauri E2E на GNOME Wayland: `pnpm test:e2e:tauri` (2026-08-09,
  Ubuntu 24.04 x64 / WebKitGTK 2.52.3, SHA `7ff7d283`) прошёл четыре
  per-scenario прогона на Wayland-сессии; Canvas2D startup fallback, asset
  alpha decode, binary ICC fallback и corrupt error подтверждены; артефакты в
  `artifacts/tauri-e2e/`.
- M04 clean-profile Tauri E2E на локальном WebKitGTK (2026-08-10):
  `m04-clean-profile-capture.e2e.ts` начал с пустого app data, вызвал
  production `capture_request`, сохранил и заново смонтировал первый документ
  через repository и decoded asset. Пиксели поставляет только feature-gated
  fake native adapter; frontend state и image bytes не seed-ятся. Evidence:
  `artifacts/tauri-e2e/junit-m04-clean-profile-capture-0-0.xml`. Это доказывает
  orchestration/mount-flow, но не native capture или platform support.
- M04 local Ubuntu/GNOME X11 x86_64 smoke (2026-08-09):
  `pnpm smoke:m04:x11:screen` захватил root 2560×1440, декодировал PNG,
  передал bytes через owned transport, сохранил immutable original и создал
  editable document. Evidence: `artifacts/m04/x11-screen.json`. Это только
  прямой X11 screen flow; area overlay, window/active-window, cursor,
  multi-monitor/repeat и X11 hotkeys остаются pending, поэтому это не статус
  `supported`.
- M04 local Ubuntu/GNOME X11 x86_64 frozen-area smoke (2026-08-09):
  `pnpm smoke:m04:x11:area` captured the root before mapping a native X11
  overlay, used an automated 100,100→400,300 drag, and persisted the resulting
  300×200 document. Evidence: `artifacts/m04/x11-area.json`. `xdotool` is only
  the local smoke driver, never a product dependency. The overlay keeps the
  first valid Area drag completes on primary pointer release and opens quick
  mode; `Enter` is the equivalent keyboard confirm path before a selection is
  made. Move/resize, arrow-key physical-pixel nudge and Shift+arrow resize are
  available in quick mode. The isolated 2026-08-24 Ubuntu/GNOME X11 smoke
  completed a 600×400 primary-pointer drag and mapped quick mode without an
  injected `Enter`. The later resident-editor button smoke waits for the X11
  server to observe both the main client unmapped and Mutter's separately owned
  `_MUTTER_FRAME_FOR` decoration destroyed, then holds that state through a
  compositor-settle interval before acquiring pixels. The inspected selector
  frame contains only the desktop behind the editor; Escape restores `main`.
  Mixed-DPI/cross-monitor interaction remains pending.
- Ubuntu 24.04/GNOME 46 X11 packaged-debug repair smoke (2026-08-24): a clean
  isolated profile accepted CLI Area, the native selector completed a physical
  300,220→900,620 drag, and WebKitGTK mapped `Cute Screen Quick Capture` at
  2560×1440 with the exact 600×400 frozen crop, visible annotation/action
  chrome and no foreign-visual corruption. Close returned typed terminal
  `cancelled` without materialization. Screenshot:
  `/tmp/codex-shot-2026-08-24_18-15-32.png`. The historical
  `smoke:m04:x11:area` driver now stops at the quick-draft terminal boundary and
  requires a harness update before it can again claim a complete persisted flow.
- The follow-up continuous-motion smoke moved the X11 cursor hint 472 times and
  changed a pressed Area rectangle 120 times. Frozen-background damage restore
  left only one current hint/rectangle in
  `/tmp/codex-shot-2026-08-24_18-31-00.png` and
  `/tmp/codex-shot-2026-08-24_18-31-30.png`; no XOR trails remained.
- Selector-visibility follow-up (2026-08-28): warm CLI activation hid a visible
  resident editor, held the selector for more than four seconds and acquired a
  frozen Chrome frame without the editor or its compositor fade. A physical
  600×650 drag across a white LibreOffice page kept the full two-tone Area frame
  visible. The hint rendered readable text plus a camera body, top and centred
  lens. Evidence:
  `/tmp/cutescreen-selector-predrag-final-2026-08-28.png` and
  `/tmp/cutescreen-selector-white-page-drag-final-2026-08-28.png`.
- M04 local Ubuntu/GNOME X11 x86_64 selector-cancel smoke (2026-08-09):
  `pnpm smoke:m04:x11:area-cancel` cancelled an active Area operation through
  the shared controller, returned terminal `cancelled` without a document, and
  exercised native overlay cleanup (pointer/keyboard ungrab and destroy).
  Evidence: `artifacts/m04/x11-area-cancel.json`.
- M04 local Ubuntu/GNOME X11 x86_64 cursor smoke (2026-08-09):
  `pnpm smoke:m04:x11:screen-cursor` completed through the XFixes version
  handshake; persisted capture metadata records `cursor.requested: true` and
  `result: included`. Evidence: `artifacts/m04/x11-screen-cursor.json`.
- M04 local Ubuntu/GNOME X11 x86_64 window-selector smoke (2026-08-09):
  `pnpm smoke:m04:x11:window` read the EWMH stacking list, excluded desktop,
  dock and transient/tool window types, highlighted the clicked topmost client
  over a frozen root frame,
  and persisted a 2560×1331 document. Evidence:
  `artifacts/m04/x11-window.json`. Frame-extents/multi-monitor validation and
  keyboard move/resize/nudge semantics remain pending.
- The selector policy also rejects root, unmapped/minimized and `_NET_WM_PID`
  windows owned by the current Tauri process, without title matching; its
  deterministic unit test covers those exclusions plus desktop/dock. Invalid
  or zero geometry is rejected before an overlay rectangle is created.
- Window/ActiveWindow capability is independently gated by the needed EWMH
  atoms. A usable X root only enables Screen/Area; it cannot make an unavailable
  window selector look supported.
- M04 local Ubuntu/GNOME X11 x86_64 active-window smoke (2026-08-09):
  `pnpm smoke:m04:x11:active-window` resolved `_NET_ACTIVE_WINDOW` and cropped
  its 2560×1331 bounds from one frozen root frame before persisting the decoded
  original. Evidence: `artifacts/m04/x11-active-window.json`. It reuses the
  selector inventory, so minimized, self and non-user targets return
  `invalidTarget`; occluded pixels retain the visible frozen-compositor result.
  Multi-monitor runtime validation remains pending.
- M04 local Ubuntu/GNOME X11 x86_64 repeat smoke (2026-08-09):
  `pnpm smoke:m04:x11:repeat` persisted the 300×200 selected physical area,
  then repeated it from the same frozen-root coordinate snapshot. The repeat
  rejects a changed virtual-root size or RandR monitor-layout fingerprint and
  stores geometry in capture metadata.
  Evidence: `artifacts/m04/x11-repeat.json`. The geometry stores the
  largest-intersection RandR monitor first, followed by every other intersected
  name; repeat rejects an identity mismatch as well as a layout mismatch.
  Horizontal/vertical property tests include negative, vertical, cross-monitor
  and seam-tie bounds. DPI/rotation runtime validation remains pending.
- M04 local Ubuntu/GNOME X11 x86_64 cold CLI smoke (2026-08-09):
  `pnpm smoke:m04:x11:cli-cold` launched the real Tauri lifecycle with
  `capture --mode screen --json` and received a terminal `captured` reply.
  Evidence: `artifacts/m04/x11-cli-cold.json`.
- M04 local Ubuntu/GNOME X11 x86_64 warm CLI smoke (2026-08-09):
  `pnpm smoke:m04:x11:cli-warm` started an isolated hidden primary,
  forwarded `capture --mode screen --json` via its session socket and received
  a terminal `captured` reply. Evidence: `artifacts/m04/x11-cli-warm.json`.
  The direct X11 `active-window` backend is an EWMH lookup and crop from one
  frozen root frame.
  The X11 native hotkey backend now parses normalized triggers and uses
  passive grabs behind `hotkeys_bind`; physical-key activation/conflict
  evidence remains pending because XTEST/`xdotool` does not exercise passive
  grabs on this session.
- M04 local Ubuntu x86_64 deb bundle smoke (2026-08-10):
  `pnpm smoke:m04:deb` produced
  `target/release/bundle/deb/Cute Screen_0.0.0_amd64.deb`; `dpkg-deb` verified
  the native architecture, `usr/bin/cute-screen` and a desktop entry, and
  rejected test-only `m01/m04-platform-smoke` binaries. The extracted deb
  executable and `Cute Screen_0.0.0_amd64.AppImage` both ran `--help` with the
  capture grammar; AppImage was built after declaring existing square icons in
  Tauri bundle config. This is still not an installed/portable capture proof:
  desktop activation and moved-AppImage fallback capture remain pending.

## CLI fallback and activation contract (M04 partial)

- Установленный deb: `cute-screen capture --mode area`.
- AppImage: shell-quoted абсолютный путь из `current_exe`, затем те же аргументы `capture --mode area`; перемещение AppImage требует заново сформировать строку.
- `capture --json` передаёт request в primary process через per-user/session
  Unix socket и ждёт terminal outcome (`captured`, `cancelled`, `busy`,
  permission/unavailable/failed), не путь к blob и не image bytes. Cold start
  использует тот же controller. Socket ограничен правами `0600` и scoped к
  `XDG_RUNTIME_DIR`/session display. Unit coverage есть; реальный warm/cold
  desktop smoke остаётся pending.
- Отсутствие portal или неподдерживаемый capture target нельзя объявлять
  success. CLI fallback пока является конкретной альтернативой binding flow,
  а не доказательством поддержки Wayland hotkey.
