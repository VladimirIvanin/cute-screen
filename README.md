[![Cute Screen — cat-shaped monitor logo above the screenshot annotation toolbar](docs/assets/github/readme-header.png)](docs/assets/github/readme-header.png)

<p align="center">
  <strong>English</strong> · <a href="README.ru.md" lang="ru">Русский</a><br />
  <a href="https://vladimirivanin.github.io/cute-screen/en/">Website</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="https://github.com/VladimirIvanin/cute-screen/issues">Report an issue</a>
</p>

# Cute Screen

**A local-first screenshot capture and annotation editor.** Capture your screen or open an image, add clear visual
explanations, and copy or save the result. Your screenshots and editable documents stay on your device. No account needed.

Made for bug reports, tutorials, design feedback, and everyday explanations.

> **In development.** The editor and capture workflows are implemented, but platform validation is still in progress.
> There are no published GitHub Releases or signed installers. To try Cute Screen today, run it from source.

## What you can do

| Task                       | Tools                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| Point out a detail         | Arrows, lines, shapes, freehand pencil, and highlighter          |
| Explain a sequence         | Text, callouts, and numbered markers                             |
| Hide sensitive details     | Manual pixelation or solid cover                                 |
| Make small details visible | Spotlight, loupe, and ruler                                      |
| Prepare an image           | Crop, insert additional images, and arrange annotations          |
| Keep working               | Undo/redo and local screenshot history with editable annotations |
| Share the result           | Copy the rendered image to the clipboard or save a PNG           |

## See an example

[![Annotated example showing numbered steps, an arrow, highlighted controls, a width measurement, and a magnified detail](apps/landing/assets/hero-admin.png)](apps/landing/assets/hero-admin.png)

An example annotation on a fictional admin interface. Open the image to inspect the details, or visit the
[website](https://vladimirivanin.github.io/cute-screen/en/) for a tour of the tools.

## Get started

Start with the [source setup guide](docs/DEVELOPMENT.md#run-the-desktop-app). Once the desktop app is running:

1. **Capture or open.** Capture an area, screen, or window using the tray menu or a configured shortcut, or open an image
   in the editor. Available capture modes depend on your operating system.
2. **Annotate.** Use the bottom toolbar to add arrows, labels, numbers, and other annotations. Select an object to adjust
   its appearance; undo and redo let you revise your work.
3. **Copy or save.** Copy the result to the clipboard or save a PNG. The original capture remains unchanged.

Area capture opens Quick Capture, where you can annotate before copying or saving, or continue in the full editor.

## Platforms and current limits

Cute Screen targets **Linux, Windows, and macOS**, with Linux first in the development priorities. Available modes and
runtime verification differ between systems; a successful CI compilation does not mean every feature is verified.

| Platform        | What to expect                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Linux / X11     | Native capture and global shortcuts; compositor and display configuration affect verification.                                    |
| Linux / Wayland | System capture picker through XDG portals. Shortcuts use the GlobalShortcuts portal when available, with CLI setup as a fallback. |
| Windows         | Native capture and global shortcuts. ARM64 and mixed-DPI/multi-monitor coverage still have pending checks.                        |
| macOS           | Screen recording permission is required. Capture and shortcut coverage is still being validated on Intel and Apple Silicon.       |

See the [platform matrix](docs/PLATFORM_MATRIX.md) for the current evidence and limitations. There is no official signed
distribution or automatic update installation; see [build and distribution details](docs/BUILD_RELEASE.md).

## Help and feedback

[Open an issue](https://github.com/VladimirIvanin/cute-screen/issues) with your OS, app version or commit, steps to reproduce,
and what you expected. Include an example image only if it is safe to share.

## For developers

Read the [development guide](docs/DEVELOPMENT.md) for setup, commands, architecture, and landing-page maintenance.
The [product contract](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), and [testing guide](docs/TESTING.md) describe
the implementation and its acceptance requirements.
