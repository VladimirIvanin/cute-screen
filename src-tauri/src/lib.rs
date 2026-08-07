use serde::Serialize;

#[cfg(feature = "fake-platform")]
pub mod fake_platform;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub message: &'static str,
    pub protocol_version: u8,
}

#[tauri::command]
fn ping() -> PingResponse {
    PingResponse {
        message: "pong",
        protocol_version: 1,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(feature = "fake-platform")]
    let builder = {
        use tauri::Manager;

        builder.setup(|app| {
            let scenario = fake_platform::load_scenario_from_env()?;
            eprintln!("{}", fake_platform::FAKE_PLATFORM_SENTINEL);
            app.manage(scenario);
            Ok(())
        })
    };

    #[cfg(feature = "test-harness")]
    let builder = {
        eprintln!("cute-screen:test-harness");
        builder
            .plugin(tauri_plugin_wdio::init())
            .plugin(tauri_plugin_wdio_webdriver::init())
    };

    builder
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("failed to run Cute Screen desktop host");
}

#[cfg(test)]
mod tests {
    use super::PingResponse;

    #[test]
    fn ping_contract_is_stable() {
        assert_eq!(
            super::ping(),
            PingResponse {
                message: "pong",
                protocol_version: 1,
            }
        );
    }
}
