use local_ip_address::local_ip;
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use sysinfo::System;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Default)]
struct AppState {
    server_process: Arc<Mutex<Option<Child>>>,
    proxy_process: Arc<Mutex<Option<Child>>>,
    npm_process: Arc<Mutex<Option<Child>>>,
}

#[derive(Serialize)]
struct Stats {
    cpu: f32,
    ram_mb: u64,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    line: String,
}

#[tauri::command]
fn get_local_ip() -> String {
    match local_ip() {
        Ok(ip) => ip.to_string(),
        Err(_) => "127.0.0.1".to_string(),
    }
}

#[tauri::command]
fn check_files() -> bool {
    let base = Path::new("..");
    base.join("package.json").exists()
        && base.join("dev-server.js").exists()
        && base.join("providers").exists()
}

#[tauri::command]
fn get_stats() -> Stats {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let cpu = sys.global_cpu_info().cpu_usage();
    let ram_mb = sys.used_memory() / (1024 * 1024);

    Stats { cpu, ram_mb }
}

#[tauri::command]
async fn kill_port(port: u16) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let cmd_str = format!("FOR /F \"tokens=5\" %a in ('netstat -aon ^| findstr :{} ^| findstr LISTENING') do taskkill /F /PID %a", port);
        let _ = std::process::Command::new("cmd")
            .args(&["/C", &cmd_str])
            .creation_flags(0x08000000)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let cmd_str = format!("lsof -i tcp:{} | grep LISTEN | awk '{{print $2}}' | xargs kill -9", port);
        let _ = std::process::Command::new("sh")
            .arg("-c")
            .arg(&cmd_str)
            .output();
    }
    Ok(())
}

#[tauri::command]
async fn start_server(app_handle: AppHandle, state: State<'_, AppState>, port: u16) -> Result<(), String> {
    let mut process_guard = state.server_process.lock().await;
    let mut proxy_guard = state.proxy_process.lock().await;
    
    if process_guard.is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    let mut std_cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    std_cmd.args(&["/C", "npm start"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    let mut std_cmd = std::process::Command::new("npm");
    #[cfg(not(target_os = "windows"))]
    std_cmd.arg("start");

    let mut cmd = Command::from(std_cmd);
    cmd.current_dir("..")
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    *process_guard = Some(child);

    // If custom port is requested, spawn proxy
    if port != 3001 {
        #[cfg(target_os = "windows")]
        let mut p_std_cmd = std::process::Command::new("cmd");
        #[cfg(target_os = "windows")]
        p_std_cmd.args(&["/C", "node proxy.js"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            p_std_cmd.creation_flags(0x08000000);
        }
        #[cfg(not(target_os = "windows"))]
        let mut p_std_cmd = std::process::Command::new("node");
        #[cfg(not(target_os = "windows"))]
        p_std_cmd.arg("proxy.js");

        p_std_cmd.env("PORT", port.to_string());

        let mut p_cmd = Command::from(p_std_cmd);
        p_cmd.current_dir("."); // Proxy is in desktop-app
        if let Ok(p_child) = p_cmd.spawn() {
            *proxy_guard = Some(p_child);
        }
    }

    let app_clone1 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone1.emit("server-log", LogPayload { line });
        }
    });

    let app_clone2 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone2.emit("server-log", LogPayload { line });
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    let mut process_guard = state.server_process.lock().await;
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill().await;
    }
    let mut proxy_guard = state.proxy_process.lock().await;
    if let Some(mut p_child) = proxy_guard.take() {
        let _ = p_child.kill().await;
    }
    Ok(())
}

#[tauri::command]
async fn npm_install(app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut process_guard = state.npm_process.lock().await;
    
    if process_guard.is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    let mut std_cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    std_cmd.args(&["/C", "npm install"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    let mut std_cmd = std::process::Command::new("npm");
    #[cfg(not(target_os = "windows"))]
    std_cmd.arg("install");

    let mut cmd = Command::from(std_cmd);
    cmd.current_dir("..")
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    *process_guard = Some(child);

    let app_clone1 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone1.emit("npm-log", LogPayload { line });
        }
    });

    let app_clone2 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone2.emit("npm-log", LogPayload { line });
        }
        let _ = app_clone2.emit("npm-finished", ());
    });

    Ok(())
}

#[tauri::command]
async fn run_terminal_command(app_handle: AppHandle, command_str: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut std_cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    std_cmd.args(&["/C", &command_str]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(0x08000000);
    }
    
    #[cfg(not(target_os = "windows"))]
    let mut std_cmd = std::process::Command::new("sh");
    #[cfg(not(target_os = "windows"))]
    std_cmd.args(&["-c", &command_str]);

    let mut cmd = Command::from(std_cmd);
    cmd.current_dir("..")
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(e.to_string()),
    };

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_clone1 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone1.emit("server-log", LogPayload { line });
        }
    });

    let app_clone2 = app_handle.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone2.emit("server-log", LogPayload { line });
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_local_ip,
            check_files,
            get_stats,
            kill_port,
            start_server,
            stop_server,
            npm_install,
            run_terminal_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
