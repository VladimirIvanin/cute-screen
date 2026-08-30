use rusqlite::{Connection, OptionalExtension};
use rusqlite_migration::{M, Migrations};

use crate::RepositoryError;

pub(crate) struct LegacyMigration {
    version: i64,
    name: &'static str,
    checksum: &'static str,
    pub(crate) sql: &'static str,
}

pub(crate) const LEGACY_MIGRATIONS: [LegacyMigration; 2] = [
    LegacyMigration {
        version: 1,
        name: "m03-initial",
        checksum: "m03-initial-v1",
        sql: "
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
        CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, format TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, color_metadata_json TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, series_id TEXT NOT NULL REFERENCES series(id), original_blob_hash TEXT NOT NULL REFERENCES blobs(hash), captured_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
        CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, capture_id TEXT NOT NULL UNIQUE REFERENCES captures(id), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, content_json TEXT NOT NULL, content_sha256 TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS blob_references (owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL, blob_hash TEXT NOT NULL REFERENCES blobs(hash), PRIMARY KEY(owner_kind, owner_id, role, blob_hash));
        CREATE TABLE IF NOT EXISTS blob_derivatives (source_hash TEXT NOT NULL REFERENCES blobs(hash), variant TEXT NOT NULL, generator_version INTEGER NOT NULL, cache_path TEXT NOT NULL, content_hash TEXT NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(source_hash, variant, generator_version));
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS recovery_journal (operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS captures_series_recent ON captures(series_id, captured_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS captures_recent ON captures(captured_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS documents_updated ON documents(updated_at DESC);
        CREATE INDEX IF NOT EXISTS blob_references_hash ON blob_references(blob_hash);
        CREATE INDEX IF NOT EXISTS recovery_journal_state ON recovery_journal(state, updated_at);
        ",
    },
    LegacyMigration {
        version: 2,
        name: "m03-capture-metadata-v1",
        checksum: "m03-capture-metadata-v1",
        sql: "ALTER TABLE captures ADD COLUMN capture_metadata_json TEXT NOT NULL DEFAULT '{\"schemaVersion\":1,\"backend\":\"unknown\",\"target\":\"unknown\",\"geometry\":null,\"monitorSnapshot\":null,\"cursor\":null,\"invocationSource\":\"unknown\"}';",
    },
];

const MIGRATION_LIST: &[M<'static>] = &[
    M::up(LEGACY_MIGRATIONS[0].sql),
    M::up(LEGACY_MIGRATIONS[1].sql),
    M::up("DROP TABLE IF EXISTS schema_migrations;"),
];
const MIGRATIONS: Migrations<'static> = Migrations::from_slice(MIGRATION_LIST);

pub(crate) fn migrate(connection: &mut Connection) -> Result<(), RepositoryError> {
    let user_version =
        connection.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))?;
    let supported = 3;
    if user_version > supported {
        return Err(RepositoryError::UnsupportedDatabaseSchema {
            found: user_version,
            supported,
        });
    }
    if user_version == 0 && legacy_migration_table_exists(connection)? {
        adopt_legacy_migration_history(connection)?;
    }
    MIGRATIONS
        .to_latest(connection)
        .map_err(|error| RepositoryError::MigrationIntegrity(error.to_string()))
}

pub(crate) fn legacy_migration_table_exists(
    connection: &Connection,
) -> Result<bool, RepositoryError> {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
            [],
            |_| Ok(true),
        )
        .optional()
        .map(Option::unwrap_or_default)
        .map_err(RepositoryError::from)
}

fn adopt_legacy_migration_history(connection: &mut Connection) -> Result<(), RepositoryError> {
    let rows = {
        let mut statement = connection.prepare(
            "SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC",
        )?;
        statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };

    if let Some((found, _, _)) = rows.last()
        && usize::try_from(*found).map_or(true, |version| version > LEGACY_MIGRATIONS.len())
    {
        return Err(RepositoryError::UnsupportedDatabaseSchema {
            found: *found,
            supported: i64::try_from(LEGACY_MIGRATIONS.len()).unwrap_or(i64::MAX),
        });
    }
    for (index, (version, name, checksum)) in rows.iter().enumerate() {
        let expected = LEGACY_MIGRATIONS.get(index).ok_or_else(|| {
            RepositoryError::MigrationIntegrity(format!("unknown migration version {version}"))
        })?;
        if *version != expected.version || name != expected.name || checksum != expected.checksum {
            return Err(RepositoryError::MigrationIntegrity(format!(
                "migration {version} does not match the registered version/name/checksum"
            )));
        }
    }
    let legacy_version = i64::try_from(rows.len()).map_err(|_| {
        RepositoryError::MigrationIntegrity("legacy migration count exceeds i64".to_owned())
    })?;
    connection.pragma_update(None, "user_version", legacy_version)?;
    Ok(())
}
