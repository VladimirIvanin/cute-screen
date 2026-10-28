# MCP workflow details

The connection is local and opt-in. The user creates a client configuration in Cute Screen Settings → Agents / MCP; do not place its token in source files, screenshots, logs or shared examples.

## Capture and coordinates

- `get_status` reports platform capabilities. `capture({"mode":"area"})` returns a `jobId`; poll `get_job` until a terminal result. A cancelled, denied or unavailable capture is not an empty image to annotate.
- `import_image({"path":"/absolute/source.png"})` opens an existing image. `open_document` reopens a library record.
- `get_document` returns `document`, `stateToken`, `canUndo`, `canRedo` and `saveState`. Create coordinates default to **source document pixels**. `space: "card"` instead uses output card pixels. A `get_preview` region uses output image pixels; its metadata includes layout and scales for mapping back to the source.

## Readable arrow edit

`apply_edits` requires `documentId`, `expectedStateToken`, a unique `requestId`, and 1–100 `operations`:

```json
{
  "documentId": "<document.id>",
  "expectedStateToken": "<stateToken>",
  "requestId": "<new unique ID>",
  "operations": [
    {
      "type": "create",
      "tool": "drawing",
      "input": {
        "tool": "arrow",
        "start": { "x": 120, "y": 130 },
        "end": { "x": 300, "y": 240 }
      }
    }
  ]
}
```

The application defaults for a new arrow currently include a solid, round, 8 px red stroke and a filled arrowhead. **Inspect the returned layer** instead of assuming that a caller-supplied style or future version kept those defaults. To change its width, color or appearance, get the new `stateToken` and send an `update` with `changes.payload` equal to the **entire existing arrow payload** plus the modified fields. The color channels are numbers from 0 to 1. `appearance` accepts `clean` or `handDrawn`. Do not send only `{ "stroke": ... }` as the payload: it replaces, rather than merges, the rest of the arrow geometry. Confirm the intended arrow `layerId` from `get_document` before updating.

## Presentation and export

`presentation` replaces the document presentation. Start from `document.presentation`, preserving `beautify` and `watermark`, and if using a card, provide a complete `composition` object. Its `layout.insets` controls padding; `background.kind` supports `solid`, `linear`, `radial`, `freeform`, `image`, `blurred` and `transparent`; `radius` and `shadow` control the card. See `tools/list` for the current schema. If the screenshot is already tight, consider omitting a card entirely.

`get_preview` requires the current `documentId` and `expectedStateToken`; its whole-image PNG is limited to 1536 px on the long side. Inspect a `region` in output pixels for details. `export_image` writes a **new** absolute `.png` path and refuses to replace existing files. Reopen the exported bytes and check them at the actual sharing size. An `applied: true` result with `saveState: "error"` is already an edit; do not replay it.
