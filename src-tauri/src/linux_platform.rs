use std::{collections::BTreeSet, fs::File, io::BufReader, path::PathBuf, sync::Arc};

use ashpd::{
    Error as AshpdError,
    desktop::{
        CreateSessionOptions, ResponseError, Session,
        global_shortcuts::{
            Activated, BindShortcutsOptions, Deactivated, GlobalShortcuts, ListShortcutsOptions,
            NewShortcut,
        },
        screenshot::{AvailableTargets, Screenshot, ScreenshotProxy},
    },
};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use url::Url;

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureRequest, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode,
        PortalCapabilityProbe, PortalClient, ShortcutBindingResult, ShortcutSpec,
    },
};

#[derive(Debug, Default)]
pub struct AshpdPortalClient {
    transport: Option<Arc<ImageTransportService>>,
}

impl AshpdPortalClient {
    pub fn with_transport(transport: Arc<ImageTransportService>) -> Self {
        Self {
            transport: Some(transport),
        }
    }

    pub async fn probe(
        &self,
        correlation_id: &str,
    ) -> Result<PortalCapabilityProbe, PlatformError> {
        let screenshot = ScreenshotProxy::new()
            .await
            .map_err(|error| map_ashpd_error(error, correlation_id))?;
        let version = screenshot.version();
        let available_targets = if version >= 3 {
            screenshot
                .available_targets()
                .await
                .map_err(|error| map_ashpd_error(error, correlation_id))?
                .bits()
        } else {
            0
        };
        let global_shortcuts_available = GlobalShortcuts::new()
            .await
            .is_ok_and(|proxy| proxy.version() > 0);

        Ok(PortalCapabilityProbe {
            screenshot_version: version,
            available_targets,
            global_shortcuts_available,
        })
    }

    pub async fn capture_to_transport(
        &self,
        request: CaptureRequest,
        transport: &ImageTransportService,
    ) -> Result<CaptureResult, PlatformError> {
        let proxy = ScreenshotProxy::new()
            .await
            .map_err(|error| map_ashpd_error(error, &request.correlation_id))?;
        let version = proxy.version();
        if version < 2 {
            return Err(PlatformError::new(
                PlatformErrorCode::PortalTooOld,
                request.correlation_id,
            ));
        }

        let mut screenshot = Screenshot::request().interactive(true).modal(true);
        if version >= 3 {
            let target = match request.target {
                CaptureTarget::Area => AvailableTargets::Area,
                CaptureTarget::Monitor => AvailableTargets::Screen,
                CaptureTarget::Window => AvailableTargets::Window,
            };
            screenshot = screenshot.target(target);
        } else if request.target != CaptureTarget::Area {
            return Err(PlatformError::new(
                PlatformErrorCode::PortalTooOld,
                request.correlation_id,
            ));
        }

        let response = screenshot
            .send()
            .await
            .and_then(|request| request.response())
            .map_err(|error| map_ashpd_error(error, &request.correlation_id))?;
        let source = validated_file_uri(response.uri().as_str(), &request.correlation_id)?;
        let file = File::open(&source).map_err(|_| {
            PlatformError::new(PlatformErrorCode::CaptureFailed, &request.correlation_id)
        })?;
        let decoder = png::Decoder::new(BufReader::new(file));
        let reader = decoder.read_info().map_err(|_| {
            PlatformError::new(PlatformErrorCode::CaptureFailed, &request.correlation_id)
        })?;
        let (width, height) = reader.info().size();
        let digest = Sha256::digest(request.correlation_id.as_bytes());
        let token = format!("portal-{digest:x}");
        let token = &token[..39];
        transport.import_owned_image(
            token,
            source,
            "image/png",
            width,
            height,
            &request.correlation_id,
        )?;

        Ok(CaptureResult {
            image_token: token.to_owned(),
            correlation_id: request.correlation_id,
            width,
            height,
        })
    }
}

impl PortalClient for AshpdPortalClient {
    async fn probe(&self, correlation_id: String) -> Result<PortalCapabilityProbe, PlatformError> {
        AshpdPortalClient::probe(self, &correlation_id).await
    }

    async fn capture(&self, request: CaptureRequest) -> Result<CaptureResult, PlatformError> {
        let transport = self.transport.as_ref().ok_or_else(|| {
            PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                &request.correlation_id,
            )
        })?;
        self.capture_to_transport(request, transport).await
    }

    async fn bind_shortcuts(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: String,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let mut session = PortalShortcutSession::create(&correlation_id).await?;
        let result = session.bind_once(&shortcuts, &correlation_id).await;
        let close_result = session.close(&correlation_id).await;
        match (result, close_result) {
            (Ok(bindings), Ok(())) => Ok(bindings),
            (Err(error), _) | (_, Err(error)) => Err(error),
        }
    }
}

pub struct PortalShortcutSession {
    proxy: GlobalShortcuts,
    session: Session<GlobalShortcuts>,
    bound_ids: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutActivationEvidence {
    pub activated_id: String,
    pub deactivated_id: String,
}

impl PortalShortcutSession {
    pub async fn create(correlation_id: &str) -> Result<Self, PlatformError> {
        let proxy = GlobalShortcuts::new()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let session = proxy
            .create_session(CreateSessionOptions::default())
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let existing = proxy
            .list_shortcuts(&session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let bound_ids = existing
            .shortcuts()
            .iter()
            .map(|shortcut| shortcut.id().to_owned())
            .collect();
        Ok(Self {
            proxy,
            session,
            bound_ids,
        })
    }

    /// Lists before binding and sends each application shortcut ID at most
    /// once for the lifetime of this portal session.
    pub async fn bind_once(
        &mut self,
        shortcuts: &[ShortcutSpec],
        correlation_id: &str,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let missing = missing_shortcuts(&self.bound_ids, shortcuts);
        if !missing.is_empty() {
            let portal_shortcuts: Vec<_> = missing
                .iter()
                .map(|shortcut| {
                    NewShortcut::new(&shortcut.id, &shortcut.id)
                        .preferred_trigger(shortcut.preferred_trigger.as_deref())
                })
                .collect();
            let bound = self
                .proxy
                .bind_shortcuts(
                    &self.session,
                    &portal_shortcuts,
                    None,
                    BindShortcutsOptions::default(),
                )
                .await
                .and_then(|request| request.response())
                .map_err(|error| map_shortcut_error(error, correlation_id))?;
            self.bound_ids.extend(
                bound
                    .shortcuts()
                    .iter()
                    .map(|shortcut| shortcut.id().to_owned()),
            );
        }

        Ok(shortcuts
            .iter()
            .map(|shortcut| ShortcutBindingResult {
                id: shortcut.id.clone(),
                active: self.bound_ids.contains(&shortcut.id),
                correlation_id: correlation_id.to_owned(),
            })
            .collect())
    }

    pub async fn receive_activated(
        &self,
        correlation_id: &str,
    ) -> Result<impl futures_util::Stream<Item = Activated> + use<>, PlatformError> {
        self.proxy
            .receive_activated()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    pub async fn receive_deactivated(
        &self,
        correlation_id: &str,
    ) -> Result<impl futures_util::Stream<Item = Deactivated> + use<>, PlatformError> {
        self.proxy
            .receive_deactivated()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    /// Waits for one complete manual shortcut press/release cycle. This is
    /// intentionally used only by the interactive M01 system smoke command.
    pub async fn wait_for_activation_cycle(
        &self,
        timeout: std::time::Duration,
        correlation_id: &str,
    ) -> Result<ShortcutActivationEvidence, PlatformError> {
        let mut activated = self.receive_activated(correlation_id).await?;
        let mut deactivated = self.receive_deactivated(correlation_id).await?;
        let activated = tokio::time::timeout(timeout, activated.next())
            .await
            .ok()
            .flatten()
            .ok_or_else(|| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        let deactivated = tokio::time::timeout(timeout, deactivated.next())
            .await
            .ok()
            .flatten()
            .ok_or_else(|| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        Ok(ShortcutActivationEvidence {
            activated_id: activated.shortcut_id().to_owned(),
            deactivated_id: deactivated.shortcut_id().to_owned(),
        })
    }

    pub async fn close(self, correlation_id: &str) -> Result<(), PlatformError> {
        self.session
            .close()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    /// Portal sessions do not have a restore token. Recovery is an explicit
    /// close/create/list/bind cycle with the same application IDs.
    pub async fn recreate(
        self,
        shortcuts: &[ShortcutSpec],
        correlation_id: &str,
    ) -> Result<Self, PlatformError> {
        self.close(correlation_id).await?;
        let mut replacement = Self::create(correlation_id).await?;
        replacement.bind_once(shortcuts, correlation_id).await?;
        Ok(replacement)
    }
}

fn missing_shortcuts<'a>(
    bound_ids: &BTreeSet<String>,
    shortcuts: &'a [ShortcutSpec],
) -> Vec<&'a ShortcutSpec> {
    shortcuts
        .iter()
        .filter(|shortcut| !bound_ids.contains(&shortcut.id))
        .collect()
}

pub fn validated_file_uri(uri: &str, correlation_id: &str) -> Result<PathBuf, PlatformError> {
    let url = Url::parse(uri)
        .map_err(|_| PlatformError::new(PlatformErrorCode::InvalidUri, correlation_id))?;
    if url.scheme() != "file" || !matches!(url.host_str(), None | Some("") | Some("localhost")) {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidUri,
            correlation_id,
        ));
    }
    url.to_file_path()
        .map_err(|()| PlatformError::new(PlatformErrorCode::InvalidUri, correlation_id))
}

fn map_ashpd_error(error: AshpdError, correlation_id: &str) -> PlatformError {
    let code = match error {
        AshpdError::Response(ResponseError::Cancelled)
        | AshpdError::Portal(ashpd::PortalError::Cancelled(_)) => PlatformErrorCode::Cancelled,
        AshpdError::RequiresVersion(_, _) => PlatformErrorCode::PortalTooOld,
        AshpdError::PortalNotFound(_) => PlatformErrorCode::PortalUnavailable,
        AshpdError::Portal(ashpd::PortalError::NotAllowed(_)) => {
            PlatformErrorCode::PermissionDenied
        }
        _ => PlatformErrorCode::CaptureFailed,
    };
    PlatformError::new(code, correlation_id)
}

fn map_shortcut_error(error: AshpdError, correlation_id: &str) -> PlatformError {
    let code = match error {
        AshpdError::Response(ResponseError::Cancelled)
        | AshpdError::Portal(ashpd::PortalError::Cancelled(_)) => {
            PlatformErrorCode::ShortcutBindCancelled
        }
        AshpdError::PortalNotFound(_) | AshpdError::RequiresVersion(_, _) => {
            PlatformErrorCode::ShortcutUnavailable
        }
        AshpdError::Portal(ashpd::PortalError::NotAllowed(_)) => {
            PlatformErrorCode::PermissionDenied
        }
        _ => PlatformErrorCode::ShortcutUnavailable,
    };
    PlatformError::new(code, correlation_id)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use crate::platform::{PlatformErrorCode, PortalClient, ShortcutSpec};

    use super::{AshpdPortalClient, missing_shortcuts, validated_file_uri};

    #[test]
    fn ashpd_client_implements_the_portal_boundary() {
        fn assert_portal_client<T: PortalClient>() {}
        assert_portal_client::<AshpdPortalClient>();
    }

    #[test]
    fn accepts_only_local_file_uris() {
        assert_eq!(
            validated_file_uri("file:///tmp/capture.png", "uri-test").unwrap(),
            std::path::PathBuf::from("/tmp/capture.png"),
        );
        for uri in [
            "https://example.test/capture.png",
            "file://remote-host/capture.png",
            "not a uri",
        ] {
            let error = validated_file_uri(uri, "uri-test").unwrap_err();
            assert_eq!(error.code, PlatformErrorCode::InvalidUri);
        }
    }

    #[test]
    fn binding_plan_never_rebinds_an_existing_id() {
        let existing = BTreeSet::from(["capture-area".to_owned()]);
        let requested = [
            ShortcutSpec {
                id: "capture-area".to_owned(),
                preferred_trigger: Some("CTRL+PRINT".to_owned()),
            },
            ShortcutSpec {
                id: "capture-window".to_owned(),
                preferred_trigger: None,
            },
        ];
        let missing = missing_shortcuts(&existing, &requested);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].id, "capture-window");
    }
}
