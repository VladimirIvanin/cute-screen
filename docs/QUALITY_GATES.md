# Dependency quality gates

`pnpm check` runs the existing project checks and Knip, syncpack and cargo-machete
through the pinned hk configuration. CI and pre-push use this same command.
Unit, renderer, performance, native and security/license audit jobs remain separate.

## Install and run

```sh
pnpm install --frozen-lockfile
pnpm tools:install
pnpm tools:check
pnpm check
# Optional, explicit local Git hook installation:
pnpm hooks:install
```

Node/pnpm retain their existing pins; Rust uses `rust-toolchain.toml`.
Knip 6.44.1 and syncpack 15.3.3 are exact devDependencies. `package.json` also
pins hk 2.11.0 and cargo-machete 0.9.2 in `qualityTools`.
The common installer uses `cargo install --locked`, the workspace `target/`,
and `~/.cache/cute-screen-ci/quality-tools/<tool>/<version>/bin`.
`CUTE_SCREEN_QUALITY_TOOLS_ROOT` can relocate the installed binaries.
It does not change `CARGO_HOME` or install hooks. Existing matching binaries
are reused; a wrong cached version fails instead of silently using PATH.
The runner always selects this repository's `hk.pkl` with `HK_FILE`.

Hook installation uses hk's local installation without force flags. On older
Git versions, an existing user hook or symlink makes installation fail before
any hook is replaced. On Git 2.54+, hk supports composable config-based hooks.
Existing global hk installations are respected by hk. Review any refusal;
do not overwrite another hook to get installation through.

## Three tiers

- Pre-commit: existing ESLint on staged JS/TS/Vue and Prettier on staged
  CSS/JSON/YAML/Markdown/HTML and the generated desktop IPC binding.
  Unstaged changes are temporarily stashed and restored. No fixes or staging.
- Pre-push: `pnpm check`, including whole-workspace dependency checks.
- CI quality task: install and verify the same pinned tools, then `pnpm check`.

`pnpm check:project` is the internal aggregate called by hk; it must not call
`pnpm check` again. `pnpm check:knip`, `pnpm check:syncpack` and
`pnpm check:machete` run individual analyzers. Every violation must fail.
`pnpm format` remains the explicit safe formatting command.

## Analysis boundaries and approved exceptions

Knip covers desktop, library packages, landing, scripts and tests.
Its WebdriverIO plugin reads browser and landing configs for framework/reporters;
native config is analyzed as an entry without executing its native-binary
precondition. Specs are explicit entries because the plugin omits their globs.
The public CanvasViewport type facade, generated IPC contract and handwritten
`.d.mts` declarations are entries; their implementations remain checked.
The icon preview HTML has an explicit TypeScript entry for its absolute script
URL. Maintenance generators are entries because Rust or documented maintenance
commands invoke them.

The owner approved only these Knip exceptions on 2026-11-03:

| Configuration                            | Reason                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ignoreDependencies: @wdio/local-runner` | WebdriverIO selects it through `runner: 'local'`; Knip's plugin omits this default runner.                                 |
| `editor-vue ignoreDependencies: katex`   | Naive UI's published declarations import its types; removing it breaks `vue-tsc` even without a direct application import. |
| `ignoreBinaries: rustc`                  | Existing Rust toolchain, used by `scripts/tauri.mjs`.                                                                      |
| `ignoreBinaries: xmessage`               | External X11 helper in `scripts/check-installed-area-escape.mjs`.                                                          |
| `ignoreBinaries: dpkg, dpkg-deb`         | System package tools in `scripts/check-m04-deb.mjs`.                                                                       |
| `clipboard-codec.ts: duplicates`         | Public V3 encoder/decoder names intentionally alias the compatible V2 implementation.                                      |

There is no legacy baseline or global issue category disabled. These exceptions
do not suppress security findings. Additional exceptions require an explicit
human decision with the exact path/rule and reason.

syncpack enforces exact external dependency ranges and consistent versions
across all workspace manifests, preserving internal `workspace:*` references.
It does not impose manifest sorting rules. cargo-machete uses plain analysis
without `--fix` or `--with-metadata`; no Rust ignore is needed.
The pinned pnpm package extension declares Naive UI's missing `katex` dependency
so its published declarations resolve under pnpm isolation on a fresh install.
Never run Knip's deleting autofix unattended, edit generated IPC/schema output
by hand, or suppress a rule just to pass a gate.

## Sources and validation

Adoption follows [Dev Quality Gates](https://github.com/mokevnin/dev-quality-gates/blob/main/docs/adopt.md).
Pinned releases checked on 2026-11-03:
[Knip](https://github.com/webpro-nl/knip/releases/tag/knip%406.44.1),
[syncpack](https://github.com/JamieMason/syncpack/releases/tag/15.3.3),
[hk](https://github.com/jdx/hk/releases/tag/v2.11.0), and
[cargo-machete](https://github.com/bnjbvr/cargo-machete/releases/tag/v0.9.2).

`tests/boundaries/quality-gates.test.ts` covers real Git hooks, partial staging,
nonzero failure propagation, explicit config selection and user hook preservation.
Platform/command results are recorded in [TESTING.md](TESTING.md).
Remote CI is confirmed only by an actual GitHub run.
