use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

// ── Sidecar helpers ───────────────────────────────────────────────────────────

/// Resolve the path to the Python worker sidecar.
/// In dev, it's the script in sidecar/; in production it's the PyInstaller binary.
fn worker_command() -> Command {
    // In dev mode Tauri sets TAURI_ENV to "development".
    // In release the bundled binary is resolved via app.path().
    // For simplicity we use the shell plugin in the commands below;
    // here we keep a direct std::process::Command for the sync path.
    //
    // Resolution order:
    //  1. TAURI_PDF_WORKER env var (override for dev)
    //  2. Sibling binary "pdf_worker" (production sidecar)
    if let Ok(path) = std::env::var("TAURI_PDF_WORKER") {
        return Command::new(path);
    }
    // In development fallback: run python3 with the script path relative to manifest dir
    let mut cmd = Command::new("python3");
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("sidecar")
        .join("pdf_worker.py");
    cmd.arg(script);
    cmd
}

/// Send a JSON request to the worker, stream progress events via Tauri emit,
/// and return the final JSON response.
fn call_worker(
    app: &AppHandle,
    request: Value,
    progress_tab: &str,
) -> Result<Value, String> {
    let mut child = worker_command()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start PDF worker: {e}"))?;

    // Write request
    let stdin = child.stdin.as_mut().unwrap();
    let payload = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    stdin.write_all(&payload).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    drop(child.stdin.take());

    // Read response lines — progress lines come first, then the final result
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut final_response: Option<Value> = None;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parsed: Value = serde_json::from_str(line)
            .map_err(|e| format!("Worker parse error: {e} — line: {line}"))?;

        if parsed.get("progress").and_then(Value::as_bool).unwrap_or(false) {
            let current = parsed["current"].as_u64().unwrap_or(0);
            let total = parsed["total"].as_u64().unwrap_or(1);
            let label = parsed["label"].as_str().unwrap_or("").to_string();
            let _ = app.emit(
                "progress",
                json!({"tab": progress_tab, "current": current, "total": total, "label": label}),
            );
        } else {
            final_response = Some(parsed);
        }
    }

    final_response.ok_or_else(|| "Worker produced no response".to_string())
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TextResult {
    text: String,
    page_count: u64,
    char_count: u64,
}

#[derive(Serialize)]
pub struct ImageResult {
    files_written: u64,
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn extract_text(app: AppHandle, path: String) -> Result<TextResult, String> {
    let req = json!({"op": "extract_text", "path": path});
    let resp = call_worker(&app, req, "text")?;

    if resp["ok"].as_bool() != Some(true) {
        return Err(resp["error"].as_str().unwrap_or("Unknown error").to_string());
    }

    Ok(TextResult {
        text: resp["text"].as_str().unwrap_or("").to_string(),
        page_count: resp["page_count"].as_u64().unwrap_or(0),
        char_count: resp["char_count"].as_u64().unwrap_or(0),
    })
}

#[tauri::command]
async fn convert_to_images(
    app: AppHandle,
    path: String,
    output_dir: String,
    dpi: u32,
    format: String,
    quality: u32,
    prefix: String,
) -> Result<ImageResult, String> {
    let req = json!({
        "op": "convert_images",
        "path": path,
        "output_dir": output_dir,
        "dpi": dpi,
        "format": format,
        "quality": quality,
        "prefix": prefix,
    });
    let resp = call_worker(&app, req, "image")?;

    if resp["ok"].as_bool() != Some(true) {
        return Err(resp["error"].as_str().unwrap_or("Unknown error").to_string());
    }

    Ok(ImageResult {
        files_written: resp["files_written"].as_u64().unwrap_or(0),
    })
}

// ── Entry point ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![extract_text, convert_to_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
