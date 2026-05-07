#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]
use std::io::Cursor;
use home::home_dir;
use zip_extract;

#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::path::{Path, PathBuf};
#[cfg(any(target_os = "windows", target_os = "macos"))]
use directories::BaseDirs;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::process::Command;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::fs;

#[cfg(target_os = "windows")]
use std::ptr;
#[cfg(target_os = "windows")]
use {
  winapi::um::tlhelp32::{CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32},
  winapi::um::processthreadsapi::{OpenProcess, TerminateProcess},
  winapi::um::winnt::{PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
  winapi::um::handleapi::CloseHandle,
  winapi::shared::minwindef::DWORD,
};


#[cfg(target_os = "windows")]
fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      download_template,
      kill_standalone_backend,
      download_latest_backend,
      start_backend,
      install_backend,
      get_string_startup_dir,
      get_backend_asset_pattern,
      check_backend_installed
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      download_template,
      kill_standalone_backend,
      download_latest_backend,
      start_backend,
      install_backend,
      get_string_startup_dir,
      get_backend_asset_pattern,
      check_backend_installed
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![download_template])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
async fn download_template(template_name: String) -> bool {

  let mut home = home_dir().expect("");
  if home.join("homebrew/themes").exists() {
    home = home.join("homebrew/themes")
  }

  let url: String = "https://api.deckthemes.com/themes/template/css?themename=".to_owned() + &template_name;
  let client: reqwest::Client = reqwest::Client::new();
  let res: reqwest::Response = client.get(url).send().await.expect("");
  let bytes = res.bytes().await.expect("");

  let vec: Vec<u8> = bytes.to_vec();

  let extract = zip_extract::extract(Cursor::new(vec), &home, false);
  return !extract.is_err()
}

// =============================================================================
// Cross-platform helpers shared by Windows + macOS
// =============================================================================

/// The substring the Desktop UI matches against GitHub release asset names so
/// it knows which artifact to pull. Returned as a Tauri command so the JS side
/// doesn't have to duplicate platform/arch detection.
#[cfg(any(target_os = "windows", target_os = "macos"))]
#[tauri::command]
async fn get_backend_asset_pattern() -> String {
  #[cfg(target_os = "windows")]
  { return String::from("Standalone-Headless.exe"); }

  #[cfg(target_os = "macos")]
  {
    #[cfg(target_arch = "aarch64")]
    { return String::from("Standalone-Headless-macOS-arm64.zip"); }
    #[cfg(target_arch = "x86_64")]
    { return String::from("Standalone-Headless-macOS-x86_64.zip"); }
    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    { return String::from("Standalone-Headless-macOS"); }
  }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
#[tauri::command]
async fn check_backend_installed() -> bool {
  match get_backend_path().await {
    Some(p) => p.exists(),
    None => false,
  }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
#[tauri::command]
async fn install_backend(backend_url: String) -> String {
  kill_standalone_backend().await;
  println!("Backend Killed");
  let download_result = download_latest_backend(backend_url).await;
  if download_result.contains("ERROR") {
    return download_result;
  }
  println!("Backend Downloaded");
  let start_result = start_backend().await;
  if start_result.contains("ERROR") {
    return start_result;
  }
  println!("Backend Started");
  String::from("SUCCESS")
}

// =============================================================================
// Windows-specific implementations
// =============================================================================

#[cfg(target_os = "windows")]
async fn get_startup_dir() -> Option<PathBuf> {
  if let Some(base_dirs) = BaseDirs::new() {
    let config = base_dirs.config_dir();
    let startup_dir: std::path::PathBuf = Path::new(&config).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
    return Some(startup_dir);
  }
  return None;
}

#[cfg(target_os = "windows")]
async fn get_backend_path() -> Option<PathBuf> {
  let startup_dir = get_startup_dir().await;
  if startup_dir.is_none() {
    return None;
  }
  let backend_file_name = startup_dir.unwrap().join("CssLoader-Standalone-Headless.exe");
  return Some(backend_file_name);
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn get_string_startup_dir() -> String {
  let startup_dir = get_startup_dir().await;
  if startup_dir.is_none() {
    return "ERROR:".to_owned();
  }
  return startup_dir.unwrap().to_string_lossy().to_string();
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_backend() -> String {
  let backend_file_name = get_backend_path().await;
  if !backend_file_name.is_some() {
    return String::from("ERROR: Cannot Find Backend");
  }
  let file = backend_file_name.unwrap();
  println!("Starting New {}", &file.to_string_lossy());
  Command::new(&file).spawn().expect("Failed to start the process");
  println!("Started");
  return String::from("SUCCESS");
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn download_latest_backend(backend_url: String) -> String {
  let backend_file_name = get_backend_path().await;
  if !backend_file_name.is_some() {
    return String::from("ERROR: Cannot Find Backend");
  }
  let process_id: Option<Vec<u32>> = find_standalone_pids().await;
  if process_id.is_some() {
    kill_standalone_backend().await;
  }

  let client: reqwest::Client = reqwest::Client::new();
  let res: reqwest::Response = client.get(backend_url).send().await.expect("");
  let bytes = res.bytes().await.expect("");
  let vec: Vec<u8> = bytes.to_vec();

  println!("Writing File");
  let _ = fs::write(backend_file_name.unwrap(), vec);
  println!("File written");

  return String::from("SUCCESS");
}

#[cfg(target_os = "windows")]
async fn find_standalone_pids() -> Option<Vec<u32>> {

  let process_name: &str = "CssLoader-Standalone-Headless.exe";

  unsafe {
      let snapshot_handle = CreateToolhelp32Snapshot(winapi::um::tlhelp32::TH32CS_SNAPPROCESS, 0);

      if snapshot_handle == ptr::null_mut() {
          println!("Failed to create snapshot. Error code: {}", winapi::um::errhandlingapi::GetLastError());
          return None;
      }

      let mut process_entry: PROCESSENTRY32 = std::mem::zeroed();
      process_entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as DWORD;

      if Process32First(snapshot_handle, &mut process_entry) != 0 {
          let mut entries: Vec<u32> = Vec::new();
          loop {
              let exe_name = std::ffi::CStr::from_ptr(process_entry.szExeFile.as_ptr() as *const i8).to_string_lossy();

              if exe_name == process_name {
                  let process_id = process_entry.th32ProcessID;

                  let process_handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, process_id);

                  if process_handle != ptr::null_mut() {
                      println!("Found process {} with PID: {}", process_name, process_id);
                      CloseHandle(process_handle);
                      entries.push(process_id);
                  } else {
                      println!("Failed to open process. Error code: {}", winapi::um::errhandlingapi::GetLastError());
                  }
              }

              if Process32Next(snapshot_handle, &mut process_entry) == 0 {
                  break;
              }
          }
          if entries.len() == 0 {
            return None;
          }
          return Some(entries);
      }

      CloseHandle(snapshot_handle);
      return None;
  }
}


#[cfg(target_os = "windows")]
#[tauri::command]
async fn kill_standalone_backend() -> String {
  let process_ids: Option<Vec<u32>> = find_standalone_pids().await;

  if !process_ids.is_some() {
    return String::from("ERROR: No Process Id")
  }

  let entries: Vec<u32> = process_ids.unwrap();
  if entries.len() == 0 {
    return String::from("ERROR: Process IDs Length 0");
  }

  for id in entries.iter() {

    let res: String = kill_pid(id.to_owned()).await;

    if res.contains("ERROR") {
      return format!("ERROR: Error killing process, {}", res);
     }
  }
  return String::from("SUCCESS:");
}

#[cfg(target_os = "windows")]
async fn kill_pid(process_id: u32) -> String {
  unsafe {
    let process_handle = winapi::um::processthreadsapi::OpenProcess(
        winapi::um::winnt::PROCESS_TERMINATE,
        0,
        process_id,
    );

    if process_handle.is_null() {
        println!("Failed to open process. Error code: {}", winapi::um::errhandlingapi::GetLastError());
        return format!("ERROR: Failed to open process. Error Code {}", winapi::um::errhandlingapi::GetLastError());
    }

    let result = TerminateProcess(process_handle, 1);

    if result == 0 {
        println!("Failed to terminate process. Error code: {}", winapi::um::errhandlingapi::GetLastError());
    } else {
        println!("Process terminated successfully.");
    }

    CloseHandle(process_handle);

    return String::from("SUCCESS:");
  }
}

// =============================================================================
// macOS-specific implementations
// =============================================================================

/// Where we drop the standalone backend on macOS.
///
/// We deliberately use ``~/Library/Application Support/CssLoader`` rather than
/// ``/Applications`` so we never need ``sudo``. The Desktop UI calls
/// ``install_backend`` which downloads the zipped ``.app``, expands it here,
/// writes a LaunchAgent plist for autostart on next login, and launches the
/// backend now via ``open``.
#[cfg(target_os = "macos")]
fn macos_backend_dir() -> Option<PathBuf> {
  BaseDirs::new().map(|b| b.data_dir().join("CssLoader"))
}

#[cfg(target_os = "macos")]
fn macos_backend_app() -> Option<PathBuf> {
  macos_backend_dir().map(|d| d.join("CssLoader-Standalone-Headless.app"))
}

#[cfg(target_os = "macos")]
fn macos_backend_executable() -> Option<PathBuf> {
  macos_backend_app().map(|app| {
    app.join("Contents")
      .join("MacOS")
      .join("CssLoader-Standalone-Headless")
  })
}

#[cfg(target_os = "macos")]
async fn get_backend_path() -> Option<PathBuf> {
  // Used by ``check_backend_installed`` and ``download_latest_backend``.
  macos_backend_app()
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn get_string_startup_dir() -> String {
  match macos_backend_dir() {
    Some(dir) => dir.to_string_lossy().to_string(),
    None => "ERROR:".to_owned(),
  }
}

#[cfg(target_os = "macos")]
fn launch_agent_path() -> Option<PathBuf> {
  home_dir().map(|h| {
    h.join("Library")
      .join("LaunchAgents")
      .join("com.deckthemes.cssloader.backend.plist")
  })
}

#[cfg(target_os = "macos")]
fn write_launch_agent(executable: &Path) -> Result<(), String> {
  let plist_path = launch_agent_path().ok_or_else(|| "no home dir".to_string())?;

  if let Some(parent) = plist_path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("create LaunchAgents dir: {e}"))?;
  }

  let exec_str = executable.to_string_lossy();
  let contents = format!(
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.deckthemes.cssloader.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exec_str}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
"#
  );

  fs::write(&plist_path, contents).map_err(|e| format!("write plist: {e}"))?;

  // Try to (re)load the agent so it starts immediately and on next login. If
  // the agent already exists, ``bootstrap`` errors with "service already
  // loaded" \u2014 ignore that case.
  let uid = unsafe { libc::getuid() };
  let _ = Command::new("launchctl")
    .args(["bootout", &format!("gui/{uid}/com.deckthemes.cssloader.backend")])
    .status();
  let _ = Command::new("launchctl")
    .args(["bootstrap", &format!("gui/{uid}"), &plist_path.to_string_lossy()])
    .status();

  Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_backend() -> String {
  let app = match macos_backend_app() {
    Some(p) => p,
    None => return String::from("ERROR: Cannot resolve backend dir"),
  };
  if !app.exists() {
    return String::from("ERROR: Cannot Find Backend");
  }

  // ``open`` is the right way to launch a .app bundle on macOS \u2014 it
  // hands off to LaunchServices so the menu-bar / NSStatusItem code path
  // works. ``-g`` keeps the dock icon-less and the app in the background.
  match Command::new("open").args(["-g", &app.to_string_lossy()]).spawn() {
    Ok(_) => String::from("SUCCESS"),
    Err(e) => format!("ERROR: failed to launch backend: {e}"),
  }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn download_latest_backend(backend_url: String) -> String {
  let dir = match macos_backend_dir() {
    Some(d) => d,
    None => return String::from("ERROR: Cannot resolve backend dir"),
  };

  if let Err(e) = fs::create_dir_all(&dir) {
    return format!("ERROR: create_dir_all {}: {e}", dir.display());
  }

  // Always kill before swapping the bundle.
  kill_standalone_backend().await;

  println!("Downloading {backend_url}");
  let client = reqwest::Client::new();
  let res = match client.get(&backend_url).send().await {
    Ok(r) => r,
    Err(e) => return format!("ERROR: download: {e}"),
  };
  let bytes = match res.bytes().await {
    Ok(b) => b,
    Err(e) => return format!("ERROR: download body: {e}"),
  };

  // Write zip to a scratch path, expand with ditto so .app metadata survives.
  let zip_path = dir.join("CssLoader-Standalone-Headless.zip");
  if let Err(e) = fs::write(&zip_path, &bytes) {
    return format!("ERROR: writing zip: {e}");
  }

  let app = match macos_backend_app() {
    Some(p) => p,
    None => return String::from("ERROR: Cannot resolve backend app path"),
  };
  if app.exists() {
    if let Err(e) = fs::remove_dir_all(&app) {
      return format!("ERROR: removing old bundle: {e}");
    }
  }

  let status = Command::new("ditto")
    .args(["-x", "-k", &zip_path.to_string_lossy(), &dir.to_string_lossy()])
    .status();
  let _ = fs::remove_file(&zip_path);

  match status {
    Ok(s) if s.success() => {}
    Ok(s) => return format!("ERROR: ditto exited with {s}"),
    Err(e) => return format!("ERROR: ditto: {e}"),
  }

  if !app.exists() {
    return String::from("ERROR: archive did not contain the .app bundle");
  }

  // Strip the quarantine attribute Gatekeeper attaches to downloaded bundles
  // so the user doesn't need to right-click "Open" through System Settings.
  let _ = Command::new("xattr").args(["-dr", "com.apple.quarantine", &app.to_string_lossy()]).status();

  if let Some(exec) = macos_backend_executable() {
    if let Err(e) = write_launch_agent(&exec) {
      println!("Warning: could not register LaunchAgent: {e}");
    }
  }

  String::from("SUCCESS")
}

#[cfg(target_os = "macos")]
async fn find_standalone_pids() -> Option<Vec<u32>> {
  // Use ``pgrep`` to keep the dependency footprint minimal. Match against the
  // executable name PyInstaller produced inside the .app bundle.
  let output = Command::new("pgrep")
    .args(["-x", "CssLoader-Standalone-Headless"])
    .output()
    .ok()?;
  if !output.status.success() {
    return None;
  }
  let pids: Vec<u32> = String::from_utf8_lossy(&output.stdout)
    .lines()
    .filter_map(|l| l.trim().parse::<u32>().ok())
    .collect();
  if pids.is_empty() {
    None
  } else {
    Some(pids)
  }
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn kill_standalone_backend() -> String {
  let pids = match find_standalone_pids().await {
    Some(pids) => pids,
    None => return String::from("ERROR: No Process Id"),
  };

  for pid in &pids {
    unsafe {
      // SIGTERM = 15. The backend's tray + asyncio loop both quit cleanly
      // on SIGTERM via Python's signal handlers.
      libc::kill(*pid as libc::pid_t, libc::SIGTERM);
    }
  }

  // Wait for the processes to actually exit before returning. Otherwise a
  // caller that immediately follows up with ``start_backend`` may detect
  // the dying backend as still alive (because its HTTP server is still
  // responding to ``dummyFunction`` during graceful shutdown) and skip
  // launching a fresh copy, leaving the user with no backend running.
  // Poll up to ~3s, then fall back to SIGKILL on anything still around.
  let deadline = std::time::Instant::now() + std::time::Duration::from_millis(3000);
  loop {
    let alive: Vec<u32> = pids
      .iter()
      .copied()
      .filter(|pid| unsafe { libc::kill(*pid as libc::pid_t, 0) == 0 })
      .collect();
    if alive.is_empty() {
      return String::from("SUCCESS:");
    }
    if std::time::Instant::now() >= deadline {
      for pid in &alive {
        unsafe {
          libc::kill(*pid as libc::pid_t, libc::SIGKILL);
        }
      }
      // Give SIGKILL a moment to take effect, then return.
      std::thread::sleep(std::time::Duration::from_millis(200));
      return String::from("SUCCESS:");
    }
    std::thread::sleep(std::time::Duration::from_millis(100));
  }
}
