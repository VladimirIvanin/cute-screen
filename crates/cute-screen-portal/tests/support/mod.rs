use ashpd::zbus::{
    self, Connection,
    message::Header,
    zvariant::{OwnedObjectPath, OwnedValue, Value},
};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
    },
};

pub const DESTINATION: &str = "org.freedesktop.portal.Desktop";
pub const DESKTOP: &str = "/org/freedesktop/portal/desktop";

pub fn run(operation: impl std::future::Future<Output = ()>) {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(async {
            tokio::time::timeout(super::TEST_TIMEOUT, operation)
                .await
                .expect("private bus test deadline")
        });
}

struct PrivateBus(Child);
impl Drop for PrivateBus {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[derive(Default)]
pub struct State {
    pub waiting: AtomicBool,
    pub denied: AtomicBool,
    pub delay_reply: AtomicBool,
    pub activate_on_bind: AtomicBool,
    pub response: AtomicU32,
    pub calls: AtomicUsize,
    pub closed: AtomicUsize,
    pub responses: AtomicUsize,
    pub started: tokio::sync::Notify,
    pub session: Mutex<String>,
    pub request: Mutex<String>,
}

pub struct Harness {
    pub client: Connection,
    pub server: Connection,
    pub state: Arc<State>,
    address: String,
    _bus: PrivateBus,
}

impl Harness {
    pub async fn new() -> Self {
        // No environment mutation or session() connection: neither side can
        // reach the user's desktop, even when tests execute concurrently.
        let child = Command::new("dbus-daemon")
            .args(["--session", "--nofork", "--print-address=1"])
            .env_remove("XDG_RUNTIME_DIR")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("dbus-daemon is required for portal integration tests");
        let mut bus = PrivateBus(child);
        let mut address = String::new();
        BufReader::new(bus.0.stdout.take().expect("daemon stdout"))
            .read_line(&mut address)
            .expect("bus address");
        assert!(address.starts_with("unix:"));
        let state = Arc::new(State::default());
        let server = zbus::connection::Builder::address(address.trim())
            .expect("private address")
            .name(DESTINATION)
            .expect("service name")
            .serve_at(DESKTOP, FakeScreenshot(Arc::clone(&state)))
            .expect("screenshot interface")
            .serve_at(DESKTOP, FakeShortcuts(Arc::clone(&state)))
            .expect("shortcuts interface")
            .build()
            .await
            .expect("private service");
        let client = zbus::connection::Builder::address(address.trim())
            .expect("private address")
            .build()
            .await
            .expect("private client");
        Self {
            client,
            server,
            state,
            address: address.trim().to_owned(),
            _bus: bus,
        }
    }
}

fn owned_string(value: &str) -> OwnedValue {
    Value::from(value).try_to_owned().expect("owned string")
}

async fn respond(
    connection: &Connection,
    header: &Header<'_>,
    options: &HashMap<String, OwnedValue>,
    results: HashMap<&str, OwnedValue>,
) -> zbus::fdo::Result<OwnedObjectPath> {
    let token =
        <&str>::try_from(options.get("handle_token").expect("handle_token")).expect("token");
    let sender = header
        .sender()
        .expect("sender")
        .as_str()
        .trim_start_matches(':')
        .replace('.', "_");
    let path =
        OwnedObjectPath::try_from(format!("{DESKTOP}/request/{sender}/{token}")).expect("path");
    connection
        .emit_signal(
            None::<&str>,
            path.clone(),
            "org.freedesktop.portal.Request",
            "Response",
            &(0_u32, results),
        )
        .await?;
    Ok(path)
}

struct FakeSession;
#[zbus::interface(name = "org.freedesktop.portal.Session")]
impl FakeSession {
    fn close(&self) {}
}

struct FakeShortcuts(Arc<State>);
#[zbus::interface(name = "org.freedesktop.portal.GlobalShortcuts")]
impl FakeShortcuts {
    #[zbus(property)]
    fn version(&self) -> u32 {
        2
    }

    async fn create_session(
        &self,
        options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        let token = <&str>::try_from(options.get("session_handle_token").expect("session token"))
            .expect("token");
        let sender = header
            .sender()
            .expect("sender")
            .as_str()
            .trim_start_matches(':')
            .replace('.', "_");
        let path = format!("{DESKTOP}/session/{sender}/{token}");
        connection
            .object_server()
            .at(path.clone(), FakeSession)
            .await?;
        *self.0.session.lock().expect("session") = path.clone();
        respond(
            connection,
            &header,
            &options,
            HashMap::from([("session_handle", owned_string(&path))]),
        )
        .await
    }

    async fn list_shortcuts(
        &self,
        _session: OwnedObjectPath,
        options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        respond(connection, &header, &options, bindings()).await
    }

    async fn bind_shortcuts(
        &self,
        session: OwnedObjectPath,
        _shortcuts: Vec<(String, HashMap<String, OwnedValue>)>,
        _parent: &str,
        options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        if self.0.activate_on_bind.load(Ordering::Acquire) {
            connection
                .emit_signal(
                    None::<&str>,
                    DESKTOP,
                    "org.freedesktop.portal.GlobalShortcuts",
                    "Activated",
                    &(
                        session,
                        "capture-area",
                        123_u64,
                        HashMap::from([("activation_token", owned_string("bind-token"))]),
                    ),
                )
                .await?;
        }
        respond(connection, &header, &options, bindings()).await
    }
}

fn bindings() -> HashMap<&'static str, OwnedValue> {
    let entries = vec![(
        "capture-area".to_owned(),
        HashMap::from([
            ("description".to_owned(), owned_string("Area")),
            (
                "trigger_description".to_owned(),
                owned_string("Ctrl+Shift+2"),
            ),
        ]),
    )];
    HashMap::from([(
        "shortcuts",
        Value::from(entries).try_to_owned().expect("shortcut array"),
    )])
}

impl Harness {
    pub async fn restart(&mut self) {
        self.server
            .clone()
            .close()
            .await
            .expect("stop old portal owner");
        self.server = zbus::connection::Builder::address(self.address.as_str())
            .expect("private address")
            .name(DESTINATION)
            .expect("replacement name")
            .serve_at(DESKTOP, FakeScreenshot(Arc::clone(&self.state)))
            .expect("screenshot interface")
            .serve_at(DESKTOP, FakeShortcuts(Arc::clone(&self.state)))
            .expect("shortcuts interface")
            .build()
            .await
            .expect("replacement portal connection");
    }

    pub async fn activate(&self, session: &str, token: &str) {
        let path = OwnedObjectPath::try_from(session.to_owned()).expect("session path");
        self.server
            .emit_signal(
                None::<&str>,
                DESKTOP,
                "org.freedesktop.portal.GlobalShortcuts",
                "Activated",
                &(
                    path,
                    "capture-area",
                    123_u64,
                    HashMap::from([("activation_token", owned_string(token))]),
                ),
            )
            .await
            .expect("Activated");
    }
}

struct FakeRequest(Arc<State>);
#[zbus::interface(name = "org.freedesktop.portal.Request")]
impl FakeRequest {
    async fn close(&self) {
        self.0.closed.fetch_add(1, Ordering::AcqRel);
        // Intentionally no Response: this is the public Request.Close contract.
    }
}

struct FakeScreenshot(Arc<State>);
#[zbus::interface(name = "org.freedesktop.portal.Screenshot")]
impl FakeScreenshot {
    #[zbus(property)]
    fn version(&self) -> u32 {
        3
    }
    #[zbus(property)]
    fn available_targets(&self) -> u32 {
        15
    }

    async fn screenshot(
        &self,
        _parent: &str,
        options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &Connection,
    ) -> Result<OwnedObjectPath, ashpd::PortalError> {
        self.0.calls.fetch_add(1, Ordering::AcqRel);
        if self.0.denied.load(Ordering::Acquire) {
            return Err(ashpd::PortalError::NotAllowed("denied".into()));
        }
        let token = <&str>::try_from(options.get("handle_token").expect("handle_token"))
            .expect("string token");
        let sender = header
            .sender()
            .expect("sender")
            .as_str()
            .trim_start_matches(':')
            .replace('.', "_");
        let path = OwnedObjectPath::try_from(format!("{DESKTOP}/request/{sender}/{token}"))
            .expect("request path");
        connection
            .object_server()
            .at(path.clone(), FakeRequest(Arc::clone(&self.0)))
            .await?;
        *self.0.request.lock().expect("request") = path.to_string();
        self.0.started.notify_waiters();
        if self.0.delay_reply.load(Ordering::Acquire) {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
        if !self.0.waiting.load(Ordering::Acquire) {
            let result = HashMap::from([("uri", Value::from("file:///tmp/private-test.png"))]);
            self.0.responses.fetch_add(1, Ordering::AcqRel);
            // Emit before the method reply, exercising the subscription race.
            connection
                .emit_signal(
                    None::<&str>,
                    path.clone(),
                    "org.freedesktop.portal.Request",
                    "Response",
                    &(self.0.response.load(Ordering::Acquire), result),
                )
                .await?;
        }
        Ok(path)
    }
}
