mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::detect_installation,
            commands::download_repo_zip,
            commands::backup_and_extract_repo_zip,
            commands::verify_local_manifest,
            commands::open_folder,
            commands::kill_processes,
            commands::launch_app,
            commands::restore_backup,
            commands::clear_cache,
            commands::select_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
