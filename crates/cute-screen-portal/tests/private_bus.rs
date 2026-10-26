#![cfg(target_os = "linux")]

mod support;

use ashpd::desktop::ResponseError;
use ashpd::zbus::zvariant::OwnedValue;
use cute_screen_portal::screenshot;
use cute_screen_portal::shortcuts::{PortalSession, Shortcut, ShortcutActivation};
use std::collections::HashMap;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use support::Harness;

fn shortcuts() -> Vec<Shortcut> {
    vec![Shortcut {
        id: "capture-area".into(),
        description: "Area".into(),
        preferred_trigger: Some("CTRL+SHIFT+2".into()),
    }]
}

#[test]
fn activation_during_bind_is_not_lost_before_listener_startup() {
    support::run(async {
        let harness = Harness::new().await;
        harness
            .state
            .activate_on_bind
            .store(true, Ordering::Release);
        let session = PortalSession::create(harness.client.clone(), &shortcuts(), false)
            .await
            .expect("bind");
        let stop = Arc::clone(&session);
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        Arc::clone(&session)
            .listen(Arc::new(move |event| {
                sender.send(event).expect("activation receiver");
                stop.stop.store(true, Ordering::Release);
            }))
            .await;
        assert_eq!(
            events
                .recv()
                .await
                .expect("activation during bind")
                .token
                .as_deref(),
            Some("bind-token")
        );
    });
}

#[test]
fn shortcuts_preserve_activation_tokens_filter_sessions_and_notice_revocation() {
    support::run(async {
        let harness = Harness::new().await;
        let session = PortalSession::create(harness.client.clone(), &shortcuts(), false)
            .await
            .expect("restore bindings");
        let path = harness.state.session.lock().expect("session").clone();
        // Queue the signal before listen starts: subscriptions must already exist.
        harness
            .activate("/org/freedesktop/portal/desktop/session/foreign", "wrong")
            .await;
        harness.activate(&path, "focus-token").await;
        let (sender, mut events) = tokio::sync::mpsc::unbounded_channel();
        let listener = Arc::clone(&session).listen(Arc::new(move |event| {
            sender.send(event).expect("activation receiver");
        }));
        let check = async {
            let event = events.recv().await.expect("activation");
            assert_eq!(
                event,
                ShortcutActivation {
                    id: "capture-area".into(),
                    token: Some("focus-token".into())
                }
            );
            harness
                .server
                .emit_signal(
                    None::<&str>,
                    path,
                    "org.freedesktop.portal.Session",
                    "Closed",
                    &(HashMap::<String, OwnedValue>::new(),),
                )
                .await
                .expect("Closed");
        };
        tokio::join!(listener, check);
        assert!(
            session
                .error
                .lock()
                .expect("error")
                .as_ref()
                .is_some_and(|error| error.contains("revoked"))
        );
    });
}

#[test]
fn portal_restart_ends_old_listener_and_restores_bindings_on_a_new_connection() {
    support::run(async {
        let mut harness = Harness::new().await;
        let session = PortalSession::create(harness.client.clone(), &shortcuts(), false)
            .await
            .expect("session");
        let listen = Arc::clone(&session).listen(Arc::new(|_| {}));
        let restart = async {
            harness.restart().await;
        };
        tokio::join!(listen, restart);
        assert!(session.error.lock().expect("error").is_some());
        let replacement = PortalSession::create(harness.client.clone(), &shortcuts(), false)
            .await
            .expect("restored session");
        assert!(
            replacement
                .displays
                .lock()
                .expect("bindings")
                .contains_key("capture-area")
        );
        replacement.stop.store(true, Ordering::Release);
        replacement.listen(Arc::new(|_| {})).await;
    });
}

#[test]
fn screenshot_early_response_and_programmatic_cancel_use_the_real_bus() {
    support::run(async {
        let harness = Harness::new().await;
        let result =
            screenshot::capture(&harness.client, Some(1), Arc::new(AtomicBool::new(false))).await;
        assert_eq!(
            result.expect("early response must not be lost"),
            "file:///tmp/private-test.png"
        );
        harness.state.waiting.store(true, Ordering::Release);
        let cancelled = Arc::new(AtomicBool::new(false));
        let capture = screenshot::capture(&harness.client, None, Arc::clone(&cancelled));
        let cancel = async {
            harness.state.started.notified().await;
            cancelled.store(true, Ordering::Release);
        };
        let (result, ()) = tokio::join!(capture, cancel);
        assert!(matches!(
            result,
            Err(ashpd::Error::Response(ResponseError::Cancelled))
        ));
        assert_eq!(harness.state.closed.load(Ordering::Acquire), 1);
        assert_eq!(
            harness.state.responses.load(Ordering::Acquire),
            1,
            "Close sends no Response"
        );
        harness.state.waiting.store(false, Ordering::Release);
        assert!(
            screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(false)))
                .await
                .is_ok()
        );
    });
}

#[test]
fn cancellation_before_send_does_not_open_a_request() {
    support::run(async {
        let harness = Harness::new().await;
        let result =
            screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(true))).await;
        assert!(matches!(
            result,
            Err(ashpd::Error::Response(ResponseError::Cancelled))
        ));
        assert_eq!(harness.state.calls.load(Ordering::Acquire), 0);
    });
}

#[test]
fn screenshot_method_permission_denial_is_not_a_generic_transport_error() {
    support::run(async {
        let harness = Harness::new().await;
        harness.state.denied.store(true, Ordering::Release);
        let result =
            screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(false))).await;
        assert!(matches!(
            result,
            Err(ashpd::Error::Portal(ashpd::PortalError::NotAllowed(_)))
        ));
    });
}

#[test]
fn cancellation_closes_a_request_even_before_the_method_reply() {
    support::run(async {
        let harness = Harness::new().await;
        harness.state.waiting.store(true, Ordering::Release);
        harness.state.delay_reply.store(true, Ordering::Release);
        let cancelled = Arc::new(AtomicBool::new(false));
        let capture = screenshot::capture(&harness.client, None, Arc::clone(&cancelled));
        let cancel = async {
            harness.state.started.notified().await;
            cancelled.store(true, Ordering::Release);
        };
        let (result, ()) = tokio::join!(capture, cancel);
        assert!(matches!(
            result,
            Err(ashpd::Error::Response(ResponseError::Cancelled))
        ));
        assert_eq!(harness.state.closed.load(Ordering::Acquire), 1);
    });
}

#[test]
fn user_interaction_outlives_the_technical_handshake_timeout() {
    support::run(async {
        let harness = Harness::new().await;
        harness.state.waiting.store(true, Ordering::Release);
        let capture = screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(false)));
        let answer = async {
            harness.state.started.notified().await;
            tokio::time::sleep(Duration::from_millis(2100)).await;
            let path = harness.state.request.lock().expect("request").clone();
            harness
                .server
                .emit_signal(
                    None::<&str>,
                    path,
                    "org.freedesktop.portal.Request",
                    "Response",
                    &(
                        0_u32,
                        HashMap::from([(
                            "uri",
                            ashpd::zbus::zvariant::Value::from("file:///tmp/delayed.png"),
                        )]),
                    ),
                )
                .await
                .expect("delayed Response");
        };
        let (result, ()) = tokio::join!(capture, answer);
        assert_eq!(
            result.expect("no deadline on user interaction"),
            "file:///tmp/delayed.png"
        );
    });
}

#[test]
fn screenshot_user_cancel_error_and_disconnect_remain_distinct() {
    support::run(async {
        let harness = Harness::new().await;
        for response in [1, 2] {
            harness.state.response.store(response, Ordering::Release);
            let result =
                screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(false))).await;
            let expected = if response == 1 {
                ResponseError::Cancelled
            } else {
                ResponseError::Other
            };
            assert!(matches!(result, Err(ashpd::Error::Response(actual)) if actual == expected));
        }
        harness.state.waiting.store(true, Ordering::Release);
        let capture = screenshot::capture(&harness.client, None, Arc::new(AtomicBool::new(false)));
        let disconnect = async {
            harness.state.started.notified().await;
            harness
                .server
                .clone()
                .close()
                .await
                .expect("disconnect fake portal");
        };
        let (result, ()) = tokio::join!(capture, disconnect);
        assert!(
            result.is_err(),
            "service loss must terminate pending Screenshot"
        );
    });
}

// All tests have a deadline; a missing Response must fail instead of hanging CI.
const TEST_TIMEOUT: Duration = Duration::from_secs(10);
