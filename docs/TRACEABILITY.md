# Трассируемость требований

Статусы: `planned`, `implemented`, `verified`, `blocked`. `implemented` означает
наличие реализации и применимые automated/local-runtime evidence текущей системы;
`verified` — подтверждённое пользовательское поведение в полной финальной
platform/release matrix.

Evidence заполняется фактической ссылкой на test ID, CI run, screenshot/log или
system smoke record. Во время разработки отсутствующее evidence других ОС
помечается как отложенное; оно не блокирует следующий milestone, но placeholder
не позволяет получить `verified` или статус platform `supported`.

Foundation harness не создаёт отдельного продуктового требования. Его локальные и CI-доказательства определены в [стратегии тестирования](TESTING.md) и [CI workflow](../.github/workflows/ci.yml); статусы `REQ-*` ниже M00 не меняет.

| Requirement | Основное автоматическое доказательство                           | Runtime/platform доказательство                        | Статус                             |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| REQ-CAP-001 | capture orchestration E2E                                        | X11 + GNOME/KDE area smoke                             | planned                            |
| REQ-CAP-002 | target dispatch integration                                      | Linux screen smoke                                     | planned                            |
| REQ-CAP-003 | window capability integration                                    | Linux/Win/mac window smoke                             | planned                            |
| REQ-CAP-004 | active-window dispatch                                           | Linux/Win/mac active-window smoke                      | planned                            |
| REQ-CAP-005 | monitor-layout property tests                                    | repeat after DPI/monitor change                        | planned                            |
| REQ-CAP-006 | timer/cancel fake-clock test                                     | visible countdown + cancel                             | planned                            |
| REQ-CAP-007 | capability mapping                                               | platform cursor on/off result                          | planned                            |
| REQ-CAP-008 | M01 monitor-layout fixtures; M03 coordinate properties           | mixed-DPI multi-monitor smoke                          | planned                            |
| REQ-CAP-009 | M01 backend capability tests; M04 capture integration            | X11 overlay + Wayland portal                           | planned                            |
| REQ-CAP-010 | M03 immutable-blob/token-collision and capture persistence tests | M04 capture opens decoded document                     | implemented; runtime planned       |
| REQ-ACT-001 | binding validation                                               | hidden-app hotkey per platform                         | planned                            |
| REQ-ACT-002 | conflict rollback test                                           | occupied shortcut UI flow                              | planned                            |
| REQ-ACT-003 | M01 portal lifecycle adapter; M04 binding integration            | GNOME/KDE binding flow                                 | planned                            |
| REQ-ACT-004 | M01 CLI contract/capability; M04 fallback command                | copied command launches capture                        | planned                            |
| REQ-ACT-005 | `lifecycle.rs` CLI/single-instance unit tests                    | `tauri-shell.e2e` hide/show + second `show` forwarding | implemented                        |
| REQ-ACT-006 | fake-platform E2E                                                | hidden tray activation                                 | planned                            |
| REQ-ACT-007 | `lifecycle.rs` autostart-default unit test                       | login/restart smoke                                    | implemented                        |
| REQ-EDT-001 | viewport state tests                                             | browser frame/tool navigation                          | planned                            |
| REQ-EDT-002 | command/selection tests                                          | draw two objects pointer E2E                           | planned                            |
| REQ-EDT-003 | loupe selection test                                             | loupe create/configure E2E                             | planned                            |
| REQ-EDT-004 | overlap hit-test property test                                   | double-click cycle E2E                                 | planned                            |
| REQ-EDT-005 | M03 `commands/operations.test.ts`                                | pointer + keyboard E2E                                 | planned                            |
| REQ-EDT-006 | M03 `commands/manager.test.ts`, `document-session.test.ts`       | cross-tool undo/redo E2E                               | implemented; runtime planned       |
| REQ-EDT-007 | guide state tests                                                | hold/release shortcut E2E                              | planned                            |
| REQ-EDT-008 | `M02 editor shell` component test                                | `M02 shell` browser screenshots                        | implemented                        |
| REQ-EDT-009 | `M02 editor shell` layer-panel component test                    | `M02 shell` browser selected-layer interaction         | implemented                        |
| REQ-EDT-010 | clipboard dispatch unit test                                     | real Tauri clipboard E2E                               | planned                            |
| REQ-EDT-011 | duplicate command test                                           | keyboard duplicate E2E                                 | planned                            |
| REQ-TOL-001 | geometry + renderer goldens                                      | pointer arrow editor E2E                               | planned                            |
| REQ-TOL-002 | shape/radius property tests                                      | toolbar + pointer E2E                                  | planned                            |
| REQ-TOL-003 | stroke simplification tests                                      | brush pointer E2E                                      | planned                            |
| REQ-TOL-004 | blend renderer goldens                                           | marker visual E2E                                      | planned                            |
| REQ-TOL-005 | text layout tests                                                | RU/EN IME multiline E2E                                | planned                            |
| REQ-TOL-006 | sequence/shape tests                                             | numbered marker E2E                                    | planned                            |
| REQ-TOL-007 | callout geometry/goldens                                         | text+tail edit E2E                                     | planned                            |
| REQ-TOL-008 | censor renderer goldens                                          | manual censor E2E                                      | planned                            |
| REQ-TOL-009 | spotlight renderer goldens                                       | opacity/shape E2E                                      | planned                            |
| REQ-TOL-010 | distance/unit tests                                              | ruler + guides E2E                                     | planned                            |
| REQ-TOL-011 | loupe renderer tests                                             | auto-selection/config E2E                              | planned                            |
| REQ-TOL-012 | color conversion tests                                           | real clipboard + toast                                 | planned                            |
| REQ-TOL-013 | M03 `document/codec.test.ts`, `commands/operations.test.ts`      | clean-state mount-flow                                 | implemented; runtime planned       |
| REQ-TOL-014 | emoji layer round-trip                                           | emoji insert/edit E2E                                  | planned                            |
| REQ-TOL-015 | safe image decode tests                                          | file dialog/paste E2E                                  | planned                            |
| REQ-LIB-001 | M03 repository first-capture transaction                         | clean profile capture                                  | implemented; runtime planned       |
| REQ-LIB-002 | `M02 editor shell` filmstrip visibility test                     | `M02 shell` empty/active-series screenshots            | implemented                        |
| REQ-LIB-003 | pagination/lazy-load test                                        | 1000-item performance E2E                              | planned                            |
| REQ-LIB-004 | storage aggregation test                                         | library UI E2E                                         | planned                            |
| REQ-LIB-005 | cleanup plan/rollback tests                                      | recoverable cleanup E2E                                | planned                            |
| REQ-LIB-006 | repository rename/delete tests                                   | confirmation/undo E2E                                  | planned                            |
| REQ-LIB-007 | window adapter tests                                             | always-on-top per OS                                   | planned                            |
| REQ-LIB-008 | M03 SQLite document/revision tests                               | restart/reopen Tauri E2E                               | implemented; runtime planned       |
| REQ-OUT-001 | presentation renderer goldens                                    | beautify controls E2E                                  | planned                            |
| REQ-OUT-002 | watermark layout tests                                           | exact/corner placement E2E                             | planned                            |
| REQ-OUT-003 | encode/decode integration                                        | save dialog + decoded file                             | planned                            |
| REQ-OUT-004 | clipboard adapter tests                                          | paste into external app smoke                          | planned                            |
| REQ-OUT-005 | stitch layout/property tests                                     | multi-frame export E2E                                 | planned                            |
| REQ-OUT-006 | M03 atomic recovery-bundle writer                                | cancel/failure smoke                                   | implemented; runtime planned       |
| REQ-OUT-007 | progress/cancel channel tests                                    | UI progress/error E2E                                  | planned                            |
| REQ-UI-001  | `M02 editor shell` component/token test                          | `M02 shell` 1600×1000 screenshot review                | implemented                        |
| REQ-UI-002  | `M02 editor shell` live-theme component test                     | `M02 shell` system/light/dark screenshots              | implemented                        |
| REQ-UI-003  | `M02 editor shell` locale fallback/completeness test             | `M02 shell` live RU/EN browser E2E                     | implemented                        |
| REQ-UI-004  | `M02 shell` responsive browser E2E                               | `M02 shell` 1024 px screenshot review                  | implemented                        |
| REQ-UI-005  | `M02 editor shell` semantic-state component test                 | `M02 shell` visual/contrast review                     | implemented                        |
| REQ-UI-006  | `M02 editor shell` accessible-name component test                | `M02 shell` keyboard browser E2E                       | implemented                        |
| REQ-UI-007  | `M02 editor shell` focus/reduced-motion component test           | `M02 shell` keyboard-only browser E2E                  | implemented                        |
| REQ-UI-008  | `m02-lifecycle` window config unit test                          | `tauri-shell.e2e` native-decoration smoke              | implemented                        |
| REQ-UI-009  | diagnostics redaction tests                                      | exported bundle review                                 | planned                            |
| REQ-QLT-001 | M01 4K/500 baseline; M13 hard gate                               | reference runner report                                | planned                            |
| REQ-QLT-002 | M01 8K/1000 baseline; M13 hard gate                              | reference runner report                                | planned                            |
| REQ-QLT-003 | M01 scheduler idle test; M13 editor trace                        | runtime no-continuous-frame trace                      | planned                            |
| REQ-QLT-004 | 1000-item benchmark                                              | runtime first-page trace                               | planned                            |
| REQ-QLT-005 | M03 journal, atomic-file and constrained-path unit coverage      | crash/restart recovery                                 | implemented; fault/runtime planned |
| REQ-REL-001 | Linux artifact/architecture checks                               | x64/ARM64 install smoke                                | planned                            |
| REQ-REL-002 | universal binary check                                           | unsigned Intel/Apple launch smoke                      | planned                            |
| REQ-REL-003 | installer/architecture checks                                    | unsigned Win x64/ARM64 launch smoke                    | planned                            |
| REQ-REL-004 | SemVer/tag/cache/error tests                                     | manual + opt-in GitHub check                           | planned                            |
| REQ-REL-005 | checksum/SBOM/license CI                                         | downloaded artifact verification                       | planned                            |

## Evidence record template

| Field       | Value                                                |
| ----------- | ---------------------------------------------------- |
| Requirement | `REQ-...`                                            |
| Test ID     | stable test/spec name                                |
| Level       | unit / component / render / browser / Tauri / system |
| Platform    | OS, version, architecture, desktop session           |
| Artifact    | commit/bundle SHA                                    |
| Fixture     | fixture ID + SHA-256                                 |
| Action      | exact user action or command                         |
| Expected    | observable result                                    |
| Actual      | observable result                                    |
| Evidence    | CI URL, log, screenshot or report                    |
| Date        | ISO date                                             |
