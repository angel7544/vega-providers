use tauri::{AppHandle, Manager, Emitter};
use tokio::process::Command;
use serde::{Serialize, Deserialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::Mutex;
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;

// ============================
// 🏗️ APP STATE
// ============================

/// Per-download runtime state stored in AppState.
struct DownloadEntry {
    title: String,
    cancel_tx: tokio::sync::broadcast::Sender<()>,
    /// Shared pause flag. true = paused, false = running.
    paused: Arc<Mutex<bool>>,
}

struct AppState {
    downloads: Mutex<std::collections::HashMap<String, DownloadEntry>>,
}

// ============================
// 📊 SERIALISABLE TYPES
// ============================

#[derive(Serialize, Clone)]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    speed: f64, // bytes per second
}

#[derive(Serialize, Clone)]
struct ActiveDownloadInfo {
    id: String,
    title: String,
    paused: bool,
}

// ============================
// 🗄️ JSON DATABASE
// ============================

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Cannot resolve executable path: {}", e))?;
    let exec_dir = exe_path.parent()
        .ok_or_else(|| "Cannot resolve executable parent directory".to_string())?;
    
    let exe_settings = exec_dir.join("settings.json");
    
    // Test write permission in the executable directory
    let test_file = exec_dir.join("settings.write_test");
    match std::fs::write(&test_file, b"test") {
        Ok(_) => {
            let _ = std::fs::remove_file(test_file);
            Ok(exe_settings)
        }
        Err(_) => {
            // Fall back to standard AppData directory if directory is read-only
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
            Ok(data_dir.join("settings.json"))
        }
    }
}

#[tauri::command]
async fn db_load(app: AppHandle) -> Result<Value, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(Value::Object(serde_json::Map::new()));
    }
    let raw = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse settings.json: {}", e))
}

#[tauri::command]
async fn db_save(app: AppHandle, data: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialise settings: {}", e))?;
    tokio::fs::write(&tmp_path, json.as_bytes())
        .await
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    tokio::fs::rename(&tmp_path, &path)
        .await
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;
    Ok(())
}

// ============================
// 🎮 VLC INTEGRATION
// ============================

fn find_vlc() -> Option<String> {
    if let Ok(output) = std::process::Command::new("where").arg("vlc").output() {
        if output.status.success() {
            if let Ok(path) = std::str::from_utf8(&output.stdout) {
                let p = path.lines().next().unwrap_or("").trim().to_string();
                if !p.is_empty() {
                    return Some(p);
                }
            }
        }
    }
    let common_paths = [
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    ];
    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

#[tauri::command]
async fn launch_vlc(
    url: String,
    title: String,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let vlc_path = find_vlc().ok_or_else(|| "VLC_NOT_FOUND".to_string())?;
    let mut cmd = Command::new(&vlc_path);
    cmd.arg(&url)
        .arg("--meta-title")
        .arg(&title)
        .arg("--one-instance")
        .arg("--no-qt-privacy-ask");
    if let Some(h) = headers {
        for (k, v) in h {
            let lower_k = k.to_lowercase();
            if lower_k == "referer" || lower_k == "referrer" {
                cmd.arg(format!(":http-referrer={}", v));
            } else {
                cmd.arg(format!(":http-header-fields={}: {}", k, v));
            }
        }
    }
    match cmd.spawn() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to launch VLC: {}", e)),
    }
}

#[tauri::command]
async fn check_vlc_installed() -> Result<bool, String> {
    Ok(find_vlc().is_some())
}

#[tauri::command]
async fn open_vlc_download_page(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "https://www.videolan.org/vlc/download-windows.html",
            None::<&str>,
        )
        .map_err(|e| format!("Failed to open browser: {}", e))
}

// ============================
// 📥 DOWNLOAD ENGINE
// ============================

/// Returns a list of all currently active (running or paused) downloads.
/// Called by the frontend after a page refresh to restore the downloads list.
#[tauri::command]
async fn get_active_downloads(app: AppHandle) -> Result<Vec<ActiveDownloadInfo>, String> {
    let state = app.state::<AppState>();
    let downloads = state.downloads.lock().await;
    let mut result = Vec::new();
    for (id, entry) in downloads.iter() {
        let paused = *entry.paused.lock().await;
        result.push(ActiveDownloadInfo {
            id: id.clone(),
            title: entry.title.clone(),
            paused,
        });
    }
    Ok(result)
}

/// Pause an active download (stops writing chunks; the HTTP connection stays open).
#[tauri::command]
async fn pause_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let downloads = state.downloads.lock().await;
    if let Some(entry) = downloads.get(&id) {
        let mut paused = entry.paused.lock().await;
        *paused = true;
        app.emit("download-paused", serde_json::json!({ "id": id })).ok();
        Ok(())
    } else {
        Err("Download not found".into())
    }
}

/// Resume a paused download.
#[tauri::command]
async fn resume_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let downloads = state.downloads.lock().await;
    if let Some(entry) = downloads.get(&id) {
        let mut paused = entry.paused.lock().await;
        *paused = false;
        app.emit("download-resumed", serde_json::json!({ "id": id })).ok();
        Ok(())
    } else {
        Err("Download not found".into())
    }
}

#[tauri::command]
async fn start_download_dialog(
    app: AppHandle,
    url: String,
    title: String,
    download_dir: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    let safe_title = title.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");
    let default_name = format!("{}.mp4", safe_title);

    let state = app.state::<AppState>();

    let path_buf = if let Some(dir) = download_dir {
        PathBuf::from(dir).join(&default_name)
    } else {
        match app
            .dialog()
            .file()
            .set_file_name(&default_name)
            .blocking_save_file()
        {
            Some(path) => path.into_path().map_err(|_| "Invalid path".to_string())?,
            None => return Err("User cancelled the download dialog".into()),
        }
    };

    let path_str = path_buf.to_string_lossy().to_string();
    let id = path_str.clone();

    let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel(1);
    let paused_flag = Arc::new(Mutex::new(false));

    {
        let mut downloads = state.downloads.lock().await;
        downloads.insert(
            id.clone(),
            DownloadEntry {
                title: title.clone(),
                cancel_tx,
                paused: Arc::clone(&paused_flag),
            },
        );
    }

    let app_clone = app.clone();
    let url_clone = url.clone();
    let headers_clone = headers.clone();

    tokio::spawn(async move {
        app_clone
            .emit("download-started", serde_json::json!({ "id": id, "title": title }))
            .unwrap();

        let mut req = reqwest::Client::new().get(&url_clone);
        if let Some(h) = headers_clone {
            for (k, v) in h {
                req = req.header(k, v);
            }
        }

        match req.send().await {
            Ok(res) => {
                let total_size = res.content_length();
                if let Ok(mut file) = tokio::fs::File::create(&path_buf).await {
                    let mut stream = res.bytes_stream();
                    let mut downloaded: u64 = 0;
                    let mut last_emit = std::time::Instant::now();
                    let mut last_bytes: u64 = 0;

                    loop {
                        // ── Pause check ───────────────────────────────────
                        {
                            let is_paused = *paused_flag.lock().await;
                            if is_paused {
                                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                continue;
                            }
                        }

                        tokio::select! {
                            chunk = stream.next() => {
                                match chunk {
                                    Some(Ok(bytes)) => {
                                        if let Err(e) = file.write_all(&bytes).await {
                                            app_clone.emit("download-error", serde_json::json!({ "id": id, "error": e.to_string() })).unwrap();
                                            break;
                                        }
                                        downloaded += bytes.len() as u64;

                                        let now = std::time::Instant::now();
                                        let elapsed = now.duration_since(last_emit).as_secs_f64();
                                        if elapsed >= 0.5 {
                                            let speed = (downloaded - last_bytes) as f64 / elapsed;
                                            app_clone.emit("download-progress", DownloadProgress {
                                                id: id.clone(),
                                                downloaded,
                                                total: total_size,
                                                speed,
                                            }).unwrap();
                                            last_emit = now;
                                            last_bytes = downloaded;
                                        }
                                    }
                                    Some(Err(e)) => {
                                        app_clone.emit("download-error", serde_json::json!({ "id": id, "error": e.to_string() })).unwrap();
                                        break;
                                    }
                                    None => {
                                        app_clone.emit("download-finished", serde_json::json!({ "id": id })).unwrap();
                                        break;
                                    }
                                }
                            }
                            _ = cancel_rx.recv() => {
                                app_clone.emit("download-cancelled", serde_json::json!({ "id": id })).unwrap();
                                break;
                            }
                        }
                    }
                } else {
                    app_clone
                        .emit("download-error", serde_json::json!({ "id": id, "error": "Failed to create file" }))
                        .unwrap();
                }
            }
            Err(e) => {
                app_clone
                    .emit("download-error", serde_json::json!({ "id": id, "error": e.to_string() }))
                    .unwrap();
            }
        }

        // Cleanup from state map
        let state = app_clone.state::<AppState>();
        let mut downloads = state.downloads.lock().await;
        downloads.remove(&id);
    });

    Ok(())
}

#[tauri::command]
async fn cancel_download(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut downloads = state.downloads.lock().await;
    if let Some(entry) = downloads.remove(&id) {
        let _ = entry.cancel_tx.send(());
        Ok(())
    } else {
        Err("Download not found or already finished".into())
    }
}

#[tauri::command]
fn clear_cache(window: tauri::WebviewWindow) {
    let _ = window.eval("localStorage.clear(); sessionStorage.clear();");
}

// ============================
// 🚀 APP ENTRY POINT
// ============================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(AppState {
                downloads: Mutex::new(std::collections::HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database
            db_load,
            db_save,
            // VLC
            launch_vlc,
            check_vlc_installed,
            open_vlc_download_page,
            // Downloads
            get_active_downloads,
            start_download_dialog,
            pause_download,
            resume_download,
            cancel_download,
            // Cache clearing
            clear_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
