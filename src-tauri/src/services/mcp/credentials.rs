use std::io::{Read, Write};
use std::path::{Path, PathBuf};

fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "invalid connection ID")?;
    Ok(root.join("mcp-keys").join(id))
}

fn validate(token: &str) -> Result<(), String> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid saved MCP credential".into());
    }
    Ok(())
}

pub(super) fn read(root: &Path, id: &str) -> Result<Option<String>, String> {
    let path = path(root, id)?;
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Unable to read saved MCP credential: {error}")),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Invalid saved MCP credential file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("Saved MCP credential must have private permissions (0600)".into());
        }
    }
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Unable to open saved MCP credential: {e}"))?;
    let mut token = String::new();
    file.take(65)
        .read_to_string(&mut token)
        .map_err(|e| format!("Unable to read saved MCP credential: {e}"))?;
    validate(&token)?;
    Ok(Some(token))
}

pub(super) fn write(root: &Path, id: &str, token: &str) -> Result<(), String> {
    validate(token)?;
    let path = path(root, id)?;
    let directory = root.join("mcp-keys");
    std::fs::create_dir_all(&directory)
        .map_err(|e| format!("Unable to create MCP credential directory: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("Unable to protect MCP credential directory: {e}"))?;
    }
    let mut file = tempfile::NamedTempFile::new_in(directory)
        .map_err(|e| format!("Unable to save MCP credential: {e}"))?;
    file.write_all(token.as_bytes())
        .map_err(|e| format!("Unable to save MCP credential: {e}"))?;
    file.as_file()
        .sync_all()
        .map_err(|e| format!("Unable to flush MCP credential: {e}"))?;
    file.persist_noclobber(path)
        .map_err(|e| format!("Unable to persist MCP credential: {}", e.error))?;
    Ok(())
}

pub(super) fn remove(root: &Path, id: &str) -> Result<(), String> {
    match std::fs::remove_file(path(root, id)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Unable to remove revoked MCP credential: {error}")),
    }
}
