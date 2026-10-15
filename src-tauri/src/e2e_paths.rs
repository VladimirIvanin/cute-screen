use std::path::{Path, PathBuf};

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
