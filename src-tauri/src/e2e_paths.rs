use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

pub fn profile_identifier(base: &str, root: &Path) -> String {
    let digest = format!("{:x}", Sha256::digest(root.as_os_str().as_encoded_bytes()));
    format!("{base}.profile.{}", &digest[..16])
}

pub fn profile_paths(root: &Path) -> Result<(PathBuf, PathBuf), std::io::Error> {
    if !root.is_absolute() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "E2E profile must be absolute",
        ));
    }
    Ok((root.join("data"), root.join("cache")))
}

#[cfg(test)]
mod tests {
    #[test]
    fn single_instance_identity_is_stable_only_within_one_test_profile() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let base = "io.github.vladimirivanin.cute-screen.e2e";
        let id = super::profile_identifier(base, first.path());
        assert_eq!(id, super::profile_identifier(base, first.path()));
        assert_ne!(id, super::profile_identifier(base, second.path()));
        assert_ne!(id, base);
    }

    #[test]
    fn keeps_test_storage_inside_each_absolute_profile() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let (local, cache) = super::profile_paths(first.path()).unwrap();
        assert!(local.starts_with(first.path()));
        assert!(cache.starts_with(first.path()));
        assert_ne!(local, cache);
        assert_ne!((local, cache), super::profile_paths(second.path()).unwrap());
        assert!(super::profile_paths(std::path::Path::new("relative-profile")).is_err());
    }
}
