use super::super::{CaptureOutcomeV2, QuickCaptureDraftRecord, QuickCaptureDraftV1};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::capture) enum QuickCapturePhase {
    Selecting,
    Editing,
    Preparing,
}

#[derive(Debug, Default)]
pub(in crate::capture) enum QuickCaptureState {
    #[default]
    Idle,
    Active {
        phase: QuickCapturePhase,
        record: QuickCaptureDraftRecord,
    },
    Committing {
        draft_id: String,
    },
    Committed {
        draft_id: String,
        outcome: CaptureOutcomeV2,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub(in crate::capture) enum QuickStateError {
    #[error("another quick capture draft is active")]
    Busy,
    #[error("quick capture draft is not active")]
    Inactive,
    #[error("quick capture draft is in the wrong phase")]
    InvalidPhase,
}

impl QuickCaptureState {
    pub(in crate::capture) fn stage(
        &mut self,
        record: QuickCaptureDraftRecord,
    ) -> Result<(), QuickStateError> {
        if !matches!(self, Self::Idle) {
            return Err(QuickStateError::Busy);
        }
        let phase = if record.descriptor.selection_pending {
            QuickCapturePhase::Selecting
        } else {
            QuickCapturePhase::Editing
        };
        *self = Self::Active { phase, record };
        Ok(())
    }

    pub(in crate::capture) fn active_descriptor(&self) -> Option<&QuickCaptureDraftV1> {
        match self {
            Self::Active { record, .. } => Some(&record.descriptor),
            Self::Idle | Self::Committing { .. } | Self::Committed { .. } => None,
        }
    }

    pub(in crate::capture) fn active_record_mut(
        &mut self,
        draft_id: &str,
    ) -> Result<(&mut QuickCapturePhase, &mut QuickCaptureDraftRecord), QuickStateError> {
        match self {
            Self::Active { phase, record } if record.descriptor.draft_id == draft_id => {
                Ok((phase, record))
            }
            Self::Active { .. } | Self::Idle | Self::Committing { .. } | Self::Committed { .. } => {
                Err(QuickStateError::Inactive)
            }
        }
    }

    pub(in crate::capture) fn cancel(&mut self, draft_id: &str) -> Option<QuickCaptureDraftRecord> {
        let matches = matches!(
            self,
            Self::Active { record, .. } if record.descriptor.draft_id == draft_id
        );
        if !matches {
            return None;
        }
        let Self::Active { record, .. } = std::mem::take(self) else {
            unreachable!("the state was checked as active")
        };
        Some(record)
    }

    pub(in crate::capture) fn begin_prepare(
        &mut self,
        draft_id: &str,
    ) -> Result<&mut QuickCaptureDraftRecord, QuickStateError> {
        let (phase, record) = self.active_record_mut(draft_id)?;
        if *phase != QuickCapturePhase::Editing {
            return Err(QuickStateError::InvalidPhase);
        }
        *phase = QuickCapturePhase::Preparing;
        Ok(record)
    }

    pub(in crate::capture) fn finish_prepare(
        &mut self,
        draft_id: &str,
    ) -> Result<&mut QuickCaptureDraftRecord, QuickStateError> {
        let (phase, record) = self.active_record_mut(draft_id)?;
        if *phase != QuickCapturePhase::Preparing {
            return Err(QuickStateError::InvalidPhase);
        }
        *phase = QuickCapturePhase::Editing;
        Ok(record)
    }

    pub(in crate::capture) fn confirm_selection(
        &mut self,
        draft_id: &str,
    ) -> Result<&mut QuickCaptureDraftRecord, QuickStateError> {
        let (phase, record) = self.active_record_mut(draft_id)?;
        if *phase != QuickCapturePhase::Selecting {
            return Err(QuickStateError::InvalidPhase);
        }
        *phase = QuickCapturePhase::Editing;
        Ok(record)
    }

    pub(in crate::capture) fn begin_commit(
        &mut self,
        draft_id: &str,
    ) -> Result<QuickCaptureDraftRecord, QuickStateError> {
        let matches = matches!(
            self,
            Self::Active {
                phase: QuickCapturePhase::Editing,
                record,
            } if record.descriptor.draft_id == draft_id
        );
        if !matches {
            return match self {
                Self::Active { record, .. } if record.descriptor.draft_id == draft_id => {
                    Err(QuickStateError::InvalidPhase)
                }
                _ => Err(QuickStateError::Inactive),
            };
        }
        let Self::Active { record, .. } = std::mem::take(self) else {
            unreachable!("the state was checked as editable")
        };
        *self = Self::Committing {
            draft_id: draft_id.to_owned(),
        };
        Ok(record)
    }

    pub(in crate::capture) fn restore_after_failed_commit(
        &mut self,
        record: QuickCaptureDraftRecord,
    ) -> Result<(), QuickStateError> {
        let draft_id = &record.descriptor.draft_id;
        if !matches!(self, Self::Committing { draft_id: active } if active == draft_id) {
            return Err(QuickStateError::InvalidPhase);
        }
        *self = Self::Active {
            phase: QuickCapturePhase::Editing,
            record,
        };
        Ok(())
    }

    pub(in crate::capture) fn complete_commit(
        &mut self,
        draft_id: &str,
        outcome: CaptureOutcomeV2,
    ) -> Result<(), QuickStateError> {
        if !matches!(self, Self::Committing { draft_id: active } if active == draft_id) {
            return Err(QuickStateError::InvalidPhase);
        }
        *self = Self::Committed {
            draft_id: draft_id.to_owned(),
            outcome,
        };
        Ok(())
    }

    pub(in crate::capture) fn release_committed(
        &mut self,
        draft_id: &str,
    ) -> Result<CaptureOutcomeV2, QuickStateError> {
        let matches =
            matches!(self, Self::Committed { draft_id: active, .. } if active == draft_id);
        if !matches {
            return Err(QuickStateError::InvalidPhase);
        }
        let Self::Committed { outcome, .. } = std::mem::take(self) else {
            unreachable!("the state was checked as committed")
        };
        Ok(outcome)
    }

    #[cfg(test)]
    fn phase_name(&self) -> Option<&'static str> {
        match self {
            Self::Active {
                phase: QuickCapturePhase::Selecting,
                ..
            } => Some("selecting"),
            Self::Active {
                phase: QuickCapturePhase::Editing,
                ..
            } => Some("editing"),
            Self::Active {
                phase: QuickCapturePhase::Preparing,
                ..
            } => Some("preparing"),
            Self::Committing { .. } => Some("committing"),
            Self::Committed { .. } => Some("committed"),
            Self::Idle => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Barrier, Mutex};

    use super::*;
    use crate::capture::{
        CaptureAction, CaptureInvocationSource, CaptureRequestV1, QuickCaptureSelectionV1,
    };

    fn editable_record() -> QuickCaptureDraftRecord {
        QuickCaptureDraftRecord {
            descriptor: QuickCaptureDraftV1 {
                version: 1,
                draft_id: "draft".to_owned(),
                correlation_id: "correlation".to_owned(),
                image_token: "image".to_owned(),
                width: 100,
                height: 100,
                selection: QuickCaptureSelectionV1 {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                },
                can_expand_selection: true,
                selection_pending: false,
            },
            request: CaptureRequestV1 {
                correlation_id: "correlation".to_owned(),
                action: CaptureAction::Area,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: CaptureInvocationSource::Ui,
            },
            geometry: None,
            frame_geometry: None,
            cursor_included: None,
            prepared_token: None,
            terminal: None,
        }
    }

    #[test]
    fn begin_commit_prevents_concurrent_cancel() {
        let state = Arc::new(Mutex::new(QuickCaptureState::default()));
        state
            .lock()
            .expect("state")
            .stage(editable_record())
            .expect("stage");
        let committed = Arc::new(Barrier::new(2));

        let commit_state = Arc::clone(&state);
        let commit_barrier = Arc::clone(&committed);
        let commit = std::thread::spawn(move || {
            let record = commit_state
                .lock()
                .expect("state")
                .begin_commit("draft")
                .expect("begin commit");
            commit_barrier.wait();
            record
        });

        committed.wait();
        let cancelled = state.lock().expect("state").cancel("draft");
        let record = commit.join().expect("commit thread");

        assert!(cancelled.is_none());
        assert_eq!(record.descriptor.draft_id, "draft");
        assert_eq!(
            state.lock().expect("state").phase_name(),
            Some("committing")
        );
    }

    #[test]
    fn failed_commit_returns_draft_to_editing() {
        let mut state = QuickCaptureState::default();
        state.stage(editable_record()).expect("stage");
        let record = state.begin_commit("draft").expect("begin commit");

        state
            .restore_after_failed_commit(record)
            .expect("restore draft");

        assert_eq!(state.phase_name(), Some("editing"));
    }
}
