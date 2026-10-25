//! The transport catalog is shared; edit schemas are generated from core types.
use serde_json::{Value, json};

pub const TOOL_NAMES: &[&str] = &[
    "get_status",
    "list_history",
    "list_assets",
    "open_document",
    "import_image",
    "import_resource",
    "capture",
    "get_job",
    "cancel_job",
    "get_document",
    "apply_edits",
    "undo",
    "redo",
    "get_preview",
    "export_image",
];

pub fn tools() -> Value {
    let edits: Value = serde_json::from_str(include_str!(
        "../../../packages/editor-core/src/agent-edit-schema.json"
    ))
    .unwrap_or_else(|_| json!({}));
    let string = json!({"type":"string", "minLength":1, "maxLength":4096});
    let number = json!({"type":"number"});
    let rect = json!({"type":"object", "properties":{"x":number,"y":number,"width":{"type":"number","exclusiveMinimum":0},"height":{"type":"number","exclusiveMinimum":0}}, "required":["x","y","width","height"], "additionalProperties":false});
    let state = json!({"documentId":string,"expectedStateToken":string});
    let entries = vec![
        (
            "list_assets",
            "Search bundled emoji by English/Russian label or glyph. Use returned asset and grapheme unchanged in create emoji.",
            json!({"query":string}),
            vec![],
        ),
        (
            "get_status",
            "Get app version, platform capabilities and active document. Read this first.",
            json!({}),
            vec![],
        ),
        (
            "list_history",
            "List 50 history entries per cursor page.",
            json!({"cursor":{"type":["object","null"]}}),
            vec![],
        ),
        (
            "open_document",
            "Open a history capture in the visible editor. Flushes the previous document; busy during user editing.",
            json!({"captureId":string}),
            vec!["captureId"],
        ),
        (
            "import_image",
            "Import a local raster image into history and open it. Originals remain immutable.",
            json!({"path":string}),
            vec!["path"],
        ),
        (
            "import_resource",
            "Import a local image/texture for use in create image or presentation; returns blobHash and dimensions.",
            json!({"path":string}),
            vec!["path"],
        ),
        (
            "capture",
            "Start a native capture job. Area/window may require user interaction. Poll get_job; cancel_job cancels it.",
            json!({"mode":{"enum":["area","screen","window","activeWindow","repeat"]},"delayMs":{"type":"integer","minimum":0,"maximum":60000},"cursor":{"type":"boolean"}}),
            vec!["mode"],
        ),
        (
            "get_job",
            "Read capture progress or terminal outcome. Only a terminal completed job has a saved document.",
            json!({"jobId":string}),
            vec!["jobId"],
        ),
        (
            "cancel_job",
            "Cancel this connection's capture job; committed results are not deleted.",
            json!({"jobId":string}),
            vec!["jobId"],
        ),
        (
            "get_document",
            "Read committed document, layer IDs and stateToken. Coordinates are document pixels; use this before edits.",
            json!({}),
            vec![],
        ),
        (
            "apply_edits",
            "Atomic typed operations, one Undo step. Use create tool drawing for arrow/line/shape/pencil/marker/gradient. update changes replace supplied properties, including complete payload. Read get_document first. Never reuse an old stateToken; retry same requestId only for identical request.",
            json!({"documentId":string,"expectedStateToken":string,"requestId":string,"operations":{"type":"array","minItems":1,"maxItems":100,"items":edits["operation"]}}),
            vec![
                "documentId",
                "expectedStateToken",
                "requestId",
                "operations",
            ],
        ),
        (
            "undo",
            "Undo one editor step; may include a manual step. Requires current state token.",
            state.clone(),
            vec!["documentId", "expectedStateToken"],
        ),
        (
            "redo",
            "Redo one editor step. Requires current state token.",
            state.clone(),
            vec!["documentId", "expectedStateToken"],
        ),
        (
            "get_preview",
            "Render committed output as a PNG image, maximum 1536px long side. Optional region is in output pixels after crop/presentation. Returns mapping and snapshot token.",
            json!({"documentId":string,"expectedStateToken":string,"region":rect}),
            vec!["documentId", "expectedStateToken"],
        ),
        (
            "export_image",
            "Export committed output to a NEW absolute PNG path. Refuses existing files and all library paths.",
            json!({"documentId":string,"expectedStateToken":string,"path":string}),
            vec!["documentId", "expectedStateToken", "path"],
        ),
    ];
    Value::Array(entries.into_iter().map(|(name, description, properties, required)| {
        let mut schema = json!({"type":"object","properties":properties,"additionalProperties":false});
        if !required.is_empty() { schema["required"] = json!(required); }
        if name == "apply_edits" { schema["$defs"] = edits["$defs"].clone(); }
        json!({"name":name,"description":description,"inputSchema":schema,
            "annotations":{"readOnlyHint":matches!(name,"get_status"|"list_assets"|"list_history"|"get_job"|"get_document"|"get_preview"),"openWorldHint":false}})
    }).collect())
}
