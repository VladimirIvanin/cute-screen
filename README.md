# Cute Screen

Cute Screen is a local-first screenshot capture and annotation application being built with Tauri 2, Vue 3, and Rust. The repository is currently at **M00 / foundation**: workspace boundaries, deterministic test seams, and CI are available, while capture, editor, renderer, and library product features are intentionally not implemented.

The product contract lives in [`docs/PRODUCT.md`](docs/PRODUCT.md), accepted architecture decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md), and current milestone evidence in [`docs/milestones/M00-foundation.md`](docs/milestones/M00-foundation.md).

## Toolchain

- Node `22.23.1`
- pnpm `10.33.2`, activated through Corepack
- Rust `1.97.0`, selected by `rust-toolchain.toml`

Install the exact JavaScript dependencies from a clean checkout:

```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
```

The install fails early with an actionable message when Node or pnpm does not match the pinned contract.

## Tauri prerequisites

Follow the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating system, then run:

```bash
pnpm run doctor
```

On Ubuntu 24.04 the required development packages include GTK 3, WebKitGTK 4.1, JavaScriptCoreGTK 4.1, libsoup 3, OpenSSL, libayatana-appindicator, librsvg, and build tools. Browser E2E additionally requires Chrome; real Linux Tauri E2E runs through the embedded WDIO WebDriver provider and needs a display or `xvfb-run`.

Windows development requires the Microsoft C++ Build Tools and WebView2. macOS development requires Xcode Command Line Tools.

## Stable commands

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

`test:render` and `test:perf` currently exercise only their deterministic harness helpers. Passing them is not evidence that a renderer exists or that a performance budget has been reached.

The browser E2E suite starts and stops Vite automatically. The Tauri suite builds a separate binary with `fake-platform,test-harness`, creates temporary app data, exercises a typed Rust IPC round-trip in a real webview, and closes the process. A normal `pnpm tauri build` enables neither test feature.

## Workspace boundaries

```text
editor-core <- editor-renderer <- editor-vue <- desktop shell
```

`editor-core` is compiled without DOM types and cannot import Vue, Tauri, the renderer, or Vue adapters. The fake-platform scenario and fixture manifests contain metadata and paths only; image bytes are never placed in JSON or base64.

## CI status

GitHub Actions validates Linux x64 runtime behavior and compile-checks Linux ARM64, Windows x64/ARM64, and macOS Intel/Apple Silicon. Successful compilation is not a platform-support claim; runtime support remains `planned` until the later capture and platform milestones provide real evidence.
