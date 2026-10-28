---
name: cute-screen-annotate
description: Capture or import screenshots with Cute Screen MCP, add readable arrows and other annotations, optionally style the presentation card, and verify the exported PNG. Use when an agent is asked to make or annotate a screenshot in Cute Screen.
---

# Annotate screenshots in Cute Screen

Use the local `cute-screen` MCP connection for capture, editing, preview and export. If the connection is missing, direct the user to **Cute Screen → Settings → Agents / MCP** to create a client configuration; never ask them to paste a connection token into the repository or an artifact.

## Make the image

1. Call `get_status` to learn the available capture modes. Capture through `capture` and finish its job, or use `import_image` when the user already supplied an image. Respect cancellation and permission errors. Inspect the captured/imported image before placing marks; do not guess coordinates from the desktop screen.
2. Call `get_document`. Use its `document.id`, `stateToken`, canvas dimensions, crop and presentation state. Create only marks that communicate the requested point. Keep arrows clear of labels and controls; aim the head at the exact feature, with enough distance for the shaft and head to remain distinct. Use numbered markers or a short callout when several targets need explanation.
3. Start a normal arrow near **8 source pixels** at 1:1 output. Scale that choice to the final viewing size: aim for roughly 4 visible pixels after reduction, and crop or export larger if that would require an oversized stroke. Check the actual arrow payload after creation because caller-supplied styles and future versions can differ. Use a color with strong local contrast along the **shaft and head**; for a meaningful graphical mark, 3:1 against adjacent colors is a useful minimum, and antialiasing may require more. If the path crosses backgrounds that defeat one color, reroute it or use a short callout on a solid backplate. A width or contrast number alone never replaces inspection.
4. Choose `clean` arrows for precise UI instructions. Use `handDrawn` when the user wants an informal/sketched look; keep its endpoint unambiguous and check the irregular stroke at final size. Avoid mixing styles without a visual reason.
5. Add background, padding, corner radius, shadow or frame through `presentation` when the requested deliverable benefits from a styled card. Keep the content large enough to read and preserve the document's other presentation fields. Background styling must not hide screenshot content or imply a UI state that was never captured.
6. Apply typed `apply_edits` operations with the current token and a fresh `requestId`. A batch is one Undo step. For `update`, provide the complete replacement `payload` if changing it; for `presentation`, supply the complete presentation value. After a conflict, reread the document. After a lost response, inspect state before retrying a mutation.
7. Call `get_preview` and inspect both the whole image at the intended sharing size and a region around each annotation. Correct weak contrast, thin shafts, crowded heads, covered labels and unreadable text. Export to a new absolute `.png` path, decode/reopen the exported file, and confirm its dimensions and visible content. Keep the original intact.

For exact MCP arguments, coordinate spaces and a safe arrow edit, read [MCP workflow](references/mcp-workflow.md). For presentation settings, read the same reference before sending a `presentation` operation. The live `tools/list` schema is authoritative if it differs from the examples.
