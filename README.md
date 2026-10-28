[![Cute Screen — cat-shaped monitor logo above the screenshot annotation toolbar](docs/assets/github/readme-header.png)](docs/assets/github/readme-header.png)

<p align="center">
  <strong>English</strong> · <a href="README.ru.md" lang="ru">Русский</a><br />
  <a href="https://vladimirivanin.github.io/cute-screen/en/">Website and downloads</a> ·
  <a href="https://github.com/VladimirIvanin/cute-screen/issues">Report an issue</a>
</p>

# Cute Screen

**Capture screenshots and annotate them locally.** Cute Screen combines screen capture, a fast annotation mode, and a
full image editor, with an optional local MCP connection for agents. Copy a finished image or save it as PNG; captures
and editable documents stay on your device. No account is required.

## Capture and Quick Capture

- **Capture an area** to open **Quick Capture**. Select or adjust the area, annotate it in the same window, then copy,
  save as PNG, add it to local history, or continue in the full editor.
- **Capture a screen or window** to open it directly in the full editor. Active-window capture and repeating the last area
  are also available where the platform supports them. Capture can be started from the app, tray, or configured shortcuts.
- **Open an existing image** when you want to edit without taking a new screenshot.

Capture modes and shortcut support vary by operating system. On Wayland, capture uses a one-time system screenshot path;
see the [platform matrix](docs/PLATFORM_MATRIX.md) for verified behavior and limits.

## What you can do

- Explain with arrows, shapes, freehand strokes, text, callouts, and numbered markers.
- Conceal details with manual pixelation, blur, or a solid cover; highlight an area with a spotlight or loupe.
- Crop, measure, insert images or emoji, and arrange editable layers in the full editor.
- Undo or redo changes, revisit local screenshot history, and copy or export the rendered result without changing the
  original capture.

## Local agents via MCP

With MCP enabled in settings, a compatible agent can capture a screenshot, read local history, edit the open document,
inspect a preview, and export a PNG. Each client has a separate revocable key. Cute Screen does not provide an AI model;
the client controls any data it sends to its model. See [MCP connections](docs/MCP.md) for supported clients and setup.

[![Annotated example with numbered steps, an arrow, highlighted controls, a measurement, and a magnified detail](apps/landing/assets/hero-admin.png)](apps/landing/assets/hero-admin.png)

Cute Screen targets **Linux, Windows, and macOS**. [Download a build](https://vladimirivanin.github.io/cute-screen/en/#downloads)
or use the [source setup guide](docs/DEVELOPMENT.md#run-the-desktop-app). Builds are in development; platform validation
and distribution limits are tracked in the [platform matrix](docs/PLATFORM_MATRIX.md) and
[build guide](docs/BUILD_RELEASE.md).

For implementation details, see the [development guide](docs/DEVELOPMENT.md) and [product requirements](docs/PRODUCT.md).
