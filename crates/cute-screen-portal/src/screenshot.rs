use ashpd::{
    desktop::ResponseError,
    zbus::{
        Connection, Proxy,
        proxy::SignalStream,
        zvariant::{OwnedObjectPath, OwnedValue, Value},
    },
};
use futures_util::StreamExt;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

const DESTINATION: &str = "org.freedesktop.portal.Desktop";
const DESKTOP: &str = "/org/freedesktop/portal/desktop";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(2);

fn cancelled_error() -> ashpd::Error {
    ashpd::Error::Response(ResponseError::Cancelled)
}

async fn cancellation(cancelled: &AtomicBool) {
    while !cancelled.load(Ordering::Acquire) {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn disconnected(stream: &mut SignalStream<'_>) {
    while let Some(message) = stream.next().await {
        if let Ok((name, old, new)) = message.body().deserialize::<(String, String, String)>()
            && name == DESTINATION
            && old != new
        {
            return;
        }
    }
}

async fn close(request: &Proxy<'_>) {
    match tokio::time::timeout(HANDSHAKE_TIMEOUT, request.call::<_, _, ()>("Close", &())).await {
        Ok(Ok(())) => {}
        result => eprintln!("cute-screen Screenshot request cleanup: {result:?}"),
    }
}

fn timeout_error() -> ashpd::Error {
    std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        "Screenshot method handshake timed out",
    )
    .into()
}

pub async fn capture(
    connection: &Connection,
    target: Option<u32>,
    cancelled: Arc<AtomicBool>,
) -> Result<String, ashpd::Error> {
    if cancelled.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    let token = format!("cute_screen_{}", uuid::Uuid::new_v4().simple());
    let sender = connection
        .unique_name()
        .ok_or(ashpd::Error::NoResponse)?
        .as_str()
        .trim_start_matches(':')
        .replace('.', "_");
    let path = format!("{DESKTOP}/request/{sender}/{token}");
    let mut request = Proxy::new_owned(
        connection.clone(),
        DESTINATION,
        path.clone(),
        "org.freedesktop.portal.Request",
    )
    .await?;
    // ashpd 0.13 send().await waits for Response before returning its Request.
    // Own the public request path so cancellation can send Close while pending.
    let mut responses = request.receive_signal("Response").await?;
    let bus = Proxy::new_owned(
        connection.clone(),
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
    )
    .await?;
    let mut owner = bus.receive_signal("NameOwnerChanged").await?;
    let screenshot = Proxy::new_owned(
        connection.clone(),
        DESTINATION,
        DESKTOP,
        "org.freedesktop.portal.Screenshot",
    )
    .await?;
    let mut options = HashMap::from([
        ("handle_token", Value::from(token.as_str())),
        ("interactive", Value::from(false)),
        ("modal", Value::from(true)),
    ]);
    if let Some(target) = target {
        options.insert("target", Value::from(target));
    }
    if cancelled.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    let arguments = ("", options);
    let sent = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        screenshot.call::<_, _, OwnedObjectPath>("Screenshot", &arguments),
    );
    let handle = tokio::select! {
        biased;
        _ = cancellation(&cancelled) => { close(&request).await; return Err(cancelled_error()); }
        _ = disconnected(&mut owner) => return Err(ashpd::Error::NoResponse),
        result = sent => match result {
            Ok(result) => result.map_err(ashpd::PortalError::from).map_err(ashpd::Error::from)?,
            Err(_) => { close(&request).await; return Err(timeout_error()); }
        }
    };
    if handle.as_str() != path {
        request = Proxy::new_owned(
            connection.clone(),
            DESTINATION,
            handle,
            "org.freedesktop.portal.Request",
        )
        .await?;
        responses = request.receive_signal("Response").await?;
    }
    let message = tokio::select! {
        biased;
        _ = cancellation(&cancelled) => { close(&request).await; return Err(cancelled_error()); }
        _ = disconnected(&mut owner) => return Err(ashpd::Error::NoResponse),
        message = responses.next() => message.ok_or(ashpd::Error::NoResponse)?,
    };
    let (response, mut results) = message
        .body()
        .deserialize::<(u32, HashMap<String, OwnedValue>)>()?;
    // A cancellation racing the response must never import or persist pixels.
    if cancelled.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    match response {
        0 => results
            .remove("uri")
            .and_then(|uri| String::try_from(uri).ok())
            .ok_or(ashpd::Error::NoResponse),
        1 => Err(cancelled_error()),
        _ => Err(ashpd::Error::Response(ResponseError::Other)),
    }
}
