use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::io;
use std::process::Command;
use std::time::Instant;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstallationInfo {
    pub exists: bool,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct DownloadProgressPayload {
    pub file_type: String,
    pub progress: f64,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed: f64,
    pub eta: u64,
}

fn get_installation_path() -> Result<PathBuf, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "Could not find LOCALAPPDATA environment variable".to_string())?;
    Ok(PathBuf::from(local_app_data).join("Orbix Suite"))
}

#[tauri::command]
pub fn detect_installation(custom_path: Option<String>) -> Result<InstallationInfo, String> {
    let path = match custom_path {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => get_installation_path()?,
    };
    Ok(InstallationInfo {
        exists: path.exists(),
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn download_repo_zip(app_handle: AppHandle, base_dir: String) -> Result<String, String> {
    let base_path = PathBuf::from(&base_dir);
    let temp_dir = base_path.join("temp");
    
    if !base_path.exists() {
        return Err("Target installation path does not exist".to_string());
    }

    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temporary directory: {}", e))?;

    let dest_path = temp_dir.join("repo.zip");
    let url = "https://github.com/Zenda-Cross/vega-providers/archive/refs/heads/main.zip";

    let client = reqwest::Client::builder()
        .user_agent("OrbixPlayUpdater")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client.get(url)
        .send()
        .await
        .map_err(|e| format!("Network failure: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: server returned {}", response.status()));
    }

    // GitHub zip archives might not provide content-length. If missing, we assume 10MB for ETA calculations.
    let total_size = response.content_length().unwrap_or(10_000_000);

    let mut file = fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create destination file: {}", e))?;
    
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while downloading: {}", e))?;
        io::Write::write_all(&mut file, &chunk).map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let elapsed = start_time.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 {
            downloaded as f64 / elapsed
        } else {
            0.0
        };

        let eta = if speed > 0.0 && total_size > downloaded {
            ((total_size - downloaded) as f64 / speed) as u64
        } else {
            0
        };

        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };

        if last_emit.elapsed().as_millis() > 50 || downloaded >= total_size {
            let payload = DownloadProgressPayload {
                file_type: "GitHub Repository".to_string(),
                progress: progress.min(100.0),
                bytes_downloaded: downloaded,
                total_bytes: total_size,
                speed,
                eta,
            };
            let _ = app_handle.emit("download-progress", payload);
            last_emit = Instant::now();
        }
    }

    Ok(dest_path.to_string_lossy().to_string())
}

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn rollback(base_dir: &Path) -> Result<(), String> {
    let backup_dir = base_dir.join("backup");
    let dist_backup = backup_dir.join("dist");
    let providers_backup = backup_dir.join("providers");
    
    let dist_target = base_dir.join("dist");
    let providers_target = base_dir.join("providers");
    
    if dist_backup.exists() {
        let _ = fs::remove_dir_all(&dist_target);
        copy_dir_all(&dist_backup, &dist_target)
            .map_err(|e| format!("Rollback failed restoring dist folder: {}", e))?;
    }
    
    if providers_backup.exists() {
        let _ = fs::remove_dir_all(&providers_target);
        copy_dir_all(&providers_backup, &providers_target)
            .map_err(|e| format!("Rollback failed restoring providers folder: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn backup_and_extract_repo_zip(
    base_dir: String,
    zip_path: String,
    keep_newer_hubcloud: bool,
    update_dist: bool,
    update_providers: bool,
) -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    let base_path = PathBuf::from(&base_dir);
    let backup_dir = base_path.join("backup");
    let temp_dir = base_path.join("temp");

    let dist_target = base_path.join("dist");
    let providers_target = base_path.join("providers");

    // 1. Create backups
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let dist_backup = backup_dir.join("dist");
    let providers_backup = backup_dir.join("providers");

    if dist_backup.exists() {
        let _ = fs::remove_dir_all(&dist_backup);
    }
    if providers_backup.exists() {
        let _ = fs::remove_dir_all(&providers_backup);
    }

    if update_dist && dist_target.exists() {
        copy_dir_all(&dist_target, &dist_backup)
            .map_err(|e| format!("Failed to back up dist folder: {}", e))?;
    }
    if update_providers && providers_target.exists() {
        copy_dir_all(&providers_target, &providers_backup)
            .map_err(|e| format!("Failed to back up providers folder: {}", e))?;
    }

    // 2. Clear targets
    if update_dist && dist_target.exists() {
        let _ = fs::remove_dir_all(&dist_target);
    }
    if update_providers && providers_target.exists() {
        let _ = fs::remove_dir_all(&providers_target);
    }

    // 3. Extract only dist and providers from repo zip
    let file = fs::File::open(&zip_path).map_err(|e| format!("Failed to open downloaded zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };
        
        let name = file.name().to_string();
        
        // Github zips usually have a root folder like vega-providers-main/
        // We look for anything that contains /dist/ or /providers/ at the first sublevel
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() < 2 {
            continue;
        }

        let folder_name = parts[1];
        if folder_name != "dist" && folder_name != "providers" && folder_name != "manifest.json" {
            continue;
        }

        if folder_name == "dist" && !update_dist {
            continue;
        }
        if folder_name == "providers" && !update_providers {
            continue;
        }

        // Relative path inside the target directory (e.g. dist/... or manifest.json)
        let relative_path = parts[1..].join("/");
        
        if !keep_newer_hubcloud && relative_path == "providers/extractors/hubcloud.ts" {
            logs.push("Skipped updating providers/extractors/hubcloud.ts from GitHub.".to_string());
            continue;
        }

        let outpath = base_path.join(relative_path);

        if file.is_dir() {
            let _ = fs::create_dir_all(&outpath);
        } else {
            if let Some(p) = outpath.parent() {
                let _ = fs::create_dir_all(p);
            }
            let mut outfile = match fs::File::create(&outpath) {
                Ok(f) => f,
                Err(e) => {
                    let _ = rollback(&base_path);
                    return Err(format!("Failed to extract file: {}", e));
                }
            };
            if let Err(e) = io::copy(&mut file, &mut outfile) {
                let _ = rollback(&base_path);
                return Err(format!("Failed to write extracted file: {}", e));
            }
        }
    }

    // 4. Restore hubcloud.ts from backup if it existed
    if !keep_newer_hubcloud && update_providers {
        let hubcloud_backup = providers_backup.join("extractors").join("hubcloud.ts");
        if hubcloud_backup.exists() {
            let hubcloud_target = providers_target.join("extractors").join("hubcloud.ts");
            if let Some(p) = hubcloud_target.parent() {
                let _ = fs::create_dir_all(p);
            }
            match fs::copy(&hubcloud_backup, &hubcloud_target) {
                Ok(_) => {
                    logs.push("Restored local hubcloud.ts from backup successfully.".to_string());
                }
                Err(e) => {
                    logs.push(format!("Failed to restore local hubcloud.ts: {}", e));
                }
            }
        }
    }

    // 5. Clean up temp folder
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }

    Ok(logs)
}

#[tauri::command]
pub fn open_folder(base_dir: String, folder_type: String) -> Result<(), String> {
    let base_path = PathBuf::from(base_dir);
    let path = match folder_type.as_str() {
        "install" => base_path,
        "backup" => base_path.join("backup"),
        _ => return Err("Invalid folder type".to_string()),
    };

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.to_string_lossy()));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }

    Ok(())
}

use sysinfo::{System, ProcessRefreshKind, RefreshKind};

#[tauri::command]
pub fn kill_processes() -> Result<Vec<String>, String> {
    let s = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    let mut killed = Vec::new();
    let targets = ["node.exe", "orbixlite-v3.exe", "OrbixPlay-Vega-Server.exe", "OrbixPlay.exe"];

    for process in s.processes().values() {
        let name = process.name();
        if targets.contains(&name) {
            if process.kill() {
                killed.push(name.to_string());
            }
        }
    }

    // On Windows we can also be more aggressive with taskkill if needed
    #[cfg(target_os = "windows")]
    {
        for target in targets {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", target])
                .output();
        }
    }

    Ok(killed)
}

#[tauri::command]
pub fn launch_app(base_dir: String, app_type: String) -> Result<(), String> {
    let base_path = PathBuf::from(base_dir);
    let bin_dir = base_path.join("bin");

    let exe_path = match app_type.as_str() {
        "orbix" => bin_dir.join("orbixlite-v3.exe"),
        "server" => bin_dir.join("OrbixPlay-Vega-Server.exe"),
        _ => return Err("Invalid app type".to_string()),
    };

    if !exe_path.exists() {
        // Fallback to checking root directory if not in bin/
        let root_fallback = base_path.join(exe_path.file_name().unwrap());
        if root_fallback.exists() {
            Command::new(&root_fallback)
                .current_dir(&base_path)
                .spawn()
                .map_err(|e| format!("Failed to launch process: {}", e))?;
            return Ok(());
        }
        return Err(format!("Executable not found: {}", exe_path.to_string_lossy()));
    }

    Command::new(&exe_path)
        .current_dir(&bin_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch process: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn restore_backup(base_dir: String) -> Result<(), String> {
    let base_path = PathBuf::from(base_dir);
    rollback(&base_path)
}

#[tauri::command]
pub fn clear_cache(base_dir: String) -> Result<(), String> {
    let base_path = PathBuf::from(base_dir);
    let temp_dir = base_path.join("temp");
    
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| format!("Failed to clear cache: {}", e))?;
    }
    
    Ok(())
}

#[derive(Serialize, Clone, Debug)]
pub struct LocalManifestInfo {
    pub version: String,
    pub providers_count: usize,
}

#[tauri::command]
pub fn verify_local_manifest(base_dir: String) -> Result<LocalManifestInfo, String> {
    let base_path = PathBuf::from(base_dir);
    let manifest_path = base_path.join("manifest.json");

    if !manifest_path.exists() {
        return Err("Local manifest.json not found after update.".to_string());
    }

    let file_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read local manifest: {}", e))?;

    let parsed: Vec<serde_json::Value> = serde_json::from_str(&file_content)
        .map_err(|e| format!("Failed to parse local manifest: {}", e))?;

    if parsed.is_empty() {
        return Err("Local manifest is empty.".to_string());
    }

    let mut max_version_num = 0.0_f64;
    let mut max_version_str = "0.0".to_string();

    for provider in &parsed {
        if let Some(version_str) = provider.get("version").and_then(|v| v.as_str()) {
            if let Ok(v) = version_str.parse::<f64>() {
                if v > max_version_num {
                    max_version_num = v;
                    max_version_str = version_str.to_string();
                }
            }
        }
    }

    Ok(LocalManifestInfo {
        version: max_version_str,
        providers_count: parsed.len(),
    })
}

#[tauri::command]
pub async fn select_directory(app_handle: AppHandle) -> Result<Option<String>, String> {
    let folder_path = app_handle.dialog()
        .file()
        .blocking_pick_folder();

    Ok(folder_path.and_then(|fp| {
        fp.into_path().ok().map(|path| path.to_string_lossy().to_string())
    }))
}
