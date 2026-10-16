# Text sizing and wrapping research — 2026-10-16

Primary sources were read before implementation. They inform interaction and
failure cases; no third-party editor code is copied.

- [FigJam: Create text and links](https://help.figma.com/hc/en-us/articles/1500004291281-Create-text-and-links-in-FigJam):
  point text grows with content; dragging side handles changes width. Area text
  has an explicit width and grows vertically. The article does not specify a
  default maximum: the supplied FigJam screenshots are the reference for capped
  growth. Cute Screen chooses 480 document px, independent of zoom.
- [Figma: Guide to text](https://help.figma.com/hc/en-us/articles/360039956434-Guide-to-text-in-Figma-Design):
  font metrics and font versions affect text resizing. Measure loaded bundled
  faces rather than estimating width from character count.
- [Excalidraw #4504](https://github.com/excalidraw/excalidraw/issues/4504):
  maximum horizontal width requested to avoid indefinitely expanding text.
- [Excalidraw #6402](https://github.com/excalidraw/excalidraw/issues/6402):
  manually inserted newlines make later resizing and copying awkward. Keep soft
  wrapping separate from the source. Closed issue describes a container
  workaround; its status alone is not evidence of a completed wrapping feature.
- [Excalidraw #8918](https://github.com/excalidraw/excalidraw/issues/8918):
  slash wrapping differs between editing and display in Firefox. Use shared
  measured line boundaries for DOM projection and canvas, including long words.
- [MDN overflow-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-wrap):
  `anywhere` allows emergency breaks and affects min-content sizing, unlike
  `break-word`. Shrinkable grid tracks/flex children also need `min-width: 0`;
  overflow clipping by itself does not fix intrinsic sizing.

Chosen UX: an empty point-text field is one em wide, grows with real font
metrics up to 480 px, then wraps at spaces or complete graphemes for an
unbroken token. A wrapped commit stores the existing fixedWidth v7 contract;
manual resizing can subsequently exceed the initial cap. Existing auto-size
objects retain their sizing mode. No viewport resize silently reflows saved
text. Background controls fit their popup and remain keyboard accessible.
