use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Clone, Default)]
pub struct ActivationTokens(Arc<Mutex<HashMap<String, String>>>);

pub struct ActivationLease {
    tokens: ActivationTokens,
    request: String,
}

impl ActivationTokens {
    pub fn begin(&self, request: String, token: Option<String>) -> ActivationLease {
        if let Some(token) = token.filter(|token| !token.is_empty()) {
            self.0
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .insert(request.clone(), token);
        }
        ActivationLease {
            tokens: self.clone(),
            request,
        }
    }

    pub fn take(&self, request: &str) -> Option<String> {
        self.0
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(request)
    }
}

impl Drop for ActivationLease {
    fn drop(&mut self) {
        self.tokens.take(&self.request);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_single_use_and_scoped_to_the_request() {
        let tokens = ActivationTokens::default();
        let _first = tokens.begin("first".into(), Some("first-token".into()));
        let second = tokens.begin("busy-second".into(), Some("second-token".into()));
        drop(second);
        assert_eq!(tokens.take("busy-second"), None);
        assert_eq!(tokens.take("first"), Some("first-token".into()));
        assert_eq!(tokens.take("first"), None);
    }

    #[test]
    fn cancellation_and_failed_presentation_discard_the_token() {
        let tokens = ActivationTokens::default();
        drop(tokens.begin("cancelled".into(), Some("discard".into())));
        let _next = tokens.begin("next".into(), None);
        assert_eq!(tokens.take("cancelled"), None);
        assert_eq!(tokens.take("next"), None);
    }
}
