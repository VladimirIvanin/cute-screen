# GitHub artwork and repository metadata

The repository README uses [readme-header.png](readme-header.png), 1280×480.
[social-preview.png](social-preview.png), 1280×640 and under 1 MB, is the separate image for shared repository links.
Both have an opaque `#191a1e` background so their appearance is consistent across light and dark surfaces.

## Sources and regeneration

- The [editable layout generator](../../../scripts/generate-github-artwork.mjs) defines spacing, sizes, colors, and text.
- The logo is loaded directly from the existing [generated brand SVG](../../../logo.svg). Its geometry is unchanged.
  The production brand source remains [generate-brand-assets.mjs](../../../scripts/generate-brand-assets.mjs).
- [toolrail.png](toolrail.png) is the user's supplied `localhost_5173_editor_.png`, copied byte for byte at 598×41 px.
  It is separate from the landing-page toolbar and is drawn at its original aspect ratio, clipped to its rounded boundary
  to remove the rectangular screenshot corners.

Run from the repository root:

```text
pnpm artwork:github
```

This uses the existing `@napi-rs/canvas` dependency, saves both PNGs, then decodes each saved image to check dimensions
and the file-size limit. Typography uses Segoe UI on Windows, with sans-serif fallback elsewhere; font rendering may
differ on other hosts. Review regenerated artwork before replacing the committed PNGs. The final artwork is assembled
from the exact source assets; a generated visual draft is not used as the production logo or toolbar.

Both language versions use the same English artwork. Their surrounding descriptions and image alternatives are localized.
Keep the product name and short description as real README text as well as pixels in the banner.

## Repository settings

Repository: [VladimirIvanin/cute-screen](https://github.com/VladimirIvanin/cute-screen).

Description:

> Local-first screenshot capture and annotation editor. Add arrows, text, shapes, and hide sensitive details. Built for Linux, Windows, and macOS.

Homepage: [Cute Screen](https://vladimirivanin.github.io/cute-screen/).

Preserve existing topics and add these eight if missing:

```text
image-annotation image-editor image-editing local-first linux windows macos productivity
```

The topics present when this change was prepared were:

```text
open-source screen-capture screenshot screenshot-tool screenshots tauri ubuntu vibecoding
```

The complete prepared set, preserving all existing topics, is:

```text
open-source screen-capture screenshot screenshot-tool screenshots tauri ubuntu vibecoding image-annotation image-editor image-editing local-first linux windows macos productivity
```

Set description, homepage, and topics in the repository's **About → Edit repository details** dialog.
Upload [social-preview.png](social-preview.png) through **Settings → General → Social preview → Edit → Upload an image**.
Committing a README banner does not automatically set Social preview.

These settings are prepared for manual application, as requested. No repository settings were changed.

## GitHub references

- [Social preview requirements and upload instructions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview):
  PNG, JPG, or GIF under 1 MB; 1280×640 is the recommended size.
- [Repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics):
  topics help people find related projects; GitHub permits up to 20 per repository.
- [Contributing to github/explore](https://github.com/github/explore/blob/main/CONTRIBUTING.md): the images for curated
  topic pages belong to GitHub's shared topic catalog. They are separate from a repository's banner and Social preview.
  This change does not propose a topic-catalog entry or promise a search-ranking improvement.
