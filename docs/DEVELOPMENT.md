# Development guide

Cute Screen uses Tauri 2, Vue 3, and Rust. For an overview of the app, see the [English README](../README.md) or
[Russian README](../README.ru.md). Read [AGENTS.md](../AGENTS.md) before changing the repository.

## Run the desktop app

Use the pinned toolchain:

- Node `22.23.1` (also in `.node-version`).
- pnpm `10.33.2`, activated through Corepack.
- Rust `1.97.0`, selected by `rust-toolchain.toml`.

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. Windows needs Microsoft C++ Build
Tools and WebView2; macOS needs Xcode Command Line Tools. On Ubuntu 24.04, development dependencies include GTK 3,
WebKitGTK 4.1, JavaScriptCoreGTK 4.1, libsoup 3, OpenSSL, libayatana-appindicator, librsvg, and build tools.

From a clean checkout:

```bash
git clone https://github.com/VladimirIvanin/cute-screen.git
cd cute-screen
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
pnpm doctor
pnpm tauri dev
```

The install checks the Node and pnpm versions. `pnpm tauri dev` starts the frontend and desktop shell together.
`pnpm dev` starts only the browser frontend; native capture and system clipboard behavior require the desktop app.

For a local packaged build, run `pnpm tauri build`. Packaging is platform-specific; consult
[BUILD_RELEASE.md](BUILD_RELEASE.md) before distributing a build. There is no official signed release channel or automatic
update installation. Test artifacts, when available, are unsigned and can trigger SmartScreen or Gatekeeper warnings.

## Commands and verification

```text
pnpm check
pnpm test
pnpm test:coverage
pnpm test:render
pnpm test:e2e:browser
pnpm test:e2e:tauri
pnpm test:perf
pnpm tauri build
cargo test --workspace
cargo test --workspace --features fake-platform
cargo clippy --workspace --all-targets -- -D warnings
```

Format changes with `pnpm format`, then run `pnpm format:check`. ESLint Stylistic owns JS/TS/Vue layout; Prettier handles
CSS, JSON, YAML, Markdown, and HTML. Use `cargo fmt --all` for Rust. VS Code recommends the matching extensions.
Check documentation links with `pnpm docs:check`.

Browser E2E requires Chrome and manages its Vite server. Tauri E2E builds an isolated test binary and uses temporary app
data. The normal test configuration enables `fake-platform,test-harness`; selected scenarios exercise physical capture
with additional desktop requirements. A production build enables neither test feature. Linux native E2E needs a display
or `xvfb-run`; driver requirements and scenario-specific instructions are in [TESTING.md](TESTING.md).

Renderer tests compare decoded images; performance checks distinguish deterministic harness results from controlled
reference-runner evidence. Passing tests only demonstrates their covered scenarios. See [TESTING.md](TESTING.md) and
[ACCEPTANCE.md](ACCEPTANCE.md) for the actual commands, artifacts, and remaining gaps.

## Architecture and product contracts

```text
editor-core <- editor-renderer <- editor-vue <- desktop shell
```

`editor-core` has no DOM types or Vue/Tauri imports. Vue does not own a deeply reactive scene graph. Document changes use
undoable editor commands, original captures are immutable, and image bytes are not transported through JSON or base64.

- [PRODUCT.md](PRODUCT.md): product requirements and tool behavior.
- [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md): accepted decisions and implementation boundaries.
- [TRACEABILITY.md](TRACEABILITY.md): requirements mapped to implementation and evidence.
- [PLATFORM_MATRIX.md](PLATFORM_MATRIX.md): capture, shortcuts, runtime evidence, and platform limits.
- [BUILD_RELEASE.md](BUILD_RELEASE.md): packaging and distribution policy.

CI runs quality gates on Linux x64 and compile checks on Linux ARM64, Windows x64/ARM64, and macOS Intel/Apple Silicon.
Compile success is not a runtime support claim; consult the platform matrix before describing a feature as supported.

## Landing page

The static bilingual site is in `apps/landing`:

```text
pnpm dev:landing
pnpm build:landing
pnpm test:e2e:landing
```

The E2E command checks the production preview on port 5176 at 375, 768, 1024, and 1440 px in both languages.
After changing tool icons, run `pnpm icons:landing`; the exported icons come from the app's `UiIcon`.
The landing toolbar screenshot and the README toolbar source are separate supplied assets; preserve their proportions.

The [Deploy landing page workflow](../.github/workflows/deploy-pages.yml) publishes
[the site](https://vladimirivanin.github.io/cute-screen/). In repository **Settings → Pages**, choose **GitHub Actions**
as the source. Run the workflow or push a landing change to `main` to deploy.

## GitHub presentation

The [GitHub artwork guide](assets/github/README.md) documents the editable layouts, original toolbar, generated PNGs,
repository description, topics, and Social preview setup.
