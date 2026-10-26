//! Desktop-independent portal transport and request-scoped activation state.

mod activation;
pub use activation::{ActivationLease, ActivationTokens};

#[cfg(target_os = "linux")]
pub mod screenshot;
#[cfg(target_os = "linux")]
pub mod shortcuts;
